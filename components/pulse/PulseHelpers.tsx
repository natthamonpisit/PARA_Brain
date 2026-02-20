// ─── World Pulse — Shared Helpers ─────────────────────────────────────────────
// Constants, badge configs, formatters, and the reusable HelpTip component.

import React from 'react';
import type { PulseRegion } from '../../services/thailandPulseService';

// ─── HelpTip ──────────────────────────────────────────────────────────────────

export const HelpTip: React.FC<{ th: string; en: string; className?: string }> = ({ th, en, className }) => (
  <span className={`group relative inline-flex shrink-0 ${className || ''}`}>
    <button
      type="button"
      className="inline-flex h-4 w-4 items-center justify-center rounded-full border border-cyan-400/50 bg-slate-900/90 text-[10px] font-bold text-cyan-100 hover:bg-slate-800 focus:outline-none focus:ring-2 focus:ring-cyan-400/35"
      aria-label={`Help: ${en}`}
      title={`TH: ${th}\nEN: ${en}`}
    >
      ?
    </button>
    <span className="pointer-events-none absolute right-0 top-5 z-30 hidden w-72 rounded-md border border-slate-600 bg-slate-900/95 p-2 text-[11px] leading-relaxed text-slate-100 shadow-xl group-hover:block group-focus-within:block">
      <span className="block">
        <span className="font-semibold text-cyan-200">TH:</span> {th}
      </span>
      <span className="mt-1 block">
        <span className="font-semibold text-cyan-200">EN:</span> {en}
      </span>
    </span>
  </span>
);

// ─── Formatters ───────────────────────────────────────────────────────────────

export const formatRelativeTime = (iso: string) => {
  const time = new Date(iso).getTime();
  if (Number.isNaN(time)) return '-';
  const diffMs = Date.now() - time;
  const minutes = Math.max(1, Math.floor(diffMs / (60 * 1000)));
  if (minutes < 60) return `${minutes}m ago`;
  const hours = Math.floor(minutes / 60);
  if (hours < 24) return `${hours}h ago`;
  return `${Math.floor(hours / 24)}d ago`;
};

export const toDateLabel = (dateKey: string) => {
  const date = new Date(`${dateKey}T00:00:00`);
  if (Number.isNaN(date.getTime())) return dateKey;
  return date.toLocaleDateString(undefined, { day: '2-digit', month: 'short' });
};

export const formatDateTime = (iso: string) => {
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return '-';
  return date.toLocaleString();
};

// ─── Badge tone maps ──────────────────────────────────────────────────────────

export const tierTone: Record<string, string> = {
  A: 'border-emerald-300/35 bg-emerald-500/10 text-emerald-100',
  B: 'border-cyan-300/35 bg-cyan-500/10 text-cyan-100',
  C: 'border-amber-300/35 bg-amber-500/10 text-amber-100',
  UNKNOWN: 'border-slate-500/50 bg-slate-700/40 text-slate-100'
};

export const providerTone: Record<string, string> = {
  RSS: 'border-slate-600 bg-slate-800/80 text-slate-200',
  EXA: 'border-cyan-400/35 bg-cyan-500/10 text-cyan-100',
  'EXA+FIRECRAWL': 'border-emerald-400/35 bg-emerald-500/10 text-emerald-100',
  MIXED: 'border-violet-400/35 bg-violet-500/10 text-violet-100',
  FALLBACK: 'border-amber-400/35 bg-amber-500/10 text-amber-100'
};

export const confidenceTone: Record<string, string> = {
  HIGH: 'border-emerald-300/40 bg-emerald-500/15 text-emerald-100',
  MEDIUM: 'border-cyan-300/40 bg-cyan-500/15 text-cyan-100',
  LOW: 'border-amber-300/40 bg-amber-500/15 text-amber-100'
};

export const regionLabel: Record<PulseRegion, string> = {
  TH: 'Thailand',
  GLOBAL: 'Global'
};
