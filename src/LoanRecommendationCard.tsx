import React, { useState, useEffect } from 'react';
import { AlertTriangle, RefreshCw, TrendingDown } from 'lucide-react';

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

const CHART_MAX = 15_000_000;

function formatSAR(value: number, compact?: boolean): string {
  if (compact) {
    if (Math.abs(value) >= 1_000_000) return `SAR ${(value / 1_000_000).toFixed(2)}M`;
    if (Math.abs(value) >= 1_000) return `SAR ${(value / 1_000).toFixed(0)}K`;
    return `SAR ${Math.round(value)}`;
  }
  return `SAR ${Math.round(value).toLocaleString('en-SA')}`;
}

/** Present value of an annuity: max loan where annual debt service = annualCF / minDSCR */
function pvAnnuity(annualCF: number, annualRatePct: number, tenorMonths: number, minDSCR: number): number {
  if (annualCF <= 0) return 0;
  const monthlyBudget = (annualCF / minDSCR) / 12;
  const r = annualRatePct / 100 / 12;
  if (r <= 0) return Math.max(0, monthlyBudget * tenorMonths);
  return Math.max(0, monthlyBudget * (1 - Math.pow(1 + r, -tenorMonths)) / r);
}

function buildConstraints(
  fd: LoanFinancialData,
  profitRate: number,
  tenor: number,
  overrideCF?: number,
): { constraints: Constraint[]; maxLoan: number; stressedCapacity: number; negativeEquity: boolean } {
  const ebit = fd.revenue - fd.expenses;

  const flows = fd.monthlyRevenue.map(m => m.cashFlow ?? 0).filter(v => v !== 0);
  const avgMonthly = flows.length > 0
    ? flows.reduce((s, v) => s + v, 0) / flows.length
    : (fd.cashFlow ?? 0) / 12;
  const annualCF = overrideCF ?? avgMonthly * 12;
  const minMonthlyCF = flows.length > 0 ? Math.min(...flows) : avgMonthly * 0.7;

  // 1. DSCR ≥ 1.25
  const pDSCR = pvAnnuity(annualCF, profitRate, tenor, 1.25);
  // 2. Debt/EBITDA ≤ 4×
  const pDebtEBITDA = Math.max(0, 4 * Math.max(0, ebit) - fd.totalDebt);
  // 3. D/E ≤ 2.5×
  const negativeEquity = fd.equity <= 0;
  const pDE = negativeEquity ? 0 : Math.max(0, 2.5 * fd.equity - fd.totalDebt);
  // 4. ICR ≥ 2.0
  const existingInt = (fd.interestExpense ?? 0) > 0 ? fd.interestExpense! : fd.totalDebt * (profitRate / 100);
  const availInt = Math.max(0, ebit / 2.0 - existingInt);
  const pICR = profitRate > 0 ? Math.max(0, availInt / (profitRate / 100)) : pDSCR;

  const vals = [pDSCR, pDebtEBITDA, pDE, pICR];
  const minVal = Math.min(...vals);
  const bindIdx = vals.indexOf(minVal);

  const stressedCapacity = pvAnnuity(minMonthlyCF * 12, profitRate, tenor, 1.25);

  const constraints: Constraint[] = [
    { key: 'DSCR',        label: 'DSCR',        sublabel: '≥ 1.25×', value: pDSCR,       binds: bindIdx === 0 },
    { key: 'Debt/EBITDA', label: 'Debt/EBITDA', sublabel: '≤ 4.0×',  value: pDebtEBITDA, binds: bindIdx === 1 },
    { key: 'D/E',         label: 'D/E',          sublabel: '≤ 2.5×',  value: pDE,         binds: bindIdx === 2 },
    { key: 'ICR',         label: 'ICR',          sublabel: '≥ 2.0×',  value: pICR,        binds: bindIdx === 3 },
  ];

  return { constraints, maxLoan: Math.max(0, minVal), stressedCapacity, negativeEquity };
}

