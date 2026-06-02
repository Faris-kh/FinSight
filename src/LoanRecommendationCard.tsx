import React, { useState, useEffect, useRef } from 'react';
import { AlertTriangle, RefreshCw, TrendingDown, DollarSign } from 'lucide-react';

// ─── Types ────────────────────────────────────────────────────────────────────

interface MonthlyRow {
  month: string;
  cashFlow?: number | null;
  revenue?: number | null;
  expenses?: number | null;
}

export interface LoanFinancialData {
  revenue: number;
  expenses: number;
  totalDebt: number;
  equity: number;
  currentAssets: number;
  currentLiabilities: number;
  totalAssets: number;
  cashFlow: number;
  interestExpense?: number | null;
  debtService?: number | null;
  inventory?: number | null;
  retainedEarnings?: number | null;
  monthlyRevenue: MonthlyRow[];
  companyName?: string;
}

interface Constraint {
  key: string;
  label: string;
  sublabel: string;
  value: number;
  binds: boolean;
}

// Shape of the loan_recommendation object returned by /api/forecast
interface BackendLoanRec {
  base_max_capacity: number;
  stressed_max_capacity: number;
  binding_constraint: string; // e.g. "dscr" | "debt_ebitda" | "de" | "icr"
  ceilings: {
    dscr?: number;
    debt_ebitda?: number;
    de?: number;
    icr?: number;
  };
}

export interface LoanRecommendationCardProps {
  financialData: LoanFinancialData;
  industry: string;
}

// ─── useDebounce ──────────────────────────────────────────────────────────────

function useDebounce<T>(value: T, delay: number): T {
  const [debounced, setDebounced] = useState<T>(value);
  useEffect(() => {
    const t = setTimeout(() => setDebounced(value), delay);
    return () => clearTimeout(t);
  }, [value, delay]);
  return debounced;
}

// ─── Utilities ────────────────────────────────────────────────────────────────

function formatSAR(value: number, compact?: boolean): string {
  if (compact) {
    if (Math.abs(value) >= 1_000_000) return `SAR ${(value / 1_000_000).toFixed(2)}M`;
    if (Math.abs(value) >= 1_000) return `SAR ${(value / 1_000).toFixed(0)}K`;
    return `SAR ${Math.round(value)}`;
  }
  return `SAR ${Math.round(value).toLocaleString('en-SA')}`;
}

function getChartMax(constraints: Constraint[]): number {
  const positives = constraints.map(c => c.value).filter(v => v > 0);
  return positives.length > 0
    ? Math.max(Math.max(...positives) * 1.1, 5_000_000)
    : 5_000_000;
}

// Maps backend snake_case binding key → display key used in Constraint.key
const BINDING_KEY_MAP: Record<string, string> = {
  dscr:        'DSCR',
  debt_ebitda: 'Debt/EBITDA',
  de:          'D/E',
  icr:         'ICR',
};

/** Build constraint array from backend loan_recommendation object. */
function buildConstraintsFromBackend(rec: BackendLoanRec): Constraint[] {
  const bindingKey = BINDING_KEY_MAP[(rec.binding_constraint ?? '').toLowerCase()] ?? '';
  const c = rec.ceilings ?? {};
  return [
    { key: 'DSCR',        label: 'DSCR',        sublabel: '≥ 1.25×', value: c.dscr        ?? 0, binds: bindingKey === 'DSCR' },
    { key: 'Debt/EBITDA', label: 'Debt/EBITDA', sublabel: '≤ 3.5×',  value: c.debt_ebitda ?? 0, binds: bindingKey === 'Debt/EBITDA' },
    { key: 'D/E',         label: 'D/E',          sublabel: '≤ 2.0×',  value: c.de          ?? 0, binds: bindingKey === 'D/E' },
    { key: 'ICR',         label: 'ICR',          sublabel: '≥ 2.0×',  value: c.icr         ?? 0, binds: bindingKey === 'ICR' },
  ];
}

// ─── Local fallback constraint engine ────────────────────────────────────────
// Used for immediate display before the backend responds and when the backend
// does not return a loan_recommendation object.

