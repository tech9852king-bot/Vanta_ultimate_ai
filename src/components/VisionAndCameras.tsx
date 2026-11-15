import React, { useState } from 'react';
import { Eye, Camera as CameraIcon, ShieldAlert, Upload, RefreshCw } from 'lucide-react';
import { vantaApi } from '../api/client';
import type { WorkspaceData } from '../types/workspace';
import { ModuleHeader, StatusText } from './StatusText';

function CameraFrameImage({
  src,
  alt,
  resolution,
}: {
  src: string;
  alt: string;
  resolution: string;
}) {
  const [failed, setFailed] = useState(false);

  if (failed || !src) {
    return (
      <div className="w-full h-full flex flex-col items-center justify-center bg-[#0B0F17] text-slate-400 p-6 text-center select-none">
        <CameraIcon className="w-8 h-8 text-sky-400 mb-2 opacity-80" />
        <div className="text-xs font-mono text-slate-200">{alt}</div>
        <div className="text-[11px] font-mono text-slate-500 mt-1">
          FRAME BUFFER UNAVAILABLE · {resolution}
        </div>
      </div>
    );
  }

  return (
    <img
      src={src}
      alt={alt}
      referrerPolicy="no-referrer"
      onError={() => setFailed(true)}
      className="w-full h-full object-cover"
    />
  );
}

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
  const [uploading, setUploading] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  const activeCamera = data.cameras.find((c) => c.id === selectedCameraId) || data.cameras[0];
  const isCameraOffline =
    activeCamera?.capabilityState === 'OFFLINE' ||
    activeCamera?.capabilityState === 'NOT_CONFIGURED' ||
    activeCamera?.status === 'OFFLINE';

  const handleInspect = async () => {
    if (!activeCamera) return;
    setRunning(true);
    setError(null);
    setNotice(null);
    try {
      const res = (await vantaApi.inspectCamera(activeCamera.id, goal)) as { captureSource?: string };
      setNotice(`Inspection completed using ${res.captureSource || 'SAMPLE_IMAGE'}.`);
      onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Vision inspection failed.');
    } finally {
      setRunning(false);
    }
  };

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file || !activeCamera) return;
    setUploading(true);
    setError(null);
    setNotice(null);
    try {
      if (file.size > 1_400_000) {
        throw new Error('Uploaded frame exceeds 1.4 MB limit.');
      }
      const allowedTypes = ['image/jpeg', 'image/png', 'image/webp'];
      if (!allowedTypes.includes(file.type)) {
        throw new Error('Only JPEG, PNG, or WebP industrial frames are supported.');
      }
      const dataUrl = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onload = () => resolve(String(reader.result || ''));
        reader.onerror = () => reject(new Error('Failed to read image file.'));
        reader.readAsDataURL(file);
      });
      const base64Data = dataUrl.split(',')[1] || '';
      await vantaApi.uploadInspectCamera({
        cameraId: activeCamera.id,
        goal,
        mimeType: file.type as 'image/jpeg' | 'image/png' | 'image/webp',
        base64Data,
        filename: file.name,
      });
      setNotice(`Uploaded frame "${file.name}" inspected and persisted with MEASURED / UPLOADED_IMAGE provenance.`);
      onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Uploaded image inspection failed.');
    } finally {
      setUploading(false);
      e.target.value = '';
    }
  };

  return (
    <div className="space-y-6">
      <ModuleHeader
        title="Vision Intelligence"
        subtitle="Multimodal visual equipment inspection, PPE verification, and uploaded frame ingestion. Offline RTSP cameras explicitly refuse live inspection."
        capability="PARTIALLY_FUNCTIONAL"
        dataMode="MIXED"
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
                  Camera Provider Channel
                </label>
                <select
                  id="vision-cam-select"
                  value={activeCamera?.id || ''}
                  onChange={(e) => {
                    setSelectedCameraId(e.target.value);
                    setError(null);
                    setNotice(null);
                  }}
                  className="px-3 py-2 rounded-md bg-[#0B0F17] border border-[#243044] text-xs text-slate-100"
                >
                  {data.cameras.map((cam) => (
                    <option key={cam.id} value={cam.id}>
                      {cam.name} [{cam.capabilityState || cam.status}]
                    </option>
                  ))}
                </select>
              </div>
              {activeCamera && (
                <div className="text-right text-xs font-mono">
                  <div className="flex items-center justify-end gap-2">
                    <span className="text-slate-400">Capability:</span>
                    <StatusText value={activeCamera.capabilityState || activeCamera.status} />
                  </div>
                  <div className="text-slate-400 mt-0.5">
                    {activeCamera.resolution} · {activeCamera.fps} FPS · {activeCamera.modelVersion}
                  </div>
                </div>
              )}
            </div>

            {activeCamera && (
              <div className="relative aspect-[4/3] w-full overflow-hidden rounded-md bg-[#0B0F17] border border-[#1E293B]">
                <CameraFrameImage
                  src={activeCamera.sampleImageUrl}
                  alt={activeCamera.name}
                  resolution={activeCamera.resolution}
                />
                <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/90 via-black/55 to-transparent p-4 flex flex-wrap items-center justify-between gap-2 text-xs">
                  <span className="font-mono text-slate-100">
                    {activeCamera.name} ({activeCamera.capabilityState || activeCamera.mode})
                  </span>
                  <span className="font-mono text-slate-300">{activeCamera.privacyPolicy}</span>
                </div>
              </div>
            )}

            {isCameraOffline && activeCamera && (
              <div className="p-3 rounded bg-amber-950/40 border border-amber-800/60 text-xs text-amber-200">
                <span className="font-semibold">{activeCamera.name} is {activeCamera.capabilityState || activeCamera.status}:</span>{' '}
                {activeCamera.lastError || 'Live RTSP/ONVIF stream is not attached.'} Upload a real local image frame below to inspect this zone manually.
              </div>
            )}

            <div className="flex flex-col sm:flex-row gap-3 pt-1">
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
                {running ? 'Inspecting...' : 'Inspect Camera Feed'}
              </button>
              <label className="px-4 py-2 rounded-md border border-[#243044] hover:border-sky-500 text-xs font-medium text-slate-200 flex items-center justify-center gap-2 whitespace-nowrap shrink-0 cursor-pointer">
                <Upload className="w-3.5 h-3.5" />
                <span>{uploading ? 'Uploading...' : 'Upload Frame'}</span>
                <input
                  type="file"
                  accept="image/jpeg,image/png,image/webp"
                  onChange={handleFileUpload}
                  disabled={uploading || !activeCamera}
                  className="sr-only"
                />
              </label>
            </div>

            {notice && (
              <div className="text-xs text-emerald-300 bg-emerald-950/40 border border-emerald-800 rounded p-2.5">
                {notice}
              </div>
            )}
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
            <div className="space-y-4 max-h-[540px] overflow-y-auto pr-1">
              {data.visionEvents.map((evt) => (
                <div key={evt.id} className="pb-4 border-b border-[#1E293B] last:border-b-0 space-y-2">
                  <div className="flex flex-wrap items-center justify-between gap-2 text-xs font-mono">
                    <StatusText value={evt.severity} />
                    <span className="text-slate-400">
                      {evt.captureSource || 'SAMPLE_IMAGE'} · {evt.inferenceEngine} · {(evt.confidence * 100).toFixed(0)}%
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

export function CameraManagementView({
  data,
  onRefresh,
}: {
  data: WorkspaceData;
  onRefresh: () => void;
}) {
  const [probingId, setProbingId] = useState<string | null>(null);
  const [probeMsg, setProbeMsg] = useState<string | null>(null);

  const handleProbe = async (cameraId: string) => {
    setProbingId(cameraId);
    setProbeMsg(null);
    try {
      const res = await vantaApi.probeCameraHealth(cameraId);
      setProbeMsg(`Camera ${res.cameraId} probe -> ${res.capabilityState} (${res.streamHealthPct}% health)${res.lastError ? `: ${res.lastError}` : ''}`);
      onRefresh();
    } catch (err) {
      setProbeMsg(err instanceof Error ? err.message : 'Camera probe failed.');
    } finally {
      setProbingId(null);
    }
  };

  return (
    <div className="space-y-6">
      <ModuleHeader
        title="Camera Management & Edge Ingestion"
        subtitle="Camera provider adapters, capability states (SAMPLE_IMAGE vs OFFLINE vs NOT_CONFIGURED), stream health probes, and biometric privacy boundaries."
        capability="PARTIALLY_FUNCTIONAL"
        dataMode="MIXED"
      />

      <div className="bg-[#111827] border border-[#1E293B] rounded-lg p-4 flex items-center gap-3 text-xs text-slate-300">
        <ShieldAlert className="w-4 h-4 text-sky-400 shrink-0" />
        <span>
          Architectural Privacy & Honesty Policy: Facial recognition is disabled across all cameras. RTSP/ONVIF cameras unreachable in container runtime report OFFLINE rather than faking live feeds.
        </span>
      </div>

      {probeMsg && (
        <div className="px-4 py-2.5 rounded-md bg-[#111827] border border-sky-800/60 text-xs font-mono text-sky-200">
          {probeMsg}
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 gap-5">
        {data.cameras.map((cam) => (
          <div key={cam.id} className="bg-[#111827] border border-[#1E293B] rounded-lg overflow-hidden">
            <div className="aspect-[16/9] bg-[#0B0F17] relative">
              <CameraFrameImage
                src={cam.sampleImageUrl}
                alt={cam.name}
                resolution={cam.resolution}
              />
              <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/85 to-transparent p-3 flex items-center justify-between text-xs font-mono">
                <span className="text-white flex items-center gap-1.5">
                  <CameraIcon className="w-3.5 h-3.5" />
                  {cam.id}
                </span>
                <StatusText value={cam.capabilityState || cam.mode} />
              </div>
            </div>
            <div className="p-4 space-y-2.5">
              <div className="flex items-center justify-between gap-2">
                <h2 className="text-sm font-semibold text-slate-100">{cam.name}</h2>
                <button
                  type="button"
                  disabled={probingId === cam.id}
                  onClick={() => handleProbe(cam.id)}
                  className="px-2.5 py-1 rounded border border-[#243044] hover:border-sky-500 text-[11px] font-mono text-slate-200 flex items-center gap-1"
                >
                  <RefreshCw className="w-3 h-3" />
                  {probingId === cam.id ? 'Probing...' : 'Probe Health'}
                </button>
              </div>
              <div className="grid grid-cols-2 gap-2 text-xs font-mono text-slate-400">
                <div>Provider: {cam.providerType || cam.streamProtocol}</div>
                <div>Health: {cam.streamHealthPct ?? (cam.status === 'OFFLINE' ? 0 : 100)}%</div>
                <div>Model: {cam.modelVersion}</div>
                <div>Threshold: {(cam.confidenceThreshold * 100).toFixed(0)}%</div>
              </div>
              {cam.lastError && (
                <div className="text-[11px] font-mono text-amber-300 bg-amber-950/30 border border-amber-900/50 rounded px-2.5 py-1.5">
                  {cam.lastError}
                </div>
              )}
              <p className="text-xs text-slate-400 pt-2 border-t border-[#1E293B]">{cam.privacyPolicy}</p>
            </div>
          </div>
        ))}
      </div>
    </div>
  );
}
