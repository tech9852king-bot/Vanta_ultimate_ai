import React, { useEffect, useState } from 'react';
import { Check, X, FilePlus, RefreshCw, Database, ShieldOff, Play, CheckCircle2 } from 'lucide-react';
import { vantaApi } from '../api/client';
import { canPerformAction, getAllSectorProfiles, getSectorProfile } from '../core/intelligence';
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
  const [activeWoId, setActiveWoId] = useState<string | null>(null);
  const [woMode, setWoMode] = useState<'EXECUTE' | 'VERIFY' | null>(null);
  const [execNotes, setExecNotes] = useState('');
  const [verStatus, setVerStatus] = useState<'VERIFIED' | 'PARTIAL' | 'UNRESOLVED'>('VERIFIED');
  const [verNotes, setVerNotes] = useState('');
  const [downtimeMin, setDowntimeMin] = useState('30');
  const [partsReplaced, setPartsReplaced] = useState('None');
  const [incTitle, setIncTitle] = useState('');
  const [incDesc, setIncDesc] = useState('');
  const [incSeverity, setIncSeverity] = useState('HIGH');

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

  const handleExecuteWo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeWoId) return;
    setFeedback(null);
    try {
      await vantaApi.executeWorkOrder(activeWoId, execNotes);
      setFeedback(`Work order ${activeWoId} dispatched for execution (IN_PROGRESS).`);
      setActiveWoId(null);
      setWoMode(null);
      setExecNotes('');
      onRefresh();
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Failed to execute work order.');
    }
  };

  const handleRequestVerification = async (id: string) => {
    setFeedback(null);
    try {
      await vantaApi.requestWorkOrderVerification(
        id,
        'Field execution work completed; submitted for post-action verification.'
      );
      setFeedback(`Work order ${id} transitioned to VERIFICATION_PENDING.`);
      onRefresh();
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Failed to request verification.');
    }
  };

  const handleCancelWo = async (id: string) => {
    setFeedback(null);
    try {
      await vantaApi.cancelWorkOrder(id, `Cancelled by ${user.fullName} prior to field execution.`);
      setFeedback(`Work order ${id} cancelled.`);
      onRefresh();
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Failed to cancel work order.');
    }
  };

  const handleVerifyWo = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!activeWoId) return;
    setFeedback(null);
    try {
      const res = await vantaApi.verifyWorkOrder(activeWoId, {
        verificationStatus: verStatus,
        verificationNotes: verNotes,
        downtimeMinutes: Number(downtimeMin) || 30,
        partsReplaced,
      });
      setFeedback(
        `Work order ${activeWoId} transitioned to ${res.status} (verification: ${res.verificationStatus}) and logged in maintenance history.`
      );
      setActiveWoId(null);
      setWoMode(null);
      setVerNotes('');
      onRefresh();
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Verification failed.');
    }
  };

  const handleCreateIncident = async (e: React.FormEvent) => {
    e.preventDefault();
    setFeedback(null);
    const asset = data.assets.find((a) => a.id === effectiveAssetId);
    const facId = asset?.facilityId || data.facilities[0]?.id;
    if (!facId) return;
    try {
      await vantaApi.createIncident({
        facilityId: facId,
        assetId: asset?.id,
        title: incTitle,
        description: incDesc,
        severity: incSeverity,
      });
      setIncTitle('');
      setIncDesc('');
      setFeedback('Incident logged and linked to tenant provenance ledger.');
      onRefresh();
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Failed to log incident.');
    }
  };

  const handleIncidentStatus = async (id: string, status: 'INVESTIGATING' | 'MITIGATED' | 'RESOLVED') => {
    setFeedback(null);
    try {
      await vantaApi.updateIncidentStatus(id, status);
      setFeedback(`Incident ${id} transitioned to ${status}.`);
      onRefresh();
    } catch (err) {
      setFeedback(err instanceof Error ? err.message : 'Incident update failed.');
    }
  };

  return (
    <div className="space-y-6">
      <ModuleHeader
        title="Operations, Approvals, Execution & Verification"
        subtitle="Closed-loop governance: RECOMMEND → APPROVE → EXECUTE → VERIFY. Physical isolations require authorized sign-off and post-action verification."
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

      {/* Work Order Creation + Closed-Loop EXECUTE / VERIFY Ledger */}
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
          <div className="px-5 py-3.5 border-b border-[#1E293B] flex items-center justify-between">
            <h2 className="text-sm font-semibold text-slate-100">Work Orders Ledger (Execute & Verify)</h2>
            <span className="text-xs font-mono text-slate-400">{data.workOrders.length} orders</span>
          </div>
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#1E293B] text-xs text-slate-400">
                <th className="py-3 px-4">ID</th>
                <th className="py-3 px-4">Work Order</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4">Verification</th>
                <th className="py-3 px-4 text-right">Closed-Loop Action</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1E293B] text-xs">
              {data.workOrders.map((wo) => (
                <tr key={wo.id} className="hover:bg-[#161E2E]/60">
                  <td className="py-3 px-4 font-mono text-slate-400">{wo.id}</td>
                  <td className="py-3 px-4">
                    <div className="font-medium text-slate-100">{wo.title}</div>
                    {wo.executionNotes && (
                      <div className="text-[11px] text-sky-300/90 mt-0.5 font-mono">
                        Exec ({wo.executionMode || 'FIELD_DISPATCH_RECORDED'}): {wo.executionNotes}
                      </div>
                    )}
                    {wo.verificationNotes && (
                      <div className="text-[11px] text-emerald-300 mt-0.5">{wo.verificationNotes}</div>
                    )}
                  </td>
                  <td className="py-3 px-4"><StatusText value={wo.status} /></td>
                  <td className="py-3 px-4 font-mono text-slate-300">
                    {wo.verificationStatus === 'LEGACY_UNVERIFIED' ? (
                      <span className="text-amber-300" title="Historical CMMS baseline completed before post-action verification workflow">
                        LEGACY_UNVERIFIED
                      </span>
                    ) : (
                      wo.verificationStatus || 'PENDING'
                    )}
                  </td>
                  <td className="py-3 px-4 text-right space-x-1.5 whitespace-nowrap">
                    {wo.status === 'APPROVED' && (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setActiveWoId(wo.id);
                            setWoMode('EXECUTE');
                            setExecNotes('');
                          }}
                          className="px-2.5 py-1 rounded bg-sky-700 hover:bg-sky-600 text-[11px] font-medium text-white inline-flex items-center gap-1"
                        >
                          <Play className="w-3 h-3" />
                          Execute
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCancelWo(wo.id)}
                          className="px-2 py-1 rounded border border-slate-700 hover:border-rose-700 text-[11px] text-slate-300"
                        >
                          Cancel
                        </button>
                      </>
                    )}
                    {wo.status === 'IN_PROGRESS' && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleRequestVerification(wo.id)}
                          className="px-2 py-1 rounded border border-sky-700 text-sky-300 hover:bg-sky-950/60 text-[11px] font-medium"
                        >
                          Ready for Verification
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setActiveWoId(wo.id);
                            setWoMode('VERIFY');
                            setVerNotes('');
                          }}
                          className="px-2.5 py-1 rounded bg-emerald-700 hover:bg-emerald-600 text-[11px] font-medium text-white inline-flex items-center gap-1"
                        >
                          <CheckCircle2 className="w-3 h-3" />
                          Verify Outcome
                        </button>
                      </>
                    )}
                    {wo.status === 'VERIFICATION_PENDING' && (
                      <button
                        type="button"
                        onClick={() => {
                          setActiveWoId(wo.id);
                          setWoMode('VERIFY');
                          setVerNotes('');
                        }}
                        className="px-2.5 py-1 rounded bg-emerald-700 hover:bg-emerald-600 text-[11px] font-medium text-white inline-flex items-center gap-1"
                      >
                        <CheckCircle2 className="w-3 h-3" />
                        Verify Outcome
                      </button>
                    )}
                    {wo.status === 'COMPLETED' && wo.verificationStatus === 'VERIFIED' && (
                      <span className="font-mono text-[11px] text-emerald-400">Verified Complete</span>
                    )}
                    {wo.status === 'COMPLETED' && wo.verificationStatus === 'LEGACY_UNVERIFIED' && (
                      <span className="font-mono text-[11px] text-amber-300">Legacy Unverified</span>
                    )}
                    {wo.status === 'NEEDS_FOLLOW_UP' && (
                      <span className="font-mono text-[11px] text-amber-400">Follow-Up Required</span>
                    )}
                    {wo.status === 'UNRESOLVED' && (
                      <span className="font-mono text-[11px] text-rose-400">Unresolved</span>
                    )}
                    {wo.status === 'CANCELLED' && (
                      <span className="font-mono text-[11px] text-slate-500">Cancelled</span>
                    )}
                    {wo.status === 'PENDING_APPROVAL' && (
                      <span className="font-mono text-[11px] text-slate-500">Awaiting Sign-Off</span>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          {activeWoId && woMode === 'EXECUTE' && (
            <form onSubmit={handleExecuteWo} className="p-4 border-t border-[#1E293B] bg-[#0B0F17] space-y-2.5">
              <div className="text-xs font-semibold text-sky-300">Record Field Execution Start ({activeWoId})</div>
              <div className="text-[11px] text-slate-400 font-mono">
                Boundary Notice: This records field workflow dispatch (FIELD_DISPATCH_RECORDED) and does NOT directly actuate physical PLC/SCADA equipment.
              </div>
              <input
                required
                value={execNotes}
                onChange={(e) => setExecNotes(e.target.value)}
                placeholder="Document LOTO lock number, technician dispatch & field procedure notes..."
                className="w-full px-3 py-2 rounded bg-[#111827] border border-[#243044] text-xs text-slate-100"
              />
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => { setActiveWoId(null); setWoMode(null); }} className="px-3 py-1 text-xs text-slate-400">Cancel</button>
                <button type="submit" className="px-3.5 py-1.5 rounded bg-sky-600 text-xs font-medium text-white">Confirm Execution Dispatch</button>
              </div>
            </form>
          )}

          {activeWoId && woMode === 'VERIFY' && (
            <form onSubmit={handleVerifyWo} className="p-4 border-t border-[#1E293B] bg-[#0B0F17] space-y-2.5">
              <div className="text-xs font-semibold text-emerald-300">Verify Post-Action Outcome ({activeWoId})</div>
              <div className="text-[11px] text-slate-400 font-mono">
                VERIFIED → COMPLETED · PARTIAL → NEEDS_FOLLOW_UP · UNRESOLVED → UNRESOLVED (Asset health score remains strictly telemetry-driven)
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-3 gap-2">
                <select
                  aria-label="Outcome verification status"
                  value={verStatus}
                  onChange={(e) => setVerStatus(e.target.value as 'VERIFIED' | 'PARTIAL' | 'UNRESOLVED')}
                  className="px-3 py-1.5 rounded bg-[#111827] border border-[#243044] text-xs text-slate-100"
                >
                  <option value="VERIFIED">VERIFIED → COMPLETED</option>
                  <option value="PARTIAL">PARTIAL → NEEDS_FOLLOW_UP</option>
                  <option value="UNRESOLVED">UNRESOLVED → UNRESOLVED</option>
                </select>
                <input
                  type="number"
                  min={0}
                  value={downtimeMin}
                  onChange={(e) => setDowntimeMin(e.target.value)}
                  placeholder="Downtime min"
                  className="px-3 py-1.5 rounded bg-[#111827] border border-[#243044] text-xs text-slate-100"
                />
                <input
                  value={partsReplaced}
                  onChange={(e) => setPartsReplaced(e.target.value)}
                  placeholder="Parts replaced"
                  className="px-3 py-1.5 rounded bg-[#111827] border border-[#243044] text-xs text-slate-100"
                />
              </div>
              <input
                required
                value={verNotes}
                onChange={(e) => setVerNotes(e.target.value)}
                placeholder="Post-action telemetry & physical inspection verification notes..."
                className="w-full px-3 py-2 rounded bg-[#111827] border border-[#243044] text-xs text-slate-100"
              />
              <div className="flex justify-end gap-2">
                <button type="button" onClick={() => { setActiveWoId(null); setWoMode(null); }} className="px-3 py-1 text-xs text-slate-400">Cancel</button>
                <button type="submit" className="px-3.5 py-1.5 rounded bg-emerald-600 text-xs font-medium text-white">Record Verified Outcome</button>
              </div>
            </form>
          )}
        </div>
      </div>

      {/* Incident Logging & Status Progression */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <form onSubmit={handleCreateIncident} className="lg:col-span-5 bg-[#111827] border border-[#1E293B] rounded-lg p-5 space-y-3">
          <h2 className="text-sm font-semibold text-slate-100">Log Operational Incident</h2>
          <input
            required
            value={incTitle}
            onChange={(e) => setIncTitle(e.target.value)}
            placeholder="Incident title (e.g. Chiller Supply Delta-T Excursion)"
            className="w-full px-3 py-2 rounded bg-[#0B0F17] border border-[#243044] text-xs text-slate-100"
          />
          <select
            aria-label="Incident severity"
            value={incSeverity}
            onChange={(e) => setIncSeverity(e.target.value)}
            className="w-full px-3 py-2 rounded bg-[#0B0F17] border border-[#243044] text-xs text-slate-100"
          >
            <option value="CRITICAL">CRITICAL</option>
            <option value="HIGH">HIGH</option>
            <option value="MEDIUM">MEDIUM</option>
            <option value="LOW">LOW</option>
          </select>
          <textarea
            required
            rows={2}
            value={incDesc}
            onChange={(e) => setIncDesc(e.target.value)}
            placeholder="Observed symptoms, affected zone, and safety context..."
            className="w-full px-3 py-2 rounded bg-[#0B0F17] border border-[#243044] text-xs text-slate-100"
          />
          <button type="submit" className="w-full py-2 px-4 rounded border border-[#243044] hover:border-sky-500 text-xs font-medium text-slate-100">
            Log Incident & Open Investigation
          </button>
        </form>

        <div className="lg:col-span-7 bg-[#111827] border border-[#1E293B] rounded-lg overflow-x-auto">
          <div className="px-5 py-3.5 border-b border-[#1E293B]">
            <h2 className="text-sm font-semibold text-slate-100">Incident Lifecycle Registry</h2>
          </div>
          <div className="divide-y divide-[#1E293B] text-xs">
            {data.incidents.map((inc) => (
              <div key={inc.id} className="p-4 flex flex-wrap items-center justify-between gap-3">
                <div className="space-y-1">
                  <div className="flex items-center gap-2 font-mono">
                    <StatusText value={inc.severity} />
                    <StatusText value={inc.status} />
                    <span className="text-slate-500">{inc.id}</span>
                  </div>
                  <div className="font-medium text-slate-100">{inc.title}</div>
                  <div className="text-slate-400">{inc.description}</div>
                </div>
                {inc.status !== 'RESOLVED' && (
                  <div className="flex items-center gap-1.5">
                    {inc.status === 'OPEN' && (
                      <button
                        type="button"
                        onClick={() => handleIncidentStatus(inc.id, 'INVESTIGATING')}
                        className="px-2.5 py-1 rounded border border-[#243044] hover:border-sky-500 text-[11px] text-slate-200"
                      >
                        Investigate
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => handleIncidentStatus(inc.id, 'RESOLVED')}
                      className="px-2.5 py-1 rounded bg-emerald-800/70 hover:bg-emerald-700 text-[11px] text-white"
                    >
                      Mark Resolved
                    </button>
                  </div>
                )}
              </div>
            ))}
          </div>
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

      {/* Data Provenance & Lineage Ledger */}
      <div className="bg-[#111827] border border-[#1E293B] rounded-lg overflow-x-auto" data-testid="provenance-ledger">
        <div className="px-5 py-3.5 border-b border-[#1E293B] flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-100">Evidence Provenance & Lineage Ledger</h2>
          <span className="text-xs font-mono text-slate-400">{data.provenanceRecords?.length || 0} lineage records</span>
        </div>
        {!data.provenanceRecords || data.provenanceRecords.length === 0 ? (
          <div className="p-5 text-xs text-slate-400">
            No provenance entries generated yet. Telemetry ingestion, vision inspections, and verified work orders automatically log origin lineage here.
          </div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#1E293B] text-xs text-slate-400">
                <th className="py-3 px-4">Module</th>
                <th className="py-3 px-4">Data Origin</th>
                <th className="py-3 px-4">Evidence Class</th>
                <th className="py-3 px-4">Data Quality</th>
                <th className="py-3 px-4">Processing Method</th>
                <th className="py-3 px-4">Summary</th>
                <th className="py-3 px-4">Timestamp</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1E293B] text-xs">
              {data.provenanceRecords.slice(0, 15).map((p) => (
                <tr key={p.id} className="hover:bg-[#161E2E]/60">
                  <td className="py-2.5 px-4 font-mono text-sky-300">{p.sourceModule}</td>
                  <td className="py-2.5 px-4"><StatusText value={p.dataMode} /></td>
                  <td className="py-2.5 px-4"><StatusText value={p.evidenceClass || p.dataMode} /></td>
                  <td className="py-2.5 px-4"><StatusText value={p.dataQualityStatus || 'PENDING_VERIFICATION'} /></td>
                  <td className="py-2.5 px-4 text-slate-300">{p.processingMethod}</td>
                  <td className="py-2.5 px-4 text-slate-400">{p.summary}</td>
                  <td className="py-2.5 px-4 font-mono text-slate-500 whitespace-nowrap">
                    {new Date(p.timestamp).toLocaleString()}
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
  const allProfiles = getAllSectorProfiles();
  const [selectedSector, setSelectedSector] = useState(data.organization.industry);
  const sectorProfile = getSectorProfile(selectedSector);
  return (
    <div className="space-y-6">
      <ModuleHeader
        title="Tenant, Sector Configuration & Role Administration"
        subtitle="Organization profile, configurable 8-industry sector templates, multi-facility scopes, and RBAC directory."
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

      {/* Section 17: Configurable 8-Industry Sector Configuration Profiles */}
      <div className="bg-[#111827] border border-[#1E293B] rounded-lg p-5 space-y-3 text-xs">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1E293B] pb-2.5">
          <div>
            <h2 className="text-sm font-semibold text-slate-100">Industry Sector Configuration Profile — {sectorProfile.sector}</h2>
            <p className="text-[11px] text-slate-400">
              Inspect equipment classes, operating envelopes, recommended connectors, and hardware safety interlock policies across all 8 supported sectors.
            </p>
          </div>
          <select
            aria-label="Inspect industry sector profile"
            value={selectedSector}
            onChange={(e) => setSelectedSector(e.target.value as typeof selectedSector)}
            className="px-3 py-1.5 rounded bg-[#0B0F17] border border-[#243044] text-xs text-slate-100 font-mono"
          >
            {allProfiles.map((p) => (
              <option key={p.sector} value={p.sector}>{p.sector}</option>
            ))}
          </select>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <div>
            <div className="text-slate-400 mb-1">Monitored Equipment Classes</div>
            <ul className="space-y-1 text-slate-200 font-mono text-[11px]">
              {sectorProfile.monitoredEquipmentClasses.map((c) => <li key={c}>• {c}</li>)}
            </ul>
          </div>
          <div>
            <div className="text-slate-400 mb-1">Critical Operating Envelopes</div>
            <ul className="space-y-1 text-slate-200 font-mono text-[11px]">
              {sectorProfile.criticalEnvelopes.map((c) => <li key={c}>• {c}</li>)}
            </ul>
          </div>
          <div>
            <div className="text-slate-400 mb-1">Recommended Connectors & Standards</div>
            <ul className="space-y-1 text-sky-300 font-mono text-[11px]">
              {sectorProfile.recommendedConnectors.map((c) => <li key={c}>• {c}</li>)}
            </ul>
            {sectorProfile.standardsRef && (
              <div className="mt-2 pt-2 border-t border-[#1E293B] text-[10px] font-mono text-slate-400">
                Standards: {sectorProfile.standardsRef.join(' · ')}
              </div>
            )}
          </div>
          <div>
            <div className="text-slate-400 mb-1">Safety Interlock Boundary</div>
            <p className="text-emerald-300 leading-relaxed">{sectorProfile.interlockBoundaryPolicy}</p>
          </div>
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
  { module: '01 · Overview / Executive Intelligence', state: 'FUNCTIONAL', notes: 'Live SQLite WAL metrics, North Star KPI formulas, data origin distribution & provenance ledger' },
  { module: '02 · Command Center', state: 'FUNCTIONAL', notes: 'Facility health matrix, cross-facility alert stream, and single-use ticket SSE live telemetry feed' },
  { module: '03 · VANTA Brain', state: 'FUNCTIONAL', notes: '13-stage server Gemini 4 Hydrogen synthesis + 4-step live provider check + citation validator + deterministic fallback' },
  { module: '04 · Vision Intelligence', state: 'PARTIALLY_FUNCTIONAL', notes: 'Uploaded JPEG/PNG/WebP multimodal inspection (OBSERVED / PENDING_VERIFICATION) + sample frames (SIMULATED); offline RTSP fails closed (409)' },
  { module: '05 · Cameras & Feeds', state: 'PARTIALLY_FUNCTIONAL', notes: 'Camera inventory, capability states (SAMPLE_IMAGE, OFFLINE), privacy policies, and live provider health probes' },
  { module: '06 · Infrastructure Hierarchy', state: 'FUNCTIONAL', notes: 'Canonical Organization → Site → Facility → Building → Floor → Zone → Asset → Sensor hierarchy' },
  { module: '07 · Asset Intelligence (Asset 360°)', state: 'FUNCTIONAL', notes: 'Full asset registry, Asset 360° inspector, upstream/downstream dependency edges, and RBAC asset registration' },
  { module: '08 · Industrial IoT & Sensors', state: 'SIMULATED', notes: '10-stage connector lifecycle, 2s duplicate telemetry guard & z-score anomaly engine live; .internal plant brokers simulated' },
  { module: '09 · Digital Twin', state: 'PARTIALLY_FUNCTIONAL', notes: '2D dependency topology, persisted versioned Twin snapshots, and read-only BFS cascade simulator (SIMULATED)' },
  { module: '10 · Predictive Maintenance', state: 'FUNCTIONAL', notes: 'Deterministic headroom RUL (±uncertaintyHours) + sliding-window precision/recall/F1 anomaly backtesting' },
  { module: '11 · Energy Intelligence', state: 'FUNCTIONAL', notes: 'Strictly separates MEASURED revenue meters, ESTIMATED duty cycles, and SIMULATED profiles with facility attribution' },
  { module: '12 · Root Cause Intelligence', state: 'FUNCTIONAL', notes: 'Temporal precedence & dependency graph correlation dossiers + epistemic causation boundary + human verification' },
  { module: '13 · Multi-Agent Orchestrator', state: 'FUNCTIONAL', notes: '12 bounded agents with tool allowlists, step trace, conflict detection, idempotency keys & physical safety lock' },
  { module: '14 · Operations Workflows & Work Orders', state: 'FUNCTIONAL', notes: 'Closed-loop CREATED → PENDING_APPROVAL → APPROVED → IN_PROGRESS → VERIFICATION_PENDING → COMPLETED/NEEDS_FOLLOW_UP/UNRESOLVED' },
  { module: '15 · Knowledge Center', state: 'FUNCTIONAL', notes: 'Role-scoped (minRole), facility-scoped, tenant-isolated SOPs and engineering knowledge repository' },
  { module: '16 · Security & Governance', state: 'FUNCTIONAL', notes: 'Scrypt auth, SQLite session JTI revocation, RBAC matrix, immutable audit log, and 9-category provenance taxonomy' },
  { module: '17 · Analytics & Reporting', state: 'FUNCTIONAL', notes: 'Formula-disclosed North Star ratios, facility anomaly rankings, and 8-sector industry template applicability' },
  { module: '18 · Integrations & Connectors', state: 'SIMULATED', notes: '10-stage protocol adapter matrix (OPC UA, MQTT, Modbus, BACnet, ONVIF, REST, WebSocket) with fail-closed credential checks' },
  { module: '19 · Administration', state: 'FUNCTIONAL', notes: 'Tenant organization metadata, 8-sector operating envelope profiles, and RBAC-protected tenant user directory' },
  { module: '20 · System Health', state: 'FUNCTIONAL', notes: 'Live API/DB/Gemini telemetry, correlation-tracked latency histograms, and VACUUM INTO SQLite backups with SHA-256 verification' },
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
            Migrations: {currentHealth?.migrationsApplied ?? 9} applied
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