function pvAnnuity(annualCF: number, annualRatePct: number, tenorMonths: number, minDSCR: number): number {
  if (annualCF <= 0) return 0;
  const monthlyBudget = (annualCF / minDSCR) / 12;
  const r = annualRatePct / 100 / 12;
  if (r <= 0) return Math.max(0, monthlyBudget * tenorMonths);
  return Math.max(0, monthlyBudget * (1 - Math.pow(1 + r, -tenorMonths)) / r);
}

function buildConstraintsLocal(
  fd: LoanFinancialData,
  profitRate: number,
  tenor: number,
): { constraints: Constraint[]; maxLoan: number; stressedCapacity: number; negativeEquity: boolean } {
  const ebit = fd.revenue - fd.expenses;
  const flows = fd.monthlyRevenue.map(m => m.cashFlow ?? 0).filter(v => v !== 0);
  const avgMonthly = flows.length > 0
    ? flows.reduce((s, v) => s + v, 0) / flows.length
    : (fd.cashFlow ?? 0) / 12;
  const annualCF = avgMonthly * 12;
  const minMonthlyCF = flows.length > 0 ? Math.min(...flows) : avgMonthly * 0.7;

  const pDSCR = pvAnnuity(annualCF, profitRate, tenor, 1.25);
  const pDebtEBITDA = Math.max(0, 3.5 * Math.max(0, ebit) - fd.totalDebt);
  const negativeEquity = fd.equity <= 0;
  const pDE = negativeEquity ? 0 : Math.max(0, 2.0 * fd.equity - fd.totalDebt);
  const existingInt = (fd.interestExpense ?? 0) > 0 ? fd.interestExpense! : fd.totalDebt * (profitRate / 100);
  const availInt = Math.max(0, ebit / 2.0 - existingInt);
  const pICR = profitRate > 0 ? Math.max(0, availInt / (profitRate / 100)) : pDSCR;

  const vals = [pDSCR, pDebtEBITDA, pDE, pICR];
  const minVal = Math.min(...vals);
  const bindIdx = vals.indexOf(minVal);
  const stressedCapacity = pvAnnuity(minMonthlyCF * 12, profitRate, tenor, 1.25);

  const constraints: Constraint[] = [
    { key: 'DSCR',        label: 'DSCR',        sublabel: '≥ 1.25×', value: pDSCR,       binds: bindIdx === 0 },
    { key: 'Debt/EBITDA', label: 'Debt/EBITDA', sublabel: '≤ 3.5×',  value: pDebtEBITDA, binds: bindIdx === 1 },
    { key: 'D/E',         label: 'D/E',          sublabel: '≤ 2.0×',  value: pDE,         binds: bindIdx === 2 },
    { key: 'ICR',         label: 'ICR',          sublabel: '≥ 2.0×',  value: pICR,        binds: bindIdx === 3 },
  ];
  return { constraints, maxLoan: Math.max(0, minVal), stressedCapacity, negativeEquity };
}

// ─── Constraint Bar Row ───────────────────────────────────────────────────────

function ConstraintBar({ c, chartMax, isUpdating }: { c: Constraint; chartMax: number; isUpdating: boolean }) {
  const pct = chartMax > 0 ? Math.min(100, (c.value / chartMax) * 100) : 0;
  return (
    <div className="bg-slate-900 rounded-xl px-5 py-3 flex items-center gap-3">
      <div className="w-28 flex-shrink-0">
        <p className={`text-xs font-bold leading-tight ${c.binds ? 'text-rose-300' : 'text-slate-300'}`}>{c.label}</p>
        <p className={`text-[10px] font-semibold ${c.binds ? 'text-rose-500' : 'text-slate-500'}`}>{c.sublabel}</p>
      </div>
      <div className="flex-1 h-8 bg-slate-700 rounded-md relative overflow-hidden">
        <div
          className={`h-full rounded-md transition-all duration-500 ease-out ${isUpdating ? 'animate-pulse' : ''} ${
            c.binds ? 'bg-rose-950 ring-2 ring-inset ring-rose-700' : 'bg-indigo-950 ring-1 ring-inset ring-indigo-800'
          }`}
          style={{ width: `${pct}%`, minWidth: c.value > 0 ? '4px' : '0' }}
        />
        {[33.3, 66.6].map(tick => (
          <div key={tick} className="absolute top-0 h-full w-px bg-slate-600 opacity-50 pointer-events-none" style={{ left: `${tick}%` }} />
        ))}
      </div>
      <div className="w-24 flex-shrink-0 text-right">
        <span className={`text-xs font-bold tabular-nums ${isUpdating ? 'animate-pulse opacity-60' : ''} ${c.binds ? 'text-rose-300' : 'text-slate-300'}`}>
          {formatSAR(c.value, true)}
        </span>
      </div>
      <div className="w-16 flex-shrink-0">
        {c.binds && (
          <span className="inline-flex items-center px-2 py-0.5 bg-rose-900 border border-rose-700 text-rose-300 text-[10px] font-extrabold rounded-full whitespace-nowrap">
            ← BINDS
          </span>
        )}
      </div>
    </div>
  );
}

