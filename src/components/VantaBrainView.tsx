import React, { useState } from 'react';
import {
  Send,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  Wrench,
  TrendingUp,
  ShieldAlert,
  Cpu,
  Clock,
} from 'lucide-react';
import { vantaApi } from '../api/client';
import {
  countEvidenceByClassification,
  VALID_EVIDENCE_CLASSIFICATIONS,
} from '../core/intelligence';
import type {
  BrainAnalysisResponse,
  GeminiProviderVerificationReport,
  NavigationSection,
} from '../core/types';
import type { SystemHealthStatus, WorkspaceData } from '../types/workspace';
import { ModuleHeader, StatusText } from './StatusText';

const SAMPLE_PROMPTS = [
  'Why is production efficiency declining in Facility A?',
  'Summarize open incidents and upstream equipment dependencies across our facilities.',
  'Audit our measured vs simulated energy consumption and identify peak demand risks.',
];

export function VantaBrainView({
  data,
  health,
  selectedFacilityId,
  onNavigate,
  onRefresh,
}: {
  data: WorkspaceData;
  health?: SystemHealthStatus | null;
  selectedFacilityId: string;
  onNavigate: (section: NavigationSection) => void;
  onRefresh: () => void;
}) {
  const [prompt, setPrompt] = useState(SAMPLE_PROMPTS[0]);
  const [loading, setLoading] = useState(false);
  const [verifyingProvider, setVerifyingProvider] = useState(false);
  const [providerReport, setProviderReport] = useState<GeminiProviderVerificationReport | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<BrainAnalysisResponse[]>([]);

  const geminiLiveReady = Boolean(health?.geminiConfigured && health?.geminiModelValid !== false);
  const capabilityState = geminiLiveReady ? 'FUNCTIONAL' : 'PARTIALLY_FUNCTIONAL';

  const handleAnalyze = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim() || loading) return;
    setLoading(true);
    setError(null);
    try {
      const result = await vantaApi.queryBrain(prompt.trim(), selectedFacilityId);
      setHistory((prev) => [result, ...prev]);
      onRefresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'VANTA Brain query failed.');
    } finally {
      setLoading(false);
    }
  };

  const handleVerifyProvider = async () => {
    if (verifyingProvider) return;
    setVerifyingProvider(true);
    setError(null);
    try {
      const report = await vantaApi.verifyBrainProvider();
      setProviderReport(report);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Provider verification check failed.');
    } finally {
      setVerifyingProvider(false);
    }
  };

  return (
    <div className="space-y-6">
      <ModuleHeader
        title="VANTA Brain — Infrastructure Reasoning Engine"
        subtitle="13-stage evidence-backed investigation pipeline powered by server-side Gemini tool calling, facility-scoped authorization, and strict server citation validation."
        capability={capabilityState}
        dataMode="MIXED"
        actions={
          <div className="flex flex-wrap items-center gap-2">
            <button
              type="button"
              onClick={handleVerifyProvider}
              disabled={verifyingProvider}
              className="px-3.5 py-2 rounded-md border border-sky-500/40 bg-sky-950/30 hover:bg-sky-900/40 disabled:opacity-60 text-xs font-medium text-sky-300 whitespace-nowrap"
            >
              {verifyingProvider ? 'Verifying Gemini Provider...' : 'Verify Live Provider'}
            </button>
            <button
              type="button"
              onClick={() => onNavigate('root-cause-analysis')}
              className="px-3.5 py-2 rounded-md border border-[#243044] hover:border-slate-500 text-xs font-medium text-slate-200 whitespace-nowrap"
            >
              Open Root Cause Dossiers ({data.rootCauseInvestigations.length})
            </button>
          </div>
        }
      />

      {/* Runtime Provider & Model Governance Bar */}
      <div className="bg-[#111827] border border-[#1E293B] rounded-lg p-4 flex flex-col lg:flex-row lg:items-center lg:justify-between gap-3 text-xs">
        <div className="flex flex-wrap items-center gap-3">
          <span className="inline-flex items-center gap-1.5 font-mono text-[11px] text-slate-300">
            <Cpu className="w-3.5 h-3.5 text-sky-400" />
            PROVIDER:
            <span className={geminiLiveReady ? 'text-emerald-400 font-semibold' : 'text-amber-400 font-semibold'}>
              {geminiLiveReady ? 'GEMINI_API_CONFIGURED' : 'GEMINI_KEY_UNSET (DETERMINISTIC_FALLBACK_ACTIVE)'}
            </span>
          </span>
          <span className="text-slate-600" aria-hidden="true">|</span>
          <span className="font-mono text-[11px] text-slate-300">
            MODEL: <span className="text-sky-400">{health?.geminiModelId || 'gemini-4-hydrogen'}</span>
            {health?.geminiModelValid === false && (
              <span className="ml-1.5 text-rose-400">[UNSUPPORTED_MODEL_ID]</span>
            )}
          </span>
          <span className="text-slate-600" aria-hidden="true">|</span>
          <span className="inline-flex items-center gap-1 font-mono text-[11px] text-slate-400">
            <Clock className="w-3 h-3" />
            TIMEOUT: {health?.geminiTimeoutMs ?? 15000}ms
          </span>
        </div>
        <div className="text-[11px] text-slate-400">
          {geminiLiveReady
            ? 'Live server-side Gemini synthesis active with automatic deterministic fallback on transient provider failure.'
            : 'GEMINI_API_KEY is not set in server environment; queries execute deterministic SQLite evidence synthesis with full citation validation.'}
        </div>
      </div>

      {providerReport && (
        <div className="bg-[#111827] border border-[#1E293B] rounded-lg p-4 space-y-3 text-xs">
          <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1E293B] pb-2">
            <div className="font-mono text-[11px] text-slate-200 flex items-center gap-2">
              <span>GEMINI PROVIDER 4-STEP VERIFICATION:</span>
              <span
                className={
                  providerReport.overallStatus === 'VERIFIED_LIVE'
                    ? 'text-emerald-400 font-semibold'
                    : 'text-amber-400 font-semibold'
                }
              >
                {providerReport.overallStatus}
              </span>
              <span className="text-slate-500">·</span>
              <span className="text-sky-400">{providerReport.modelId}</span>
            </div>
            <div className="font-mono text-[11px] text-slate-400">
              DURATION: {providerReport.totalDurationMs}ms · TIMEOUT_BUDGET: {providerReport.timeoutMs}ms
            </div>
          </div>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
            {providerReport.steps.map((s) => (
              <div key={s.step} className="p-2.5 rounded border border-[#1E293B] bg-[#0B0F17] space-y-1">
                <div className="flex items-center justify-between font-mono text-[11px]">
                  <span className="text-sky-400">
                    {s.step}. {s.name}
                  </span>
                  <span
                    className={
                      s.status === 'PASSED'
                        ? 'text-emerald-400'
                        : s.status === 'FAILED'
                        ? 'text-rose-400'
                        : 'text-slate-400'
                    }
                  >
                    {s.status} ({s.durationMs}ms)
                  </span>
                </div>
                <div className="text-[11px] text-slate-400">{s.detail}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      <form onSubmit={handleAnalyze} className="bg-[#111827] border border-[#1E293B] rounded-lg p-5 space-y-4">
        <label htmlFor="brain-query-input" className="block text-xs font-medium text-slate-300">
          Operational Investigation Query (scoped to{' '}
          {selectedFacilityId === 'ALL' ? 'authorized facility scope' : selectedFacilityId})
        </label>
        <div className="flex flex-col sm:flex-row gap-3">
          <input
            id="brain-query-input"
            type="text"
            value={prompt}
            onChange={(e) => setPrompt(e.target.value)}
            placeholder="Ask VANTA Brain to investigate production efficiency, anomalies, energy, or maintenance..."
            className="flex-1 px-4 py-2.5 rounded-md bg-[#0B0F17] border border-[#243044] text-sm text-slate-100 focus:outline-none focus:border-sky-500"
          />
          <button
            type="submit"
            disabled={loading}
            className="px-5 py-2.5 rounded-md bg-sky-600 hover:bg-sky-500 disabled:opacity-60 text-xs font-medium text-white flex items-center justify-center gap-2 whitespace-nowrap shrink-0"
          >
            <Send className="w-3.5 h-3.5" />
            {loading ? 'Investigating Evidence...' : 'Run Evidence Analysis'}
          </button>
        </div>

        <div className="flex flex-wrap items-center gap-2 pt-1">
          <span className="text-xs text-slate-400">Sample queries:</span>
          {SAMPLE_PROMPTS.map((sample) => (
            <button
              key={sample}
              type="button"
              onClick={() => setPrompt(sample)}
              className="text-xs text-sky-400 hover:text-sky-300 underline-offset-2 hover:underline text-left"
            >
              {sample}
            </button>
          ))}
        </div>
      </form>

      {error && (
        <div role="alert" className="px-4 py-3 rounded-md bg-rose-950/50 border border-rose-800 text-xs text-rose-200">
          {error}
        </div>
      )}

      {history.length === 0 ? (
        <div className="bg-[#111827] border border-[#1E293B] rounded-lg p-8 text-center space-y-2">
          <h2 className="text-sm font-medium text-slate-200">Ready for Evidence-Backed Investigation</h2>
          <p className="text-xs text-slate-400 max-w-xl mx-auto">
            Submit a query above. VANTA Brain executes its 13-stage investigation pipeline across facility-authorized records,
            validates every evidence citation server-side, separates Measured vs Estimated vs Simulated claims, and flags explicit unknowns.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {history.map((res, idx) => (
            <article key={`${res.executionId || res.createdAt}-${idx}`} className="bg-[#111827] border border-[#1E293B] rounded-lg p-6 space-y-5">
              <div className="flex flex-wrap items-start justify-between gap-3 border-b border-[#1E293B] pb-3">
                <div className="space-y-1">
                  <h2 className="text-base font-semibold text-white">{res.query}</h2>
                  <div className="text-[11px] font-mono text-sky-400 flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span>INTENT: {res.intent || 'GENERAL_STATUS'}</span>
                    <span>·</span>
                    <span>STATUS: {res.executionStatus || (res.engineUsed === 'GEMINI_4_HYDROGEN' ? 'GEMINI_SUCCESS' : 'DETERMINISTIC_FALLBACK')}</span>
                    <span>·</span>
                    <span>PROVIDER: {res.providerStatus || 'NOT_CONFIGURED'}</span>
                    {res.failureCategory && (
                      <>
                        <span>·</span>
                        <span className="text-amber-300">REASON: {res.failureCategory}</span>
                      </>
                    )}
                    {res.retryCount !== undefined && res.retryCount > 0 && (
                      <>
                        <span>·</span>
                        <span>RETRIES: {res.retryCount}</span>
                      </>
                    )}
                    {res.latencyMs !== undefined && (
                      <>
                        <span>·</span>
                        <span>{res.latencyMs}ms</span>
                      </>
                    )}
                  </div>
                </div>
                <div className="flex flex-col items-end gap-1 text-xs font-mono text-slate-400">
                  <div>
                    ENGINE: <span className="text-slate-200">{res.engineUsed}</span> ({res.modelId || res.engineUsed})
                  </div>
                  <div className="text-[11px] text-slate-500">
                    {res.executionId && <span>RUN: {res.executionId} · </span>}
                    {res.correlationId && <span>CORR: {res.correlationId}</span>}
                  </div>
                </div>
              </div>

              {/* Heuristic Evidence Strength & Data Freshness Disclosure */}
              {(() => {
                const breakdown = res.evidenceBreakdown || countEvidenceByClassification(res.verifiedFacts);
                return (
                  <div className="p-3 rounded-md bg-[#0B0F17] border border-[#1E293B] space-y-2 text-xs">
                    <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-2">
                      <div>
                        <span className="font-mono text-[11px] text-emerald-400 font-semibold">
                          EVIDENCE STRENGTH: {res.confidence ?? 50}/100 ({res.confidenceLabel || 'MODERATE_EVIDENCE_CORROBORATION'})
                        </span>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          {res.confidenceMethodology || 'Heuristic Evidence-Strength Indicator (not a calibrated statistical probability).'}
                        </div>
                      </div>
                      <div className="font-mono text-[11px] text-slate-400 shrink-0">
                        {res.dataFreshnessSummary}
                        {res.omittedEvidenceCount ? ` · OMITTED_FOR_BUDGET: ${res.omittedEvidenceCount}` : ''}
                      </div>
                    </div>
                    <div
                      className="flex flex-wrap items-center gap-x-3 gap-y-1 pt-2 border-t border-[#1E293B] font-mono text-[11px] text-slate-400"
                      data-testid="brain-evidence-breakdown"
                    >
                      <span className="text-slate-500">9-CLASS BREAKDOWN:</span>
                      {VALID_EVIDENCE_CLASSIFICATIONS.map((cls) => (
                        <span
                          key={cls}
                          className={breakdown[cls] > 0 ? 'text-slate-200' : 'text-slate-600'}
                        >
                          {cls}: {breakdown[cls] ?? 0}
                        </span>
                      ))}
                    </div>
                  </div>
                );
              })()}

              {/* Per-Tool Execution Diagnostics */}
              {res.toolResults && res.toolResults.length > 0 && (
                <div className="space-y-1.5">
                  <div className="text-[11px] font-mono text-slate-400">
                    AUTHORIZED TOOL EXECUTION DIAGNOSTICS ({res.toolResults.filter((t) => t.status === 'COMPLETED').length}/{res.toolResults.length} COMPLETED)
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {res.toolResults.map((tr) => (
                      <div
                        key={tr.toolName}
                        className={`px-2.5 py-1 rounded border text-[11px] font-mono ${
                          tr.status === 'COMPLETED'
                            ? 'border-emerald-800/60 bg-emerald-950/20 text-emerald-300'
                            : 'border-rose-800/70 bg-rose-950/30 text-rose-300'
                        }`}
                      >
                        {tr.toolName}: {tr.status} ({tr.recordsRetrieved ?? tr.recordCount} rec · {tr.durationMs}ms)
                        {tr.error ? ` — ${tr.error}` : ''}
                      </div>
                    ))}
                  </div>
                </div>
              )}

              {res.situationSummary && (
                <div className="p-3.5 rounded-md bg-[#0B0F17] border border-[#1E293B] text-xs text-slate-200">
                  <span className="font-mono text-[10px] text-sky-400 uppercase tracking-wider block mb-1">
                    Situation Summary
                  </span>
                  {res.situationSummary}
                </div>
              )}

              {res.rejectedCitations && res.rejectedCitations.length > 0 && (
                <div className="p-3 rounded-md bg-amber-950/40 border border-amber-800/70 text-xs text-amber-200 flex items-start gap-2">
                  <ShieldAlert className="w-4 h-4 shrink-0 mt-0.5 text-amber-400" />
                  <div>
                    <div className="font-semibold">
                      Server Citation Validator stripped {res.rejectedCitations.length} unverified citation(s)
                    </div>
                    <div className="text-[11px] text-amber-300/90 mt-0.5">
                      Unverified IDs removed before output so only facility-authorized SQLite records are presented.
                    </div>
                  </div>
                </div>
              )}

              {res.investigationStages && res.investigationStages.length > 0 && (
                <div className="p-3.5 rounded-md bg-[#0B0F17] border border-[#1E293B] space-y-2">
                  <div className="flex items-center justify-between text-[11px] font-mono text-slate-300">
                    <span>13-STAGE EVIDENCE INVESTIGATION PIPELINE</span>
                    <span className="text-emerald-400">
                      {res.investigationStages.filter((s) => s.status === 'COMPLETED').length}/
                      {res.investigationStages.length} STAGES COMPLETED
                    </span>
                  </div>
                  <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-2">
                    {res.investigationStages.map((stg) => (
                      <div
                        key={stg.stage}
                        className="p-2 rounded border border-[#1E293B] bg-[#111827]/70 text-[11px]"
                      >
                        <div className="flex items-center justify-between gap-1 font-mono">
                          <span className="text-sky-400 truncate">
                            {stg.stage}. {stg.name}
                          </span>
                          <span
                            className={`text-[10px] ${
                              stg.status === 'COMPLETED'
                                ? 'text-emerald-400'
                                : stg.status === 'DEGRADED'
                                ? 'text-amber-400'
                                : 'text-rose-400'
                            }`}
                          >
                            {stg.status}
                          </span>
                        </div>
                        <div className="text-slate-400 truncate mt-0.5" title={stg.detail}>
                          {stg.detail}
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="space-y-2.5">
                  <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400">
                    <CheckCircle2 className="w-4 h-4" />
                    Verified Facts (Server-Validated Citations)
                  </div>
                  {res.verifiedFacts.length === 0 ? (
                    <div className="text-xs text-slate-400 italic">
                      No matching verified evidence citations in this scope.
                    </div>
                  ) : (
                    <ul className="space-y-2 text-xs text-slate-200">
                      {res.verifiedFacts.map((fact, i) => (
                        <li key={i} className="pb-2 border-b border-[#1E293B] last:border-b-0">
                          <div>{fact.claim}</div>
                          <div className="font-mono text-[11px] text-slate-400 mt-0.5 flex flex-wrap gap-2">
                            <span>Source: {fact.sourceId}</span>
                            <span>· {fact.module}</span>
                            {(fact.evidenceClass || fact.dataMode) && (
                              <span>· Class: {fact.evidenceClass || fact.dataMode}</span>
                            )}
                          </div>
                        </li>
                      ))}
                    </ul>
                  )}
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-xs font-semibold text-sky-400">
                      <AlertTriangle className="w-4 h-4" />
                      Observations & Detected Anomalies
                    </div>
                    <ul className="list-disc pl-4 space-y-1 text-xs text-slate-300">
                      {res.observations.map((obs, i) => (
                        <li key={i}>{obs}</li>
                      ))}
                      {res.anomalies?.map((anom, i) => (
                        <li key={`anom-${i}`} className="text-amber-300 font-mono text-[11px]">
                          [ANOMALY] {anom}
                        </li>
                      ))}
                    </ul>
                  </div>

                  <div className="space-y-2 pt-3 border-t border-[#1E293B]">
                    <div className="flex items-center gap-2 text-xs font-semibold text-amber-400">
                      <HelpCircle className="w-4 h-4" />
                      Candidate Causes & Hypotheses
                    </div>
                    <ul className="list-disc pl-4 space-y-1 text-xs text-slate-300">
                      {(res.candidateCauses || res.assumptionsAndHypotheses).map((hyp, i) => (
                        <li key={i}>{hyp}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>

              {(res.predictions?.length || res.unknowns?.length || res.contradictoryEvidence?.length) ? (
                <div className="grid grid-cols-1 lg:grid-cols-2 gap-6 pt-3 border-t border-[#1E293B] text-xs">
                  {res.predictions && res.predictions.length > 0 && (
                    <div className="space-y-1.5">
                      <div className="flex items-center gap-1.5 font-semibold text-indigo-300">
                        <TrendingUp className="w-4 h-4" />
                        Risk Projections & Predictions
                      </div>
                      <ul className="list-disc pl-4 space-y-1 text-slate-300">
                        {res.predictions.map((p, i) => (
                          <li key={i}>{p}</li>
                        ))}
                      </ul>
                    </div>
                  )}
                  <div className="space-y-2">
                    {res.unknowns && res.unknowns.length > 0 && (
                      <div className="space-y-1">
                        <div className="font-semibold text-slate-300">Explicit Unknowns & Blind Spots</div>
                        <ul className="list-disc pl-4 space-y-1 text-slate-400">
                          {res.unknowns.map((u, i) => (
                            <li key={i}>{u}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                    {res.contradictoryEvidence && res.contradictoryEvidence.length > 0 && (
                      <div className="space-y-1 pt-1">
                        <div className="font-semibold text-slate-300">Contradictory / Alternative Checks</div>
                        <ul className="list-disc pl-4 space-y-1 text-slate-400">
                          {res.contradictoryEvidence.map((c, i) => (
                            <li key={i}>{c}</li>
                          ))}
                        </ul>
                      </div>
                    )}
                  </div>
                </div>
              ) : null}

              <div className="pt-4 border-t border-[#1E293B] space-y-3">
                <div className="flex items-center gap-2 text-xs font-semibold text-slate-100">
                  <Wrench className="w-4 h-4 text-sky-400" />
                  Evidence-Backed Recommendations
                </div>
                <div className="space-y-2">
                  {res.recommendations.map((rec, i) => (
                    <div key={i} className="p-3.5 rounded-md bg-[#0B0F17] border border-[#1E293B] space-y-1">
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-xs font-medium text-slate-100">{rec.action}</span>
                        <div className="flex items-center gap-3 text-xs font-mono">
                          <StatusText value={rec.priority} />
                          <span className="text-slate-400">
                            {rec.requiresHumanApproval ? 'REQUIRES HUMAN APPROVAL' : 'ADVISORY'}
                          </span>
                        </div>
                      </div>
                      <p className="text-xs text-slate-400">{rec.rationale}</p>
                    </div>
                  ))}
                </div>
                <div className="text-[11px] font-mono text-slate-400">{res.uncertaintyNote}</div>
              </div>
            </article>
          ))}
        </div>
      )}

      {/* Persisted VANTA Brain Execution Ledger */}
      {data.brainRuns && data.brainRuns.length > 0 && (
        <div className="bg-[#111827] border border-[#1E293B] rounded-lg p-5 space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-xs font-semibold uppercase tracking-wider text-slate-300">
              Persisted VANTA Brain Execution Audit Ledger ({data.brainRuns.length})
            </h3>
            <span className="text-[11px] font-mono text-slate-400">SQLite Table: brain_runs</span>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse text-xs">
              <thead>
                <tr className="border-b border-[#1E293B] text-[11px] font-mono text-slate-400">
                  <th className="py-2 pr-3">Run ID</th>
                  <th className="py-2 pr-3">Query</th>
                  <th className="py-2 pr-3">Intent</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 pr-3">Provider</th>
                  <th className="py-2 pr-3">Engine / Model</th>
                  <th className="py-2 pr-3">Citations</th>
                  <th className="py-2 pr-3">Latency</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-[#1E293B]/60 font-mono text-[11px]">
                {data.brainRuns.map((run) => (
                  <tr key={run.id} className="text-slate-300">
                    <td className="py-2 pr-3 text-sky-400 whitespace-nowrap">{run.id}</td>
                    <td className="py-2 pr-3 font-sans text-xs text-slate-200 max-w-xs truncate" title={run.query}>
                      {run.query}
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap">{run.intent}</td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      <StatusText value={run.executionStatus} />
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap text-slate-400">
                      {run.providerStatus}
                      {run.failureCategory ? ` (${run.failureCategory})` : ''}
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap text-slate-400">{run.modelId}</td>
                    <td className="py-2 pr-3 whitespace-nowrap">
                      {run.verifiedFactsCount} verified / {run.rejectedCitationsCount} stripped
                    </td>
                    <td className="py-2 pr-3 whitespace-nowrap text-slate-400">{run.latencyMs}ms</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
}