// ─── Bar Row ──────────────────────────────────────────────────────────────────

function ConstraintBar({ c }: { c: Constraint }) {
  const pct = Math.min(100, (c.value / CHART_MAX) * 100);
  return (
    <div className="flex items-center gap-3">
      {/* Label */}
      <div className="w-28 flex-shrink-0">
        <p className={`text-xs font-bold leading-tight ${c.binds ? 'text-rose-600' : 'text-slate-700'}`}>{c.label}</p>
        <p className={`text-[10px] font-semibold ${c.binds ? 'text-rose-400' : 'text-slate-400'}`}>{c.sublabel}</p>
      </div>
      {/* Bar track */}
      <div className="flex-1 h-8 bg-slate-100 rounded-md relative overflow-hidden">
        <div
          className={`h-full rounded-md transition-all duration-500 ease-out ${
            c.binds
              ? 'bg-rose-100 ring-2 ring-inset ring-rose-400'
              : 'bg-indigo-100 ring-1 ring-inset ring-indigo-200'
          }`}
          style={{ width: `${pct}%`, minWidth: c.value > 0 ? '4px' : '0' }}
        />
        {/* Tick guides */}
        {[33.3, 66.6].map(tick => (
          <div
            key={tick}
            className="absolute top-0 h-full w-px bg-slate-300 opacity-30 pointer-events-none"
            style={{ left: `${tick}%` }}
          />
        ))}
      </div>
      {/* Value label */}
      <div className="w-24 flex-shrink-0 text-right">
        <span className={`text-xs font-bold tabular-nums ${c.binds ? 'text-rose-700' : 'text-slate-600'}`}>
          {formatSAR(c.value, true)}
        </span>
      </div>
      {/* BINDS badge */}
      <div className="w-16 flex-shrink-0">
        {c.binds && (
          <span className="inline-flex items-center px-2 py-0.5 bg-rose-100 border border-rose-300 text-rose-700 text-[10px] font-extrabold rounded-full whitespace-nowrap">
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
    <div className="space-y-3 py-1 animate-pulse">
      {[72, 88, 55, 78].map((w, i) => (
        <div key={i} className="flex items-center gap-3">
          <div className="w-28 flex-shrink-0 space-y-1.5">
            <div className="h-2.5 w-16 bg-slate-200 rounded" />
            <div className="h-2 w-10 bg-slate-100 rounded" />
          </div>
          <div className="h-8 bg-slate-100 rounded-md" style={{ flex: 1 }} />
          <div className="w-24 h-3 bg-slate-100 rounded flex-shrink-0" />
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
  const [isLoading, setIsLoading] = useState(false);
  const [forecastedCF, setForecastedCF] = useState<number | undefined>(undefined);

  const dTenor = useDebounce(tenor, 500);
  const dProfitRate = useDebounce(profitRate, 500);

  useEffect(() => {
    const controller = new AbortController();
    (async () => {
      setIsLoading(true);
      try {
        const ebit = (financialData.revenue ?? 0) - (financialData.expenses ?? 0);
        const icr =
          financialData.interestExpense != null && financialData.interestExpense > 0
            ? ebit / financialData.interestExpense
            : null;
        const payload = {
          historicalCashFlows: financialData.monthlyRevenue.map(m => m.cashFlow ?? 0),
          currentAssets:       financialData.currentAssets    ?? 0,
          currentLiabilities:  financialData.currentLiabilities ?? 0,
          totalAssets:         financialData.totalAssets       ?? 0,
          totalDebt:           financialData.totalDebt         ?? 0,
          equity:              financialData.equity            ?? 0,
          inventory:           financialData.inventory         ?? null,
          debtService:         financialData.debtService       ?? null,
          industry,
          revenue:             financialData.revenue           ?? 0,
          expenses:            financialData.expenses          ?? 0,
          retainedEarnings:    financialData.retainedEarnings  ?? null,
          icr,
          confidenceTier: 'standard',
          profit_rate:    dProfitRate,
          tenor_months:   dTenor,
        };
        const res = await fetch(`${import.meta.env.VITE_API_URL}/api/forecast`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });
        if (res.ok) {
          const json = await res.json();
          const arr: any[] = json.forecastedCashflow ?? json.forecastedCashFlow ?? [];
          if (arr.length > 0) {
            const total = arr.reduce(
              (s: number, f: any) => s + (f.forecastedCashFlow ?? f.forecasted_cash_flow ?? 0),
              0,
            );
            setForecastedCF((total / arr.length) * 12);
          }
        }
      } catch (err: any) {
        if (err.name !== 'AbortError') console.error('[LoanRecommendationCard] forecast error:', err);
      } finally {
        setIsLoading(false);
      }
    })();
    return () => controller.abort();
  }, [dTenor, dProfitRate]);

  const { constraints, maxLoan, stressedCapacity, negativeEquity } = buildConstraints(
    financialData, profitRate, tenor, forecastedCF,
  );

  return (
    <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">

      {/* ── Negative Equity Banner ─────────────────────────────────────── */}
      {negativeEquity && (
        <div className="bg-amber-50 border-b border-amber-200 px-5 py-3 flex items-center gap-2.5">
          <AlertTriangle className="h-4 w-4 text-amber-600 flex-shrink-0" />
          <p className="text-sm font-semibold text-amber-900">
            ⚠️ Negative book equity detected. Routing to manual review.
          </p>
        </div>
      )}

      {/* ── Header ─────────────────────────────────────────────────────── */}
      <div className="px-6 pt-5 pb-4 border-b border-slate-100 flex items-center justify-between">
        <div>
          <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-0.5">
            Loan Recommendation Engine
          </p>
          <h3 className="text-base font-bold text-slate-800">Automated Capacity Model</h3>
        </div>
        {isLoading && (
          <div className="flex items-center gap-1.5 text-xs text-indigo-500 font-medium">
            <RefreshCw className="h-3 w-3 animate-spin" />
            Updating forecast…
          </div>
        )}
      </div>

      {/* ── Top: The Verdict ───────────────────────────────────────────── */}
      <div className="px-6 py-5 bg-gradient-to-r from-slate-50 to-white border-b border-slate-100">
        <p className="text-[11px] font-bold text-slate-400 uppercase tracking-widest mb-1.5">
          Maximum Recommended Loan
        </p>
        <div className="flex flex-wrap items-end gap-3">
          <span className="text-[2.5rem] leading-none font-extrabold text-slate-900 tracking-tight">
            {negativeEquity ? 'Manual Review Required' : formatSAR(maxLoan)}
          </span>
          {!negativeEquity && (
            <div className="flex items-center gap-1.5 mb-0.5 px-2.5 py-1 bg-slate-100 border border-slate-200 rounded-full text-xs font-semibold text-slate-600">
              <TrendingDown className="h-3 w-3 text-slate-500" />
              Stressed Capacity (Worst Month): {formatSAR(stressedCapacity, true)}
            </div>
          )}
        </div>
        <p className="text-xs text-slate-400 mt-2">
          At{' '}
          <span className="font-semibold text-slate-600">{profitRate.toFixed(2)}% p.a.</span>
          {' '}over{' '}
          <span className="font-semibold text-slate-600">{tenor} months</span>
          {' '}— minimum across all four constraint ceilings.
        </p>
      </div>

      {/* ── Middle: Constraint Bar Chart ───────────────────────────────── */}
      <div className="px-6 py-5 border-b border-slate-100">
        <div className="flex items-center justify-between mb-4">
          <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest">
            Constraint Analysis
          </p>
          <span className="text-[10px] text-slate-400 font-medium">X-axis max: SAR 15M</span>
        </div>

        {isLoading ? (
          <BarSkeleton />
        ) : (
          <div className="space-y-2.5">
            {constraints.map(c => <ConstraintBar key={c.key} c={c} />)}
            {/* X-axis labels */}
            <div className="flex justify-between mt-1" style={{ paddingLeft: '7.5rem', paddingRight: '10rem' }}>
              {['SAR 0', 'SAR 5M', 'SAR 10M', 'SAR 15M'].map(label => (
                <span key={label} className="text-[10px] text-slate-400">{label}</span>
              ))}
            </div>
          </div>
        )}
      </div>

      {/* ── Bottom: Interactive Controls ───────────────────────────────── */}
      <div className="px-6 py-5">
        <p className="text-[11px] font-bold text-slate-500 uppercase tracking-widest mb-5">
          Loan Parameters
        </p>

        <div className="space-y-6">
          {/* Tenor */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-slate-700">Tenor (Months)</span>
              <span className="text-sm font-bold text-indigo-700 bg-indigo-50 px-2.5 py-0.5 rounded-full tabular-nums">
                {tenor} months
              </span>
            </div>
            <div className="flex items-center gap-2.5">
              <span className="text-[11px] text-slate-400 w-6 text-right flex-shrink-0">12</span>
              <input
                type="range"
                min={12}
                max={60}
                step={6}
                value={tenor}
                onChange={e => setTenor(parseInt(e.target.value))}
                className="flex-1 h-1.5 rounded-full appearance-none cursor-pointer accent-indigo-600"
              />
              <span className="text-[11px] text-slate-400 w-6 flex-shrink-0">60</span>
            </div>
            <div className="flex justify-between px-9 mt-1.5">
              {[12, 18, 24, 30, 36, 42, 48, 54, 60].map(v => (
                <span
                  key={v}
                  className={`text-[10px] font-medium tabular-nums ${
                    tenor === v ? 'text-indigo-600 font-bold' : 'text-slate-300'
                  }`}
                >
                  {v}
                </span>
              ))}
            </div>
          </div>

          {/* Profit Rate */}
          <div>
            <div className="flex items-center justify-between mb-2">
              <span className="text-sm font-semibold text-slate-700">Profit Rate (%)</span>
              <span className="text-sm font-bold text-indigo-700 bg-indigo-50 px-2.5 py-0.5 rounded-full tabular-nums">
                {profitRate.toFixed(2)}%
              </span>
            </div>
            <div className="flex items-center gap-2.5">
              <span className="text-[11px] text-slate-400 w-6 text-right flex-shrink-0">4%</span>
              <input
                type="range"
                min={4.0}
                max={15.0}
                step={0.25}
                value={profitRate}
                onChange={e => setProfitRate(parseFloat(e.target.value))}
                className="flex-1 h-1.5 rounded-full appearance-none cursor-pointer accent-indigo-600"
              />
              <span className="text-[11px] text-slate-400 w-6 flex-shrink-0">15%</span>
            </div>
            <div className="flex justify-between px-9 mt-1.5">
              {[4, 6, 8, 10, 12, 14].map(v => (
                <span
                  key={v}
                  className={`text-[10px] font-medium tabular-nums ${
                    Math.abs(profitRate - v) < 0.125 ? 'text-indigo-600 font-bold' : 'text-slate-300'
                  }`}
                >
                  {v}%
                </span>
              ))}
            </div>
          </div>
        </div>

        {/* Disclaimer */}
        <p className="text-[11px] text-slate-400 mt-6 pt-4 border-t border-slate-100 leading-relaxed">
          Capacity is the minimum of four constraint ceilings:{' '}
          <strong className="text-slate-500">DSCR ≥ 1.25×</strong> (cash flow),{' '}
          <strong className="text-slate-500">Debt/EBITDA ≤ 4×</strong> (earnings),{' '}
          <strong className="text-slate-500">D/E ≤ 2.5×</strong> (equity), and{' '}
          <strong className="text-slate-500">ICR ≥ 2.0×</strong> (interest cover).
          {' '}EBIT, equity, and debt are sourced from uploaded financials and held static.
        </p>
      </div>
    </div>
  );
}
