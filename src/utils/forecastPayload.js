// UC4: Field keys used for ML payload completeness and confidence tiering
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

/** Count non-null numeric fields on the annual financialData object. */
export function countValidFinancialFields(data) {
  return FINANCIAL_FIELD_KEYS.filter((key) => {
    const v = data[key];
    return v != null && v !== '' && Number.isFinite(Number(v));
  }).length;
}

/** Map valid field count to backend confidence tier label. */
export function getConfidenceTier(validCount) {
  if (validCount >= 7) return 'High Confidence';
  if (validCount >= 4) return 'Moderate Confidence';
  return 'Low Confidence';
}

const EMPTY_MONTH = {
  revenue: null, expenses: null, cashFlow: null,
  currentAssets: null, currentLiabilities: null,
  totalAssets: null, totalDebt: null, equity: null,
  inventory: null, interestExpense: null, debtService: null,
};

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

/** Pad or trim to exactly 12 months for the ML endpoint. */
export function normalizeHistoricalTo12Months(months) {
  const normalized = months.map((m) => ({ ...EMPTY_MONTH, ...m, month: m.month }));
  while (normalized.length < 12) {
    normalized.push({ ...EMPTY_MONTH, month: `Month ${normalized.length + 1}` });
  }
  return normalized.slice(0, 12);
}

/** Assemble POST /api/forecast body with null-preserving 12-month series. */
export function buildForecastRequestBody(financialData) {
  const validCount = countValidFinancialFields(financialData);
  const confidenceTier = getConfidenceTier(validCount);
  const sourceMonths = financialData.historicalMonths?.length
    ? financialData.historicalMonths
    : (financialData.monthlyRevenue || []).map((m) => ({
        month: m.month,
        revenue: m.revenue ?? null,
        expenses: m.expenses ?? null,
        cashFlow: m.cashFlow ?? null,
        currentAssets: null,
        currentLiabilities: null,
        totalAssets: null,
        totalDebt: null,
        equity: null,
        inventory: null,
        interestExpense: null,
        debtService: null,
      }));

  const data = normalizeHistoricalTo12Months(sourceMonths).map((m) => ({
    month: m.month,
    revenue: m.revenue ?? null,
    expenses: m.expenses ?? null,
    cashFlow: m.cashFlow ?? null,
    currentAssets: m.currentAssets ?? null,
    currentLiabilities: m.currentLiabilities ?? null,
    totalAssets: m.totalAssets ?? null,
    totalDebt: m.totalDebt ?? null,
    equity: m.equity ?? null,
    inventory: m.inventory ?? null,
    interestExpense: m.interestExpense ?? null,
    debtService: m.debtService ?? null,
  }));

  return {
    confidenceTier,
    data,
    revenue: financialData.revenue ?? null,
    expenses: financialData.expenses ?? null,
    currentAssets: financialData.currentAssets ?? null,
    currentLiabilities: financialData.currentLiabilities ?? null,
    totalAssets: financialData.totalAssets ?? null,
    totalDebt: financialData.totalDebt ?? null,
    equity: financialData.equity ?? null,
    cashFlow: financialData.cashFlow ?? null,
    inventory: financialData.inventory ?? null,
    interestExpense: financialData.interestExpense ?? null,
    debtService: financialData.debtService ?? null,
  };
}
