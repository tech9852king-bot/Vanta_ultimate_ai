import React, { useState } from 'react';
import {
  Send,
  CheckCircle2,
  AlertTriangle,
  HelpCircle,
  Wrench,
  TrendingUp,
  ShieldAlert,
} from 'lucide-react';
import { vantaApi } from '../api/client';
import type { BrainAnalysisResponse, NavigationSection } from '../core/types';
import type { WorkspaceData } from '../types/workspace';
import { ModuleHeader, StatusText } from './StatusText';

const SAMPLE_PROMPTS = [
  'Why is production efficiency declining in Facility A?',
  'Summarize open incidents and upstream equipment dependencies across our facilities.',
  'Audit our measured vs simulated energy consumption and identify peak demand risks.',
];

export function VantaBrainView({
  data,
  selectedFacilityId,
  onNavigate,
  onRefresh,
}: {
  data: WorkspaceData;
  selectedFacilityId: string;
  onNavigate: (section: NavigationSection) => void;
  onRefresh: () => void;
}) {
  const [prompt, setPrompt] = useState(SAMPLE_PROMPTS[0]);
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [history, setHistory] = useState<BrainAnalysisResponse[]>([]);

  const handleAnalyze = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!prompt.trim()) return;
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

  return (
    <div className="space-y-6">
      <ModuleHeader
        title="VANTA Brain — Infrastructure Reasoning Engine"
        subtitle="10-stage evidence-backed reasoning powered by server-side Gemini tool calling, facility-scoped authorization, and strict server citation validation."
        capability="FUNCTIONAL"
        dataMode="MIXED"
        actions={
          <button
            type="button"
            onClick={() => onNavigate('root-cause-analysis')}
            className="px-3.5 py-2 rounded-md border border-[#243044] hover:border-slate-500 text-xs font-medium text-slate-200 whitespace-nowrap"
          >
            Open Root Cause Dossiers ({data.rootCauseInvestigations.length})
          </button>
        }
      />

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
            Submit a query above. VANTA Brain retrieves facility-authorized records, validates every
            evidence citation server-side, separates Measured vs Simulated claims, and flags explicit unknowns.
          </p>
        </div>
      ) : (
        <div className="space-y-6">
          {history.map((res, idx) => (
            <article key={`${res.createdAt}-${idx}`} className="bg-[#111827] border border-[#1E293B] rounded-lg p-6 space-y-5">
              <div className="flex flex-wrap items-center justify-between gap-2 border-b border-[#1E293B] pb-3">
                <div>
                  <h2 className="text-base font-semibold text-white">{res.query}</h2>
                  <div className="text-[11px] font-mono text-sky-400 mt-0.5">
                    INTENT: {res.intent || 'GENERAL_STATUS'} · MODEL: {res.modelId || res.engineUsed}
                    {res.latencyMs !== undefined ? ` · ${res.latencyMs}ms` : ''}
                  </div>
                </div>
                <div className="flex flex-wrap items-center gap-3 text-xs font-mono text-slate-400">
                  <span>ENGINE: {res.engineUsed}</span>
                  <span aria-hidden="true">·</span>
                  <span>TOOLS: {res.toolsCalled.join(', ')}</span>
                </div>
              </div>

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

              <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
                <div className="space-y-2.5">
                  <div className="flex items-center gap-2 text-xs font-semibold text-emerald-400">
                    <CheckCircle2 className="w-4 h-4" />
                    Verified Facts (Server-Validated Citations)
                  </div>
                  <ul className="space-y-2 text-xs text-slate-200">
                    {res.verifiedFacts.map((fact, i) => (
                      <li key={i} className="pb-2 border-b border-[#1E293B] last:border-b-0">
                        <div>{fact.claim}</div>
                        <div className="font-mono text-[11px] text-slate-400 mt-0.5 flex flex-wrap gap-2">
                          <span>Source: {fact.sourceId}</span>
                          <span>· {fact.module}</span>
                          {fact.dataMode && <span>· Mode: {fact.dataMode}</span>}
                        </div>
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="space-y-4">
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 text-xs font-semibold text-sky-400">
                      <AlertTriangle className="w-4 h-4" />
                      Observations
                    </div>
                    <ul className="list-disc pl-4 space-y-1 text-xs text-slate-300">
                      {res.observations.map((obs, i) => (
                        <li key={i}>{obs}</li>
                      ))}
                    </ul>
                  </div>

                  <div className="space-y-2 pt-3 border-t border-[#1E293B]">
                    <div className="flex items-center gap-2 text-xs font-semibold text-amber-400">
                      <HelpCircle className="w-4 h-4" />
                      Assumptions & Hypotheses
                    </div>
                    <ul className="list-disc pl-4 space-y-1 text-xs text-slate-300">
                      {res.assumptionsAndHypotheses.map((hyp, i) => (
                        <li key={i}>{hyp}</li>
                      ))}
                    </ul>
                  </div>
                </div>
              </div>

              {(res.predictions?.length || res.unknowns?.length) ? (
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
                  {res.unknowns && res.unknowns.length > 0 && (
                    <div className="space-y-1.5">
                      <div className="font-semibold text-slate-300">Explicit Unknowns & Blind Spots</div>
                      <ul className="list-disc pl-4 space-y-1 text-slate-400">
                        {res.unknowns.map((u, i) => (
                          <li key={i}>{u}</li>
                        ))}
                      </ul>
                    </div>
                  )}
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
    </div>
  );
}
