/**
 * VANTA AI — Central Tenant & Facility-Level Authorization Policy
 * Guarantees no authenticated operator or AI tool can read or mutate unauthorized facilities.
 */

import { canPerformAction, type PermissionAction } from '../core/intelligence.ts';
import type { UserSession } from '../core/types.ts';

export interface FacilityScopeResolution {
  allowed: boolean;
  effectiveFacilityIds: string[];
  reason?: string;
}

/**
 * Resolves facility scope strictly against UserSession.facilityIds.
 * A client-supplied facilityId NEVER grants access to an unlisted facility.
 * When no facilityId (or 'ALL') is passed, scope defaults exclusively to session.facilityIds.
 */
export function authorizeFacilityScope(
  session: UserSession,
  requestedFacilityId?: string | null
): FacilityScopeResolution {
  const authorized = Array.isArray(session.facilityIds) ? session.facilityIds.filter(Boolean) : [];
  if (authorized.length === 0) {
    return {
      allowed: false,
      effectiveFacilityIds: [],
      reason: 'Operator session holds zero authorized facility scopes.',
    };
  }

  if (requestedFacilityId && requestedFacilityId !== 'ALL') {
    if (!authorized.includes(requestedFacilityId)) {
      return {
        allowed: false,
        effectiveFacilityIds: [],
        reason: `Cross-facility access denied: user '${session.email}' is not authorized for facility '${requestedFacilityId}'.`,
      };
    }
    return {
      allowed: true,
      effectiveFacilityIds: [requestedFacilityId],
    };
  }

  return {
    allowed: true,
    effectiveFacilityIds: [...authorized],
  };
}

export function isFacilityAuthorized(session: UserSession, facilityId: string | null | undefined): boolean {
  if (!facilityId) return false;
  return Array.isArray(session.facilityIds) && session.facilityIds.includes(facilityId);
}

/**
 * Checks whether a knowledge document with optional facilityId is accessible to the session.
 * Tenant-wide docs (facilityId === null) are accessible to authorized roles within the tenant;
 * facility-scoped docs require explicit facility authorization.
 */
export function isKnowledgeDocAuthorized(
  session: UserSession,
  docFacilityId: string | null | undefined,
  requestedFacilityIds: string[]
): boolean {
  if (!docFacilityId) return true;
  if (!session.facilityIds.includes(docFacilityId)) return false;
  return requestedFacilityIds.includes(docFacilityId);
}

export function authorizeResourceAction(
  session: UserSession,
  action: PermissionAction,
  facilityId?: string | null
): { allowed: boolean; status: number; reason?: string } {
  if (!canPerformAction(session.role, action)) {
    return {
      allowed: false,
      status: 403,
      reason: `Access denied. Role '${session.role}' is not authorized for '${action}'.`,
    };
  }
  if (facilityId !== undefined && facilityId !== null && !isFacilityAuthorized(session, facilityId)) {
    return {
      allowed: false,
      status: 403,
      reason: `Facility access denied. Operator is not assigned to facility '${facilityId}'.`,
    };
  }
  return { allowed: true, status: 200 };
}

/**
 * Generates parameterized SQL IN clause safely.
 * Returns `{ clause: '1 = 0', params: [] }` if facilityIds is empty so queries fail closed.
 */
export function buildFacilityInClause(
  columnSql: string,
  facilityIds: string[],
  includeNull = false
): { clause: string; params: string[] } {
  if (facilityIds.length === 0) {
    return { clause: includeNull ? `${columnSql} IS NULL` : '1 = 0', params: [] };
  }
  const placeholders = facilityIds.map(() => '?').join(', ');
  const inExpr = `${columnSql} IN (${placeholders})`;
  return {
    clause: includeNull ? `(${columnSql} IS NULL OR ${inExpr})` : inExpr,
    params: [...facilityIds],
  };
}
