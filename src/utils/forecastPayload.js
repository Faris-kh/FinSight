// UC4: Field keys used for ML payload completeness documentation
export const FINANCIAL_FIELD_KEYS = [
  'revenue', 'expenses', 'currentAssets', 'currentLiabilities',
  'totalAssets', 'totalDebt', 'equity', 'cashFlow',
  'inventory', 'interestExpense', 'debtService',
];

/** Parse a CSV cell — null when unmapped, blank, or non-numeric (never coerce to 0). */
export function parseMappedNumeric(raw) {
  if (raw === undefined || raw === null || raw === '') return null;
  const n = Number(raw);
  return Number.isFinite(n) ? n : null;
}

/** Build one historical month from a CSV row — missing metrics stay null. */
export function buildHistoricalMonthFromRow(row, fieldMappings, monthLabel) {
  const get = (field) => {
    const col = fieldMappings[field];
    if (!col || row[col] === undefined || row[col] === '') return null;
    return parseMappedNumeric(row[col]);
  };
  return {
    month: monthLabel,
    revenue: get('revenue'),
    expenses: get('expenses'),
    cashFlow: get('cashFlow'),
    currentAssets: get('currentAssets'),
    currentLiabilities: get('currentLiabilities'),
    totalAssets: get('totalAssets'),
    totalDebt: get('totalDebt'),
    equity: get('equity'),
    inventory: get('inventory'),
    interestExpense: get('interestExpense'),
    debtService: get('debtService'),
  };
}

/**
 * Compute forecast confidence tier from months of genuine (non-null) cash flow history.
 * Only real values count — synthetic or estimated months (cashFlow === null) are excluded.
 * Thresholds: ≥24 months → "narrow", 12–23 → "standard", <12 → "wide".
 * Defaults to "standard" if the array is absent or malformed.
 */
export function getHistoryConfidenceTier(historicalMonths) {
  if (!Array.isArray(historicalMonths)) return 'standard';
  const realMonths = historicalMonths.filter(m => m != null && m.cashFlow != null).length;
  if (realMonths >= 24) return 'narrow';
  if (realMonths >= 12) return 'standard';
  return 'wide';
}

// F-08: buildForecastRequestBody and its helpers (countValidFinancialFields, getConfidenceTier,
// normalizeHistoricalTo12Months, EMPTY_MONTH) were removed. The function returned a different
// API shape (monthly `data` array) from what /api/forecast actually expects (historicalCashFlows
// array + individual balance-sheet fields). Both call sites (runStressTest, LoanRecommendationCard)
// build their payloads inline — each correctly shaped for its endpoint.
