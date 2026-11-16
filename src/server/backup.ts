/**
 * VANTA AI — SQLite Backup, Integrity Verification & Reproducible Restoration
 * Uses SQLite VACUUM INTO for hot, transactionally consistent single-file snapshots without WAL orphans.
 */

import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { DatabaseSync } from 'node:sqlite';

export interface BackupMetadata {
  filename: string;
  filePath: string;
  sizeBytes: number;
  sha256: string;
  integrityCheck: string;
  createdAt: string;
  backupType?: string;
  schemaVersion?: string | null;
}

function safeResolveBackupDir(baseDir?: string): string {
  return baseDir || path.resolve(process.cwd(), '.vanta-data', 'backups');
}

function sha256File(filePath: string): string {
  const buf = fs.readFileSync(filePath);
  return crypto.createHash('sha256').update(buf).digest('hex');
}

export function createDatabaseBackup(
  db: DatabaseSync,
  backupDir?: string,
  label = 'manual'
): BackupMetadata {
  const dir = safeResolveBackupDir(backupDir);
  fs.mkdirSync(dir, { recursive: true });

  const safeLabel = label.replace(/[^a-zA-Z0-9_-]/g, '').slice(0, 32) || 'manual';
  const stamp = new Date().toISOString().replace(/[:.]/g, '-');
  const filename = `vanta-backup-${stamp}-${safeLabel}.db`;
  const targetPath = path.join(dir, filename);

  // Checkpoint WAL first and produce a clean, self-contained SQLite file
  db.exec('PRAGMA wal_checkpoint(PASSIVE);');
  const escapedPath = targetPath.replace(/'/g, "''");
  db.exec(`VACUUM INTO '${escapedPath}';`);

  // Verify snapshot integrity immediately using an independent handle
  const verifyDb = new DatabaseSync(targetPath, { readOnly: true });
  let integrityCheck = 'unknown';
  let schemaVersion: string | null = null;
  try {
    const row = verifyDb.prepare('PRAGMA integrity_check;').get() as { integrity_check: string } | undefined;
    integrityCheck = row?.integrity_check || 'unknown';
    try {
      const migRow = verifyDb
        .prepare('SELECT version FROM schema_migrations ORDER BY version DESC LIMIT 1')
        .get() as { version: string } | undefined;
      schemaVersion = migRow?.version || null;
    } catch {
      schemaVersion = null;
    }
  } finally {
    verifyDb.close();
  }

  if (integrityCheck !== 'ok') {
    fs.rmSync(targetPath, { force: true });
    throw new Error(`Backup integrity check failed: ${integrityCheck}`);
  }

  const stat = fs.statSync(targetPath);
  const sha256 = sha256File(targetPath);
  const meta: BackupMetadata = {
    filename,
    filePath: targetPath,
    sizeBytes: stat.size,
    sha256,
    integrityCheck,
    createdAt: new Date().toISOString(),
    backupType: 'VACUUM_INTO',
    schemaVersion,
  };

  fs.writeFileSync(`${targetPath}.sha256.json`, JSON.stringify(meta, null, 2), 'utf8');
  return meta;
}

export function listDatabaseBackups(backupDir?: string): BackupMetadata[] {
  const dir = safeResolveBackupDir(backupDir);
  if (!fs.existsSync(dir)) return [];

  const files = fs.readdirSync(dir).filter((f) => f.endsWith('.db'));
  const results: BackupMetadata[] = [];

  for (const file of files) {
    const full = path.join(dir, file);
    const metaFile = `${full}.sha256.json`;
    if (fs.existsSync(metaFile)) {
      try {
        results.push(JSON.parse(fs.readFileSync(metaFile, 'utf8')) as BackupMetadata);
        continue;
      } catch {
        // Fallback to live inspection
      }
    }
    const stat = fs.statSync(full);
    results.push({
      filename: file,
      filePath: full,
      sizeBytes: stat.size,
      sha256: sha256File(full),
      integrityCheck: 'unverified',
      createdAt: stat.mtime.toISOString(),
    });
  }

  return results.sort((a, b) => b.createdAt.localeCompare(a.createdAt));
}

export function verifyBackupFile(backupFilePath: string): {
  valid: boolean;
  integrityCheck: string;
  sha256Match: boolean;
  organizationCount: number;
} {
  if (!fs.existsSync(backupFilePath)) {
    throw new Error('Backup file does not exist.');
  }

  let sha256Match = true;
  const metaFile = `${backupFilePath}.sha256.json`;
  if (fs.existsSync(metaFile)) {
    const meta = JSON.parse(fs.readFileSync(metaFile, 'utf8')) as BackupMetadata;
    sha256Match = sha256File(backupFilePath) === meta.sha256;
  }

  const checkDb = new DatabaseSync(backupFilePath, { readOnly: true });
  try {
    const row = checkDb.prepare('PRAGMA integrity_check;').get() as { integrity_check: string } | undefined;
    const integrityCheck = row?.integrity_check || 'error';
    const orgRow = checkDb.prepare('SELECT COUNT(*) as cnt FROM organizations').get() as { cnt: number };
    return {
      valid: integrityCheck === 'ok' && sha256Match,
      integrityCheck,
      sha256Match,
      organizationCount: orgRow.cnt,
    };
  } finally {
    checkDb.close();
  }
}

/**
 * Restores a verified backup file onto a target SQLite file path cleanly (removing stale WAL/SHM).
 */
export function restoreDatabaseFromBackup(backupFilePath: string, targetDbPath: string): void {
  const verification = verifyBackupFile(backupFilePath);
  if (!verification.valid) {
    throw new Error(
      `Refusing to restore corrupt or tampered backup (integrity=${verification.integrityCheck}, sha256Match=${verification.sha256Match}).`
    );
  }
  fs.mkdirSync(path.dirname(targetDbPath), { recursive: true });
  fs.rmSync(`${targetDbPath}-wal`, { force: true });
  fs.rmSync(`${targetDbPath}-shm`, { force: true });
  fs.copyFileSync(backupFilePath, targetDbPath);
}
