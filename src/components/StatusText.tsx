/**
 * Clean unboxed status labels and SVG telemetry line charts (Zero-Pill discipline).
 */

import React from 'react';
import type { CapabilityState, DataOriginMode } from '../core/types';

const STATUS_COLOR_MAP: Record<string, string> = {
  NOMINAL: 'text-emerald-400',
  OPERATIONAL: 'text-emerald-400',
  ONLINE: 'text-emerald-400',
  FUNCTIONAL: 'text-emerald-400',
  APPROVED: 'text-emerald-400',
  RESOLVED: 'text-emerald-400',
  VERIFIED: 'text-emerald-400',
  COMPLETED: 'text-emerald-400',
  MEASURED: 'text-emerald-400',
  OBSERVED: 'text-emerald-300',
  SYSTEM_RECORDED: 'text-teal-300',
  VALIDATED: 'text-teal-300',
  HUMAN_REPORTED: 'text-amber-300',
  SUCCESS: 'text-emerald-400',

  WARNING: 'text-amber-400',
  HIGH: 'text-amber-400',
  MEDIUM: 'text-amber-300',
  INVESTIGATING: 'text-amber-400',
  PENDING: 'text-amber-400',
  PENDING_APPROVAL: 'text-amber-400',
  PENDING_VERIFICATION: 'text-amber-300',
  VERIFICATION_PENDING: 'text-amber-300',
  UNVERIFIED: 'text-amber-400',
  NEEDS_FOLLOW_UP: 'text-amber-400',
  AWAITING_APPROVAL: 'text-amber-400',
  PARTIALLY_FUNCTIONAL: 'text-amber-400',
  IN_PROGRESS: 'text-sky-400',
  SIMULATED: 'text-sky-400',
  SIMULATED_SYNTHETIC: 'text-sky-400',
  ESTIMATED: 'text-sky-300',
  INFERRED: 'text-indigo-300',
  PREDICTED: 'text-violet-300',
  UNKNOWN: 'text-slate-400',

  CRITICAL: 'text-rose-400',
  OFFLINE: 'text-rose-400',
  REJECTED: 'text-rose-400',
  UNRESOLVED: 'text-rose-400',
  DENIED: 'text-rose-400',
  BLOCKED_SAFETY: 'text-rose-400',
  FAILED: 'text-rose-400',

  CANCELLED: 'text-slate-400',
  NOT_CONFIGURED: 'text-slate-400',
  PLANNED: 'text-slate-400',
  INFO: 'text-slate-300',
  LOW: 'text-slate-300',
  OPEN: 'text-amber-400',
};

export function StatusText({
  value,
  prefix,
}: {
  value: string;
  prefix?: string;
}) {
  const color = STATUS_COLOR_MAP[value] || 'text-slate-300';
  return (
    <span className={`font-mono text-xs font-medium tracking-wide whitespace-nowrap ${color}`}>
      {prefix ? `${prefix}: ` : ''}
      {value.replace(/_/g, ' ')}
    </span>
  );
}

export function ModuleHeader({
  title,
  subtitle,
  capability,
  dataMode,
  actions,
}: {
  title: string;
  subtitle: string;
  capability: CapabilityState;
  dataMode?: DataOriginMode | 'MIXED';
  actions?: React.ReactNode;
}) {
  return (
    <div className="flex flex-col gap-3 pb-5 border-b border-[#1E293B] md:flex-row md:items-end md:justify-between">
      <div className="space-y-1">
        <div className="flex flex-wrap items-center gap-2 text-xs text-slate-400 font-mono">
          <StatusText value={capability} prefix="STATE" />
          {dataMode && (
            <>
              <span aria-hidden="true">·</span>
              <span className="text-slate-300">DATA: {dataMode}</span>
            </>
          )}
        </div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-100 text-balance">{title}</h1>
        <p className="text-sm text-slate-400 max-w-3xl">{subtitle}</p>
      </div>
      {actions && <div className="flex items-center gap-3 shrink-0">{actions}</div>}
    </div>
  );
}

export function TelemetryChart({
  values,
  unit,
  warnThreshold,
  critThreshold,
  height = 120,
}: {
  values: Array<{ label: string; value: number; isAnomaly?: boolean }>;
  unit: string;
  warnThreshold?: number;
  critThreshold?: number;
  height?: number;
}) {
  if (values.length === 0) {
    return (
      <div className="h-28 flex items-center justify-center text-xs text-slate-500 border border-[#1E293B] rounded-md">
        No telemetry points in selected scope
      </div>
    );
  }

  const width = 480;
  const padX = 16;
  const padY = 14;
  const nums = values.map((v) => v.value);
  if (warnThreshold !== undefined) nums.push(warnThreshold);
  if (critThreshold !== undefined) nums.push(critThreshold);
  const min = Math.min(...nums) * 0.92;
  const max = Math.max(...nums) * 1.06;
  const span = Math.max(max - min, 1);

  const toX = (i: number) =>
    values.length === 1
      ? width / 2
      : padX + (i / (values.length - 1)) * (width - padX * 2);
  const toY = (val: number) =>
    height - padY - ((val - min) / span) * (height - padY * 2);

  const pathD = values
    .map((pt, i) => `${i === 0 ? 'M' : 'L'} ${toX(i).toFixed(1)} ${toY(pt.value).toFixed(1)}`)
    .join(' ');

  return (
    <div className="w-full">
      <svg
        viewBox={`0 0 ${width} ${height}`}
        className="w-full h-auto overflow-visible"
        role="img"
        aria-label={`Telemetry trend chart in ${unit}`}
      >
        {warnThreshold !== undefined && (
          <line
            x1={padX}
            x2={width - padX}
            y1={toY(warnThreshold)}
            y2={toY(warnThreshold)}
            stroke="#D97706"
            strokeDasharray="4 4"
            strokeOpacity="0.6"
            strokeWidth="1"
          />
        )}
        {critThreshold !== undefined && (
          <line
            x1={padX}
            x2={width - padX}
            y1={toY(critThreshold)}
            y2={toY(critThreshold)}
            stroke="#DC2626"
            strokeDasharray="3 3"
            strokeOpacity="0.7"
            strokeWidth="1"
          />
        )}
        <path d={pathD} fill="none" stroke="#3B82F6" strokeWidth="2" strokeLinejoin="round" />
        {values.map((pt, i) => (
          <circle
            key={`${pt.label}-${i}`}
            cx={toX(i)}
            cy={toY(pt.value)}
            r={pt.isAnomaly ? 4.5 : 3}
            fill={pt.isAnomaly ? '#F43F5E' : '#60A5FA'}
            stroke="#0B0F17"
            strokeWidth="1.5"
          />
        ))}
      </svg>
      <div className="flex items-center justify-between text-[11px] font-mono text-slate-400 pt-1 tabular-nums">
        <span>{values[0]?.label}</span>
        <span>
          Latest: {values[values.length - 1]?.value} {unit}
        </span>
        <span>{values[values.length - 1]?.label}</span>
      </div>
    </div>
  );
}
