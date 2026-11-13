import React, { useState } from 'react';
import { Eye, Camera as CameraIcon, ShieldAlert } from 'lucide-react';
import { vantaApi } from '../api/client';
import type { WorkspaceData } from '../types/workspace';
import { ModuleHeader, StatusText } from './StatusText';

export function VisionIntelligenceView({
  data,
  onRefresh,
}: {
  data: WorkspaceData;
  onRefresh: () => void;
}) {
  const [selectedCameraId, setSelectedCameraId] = useState(data.cameras[0]?.id || '');
  const [goal, setGoal] = useState('Verify PPE compliance, safety perimeter clearance, and equipment status');
  const [running, setRunning] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeCamera = data.cameras.find((c) => c.id === selectedCameraId) || data.cameras[0];

  const handleInspect = async () => {
    if (!activeCamera) return;
    setRunning(true);
    setError(null);
    try {
      await vantaApi.inspectCamera(activeCamera.id, goal);
      onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Vision inspection failed.');
    } finally {
      setRunning(false);
    }
  };

  return (
    <div className="space-y-6">
      <ModuleHeader
        title="Vision Intelligence"
        subtitle="Multimodal visual equipment inspection, PPE verification, and safety-zone analytics. Biometric and facial recognition are disabled by policy."
        capability="PARTIALLY_FUNCTIONAL"
        dataMode="SIMULATED"
      />

      {data.cameras.length === 0 ? (
        <div className="bg-[#111827] border border-[#1E293B] rounded-lg p-8 text-center text-xs text-slate-400">
          No cameras registered in the selected facility or tenant scope.
        </div>
      ) : (
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
          <div className="lg:col-span-7 bg-[#111827] border border-[#1E293B] rounded-lg p-5 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <div>
                <label htmlFor="vision-cam-select" className="block text-xs text-slate-400 mb-1">
                  Active Camera Feed (Simulated Frame Buffer)
                </label>
                <select
                  id="vision-cam-select"
                  value={activeCamera?.id || ''}
                  onChange={(e) => setSelectedCameraId(e.target.value)}
                  className="px-3 py-2 rounded-md bg-[#0B0F17] border border-[#243044] text-xs text-slate-100"
                >
                  {data.cameras.map((cam) => (
                    <option key={cam.id} value={cam.id}>
                      {cam.name}
                    </option>
                  ))}
                </select>
              </div>
              {activeCamera && (
                <div className="text-right text-xs font-mono">
                  <StatusText value={activeCamera.mode} />
                  <div className="text-slate-400 mt-0.5">
                    {activeCamera.resolution} · {activeCamera.fps} FPS · {activeCamera.modelVersion}
                  </div>
                </div>
              )}
            </div>

            {activeCamera && (
              <div className="relative aspect-[4/3] w-full overflow-hidden rounded-md bg-[#0B0F17] border border-[#1E293B]">
                <img
                  src={activeCamera.sampleImageUrl}
                  alt={activeCamera.name}
                  referrerPolicy="no-referrer"
                  className="w-full h-full object-cover"
                />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 via-black/45 to-transparent p-4 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="font-mono text-slate-100">{activeCamera.name}</span>
                  <span className="font-mono text-slate-300">{activeCamera.privacyPolicy}</span>
                </div>
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3 pt-2">
              <input
                type="text"
                aria-label="Vision inspection goal"
                value={goal}
                onChange={(e) => setGoal(e.target.value)}
                className="flex-1 px-3 py-2 rounded-md bg-[#0B0F17] border border-[#243044] text-xs text-slate-100"
              />
              <button
                type="button"
                disabled={running || !activeCamera}
                onClick={handleInspect}
                className="px-4 py-2 rounded-md bg-sky-600 hover:bg-sky-500 disabled:opacity-60 text-xs font-medium text-white flex items-center justify-center gap-2 whitespace-nowrap shrink-0"
              >
                <Eye className="w-3.5 h-3.5" />
                {running ? 'Running Frame Inspection...' : 'Run Visual Inspection'}
              </button>
            </div>
            {error && (
              <div role="alert" className="text-xs text-rose-300 bg-rose-950/50 border border-rose-800 rounded p-2.5">
                {error}
              </div>
            )}
          </div>

          <div className="lg:col-span-5 bg-[#111827] border border-[#1E293B] rounded-lg p-5 space-y-4">
            <div className="flex items-center justify-between border-b border-[#1E293B] pb-3">
              <h2 className="text-base font-semibold text-slate-100">Visual Evidence Log</h2>
              <span className="text-xs font-mono text-slate-400">{data.visionEvents.length} events</span>
            </div>
            <div className="space-y-4 max-h-[520px] overflow-y-auto pr-1">
              {data.visionEvents.map((evt) => (
                <div key={evt.id} className="pb-4 border-b border-[#1E293B] last:border-b-0 space-y-2">
                  <div className="flex items-center justify-between text-xs font-mono">
                    <StatusText value={evt.severity} />
                    <span className="text-slate-400">
                      {evt.inferenceEngine} · conf {(evt.confidence * 100).toFixed(0)}%
                    </span>
                  </div>
                  <div className="text-xs font-medium text-slate-100">{evt.summary}</div>
                  <ul className="space-y-1 text-[11px] text-slate-400">
                    {evt.detections.map((d, idx) => (
                      <li key={idx}>
                        <span className="text-slate-200 font-medium">{d.label}</span> ({d.category}, {(d.confidence * 100).toFixed(0)}%) — {d.observation}
                      </li>
                    ))}
                  </ul>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

export function CameraManagementView({ data }: { data: WorkspaceData }) {
  return (
    <div className="space-y-6">
      <ModuleHeader
        title="Camera Management & Edge Ingestion"
        subtitle="Camera stream protocols, model versioning, confidence thresholds, health status, and privacy governance boundaries."
        capability="PARTIALLY_FUNCTIONAL"
        dataMode="SIMULATED"
      />

      <div className="bg-[#111827] border border-[#1E293B] rounded-lg p-4 flex items-center gap-3 text-xs text-slate-300">
        <ShieldAlert className="w-4 h-4 text-sky-400 shrink-0" />
        <span>
          Architectural Privacy Policy: Facial recognition and biometric identification are disabled across all cameras. Streams operate in simulated frame-buffer mode when RTSP/ONVIF edge hardware is offline.
        </span>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {data.cameras.map((cam) => (
          <div key={cam.id} className="bg-[#111827] border border-[#1E293B] rounded-lg overflow-hidden">
            <div className="aspect-[16/9] bg-[#0B0F17] relative">
              <img
                src={cam.sampleImageUrl}
                alt={cam.name}
                referrerPolicy="no-referrer"
                className="w-full h-full object-cover"
              />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/80 to-transparent p-3 flex items-center justify-between text-xs font-mono">
                <span className="text-white flex items-center gap-1.5">
                  <CameraIcon className="w-3.5 h-3.5" />
                  {cam.id}
                </span>
                <StatusText value={cam.mode} />
              </div>
            </div>
            <div className="p-4 space-y-2">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-slate-100">{cam.name}</h2>
                <StatusText value={cam.status} />
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs font-mono text-slate-400">
                <div>Protocol: {cam.streamProtocol}</div>
                <div>Resolution: {cam.resolution}</div>
                <div>Model: {cam.modelVersion}</div>
                <div>Threshold: {(cam.confidenceThreshold * 100).toFixed(0)}%</div>
              </div>
              <p className="text-xs text-slate-400 pt-2 border-t border-[#1E293B]">{cam.privacyPolicy}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