// ─── Skeleton ─────────────────────────────────────────────────────────────────

function BarSkeleton() {
  return (
    <div className="space-y-2 animate-pulse">
      {[0, 1, 2, 3].map(i => (
        <div key={i} className="bg-slate-900 rounded-xl px-5 py-3 flex items-center gap-3">
          <div className="w-28 flex-shrink-0 space-y-1.5">
            <div className="h-2.5 w-16 bg-slate-700 rounded" />
            <div className="h-2 w-10 bg-slate-700 rounded" />
          </div>
          <div className="h-8 bg-slate-700 rounded-md flex-1" />
          <div className="w-24 h-3 bg-slate-700 rounded flex-shrink-0" />
          <div className="w-16 flex-shrink-0" />
        </div>
      ))}
    </div>
  );
}

// ─── Component ────────────────────────────────────────────────────────────────

export default function LoanRecommendationCard({ financialData, industry }: LoanRecommendationCardProps) {
  const [tenor, setTenor] = useState(36);
  const [profitRate, setProfitRate] = useState(8.0);

  const [isRevealed, setIsRevealed] = useState(false);
  const [isInitialLoading, setIsInitialLoading] = useState(false);
  const [isUpdating, setIsUpdating] = useState(false);

  // Authoritative loan recommendation from backend — null until first successful fetch
  const [backendLoanRec, setBackendLoanRec] = useState<BackendLoanRec | null>(null);
  const hasFetchedOnce = useRef(false);

  const dTenor = useDebounce(tenor, 500);
  const dProfitRate = useDebounce(profitRate, 500);

  useEffect(() => {
    if (!isRevealed) return;

    const controller = new AbortController();
    if (hasFetchedOnce.current) setIsUpdating(true);

    (async () => {
      try {
        const payload = {
          historicalCashFlows: financialData.monthlyRevenue.map(m => m.cashFlow ?? 0),
          currentAssets:      financialData.currentAssets      ?? 0,
          currentLiabilities: financialData.currentLiabilities ?? 0,
          totalAssets:        financialData.totalAssets         ?? 0,
          totalDebt:          financialData.totalDebt           ?? 0,
          equity:             financialData.equity              ?? 0,
          inventory:          financialData.inventory           ?? null,
          debtService:        financialData.debtService         ?? null,
          interest_expense:   financialData.interestExpense     ?? null,
          industry,
          revenue:            financialData.revenue             ?? 0,
          expenses:           financialData.expenses            ?? 0,
          retainedEarnings:   financialData.retainedEarnings    ?? null,
          confidenceTier: 'standard',
          // Slider state sent as nested loan_params; profit_rate is a decimal fraction (0.08 = 8%)
          loan_params: {
            profit_rate:  dProfitRate / 100,
            tenor_months: dTenor,
          },
        };

        const res = await fetch(`${import.meta.env.VITE_API_URL}/api/forecast`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        if (res.ok) {
          const json = await res.json();
          // Primary path: backend returns a loan_recommendation object
          const rec: BackendLoanRec | null = json.loan_recommendation ?? null;
          if (rec) {
            setBackendLoanRec(rec);
          }
          // If backend does not return loan_recommendation yet, the local fallback
          // continues to drive the display (no state update needed here).
        }
      } catch (err: any) {
        if (err.name !== 'AbortError') console.error('[LoanRecommendationCard] forecast error:', err);
      } finally {
        hasFetchedOnce.current = true;
        setIsInitialLoading(false);
        setIsUpdating(false);
      }
    })();

    return () => controller.abort();
  }, [dTenor, dProfitRate, isRevealed]);

  // ── Derive display values ─────────────────────────────────────────────────
  // negativeEquity always comes from local data (structural fact, not API-dependent)
  const { negativeEquity, stressedCapacity: localStressed, maxLoan: localMaxLoan, constraints: localConstraints } =
    buildConstraintsLocal(financialData, profitRate, tenor);

  const displayConstraints = backendLoanRec
    ? buildConstraintsFromBackend(backendLoanRec)
    : localConstraints;
  const displayMaxLoan = backendLoanRec?.base_max_capacity ?? localMaxLoan;
  // Backend stressed_max_capacity is clamped to ≤ base_max_capacity by the server;
  // guard client-side as well in case of stale state mismatch.
  const displayStressed = backendLoanRec
    ? Math.min(backendLoanRec.stressed_max_capacity, backendLoanRec.base_max_capacity)
    : localStressed;
  const chartMax = getChartMax(displayConstraints);

  const handleReveal = () => {
    setIsRevealed(true);
    setIsInitialLoading(true);
  };

  // ── Inactive / Initial-loading ────────────────────────────────────────────
  if (!isRevealed || isInitialLoading) {
    return (
      <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
        <div className="p-8">
          <div className="flex items-start gap-4 mb-6">
            <div className="p-3 bg-indigo-600 rounded-xl flex-shrink-0">
              <DollarSign className="h-6 w-6 text-white" />
            </div>
            <div>
              <h2 className="text-lg font-bold text-white mb-1">Credit Sizing & Loan Recommendation</h2>
              <p className="text-sm text-slate-400">
                Compute the maximum financeable amount across four SAMA-aligned structural constraints — DSCR, Debt/EBITDA, D/E, and ICR.
              </p>
            </div>
          </div>
          {isInitialLoading ? (
            <div className="flex items-center gap-3 text-slate-300 text-sm">
              <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-indigo-400" />
              Running credit sizing model…
            </div>
          ) : (
            <button
              onClick={handleReveal}
              className="flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-semibold transition-colors"
            >
              <DollarSign className="h-4 w-4" />
              Run Credit Sizing & Loan Recommendation
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── Revealed ──────────────────────────────────────────────────────────────
  return (
    <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">

      {negativeEquity && (
        <div className="bg-amber-900/40 border-b border-amber-700 px-5 py-3 flex items-center gap-2.5">
          <AlertTriangle className="h-4 w-4 text-amber-400 flex-shrink-0" />
          <p className="text-sm font-semibold text-amber-300">
            ⚠️ Negative book equity detected. Routing to manual review.
          </p>
        </div>
      )}

      {/* Header */}
      <div className="px-6 py-4 border-b border-slate-700 flex items-center justify-between">
        <div className="flex items-center gap-3">
          <div className="p-2 bg-indigo-600 rounded-lg flex-shrink-0">
            <DollarSign className="h-4 w-4 text-white" />
          </div>
          <div>
            <h2 className="text-sm font-bold text-white">Loan Recommendation Engine</h2>
            <p className="text-xs text-slate-400">Automated capacity model — 4 binding constraint ceilings</p>
          </div>
        </div>
        {isUpdating && (
          <div className="flex items-center gap-1.5 text-xs text-indigo-400 font-medium">
            <RefreshCw className="h-3 w-3 animate-spin" />
            Updating…
          </div>
        )}
      </div>

      {/* Verdict */}
      <div className="px-6 py-5 border-b border-slate-700">
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest mb-2">
          Maximum Recommended Loan
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <span className={`text-[2.5rem] leading-none font-extrabold text-white tracking-tight ${isUpdating ? 'animate-pulse opacity-60' : ''}`}>
            {negativeEquity ? 'Manual Review Required' : formatSAR(displayMaxLoan)}
          </span>
          {!negativeEquity && (
            <span className={`mb-0.5 flex items-center gap-1.5 px-2.5 py-1 bg-slate-700 border border-slate-600 rounded-full text-xs font-semibold text-slate-300 ${isUpdating ? 'animate-pulse opacity-60' : ''}`}>
              <TrendingDown className="h-3 w-3 text-slate-400" />
              Stressed Capacity (Worst Month): {formatSAR(displayStressed, true)}
            </span>
          )}
        </div>
        <p className="text-xs text-slate-500 mt-2">
          At{' '}
          <span className="font-semibold text-slate-300">{profitRate.toFixed(2)}% p.a.</span>
          {' '}over{' '}
          <span className="font-semibold text-slate-300">{tenor} months</span>
          {' '}— minimum across all four constraint ceilings.
          {backendLoanRec && <span className="ml-1 text-indigo-500">· Backend-computed</span>}
        </p>
      </div>

      {/* Constraint Analysis */}
      <div className="px-6 py-5 border-b border-slate-700">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Constraint Analysis</p>
          <span className="text-[10px] text-slate-500 font-medium">Scale max: {formatSAR(chartMax, true)}</span>
        </div>
        <div className="space-y-2">
          {displayConstraints.map(c => (
            <ConstraintBar key={c.key} c={c} chartMax={chartMax} isUpdating={isUpdating} />
          ))}
        </div>
      </div>

      {/* Loan Parameters */}
      <div className="p-6 space-y-4">
        <p className="text-xs font-bold text-slate-400 uppercase tracking-widest">Loan Parameters</p>

        {/* Tenor */}
        <div className="bg-slate-900 rounded-xl px-5 py-3">
          <div className="flex items-center gap-4">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">
              Tenor (Months)
            </span>
            <div className="flex-1 flex items-center gap-3">
              <span className="text-xs text-slate-500">12</span>
              <input
                type="range" min={12} max={60} step={6} value={tenor}
                onChange={e => setTenor(parseInt(e.target.value))}
                className="flex-1 accent-indigo-500"
              />
              <span className="text-xs text-slate-500">60</span>
            </div>
            <span className="text-sm font-bold text-indigo-300 whitespace-nowrap bg-indigo-900 px-3 py-1 rounded-lg tabular-nums">
              {tenor} months
            </span>
          </div>
          <div className="flex justify-between mt-2 px-8">
            {[12, 18, 24, 30, 36, 42, 48, 54, 60].map(v => (
              <span key={v} className={`text-[10px] tabular-nums ${tenor === v ? 'text-indigo-400 font-bold' : 'text-slate-600'}`}>
                {v}
              </span>
            ))}
          </div>
        </div>

        {/* Profit Rate */}
        <div className="bg-slate-900 rounded-xl px-5 py-3">
          <div className="flex items-center gap-4">
            <span className="text-xs font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">
              Profit Rate
            </span>
            <div className="flex-1 flex items-center gap-3">
              <span className="text-xs text-slate-500">4%</span>
              <input
                type="range" min={4.0} max={15.0} step={0.25} value={profitRate}
                onChange={e => setProfitRate(parseFloat(e.target.value))}
                className="flex-1 accent-indigo-500"
              />
              <span className="text-xs text-slate-500">15%</span>
            </div>
            <span className="text-sm font-bold text-indigo-300 whitespace-nowrap bg-indigo-900 px-3 py-1 rounded-lg tabular-nums">
              {profitRate.toFixed(2)}%
            </span>
          </div>
          <div className="flex justify-between mt-2 px-8">
            {[4, 6, 8, 10, 12, 14].map(v => (
              <span key={v} className={`text-[10px] tabular-nums ${Math.abs(profitRate - v) < 0.125 ? 'text-indigo-400 font-bold' : 'text-slate-600'}`}>
                {v}%
              </span>
            ))}
          </div>
        </div>

        {/* Disclaimer */}
        <p className="text-[11px] text-slate-600 pt-2 leading-relaxed">
          Capacity is the minimum of four SAMA-aligned constraint ceilings:{' '}
          <span className="text-slate-500 font-semibold">DSCR ≥ 1.25×</span> (cash flow),{' '}
          <span className="text-slate-500 font-semibold">Debt/EBITDA ≤ 3.5×</span> (earnings),{' '}
          <span className="text-slate-500 font-semibold">D/E ≤ 2.0×</span> (equity), and{' '}
          <span className="text-slate-500 font-semibold">ICR ≥ 2.0×</span> (interest cover).
          {' '}EBIT, equity, and debt are sourced from uploaded financials and held static.
        </p>
      </div>
    </div>
  );
}
