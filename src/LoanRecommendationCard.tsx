import React, { useState, useEffect, useRef } from 'react';
import { AlertTriangle, RefreshCw, TrendingDown, DollarSign } from 'lucide-react';
import { getHistoryConfidenceTier } from './utils/forecastPayload';

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
  totalDebt: number | null;
  equity: number | null;
  totalAssets: number | null;
  totalLiabilities?: number | null;
  currentAssets: number | null;
  currentLiabilities: number | null;
  cashFlow: number;
  interestExpense?: number | null;
  debtService?: number | null;
  inventory?: number | null;
  retainedEarnings?: number | null;
  monthlyRevenue: MonthlyRow[];
  historicalMonths?: MonthlyRow[];
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
  binding_constraint: string;
  status?: string;
  ceilings: {
    dscr_ceiling?: number;
    debt_ebitda_ceiling?: number;
    de_ceiling?: number;
    icr_ceiling?: number;
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

function formatSAR(raw: number | null | undefined, compact?: boolean): string {
  const value = typeof raw === 'number' && isFinite(raw) ? raw : 0;
  if (compact) {
    if (Math.abs(value) >= 1_000_000) return `SAR ${(value / 1_000_000).toFixed(2)}M`;
    if (Math.abs(value) >= 1_000) return `SAR ${(value / 1_000).toFixed(0)}K`;
    return `SAR ${Math.round(value)}`;
  }
  return `SAR ${Math.round(value).toLocaleString('en-SA')}`;
}

function getChartMax(constraints: Constraint[]): number {
  const positives = constraints.map(c => c.value).filter(v => v > 0);
  return positives.length > 0 ? Math.max(Math.max(...positives) * 1.1, 5_000_000) : 5_000_000;
}

// F-16: backend sends short form ("dscr" | "debt_ebitda" | "de" | "icr")
const BINDING_KEY_MAP: Record<string, string> = {
  dscr:        'DSCR',
  debt_ebitda: 'Debt/EBITDA',
  de:          'D/E',
  icr:         'ICR',
};

function buildConstraintsFromBackend(rec: BackendLoanRec): Constraint[] {
  const bindingKey = BINDING_KEY_MAP[(rec.binding_constraint ?? '').toLowerCase()] ?? '';
  const c = rec.ceilings ?? {};
  return [
    { key: 'DSCR',        label: 'DSCR',        sublabel: '≥ 1.25×', value: c.dscr_ceiling        ?? 0, binds: bindingKey === 'DSCR' },
    { key: 'Debt/EBITDA', label: 'Debt/EBITDA', sublabel: '≤ 3.5×',  value: c.debt_ebitda_ceiling ?? 0, binds: bindingKey === 'Debt/EBITDA' },
    { key: 'D/E',         label: 'D/E',          sublabel: '≤ 2.0×',  value: c.de_ceiling          ?? 0, binds: bindingKey === 'D/E' },
    { key: 'ICR',         label: 'ICR',          sublabel: '≥ 2.0×',  value: c.icr_ceiling         ?? 0, binds: bindingKey === 'ICR' },
  ];
}

// ─── Local fallback constraint engine ─────────────────────────────────────────

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
  const totalDebt = fd.totalDebt ?? 0;
  const equity    = fd.equity    ?? 0;
  const pDebtEBITDA = Math.max(0, 3.5 * Math.max(0, ebit) - totalDebt);
  const negativeEquity = equity <= 0;
  const pDE = negativeEquity ? 0 : Math.max(0, 2.0 * equity - totalDebt);
  const existingInt = (fd.interestExpense ?? 0) > 0 ? fd.interestExpense! : totalDebt * (profitRate / 100);
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

// ─── Constraint Bar ───────────────────────────────────────────────────────────

function ConstraintBar({ c, chartMax, isUpdating }: { c: Constraint; chartMax: number; isUpdating: boolean }) {
  const pct = chartMax > 0 ? Math.min(100, (c.value / chartMax) * 100) : 0;
  return (
    <div className="r-panel flex items-center gap-3 px-4 py-3" style={{ background: c.binds ? 'var(--danger-tint)' : 'var(--surface)' }}>
      <div className="w-28 shrink-0">
        <p className="text-xs font-bold leading-tight" style={{ color: c.binds ? 'var(--danger)' : 'var(--ink)' }}>{c.label}</p>
        <p style={{ fontSize: '10px', fontWeight: 600, color: c.binds ? 'var(--danger)' : 'var(--ink-faint)' }}>{c.sublabel}</p>
      </div>
      <div className="flex-1 h-8 rounded relative overflow-hidden" style={{ background: 'var(--hairline)' }}>
        <div
          className={`h-full rounded transition-all duration-500 ease-out ${isUpdating ? 'animate-pulse' : ''}`}
          style={{
            width: `${pct}%`,
            minWidth: c.value > 0 ? '4px' : '0',
            background: c.binds ? 'var(--danger)' : 'var(--navy-700)',
            opacity: c.binds ? 1 : 0.7,
          }}
        />
        {[33.3, 66.6].map(tick => (
          <div key={tick} className="absolute top-0 h-full w-px pointer-events-none" style={{ left: `${tick}%`, background: 'var(--panel)', opacity: 0.6 }} />
        ))}
      </div>
      <div className="w-24 shrink-0 text-right">
        <span className={`text-xs font-bold tabular ${isUpdating ? 'animate-pulse opacity-60' : ''}`}
          style={{ color: c.binds ? 'var(--danger)' : 'var(--ink-muted)' }}>
          {formatSAR(c.value, true)}
        </span>
      </div>
      <div className="w-16 shrink-0">
        {c.binds && (
          <span className="r-badge-danger">BINDS</span>
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
        <div key={i} className="r-panel px-4 py-3 flex items-center gap-3" style={{ background: 'var(--surface)' }}>
          <div className="w-28 shrink-0 space-y-1.5">
            <div className="h-2.5 w-16 rounded" style={{ background: 'var(--hairline)' }} />
            <div className="h-2 w-10 rounded" style={{ background: 'var(--hairline)' }} />
          </div>
          <div className="h-8 rounded flex-1" style={{ background: 'var(--hairline)' }} />
          <div className="w-24 h-3 rounded shrink-0" style={{ background: 'var(--hairline)' }} />
          <div className="w-16 shrink-0" />
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

  const [backendLoanRec, setBackendLoanRec] = useState<BackendLoanRec | null>(null);
  const [fetchError, setFetchError] = useState<boolean>(false); // F-15
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
          // F-09
          historicalCashFlows: (financialData.historicalMonths ?? financialData.monthlyRevenue).map(m => m.cashFlow ?? null),
          confidenceTier: getHistoryConfidenceTier(financialData.historicalMonths),
          // F-11
          currentAssets:      financialData.currentAssets      ?? null,
          currentLiabilities: financialData.currentLiabilities ?? null,
          totalAssets:        financialData.totalAssets         ?? null,
          totalDebt:          financialData.totalDebt           ?? null,
          equity:             financialData.equity              ?? null,
          totalLiabilities:   financialData.totalLiabilities ?? (financialData.totalAssets - financialData.equity) ?? 0,
          inventory:          financialData.inventory           ?? null,
          debtService:        financialData.debtService         ?? null,
          interest_expense:   financialData.interestExpense     ?? null,
          industry,
          revenue:            financialData.revenue             ?? 0,
          expenses:           financialData.expenses            ?? 0,
          retainedEarnings:   financialData.retainedEarnings    ?? null,
          loan_params: { profit_rate: dProfitRate / 100, tenor_months: dTenor },
        };

        console.log('[LoanRecommendationCard] interest_expense →', payload.interest_expense);
        const res = await fetch(`${import.meta.env.VITE_API_URL}/api/forecast`, {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
          signal: controller.signal,
        });

        setFetchError(false);
        if (res.ok) {
          const json = await res.json();
          const rec: BackendLoanRec | null = json.loan_recommendation ?? null;
          if (rec) {
            console.log('[LoanRec] raw loan_recommendation:', JSON.stringify(rec, null, 2));
            setBackendLoanRec(rec);
          }
        } else {
          console.error('[LoanRecommendationCard] backend returned', res.status);
          setFetchError(true); // F-15
        }
      } catch (err: any) {
        if (err.name !== 'AbortError') {
          console.error('[LoanRecommendationCard] forecast error:', err);
          setFetchError(true); // F-15
        }
      } finally {
        hasFetchedOnce.current = true;
        setIsInitialLoading(false);
        setIsUpdating(false);
      }
    })();

    return () => controller.abort();
    // F-20
  }, [dTenor, dProfitRate, isRevealed, financialData]);

  // ── Derive display values ──────────────────────────────────────────────────
  const { negativeEquity, stressedCapacity: localStressed, maxLoan: localMaxLoan, constraints: localConstraints } =
    buildConstraintsLocal(financialData, profitRate, tenor);

  const displayConstraints = backendLoanRec ? buildConstraintsFromBackend(backendLoanRec) : localConstraints;
  const displayMaxLoan = backendLoanRec?.base_max_capacity ?? localMaxLoan;
  const displayStressed = backendLoanRec
    ? Math.min(backendLoanRec.stressed_max_capacity, backendLoanRec.base_max_capacity)
    : localStressed;
  const chartMax = getChartMax(displayConstraints);

  // !(x > 0) catches 0, NaN, null, and undefined
  const isDeclined =
    !(displayMaxLoan > 0) ||
    (backendLoanRec != null && backendLoanRec.stressed_max_capacity === 0) ||
    (backendLoanRec?.status ?? '').includes('NOT_RECOMMENDED');

  const handleReveal = () => { setIsRevealed(true); setIsInitialLoading(true); };

  const sliderRowSt = { background: 'var(--surface)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius)' };
  const inputSt = { background: 'var(--surface)', border: '1px solid var(--hairline)', color: 'var(--ink)', fontFamily: 'var(--font-sans)' };

  // ── Inactive / Initial-loading ─────────────────────────────────────────────
  if (!isRevealed || isInitialLoading) {
    return (
      <div className="r-panel overflow-hidden">
        <div className="p-8">
          <div className="flex items-start gap-4 mb-6">
            <div className="p-3 rounded shrink-0" style={{ background: 'var(--navy-950)' }}>
              <DollarSign className="h-6 w-6" style={{ color: 'var(--panel)' }} strokeWidth={1.5} />
            </div>
            <div>
              <h2 className="text-base font-bold mb-1">Credit Sizing &amp; Loan Recommendation</h2>
              <p className="text-sm" style={{ color: 'var(--ink-muted)' }}>
                Compute the maximum financeable amount across four SAMA-aligned structural constraints: DSCR, Debt/EBITDA, D/E, and ICR.
              </p>
            </div>
          </div>
          {isInitialLoading ? (
            <div className="flex items-center gap-3 text-sm" style={{ color: 'var(--ink-muted)' }}>
              <div className="animate-spin rounded-full h-5 w-5 border-b-2" style={{ borderColor: 'var(--signal)' }} />
              Running credit sizing model...
            </div>
          ) : (
            <button onClick={handleReveal} className="r-btn-signal px-6 py-3 text-sm gap-2">
              <DollarSign className="h-4 w-4" strokeWidth={1.5} />
              Run Credit Sizing &amp; Loan Recommendation
            </button>
          )}
        </div>
      </div>
    );
  }

  // ── Revealed ──────────────────────────────────────────────────────────────
  return (
    <div className="r-panel overflow-hidden">

      {negativeEquity && (
        <div className="px-5 py-3 flex items-center gap-2.5"
          style={{ background: 'var(--caution-tint)', borderBottom: '1px solid color-mix(in oklch, var(--caution) 25%, transparent)' }}>
          <AlertTriangle className="h-4 w-4 shrink-0" style={{ color: 'var(--caution)' }} strokeWidth={1.5} />
          <p className="text-sm font-semibold" style={{ color: 'var(--caution)' }}>
            Negative book equity detected. Routing to manual review.
          </p>
        </div>
      )}

      {/* Header */}
      <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--hairline)' }}>
        <div className="flex items-center gap-3">
          <div className="p-2 rounded shrink-0" style={{ background: 'var(--navy-950)' }}>
            <DollarSign className="h-4 w-4" style={{ color: 'var(--panel)' }} strokeWidth={1.5} />
          </div>
          <div>
            <p className="text-sm font-bold">Loan Recommendation Engine</p>
            <p className="text-xs" style={{ color: 'var(--ink-muted)' }}>Automated capacity model — 4 binding constraint ceilings</p>
          </div>
        </div>
        {isUpdating && (
          <div className="flex items-center gap-1.5 text-xs font-medium" style={{ color: 'var(--signal)' }}>
            <RefreshCw className="h-3 w-3 animate-spin" />Updating...
          </div>
        )}
      </div>

      {/* Verdict or decline */}
      {isDeclined ? (
        <div className="px-6 py-6" style={{ borderBottom: '1px solid var(--hairline)' }}>
          <div className="flex items-start gap-4 p-5 rounded" style={{ background: 'var(--danger-tint)', border: '1px solid color-mix(in oklch, var(--danger) 25%, transparent)' }}>
            <AlertTriangle className="h-6 w-6 shrink-0 mt-0.5" style={{ color: 'var(--danger)' }} strokeWidth={1.5} />
            <div>
              <p className="text-base font-bold mb-1.5" style={{ color: 'var(--danger)' }}>Credit Declined: Insufficient Capacity</p>
              <p className="text-sm leading-relaxed" style={{ color: 'var(--ink-muted)' }}>
                The engine detected projected cash flow burn or negative earnings within the 6-month forecast horizon. The business cannot safely service additional debt.
              </p>
              {backendLoanRec?.status && (
                <p className="text-[10px] mt-3 font-mono" style={{ color: 'var(--ink-faint)' }}>{backendLoanRec.status}</p>
              )}
            </div>
          </div>
        </div>
      ) : (
        <>
          {/* Verdict */}
          <div className="px-6 py-5" style={{ borderBottom: '1px solid var(--hairline)' }}>
            <p className="r-eyebrow mb-2">Maximum Recommended Loan</p>
            <div className="flex flex-wrap items-end gap-3">
              <span className={`text-[2.5rem] leading-none font-extrabold tabular ${isUpdating ? 'animate-pulse opacity-60' : ''}`}>
                {negativeEquity ? 'Manual Review Required' : formatSAR(displayMaxLoan)}
              </span>
              {!negativeEquity && (
                <span className={`mb-0.5 flex items-center gap-1.5 px-2.5 py-1 rounded text-xs font-semibold ${isUpdating ? 'animate-pulse opacity-60' : ''}`}
                  style={{ background: 'var(--surface)', border: '1px solid var(--hairline)', color: 'var(--ink-muted)' }}>
                  <TrendingDown className="h-3 w-3 shrink-0" strokeWidth={1.5} />
                  Stressed (worst month): {formatSAR(displayStressed, true)}
                </span>
              )}
            </div>
            <p className="text-xs mt-2" style={{ color: 'var(--ink-faint)' }}>
              At{' '}
              <span className="font-semibold" style={{ color: 'var(--ink)' }}>{profitRate.toFixed(2)}% p.a.</span>
              {' '}over{' '}
              <span className="font-semibold" style={{ color: 'var(--ink)' }}>{tenor} months</span>
              {' '}— minimum across all four constraint ceilings.
              {/* F-15 */}
              {hasFetchedOnce.current && fetchError && !backendLoanRec && (
                <span className="ml-1" style={{ color: 'var(--caution)' }}>Local estimate (backend unavailable)</span>
              )}
              {backendLoanRec && <span className="ml-1" style={{ color: 'var(--signal)' }}>Backend-computed</span>}
            </p>
          </div>

          {/* Constraint bars */}
          <div className="px-6 py-5" style={{ borderBottom: '1px solid var(--hairline)' }}>
            <div className="flex items-center justify-between mb-3">
              <p className="r-eyebrow">Constraint Analysis</p>
              <span className="text-[10px] font-medium" style={{ color: 'var(--ink-faint)' }}>Scale max: {formatSAR(chartMax, true)}</span>
            </div>
            <div className="space-y-2">
              {displayConstraints.map(c => (
                <ConstraintBar key={c.key} c={c} chartMax={chartMax} isUpdating={isUpdating} />
              ))}
            </div>
          </div>
        </>
      )}

      {/* Loan Parameters */}
      <div className="p-6 space-y-4">
        <p className="r-eyebrow">Loan Parameters</p>

        {/* Tenor */}
        <div className="px-5 py-3 flex items-center gap-4" style={sliderRowSt}>
          <span className="r-eyebrow whitespace-nowrap">Tenor (Months)</span>
          <div className="flex items-center gap-3">
            <span className="text-[11px]" style={{ color: 'var(--ink-faint)' }}>12</span>
            <input type="range" min={12} max={60} step={6} value={tenor}
              onChange={e => setTenor(parseInt(e.target.value))}
              className="w-48" style={{ accentColor: 'var(--signal)' }} />
            <span className="text-[11px]" style={{ color: 'var(--ink-faint)' }}>60</span>
          </div>
          <span className="text-sm font-bold tabular px-3 py-1 rounded" style={{ background: 'var(--navy-950)', color: 'var(--panel)' }}>
            {tenor} months
          </span>
        </div>

        {/* Profit Rate */}
        <div className="px-5 py-3 flex items-center gap-4" style={sliderRowSt}>
          <span className="r-eyebrow whitespace-nowrap">Profit Rate</span>
          <div className="flex items-center gap-3">
            <span className="text-[11px]" style={{ color: 'var(--ink-faint)' }}>4%</span>
            <input type="range" min={4.0} max={15.0} step={0.25} value={profitRate}
              onChange={e => setProfitRate(parseFloat(e.target.value))}
              className="w-48" style={{ accentColor: 'var(--signal)' }} />
            <span className="text-[11px]" style={{ color: 'var(--ink-faint)' }}>15%</span>
          </div>
          <span className="text-sm font-bold tabular px-3 py-1 rounded" style={{ background: 'var(--navy-950)', color: 'var(--panel)' }}>
            {profitRate.toFixed(2)}%
          </span>
        </div>

        <p className="text-[11px] pt-2 leading-relaxed" style={{ color: 'var(--ink-faint)' }}>
          Capacity is the minimum of four SAMA-aligned ceilings:{' '}
          <span className="font-semibold" style={{ color: 'var(--ink-muted)' }}>DSCR ≥ 1.25×</span>,{' '}
          <span className="font-semibold" style={{ color: 'var(--ink-muted)' }}>Debt/EBITDA ≤ 3.5×</span>,{' '}
          <span className="font-semibold" style={{ color: 'var(--ink-muted)' }}>D/E ≤ 2.0×</span>, and{' '}
          <span className="font-semibold" style={{ color: 'var(--ink-muted)' }}>ICR ≥ 2.0×</span>.
          EBIT, equity, and debt are sourced from uploaded financials and held static.
        </p>
      </div>
    </div>
  );
}
