import React from 'react';
import type { NavigationSection } from '../core/types';
import type { WorkspaceData } from '../types/workspace';
import { ModuleHeader, StatusText, TelemetryChart } from './StatusText';

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
        subtitle="Verified operational KPIs, downtime aggregation, incident distribution, and downloadable audit-ready asset reports."
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
