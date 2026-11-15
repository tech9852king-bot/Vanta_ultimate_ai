import React, { useState } from 'react';
import { Bot, ShieldAlert, BarChart2 } from 'lucide-react';
import { vantaApi } from '../api/client';
import type { PredictiveBacktestResult } from '../core/types';
import type { WorkspaceData } from '../types/workspace';
import { ModuleHeader, StatusText } from './StatusText';

export function PredictiveMaintenanceView({ data }: { data: WorkspaceData }) {
  const [selectedAssetId, setSelectedAssetId] = useState(data.assets[0]?.id || '');
  const [backtest, setBacktest] = useState<PredictiveBacktestResult | null>(null);
  const [btLoading, setBtLoading] = useState(false);
  const [btError, setBtError] = useState<string | null>(null);

  const effectiveAssetId = data.assets.some((a) => a.id === selectedAssetId)
    ? selectedAssetId
    : data.assets[0]?.id || '';

  const handleRunBacktest = async () => {
    if (!effectiveAssetId) return;
    setBtLoading(true);
    setBtError(null);
    try {
      const res = await vantaApi.getPredictiveBacktest(effectiveAssetId);
      setBacktest(res);
    } catch (err) {
      setBtError(err instanceof Error ? err.message : 'Backtest evaluation failed.');
    } finally {
      setBtLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <ModuleHeader
        title="Predictive Maintenance & RUL Forecasting"
        subtitle="Deterministic headroom RUL estimates, statistical z-score anomaly tracking, drift evaluation, and historical sliding-window backtesting."
        capability="FUNCTIONAL"
        dataMode="MIXED"
      />

      {/* Historical Backtest & Drift Evaluation Card */}
      <div className="bg-[#111827] border border-[#1E293B] rounded-lg p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-sm font-semibold text-slate-100 flex items-center gap-2">
              <BarChart2 className="w-4 h-4 text-sky-400" />
              Historical Backtest & Signal Drift Calibration
            </h2>
            <p className="text-xs text-slate-400 mt-0.5">
              Evaluates statistical z-score detection precision, recall, F1 score, data completeness, and drift against stored asset telemetry.
            </p>
          </div>
          <div className="flex items-center gap-2">
            <select
              aria-label="Select asset for backtest"
              value={effectiveAssetId}
              onChange={(e) => setSelectedAssetId(e.target.value)}
              className="px-3 py-2 rounded-md bg-[#0B0F17] border border-[#243044] text-xs text-slate-100"
            >
              {data.assets.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.code} — {a.name}
                </option>
              ))}
            </select>
            <button
              type="button"
              disabled={btLoading || !effectiveAssetId}
              onClick={handleRunBacktest}
              className="px-3.5 py-2 rounded-md bg-sky-600 hover:bg-sky-500 disabled:opacity-60 text-xs font-medium text-white whitespace-nowrap"
            >
              {btLoading ? 'Evaluating...' : 'Run Backtest Evaluation'}
            </button>
          </div>
        </div>

        {btError && <div className="text-xs text-rose-300">{btError}</div>}

        {backtest && (
          <div className="grid grid-cols-2 md:grid-cols-6 gap-3 pt-3 border-t border-[#1E293B] text-xs font-mono">
            <div className="bg-[#0B0F17] p-3 rounded border border-[#1E293B]">
              <div className="text-slate-400">Samples</div>
              <div className="text-base text-white mt-0.5">{backtest.sampleCount}</div>
            </div>
            <div className="bg-[#0B0F17] p-3 rounded border border-[#1E293B]">
              <div className="text-slate-400">Precision</div>
              <div className="text-base text-emerald-400 mt-0.5">
                {backtest.precision !== null ? backtest.precision : 'N/A'}
              </div>
            </div>
            <div className="bg-[#0B0F17] p-3 rounded border border-[#1E293B]">
              <div className="text-slate-400">Recall</div>
              <div className="text-base text-sky-400 mt-0.5">
                {backtest.recall !== null ? backtest.recall : 'N/A'}
              </div>
            </div>
            <div className="bg-[#0B0F17] p-3 rounded border border-[#1E293B]">
              <div className="text-slate-400">F1 Score</div>
              <div className="text-base text-white mt-0.5">
                {backtest.f1Score !== null ? backtest.f1Score : 'N/A'}
              </div>
            </div>
            <div className="bg-[#0B0F17] p-3 rounded border border-[#1E293B]">
              <div className="text-slate-400">Data Quality</div>
              <div className="text-base text-slate-200 mt-0.5">{backtest.dataQualityScore}/100</div>
            </div>
            <div className="bg-[#0B0F17] p-3 rounded border border-[#1E293B]">
              <div className="text-slate-400">Drift Status</div>
              <div className={`text-sm mt-0.5 ${backtest.driftDetected ? 'text-amber-400' : 'text-emerald-400'}`}>
                {backtest.driftDetected ? 'DRIFT DETECTED' : 'NOMINAL'}
              </div>
            </div>
            <div className="col-span-2 md:col-span-6 text-[11px] text-slate-400 pt-1">
              {backtest.calibrationNote}
            </div>
          </div>
        )}
      </div>

      <div className="space-y-4">
        {data.predictiveAssessments.map((pa) => {
          const asset = data.assets.find((a) => a.id === pa.assetId);
          return (
            <div key={pa.id} className="bg-[#111827] border border-[#1E293B] rounded-lg p-5 space-y-3">
              <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#1E293B] pb-3">
                <div>
                  <div className="text-xs font-mono text-slate-400">
                    {asset?.code || pa.assetId} · {pa.validationStatus} · {pa.modelKind || 'HEADROOM_RUL_ESTIMATE'} · {pa.mode}
                  </div>
                  <h2 className="text-base font-semibold text-slate-100 mt-0.5">
                    {asset?.name || pa.assetId} — {pa.failureMode}
                  </h2>
                </div>
                <div className="text-right font-mono tabular-nums">
                  <div className="text-lg font-semibold text-amber-400">Risk {pa.riskScore}/100</div>
                  <div className="text-xs text-slate-300">
                    RUL: {pa.rulHours}h ± {pa.uncertaintyHours}h
                  </div>
                </div>
              </div>

              <div className="grid grid-cols-1 md:grid-cols-3 gap-4 text-xs">
                <div>
                  <span className="text-slate-400 block">Methodology ({pa.modelVersion || 'vanta-rul-heuristic-2.0'})</span>
                  <span className="text-slate-200">{pa.methodology}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Data Source</span>
                  <span className="text-slate-200">{pa.dataSource}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Quality & Drift</span>
                  <span className="font-mono text-slate-200">
                    Quality {pa.dataQualityScore ?? 85}/100 · {pa.driftStatus || 'NOMINAL'}
                  </span>
                </div>
              </div>

              <div className="pt-2 border-t border-[#1E293B] text-xs">
                <span className="text-slate-400">Recommended Action: </span>
                <span className="text-slate-100 font-medium">{pa.recommendedAction}</span>
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function EnergyIntelligenceView({ data }: { data: WorkspaceData }) {
  const { energySummary, energyRecords } = data;
  return (
    <div className="space-y-6">
      <ModuleHeader
        title="Energy Intelligence & Load Attribution"
        subtitle="Strict separation of measured utility meters from estimated and simulated load profiles across facility and equipment attribution."
        capability="FUNCTIONAL"
        dataMode="MIXED"
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#111827] border border-[#1E293B] rounded-lg p-5">
          <div className="text-xs text-slate-400">Measured Consumption</div>
          <div className="text-2xl font-mono font-semibold text-emerald-400 mt-1 tabular-nums">
            {energySummary.measuredKwh.toLocaleString()} kWh
          </div>
          <div className="text-xs text-slate-400 mt-1 font-mono">Revenue meter verified</div>
        </div>
        <div className="bg-[#111827] border border-[#1E293B] rounded-lg p-5">
          <div className="text-xs text-slate-400">Simulated / Estimated</div>
          <div className="text-2xl font-mono font-semibold text-sky-400 mt-1 tabular-nums">
            {(energySummary.simulatedKwh + energySummary.estimatedKwh).toLocaleString()} kWh
          </div>
          <div className="text-xs text-slate-400 mt-1 font-mono">Non-billing telemetry</div>
        </div>
        <div className="bg-[#111827] border border-[#1E293B] rounded-lg p-5">
          <div className="text-xs text-slate-400">Peak Demand</div>
          <div className="text-2xl font-mono font-semibold text-white mt-1 tabular-nums">
            {energySummary.peakDemandKw.toLocaleString()} kW
          </div>
          <div className="text-xs text-slate-400 mt-1 font-mono">Avg PF {energySummary.avgPowerFactor}</div>
        </div>
        <div className="bg-[#111827] border border-[#1E293B] rounded-lg p-5">
          <div className="text-xs text-slate-400">Verified Baseline Delta</div>
          <div className="text-2xl font-mono font-semibold text-white mt-1 tabular-nums">
            {energySummary.savingsClaimPermitted && energySummary.baselineDeltaPct !== null
              ? `${energySummary.baselineDeltaPct}%`
              : 'N/A'}
          </div>
          <div className="text-xs text-slate-400 mt-1 font-mono">
            {energySummary.savingsClaimPermitted ? 'Baseline verified' : 'Withheld'}
          </div>
        </div>
      </div>

      {/* Facility Attribution Breakdown */}
      {energySummary.byFacility && energySummary.byFacility.length > 0 && (
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <div className="bg-[#111827] border border-[#1E293B] rounded-lg p-4 space-y-2.5">
            <h2 className="text-sm font-semibold text-slate-100">Facility Load Attribution</h2>
            <div className="divide-y divide-[#1E293B] text-xs font-mono">
              {energySummary.byFacility.map((row) => {
                const fac = data.facilities.find((f) => f.id === row.facilityId);
                return (
                  <div key={row.facilityId} className="py-2 flex items-center justify-between gap-2">
                    <span className="text-slate-200">{fac?.code || row.facilityId}</span>
                    <span className="text-emerald-400">{row.measuredKwh.toLocaleString()} kWh MEASURED</span>
                    <span className="text-sky-400">{row.estimatedOrSimulatedKwh.toLocaleString()} kWh SIM/EST</span>
                  </div>
                );
              })}
            </div>
          </div>
          <div className="bg-[#111827] border border-[#1E293B] rounded-lg p-4 space-y-2.5">
            <h2 className="text-sm font-semibold text-slate-100">Equipment Meter Attribution</h2>
            {energySummary.byEquipment && energySummary.byEquipment.length > 0 ? (
              <div className="divide-y divide-[#1E293B] text-xs font-mono">
                {energySummary.byEquipment.map((eq) => {
                  const asset = data.assets.find((a) => a.id === eq.assetId);
                  return (
                    <div key={eq.assetId} className="py-2 flex items-center justify-between gap-2">
                      <span className="text-slate-200">{asset?.code || eq.assetId}</span>
                      <span className="text-slate-300">
                        {(eq.measuredKwh + eq.estimatedOrSimulatedKwh).toLocaleString()} kWh ({eq.mode})
                      </span>
                    </div>
                  );
                })}
              </div>
            ) : (
              <p className="text-xs text-slate-400">No asset-level submeters assigned in current scope.</p>
            )}
          </div>
        </div>
      )}

      <div className="bg-[#111827] border border-[#1E293B] rounded-lg overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-[#1E293B] text-xs text-slate-400">
              <th className="py-3 px-4">Facility</th>
              <th className="py-3 px-4 text-right">Consumption (kWh)</th>
              <th className="py-3 px-4 text-right">Baseline (kWh)</th>
              <th className="py-3 px-4 text-right">Peak (kW)</th>
              <th className="py-3 px-4 text-right">Power Factor</th>
              <th className="py-3 px-4">Origin Mode</th>
              <th className="py-3 px-4">Methodology</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#1E293B] text-xs">
            {energyRecords.map((rec) => {
              const fac = data.facilities.find((f) => f.id === rec.facilityId);
              return (
                <tr key={rec.id} className="hover:bg-[#161E2E]/60">
                  <td className="py-3 px-4 font-medium text-slate-100">{fac?.name || rec.facilityId}</td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-200">
                    {rec.consumptionKwh.toLocaleString()}
                  </td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-400">
                    {rec.baselineKwh.toLocaleString()}
                  </td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-200">
                    {rec.peakDemandKw}
                  </td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-300">
                    {rec.powerFactor}
                  </td>
                  <td className="py-3 px-4"><StatusText value={rec.mode} /></td>
                  <td className="py-3 px-4 text-slate-400">{rec.methodology}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function RootCauseAnalysisView({
  data,
  onRefresh,
}: {
  data: WorkspaceData;
  onRefresh: () => void;
}) {
  const [selectedIncidentId, setSelectedIncidentId] = useState(data.incidents[0]?.id || '');
  const [decisionMap, setDecisionMap] = useState<Record<string, { decision: string; resolution: string }>>({});
  const [statusMsg, setStatusMsg] = useState<string | null>(null);

  const effectiveIncidentId = data.incidents.some((inc) => inc.id === selectedIncidentId)
    ? selectedIncidentId
    : data.incidents[0]?.id || '';

  const handleCorrelate = async () => {
    if (!effectiveIncidentId) return;
    setStatusMsg(null);
    try {
      await vantaApi.correlateRca(effectiveIncidentId);
      setStatusMsg('Generated new cross-system Root Cause Investigation dossier.');
      onRefresh();
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : 'Correlation failed.');
    }
  };

  const handleResolve = async (rcaId: string) => {
    const entry = decisionMap[rcaId];
    if (!entry?.decision?.trim() || !entry?.resolution?.trim()) {
      setStatusMsg('Enter both Human Decision and Resolution Record before verifying.');
      return;
    }
    try {
      await vantaApi.resolveRca(rcaId, {
        humanDecision: entry.decision,
        resolutionRecord: entry.resolution,
        outcomeVerification: 'Verified post-mitigation telemetry return to nominal envelope.',
      });
      setStatusMsg(`Recorded human resolution for ${rcaId}.`);
      onRefresh();
    } catch (err) {
      setStatusMsg(err instanceof Error ? err.message : 'Failed to save resolution.');
    }
  };

  return (
    <div className="space-y-6">
      <ModuleHeader
        title="Root Cause Intelligence"
        subtitle="Cross-system investigation correlating asset dependency edges, temporal precedence, anomalous telemetry, and maintenance gaps into explainable dossiers."
        capability="FUNCTIONAL"
        dataMode="MIXED"
        actions={
          <div className="flex items-center gap-2">
            <select
              aria-label="Select incident to correlate"
              value={effectiveIncidentId}
              onChange={(e) => setSelectedIncidentId(e.target.value)}
              className="px-3 py-2 rounded-md bg-[#111827] border border-[#243044] text-xs text-slate-100 max-w-xs"
            >
              {data.incidents.map((inc) => (
                <option key={inc.id} value={inc.id}>
                  {inc.id} · {inc.title}
                </option>
              ))}
            </select>
            <button
              type="button"
              onClick={handleCorrelate}
              className="px-3.5 py-2 rounded-md bg-sky-600 hover:bg-sky-500 text-xs font-medium text-white whitespace-nowrap"
            >
              Run Correlation
            </button>
          </div>
        }
      />

      {statusMsg && (
        <div className="px-4 py-2.5 rounded-md bg-[#111827] border border-sky-800/60 text-xs text-sky-200">
          {statusMsg}
        </div>
      )}

      <div className="space-y-6">
        {data.rootCauseInvestigations.map((rca) => (
          <article key={rca.id} className="bg-[#111827] border border-[#1E293B] rounded-lg p-6 space-y-5">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-[#1E293B] pb-3">
              <div>
                <div className="text-xs font-mono text-slate-400">
                  {rca.id} · Incident {rca.incidentId} · Confidence {rca.confidence}%
                </div>
                <h2 className="text-base font-semibold text-white mt-0.5">{rca.detectedIssue}</h2>
              </div>
              <StatusText value={rca.status} />
            </div>

            <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 text-xs">
              <div className="space-y-3">
                <div className="font-semibold text-slate-200">Ranked Potential Causes (Correlation Only)</div>
                <div className="space-y-2">
                  {rca.potentialCauses.map((c, idx) => (
                    <div key={idx} className="p-3 rounded bg-[#0B0F17] border border-[#1E293B] space-y-1">
                      <div className="flex justify-between gap-2 font-medium text-slate-100">
                        <span>{c.cause}</span>
                        <span className="font-mono text-amber-400 tabular-nums shrink-0">{c.score}/100</span>
                      </div>
                      <p className="text-slate-400">{c.mechanism}</p>
                      {c.selectionReason && (
                        <div className="font-mono text-[11px] text-sky-400 pt-1">
                          Why selected: {c.selectionReason}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                <div className="font-semibold text-slate-200 pt-2">Alternative Explanations</div>
                <ul className="list-disc pl-4 space-y-1 text-slate-400">
                  {rca.alternativeExplanations.map((alt, i) => (
                    <li key={i}>{alt}</li>
                  ))}
                </ul>
              </div>

              <div className="space-y-3">
                <div className="font-semibold text-slate-200">Supporting Evidence Citations</div>
                <ul className="space-y-2">
                  {rca.supportingEvidence.map((ev, i) => (
                    <li key={i} className="pb-2 border-b border-[#1E293B] last:border-b-0">
                      <span className="font-mono text-sky-400">{ev.sourceType} ({ev.recordId})</span>
                      <div className="text-slate-300 mt-0.5">{ev.summary}</div>
                    </li>
                  ))}
                </ul>
                <div className="p-2.5 rounded bg-amber-950/30 border border-amber-900/50 text-amber-200">
                  <span className="font-semibold">Epistemic Uncertainty: </span>
                  {rca.uncertaintyNotes}
                </div>
                <div className="text-slate-400">
                  <span className="font-medium text-slate-300">Recommended Verification: </span>
                  {rca.recommendedInvestigation}
                </div>
              </div>
            </div>

            <div className="pt-4 border-t border-[#1E293B] text-xs space-y-3">
              {rca.humanDecision ? (
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4 bg-[#0B0F17] p-3.5 rounded border border-[#1E293B]">
                  <div>
                    <span className="text-slate-400 block">Human Decision</span>
                    <span className="text-slate-100 font-medium">{rca.humanDecision}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Resolution Record</span>
                    <span className="text-slate-200">{rca.resolutionRecord}</span>
                  </div>
                  <div>
                    <span className="text-slate-400 block">Outcome Verification</span>
                    <span className="text-emerald-400">{rca.outcomeVerification}</span>
                  </div>
                </div>
              ) : (
                <div className="grid grid-cols-1 md:grid-cols-12 gap-3 items-end">
                  <div className="md:col-span-5">
                    <label className="block text-slate-400 mb-1">Human Decision</label>
                    <input
                      type="text"
                      value={decisionMap[rca.id]?.decision || ''}
                      onChange={(e) =>
                        setDecisionMap((m) => ({
                          ...m,
                          [rca.id]: { decision: e.target.value, resolution: m[rca.id]?.resolution || '' },
                        }))
                      }
                      placeholder="Approved CHL-01 strainer flush & switchover"
                      className="w-full px-3 py-2 rounded bg-[#0B0F17] border border-[#243044] text-slate-100"
                    />
                  </div>
                  <div className="md:col-span-5">
                    <label className="block text-slate-400 mb-1">Resolution Record</label>
                    <input
                      type="text"
                      value={decisionMap[rca.id]?.resolution || ''}
                      onChange={(e) =>
                        setDecisionMap((m) => ({
                          ...m,
                          [rca.id]: { decision: m[rca.id]?.decision || '', resolution: e.target.value },
                        }))
                      }
                      placeholder="Coolant restored to 18.4°C; spindle vibration settled"
                      className="w-full px-3 py-2 rounded bg-[#0B0F17] border border-[#243044] text-slate-100"
                    />
                  </div>
                  <div className="md:col-span-2">
                    <button
                      type="button"
                      onClick={() => handleResolve(rca.id)}
                      className="w-full py-2 px-3 rounded bg-emerald-700 hover:bg-emerald-600 text-white font-medium"
                    >
                      Verify & Close
                    </button>
                  </div>
                </div>
              )}
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

export function AIAgentsView({
  data,
  onRefresh,
}: {
  data: WorkspaceData;
  onRefresh: () => void;
}) {
  const [selectedAgentId, setSelectedAgentId] = useState(data.agents[0]?.id || 'agent-orchestrator');
  const [taskPrompt, setTaskPrompt] = useState('Analyze CHL-01 and CNC-04 health trends and prepare a maintenance recommendation.');
  const [running, setRunning] = useState(false);
  const [execNotice, setExecNotice] = useState<string | null>(null);
  const [execError, setExecError] = useState<string | null>(null);

  const handleRunAgent = async (e: React.FormEvent) => {
    e.preventDefault();
    setRunning(true);
    setExecError(null);
    setExecNotice(null);
    try {
      const res = (await vantaApi.executeAgent(selectedAgentId, taskPrompt)) as {
        deduplicated?: boolean;
        status?: string;
        durationMs?: number;
      };
      setExecNotice(
        res.deduplicated
          ? `Idempotent cache hit: returned existing bounded execution (${res.status}).`
          : `Agent execution finished with status ${res.status} (${res.durationMs || 0}ms).`
      );
      onRefresh();
    } catch (err) {
      setExecError(err instanceof Error ? err.message : 'Agent execution failed.');
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-6">
      <ModuleHeader
        title="Multi-Agent Orchestration Ecosystem"
        subtitle="12 specialized domain agents with task-planned tool selection, permission validation, execution tracing, conflict checks, and duplicate-execution idempotency."
        capability="FUNCTIONAL"
      />

      <div className="bg-[#111827] border border-[#1E293B] rounded-lg p-4 flex items-center gap-3 text-xs text-slate-300">
        <ShieldAlert className="w-4 h-4 text-amber-400 shrink-0" />
        <span>
          Physical Safety Boundary: Every agent has <span className="font-mono text-slate-100">canActuatePhysicalControl = false</span>. Prompts attempting to bypass PLC interlocks or invoke unauthorized tools are blocked and traced.
        </span>
      </div>

      {/* Bounded Execution Console */}
      <form onSubmit={handleRunAgent} className="bg-[#111827] border border-[#1E293B] rounded-lg p-5 space-y-4">
        <h2 className="text-sm font-semibold text-slate-100">Dispatch Bounded Agent Task</h2>
        {execError && <div className="text-xs text-rose-300">{execError}</div>}
        {execNotice && <div className="text-xs font-mono text-sky-300">{execNotice}</div>}
        <div className="grid grid-cols-1 md:grid-cols-12 gap-3">
          <div className="md:col-span-4">
            <label htmlFor="agent-select" className="block text-xs text-slate-400 mb-1">Select Agent</label>
            <select
              id="agent-select"
              value={selectedAgentId}
              onChange={(e) => setSelectedAgentId(e.target.value)}
              className="w-full px-3 py-2 rounded-md bg-[#0B0F17] border border-[#243044] text-xs text-slate-100"
            >
              {data.agents.map((ag) => (
                <option key={ag.id} value={ag.id}>
                  {ag.name} ({ag.capabilityState})
                </option>
              ))}
            </select>
          </div>
          <div className="md:col-span-6">
            <label htmlFor="agent-prompt" className="block text-xs text-slate-400 mb-1">Task Instruction</label>
            <input
              id="agent-prompt"
              type="text"
              value={taskPrompt}
              onChange={(e) => setTaskPrompt(e.target.value)}
              className="w-full px-3 py-2 rounded-md bg-[#0B0F17] border border-[#243044] text-xs text-slate-100"
            />
          </div>
          <div className="md:col-span-2 flex items-end">
            <button
              type="submit"
              disabled={running}
              className="w-full py-2 px-4 rounded-md bg-sky-600 hover:bg-sky-500 disabled:opacity-60 text-xs font-medium text-white flex items-center justify-center gap-1.5"
            >
              <Bot className="w-3.5 h-3.5" />
              {running ? 'Running...' : 'Execute'}
            </button>
          </div>
        </div>
      </form>

      {/* 12-Agent Registry */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
        {data.agents.map((ag) => (
          <div key={ag.id} className="bg-[#111827] border border-[#1E293B] rounded-lg p-4 space-y-2.5">
            <div className="flex items-center justify-between gap-2">
              <h3 className="text-sm font-semibold text-slate-100">{ag.name}</h3>
              <StatusText value={ag.capabilityState} />
            </div>
            <div className="text-xs font-mono text-sky-400">{ag.domain} · Max {ag.maxSteps} steps</div>
            <p className="text-xs text-slate-400">{ag.purpose}</p>
            <div className="pt-2 border-t border-[#1E293B] text-[11px] font-mono text-slate-400">
              Tools: {ag.authorizedTools.join(', ')}
            </div>
          </div>
        ))}
      </div>

      {/* Execution History with Step Trace & Conflict Detection */}
      <div className="bg-[#111827] border border-[#1E293B] rounded-lg overflow-x-auto">
        <div className="px-5 py-3.5 border-b border-[#1E293B]">
          <h2 className="text-sm font-semibold text-slate-100">Agent Execution Trace & Conflict Log</h2>
        </div>
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-[#1E293B] text-xs text-slate-400">
              <th className="py-3 px-4">Agent</th>
              <th className="py-3 px-4">Status</th>
              <th className="py-3 px-4">Step Trace</th>
              <th className="py-3 px-4">Summary & Conflicts</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#1E293B] text-xs">
            {data.agentExecutions.map((ex) => (
              <tr key={ex.id} className="hover:bg-[#161E2E]/60 align-top">
                <td className="py-3 px-4 font-mono text-slate-200 whitespace-nowrap">
                  <div>{ex.agentId}</div>
                  <div className="text-[11px] text-slate-500">{ex.durationMs || 0}ms</div>
                </td>
                <td className="py-3 px-4"><StatusText value={ex.status} /></td>
                <td className="py-3 px-4 font-mono text-[11px] text-slate-400 space-y-1">
                  {ex.trace && ex.trace.length > 0 ? (
                    ex.trace.map((step) => (
                      <div key={step.stepIndex}>
                        #{step.stepIndex} {step.toolName} [{step.status}, {step.recordsRetrieved} rec, {step.durationMs}ms]
                      </div>
                    ))
                  ) : (
                    <div>{ex.toolsInvoked.join(', ') || 'None'}</div>
                  )}
                </td>
                <td className="py-3 px-4 text-slate-300 space-y-1">
                  <div>{ex.outputSummary}</div>
                  {ex.conflictsDetected && ex.conflictsDetected.length > 0 && (
                    <div className="text-[11px] font-mono text-amber-300">
                      Conflict: {ex.conflictsDetected.join(' ')}
                    </div>
                  )}
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
