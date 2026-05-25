// API contract types for POST /api/computeAssessment

export type Industry = 'Construction' | 'Logistics' | 'Retail' | 'SaaS';

export interface ComputeAssessmentRequest {
  // Core income-statement and balance-sheet fields
  revenue: number;
  expenses: number;
  currentAssets: number;
  currentLiabilities: number;
  totalAssets: number;
  totalDebt: number;
  equity: number;
  cashFlow: number;

  /** Drives industry-specific benchmark thresholds for scoring and knockout logic. */
  industry: Industry;

  /** Interest Coverage Ratio — optional; omit or pass null when unavailable. */
  icr: number | null;

  /** Debt Service Coverage Ratio — optional; omit or pass null when unavailable. */
  dscr: number | null;

  // Remaining optional fields
  inventory?: number | null;
  interestExpense?: number | null;
  debtService?: number | null;
}

export interface AltmanZScore {
  /** Computed Z''-score value (Private Non-Manufacturing variant). */
  score: number;
  zone: 'Safe' | 'Grey' | 'Distress';
}

export interface ComputeAssessmentResponse {
  altmanZScore: AltmanZScore;
  /**
   * Raw probability of default in the range [0, 1].
   * Render as a percentage: `(value * 100).toFixed(2) + '%'`
   * Traffic-light thresholds: < 0.20 → green, 0.20–0.60 → amber, > 0.60 → red.
   */
  probabilityOfDefault: number;
}

/** One month entry returned inside the `forecast` array from POST /api/forecast. */
export interface MonthForecast {
  month: string;
  forecastedCashFlow: number;
  upperBound?: number | null;
  lowerBound?: number | null;
  dscr?: number | null;
  quickRatio?: number | null;
  currentRatio?: number | null;
  /** ML-predicted probability of default for this specific month (range [0, 1]). */
  probabilityOfDefault: number;
}
