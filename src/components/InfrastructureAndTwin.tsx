import React, { useState } from 'react';
import { Plus, Zap, Activity, RefreshCw, Camera, Play } from 'lucide-react';
import { vantaApi } from '../api/client';
import type { TwinScenarioResult } from '../core/types';
import type { WorkspaceData } from '../types/workspace';
import { ModuleHeader, StatusText, TelemetryChart } from './StatusText';

export function InfrastructureView({ data }: { data: WorkspaceData }) {
  return (
    <div className="space-y-6">
      <ModuleHeader
        title="Infrastructure Hierarchy"
        subtitle="Multi-site, facility, building, and operational zone topology across authorized facilities."
        capability="FUNCTIONAL"
        dataMode="MEASURED"
      />

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {data.facilities.map((fac) => {
          const facZones = data.zones.filter((z) => z.facilityId === fac.id);
          const facAssets = data.assets.filter((a) => a.facilityId === fac.id);
          return (
            <div key={fac.id} className="bg-[#111827] border border-[#1E293B] rounded-lg p-5 space-y-4">
              <div className="flex items-start justify-between gap-3 border-b border-[#1E293B] pb-3">
                <div>
                  <div className="text-xs font-mono text-slate-400">
                    {fac.code} · {fac.sector}
                  </div>
                  <h2 className="text-base font-semibold text-slate-100 mt-0.5">{fac.name}</h2>
                </div>
                <StatusText value={fac.status} />
              </div>

              <div className="grid grid-cols-3 gap-3 text-xs font-mono">
                <div>
                  <span className="text-slate-400 block">Coordinates</span>
                  <span className="text-slate-200">{fac.coordinates}</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Floor Area</span>
                  <span className="text-slate-200 tabular-nums">{fac.areaSqm.toLocaleString()} m²</span>
                </div>
                <div>
                  <span className="text-slate-400 block">Assets</span>
                  <span className="text-slate-200 tabular-nums">{facAssets.length}</span>
                </div>
              </div>

              <div className="space-y-2 pt-2 border-t border-[#1E293B]">
                <div className="text-xs font-medium text-slate-300">Building Zones ({facZones.length})</div>
                {facZones.length === 0 ? (
                  <p className="text-xs text-slate-500">No zones defined.</p>
                ) : (
                  <div className="divide-y divide-[#1E293B]">
                    {facZones.map((z) => (
                      <div key={z.id} className="py-2 flex items-center justify-between text-xs">
                        <div>
                          <span className="text-slate-200 font-medium">{z.zoneName}</span>
                          <span className="text-slate-400 ml-2">
                            {z.buildingName} · {z.floor}
                          </span>
                        </div>
                        <span className="font-mono text-slate-400">
                          {z.zoneType} {z.restricted ? '· RESTRICTED' : ''}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

export function AssetIntelligenceView({
  data,
  onRefresh,
}: {
  data: WorkspaceData;
  onRefresh: () => void;
}) {
  const [search, setSearch] = useState('');
  const [showCreate, setShowCreate] = useState(false);
  const [code, setCode] = useState('');
  const [name, setName] = useState('');
  const [assetType, setAssetType] = useState('EQUIPMENT');
  const [manufacturer, setManufacturer] = useState('');
  const [model, setModel] = useState('');
  const [facilityId, setFacilityId] = useState(data.facilities[0]?.id || '');
  const [zoneId, setZoneId] = useState(data.zones[0]?.id || '');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const effectiveFacilityId = data.facilities.some((f) => f.id === facilityId)
    ? facilityId
    : data.facilities[0]?.id || '';
  const availableZones = data.zones.filter((z) => !effectiveFacilityId || z.facilityId === effectiveFacilityId);
  const effectiveZoneId = availableZones.some((z) => z.id === zoneId)
    ? zoneId
    : availableZones[0]?.id || data.zones[0]?.id || '';

  const filtered = data.assets.filter(
    (a) =>
      a.name.toLowerCase().includes(search.toLowerCase()) ||
      a.code.toLowerCase().includes(search.toLowerCase()) ||
      a.assetType.toLowerCase().includes(search.toLowerCase())
  );

  const handleCreate = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    setSubmitting(true);
    try {
      await vantaApi.createAsset({
        facilityId: effectiveFacilityId,
        zoneId: effectiveZoneId,
        code,
        name,
        assetType,
        manufacturer,
        model,
        owner: 'Operations',
      });
      setCode('');
      setName('');
      setManufacturer('');
      setModel('');
      setShowCreate(false);
      onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to register asset.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6">
      <ModuleHeader
        title="Asset Intelligence & Graph Registry"
        subtitle="Unified physical asset catalog linking ownership, manufacturer specs, health scores, dependency edges, and telemetry channels."
        capability="FUNCTIONAL"
        dataMode="MIXED"
        actions={
          <button
            type="button"
            onClick={() => setShowCreate((s) => !s)}
            className="px-3.5 py-2 rounded-md bg-sky-600 hover:bg-sky-500 text-xs font-medium text-white flex items-center gap-1.5 whitespace-nowrap"
          >
            <Plus className="w-3.5 h-3.5" />
            Register Asset
          </button>
        }
      />

      {showCreate && (
        <form onSubmit={handleCreate} className="bg-[#111827] border border-[#1E293B] rounded-lg p-5 space-y-4">
          <div className="text-sm font-semibold text-slate-100">Register Infrastructure Asset</div>
          {error && <div className="text-xs text-rose-300">{error}</div>}
          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div>
              <label htmlFor="ast-code" className="block text-xs text-slate-400 mb-1">Asset Code</label>
              <input id="ast-code" required value={code} onChange={(e) => setCode(e.target.value)} placeholder="PUMP-08" className="w-full px-3 py-2 rounded bg-[#0B0F17] border border-[#243044] text-xs text-slate-100" />
            </div>
            <div>
              <label htmlFor="ast-name" className="block text-xs text-slate-400 mb-1">Asset Name</label>
              <input id="ast-name" required value={name} onChange={(e) => setName(e.target.value)} placeholder="Secondary Coolant Pump 08" className="w-full px-3 py-2 rounded bg-[#0B0F17] border border-[#243044] text-xs text-slate-100" />
            </div>
            <div>
              <label htmlFor="ast-type" className="block text-xs text-slate-400 mb-1">Asset Type</label>
              <select id="ast-type" value={assetType} onChange={(e) => setAssetType(e.target.value)} className="w-full px-3 py-2 rounded bg-[#0B0F17] border border-[#243044] text-xs text-slate-100">
                <option value="MACHINE">MACHINE</option>
                <option value="EQUIPMENT">EQUIPMENT</option>
                <option value="HVAC_CHILLER">HVAC_CHILLER</option>
                <option value="ELECTRICAL_ASSET">ELECTRICAL_ASSET</option>
                <option value="SENSOR">SENSOR</option>
                <option value="NETWORK_ASSET">NETWORK_ASSET</option>
              </select>
            </div>
            <div>
              <label htmlFor="ast-fac" className="block text-xs text-slate-400 mb-1">Facility</label>
              <select id="ast-fac" value={effectiveFacilityId} onChange={(e) => setFacilityId(e.target.value)} className="w-full px-3 py-2 rounded bg-[#0B0F17] border border-[#243044] text-xs text-slate-100">
                {data.facilities.map((f) => <option key={f.id} value={f.id}>{f.name}</option>)}
              </select>
            </div>
            <div>
              <label htmlFor="ast-zone" className="block text-xs text-slate-400 mb-1">Zone</label>
              <select id="ast-zone" value={effectiveZoneId} onChange={(e) => setZoneId(e.target.value)} className="w-full px-3 py-2 rounded bg-[#0B0F17] border border-[#243044] text-xs text-slate-100">
                {(availableZones.length > 0 ? availableZones : data.zones).map((z) => <option key={z.id} value={z.id}>{z.zoneName}</option>)}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-2">
              <div>
                <label htmlFor="ast-mfg" className="block text-xs text-slate-400 mb-1">Manufacturer</label>
                <input id="ast-mfg" value={manufacturer} onChange={(e) => setManufacturer(e.target.value)} placeholder="Grundfos" className="w-full px-3 py-2 rounded bg-[#0B0F17] border border-[#243044] text-xs text-slate-100" />
              </div>
              <div>
                <label htmlFor="ast-mod" className="block text-xs text-slate-400 mb-1">Model</label>
                <input id="ast-mod" value={model} onChange={(e) => setModel(e.target.value)} placeholder="CR 45" className="w-full px-3 py-2 rounded bg-[#0B0F17] border border-[#243044] text-xs text-slate-100" />
              </div>
            </div>
          </div>
          <div className="flex justify-end gap-2">
            <button type="button" onClick={() => setShowCreate(false)} className="px-3 py-1.5 text-xs text-slate-400 hover:text-slate-200">Cancel</button>
            <button type="submit" disabled={submitting} className="px-4 py-1.5 rounded bg-sky-600 hover:bg-sky-500 text-xs font-medium text-white">
              {submitting ? 'Saving...' : 'Save Asset'}
            </button>
          </div>
        </form>
      )}

      <div className="flex items-center justify-between gap-4">
        <input
          type="search"
          aria-label="Filter assets"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Filter by code, name, or type..."
          className="w-full max-w-md px-3.5 py-2 rounded-md bg-[#111827] border border-[#1E293B] text-xs text-slate-100"
        />
        <span className="text-xs font-mono text-slate-400 tabular-nums">{filtered.length} assets</span>
      </div>

      <div className="bg-[#111827] border border-[#1E293B] rounded-lg overflow-x-auto">
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-[#1E293B] text-xs text-slate-400">
              <th className="py-3 px-4">Code</th>
              <th className="py-3 px-4">Name</th>
              <th className="py-3 px-4">Type</th>
              <th className="py-3 px-4">Hardware</th>
              <th className="py-3 px-4">Status</th>
              <th className="py-3 px-4 text-right">Health</th>
              <th className="py-3 px-4">Origin</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#1E293B] text-xs">
            {filtered.map((a) => (
              <tr key={a.id} className="hover:bg-[#161E2E]/60">
                <td className="py-3 px-4 font-mono text-slate-300">{a.code}</td>
                <td className="py-3 px-4 font-medium text-slate-100">{a.name}</td>
                <td className="py-3 px-4 font-mono text-slate-400">{a.assetType}</td>
                <td className="py-3 px-4 text-slate-400">{a.manufacturer} {a.model}</td>
                <td className="py-3 px-4"><StatusText value={a.status} /></td>
                <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-200">{a.healthScore}%</td>
                <td className="py-3 px-4"><StatusText value={a.dataMode} /></td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

export function IoTTelemetryView({
  data,
  onRefresh,
}: {
  data: WorkspaceData;
  onRefresh: () => void;
}) {
  const [selectedAssetId, setSelectedAssetId] = useState(data.assets[0]?.id || '');
  const [simLoading, setSimLoading] = useState(false);
  const [probingId, setProbingId] = useState<string | null>(null);
  const [simNotice, setSimNotice] = useState<string | null>(null);

  const effectiveAssetId = data.assets.some((a) => a.id === selectedAssetId)
    ? selectedAssetId
    : data.assets[0]?.id || '';

  const assetPoints = data.telemetry
    .filter((t) => t.assetId === effectiveAssetId)
    .slice(0, 12)
    .reverse();

  const handleProbeConnector = async (connectorId: string) => {
    setProbingId(connectorId);
    setSimNotice(null);
    try {
      const res = await vantaApi.probeIotConnector(connectorId);
      setSimNotice(
        `Connector ${res.connectorId} (${res.protocol}) probe -> ${res.status}${
          res.latencyMs !== null ? ` (${res.latencyMs}ms)` : ''
        }${res.lastError ? ` · ${res.lastError}` : ''}`
      );
      onRefresh();
    } catch (err) {
      setSimNotice(err instanceof Error ? err.message : 'Connector probe failed.');
    } finally {
      setProbingId(null);
    }
  };

  const handleSimulate = async (scenario: 'NOMINAL_SAMPLE' | 'THERMAL_SPIKE' | 'VIBRATION_FAULT') => {
    if (!effectiveAssetId) return;
    setSimLoading(true);
    setSimNotice(null);
    try {
      const res = (await vantaApi.simulateTelemetry(effectiveAssetId, scenario)) as {
        value: number;
        unit: string;
        anomaly: { zScore: number; severity: string };
      };
      setSimNotice(
        `Injected SIMULATED reading: ${res.value} ${res.unit} (z=${res.anomaly.zScore}, ${res.anomaly.severity}). Predictive RUL updated.`
      );
      onRefresh();
    } catch (err) {
      setSimNotice(err instanceof Error ? err.message : 'Simulation failed.');
    } finally {
      setSimLoading(false);
    }
  };

  return (
    <div className="space-y-6">
      <ModuleHeader
        title="Industrial IoT & Telemetry Console"
        subtitle="Protocol adapter framework (MQTT, OPC UA, Modbus TCP, REST, WebSocket) with live health probing, statistical anomaly detection, and explicit simulation sandbox."
        capability="SIMULATED"
        dataMode="MIXED"
      />

      {/* Protocol Connectors */}
      <div className="bg-[#111827] border border-[#1E293B] rounded-lg overflow-x-auto">
        <div className="px-5 py-3.5 border-b border-[#1E293B] flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-100">Industrial Protocol Gateways</h2>
          <span className="text-xs font-mono text-sky-400">Simulated Adapters vs Unconfigured Endpoints</span>
        </div>
        <table className="w-full text-left border-collapse">
          <thead>
            <tr className="border-b border-[#1E293B] text-xs text-slate-400">
              <th className="py-3 px-4">Connector</th>
              <th className="py-3 px-4">Protocol</th>
              <th className="py-3 px-4">Endpoint</th>
              <th className="py-3 px-4 text-right">Latency</th>
              <th className="py-3 px-4">State</th>
              <th className="py-3 px-4 text-right">Probe</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-[#1E293B] text-xs">
            {data.iotIntegrations.map((iot) => (
              <tr key={iot.id} className="hover:bg-[#161E2E]/60">
                <td className="py-3 px-4">
                  <div className="font-medium text-slate-100">{iot.name}</div>
                  {iot.lastError && <div className="text-[11px] font-mono text-amber-300 mt-0.5">{iot.lastError}</div>}
                </td>
                <td className="py-3 px-4 font-mono text-slate-300">{iot.protocol}</td>
                <td className="py-3 px-4 font-mono text-slate-400">{iot.endpoint}</td>
                <td className="py-3 px-4 text-right font-mono tabular-nums text-slate-300">
                  {iot.latencyMs != null ? `${iot.latencyMs}ms` : 'N/A'}
                </td>
                <td className="py-3 px-4"><StatusText value={iot.capabilityState} /></td>
                <td className="py-3 px-4 text-right">
                  <button
                    type="button"
                    disabled={probingId === iot.id}
                    onClick={() => handleProbeConnector(iot.id)}
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

      {/* Simulation Sandbox & Telemetry Plot */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        <div className="lg:col-span-5 bg-[#111827] border border-[#1E293B] rounded-lg p-5 space-y-4">
          <h2 className="text-sm font-semibold text-slate-100">Reproducible Telemetry Simulation</h2>
          <p className="text-xs text-slate-400">
            Inject a clearly labeled <span className="font-mono text-sky-400">SIMULATED</span> sample or fault excursion into SQLite and observe live Digital Twin & Predictive RUL updates.
          </p>
          <div>
            <label htmlFor="sim-asset-select" className="block text-xs text-slate-400 mb-1.5">
              Target Asset Channel
            </label>
            <select
              id="sim-asset-select"
              value={effectiveAssetId}
              onChange={(e) => setSelectedAssetId(e.target.value)}
              className="w-full px-3 py-2 rounded-md bg-[#0B0F17] border border-[#243044] text-xs text-slate-100"
            >
              {data.assets.map((a) => (
                <option key={a.id} value={a.id}>
                  {a.code} — {a.name}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              disabled={simLoading}
              onClick={() => handleSimulate('NOMINAL_SAMPLE')}
              className="px-3 py-2 rounded-md border border-[#243044] hover:border-slate-500 text-xs font-medium text-slate-200"
            >
              Inject Nominal Sample
            </button>
            <button
              type="button"
              disabled={simLoading}
              onClick={() => handleSimulate('THERMAL_SPIKE')}
              className="px-3 py-2 rounded-md bg-amber-600/90 hover:bg-amber-500 text-xs font-medium text-white flex items-center gap-1.5"
            >
              <Zap className="w-3.5 h-3.5" />
              Simulate Thermal Spike
            </button>
            <button
              type="button"
              disabled={simLoading}
              onClick={() => handleSimulate('VIBRATION_FAULT')}
              className="px-3 py-2 rounded-md bg-rose-700 hover:bg-rose-600 text-xs font-medium text-white flex items-center gap-1.5"
            >
              <Activity className="w-3.5 h-3.5" />
              Simulate Fault Excursion
            </button>
          </div>
          {simNotice && (
            <div className="p-3 rounded-md bg-[#0B0F17] border border-sky-800/60 text-xs text-sky-200 font-mono">
              {simNotice}
            </div>
          )}
        </div>

        <div className="lg:col-span-7 bg-[#111827] border border-[#1E293B] rounded-lg p-5 space-y-4">
          <div className="flex items-center justify-between border-b border-[#1E293B] pb-3">
            <h2 className="text-sm font-semibold text-slate-100">
              Channel History ({assetPoints[0]?.metricName || 'Telemetry'})
            </h2>
            <span className="text-xs font-mono text-slate-400">{assetPoints.length} samples</span>
          </div>
          <TelemetryChart
            values={assetPoints.map((t) => ({
              label: new Date(t.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }),
              value: t.value,
              isAnomaly: t.isAnomaly,
            }))}
            unit={assetPoints[0]?.unit || ''}
            warnThreshold={assetPoints[0]?.thresholdWarn}
            critThreshold={assetPoints[0]?.thresholdCrit}
            height={160}
          />
        </div>
      </div>
    </div>
  );
}

export function DigitalTwinView({
  data,
  selectedFacilityId = 'ALL',
  onRefresh,
}: {
  data: WorkspaceData;
  selectedFacilityId?: string;
  onRefresh?: () => void;
}) {
  const [selectedId, setSelectedId] = useState(
    data.assets.find((a) => a.status === 'CRITICAL')?.id || data.assets[0]?.id || ''
  );
  const [scenarioType, setScenarioType] = useState<'ASSET_OFFLINE' | 'COOLING_DEGRADATION' | 'POWER_LOSS'>('COOLING_DEGRADATION');
  const [scenarioResult, setScenarioResult] = useState<TwinScenarioResult | null>(null);
  const [twinNotice, setTwinNotice] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  const selectedAsset = data.assets.find((a) => a.id === selectedId) || data.assets[0];
  const assetTelemetry = data.telemetry.filter((t) => selectedAsset && t.assetId === selectedAsset.id).slice(0, 6);
  const incomingEdges = data.relationships.filter((r) => selectedAsset && r.targetAssetId === selectedAsset.id);
  const outgoingEdges = data.relationships.filter((r) => selectedAsset && r.sourceAssetId === selectedAsset.id);

  const layoutCoords = new Map<string, { x: number; y: number }>();
  const presetPositions: Record<string, { x: number; y: number }> = {
    'ast-tx-t1': { x: 110, y: 110 },
    'ast-sw-b2': { x: 270, y: 110 },
    'ast-chl-01': { x: 190, y: 275 },
    'ast-vib-s04': { x: 450, y: 95 },
    'ast-cnc-04': { x: 450, y: 225 },
    'ast-cnc-09': { x: 450, y: 365 },
    'ast-rob-12': { x: 675, y: 225 },
    'ast-ups-01': { x: 110, y: 385 },
    'ast-crah-03': { x: 270, y: 385 },
    'ast-rack-a30': { x: 675, y: 365 },
    'ast-agv-12': { x: 675, y: 95 },
  };
  data.assets.forEach((asset, idx) => {
    const preset = presetPositions[asset.id];
    if (preset) {
      layoutCoords.set(asset.id, preset);
    } else {
      const col = idx % 4;
      const row = Math.floor(idx / 4);
      layoutCoords.set(asset.id, {
        x: 120 + col * 185,
        y: 110 + (row % 3) * 130,
      });
    }
  });

  const assetMap = new Map(data.assets.map((a) => [a.id, a]));

  const handleCaptureSnapshot = async () => {
    setBusy(true);
    setTwinNotice(null);
    try {
      const res = (await vantaApi.captureTwinSnapshot(selectedFacilityId)) as { twinVersion?: string; meanHealthScore?: number };
      setTwinNotice(`Captured versioned Digital Twin snapshot ${res.twinVersion || ''} (mean health ${res.meanHealthScore ?? 0}%).`);
      onRefresh?.();
    } catch (err) {
      setTwinNotice(err instanceof Error ? err.message : 'Snapshot capture failed.');
    } finally {
      setBusy(false);
    }
  };

  const handleRunCascade = async () => {
    if (!selectedAsset) return;
    setBusy(true);
    setTwinNotice(null);
    try {
      const res = await vantaApi.simulateTwinScenario(selectedAsset.id, scenarioType);
      setScenarioResult(res);
    } catch (err) {
      setTwinNotice(err instanceof Error ? err.message : 'Cascade simulation failed.');
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="space-y-6">
      <ModuleHeader
        title="VANTA Digital Twin — Asset Dependency Topology & Cascade Simulator"
        subtitle="Versioned infrastructure state snapshots and read-only dependency cascade simulation synchronized with SQLite telemetry."
        capability="PARTIALLY_FUNCTIONAL"
        dataMode="MIXED"
        actions={
          <button
            type="button"
            disabled={busy}
            onClick={handleCaptureSnapshot}
            className="px-3.5 py-2 rounded-md bg-sky-600 hover:bg-sky-500 disabled:opacity-60 text-xs font-medium text-white flex items-center gap-1.5 whitespace-nowrap"
          >
            <Camera className="w-3.5 h-3.5" />
            Capture Twin Snapshot
          </button>
        }
      />

      {twinNotice && (
        <div className="px-4 py-2.5 rounded-md bg-[#111827] border border-sky-800/60 text-xs font-mono text-sky-200">
          {twinNotice}
        </div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Interactive Spatial Graph Canvas */}
        <div className="lg:col-span-8 bg-[#111827] border border-[#1E293B] rounded-lg p-5 space-y-3">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1E293B] pb-3 text-xs">
            <span className="font-semibold text-slate-100">Live Infrastructure Dependency Canvas</span>
            <div className="flex items-center gap-4 font-mono text-[11px] text-slate-400">
              <span>Solid Ring = MEASURED</span>
              <span>Dashed Ring = SIMULATED</span>
            </div>
          </div>

          <div className="relative w-full bg-[#0B0F17] border border-[#1E293B] rounded-md overflow-hidden" data-testid="digital-twin-canvas">
            <svg viewBox="0 0 800 460" preserveAspectRatio="xMidYMid meet" className="w-full h-auto block">
              <defs>
                <pattern id="twin-grid" width="40" height="40" patternUnits="userSpaceOnUse">
                  <path d="M 40 0 L 0 0 0 40" fill="none" stroke="#1E293B" strokeWidth="0.8" />
                </pattern>
              </defs>
              <rect width="800" height="460" fill="url(#twin-grid)" />

              {data.relationships.map((rel) => {
                const srcPos = layoutCoords.get(rel.sourceAssetId);
                const dstPos = layoutCoords.get(rel.targetAssetId);
                if (!srcPos || !dstPos) return null;
                const highlighted =
                  selectedAsset &&
                  (rel.sourceAssetId === selectedAsset.id || rel.targetAssetId === selectedAsset.id);
                return (
                  <g key={rel.id}>
                    <line
                      x1={srcPos.x}
                      y1={srcPos.y}
                      x2={dstPos.x}
                      y2={dstPos.y}
                      stroke={highlighted ? '#3B82F6' : '#334155'}
                      strokeWidth={highlighted ? 2.2 : 1.3}
                      strokeDasharray={rel.relationshipType === 'MONITORS' ? '5 4' : undefined}
                    />
                    <rect
                      x={(srcPos.x + dstPos.x) / 2 - 26}
                      y={(srcPos.y + dstPos.y) / 2 - 9}
                      width="52"
                      height="15"
                      rx="3"
                      fill="#0B0F17"
                      fillOpacity="0.9"
                    />
                    <text
                      x={(srcPos.x + dstPos.x) / 2}
                      y={(srcPos.y + dstPos.y) / 2 + 2}
                      fill={highlighted ? '#93C5FD' : '#64748B'}
                      fontSize="9.5"
                      textAnchor="middle"
                      fontFamily="JetBrains Mono, monospace"
                    >
                      {rel.relationshipType}
                    </text>
                  </g>
                );
              })}

              {data.assets.map((asset) => {
                const pos = layoutCoords.get(asset.id);
                if (!pos) return null;
                const isSelected = selectedAsset?.id === asset.id;
                const strokeColor =
                  asset.status === 'CRITICAL'
                    ? '#F43F5E'
                    : asset.status === 'WARNING'
                    ? '#F59E0B'
                    : '#10B981';
                return (
                  <g
                    key={asset.id}
                    onClick={() => setSelectedId(asset.id)}
                    className="cursor-pointer"
                    role="button"
                    tabIndex={0}
                    aria-label={`Select twin asset ${asset.code} ${asset.name}`}
                    onKeyDown={(e) => {
                      if (e.key === 'Enter' || e.key === ' ') setSelectedId(asset.id);
                    }}
                  >
                    <circle
                      cx={pos.x}
                      cy={pos.y}
                      r={isSelected ? 22 : 17}
                      fill="#111827"
                      stroke={strokeColor}
                      strokeWidth={isSelected ? 3.2 : 2.2}
                      strokeDasharray={asset.dataMode === 'SIMULATED' ? '5 3' : undefined}
                    />
                    <text
                      x={pos.x}
                      y={pos.y + 4}
                      fill="#E2E8F0"
                      fontSize="10"
                      fontWeight="600"
                      textAnchor="middle"
                      fontFamily="JetBrains Mono, monospace"
                    >
                      {asset.healthScore}%
                    </text>
                    <text
                      x={pos.x}
                      y={pos.y + (isSelected ? 37 : 33)}
                      fill={isSelected ? '#FFFFFF' : '#CBD5E1'}
                      fontSize="11"
                      fontWeight={isSelected ? '700' : '500'}
                      textAnchor="middle"
                      fontFamily="JetBrains Mono, monospace"
                    >
                      {asset.code}
                    </text>
                  </g>
                );
              })}
            </svg>
          </div>
        </div>

        {/* Selected Twin Node Inspector + Cascade Simulation */}
        <div className="lg:col-span-4 bg-[#111827] border border-[#1E293B] rounded-lg p-5 space-y-4">
          {selectedAsset ? (
            <>
              <div className="border-b border-[#1E293B] pb-3 space-y-1">
                <div className="flex items-center justify-between">
                  <span className="font-mono text-xs text-slate-400">{selectedAsset.code}</span>
                  <StatusText value={selectedAsset.status} />
                </div>
                <h2 className="text-base font-semibold text-slate-100">{selectedAsset.name}</h2>
                <div className="text-xs font-mono text-slate-400">
                  {selectedAsset.dataMode} · Health {selectedAsset.healthScore}% · {selectedAsset.manufacturer}
                </div>
              </div>

              <div className="space-y-2 text-xs">
                <div className="font-medium text-slate-300">Upstream Dependencies ({incomingEdges.length})</div>
                {incomingEdges.length === 0 ? (
                  <p className="text-slate-500">Root utility / independent asset</p>
                ) : (
                  <ul className="space-y-1">
                    {incomingEdges.map((edge) => {
                      const src = assetMap.get(edge.sourceAssetId);
                      return (
                        <li key={edge.id}>
                          <button
                            type="button"
                            onClick={() => setSelectedId(edge.sourceAssetId)}
                            className="text-sky-400 hover:underline font-mono text-left"
                          >
                            {src?.code || edge.sourceAssetId} —[{edge.relationshipType}]→ {selectedAsset.code}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              <div className="space-y-2 text-xs pt-2 border-t border-[#1E293B]">
                <div className="font-medium text-slate-300">Downstream Impact ({outgoingEdges.length})</div>
                {outgoingEdges.length === 0 ? (
                  <p className="text-slate-500">Terminal equipment node</p>
                ) : (
                  <ul className="space-y-1">
                    {outgoingEdges.map((edge) => {
                      const dst = assetMap.get(edge.targetAssetId);
                      return (
                        <li key={edge.id}>
                          <button
                            type="button"
                            onClick={() => setSelectedId(edge.targetAssetId)}
                            className="text-sky-400 hover:underline font-mono text-left"
                          >
                            {selectedAsset.code} —[{edge.relationshipType}]→ {dst?.code || edge.targetAssetId}
                          </button>
                        </li>
                      );
                    })}
                  </ul>
                )}
              </div>

              <div className="space-y-2 text-xs pt-2 border-t border-[#1E293B]">
                <div className="font-medium text-slate-300">What-If Cascade Simulation (Read-Only)</div>
                <div className="flex gap-2">
                  <select
                    aria-label="Cascade scenario type"
                    value={scenarioType}
                    onChange={(e) => setScenarioType(e.target.value as typeof scenarioType)}
                    className="flex-1 px-2.5 py-1.5 rounded bg-[#0B0F17] border border-[#243044] text-xs text-slate-100"
                  >
                    <option value="COOLING_DEGRADATION">COOLING_DEGRADATION</option>
                    <option value="POWER_LOSS">POWER_LOSS</option>
                    <option value="ASSET_OFFLINE">ASSET_OFFLINE</option>
                  </select>
                  <button
                    type="button"
                    disabled={busy}
                    onClick={handleRunCascade}
                    className="px-3 py-1.5 rounded bg-amber-600 hover:bg-amber-500 text-xs font-medium text-white flex items-center gap-1 whitespace-nowrap"
                  >
                    <Play className="w-3 h-3" />
                    Simulate
                  </button>
                </div>
                {scenarioResult && (
                  <div className="p-2.5 rounded bg-[#0B0F17] border border-[#1E293B] space-y-1.5">
                    <div className="font-mono text-[11px] text-amber-300">
                      SIMULATED · Depth {scenarioResult.cascadeDepth} · {scenarioResult.affectedAssets.length} impacted
                    </div>
                    {scenarioResult.affectedAssets.map((a) => (
                      <div key={a.assetId} className="flex items-center justify-between font-mono text-[11px]">
                        <span className="text-slate-200">{a.code} (hop {a.hopDistance})</span>
                        <span className="text-rose-400">{a.projectedStatus} ({a.projectedHealthDelta}%)</span>
                      </div>
                    ))}
                    <div className="text-[10px] text-slate-500">{scenarioResult.disclaimer}</div>
                  </div>
                )}
              </div>

              <div className="space-y-2 text-xs pt-2 border-t border-[#1E293B]">
                <div className="font-medium text-slate-300">Synchronized Telemetry</div>
                {assetTelemetry.length === 0 ? (
                  <p className="text-slate-500">No recent channel samples</p>
                ) : (
                  <div className="space-y-1.5 font-mono">
                    {assetTelemetry.slice(0, 4).map((t) => (
                      <div key={t.id} className="flex items-center justify-between">
                        <span className="text-slate-400">{t.metricName}</span>
                        <span className={t.isAnomaly ? 'text-rose-400 tabular-nums' : 'text-slate-200 tabular-nums'}>
                          {t.value} {t.unit}
                        </span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </>
          ) : (
            <p className="text-xs text-slate-400">Select an asset node on the Digital Twin canvas.</p>
          )}
        </div>
      </div>

      {/* Persisted Twin Snapshots History */}
      <div className="bg-[#111827] border border-[#1E293B] rounded-lg overflow-x-auto">
        <div className="px-5 py-3.5 border-b border-[#1E293B] flex items-center justify-between">
          <h2 className="text-sm font-semibold text-slate-100">Versioned Digital Twin Snapshots</h2>
          <span className="text-xs font-mono text-slate-400">{data.twinSnapshots?.length || 0} checkpoints</span>
        </div>
        {!data.twinSnapshots || data.twinSnapshots.length === 0 ? (
          <div className="p-5 text-xs text-slate-400">
            No Digital Twin checkpoints saved yet. Click "Capture Twin Snapshot" above to persist a historical state version.
          </div>
        ) : (
          <table className="w-full text-left border-collapse">
            <thead>
              <tr className="border-b border-[#1E293B] text-xs text-slate-400">
                <th className="py-3 px-4">Version</th>
                <th className="py-3 px-4">Label</th>
                <th className="py-3 px-4 text-right">Assets</th>
                <th className="py-3 px-4 text-right">Flagged</th>
                <th className="py-3 px-4 text-right">Mean Health</th>
                <th className="py-3 px-4">Captured By</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-[#1E293B] text-xs">
              {data.twinSnapshots.map((snap) => (
                <tr key={snap.id} className="hover:bg-[#161E2E]/60">
                  <td className="py-2.5 px-4 font-mono text-sky-400">{snap.twinVersion}</td>
                  <td className="py-2.5 px-4 text-slate-100">{snap.label}</td>
                  <td className="py-2.5 px-4 text-right font-mono tabular-nums text-slate-300">{snap.assetCount}</td>
                  <td className="py-2.5 px-4 text-right font-mono tabular-nums text-amber-400">{snap.criticalAssetCount}</td>
                  <td className="py-2.5 px-4 text-right font-mono tabular-nums text-emerald-400">{snap.meanHealthScore}%</td>
                  <td className="py-2.5 px-4 font-mono text-slate-400">{snap.createdBy}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </div>
    </div>
  );
}
