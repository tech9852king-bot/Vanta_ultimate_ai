import React, { useEffect, useState } from 'react';
import { Check, X, FilePlus, RefreshCw, Database, ShieldOff } from 'lucide-react';
import { vantaApi } from '../api/client';
import { canPerformAction } from '../core/intelligence';
import type { CapabilityState, UserSession } from '../core/types';
import type { BackupMetadataDto, SystemHealthStatus, WorkspaceData } from '../types/workspace';
import { ModuleHeader, StatusText } from './StatusText';

export function OperationsWorkflowsView({
  data,
  user,
  onRefresh,
}: {
  data: WorkspaceData;
  user: UserSession;
  onRefresh: () => void;
}) {
  const [title, setTitle] = useState('');
  const [assetId, setAssetId] = useState(data.assets[0]?.id || '');
  const [priority, setPriority] = useState('HIGH');
  const [description, setDescription] = useState('');
  const [feedback, setFeedback] = useState<string | null>(null);

  const effectiveAssetId = data.assets.some((a) => a.id === assetId)
    ? assetId
    : data.assets[0]?.id || '';

  const handleCreateWorkOrder = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    const asset = data.assets.find((a) => a.id === effectiveAssetId);
    if (!asset) return;
    try {
      await vantaApi.createWorkOrder({
        facilityId: asset.facilityId,
        assetId: asset.id,
        title,
        description,
        priority,
      });
      setTitle('');
      setDescription('');
      setFeedback('Work order created and queued for mandatory human approval.');
      onRefresh();
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Failed to submit work order.');
    }
  };

  const handleDecision = async (id: string, decision: 'APPROVED' | 'REJECTED') => {
    setFeedback(null);
    try {
      await vantaApi.decideApproval(
        id,
        decision,
        `${decision} via Operations Console by ${user.fullName} (${user.role})`
      );
      setFeedback(`Approval ${id} marked ${decision}.`);
      onRefresh();
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Authorization failed.');
    }
  };

  return (
    <div className="space-y-6">
      <ModuleHeader
        title="Operations, Work Orders & Human Approvals"
        subtitle="Consequential operational recommendations and maintenance isolations require explicit RBAC and facility-authorized human approval."
        capability="FUNCTIONAL"
      />

      {feedback && (
        <div className="px-4 py-2.5 rounded-md bg-[#111827] border border-sky-800/60 text-xs text-sky-200">
          {feedback}
        </div>
      )}

      {/* Human Approval Queue */}
      <section className="space-y-3">
        <h2 className="text-base font-semibold text-slate-100">Human Authorization Queue</h2>
        <div className="space-y-3">
          {data.approvals.map((apr) => (
            <div key={apr.id} className="bg-[#111827] border border-[#1E293B] rounded-lg p-5 flex flex-col lg:flex-row lg:items-center justify-between gap-4">
              <div className="space-y-1.5">
                <div className="flex flex-wrap items-center gap-2 text-xs font-mono">
                  <StatusText value={apr.status} />
                  <span className="text-slate-400">·</span>
                  <StatusText value={apr.riskLevel} prefix="RISK" />
                  <span className="text-slate-400">·</span>
                  <span className="text-slate-400">{apr.targetType} ({apr.targetId})</span>
                </div>
                <div className="text-sm font-semibold text-white">{apr.title}</div>
                <p className="text-xs text-slate-300">{apr.justification}</p>
                <div className="text-[11px] font-mono text-emerald-400">{apr.safetyBoundaryCheck}</div>
              </div>

              <div className="flex items-center gap-2 shrink-0">
                {apr.status === 'PENDING' ? (
                  <>
                    <button
                      type="button"
                      onClick={() => handleDecision(apr.id, 'APPROVED')}
                      className="px-3.5 py-2 rounded-md bg-emerald-700 hover:bg-emerald-600 text-xs font-medium text-white flex items-center gap-1.5"
                    >
                      <Check className="w-3.5 h-3.5" />
                      Approve
                    </button>
                    <button
                      type="button"
                      onClick={() => handleDecision(apr.id, 'REJECTED')}
                      className="px-3.5 py-2 rounded-md border border-rose-800 text-rose-300 hover:bg-rose-950/60 text-xs font-medium flex items-center gap-1.5"
                    >
                      <X className="w-3.5 h-3.5" />
                      Reject
                    </button>
                  </>
                ) : (
                  <div className="text-xs font-mono text-slate-400 text-right">
                    <div>Decided by {apr.decidedBy}</div>
                    <div>{apr.decisionNotes}</div>
                  </div>
                )}
              </div>
            </div>
          ))}
        </div>
      </section>

      {/* Work Order Creation + Registry */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <form onSubmit={handleCreateWorkOrder} className="lg:col-span-5 bg-[#111827] border border-[#1E293B] rounded-lg p-5 space-y-3.5">
          <h2 className="text-sm font-semibold text-slate-100">Draft Maintenance Work Order</h2>
          <div>
            <label htmlFor="wo-asset" className="block text-xs text-slate-400 mb-1">Target Asset</label>
            <select
              id="wo-asset"
              value={effectiveAssetId}
              onChange={(e) => setAssetId(e.target.value)}
              className="w-full px-3 py-2 rounded bg-[#0B0F17] border border-[#243044] text-xs text-slate-100"
            >
              {data.assets.map((a) => (
                <option key={a.id} value={a.id}>{a.code} — {a.name}</option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="wo-title" className="block text-xs text-slate-400 mb-1">Work Order Title</label>
            <input
              id="wo-title"
              required
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              placeholder="Inspect spindle lubrication manifold"
              className="w-full px-3 py-2 rounded bg-[#0B0F17] border border-[#243044] text-xs text-slate-100"
            />
          </div>
          <div>
            <label htmlFor="wo-priority" className="block text-xs text-slate-400 mb-1">Priority</label>
            <select
              id="wo-priority"
              value={priority}
              onChange={(e) => setPriority(e.target.value)}
              className="w-full px-3 py-2 rounded bg-[#0B0F17] border border-[#243044] text-xs text-slate-100"
            >
              <option value="CRITICAL">CRITICAL</option>
              <option value="HIGH">HIGH</option>
              <option value="MEDIUM">MEDIUM</option>
              <option value="LOW">LOW</option>
            </select>
          </div>
          <div>
            <label htmlFor="wo-desc" className="block text-xs text-slate-400 mb-1">Procedure Notes</label>
            <textarea
              id="wo-desc"
              rows={2}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Verify LOTO isolation prior to mechanical inspection..."
              className="w-full px-3 py-2 rounded bg-[#0B0F17] border border-[#243044] text-xs text-slate-100"
            />
          </div>
          <button type="submit" className="w-full py-2 px-4 rounded bg-sky-600 hover:bg-sky-500 text-xs font-medium text-white">
            Submit Work Order for Approval
          </button>
        </form>

        <div className="lg:col-span-7 bg-[#111827] border border-[#1E293B] rounded-lg overflow-x-auto">
          <div className="px-5 py-3.5 border-b border-[#1E293B]">
            <h2 className="text-sm font-semibold text-slate-100">Work Orders Ledger</h2>
          </div>
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#1E293B] text-xs text-slate-400">
                <th className="py-3 px-4">ID</th>
                <th className="py-3 px-4">Title</th>
                <th className="py-3 px-4">Priority</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Approved By</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1E293B] text-xs">
              {data.workOrders.map((wo) => (
                <tr key={wo.id} className="hover:bg-[#161E2E]/60">
                  <td className="py-3 px-4 font-mono text-slate-400">{wo.id}</td>
                  <td className="py-3 px-4 font-medium text-slate-100">{wo.title}</td>
                  <td className="py-3 px-4"><StatusText value={wo.priority} /></td>
                  <td className="py-3 px-4"><StatusText value={wo.status} /></td>
                  <td className="py-3 px-4 font-mono text-slate-400">{wo.approvedBy || 'Pending'}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}

export function KnowledgeCenterView({
  data,
  onRefresh,
}: {
  data: WorkspaceData;
  onRefresh: () => void;
}) {
  const [search, setSearch] = useState('');
  const [showAdd, setShowAdd] = useState(false);
  const [facilityId, setFacilityId] = useState(data.facilities[0]?.id || '');
  const [title, setTitle] = useState('');
  const [category, setCategory] = useState('SOP');
  const [minRole, setMinRole] = useState('Viewer');
  const [sourceRef, setSourceRef] = useState('');
  const [content, setContent] = useState('');
  const [error, setError] = useState<string | null>(null);

  const filtered = data.knowledgeDocuments.filter(
    (d) =>
      d.title.toLowerCase().includes(search.toLowerCase()) ||
      d.content.toLowerCase().includes(search.toLowerCase())
  );

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    try {
      await vantaApi.createKnowledgeDoc({
        facilityId,
        title,
        category,
        minRole,
        sourceRef,
        content,
      });
      setTitle('');
      setSourceRef('');
      setContent('');
      setShowAdd(false);
      onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to store document.');
    }
  };

  return (
    <div className="space-y-6">
      <ModuleHeader
        title="Knowledge Center & Technical Specifications"
        subtitle="Permission-aware, facility-scoped, and tenant-isolated repository for equipment manuals, SOPs, safety interlock specifications, and postmortems."
        capability="FUNCTIONAL"
        actions={
          <button
            type="button"
            onClick={() => setShowAdd((s) => !s)}
            className="px-3.5 py-2 rounded-md bg-sky-600 hover:bg-sky-500 text-xs font-medium text-white flex items-center gap-1.5"
          >
            <FilePlus className="w-3.5 h-3.5" />
            Add Knowledge Record
          </button>
        }
      />

      {showAdd && (
        <form onSubmit={handleAdd} className="bg-[#111827] border border-[#1E293B] rounded-lg p-5 space-y-3">
          {error && <div className="text-xs text-rose-300">{error}</div>}
          <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
            <input required value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Document Title" className="px-3 py-2 rounded bg-[#0B0F17] border border-[#243044] text-xs text-slate-100" />
            <select aria-label="Knowledge facility scope" value={facilityId} onChange={(e) => setFacilityId(e.target.value)} className="px-3 py-2 rounded bg-[#0B0F17] border border-[#243044] text-xs text-slate-100">
              <option value="">Tenant-Wide Scope</option>
              {data.facilities.map((f) => (
                <option key={f.id} value={f.id}>{f.code} · {f.name}</option>
              ))}
            </select>
            <select aria-label="Knowledge category" value={category} onChange={(e) => setCategory(e.target.value)} className="px-3 py-2 rounded bg-[#0B0F17] border border-[#243044] text-xs text-slate-100">
              <option value="SOP">SOP</option>
              <option value="SPECIFICATION">SPECIFICATION</option>
              <option value="SAFETY_INTERLOCK">SAFETY_INTERLOCK</option>
              <option value="MANUAL">MANUAL</option>
              <option value="POSTMORTEM">POSTMORTEM</option>
            </select>
            <select aria-label="Minimum role" value={minRole} onChange={(e) => setMinRole(e.target.value)} className="px-3 py-2 rounded bg-[#0B0F17] border border-[#243044] text-xs text-slate-100">
              <option value="Viewer">Min Role: Viewer</option>
              <option value="Infrastructure Engineer">Min Role: Infrastructure Engineer</option>
              <option value="Operations Manager">Min Role: Operations Manager</option>
            </select>
          </div>
          <input value={sourceRef} onChange={(e) => setSourceRef(e.target.value)} placeholder="Source Reference (e.g. OEM-DOC-104 §3)" className="w-full px-3 py-2 rounded bg-[#0B0F17] border border-[#243044] text-xs text-slate-100" />
          <textarea required rows={3} value={content} onChange={(e) => setContent(e.target.value)} placeholder="Technical specification or SOP text..." className="w-full px-3 py-2 rounded bg-[#0B0F17] border border-[#243044] text-xs text-slate-100" />
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowAdd(false)} className="px-3 py-1.5 text-xs text-slate-400">Cancel</button>
            <button type="submit" className="px-4 py-1.5 rounded bg-sky-600 text-xs font-medium text-white">Save Document</button>
          </div>
        </form>
      )}

      <input
        type="search"
        aria-label="Search knowledge base"
        value={search}
        onChange={(e) => setSearch(e.target.value)}
        placeholder="Search authorized SOPs, manuals, and interlock specs..."
        className="w-full max-w-md px-3.5 py-2 rounded-md bg-[#111827] border border-[#1E293B] text-xs text-slate-100"
      />

      <div className="space-y-4">
        {filtered.map((doc) => (
          <article key={doc.id} className="bg-[#111827] border border-[#1E293B] rounded-lg p-5 space-y-2">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono text-slate-400">
              <span>{doc.category} · Min Role: {doc.minRole} · Scope: {doc.facilityId || 'TENANT_WIDE'}</span>
              <span>Source: {doc.sourceRef} · {doc.version}</span>
            </div>
            <h2 className="text-base font-semibold text-slate-100">{doc.title}</h2>
            <p className="text-xs text-slate-300 leading-relaxed">{doc.content}</p>
          </article>
        ))}
      </div>
    </div>
  );
}

export function SecurityGovernanceView({
  data,
  user,
  onSignedOut,
}: {
  data: WorkspaceData;
  user: UserSession;
  onSignedOut?: () => void;
}) {
  const [revoking, setRevoking] = useState(false);

  const handleRevokeAll = async () => {
    setRevoking(true);
    try {
      await vantaApi.revokeAllSessions();
      onSignedOut?.();
    } finally {
      setRevoking(false);
    }
  };

  return (
    <div className="space-y-6">
      <ModuleHeader
        title="Security, RBAC & Audit Governance"
        subtitle="Zero-trust fail-closed session management, key rotation support, facility-level scope enforcement, physical interlock blocking, and immutable audit logging."
        capability="FUNCTIONAL"
        actions={
          <button
            type="button"
            disabled={revoking}
            onClick={handleRevokeAll}
            className="px-3.5 py-2 rounded-md border border-rose-800 hover:bg-rose-950/60 text-xs font-medium text-rose-200 flex items-center gap-1.5 whitespace-nowrap"
          >
            <ShieldOff className="w-3.5 h-3.5" />
            {revoking ? 'Revoking...' : 'Revoke All My Sessions'}
          </button>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
        <div className="bg-[#111827] border border-[#1E293B] rounded-lg p-4 space-y-1">
          <div className="text-slate-400">Active Tenant & Facility Scope</div>
          <div className="font-mono text-sm font-semibold text-white">{user.tenantId}</div>
          <div className="font-mono text-[11px] text-slate-400">Facilities: {user.facilityIds.join(', ')}</div>
        </div>
        <div className="bg-[#111827] border border-[#1E293B] rounded-lg p-4 space-y-1">
          <div className="text-slate-400">Verified Session Role & JTI</div>
          <div className="font-mono text-sm font-semibold text-sky-400">{user.role}</div>
          <div className="font-mono text-[11px] text-slate-400">Session: {user.sessionId || 'Active'} · Revocable</div>
        </div>
        <div className="bg-[#111827] border border-[#1E293B] rounded-lg p-4 space-y-1">
          <div className="text-slate-400">PLC Safety Interlock Override</div>
          <div className="font-mono text-sm font-semibold text-rose-400">UNCONDITIONALLY BLOCKED</div>
          <div className="text-slate-400">Enforced across all 9 roles & 12 agents</div>
        </div>
      </div>

      <div className="bg-[#111827] border border-[#1E293B] rounded-lg overflow-x-auto">
        <div className="px-5 py-3.5 border-b border-[#1E293B] flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-100">Tenant Audit Trail</h2>
          <span className="text-xs font-mono text-slate-400">{data.auditRecords.length} records</span>
        </div>
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-[#1E293B] text-xs text-slate-400">
              <th className="py-3 px-4">Timestamp</th>
              <th className="py-3 px-4">Actor</th>
              <th className="py-3 px-4">Role</th>
              <th className="py-3 px-4">Action</th>
              <th className="py-3 px-4">Outcome</th>
              <th className="py-3 px-4">Details</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#1E293B] text-xs">
            {data.auditRecords.map((aud) => (
              <tr key={aud.id} className="hover:bg-[#161E2E]/60">
                <td className="py-2.5 px-4 font-mono text-slate-400 whitespace-nowrap tabular-nums">
                  {new Date(aud.createdAt).toLocaleString()}
                </td>
                <td className="py-2.5 px-4 text-slate-200">{aud.actorEmail}</td>
                <td className="py-2.5 px-4 text-slate-400">{aud.actorRole}</td>
                <td className="py-2.5 px-4 font-mono text-slate-200">{aud.action}</td>
                <td className="py-2.5 px-4"><StatusText value={aud.outcome} /></td>
                <td className="py-2.5 px-4 text-slate-400">{aud.details}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function IntegrationsView({
  data,
  onRefresh,
}: {
  data: WorkspaceData;
  onRefresh?: () => void;
}) {
  const [probingId, setProbingId] = useState<string | null>(null);
  const [probeMsg, setProbeMsg] = useState<string | null>(null);

  const handleProbe = async (id: string) => {
    setProbingId(id);
    setProbeMsg(null);
    try {
      const res = await vantaApi.probeIotConnector(id);
      setProbeMsg(`Gateway ${res.connectorId} -> ${res.status}${res.lastError ? ` (${res.lastError})` : ''}`);
      onRefresh?.();
    } catch (err) {
      setProbeMsg(err instanceof Error ? err.message : 'Probe failed.');
    } finally {
      setProbingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <ModuleHeader
        title="Industrial & Enterprise Integrations"
        subtitle="Protocol connectors across OT/IoT gateways with vault credential references and live health probing. Unconfigured endpoints fail loudly."
        capability="PARTIALLY_FUNCTIONAL"
      />

      {probeMsg && (
        <div className="px-4 py-2.5 rounded-md bg-[#111827] border border-sky-800/60 text-xs font-mono text-sky-200">
          {probeMsg}
        </div>
      )}

      <div className="bg-[#111827] border border-[#1E293B] rounded-lg overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-[#1E293B] text-xs text-slate-400">
              <th className="py-3 px-4">Integration</th>
              <th className="py-3 px-4">Protocol</th>
              <th className="py-3 px-4">Endpoint & Vault Ref</th>
              <th className="py-3 px-4 text-right">Poll Rate</th>
              <th className="py-3 px-4">Capability State</th>
              <th className="py-3 px-4 text-right">Action</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#1E293B] text-xs">
            {data.iotIntegrations.map((iot) => (
              <tr key={iot.id} className="hover:bg-[#161E2E]/60">
                <td className="py-3 px-4 font-medium text-slate-100">{iot.name}</td>
                <td className="py-3 px-4 font-mono text-slate-300">{iot.protocol}</td>
                <td className="py-3 px-4 font-mono text-slate-400">
                  <div>{iot.endpoint}</div>
                  <div className="text-[11px] text-slate-500">{iot.credentialRef || 'NO_CREDENTIAL_REF'}</div>
                </td>
                <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-300">{iot.pollingIntervalMs} ms</td>
                <td className="py-3 px-4"><StatusText value={iot.capabilityState} /></td>
                <td className="py-3 px-4 text-right">
                  <button
                    type="button"
                    disabled={probingId === iot.id}
                    onClick={() => handleProbe(iot.id)}
                    className="px-2.5 py-1 rounded border border-[#243044] hover:border-sky-500 text-[11px] font-mono text-slate-200 inline-flex items-center gap-1"
                  >
                    <RefreshCw className="w-3 h-3" />
                    {probingId === iot.id ? 'Probing...' : 'Probe'}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function AdministrationView({
  data,
  user,
}: {
  data: WorkspaceData;
  user: UserSession;
}) {
  return (
    <div className="space-y-6">
      <ModuleHeader
        title="Tenant & Role Administration"
        subtitle="Organization profile, multi-facility scopes, and RBAC directory (visible to Organization and Platform Administrators)."
        capability="FUNCTIONAL"
      />

      <div className="bg-[#111827] border border-[#1E293B] rounded-lg p-5 grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
        <div>
          <span className="text-slate-400 block">Organization</span>
          <span className="text-sm font-semibold text-white">{data.organization.name}</span>
        </div>
        <div>
          <span className="text-slate-400 block">Tenant ID</span>
          <span className="font-mono text-slate-200">{data.organization.tenantId}</span>
        </div>
        <div>
          <span className="text-slate-400 block">Primary Sector</span>
          <span className="text-slate-200">{data.organization.industry}</span>
        </div>
        <div>
          <span className="text-slate-400 block">Region</span>
          <span className="font-mono text-slate-200">{data.organization.region}</span>
        </div>
      </div>

      <div className="bg-[#111827] border border-[#1E293B] rounded-lg overflow-x-auto">
        <div className="px-5 py-3.5 border-b border-[#1E293B]">
          <h2 className="text-sm font-semibold text-slate-100">Tenant User Directory</h2>
        </div>
        {data.users.length === 0 ? (
          <div className="p-6 text-xs text-slate-400">
            Role <span className="font-mono text-slate-200">{user.role}</span> does not hold directory administration permissions (`MANAGE_TENANTS_USERS`). Switch to an Administrator account to manage users.
          </div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#1E293B] text-xs text-slate-400">
                <th className="py-3 px-4">Name</th>
                <th className="py-3 px-4">Email</th>
                <th className="py-3 px-4">Assigned Role</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Created</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1E293B] text-xs">
              {data.users.map((u) => (
                <tr key={u.id} className="hover:bg-[#161E2E]/60">
                  <td className="py-3 px-4 font-medium text-slate-100">{u.fullName}</td>
                  <td className="py-3 px-4 font-mono text-slate-300">{u.email}</td>
                  <td className="py-3 px-4 text-sky-400">{u.role}</td>
                  <td className="py-3 px-4 font-mono text-emerald-400">{u.status || 'ACTIVE'}</td>
                  <td className="py-3 px-4 font-mono text-slate-400">
                    {new Date(u.createdAt).toLocaleDateString()}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}

const CAPABILITY_MATRIX: Array<{ module: string; state: CapabilityState; notes: string }> = [
  { module: '01 · Core Intelligence & Universal Data Model', state: 'FUNCTIONAL', notes: 'SQLite WAL persistence, versioned migrations, tenant/facility isolation, provenance ledger' },
  { module: '02 · VANTA Brain', state: 'FUNCTIONAL', notes: '10-stage server Gemini 4 Hydrogen tool-calling + server citation validator + deterministic fallback' },
  { module: '03 · Vision Intelligence', state: 'PARTIALLY_FUNCTIONAL', notes: 'Uploaded JPEG/PNG/WebP inspection + sample frames; offline RTSP cameras refuse live inspection honestly' },
  { module: '04 · Industrial IoT & Telemetry', state: 'SIMULATED', notes: 'Normalized ingestion & z-score engine live; simulated LAN gateways vs OFFLINE external brokers' },
  { module: '05 · Asset Intelligence', state: 'FUNCTIONAL', notes: 'Full asset registry, metadata, and directed graph edges' },
  { module: '06 · Digital Twin', state: 'PARTIALLY_FUNCTIONAL', notes: '2D spatial topology, persisted Twin snapshots, and read-only cascade simulator; 3D BIM PLANNED' },
  { module: '07 · Predictive Maintenance', state: 'FUNCTIONAL', notes: 'Deterministic headroom RUL + uncertainty + sliding-window precision/recall/F1 backtesting' },
  { module: '08 · Energy Intelligence', state: 'FUNCTIONAL', notes: 'Separates MEASURED, ESTIMATED, and SIMULATED kWh with facility/equipment attribution' },
  { module: '09 · Root Cause Intelligence', state: 'FUNCTIONAL', notes: 'Temporal precedence causal correlation dossiers + selectionReason + human verification' },
  { module: '10 · Multi-Agent Orchestration', state: 'FUNCTIONAL', notes: '12 scoped agents with step trace, conflict detection, idempotency & physical safety lock' },
  { module: '11 · Knowledge Intelligence', state: 'FUNCTIONAL', notes: 'Role-scoped, facility-scoped, tenant-isolated technical documentation repository' },
  { module: '12 · Operations Center & Workflows', state: 'FUNCTIONAL', notes: 'Work order drafting, approval queue, and single-use ticket SSE live telemetry stream' },
  { module: '14 · Security & Governance', state: 'FUNCTIONAL', notes: 'Fail-closed secrets, key rotation, session revocation, layered rate limits & VACUUM INTO backups' },
];

export function SystemHealthView({
  health,
  user,
}: {
  health: SystemHealthStatus | null;
  user?: UserSession;
}) {
  const canBackup = user ? canPerformAction(user.role, 'MANAGE_BACKUPS') : false;
  const [liveHealth, setLiveHealth] = useState<SystemHealthStatus | null>(health);
  const [backups, setBackups] = useState<BackupMetadataDto[]>([]);
  const [backupNotice, setBackupNotice] = useState<string | null>(null);
  const [backupLoading, setBackupLoading] = useState(false);

  const refreshHealthSnapshot = () => {
    vantaApi
      .getHealth()
      .then((res) => setLiveHealth(res))
      .catch(() => {
        // Retain previous snapshot on transient failure
      });
  };

  useEffect(() => {
    refreshHealthSnapshot();
  }, []);

  useEffect(() => {
    if (health) setLiveHealth(health);
  }, [health]);

  useEffect(() => {
    if (!canBackup) return;
    vantaApi
      .listBackups()
      .then((res) => setBackups(res.backups))
      .catch(() => {
        // Ignore if session lacked privilege
      });
  }, [canBackup]);

  const handleCreateBackup = async () => {
    setBackupLoading(true);
    setBackupNotice(null);
    try {
      const created = await vantaApi.createBackup('console');
      setBackupNotice(`Created verified backup ${created.filename} (SHA256 ${created.sha256.slice(0, 12)}..., ${created.sizeBytes} bytes).`);
      const list = await vantaApi.listBackups();
      setBackups(list.backups);
      refreshHealthSnapshot();
    } catch (err) {
      setBackupNotice(err instanceof Error ? err.message : 'Backup creation failed.');
    } finally {
      setBackupLoading(false);
    }
  };

  const handleVerifyBackup = async (filename: string) => {
    setBackupLoading(true);
    setBackupNotice(null);
    try {
      const res = await vantaApi.verifyBackup(filename);
      setBackupNotice(
        `Verified ${res.filename}: valid=${res.valid}, integrity=${res.integrityCheck}, sha256Match=${res.sha256Match}, orgs=${res.organizationCount}`
      );
    } catch (err) {
      setBackupNotice(err instanceof Error ? err.message : 'Verification failed.');
    } finally {
      setBackupLoading(false);
    }
  };

  const currentHealth = liveHealth || health;

  return (
    <div className="space-y-6">
      <ModuleHeader
        title="System Health, Observability & Database Backups"
        subtitle="Live backend telemetry, migration state, Gemini runtime observability, SQLite WAL backups, and honest module capability classification."
        capability="FUNCTIONAL"
        actions={
          <button
            type="button"
            onClick={refreshHealthSnapshot}
            className="px-3.5 py-2 rounded-md border border-[#243044] hover:border-sky-500 text-xs font-medium text-slate-200 flex items-center gap-1.5 whitespace-nowrap"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Refresh Telemetry
          </button>
        }
      />

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4 text-xs">
        <div className="bg-[#111827] border border-[#1E293B] rounded-lg p-4">
          <div className="text-slate-400">API Runtime</div>
          <div className="mt-1"><StatusText value={currentHealth?.status || 'OFFLINE'} /></div>
          <div className="font-mono text-[11px] text-slate-400 mt-1">
            Migrations: {currentHealth?.migrationsApplied ?? 3} applied
          </div>
        </div>
        <div className="bg-[#111827] border border-[#1E293B] rounded-lg p-4">
          <div className="text-slate-400">Relational Database</div>
          <div className="font-mono text-emerald-400 mt-1">{currentHealth?.database || 'CHECKING'}</div>
          <div className="font-mono text-[11px] text-slate-400 mt-1">
            RSS {currentHealth?.observability?.memoryRssMb ?? 0} MB · SSE {currentHealth?.observability?.activeSseStreams ?? 0}
          </div>
        </div>
        <div className="bg-[#111827] border border-[#1E293B] rounded-lg p-4">
          <div className="text-slate-400">Gemini Server Engine</div>
          <div className={`font-mono mt-1 ${currentHealth?.geminiConfigured ? 'text-emerald-400' : 'text-amber-400'}`}>
            {currentHealth?.geminiConfigured ? `CONFIGURED (${currentHealth.geminiModelId || 'GEMINI-4-HYDROGEN'})` : 'FALLBACK (NO KEY IN ENV)'}
          </div>
          <div className="font-mono text-[11px] text-slate-400 mt-1">
            AI Calls: {currentHealth?.observability?.aiCallsTotal ?? 0} (Avg {currentHealth?.observability?.aiAvgLatencyMs ?? 0}ms)
          </div>
        </div>
        <div className="bg-[#111827] border border-[#1E293B] rounded-lg p-4">
          <div className="text-slate-400">HTTP Latency & Limits</div>
          <div className="font-mono text-sky-400 mt-1">
            Avg {currentHealth?.observability?.avgLatencyMs ?? 0}ms · P95 {currentHealth?.observability?.p95LatencyMs ?? 0}ms
          </div>
          <div className="font-mono text-[11px] text-slate-400 mt-1">
            Requests: {currentHealth?.observability?.totalRequests ?? 0} · 429 Blocks: {currentHealth?.observability?.rateLimitRejections ?? 0}
          </div>
        </div>
      </div>

      {canBackup ? (
        <div className="bg-[#111827] border border-[#1E293B] rounded-lg p-5 space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <div>
              <h2 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
                <Database className="w-4 h-4 text-sky-400" />
                SQLite WAL Hot Backups & Integrity Verification
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Produces self-contained transactional snapshots via SQLite VACUUM INTO with SHA-256 manifests.
              </p>
            </div>
            <button
              type="button"
              disabled={backupLoading}
              onClick={handleCreateBackup}
              className="px-3.5 py-2 rounded-md bg-sky-600 hover:bg-sky-500 disabled:opacity-60 text-xs font-medium text-white whitespace-nowrap"
            >
              {backupLoading ? 'Working...' : 'Create Verified Backup'}
            </button>
          </div>

          {backupNotice && (
            <div className="p-2.5 rounded bg-[#0B0F17] border border-sky-800/60 text-xs font-mono text-sky-200">
              {backupNotice}
            </div>
          )}

          <div className="divide-y divide-[#1E293B] text-xs font-mono">
            {backups.length === 0 ? (
              <div className="py-2 text-slate-400">No snapshots stored yet in .vanta-data/backups.</div>
            ) : (
              backups.slice(0, 6).map((b) => (
                <div key={b.filename} className="py-2.5 flex flex-wrap items-center justify-between gap-3">
                  <div>
                    <div className="text-slate-100">{b.filename}</div>
                    <div className="text-[11px] text-slate-500">
                      {(b.sizeBytes / 1024).toFixed(1)} KB · SHA256 {b.sha256.slice(0, 16)}... · {b.integrityCheck}
                    </div>
                  </div>
                  <button
                    type="button"
                    disabled={backupLoading}
                    onClick={() => handleVerifyBackup(b.filename)}
                    className="px-2.5 py-1 rounded border border-[#243044] hover:border-emerald-500 text-[11px] text-emerald-300"
                  >
                    Verify Integrity
                  </button>
                </div>
              ))
            )}
          </div>
        </div>
      ) : (
        <div className="bg-[#111827] border border-[#1E293B] rounded-lg p-4 flex items-center justify-between gap-4 text-xs">
          <div>
            <div className="font-medium text-slate-200">SQLite WAL Hot Backups & Integrity Verification</div>
            <div className="text-slate-400 mt-0.5">
              Active role <span className="font-mono text-sky-400">{user?.role}</span> is read-only for database snapshot operations. Sign in as <span className="font-mono text-slate-200">Platform Administrator</span> to create or verify <span className="font-mono">VACUUM INTO</span> backups.
            </div>
          </div>
          <StatusText value="RBAC_PROTECTED" />
        </div>
      )}

      <div className="bg-[#111827] border border-[#1E293B] rounded-lg overflow-x-auto">
        <div className="px-5 py-3.5 border-b border-[#1E293B]">
          <h2 className="text-sm font-semibold text-slate-100">Module Functionality Matrix (Honest Verification)</h2>
        </div>
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-[#1E293B] text-xs text-slate-400">
              <th className="py-3 px-4">Subsystem Module</th>
              <th className="py-3 px-4">Verification State</th>
              <th className="py-3 px-4">Engineering Scope Notes</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#1E293B] text-xs">
            {CAPABILITY_MATRIX.map((row) => (
              <tr key={row.module} className="hover:bg-[#161E2E]/60">
                <td className="py-3 px-4 font-medium text-slate-100">{row.module}</td>
                <td className="py-3 px-4"><StatusText value={row.state} /></td>
                <td className="py-3 px-4 text-slate-400">{row.notes}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
