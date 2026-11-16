import React from 'react';
import { computeLifecycleStages, computeNorthStarMetrics } from '../core/intelligence';
import type { NavigationSection } from '../core/types';
import type { WorkspaceData } from '../types/workspace';
import { ModuleHeader, StatusText, TelemetryChart } from './StatusText';

const STAGE_ROUTE: Record<string, NavigationSection> = {
  CONNECT: 'integrations',
  COLLECT: 'iot-telemetry',
  NORMALIZE: 'iot-telemetry',
  CONTEXTUALIZE: 'infrastructure',
  ANALYZE: 'command-center',
  CORRELATE: 'root-cause-analysis',
  PREDICT: 'predictive-maintenance',
  RECOMMEND: 'operations-workflows',
  APPROVE: 'operations-workflows',
  EXECUTE: 'operations-workflows',
  VERIFY: 'operations-workflows',
};

export function OverviewView({
  data,
  onNavigate,
}: {
  data: WorkspaceData;
  onNavigate: (section: NavigationSection) => void;
}) {
  const openIncidents = data.incidents.filter((i) => i.status !== 'RESOLVED');
  const pendingApprovals = data.approvals.filter((a) => a.status === 'PENDING');
  const criticalAssets = data.assets.filter((a) => a.status === 'CRITICAL' || a.status === 'WARNING');
  const avgHealth =
    data.assets.length > 0
      ? Math.round(data.assets.reduce((acc, a) => acc + a.healthScore, 0) / data.assets.length)
      : 0;
  const lifecycleStages = computeLifecycleStages(data);

  return (
    <div className="space-y-6">
      <ModuleHeader
        title={`${data.organization?.name || 'Infrastructure'} — Global Overview`}
        subtitle="Unified cross-facility intelligence baseline combining physical asset health, active incidents, energy telemetry, and human approval governance."
        capability="FUNCTIONAL"
        dataMode="MIXED"
        actions={
          <button
            type="button"
            onClick={() => onNavigate('vanta-brain')}
            className="px-4 py-2 rounded-md bg-sky-600 hover:bg-sky-500 text-xs font-medium text-white whitespace-nowrap shrink-0 transition-colors"
          >
            Ask VANTA Brain
          </button>
        }
      />

      {/* Primary KPI Strip */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#111827] border border-[#1E293B] rounded-lg p-5">
          <div className="text-xs text-slate-400">Monitored Facilities</div>
          <div className="text-2xl font-mono font-semibold text-white mt-1 tabular-nums">
            {data.facilities.length}
          </div>
          <div className="text-xs text-slate-400 mt-2 font-mono">
            {data.assets.length} registered assets
          </div>
        </div>

        <div className="bg-[#111827] border border-[#1E293B] rounded-lg p-5">
          <div className="text-xs text-slate-400">Mean Asset Health</div>
          <div className="text-2xl font-mono font-semibold text-white mt-1 tabular-nums">
            {avgHealth}%
          </div>
          <div className="text-xs text-amber-400 mt-2 font-mono">
            {criticalAssets.length} flagged warning/critical
          </div>
        </div>

        <div className="bg-[#111827] border border-[#1E293B] rounded-lg p-5">
          <div className="text-xs text-slate-400">Active Incidents</div>
          <div className="text-2xl font-mono font-semibold text-white mt-1 tabular-nums">
            {openIncidents.length}
          </div>
          <div className="text-xs text-slate-400 mt-2 font-mono">
            {data.rootCauseInvestigations.length} RCA dossiers linked
          </div>
        </div>

        <div className="bg-[#111827] border border-[#1E293B] rounded-lg p-5">
          <div className="text-xs text-slate-400">Pending Human Approvals</div>
          <div className="text-2xl font-mono font-semibold text-white mt-1 tabular-nums">
            {pendingApprovals.length}
          </div>
          <div className="text-xs text-slate-400 mt-2 font-mono">
            Physical safety gate active
          </div>
        </div>
      </div>

      {/* 11-Stage VANTA Intelligence Lifecycle */}
      <section className="bg-[#111827] border border-[#1E293B] rounded-lg p-5 space-y-3" data-testid="intelligence-lifecycle">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1E293B] pb-3">
          <div>
            <h2 className="text-base font-semibold text-slate-100">VANTA Intelligence Lifecycle (11 Stages)</h2>
            <p className="text-xs text-slate-400">
              End-to-end operational pipeline from physical gateway collection through human-governed execution and outcome verification.
            </p>
          </div>
          <span className="text-xs font-mono text-sky-400">CONNECT → EXECUTE → VERIFY</span>
        </div>
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-6 gap-3">
          {lifecycleStages.map((st) => {
            const borderTone =
              st.status === 'ACTIVE'
                ? 'border-emerald-800/60'
                : st.status === 'ATTENTION'
                ? 'border-amber-700/70'
                : st.status === 'NOT_CONFIGURED'
                ? 'border-rose-800/60'
                : 'border-[#1E293B]';
            const dotTone =
              st.status === 'ACTIVE'
                ? 'text-emerald-400'
                : st.status === 'ATTENTION'
                ? 'text-amber-400'
                : st.status === 'NOT_CONFIGURED'
                ? 'text-rose-400'
                : 'text-slate-400';
            return (
              <button
                key={st.stage}
                type="button"
                onClick={() => onNavigate(STAGE_ROUTE[st.stage] || 'overview')}
                title={st.summary}
                className={`text-left p-3 rounded-md bg-[#0B0F17] border ${borderTone} hover:border-sky-500/70 transition-colors flex flex-col justify-between gap-1.5`}
              >
                <div className="flex items-center justify-between gap-2 text-[10px] font-mono text-slate-500">
                  <span>STAGE {String(st.order).padStart(2, '0')}</span>
                  <span className={dotTone}>{st.status === 'NOT_CONFIGURED' ? 'OFF' : st.status}</span>
                </div>
                <div className="flex items-baseline justify-between gap-2">
                  <span className="text-xs font-semibold text-slate-100">{st.label}</span>
                  <span className="text-sm font-mono font-semibold text-sky-300 tabular-nums">{st.count}</span>
                </div>
                <div className="text-[11px] text-slate-400 truncate">{st.summary}</div>
                <div className="flex items-center justify-between text-[10px] font-mono text-slate-500 pt-1 border-t border-[#1E293B]/70">
                  <span>Phys: {st.physicalCount}</span>
                  <span>Sim: {st.simulatedCount}</span>
                </div>
                {st.blockers.length > 0 && (
                  <div className="text-[10px] font-mono text-amber-400 truncate" title={st.blockers.join(' | ')}>
                    ! {st.blockers[0]}
                  </div>
                )}
              </button>
            );
          })}
        </div>
      </section>

      {/* Facility Portfolio Grid */}
      <section className="space-y-3">
        <div className="flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-100">Facility Infrastructure Portfolio</h2>
          <button
            type="button"
            onClick={() => onNavigate('command-center')}
            className="text-xs text-sky-400 hover:text-sky-300 font-medium whitespace-nowrap"
          >
            Open Live Command Center
          </button>
        </div>
        <div className="bg-[#111827] border border-[#1E293B] rounded-lg overflow-x-auto">
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#1E293B] text-xs text-slate-400 font-medium">
                <th className="py-3 px-4">Code</th>
                <th className="py-3 px-4">Facility</th>
                <th className="py-3 px-4">Industry Sector</th>
                <th className="py-3 px-4">Status</th>
                <th className="py-3 px-4 text-right">Area (sqm)</th>
                <th className="py-3 px-4">Criticality</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1E293B] text-sm">
              {data.facilities.map((fac) => (
                <tr key={fac.id} className="hover:bg-[#161E2E]/60 transition-colors">
                  <td className="py-3 px-4 font-mono text-xs text-slate-300 tabular-nums">{fac.code}</td>
                  <td className="py-3 px-4 font-medium text-slate-100">{fac.name}</td>
                  <td className="py-3 px-4 text-xs text-slate-400">{fac.sector}</td>
                  <td className="py-3 px-4">
                    <StatusText value={fac.status} />
                  </td>
                  <td className="py-3 px-4 text-right font-mono text-xs text-slate-300 tabular-nums">
                    {fac.areaSqm.toLocaleString()}
                  </td>
                  <td className="py-3 px-4 font-mono text-xs text-slate-300">{fac.criticality}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      {/* Active Incidents & Approval Preview */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        <section className="bg-[#111827] border border-[#1E293B] rounded-lg p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-[#1E293B] pb-3">
            <h2 className="text-base font-semibold text-slate-100">Priority Incidents</h2>
            <button
              type="button"
              onClick={() => onNavigate('root-cause-analysis')}
              className="text-xs text-sky-400 hover:text-sky-300"
            >
              Investigate RCA
            </button>
          </div>
          {openIncidents.length === 0 ? (
            <p className="text-xs text-slate-400 py-4">No open operational incidents in current scope.</p>
          ) : (
            <div className="divide-y divide-[#1E293B]">
              {openIncidents.map((inc) => (
                <div key={inc.id} className="py-3 first:pt-0 last:pb-0 space-y-1">
                  <div className="flex items-center justify-between gap-2">
                    <StatusText value={inc.severity} />
                    <span className="text-xs font-mono text-slate-400 tabular-nums">{inc.id}</span>
                  </div>
                  <div className="text-sm font-medium text-slate-100">{inc.title}</div>
                  <p className="text-xs text-slate-400">{inc.description}</p>
                </div>
              ))}
            </div>
          )}
        </section>

        <section className="bg-[#111827] border border-[#1E293B] rounded-lg p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-[#1E293B] pb-3">
            <h2 className="text-base font-semibold text-slate-100">Energy Baseline & Load Snapshot</h2>
            <button
              type="button"
              onClick={() => onNavigate('energy-intelligence')}
              className="text-xs text-sky-400 hover:text-sky-300"
            >
              Energy Details
            </button>
          </div>
          <div className="grid grid-cols-3 gap-4 text-xs">
            <div>
              <div className="text-slate-400">Measured kWh</div>
              <div className="text-lg font-mono font-semibold text-emerald-400 tabular-nums mt-1">
                {data.energySummary.measuredKwh.toLocaleString()}
              </div>
            </div>
            <div>
              <div className="text-slate-400">Simulated kWh</div>
              <div className="text-lg font-mono font-semibold text-sky-400 tabular-nums mt-1">
                {data.energySummary.simulatedKwh.toLocaleString()}
              </div>
            </div>
            <div>
              <div className="text-slate-400">Peak Demand</div>
              <div className="text-lg font-mono font-semibold text-slate-100 tabular-nums mt-1">
                {data.energySummary.peakDemandKw} kW
              </div>
            </div>
          </div>
          <p className="text-xs text-slate-400 pt-2 border-t border-[#1E293B]">
            {data.energySummary.methodologyNote}
          </p>
        </section>
      </div>
    </div>
  );
}

export function CommandCenterView({
  data,
  onNavigate,
}: {
  data: WorkspaceData;
  onNavigate: (section: NavigationSection) => void;
}) {
  const priorityAsset =
    data.assets.find((a) => a.status === 'CRITICAL') ||
    data.assets.find((a) => a.status === 'WARNING') ||
    data.assets[0];

  const assetTelemetry = data.telemetry
    .filter((t) => priorityAsset && t.assetId === priorityAsset.id)
    .slice(0, 10)
    .reverse();

  const primaryMetric = assetTelemetry[0]?.metricName;
  const chartSeries = assetTelemetry
    .filter((t) => t.metricName === primaryMetric)
    .map((t) => ({
      label: new Date(t.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
      value: t.value,
      isAnomaly: t.isAnomaly,
    }));

  return (
    <div className="space-y-6">
      <ModuleHeader
        title="Operations Command Center"
        subtitle="Real-time operational telemetry, event stream correlation, pending work-order approvals, and live agent execution status."
        capability="FUNCTIONAL"
        dataMode="MIXED"
        actions={
          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={() => onNavigate('digital-twin')}
              className="px-3 py-2 rounded-md border border-[#243044] hover:border-slate-500 text-xs font-medium text-slate-200 whitespace-nowrap"
            >
              Inspect Digital Twin
            </button>
            <button
              type="button"
              onClick={() => onNavigate('operations-workflows')}
              className="px-3 py-2 rounded-md bg-sky-600 hover:bg-sky-500 text-xs font-medium text-white whitespace-nowrap"
            >
              Approval Queue ({data.approvals.filter((a) => a.status === 'PENDING').length})
            </button>
          </div>
        }
      />

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Priority Asset Telemetry Chart */}
        <div className="lg:col-span-7 bg-[#111827] border border-[#1E293B] rounded-lg p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-[#1E293B] pb-3">
            <div>
              <div className="text-xs font-mono text-slate-400">
                PRIORITY ASSET · {priorityAsset?.code || 'N/A'} · {priorityAsset?.dataMode || 'SIMULATED'}
              </div>
              <h2 className="text-base font-semibold text-slate-100 mt-0.5">
                {priorityAsset ? `${priorityAsset.name} — ${primaryMetric || 'Telemetry'}` : 'No Assets'}
              </h2>
            </div>
            {priorityAsset && <StatusText value={priorityAsset.status} />}
          </div>
          <TelemetryChart
            values={chartSeries}
            unit={assetTelemetry[0]?.unit || ''}
            warnThreshold={assetTelemetry[0]?.thresholdWarn}
            critThreshold={assetTelemetry[0]?.thresholdCrit}
            height={160}
          />
          <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-[#1E293B] text-xs text-slate-400">
            <span>Health Score: {priorityAsset?.healthScore ?? 0}%</span>
            <span>Owner: {priorityAsset?.owner ?? 'Unassigned'}</span>
            <button
              type="button"
              onClick={() => onNavigate('iot-telemetry')}
              className="text-sky-400 hover:text-sky-300 font-medium"
            >
              Open IoT Telemetry Console
            </button>
          </div>
        </div>

        {/* Live Event Feed */}
        <div className="lg:col-span-5 bg-[#111827] border border-[#1E293B] rounded-lg p-5 space-y-3">
          <div className="flex items-center justify-between border-b border-[#1E293B] pb-3">
            <h2 className="text-base font-semibold text-slate-100">Normalized Event Stream</h2>
            <span className="text-xs font-mono text-slate-400">{data.events.length} events</span>
          </div>
          <div className="space-y-3 max-h-72 overflow-y-auto pr-1">
            {data.events.slice(0, 8).map((evt) => (
              <div key={evt.id} className="pb-3 border-b border-[#1E293B] last:border-b-0 last:pb-0">
                <div className="flex items-center justify-between text-xs font-mono">
                  <span className="text-slate-400">
                    {evt.sourceModule} · {evt.mode}
                  </span>
                  <StatusText value={evt.severity} />
                </div>
                <div className="text-sm font-medium text-slate-100 mt-1">{evt.title}</div>
                <p className="text-xs text-slate-400 mt-0.5">{evt.description}</p>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Predictive Risk & Agent Activity Table */}
      <div className="bg-[#111827] border border-[#1E293B] rounded-lg overflow-x-auto">
        <div className="px-5 py-3.5 border-b border-[#1E293B] flex items-center justify-between">
          <h2 className="text-base font-semibold text-slate-100">Predictive Maintenance Risk Queue</h2>
          <button
            type="button"
            onClick={() => onNavigate('predictive-maintenance')}
            className="text-xs text-sky-400 hover:text-sky-300"
          >
            View RUL Models
          </button>
        </div>
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-[#1E293B] text-xs text-slate-400">
              <th className="py-3 px-4">Asset</th>
              <th className="py-3 px-4">Failure Mode</th>
              <th className="py-3 px-4 text-right">Risk</th>
              <th className="py-3 px-4 text-right">RUL Estimate</th>
              <th className="py-3 px-4">Validation</th>
              <th className="py-3 px-4">Origin</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#1E293B] text-xs">
            {data.predictiveAssessments.map((p) => {
              const asset = data.assets.find((a) => a.id === p.assetId);
              return (
                <tr key={p.id} className="hover:bg-[#161E2E]/60">
                  <td className="py-3 px-4 font-medium text-slate-100">{asset?.name || p.assetId}</td>
                  <td className="py-3 px-4 text-slate-300">{p.failureMode}</td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums text-amber-400">
                    {p.riskScore}/100
                  </td>
                  <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-200">
                    {p.rulHours}h ±{p.uncertaintyHours}h
                  </td>
                  <td className="py-3 px-4 font-mono text-slate-400">{p.validationStatus}</td>
                  <td className="py-3 px-4">
                    <StatusText value={p.mode} />
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function AnalyticsReportsView({ data }: { data: WorkspaceData }) {
  const totalDowntime = data.maintenanceRecords.reduce((acc, m) => acc + m.downtimeMinutes, 0);
  const anomaliesCount = data.telemetry.filter((t) => t.isAnomaly).length;
  const approvedWorkOrders = data.workOrders.filter((w) => w.status === 'APPROVED' || w.status === 'COMPLETED').length;
  const northStar = computeNorthStarMetrics({
    incidents: data.incidents,
    rootCauseInvestigations: data.rootCauseInvestigations,
    workOrders: data.workOrders,
    predictiveAssessments: data.predictiveAssessments,
    energyRecords: data.energyRecords,
  });

  const exportCsv = () => {
    const headers = ['AssetCode', 'AssetName', 'Type', 'Status', 'HealthScore', 'DataMode'];
    const rows = data.assets.map((a) => [a.code, `"${a.name}"`, a.assetType, a.status, a.healthScore, a.dataMode].join(','));
    const blob = new Blob([[headers.join(','), ...rows].join('\n')], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `vanta-analytics-${data.organization.tenantId}.csv`;
    link.click();
    URL.revokeObjectURL(url);
  };

  return (
    <div className="space-y-6">
      <ModuleHeader
        title="Analytics & Operational Reports"
        subtitle="Verified operational KPIs, North Star outcome tracking, downtime aggregation, and downloadable audit-ready asset reports."
        capability="FUNCTIONAL"
        dataMode="MIXED"
        actions={
          <button
            type="button"
            onClick={exportCsv}
            className="px-4 py-2 rounded-md bg-sky-600 hover:bg-sky-500 text-xs font-medium text-white whitespace-nowrap"
          >
            Download CSV Report
          </button>
        }
      />

      <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
        <div className="bg-[#111827] border border-[#1E293B] rounded-lg p-5">
          <div className="text-xs text-slate-400">Recorded Maintenance Downtime</div>
          <div className="text-2xl font-mono font-semibold text-white mt-1 tabular-nums">{totalDowntime} min</div>
          <div className="text-xs text-slate-400 mt-1 font-mono">{data.maintenanceRecords.length} log entries</div>
        </div>
        <div className="bg-[#111827] border border-[#1E293B] rounded-lg p-5">
          <div className="text-xs text-slate-400">Telemetry Anomalies Flagged</div>
          <div className="text-2xl font-mono font-semibold text-amber-400 mt-1 tabular-nums">{anomaliesCount}</div>
          <div className="text-xs text-slate-400 mt-1 font-mono">Out of {data.telemetry.length} samples</div>
        </div>
        <div className="bg-[#111827] border border-[#1E293B] rounded-lg p-5">
          <div className="text-xs text-slate-400">Authorized Work Orders</div>
          <div className="text-2xl font-mono font-semibold text-emerald-400 mt-1 tabular-nums">{approvedWorkOrders}</div>
          <div className="text-xs text-slate-400 mt-1 font-mono">{data.workOrders.length} total orders</div>
        </div>
        <div className="bg-[#111827] border border-[#1E293B] rounded-lg p-5">
          <div className="text-xs text-slate-400">Verified Energy Baseline Delta</div>
          <div className="text-2xl font-mono font-semibold text-slate-100 mt-1 tabular-nums">
            {data.energySummary.baselineDeltaPct !== null ? `${data.energySummary.baselineDeltaPct}%` : 'Unverified'}
          </div>
          <div className="text-xs text-slate-400 mt-1 font-mono">MEASURED meter scope only</div>
        </div>
      </div>

      {/* Section 4.4 & Part 15: Honest North Star Outcome Measures with Formula, Source, Time Window & Data Quality */}
      <section className="bg-[#111827] border border-[#1E293B] rounded-lg p-5 space-y-4">
        <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1E293B] pb-3">
          <div>
            <h2 className="text-base font-semibold text-slate-100">North Star Operational Outcome Measures</h2>
            <p className="text-xs text-slate-400">{northStar.epistemicNote}</p>
          </div>
          <StatusText value="MEASURED" />
        </div>
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-5 gap-4 text-xs">
          <div className="p-3.5 rounded-md bg-[#0B0F17] border border-[#1E293B] space-y-1.5">
            <div className="flex items-center justify-between gap-1">
              <span className="text-slate-400">Incident RCA Corroboration</span>
              <span className="text-[10px] font-mono text-emerald-400">{northStar.ratios.incidentTriage.dataQuality}</span>
            </div>
            <div className="text-lg font-mono font-semibold text-slate-100 tabular-nums">
              {northStar.incidentTriageCoveragePct !== null ? `${northStar.incidentTriageCoveragePct}%` : 'INSUFFICIENT DATA'}
            </div>
            <div className="text-[11px] font-mono text-sky-300">
              n = {northStar.ratios.incidentTriage.numerator} / {northStar.ratios.incidentTriage.denominator} incidents
            </div>
            <div className="text-[10px] font-mono text-slate-400">
              Formula: {northStar.ratios.incidentTriage.formula}
            </div>
            <div className="text-[10px] text-slate-500">
              Source: {northStar.ratios.incidentTriage.source} · Window: {northStar.ratios.incidentTriage.timeWindow}
            </div>
          </div>
          <div className="p-3.5 rounded-md bg-[#0B0F17] border border-[#1E293B] space-y-1.5">
            <div className="flex items-center justify-between gap-1">
              <span className="text-slate-400">Verified Action Resolution</span>
              <span className="text-[10px] font-mono text-emerald-400">{northStar.ratios.verifiedOutcome.dataQuality}</span>
            </div>
            <div className="text-lg font-mono font-semibold text-emerald-400 tabular-nums">
              {northStar.verifiedOutcomeRatePct !== null ? `${northStar.verifiedOutcomeRatePct}%` : 'INSUFFICIENT DATA'}
            </div>
            <div className="text-[11px] font-mono text-emerald-300">
              n = {northStar.ratios.verifiedOutcome.numerator} / {northStar.ratios.verifiedOutcome.denominator} evaluated orders
            </div>
            <div className="text-[10px] font-mono text-slate-400">
              Formula: {northStar.ratios.verifiedOutcome.formula}
            </div>
            <div className="text-[10px] text-slate-500">
              Verified: {northStar.verifiedWorkOrdersCount} · Follow-Up: {northStar.needsFollowUpWorkOrdersCount} · Unresolved: {northStar.unresolvedWorkOrdersCount} · Legacy: {northStar.legacyUnverifiedWorkOrdersCount}
            </div>
          </div>
          <div className="p-3.5 rounded-md bg-[#0B0F17] border border-[#1E293B] space-y-1.5">
            <div className="flex items-center justify-between gap-1">
              <span className="text-slate-400">Evidence-Backed Predictive</span>
              <span className="text-[10px] font-mono text-sky-400">{northStar.ratios.predictiveEvidence.dataQuality}</span>
            </div>
            <div className="text-lg font-mono font-semibold text-sky-400 tabular-nums">
              {northStar.predictiveEvidenceCoveragePct !== null ? `${northStar.predictiveEvidenceCoveragePct}%` : 'INSUFFICIENT DATA'}
            </div>
            <div className="text-[11px] font-mono text-sky-300">
              n = {northStar.ratios.predictiveEvidence.numerator} / {northStar.ratios.predictiveEvidence.denominator} assessments
            </div>
            <div className="text-[10px] font-mono text-slate-400">
              Formula: {northStar.ratios.predictiveEvidence.formula}
            </div>
            <div className="text-[10px] text-slate-500">
              Rule: {northStar.ruleVerifiedAssessmentsCount} · Z-Score: {northStar.statisticalAssessmentsCount} · Sim: {northStar.simulatedAssessmentsCount}
            </div>
          </div>
          <div className="p-3.5 rounded-md bg-[#0B0F17] border border-[#1E293B] space-y-1.5">
            <div className="flex items-center justify-between gap-1">
              <span className="text-slate-400">Measured Energy Metering</span>
              <span className="text-[10px] font-mono text-amber-400">{northStar.ratios.measuredEnergy.dataQuality}</span>
            </div>
            <div className="text-lg font-mono font-semibold text-slate-100 tabular-nums">
              {northStar.measuredEnergySharePct !== null ? `${northStar.measuredEnergySharePct}%` : 'INSUFFICIENT DATA'}
            </div>
            <div className="text-[11px] font-mono text-emerald-300">
              {northStar.measuredEnergyKwh.toLocaleString()} / {(northStar.measuredEnergyKwh + northStar.estimatedEnergyKwh + northStar.simulatedEnergyKwh).toLocaleString()} kWh
            </div>
            <div className="text-[10px] font-mono text-slate-400">
              Formula: {northStar.ratios.measuredEnergy.formula}
            </div>
            <div className="text-[10px] text-slate-500">
              Est: {northStar.estimatedEnergyKwh.toLocaleString()} kWh · Sim: {northStar.simulatedEnergyKwh.toLocaleString()} kWh
            </div>
          </div>
          <div className="p-3.5 rounded-md bg-[#0B0F17] border border-[#1E293B] space-y-1.5">
            <div className="flex items-center justify-between gap-1">
              <span className="text-slate-400">Safety Interlock Compliance</span>
              <span className="text-[10px] font-mono text-emerald-400">{northStar.ratios.safetyInterlock.dataQuality}</span>
            </div>
            <div className="text-lg font-mono font-semibold text-emerald-400 tabular-nums">
              {northStar.safetyInterlockCompliancePct !== null ? `${northStar.safetyInterlockCompliancePct}%` : 'INSUFFICIENT DATA'}
            </div>
            <div className="text-[11px] font-mono text-emerald-300">
              n = {northStar.ratios.safetyInterlock.numerator} / {northStar.ratios.safetyInterlock.denominator} work orders
            </div>
            <div className="text-[10px] font-mono text-slate-400">
              Formula: {northStar.ratios.safetyInterlock.formula}
            </div>
            <div className="text-[10px] text-slate-500">{northStar.ratios.safetyInterlock.methodology}</div>
          </div>
        </div>
      </section>

      <div className="bg-[#111827] border border-[#1E293B] rounded-lg overflow-x-auto">
        <div className="px-5 py-3.5 border-b border-[#1E293B]">
          <h2 className="text-base font-semibold text-slate-100">Asset Health & Utilization Breakdown</h2>
        </div>
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-[#1E293B] text-xs text-slate-400">
              <th className="py-3 px-4">Code</th>
              <th className="py-3 px-4">Asset</th>
              <th className="py-3 px-4">Type</th>
              <th className="py-3 px-4">Status</th>
              <th className="py-3 px-4 text-right">Health</th>
              <th className="py-3 px-4">Data Origin</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#1E293B] text-xs">
            {data.assets.map((asset) => (
              <tr key={asset.id} className="hover:bg-[#161E2E]/60">
                <td className="py-2.5 px-4 font-mono text-slate-300">{asset.code}</td>
                <td className="py-2.5 px-4 font-medium text-slate-100">{asset.name}</td>
                <td className="py-2.5 px-4 font-mono text-slate-400">{asset.assetType}</td>
                <td className="py-2.5 px-4"><StatusText value={asset.status} /></td>
                <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-200">{asset.healthScore}%</td>
                <td className="py-2.5 px-4"><StatusText value={asset.dataMode} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}
