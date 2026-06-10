import React, { useState, useEffect, useRef } from 'react';
import { Upload, FileText, CheckCircle, AlertTriangle, XCircle, Calculator, TrendingUp, Settings, Save, BarChart3, ArrowRight, ArrowLeft, Building2, DollarSign, Circle, Brain, Zap, X } from 'lucide-react';
import LoanRecommendationCard from './LoanRecommendationCard';
import { demoDatasets, demoProfiles, DEMO_COLUMNS, processDemoDataset } from './utils/demoData';
import {
  parseMappedNumeric,
  buildHistoricalMonthFromRow,
  getHistoryConfidenceTier,
} from './utils/forecastPayload';
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area, ComposedChart, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ReferenceLine } from 'recharts';

// UC5: Industry benchmark thresholds — drives all scoring and knockout logic (7-ratio system)
const industryStandards = {
  SaaS: {
    minEBITDAMargin: 15, minDSCR: 1.15, minCurrentRatio: 1.2,
    maxDebtEquity: 0.5, minROA: 10, minQuickRatio: 1.0, minICR: 3.0
  },
  Retail: {
    minEBITDAMargin: 5, minDSCR: 1.25, minCurrentRatio: 1.0,
    maxDebtEquity: 1.5, minROA: 5, minQuickRatio: 0.8, minICR: 2.0
  },
  Construction: {
    minEBITDAMargin: 10, minDSCR: 1.40, minCurrentRatio: 1.5,
    maxDebtEquity: 2.0, minROA: 4, minQuickRatio: 0.9, minICR: 2.0
  },
  Logistics: {
    minEBITDAMargin: 8, minDSCR: 1.20, minCurrentRatio: 1.2,
    maxDebtEquity: 2.0, minROA: 4, minQuickRatio: 0.8, minICR: 2.0
  },
  Manufacturing: {
    minEBITDAMargin: 15, minDSCR: 1.25, minCurrentRatio: 1.5,
    maxDebtEquity: 2.5, minROA: 5, minQuickRatio: 0.8, minICR: 2.5
  },
  Tourism: {
    minEBITDAMargin: 25, minDSCR: 1.35, minCurrentRatio: 1.1,
    maxDebtEquity: 3.0, minROA: 6, minQuickRatio: 0.9, minICR: 2.0
  },
  Healthcare: {
    minEBITDAMargin: 20, minDSCR: 1.20, minCurrentRatio: 1.5,
    maxDebtEquity: 2.0, minROA: 10, minQuickRatio: 1.2, minICR: 3.0
  },
  Default: {
    minEBITDAMargin: 10, minDSCR: 1.25, minCurrentRatio: 1.2,
    maxDebtEquity: 1.5, minROA: 5, minQuickRatio: 0.8, minICR: 2.0
  }
};

// ── Persistent Navigation Bar ──────────────────────────────────────────────
function NavBar({ currentPage, setCurrentPage, financialData, assessmentResults, portfolio }) {
  const handleLogout = () => {
    localStorage.removeItem('finsight_auth');
    window.location.href = '/';
  };
  const user = (() => {
    try { return JSON.parse(localStorage.getItem('finsight_current_user') || 'null'); }
    catch { return null; }
  })();
  const links = [
    { key: 'upload',     label: 'Upload',    enabled: true },
    { key: 'dashboard',  label: 'Dashboard', enabled: !!financialData },
    { key: 'assessment', label: 'Assessment',enabled: !!assessmentResults },
    { key: 'portfolio',  label: 'History',   enabled: true, badge: portfolio.length > 0 ? portfolio.length : null },
  ];
  return (
    <header className="sticky top-0 z-20 h-12 flex items-center px-8 gap-6 shrink-0"
      style={{ background: 'var(--navy-950)', borderBottom: '1px solid var(--navy-800)' }}>
      <img src="/logo.png" alt="FinSight" className="h-8 w-auto" />
      <div className="h-4 w-px shrink-0" style={{ background: 'var(--navy-800)' }} />
      <nav className="flex items-center gap-0.5">
        {links.map(({ key, label, enabled, badge }) => {
          const active = currentPage === key;
          return (
            <button key={key} onClick={() => enabled && setCurrentPage(key)}
              className="relative px-3 py-1.5 text-sm font-medium rounded transition-colors"
              style={{ color: active ? '#fff' : enabled ? 'oklch(0.75 0.015 75)' : 'oklch(0.38 0.04 200)', cursor: enabled ? 'pointer' : 'not-allowed' }}>
              {label}
              {badge != null && (
                <span className="ml-1 text-[10px] font-bold tabular px-1.5 py-0.5 rounded-full"
                  style={{ background: 'var(--navy-800)', color: 'oklch(0.66 0.02 75)' }}>
                  {badge}
                </span>
              )}
              {active && (
                <div className="absolute bottom-0 left-2 right-2 h-0.5"
                  style={{ background: 'var(--signal)', borderRadius: '1px' }} />
              )}
            </button>
          );
        })}
      </nav>
      <div className="ml-auto flex items-center gap-4">
        <div className="text-right leading-tight">
          <p className="text-xs font-semibold" style={{ color: 'var(--panel)' }}>{user?.name || 'Analyst'}</p>
          <p style={{ fontSize: '10px', color: 'oklch(0.48 0.035 200)' }}>{user?.institution || 'IMSIU'}</p>
        </div>
        <button onClick={handleLogout} className="text-xs font-semibold px-3 py-1.5 rounded transition-colors"
          style={{ color: 'var(--danger)' }}>
          Log Out
        </button>
      </div>
    </header>
  );
}

export default function FinSightApp() {

  // --- App state ---
  const [currentPage, setCurrentPage] = useState('upload');
  const [uploadedFile, setUploadedFile] = useState(null);
  const [financialData, setFinancialData] = useState(null);       // source of truth from CSV/manual entry
  const [assessmentResults, setAssessmentResults] = useState(null); // snapshot after UC5 runs
  const [forecastData, setForecastData] = useState(null);         // UC4 backend response
  const [isForecasting, setIsForecasting] = useState(false);
  const [isStressTestActive, setIsStressTestActive] = useState(false);
  const [activeForecastMonth, setActiveForecastMonth] = useState(1);
  const [isScenarioMode, setIsScenarioMode] = useState(false);    // What-If sandbox toggle
  const [scenarioData, setScenarioData] = useState(null);         // deep copy of financialData for sandbox
  const [scenarioMlData, setScenarioMlData] = useState(null);     // ML PoD/Z-Score overlay for Scenario Mode
  const [scenarioMlError, setScenarioMlError] = useState(false);  // true when the last scenario ML call failed
  const scenarioDebounceRef = useRef(null);
  const [selectedIndustry, setSelectedIndustry] = useState('');
  const [showSettings, setShowSettings] = useState(false);
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [showDemoModal, setShowDemoModal] = useState(false);
  const [showFieldMapping, setShowFieldMapping] = useState(false);
  const [detectedColumns, setDetectedColumns] = useState([]);
  const [fieldMappings, setFieldMappings] = useState({
    companyName: '', revenue: '', expenses: '',
    currentAssets: '', currentLiabilities: '',
    totalAssets: '', totalLiabilities: '', totalDebt: '', equity: '', cashFlow: '',
    inventory: '', interestExpense: '', debtService: ''
  });
  const [rawFileData, setRawFileData] = useState(null); // original parsed CSV rows, used for trend charts
  const [manualData, setManualData] = useState({
    companyName: '', revenue: '', expenses: '',
    currentAssets: '', currentLiabilities: '',
    totalAssets: '', totalDebt: '', equity: '', cashFlow: '',
    inventory: null, interestExpense: null, debtService: null, totalLiabilities: null
  });
  const [portfolio, setPortfolio] = useState([]); // assessment history, saved on every UC5 run
  const [portfolioViewMeta, setPortfolioViewMeta] = useState(null); // set when opening a saved report from portfolio
  const [thresholds, setThresholds] = useState({  // configurable scoring weights per ratio (7 total)
    currentRatio: { min: 1.2,  weight: 20, label: 'Current Ratio (Min)' },
    debtToEquity: { max: 1.5,  weight: 20, label: 'Debt-to-Equity (Max)' },
    ebitdaMargin: { min: 10,   weight: 15, label: 'EBITDA Margin % (Min)' },
    roa:          { min: 5,    weight: 10, label: 'ROA — EBIT-based % (Min)' },
    dscr:         { min: 1.25, weight: 15, label: 'DSCR (Min)' },
    quickRatio:   { min: 0.8,  weight: 10, label: 'Quick Ratio (Min)' },
    icr:          { min: 2.0,  weight: 10, label: 'Interest Coverage (Min)' }
  });

  // Warm up backend on app load to prevent Render free-tier cold start delay
  useEffect(() => {
    // F-12: use VITE_API_URL like all other calls — not the hardcoded production URL
    fetch(`${import.meta.env.VITE_API_URL}/`)
      .catch(() => {}); // silent fail — just waking the server
  }, []);

  // F-05 + F-02: debounced scenario ML re-fetch — fires 600 ms after each slider change,
  // so the ML backend is called at rest, not on every tick.
  // scenarioMlData is merged into activeResults below so PoD + Z-Score update as sliders move.
  useEffect(() => {
    if (!isScenarioMode || !scenarioData) return;
    clearTimeout(scenarioDebounceRef.current);
    scenarioDebounceRef.current = setTimeout(() => fetchScenarioMl(scenarioData), 600);
    return () => { clearTimeout(scenarioDebounceRef.current); };
  }, [scenarioData]); // eslint-disable-line react-hooks/exhaustive-deps

  const COLORS = ['oklch(0.24 0.045 200)', 'oklch(0.30 0.045 200)', 'oklch(0.38 0.04 200)', 'oklch(0.48 0.035 200)', 'oklch(0.66 0.02 75)'];

  // F-21: quote-aware CSV row parser — handles fields like "Al Noor, LLC" without splitting on the embedded comma
  const parseCSVLine = (line) => {
    const result = [];
    let current = '';
    let inQuotes = false;
    for (let i = 0; i < line.length; i++) {
      const ch = line[i];
      if (ch === '"') {
        if (inQuotes && line[i + 1] === '"') { current += '"'; i++; } // escaped quote
        else { inQuotes = !inQuotes; }
      } else if (ch === ',' && !inQuotes) {
        result.push(current.trim());
        current = '';
      } else {
        current += ch;
      }
    }
    result.push(current.trim());
    return result;
  };

  // UC1: Parse uploaded CSV — reads headers and all rows into rawFileData state
  const handleFileChange = async (e) => {
    const selectedFile = e.target.files[0];
    if (selectedFile) {
      setUploadedFile(selectedFile);
      const reader = new FileReader();
      reader.onload = (event) => {
        const text = event.target.result;
        const lines = text.split('\n').filter(line => line.trim());
        if (lines.length < 2) {
          alert('File appears empty or invalid. Please use manual entry.');
          return;
        }
        // F-21: use quote-aware parser so company names with commas don't corrupt column indices
        const headers = parseCSVLine(lines[0]);
        const firstDataRow = parseCSVLine(lines[1]);
        const rowData = {};
        headers.forEach((header, index) => {
          const value = firstDataRow[index];
          rowData[header] = isNaN(value) ? value : parseFloat(value);
        });
        setDetectedColumns(headers);
        setRawFileData({
          columns: headers,
          sampleRow: rowData,
          allRows: lines.slice(1).map(line => {
            const values = parseCSVLine(line);
            const row = {};
            headers.forEach((h, i) => {
              const val = values[i];
              row[h] = isNaN(val) ? val : parseFloat(val);
            });
            return row;
          })
        });
        const autoMappings = autoMapFields(headers);
        setFieldMappings(autoMappings);
        setShowFieldMapping(true);
      };
      reader.onerror = () => {
        alert('Error reading file. Please try manual entry instead.');
      };
      if (selectedFile.name.endsWith('.csv') || selectedFile.type === 'text/csv') {
        reader.readAsText(selectedFile);
      } else {
        alert('Please upload a CSV file, or use Manual Data Entry for other formats.');
        setShowManualEntry(true);
      }
    }
  };

  // UC1: Auto-mapping — matches CSV column names to required financial fields
  // Order matters: specific rules run before broad ones to prevent column collision
  const autoMapFields = (columns) => {
    const mappings = {
      companyName: '', revenue: '', expenses: '',
      currentAssets: '', currentLiabilities: '',
      totalAssets: '', totalLiabilities: '', totalDebt: '', equity: '', cashFlow: '',
      inventory: '', interestExpense: '', debtService: ''
    };
    const matchRules = [
      { field: 'companyName',        keywords: ['company_name', 'business_name', 'firm_name', 'company', 'business', 'firm'] },
      { field: 'currentLiabilities', keywords: ['current_liabilities', 'current_liab', 'curr_liab', 'current_debt'] },
      { field: 'currentAssets',      keywords: ['current_assets', 'current_asset', 'curr_assets'] },
      { field: 'totalAssets',        keywords: ['total_assets', 'total_asset', 'totalassets'] },
      // totalLiabilities must run before totalDebt — 'total_liabilities' now maps to the correct field
      { field: 'totalLiabilities',   keywords: ['total_liabilities', 'total_liab', 'liabilities'] },
      { field: 'totalDebt',          keywords: ['total_debt', 'long_term_debt'] },
      { field: 'revenue',            keywords: ['revenue', 'sales', 'turnover', 'total_income'] },
      { field: 'expenses',           keywords: ['expenses', 'expense', 'total_cost', 'cogs', 'operating_expenses'] },
      { field: 'equity',             keywords: ['equity', 'shareholders_equity', 'shareholder_equity', 'capital'] },
      { field: 'cashFlow',           keywords: ['cash_flow', 'cashflow', 'operating_cash', 'net_cash'] },
      { field: 'inventory',          keywords: ['inventory', 'inventories', 'stock', 'goods'] },
      { field: 'interestExpense',    keywords: ['interest_expense', 'interest_cost', 'profit_charge', 'finance_cost', 'financing_cost'] },
      { field: 'debtService',        keywords: ['debt_service', 'loan_payment', 'loan_repayment', 'annual_debt_service'] },
    ];
    const usedColumns = new Set(); // prevents two fields claiming the same column
    matchRules.forEach(({ field, keywords }) => {
      if (mappings[field]) return;
      for (const col of columns) {
        if (usedColumns.has(col)) continue;
        const colLower = col.toLowerCase().replace(/\s+/g, '_');
        const matched = keywords.some(keyword => colLower === keyword || colLower.includes(keyword));
        if (matched) {
          mappings[field] = col;
          usedColumns.add(col);
          break;
        }
      }
    });
    return mappings;
  };

  const handleFieldMappingChange = (field, column) => {
    setFieldMappings({ ...fieldMappings, [field]: column });
  };

  // UC1: Data Pipeline (ETL & Annualization)
  // Sums income statement fields across all rows (flow figures)
  // Takes balance sheet from the last row only (point-in-time figures)
  // Annualizes to 12-month run-rate if fewer than 12 rows uploaded
  const processDataWithMappings = () => {
    const rows = rawFileData.allRows;
    const numRows = rows.length;
    if (numRows === 0) {
      alert("No data rows found in the uploaded file.");
      return;
    }

    let sumRevenue = null, sumExpenses = null, sumCashFlow = null;
    const monthlyRevenue = [];
    const historicalMonths = [];

    const addToSum = (sum, val) => (val != null ? (sum ?? 0) + val : sum);

    // Find date/month column for chart X-axis labels
    const monthColName = rawFileData.columns.find(col =>
      col.toLowerCase().includes('month') || col.toLowerCase().includes('date')
    );

    rows.forEach((row, idx) => {
      const getMappedNum = (field) => {
        const mappedColumn = fieldMappings[field];
        if (!mappedColumn || row[mappedColumn] === undefined || row[mappedColumn] === '') return null;
        return parseMappedNumeric(row[mappedColumn]);
      };

      const rowRev = getMappedNum('revenue');
      const rowExp = getMappedNum('expenses');
      const rowCFMapped = getMappedNum('cashFlow');

      sumRevenue   = addToSum(sumRevenue, rowRev);
      sumExpenses  = addToSum(sumExpenses, rowExp);
      sumCashFlow  = addToSum(sumCashFlow, rowCFMapped);

      const monthLabel = monthColName && row[monthColName] ? row[monthColName] : `Month ${idx + 1}`;

      historicalMonths.push(buildHistoricalMonthFromRow(row, fieldMappings, monthLabel));

      // Chart-only estimates — do not overwrite nulls sent to the ML payload
      let rowCFChart = rowCFMapped;
      if (rowCFChart == null && rowRev != null && rowRev > 0) {
        rowCFChart = (rowRev - (rowExp ?? rowRev * 0.75)) * 0.8;
      }
      const chartExp = rowExp ?? (rowRev != null ? rowRev * 0.75 : null);

      monthlyRevenue.push({
        month: monthLabel,
        revenue: rowRev ?? 0,
        expenses: chartExp ?? 0,
        profit: (rowRev ?? 0) - (chartExp ?? 0),
        cashFlow: rowCFChart ?? 0,
      });
    });

    // Scale to 12-month run-rate for ML model input (null if nothing was mapped)
    const annualizationFactor = numRows < 12 ? (12 / numRows) : 1;
    const annualizedRevenue  = sumRevenue  != null ? Math.round(sumRevenue  * annualizationFactor) : null;
    const annualizedExpenses = sumExpenses != null ? Math.round(sumExpenses * annualizationFactor) : null;
    const annualizedCashFlow = sumCashFlow != null ? Math.round(sumCashFlow * annualizationFactor) : null;

    // Balance sheet: most recent row only — null when unmapped or blank
    const lastRow = rows[numRows - 1];
    const getLatestMappedNum = (field) => {
      const mappedColumn = fieldMappings[field];
      if (!mappedColumn || lastRow[mappedColumn] === undefined || lastRow[mappedColumn] === '') return null;
      const parsed = parseMappedNumeric(lastRow[mappedColumn]);
      return parsed != null ? Math.round(parsed) : null;
    };

    let currentAssets      = getLatestMappedNum('currentAssets');
    let currentLiabilities = getLatestMappedNum('currentLiabilities');
    let totalAssets        = getLatestMappedNum('totalAssets');
    let totalLiabilities   = getLatestMappedNum('totalLiabilities');
    let totalDebt          = getLatestMappedNum('totalDebt');
    let equity             = getLatestMappedNum('equity');

    // Derive missing equity or debt only from mapped balance-sheet values (no synthetic defaults)
    if (equity == null && totalAssets != null && totalDebt != null)
      equity = Math.round(totalAssets - totalDebt);
    else if (totalDebt == null && totalAssets != null && equity != null)
      totalDebt = Math.round(totalAssets - equity);

    let companyName = uploadedFile?.name?.replace(/\.[^/.]+$/, '') || 'Unknown Company';
    if (fieldMappings.companyName && lastRow[fieldMappings.companyName]) {
      companyName = lastRow[fieldMappings.companyName];
    }

    // Optional fields — null when CSV column not mapped (not the same as 0)
    let inventoryVal = getLatestMappedNum('inventory');

    let interestExpenseSum = null;
    if (fieldMappings.interestExpense) {
      let sum = 0;
      let hasAny = false;
      rows.forEach((row) => {
        const v = parseMappedNumeric(row[fieldMappings.interestExpense]);
        if (v != null) { sum += v; hasAny = true; }
      });
      interestExpenseSum = hasAny ? Math.round(sum * annualizationFactor) : null;
    }

    let debtServiceSum = null;
    if (fieldMappings.debtService) {
      let sum = 0;
      let hasAny = false;
      rows.forEach((row) => {
        const v = parseMappedNumeric(row[fieldMappings.debtService]);
        if (v != null) { sum += v; hasAny = true; }
      });
      debtServiceSum = hasAny ? Math.round(sum * annualizationFactor) : null;
    }

    setFinancialData({
      companyName,
      revenue:            annualizedRevenue,
      expenses:           annualizedExpenses,
      currentAssets,
      currentLiabilities,
      totalAssets,
      totalDebt,
      equity,
      cashFlow:           annualizedCashFlow,
      totalLiabilities,
      inventory:          inventoryVal,
      interestExpense:    interestExpenseSum,
      debtService:        debtServiceSum,
      historicalMonths,
      monthlyRevenue,
    });
    setShowFieldMapping(false);
  };

  // UC4: Stress Test — sends annualized financials to FastAPI, receives 6-month LightGBM prediction
  const runStressTest = async () => {
    setIsForecasting(true);
    try {
      const confidenceTier = getHistoryConfidenceTier(financialData.historicalMonths);
      const forecastPayload = {
        // F-09: historicalMonths preserves null for unmapped cashFlow; monthlyRevenue carries chart estimates
        historicalCashFlows: (financialData.historicalMonths ?? []).map(m => m.cashFlow ?? null),
        // F-11: send null for unmapped balance-sheet fields — 0 and "not provided" must not be conflated
        currentAssets:       financialData.currentAssets       ?? null,
        currentLiabilities:  financialData.currentLiabilities  ?? null,
        totalAssets:         financialData.totalAssets          ?? null,
        totalDebt:           financialData.totalDebt            ?? null,
        equity:              financialData.equity               ?? null,
        totalLiabilities:    financialData.totalLiabilities ?? (financialData.totalAssets - financialData.equity) ?? 0,
        inventory:           financialData.inventory            ?? null,
        debtService:         financialData.debtService          ?? null,
        interest_expense:    financialData.interestExpense      ?? null,
        industry:            selectedIndustry,
        revenue:             financialData.revenue              ?? 0,
        expenses:            financialData.expenses             ?? 0,
        retainedEarnings:    financialData.retainedEarnings     ?? null,
        confidenceTier,
      };

      console.log('[runStressTest] interest_expense →', forecastPayload.interest_expense);
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/forecast`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(forecastPayload),
      });

      if (!response.ok) {
        const err = await response.json();
        // Properly format the JSON array so it is readable in the alert box
        const errorMessage = typeof err.detail === 'string' 
          ? err.detail 
          : JSON.stringify(err.detail, null, 2);
          
        alert('Forecast API Error:\n' + errorMessage);
        setIsForecasting(false);
        return;
      }

      const rawForecastResponse = await response.json();

      // Accept both new (forecast_ratios) and legacy (forecastedCashflow/Flow) array shapes
      const forecastArray = rawForecastResponse.forecast_ratios
        || rawForecastResponse.forecastedCashflow
        || rawForecastResponse.forecastedCashFlow
        || [];

      if (!forecastArray.length) {
        alert('Forecast error: backend returned no 6-month forecast data.');
        setIsForecasting(false);
        return;
      }

      // Normalise every entry to camelCase once so all downstream reads are consistent.
      // probabilityOfDefault is mapped here — this is the value read by the slider PoD gauge
      // at every forecast month index. Without this, snake_case fields from the backend
      // would silently resolve to undefined and the gauge would always show the static fallback.
      const mappedForecast = forecastArray.map(d => ({
        month:                d.month,
        forecastedCashFlow:   d.forecastedCashFlow  ?? d.forecasted_cash_flow  ?? 0,
        upperBound:           d.upperBound          ?? d.upper_bound           ?? null,
        lowerBound:           d.lowerBound          ?? d.lower_bound           ?? 0,
        dscr:                 d.dscr                ?? null,
        quickRatio:           d.quickRatio          ?? d.quick_ratio           ?? null,
        currentRatio:         d.currentRatio        ?? d.current_ratio         ?? null,
        probabilityOfDefault: d.probabilityOfDefault ?? d.probability_of_default ?? null,
      }));

      // Anchor: insert the last historical point as the first forecast point
      // so both chart lines connect at the boundary without a visual gap
      const historicalData = financialData.monthlyRevenue;
      const lastHistorical = historicalData[historicalData.length - 1];
      const combined = [
        ...historicalData.map(d => ({ month: d.month, actualCashFlow: d.cashFlow })),
        {
          month:              lastHistorical.month,
          actualCashFlow:     lastHistorical.cashFlow,
          forecastedCashFlow: lastHistorical.cashFlow,
          upperBound:         lastHistorical.cashFlow,
          lowerBound:         lastHistorical.cashFlow,
        },
        ...mappedForecast.map(d => ({
          month:              d.month,
          forecastedCashFlow: d.forecastedCashFlow,
          upperBound:         d.upperBound,
          lowerBound:         d.lowerBound,
          dscr:               d.dscr,
          quickRatio:         d.quickRatio,
          currentRatio:       d.currentRatio,
        }))
      ];

      const total   = mappedForecast.reduce((sum, f) => sum + f.forecastedCashFlow, 0);
      const avg     = Math.round(total / mappedForecast.length);
      const first   = mappedForecast[0].forecastedCashFlow;
      const last    = mappedForecast[mappedForecast.length - 1].forecastedCashFlow;
      const change  = (last - first) / Math.abs(first || 1);

      // Negative average overrides trend direction regardless of slope
      let trend;
      if (avg < 0)            trend = 'Declining';
      else if (change > 0.03)  trend = 'Growing';
      else if (change < -0.03) trend = 'Declining';
      else                     trend = 'Stable';

      const forecastMethod = rawForecastResponse.forecast_method ?? rawForecastResponse.forecastMethod ?? null;
      const arimaFellBack  = rawForecastResponse.ARIMA_FAILED_FELL_BACK_TO_DES === true
                          || rawForecastResponse.arima_failed_fell_back_to_des === true;

      setForecastData({
        combined,
        forecast: mappedForecast, // normalised — probabilityOfDefault is always camelCase here
        summary: { avgForecast: avg, totalForecast: Math.round(total), trend, confidenceTier, forecastMethod, arimaFellBack }
      });
      setIsStressTestActive(true);
      setActiveForecastMonth(1);
    } catch (error) {
      console.error("Full forecast error:", error);
      alert('True Error: ' + error.message + '\n\nCheck your browser console (Ctrl+Shift+I) for more details.');
    }
    setIsForecasting(false);
  };

  // UC5: Dynamic 7-ratio assessment builder — shared by computeAssessment and calculateAssessment
  const buildAssessment = (data) => {
    const bench = industryStandards[selectedIndustry] || industryStandards.Default;
    const ebit = data.revenue - data.expenses;

    const currentRatio = data.currentLiabilities > 0
      ? data.currentAssets / data.currentLiabilities
      : (data.currentAssets > 0 ? 999 : 0);
    const hasNegativeEquity = data.equity <= 0;
    const debtToEquity = hasNegativeEquity ? null : (data.equity > 0 ? data.totalDebt / data.equity : 999);
    const ebitdaMargin = data.revenue > 0 ? (ebit / data.revenue) * 100 : 0;
    const roa = data.totalAssets > 0 ? (ebit / data.totalAssets) * 100 : 0;
    const hasDebt = data.totalDebt > 0;

    const hasDebtService = data.debtService != null && data.debtService > 0;
    const dscr = !hasDebt ? null : hasDebtService ? ebit / data.debtService : null;
    const dscrUnavailable = hasDebt && !hasDebtService;

    const hasInventory = data.inventory != null;
    const quickRatio = hasInventory && data.currentLiabilities > 0
      ? (data.currentAssets - data.inventory) / data.currentLiabilities
      : hasInventory ? (data.currentAssets - data.inventory > 0 ? 999 : 0)
      : null;

    const hasInterestExpense = data.interestExpense != null && data.interestExpense > 0;
    const icr = hasInterestExpense ? ebit / data.interestExpense : null;

    const knockouts = [];
    if (hasNegativeEquity)
      knockouts.push('Negative or zero equity — company is technically insolvent');
    if (currentRatio < 0.5)
      knockouts.push('Critical liquidity failure — current ratio below 0.5');
    if (data.cashFlow < 0 && data.totalDebt > 0)
      knockouts.push('Negative cash flow with outstanding debt');
    if (dscr !== null && hasDebt && dscr < bench.minDSCR && thresholds.dscr.weight > 0)
      knockouts.push(`DSCR of ${dscr.toFixed(2)} — below ${selectedIndustry} minimum of ${bench.minDSCR}x`);
    if (icr !== null && icr < 1.0 && thresholds.icr.weight > 0)
      knockouts.push(`Interest Coverage of ${icr.toFixed(2)}x — cannot cover interest payments`);

    // Scores a single ratio 0-100 against the industry benchmark
    const scoreMetric = (value, threshold, type) => {
      if (type === 'min') {
        if (value >= threshold * 1.5) return 100;
        if (value >= threshold)       return 80;
        if (value >= threshold * 0.7) return 60;
        if (value >= threshold * 0.4) return 30;
        return 0;
      } else {
        if (value <= threshold * 0.5) return 100;
        if (value <= threshold)       return 80;
        if (value <= threshold * 1.3) return 60;
        if (value <= threshold * 2.0) return 30;
        return 0;
      }
    };

    const scores = {};
    const activeRatios = [];

    scores.currentRatio = scoreMetric(currentRatio, bench.minCurrentRatio, 'min');
    activeRatios.push({ key: 'currentRatio', label: 'Current Ratio', weight: thresholds.currentRatio.weight });

    scores.debtToEquity = hasNegativeEquity ? 0 : scoreMetric(debtToEquity, bench.maxDebtEquity, 'max');
    activeRatios.push({ key: 'debtToEquity', label: 'Debt-to-Equity', weight: thresholds.debtToEquity.weight });

    scores.ebitdaMargin = scoreMetric(ebitdaMargin, bench.minEBITDAMargin, 'min');
    activeRatios.push({ key: 'ebitdaMargin', label: 'EBITDA Margin', weight: thresholds.ebitdaMargin.weight });

    scores.roa = scoreMetric(roa, bench.minROA, 'min');
    activeRatios.push({ key: 'roa', label: 'ROA (EBIT-based)', weight: thresholds.roa.weight });

    if (dscr !== null) {
      scores.dscr = dscr < 0 ? 0 : scoreMetric(dscr, bench.minDSCR, 'min');
      activeRatios.push({ key: 'dscr', label: 'DSCR', weight: thresholds.dscr.weight });
    } else if (!hasDebt) {
      scores.dscr = 100;
      activeRatios.push({ key: 'dscr', label: 'DSCR', weight: thresholds.dscr.weight });
    }

    if (quickRatio !== null) {
      scores.quickRatio = scoreMetric(quickRatio, bench.minQuickRatio, 'min');
      activeRatios.push({ key: 'quickRatio', label: 'Quick Ratio', weight: thresholds.quickRatio.weight });
    }

    if (icr !== null) {
      scores.icr = scoreMetric(icr, bench.minICR, 'min');
      activeRatios.push({ key: 'icr', label: 'Interest Coverage', weight: thresholds.icr.weight });
    }

    const totalActiveWeight = activeRatios.reduce((sum, r) => sum + r.weight, 0);
    const weightedScore = activeRatios.reduce((sum, r) => {
      const normalizedWeight = r.weight / totalActiveWeight;
      return sum + (scores[r.key] * normalizedWeight);
    }, 0);

    const droppedRatios = [];
    if (quickRatio === null) droppedRatios.push('Quick Ratio (inventory data not provided)');
    if (icr === null && hasDebt) droppedRatios.push('Interest Coverage Ratio (interest expense not provided)');
    if (dscrUnavailable) droppedRatios.push('DSCR (annual debt service amount not provided)');

    const overallScore = knockouts.length > 0 ? Math.min(weightedScore, 30) : weightedScore;
    const decision = knockouts.length > 0 ? 'REJECTED' : overallScore >= 70 ? 'APPROVED' : overallScore >= 50 ? 'REVIEW' : 'REJECTED';

    // Altman Z''-Score — Private Non-Manufacturing variant
    // Z'' = 6.56(X1) + 3.26(X2) + 6.72(X3) + 1.05(X4)
    const zX1 = data.totalAssets > 0 ? (data.currentAssets - data.currentLiabilities) / data.totalAssets : 0;
    const zX2 = data.totalAssets > 0 ? data.equity / data.totalAssets : 0;
    const zX3 = data.totalAssets > 0 ? ebit / data.totalAssets : 0;
    const zX4 = data.totalDebt > 0 ? data.equity / data.totalDebt : 0;
    const altmanRaw = 6.56 * zX1 + 3.26 * zX2 + 6.72 * zX3 + 1.05 * zX4;
    const altmanZone = altmanRaw > 2.6 ? 'Safe' : altmanRaw >= 1.1 ? 'Grey' : 'Distress';

    return {
      ratios: {
        currentRatio: currentRatio.toFixed(2),
        debtToEquity: hasNegativeEquity ? 'N/A (Negative Equity)' : debtToEquity.toFixed(2),
        ebitdaMargin: ebitdaMargin.toFixed(2),
        roa: roa.toFixed(2),
        dscr: !hasDebt ? 'N/A (No Debt)' : dscr !== null ? dscr.toFixed(2) : 'Unavailable',
        quickRatio: quickRatio !== null ? quickRatio.toFixed(2) : null,
        icr: icr !== null ? icr.toFixed(2) : null
      },
      scores,
      activeRatios,
      droppedRatios,
      overallScore: overallScore.toFixed(1),
      decision,
      knockouts,
      altmanZScore: { score: parseFloat(altmanRaw.toFixed(2)), zone: altmanZone },
      strengths: [
        ...(scores.currentRatio >= 80 ? ['Strong liquidity position'] : []),
        ...(!hasNegativeEquity && scores.debtToEquity >= 80 ? ['Low debt relative to equity'] : []),
        ...(scores.ebitdaMargin >= 80 ? ['Healthy operating margins'] : []),
        ...(scores.roa >= 80 ? ['Strong return on assets'] : []),
        ...(!hasDebt || (scores.dscr && scores.dscr >= 80) ? ['Strong debt service capacity'] : []),
        ...(scores.quickRatio && scores.quickRatio >= 80 ? ['Strong quick liquidity (excluding inventory)'] : []),
        ...(scores.icr && scores.icr >= 80 ? ['Comfortable interest coverage'] : []),
      ],
      weaknesses: [
        ...(scores.currentRatio < 60 ? ['Weak liquidity — current assets may not cover short-term obligations'] : []),
        ...(hasNegativeEquity ? ['Negative equity — liabilities exceed assets'] : scores.debtToEquity < 60 ? ['High debt levels relative to equity'] : []),
        ...(scores.ebitdaMargin < 60 ? ['Low or negative operating margin'] : []),
        ...(scores.roa < 60 ? ['Poor return on assets — inefficient use of asset base'] : []),
        ...(hasDebt && scores.dscr && scores.dscr < 60 ? ['Insufficient cash flow to comfortably service debt'] : []),
        ...(dscrUnavailable ? ['⚠️ DSCR could not be calculated — debt service data not provided'] : []),
        ...(scores.quickRatio && scores.quickRatio < 60 ? ['Weak quick liquidity — reliant on inventory to cover obligations'] : []),
        ...(scores.icr && scores.icr < 60 ? ['Low interest coverage — earnings barely cover interest payments'] : []),
      ]
    };
  };

  // UC5 (Scenario): Pure assessment engine — takes any data object, returns results without touching state
  // Used by the What-If sandbox for real-time recalculation as sliders move
  const computeAssessment = (data) => buildAssessment(data);

  // UC5: Scoring Engine — dynamic up to 7 ratios, applies knockouts, produces APPROVED/REVIEW/REJECTED
  // Navigates immediately with local results; ML PoD/Z-Score resolves async in the background.
  const calculateAssessment = async () => {
    // Reset any stale forecast state from a prior run so the stress-test and loan modules
    // start un-fetched on the fresh assessment page.
    setIsStressTestActive(false);
    setForecastData(null);

    // Local scoring engine is synchronous — instant
    const result = buildAssessment(financialData);
    const { ratios, scores, activeRatios, droppedRatios, overallScore, decision, knockouts, strengths, weaknesses, altmanZScore } = result;

    const entryId = Date.now();
    const baseSnapshot = { ratios, scores, activeRatios, droppedRatios, overallScore, decision, knockouts, strengths, weaknesses, altmanZScore, probabilityOfDefault: null, mlFailed: false };

    // Persist portfolio entry immediately with local data (PoD will be patched in below)
    const portfolioEntry = {
      id: entryId,
      companyName: financialData.companyName,
      assessedAt: new Date().toLocaleDateString('en-SA'),
      overallScore,
      decision,
      industry: selectedIndustry,
      ratios: {
        currentRatio: ratios.currentRatio,
        debtToEquity: ratios.debtToEquity.includes('N/A') ? 'N/A' : ratios.debtToEquity,
        ebitdaMargin: ratios.ebitdaMargin,
        roa: ratios.roa,
        dscr: ratios.dscr.includes('N/A') || ratios.dscr === 'Unavailable' ? 'N/A' : ratios.dscr,
        quickRatio: ratios.quickRatio !== null ? ratios.quickRatio : 'N/A',
        icr: ratios.icr !== null ? ratios.icr : 'N/A'
      },
      revenue: financialData.revenue,
      knockouts: knockouts.length,
      activeRatioCount: activeRatios.length,
      totalPossibleRatios: 7,
      assessmentSnapshot: baseSnapshot,
      financialSnapshot: JSON.parse(JSON.stringify(financialData)),
    };
    setPortfolioViewMeta(null);
    setPortfolio(prev => {
      const exists = prev.findIndex(p => p.companyName === financialData.companyName);
      if (exists >= 0) { const updated = [...prev]; updated[exists] = portfolioEntry; return updated; }
      return [...prev, portfolioEntry];
    });

    // Navigate immediately — user sees the assessment page with local results right away
    setAssessmentResults(baseSnapshot);
    setCurrentPage('assessment');

    // ML call continues in background — patches PoD and Z-Score into state when resolved
    try {
      const ebit = financialData.revenue - financialData.expenses;
      const mlRes = await fetch(`${import.meta.env.VITE_API_URL}/api/computeAssessment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          revenue: financialData.revenue,
          expenses: financialData.expenses,
          currentAssets: financialData.currentAssets,
          currentLiabilities: financialData.currentLiabilities,
          totalAssets: financialData.totalAssets,
          totalDebt: financialData.totalDebt,
          equity: financialData.equity,
          cashFlow: financialData.cashFlow,
          industry: selectedIndustry,
          icr: (financialData.interestExpense != null && financialData.interestExpense > 0)
            ? ebit / financialData.interestExpense : null,
          dscr: (financialData.totalDebt > 0 && financialData.debtService != null && financialData.debtService > 0)
            ? ebit / financialData.debtService : null,
          inventory: financialData.inventory ?? null,
          interestExpense: financialData.interestExpense ?? null,
          debtService: financialData.debtService ?? null,
        }),
      });
      if (mlRes.ok) {
        const ml = await mlRes.json();
        setAssessmentResults(prev => prev ? { ...prev, altmanZScore: ml.altmanZScore, probabilityOfDefault: ml.probabilityOfDefault } : prev);
        setPortfolio(prev => prev.map(p => p.id === entryId
          ? { ...p, assessmentSnapshot: { ...p.assessmentSnapshot, altmanZScore: ml.altmanZScore, probabilityOfDefault: ml.probabilityOfDefault } }
          : p
        ));
      } else {
        // F-14: ML non-OK — retain local Z-Score but disclose fallback to user
        console.error('[calculateAssessment] computeAssessment returned', mlRes.status);
        setAssessmentResults(prev => prev ? { ...prev, mlFailed: true } : prev);
        setPortfolio(prev => prev.map(p => p.id === entryId
          ? { ...p, assessmentSnapshot: { ...p.assessmentSnapshot, mlFailed: true } }
          : p
        ));
      }
    } catch (err) {
      console.error('[calculateAssessment] computeAssessment network error:', err);
      // F-14: network failure — retain local Z-Score but disclose fallback to user
      setAssessmentResults(prev => prev ? { ...prev, mlFailed: true } : prev);
      setPortfolio(prev => prev.map(p => p.id === entryId
        ? { ...p, assessmentSnapshot: { ...p.assessmentSnapshot, mlFailed: true } }
        : p
      ));
    }
  };

  // UC6 (Scenario): POST stressed hypothetical numbers to ML backend, update scenarioMlData
  const fetchScenarioMl = async (data) => {
    try {
      const ebit = data.revenue - data.expenses;
      const res = await fetch(`${import.meta.env.VITE_API_URL}/api/computeAssessment`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          revenue: data.revenue,
          expenses: data.expenses,
          currentAssets: data.currentAssets,
          currentLiabilities: data.currentLiabilities,
          totalAssets: data.totalAssets,
          totalDebt: data.totalDebt,
          equity: data.equity,
          cashFlow: data.cashFlow,
          industry: selectedIndustry,
          icr: (data.interestExpense != null && data.interestExpense > 0)
            ? ebit / data.interestExpense : null,
          dscr: (data.totalDebt > 0 && data.debtService != null && data.debtService > 0)
            ? ebit / data.debtService : null,
          inventory: data.inventory ?? null,
          interestExpense: data.interestExpense ?? null,
          debtService: data.debtService ?? null,
        }),
      });
      // F-13: surface backend errors rather than swallowing them silently
      if (!res.ok) {
        console.error('[fetchScenarioMl] backend returned', res.status);
        setScenarioMlError(true);
        return;
      }
      const ml = await res.json();
      setScenarioMlData({ altmanZScore: ml.altmanZScore, probabilityOfDefault: ml.probabilityOfDefault });
      setScenarioMlError(false);
    } catch (err) {
      console.error('[fetchScenarioMl] network error:', err);
      setScenarioMlError(true);
    }
  };

  // Updates a single threshold field (value or weight) in state
  const handleThresholdChange = (metric, field, value) => {
    setThresholds({ ...thresholds, [metric]: { ...thresholds[metric], [field]: parseFloat(value) || 0 } });
  };

  const handleManualDataChange = (field, value) => {
    setManualData({ ...manualData, [field]: value });
  };

  // UC1 (Demo): Loads a pre-built 12-month SME profile through the same ETL path as CSV upload
  const loadDemoProfile = (profileKey) => {
    const profile = demoProfiles.find((p) => p.key === profileKey);
    const rows = demoDatasets[profileKey];
    if (!profile || !rows) return;

    setFinancialData(processDemoDataset(rows, `${profile.title} (Demo)`, profileKey));
    setUploadedFile({ name: `Demo Data — ${profile.title}` });
    setRawFileData({ columns: DEMO_COLUMNS, sampleRow: rows[0], allRows: rows });
    setDetectedColumns(DEMO_COLUMNS);
    setFieldMappings({
      companyName: '', revenue: 'Revenue', expenses: 'Expenses',
      currentAssets: 'Current_Assets', currentLiabilities: 'Current_Liabilities',
      totalAssets: 'Total_Assets', totalLiabilities: 'Total_Liabilities', totalDebt: 'Total_Debt', equity: 'Equity', cashFlow: 'Cashflow',
      inventory: '', interestExpense: '', debtService: '',
    });
    setShowDemoModal(false);
    setShowFieldMapping(false);
    setShowManualEntry(false);
    setAssessmentResults(null);
    setForecastData(null);
  };

  // UC1 (Manual): Builds flat 6-month chart data from a single annual entry
  const submitManualData = () => {
    const parseManualNum = (v) => (v != null && v !== '' && !isNaN(parseFloat(v)) ? parseFloat(v) : null);
    const revenue  = parseManualNum(manualData.revenue)  ?? 0;
    const expenses = parseManualNum(manualData.expenses) ?? 0;
    const monthlyRevenue = [];
    const historicalMonths = [];
    const months   = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
    const monthRev = Math.round(revenue  / 12);
    const monthExp = Math.round(expenses / 12);
    const currentAssets      = parseManualNum(manualData.currentAssets);
    const currentLiabilities = parseManualNum(manualData.currentLiabilities);
    const totalAssets        = parseManualNum(manualData.totalAssets);
    const totalLiabilities   = parseManualNum(manualData.totalLiabilities);
    const totalDebt          = parseManualNum(manualData.totalDebt);
    const equity             = parseManualNum(manualData.equity);
    const cashFlowAnnual     = parseManualNum(manualData.cashFlow);
    const inventory          = parseManualNum(manualData.inventory);
    const interestExpense    = parseManualNum(manualData.interestExpense);
    const debtService        = parseManualNum(manualData.debtService);

    months.forEach((month) => {
      // F-19: chart display only — estimated for visual purposes, not sent to ML
      const monthCFEstimate = Math.round((monthRev - monthExp) * 0.8);
      monthlyRevenue.push({
        month, revenue: monthRev, expenses: monthExp,
        profit:   monthRev - monthExp,
        cashFlow: monthCFEstimate,
        cashFlowEstimated: true,
      });
      // F-19: historicalMonths used for ML payloads — cashFlow is null because no monthly series exists
      historicalMonths.push({
        month,
        revenue: monthRev,
        expenses: monthExp,
        cashFlow: null,
        currentAssets,
        currentLiabilities,
        totalAssets,
        totalDebt,
        equity,
        inventory: null,
        interestExpense: null,
        debtService: null,
      });
    });

    setFinancialData({
      companyName:        manualData.companyName || 'My Company',
      revenue, expenses,
      currentAssets,
      currentLiabilities,
      totalAssets,
      totalLiabilities,
      totalDebt,
      equity,
      cashFlow:           cashFlowAnnual ?? 0,
      inventory,
      interestExpense,
      debtService,
      isManualEntry:      true,
      historicalMonths,
      monthlyRevenue,
    });
    setShowManualEntry(false);
  };

  // Resets all scoring weights to defaults
  const resetThresholds = () => {
    setThresholds({
      currentRatio: { min: 1.2,  weight: 20, label: 'Current Ratio (Min)' },
      debtToEquity: { max: 1.5,  weight: 20, label: 'Debt-to-Equity (Max)' },
      ebitdaMargin: { min: 10,   weight: 15, label: 'EBITDA Margin % (Min)' },
      roa:          { min: 5,    weight: 10, label: 'ROA — EBIT-based % (Min)' },
      dscr:         { min: 1.25, weight: 15, label: 'DSCR (Min)' },
      quickRatio:   { min: 0.8,  weight: 10, label: 'Quick Ratio (Min)' },
      icr:          { min: 2.0,  weight: 10, label: 'Interest Coverage (Min)' }
    });
  };

  // Returns sum of all weights — must equal 100 for valid scoring
  const getTotalWeight = () => {
    return thresholds.currentRatio.weight + thresholds.debtToEquity.weight +
           thresholds.ebitdaMargin.weight + thresholds.roa.weight + thresholds.dscr.weight +
           thresholds.quickRatio.weight + thresholds.icr.weight;
  };

  const getRatioBenchmark = (key) => {
    const bench = industryStandards[selectedIndustry] || industryStandards.Default;
    if (key === 'currentRatio') return `Min: ${bench.minCurrentRatio}x`;
    if (key === 'debtToEquity') return `Max: ${bench.maxDebtEquity}x`;
    if (key === 'ebitdaMargin') return `Min: ${bench.minEBITDAMargin}%`;
    if (key === 'roa') return `Min: ${bench.minROA}%`;
    if (key === 'dscr') return `Min: ${bench.minDSCR}x`;
    if (key === 'quickRatio') return `Min: ${bench.minQuickRatio}x`;
    if (key === 'icr') return `Min: ${bench.minICR}x`;
    return '';
  };

  const formatRatioDisplay = (key, value) => {
    if (value === null || value === undefined) return 'N/A';
    if (key === 'ebitdaMargin' || key === 'roa') return `${value}%`;
    return value;
  };

  const getAltmanZoneStyles = (zone) => {
    const z = String(zone).toLowerCase();
    if (z === 'safe') return {
      cardStyle: { background: 'var(--safe-tint)', border: '1px solid color-mix(in oklch, var(--safe) 20%, transparent)' },
      iconColor: 'var(--safe)',
      badgeCls: 'r-badge-safe',
    };
    if (z === 'distress') return {
      cardStyle: { background: 'var(--danger-tint)', border: '1px solid color-mix(in oklch, var(--danger) 20%, transparent)' },
      iconColor: 'var(--danger)',
      badgeCls: 'r-badge-danger',
    };
    return {
      cardStyle: { background: 'var(--caution-tint)', border: '1px solid color-mix(in oklch, var(--caution) 20%, transparent)' },
      iconColor: 'var(--caution)',
      badgeCls: 'r-badge-caution',
    };
  };

  // Portfolio: restore a saved assessment and open the full report view
  const openPortfolioEntry = (entry) => {
    if (!entry.assessmentSnapshot || !entry.financialSnapshot) {
      alert('Full report details are not available for this entry. Run a new assessment to save the complete report.');
      return;
    }
    setFinancialData(JSON.parse(JSON.stringify(entry.financialSnapshot)));
    setAssessmentResults(JSON.parse(JSON.stringify(entry.assessmentSnapshot)));
    setSelectedIndustry(entry.industry || 'Default');
    setIsScenarioMode(false);
    setScenarioData(null);
    setPortfolioViewMeta({ assessedAt: entry.assessedAt, companyName: entry.companyName });
    setCurrentPage('assessment');
  };

  // UI: Upload Page
  if (currentPage === 'upload') {
    const inputCls = 'w-full px-3 py-2.5 text-sm rounded outline-none';
    const inputSt  = { background: 'var(--surface)', border: '1px solid var(--hairline)', color: 'var(--ink)', fontFamily: 'var(--font-sans)' };
    return (
      <div className="min-h-screen" style={{ background: 'var(--surface)' }}>
        <NavBar currentPage={currentPage} setCurrentPage={setCurrentPage}
          financialData={financialData} assessmentResults={assessmentResults} portfolio={portfolio} />

        <main className="max-w-[1320px] mx-auto px-8 py-10">
          <div className="mb-7">
            <h1 className="text-2xl font-bold">New Assessment</h1>
            <p className="text-sm mt-1" style={{ color: 'var(--ink-muted)' }}>
              Upload an SME financial CSV, use demo data, or enter figures manually.
            </p>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-[1fr_280px] gap-6">
            {/* Left: upload + forms */}
            <div className="space-y-5">

              {/* CSV upload zone */}
              <div className="r-panel overflow-hidden">
                <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--hairline)' }}>
                  <p className="r-eyebrow">Financial Data</p>
                </div>
                <div className="p-5">
                  <label htmlFor="file"
                    className="flex flex-col items-center justify-center p-12 cursor-pointer rounded transition-colors"
                    style={{ border: '2px dashed var(--hairline)' }}
                    onMouseEnter={e => e.currentTarget.style.borderColor = 'var(--signal)'}
                    onMouseLeave={e => e.currentTarget.style.borderColor = 'var(--hairline)'}>
                    <div className="p-3 rounded mb-4" style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}>
                      <Upload className="h-7 w-7" style={{ color: 'var(--ink-faint)' }} strokeWidth={1.5} />
                    </div>
                    <p className="text-sm font-semibold mb-1">Click to select a CSV file</p>
                    <p className="text-xs" style={{ color: 'var(--ink-faint)' }}>Header row required. Multiple data rows supported.</p>
                    <input type="file" accept=".csv" onChange={handleFileChange} className="hidden" id="file" />
                  </label>
                  <div className="flex items-center gap-3 my-4">
                    <div className="flex-1 h-px" style={{ background: 'var(--hairline)' }} />
                    <span className="text-[11px] font-medium" style={{ color: 'var(--ink-faint)' }}>or</span>
                    <div className="flex-1 h-px" style={{ background: 'var(--hairline)' }} />
                  </div>
                  <button onClick={() => setShowManualEntry(!showManualEntry)} className="r-btn-ghost w-full py-2.5 text-sm">
                    {showManualEntry ? 'Hide Manual Entry' : 'Enter Data Manually'}
                  </button>
                  <button onClick={() => setShowDemoModal(true)} className="r-btn-ghost w-full py-2.5 text-sm mt-2.5">
                    Use Demo Data
                  </button>
                </div>
              </div>

              {/* Manual entry form */}
              {showManualEntry && (
                <div className="r-panel overflow-hidden">
                  <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--hairline)' }}>
                    <p className="r-eyebrow">Manual Data Entry</p>
                    <p className="text-xs mt-1" style={{ color: 'var(--ink-muted)' }}>All figures should be annual SAR values.</p>
                  </div>
                  <div className="p-5">
                    <div className="grid grid-cols-2 gap-4 mb-5">
                      <div className="col-span-2">
                        <label className="r-eyebrow block mb-2">Company Name</label>
                        <input type="text" value={manualData.companyName} onChange={(e) => handleManualDataChange('companyName', e.target.value)} className={inputCls} style={inputSt} placeholder="e.g. Al Noor Trading Co." />
                      </div>
                      {[
                        { field: 'revenue',            label: 'Annual Revenue',      placeholder: '5,000,000' },
                        { field: 'expenses',           label: 'Annual Expenses',     placeholder: '4,000,000' },
                        { field: 'currentAssets',      label: 'Current Assets',      placeholder: '2,000,000' },
                        { field: 'currentLiabilities', label: 'Current Liabilities', placeholder: '1,000,000' },
                        { field: 'totalAssets',        label: 'Total Assets',        placeholder: '8,000,000' },
                        { field: 'totalLiabilities',   label: 'Total Liabilities',   placeholder: '3,500,000' },
                        { field: 'totalDebt',          label: 'Total Debt',          placeholder: '3,000,000' },
                        { field: 'equity',             label: 'Equity',              placeholder: '5,000,000' },
                        { field: 'cashFlow',           label: 'Annual Cash Flow',    placeholder: '800,000'   },
                      ].map(({ field, label, placeholder }) => (
                        <div key={field}>
                          <label className="r-eyebrow block mb-2">{label}</label>
                          <input type="number" value={manualData[field]} onChange={(e) => handleManualDataChange(field, e.target.value)} className={inputCls} style={inputSt} placeholder={placeholder} />
                        </div>
                      ))}
                      <div className="col-span-2 pt-3" style={{ borderTop: '1px solid var(--hairline)' }}>
                        <p className="text-xs mb-3" style={{ color: 'var(--ink-faint)' }}>Optional — enables additional ratio analysis.</p>
                      </div>
                      <div>
                        <label className="r-eyebrow block mb-2">Inventory (SAR)</label>
                        <input type="number" value={manualData.inventory ?? ''} onChange={(e) => handleManualDataChange('inventory', e.target.value === '' ? null : parseFloat(e.target.value))} className={inputCls} style={inputSt} placeholder="e.g. 150000" />
                      </div>
                      <div>
                        <label className="r-eyebrow block mb-2">Annual Interest/Profit-Charge (SAR)</label>
                        <input type="number" value={manualData.interestExpense ?? ''} onChange={(e) => handleManualDataChange('interestExpense', e.target.value === '' ? null : parseFloat(e.target.value))} className={inputCls} style={inputSt} placeholder="e.g. 50000" />
                      </div>
                      <div>
                        <label className="r-eyebrow block mb-2">Annual Debt Service (SAR)</label>
                        <input type="number" value={manualData.debtService ?? ''} onChange={(e) => handleManualDataChange('debtService', e.target.value === '' ? null : parseFloat(e.target.value))} className={inputCls} style={inputSt} placeholder="Principal + interest per year" />
                      </div>
                    </div>
                    <div className="flex gap-3">
                      <button onClick={submitManualData} className="r-btn-primary flex-1 py-2.5 text-sm">Submit Data</button>
                      <button onClick={() => setShowManualEntry(false)} className="r-btn-ghost px-5 py-2.5 text-sm">Cancel</button>
                    </div>
                  </div>
                </div>
              )}

              {/* Field mapping */}
              {showFieldMapping && (
                <div className="r-panel overflow-hidden">
                  <div className="px-5 py-4 flex items-start gap-3" style={{ borderBottom: '1px solid var(--hairline)', background: 'var(--surface)' }}>
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" style={{ color: 'var(--caution)' }} strokeWidth={1.5} />
                    <div>
                      <p className="text-sm font-bold">Map Your Data Fields</p>
                      <p className="text-xs mt-0.5" style={{ color: 'var(--ink-muted)' }}>{detectedColumns.length} columns detected. Auto-mapping applied — review and adjust if needed.</p>
                    </div>
                  </div>
                  <div className="p-5">
                    <div className="grid grid-cols-2 gap-4 mb-5">
                      {[
                        { field: 'companyName',        label: 'Company Name',        required: false },
                        { field: 'revenue',            label: 'Revenue',             required: true  },
                        { field: 'expenses',           label: 'Expenses',            required: false },
                        { field: 'currentAssets',      label: 'Current Assets',      required: false },
                        { field: 'currentLiabilities', label: 'Current Liabilities', required: false },
                        { field: 'totalAssets',        label: 'Total Assets',        required: false },
                        { field: 'totalLiabilities',   label: 'Total Liabilities',   required: false },
                        { field: 'totalDebt',          label: 'Total Debt',          required: false },
                        { field: 'equity',             label: 'Equity',              required: false },
                        { field: 'cashFlow',           label: 'Cash Flow',           required: false },
                        { field: 'inventory',          label: 'Inventory (Optional)',        required: false, optional: true },
                        { field: 'interestExpense',    label: 'Interest Expense (Optional)', required: false, optional: true },
                        { field: 'debtService',        label: 'Debt Service (Optional)',     required: false, optional: true },
                      ].map(({ field, label, required, optional }) => (
                        <div key={field}>
                          <label className="r-eyebrow block mb-2" style={{ color: optional ? 'var(--ink-faint)' : undefined }}>
                            {label} {required && <span style={{ color: 'var(--danger)' }}>*</span>}
                          </label>
                          <select value={fieldMappings[field]} onChange={(e) => handleFieldMappingChange(field, e.target.value)} className="w-full px-3 py-2.5 text-sm rounded outline-none" style={inputSt}>
                            <option value="">-- Not Mapped --</option>
                            {detectedColumns.map(col => <option key={col} value={col}>{col}</option>)}
                          </select>
                          {fieldMappings[field] && <p className="text-[11px] mt-1 font-semibold" style={{ color: 'var(--safe)' }}>Mapped: {fieldMappings[field]}</p>}
                        </div>
                      ))}
                    </div>
                    <div className="flex items-center px-4 py-3 rounded mb-4" style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}>
                      <span className="text-xs" style={{ color: 'var(--ink-muted)' }}>
                        <span className="font-bold" style={{ color: 'var(--safe)' }}>{Object.values(fieldMappings).filter(v => v).length} mapped</span>
                        {' '}· {Object.values(fieldMappings).filter(v => !v).length} will be estimated
                      </span>
                    </div>
                    <div className="flex gap-3">
                      <button onClick={processDataWithMappings} className="r-btn-primary flex-1 py-2.5 text-sm gap-2">
                        <CheckCircle className="h-4 w-4" strokeWidth={1.5} />Process & Continue
                      </button>
                      <button onClick={() => setShowFieldMapping(false)} className="r-btn-ghost px-5 py-2.5 text-sm">Cancel</button>
                    </div>
                  </div>
                </div>
              )}

              {/* Data ready */}
              {financialData && !showFieldMapping && (
                <div className="r-panel overflow-hidden">
                  <div className="px-5 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--hairline)', background: 'var(--safe-tint)' }}>
                    <div className="flex items-center gap-3">
                      <CheckCircle className="h-5 w-5 shrink-0" style={{ color: 'var(--safe)' }} strokeWidth={1.5} />
                      <div>
                        <p className="text-sm font-bold">{financialData.companyName}</p>
                        <p className="text-xs" style={{ color: 'var(--safe)' }}>{uploadedFile?.name || 'Manual entry'} — data ready</p>
                      </div>
                    </div>
                    <span className="r-badge-safe">Ready</span>
                  </div>
                  <div className="p-4">
                    <button onClick={() => setCurrentPage('dashboard')} className="r-btn-primary w-full py-2.5 text-sm gap-2">
                      Continue to Dashboard <ArrowRight className="h-4 w-4" strokeWidth={1.5} />
                    </button>
                  </div>
                </div>
              )}
            </div>

            {/* Right: CSV spec panel */}
            <div className="r-panel p-5 self-start">
              <p className="r-eyebrow mb-4">CSV Specification</p>
              <div className="space-y-4">
                <div>
                  <p className="text-xs font-semibold mb-2">Required</p>
                  {['Revenue (monthly)', 'Header row'].map(item => (
                    <p key={item} className="flex items-center gap-2 text-xs mb-1.5" style={{ color: 'var(--ink-muted)' }}>
                      <span className="w-1.5 h-1.5 rounded-full shrink-0 inline-block" style={{ background: 'var(--safe)' }} />{item}
                    </p>
                  ))}
                </div>
                <div style={{ borderTop: '1px solid var(--hairline)', paddingTop: '12px' }}>
                  <p className="text-xs font-semibold mb-2">Optional — additional ratios</p>
                  {['Current Assets / Liabilities', 'Total Assets / Liabilities', 'Total Debt / Equity', 'Cash Flow', 'Inventory', 'Interest/Profit Expense', 'Debt Service'].map(item => (
                    <p key={item} className="flex items-center gap-2 text-xs mb-1.5" style={{ color: 'var(--ink-muted)' }}>
                      <span className="w-1.5 h-1.5 rounded-full shrink-0 inline-block" style={{ background: 'var(--signal)' }} />{item}
                    </p>
                  ))}
                </div>
                <div style={{ borderTop: '1px solid var(--hairline)', paddingTop: '12px' }}>
                  <p className="text-xs font-semibold mb-2">Format</p>
                  {['Numeric values, no currency symbols', 'Multiple rows for trend analysis', 'Company name auto-detected', 'Columns auto-mapped'].map(item => (
                    <p key={item} className="flex items-center gap-2 text-xs mb-1.5" style={{ color: 'var(--ink-muted)' }}>
                      <span className="w-1.5 h-1.5 rounded-full shrink-0 inline-block" style={{ background: 'var(--hairline)' }} />{item}
                    </p>
                  ))}
                </div>
              </div>
            </div>
          </div>
        </main>

        {/* Demo modal */}
        {showDemoModal && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4"
            style={{ background: 'oklch(0.24 0.045 200 / 65%)' }}
            onClick={() => setShowDemoModal(false)}>
            <div className="r-panel overflow-hidden max-w-2xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
              <div className="px-6 py-5 flex items-start justify-between sticky top-0" style={{ background: 'var(--panel)', borderBottom: '1px solid var(--hairline)' }}>
                <div>
                  <h2 className="text-base font-bold">Demo SME Profiles</h2>
                  <p className="text-xs mt-0.5" style={{ color: 'var(--ink-muted)' }}>12 months of pre-built financials — no CSV required.</p>
                </div>
                <button onClick={() => setShowDemoModal(false)} className="p-1.5 rounded" style={{ color: 'var(--ink-faint)' }}>
                  <X className="h-5 w-5" strokeWidth={1.5} />
                </button>
              </div>
              <div className="p-5 grid grid-cols-1 md:grid-cols-3 gap-4">
                {demoProfiles.map((profile) => {
                  const sc = parseFloat(profile.expectedScore);
                  const cardSt = sc >= 70
                    ? { background: 'var(--safe-tint)', border: '2px solid color-mix(in oklch, var(--safe) 25%, transparent)', borderRadius: 'var(--radius)' }
                    : sc >= 50
                    ? { background: 'var(--caution-tint)', border: '2px solid color-mix(in oklch, var(--caution) 25%, transparent)', borderRadius: 'var(--radius)' }
                    : { background: 'var(--danger-tint)', border: '2px solid color-mix(in oklch, var(--danger) 25%, transparent)', borderRadius: 'var(--radius)' };
                  const bc = sc >= 70 ? 'r-badge-safe' : sc >= 50 ? 'r-badge-caution' : 'r-badge-danger';
                  return (
                    <button key={profile.key} onClick={() => loadDemoProfile(profile.key)}
                      className="text-left p-5 cursor-pointer hover:opacity-90 transition-opacity" style={cardSt}>
                      <span className={`${bc} mb-3 inline-flex`}>Score ~{profile.expectedScore}</span>
                      <h3 className="text-sm font-bold mt-2 mb-1.5">{profile.title}</h3>
                      <p className="text-xs leading-relaxed" style={{ color: 'var(--ink-muted)' }}>{profile.description}</p>
                      <p className="text-xs font-semibold mt-4" style={{ color: 'var(--signal)' }}>Load profile</p>
                    </button>
                  );
                })}
              </div>
            </div>
          </div>
        )}
      </div>
    );
  }

  // UI: Dashboard Page — KPI cards, revenue chart, risk radar, debt/equity trend
  if (currentPage === 'dashboard') {
    const std = industryStandards[selectedIndustry] || null;
    return (
      <div className="min-h-screen" style={{ background: 'var(--surface)' }}>
        <NavBar currentPage={currentPage} setCurrentPage={setCurrentPage}
          financialData={financialData} assessmentResults={assessmentResults} portfolio={portfolio} />

        <main className="max-w-[1320px] mx-auto px-8 py-8 space-y-6">

          {/* Page title row */}
          <div className="flex items-center justify-between">
            <div>
              <h1 className="text-xl font-bold">{financialData.companyName}</h1>
              <p className="text-xs mt-0.5" style={{ color: 'var(--ink-muted)' }}>Financial overview — select an industry to run the assessment</p>
            </div>
            <button onClick={() => { setCurrentPage('upload'); setFinancialData(null); setUploadedFile(null); setAssessmentResults(null); setForecastData(null); setIsStressTestActive(false); setActiveForecastMonth(1); }}
              className="r-btn-ghost px-4 py-2 text-sm gap-2">
              <ArrowLeft className="h-4 w-4" strokeWidth={1.5} />New Assessment
            </button>
          </div>

          {/* KPI Cards */}
          {/* F-18: KPI Cards */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            {/* Revenue */}
            <div className="r-panel p-5">
              <div className="flex items-center justify-between mb-3">
                <p className="r-eyebrow">Revenue</p>
                {(() => {
                  const rev = financialData.monthlyRevenue;
                  if (rev.length > 1 && (rev[0].revenue ?? 0) > 0) {
                    const pct = ((rev[rev.length-1].revenue - rev[0].revenue) / rev[0].revenue * 100).toFixed(1);
                    const ok = parseFloat(pct) >= 0;
                    return <span className={ok ? 'r-badge-safe' : 'r-badge-danger'}>{pct}%</span>;
                  }
                  return <span className="r-badge-neutral">N/A</span>;
                })()}
              </div>
              <p className="text-2xl font-bold tabular">{financialData.revenue != null ? `${(financialData.revenue/1e6).toFixed(2)}M` : 'N/A'}</p>
              <p className="text-xs mt-1" style={{ color: 'var(--ink-faint)' }}>SAR — Annualised</p>
            </div>

            {/* Net Profit */}
            <div className="r-panel p-5">
              <div className="flex items-center justify-between mb-3">
                <p className="r-eyebrow">Net Profit</p>
                {(financialData.revenue ?? 0) > 0
                  ? <span className={(financialData.revenue??0)>(financialData.expenses??0) ? 'r-badge-safe' : 'r-badge-danger'}>
                      {(((financialData.revenue??0)-(financialData.expenses??0))/financialData.revenue*100).toFixed(1)}%
                    </span>
                  : <span className="r-badge-neutral">N/A</span>}
              </div>
              <p className="text-2xl font-bold tabular">
                {financialData.revenue != null ? `${(((financialData.revenue??0)-(financialData.expenses??0))/1e6).toFixed(2)}M` : 'N/A'}
              </p>
              <p className="text-xs mt-1" style={{ color: 'var(--ink-faint)' }}>SAR — Annualised</p>
            </div>

            {/* Current Ratio */}
            <div className="r-panel p-5">
              <div className="flex items-center justify-between mb-3">
                <p className="r-eyebrow">Current Ratio</p>
                {financialData.currentAssets != null && (financialData.currentLiabilities??0) > 0
                  ? <span className={financialData.currentAssets/financialData.currentLiabilities >= thresholds.currentRatio.min ? 'r-badge-safe' : 'r-badge-danger'}>
                      {financialData.currentAssets/financialData.currentLiabilities >= thresholds.currentRatio.min ? 'Healthy' : 'Weak'}
                    </span>
                  : <span className="r-badge-neutral">N/A</span>}
              </div>
              <p className="text-2xl font-bold tabular">
                {financialData.currentAssets != null && (financialData.currentLiabilities??0) > 0
                  ? `${(financialData.currentAssets/financialData.currentLiabilities).toFixed(2)}x` : 'N/A'}
              </p>
              <p className="text-xs mt-1" style={{ color: 'var(--ink-faint)' }}>Min: {thresholds.currentRatio.min}x</p>
            </div>

            {/* D/E */}
            <div className="r-panel p-5">
              <div className="flex items-center justify-between mb-3">
                <p className="r-eyebrow">Debt / Equity</p>
                <span className={financialData.equity <= 0 ? 'r-badge-danger' : financialData.totalDebt/financialData.equity <= thresholds.debtToEquity.max ? 'r-badge-safe' : 'r-badge-danger'}>
                  {financialData.equity <= 0 ? 'Insolvent' : financialData.totalDebt/financialData.equity <= thresholds.debtToEquity.max ? 'OK' : 'High'}
                </span>
              </div>
              <p className="text-2xl font-bold tabular">{financialData.equity <= 0 ? 'N/A' : (financialData.totalDebt/financialData.equity).toFixed(2)}</p>
              <p className="text-xs mt-1" style={{ color: 'var(--ink-faint)' }}>Max: {thresholds.debtToEquity.max}x</p>
            </div>
          </div>

          {/* Charts */}
          <div className="flex flex-col gap-5">

            {/* Monthly revenue area chart */}
            <div className="r-panel p-5">
              <div className="flex items-center gap-2 mb-1">
                <TrendingUp className="h-4 w-4" style={{ color: 'var(--ink-faint)' }} strokeWidth={1.5} />
                <p className="text-sm font-semibold">Monthly Revenue Performance</p>
              </div>
              <p className="r-eyebrow mb-4">Actual revenue across all uploaded periods (SAR)</p>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={financialData.monthlyRevenue}>
                    <CartesianGrid strokeDasharray="3 3" stroke="var(--hairline)" />
                    <XAxis dataKey="month" stroke="var(--ink-faint)" style={{ fontSize: '11px' }} />
                    <YAxis stroke="var(--ink-faint)" style={{ fontSize: '11px' }} tickFormatter={(v) => v >= 1e6 ? `${(v/1e6).toFixed(1)}M` : v >= 1000 ? `${(v/1000).toFixed(0)}K` : v} />
                    <Tooltip contentStyle={{ background: 'var(--panel)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius)', fontSize: '12px', color: 'var(--ink)' }} />
                    <Area type="monotone" dataKey="revenue" stroke="var(--signal)" strokeWidth={2} fill="var(--signal)" fillOpacity={0.1} />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

              {/* Risk Radar */}
              {(() => {
                const dashAssessment = computeAssessment(financialData);
                const radarData = dashAssessment.activeRatios.map(r => ({ metric: r.label, score: dashAssessment.scores[r.key] || 0, fullMark: 100 }));
                return (
                  <div className="r-panel p-5">
                    <div className="flex items-center gap-2 mb-1">
                      <BarChart3 className="h-4 w-4" style={{ color: 'var(--ink-faint)' }} strokeWidth={1.5} />
                      <p className="text-sm font-semibold">Risk Radar</p>
                    </div>
                    <p className="r-eyebrow mb-4">Health footprint — normalised 0-100</p>
                    <div className="h-56">
                      <ResponsiveContainer width="100%" height="100%">
                        <RadarChart data={radarData} margin={{ top: 10, right: 30, bottom: 10, left: 30 }}>
                          <PolarGrid stroke="var(--hairline)" />
                          <PolarAngleAxis dataKey="metric" tick={{ fontSize: 11, fill: 'var(--ink-muted)', fontWeight: 600 }} />
                          <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fontSize: 9, fill: 'var(--ink-faint)' }} tickCount={4} />
                          <Radar name="Health" dataKey="score" stroke="var(--signal)" fill="var(--signal)" fillOpacity={0.15} strokeWidth={2} />
                          <Tooltip formatter={(v) => [`${v.toFixed(0)} / 100`, 'Score']} contentStyle={{ background: 'var(--panel)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius)', fontSize: '12px', color: 'var(--ink)' }} />
                        </RadarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                );
              })()}

              {/* Debt vs Equity trend */}
              {(() => {
                let trendData = [];
                if (rawFileData && rawFileData.allRows && rawFileData.allRows.length > 1) {
                  const debtCol = fieldMappings.totalDebt;
                  const equityCol = fieldMappings.equity;
                  const monthCol = rawFileData.columns.find(c => c.toLowerCase().includes('month') || c.toLowerCase().includes('date') || c.toLowerCase().includes('period'));
                  trendData = rawFileData.allRows.map((row, idx) => ({
                    month: monthCol && row[monthCol] ? row[monthCol] : `P${idx + 1}`,
                    totalDebt: debtCol && row[debtCol] != null ? parseFloat(row[debtCol]) || 0 : financialData.totalDebt,
                    equity: equityCol && row[equityCol] != null ? parseFloat(row[equityCol]) || 0 : financialData.equity,
                  }));
                } else {
                  trendData = [{ month: 'Current', totalDebt: financialData.totalDebt, equity: financialData.equity }];
                }
                return (
                  <div className="r-panel p-5">
                    <div className="flex items-center gap-2 mb-1">
                      <TrendingUp className="h-4 w-4" style={{ color: 'var(--ink-faint)' }} strokeWidth={1.5} />
                      <p className="text-sm font-semibold">Debt vs. Equity Trend</p>
                    </div>
                    <p className="r-eyebrow mb-4">Historical leverage movement (SAR)</p>
                    <div className="h-56">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={trendData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="var(--hairline)" />
                          <XAxis dataKey="month" stroke="var(--ink-faint)" style={{ fontSize: '11px' }} />
                          <YAxis stroke="var(--ink-faint)" style={{ fontSize: '11px' }} tickFormatter={(v) => v >= 1e6 ? `${(v/1e6).toFixed(1)}M` : v >= 1000 ? `${(v/1000).toFixed(0)}K` : v} />
                          <Tooltip formatter={(value, name) => [`${(value/1e6).toFixed(2)}M SAR`, name === 'totalDebt' ? 'Total Debt' : 'Equity']} contentStyle={{ background: 'var(--panel)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius)', fontSize: '12px', color: 'var(--ink)' }} />
                          <Line type="monotone" dataKey="totalDebt" stroke="var(--danger)" strokeWidth={2} dot={{ r: 3, fill: 'var(--danger)' }} />
                          <Line type="monotone" dataKey="equity" stroke="var(--safe)" strokeWidth={2} dot={{ r: 3, fill: 'var(--safe)' }} />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="flex items-center gap-6 mt-3 justify-center">
                      <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--ink-muted)' }}>
                        <div className="w-4 h-0.5 rounded" style={{ background: 'var(--danger)' }} />Total Debt
                      </div>
                      <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--ink-muted)' }}>
                        <div className="w-4 h-0.5 rounded" style={{ background: 'var(--safe)' }} />Equity
                      </div>
                    </div>
                  </div>
                );
              })()}

            </div>
          </div>

          {/* UC5: Industry selector chip row + benchmarks + Run Assessment */}
          <div className="r-panel overflow-hidden">
            <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--hairline)' }}>
              <p className="r-eyebrow mb-3">SME Industry</p>
              <div className="flex flex-wrap gap-2">
                {['Logistics', 'Manufacturing', 'SaaS', 'Retail', 'Construction', 'Tourism', 'Healthcare'].map(ind => (
                  <button key={ind} onClick={() => setSelectedIndustry(ind)}
                    className="px-4 py-1.5 text-sm font-semibold rounded transition-all"
                    style={{
                      background: selectedIndustry === ind ? 'var(--signal)' : 'var(--surface)',
                      color: selectedIndustry === ind ? 'var(--navy-950)' : 'var(--ink-muted)',
                      border: `1px solid ${selectedIndustry === ind ? 'var(--signal)' : 'var(--hairline)'}`,
                    }}>
                    {ind}
                  </button>
                ))}
              </div>
            </div>

            {std && (
              <div className="px-5 py-3 flex flex-wrap gap-x-5 gap-y-1.5" style={{ borderBottom: '1px solid var(--hairline)', background: 'var(--surface)' }}>
                <p className="r-eyebrow w-full mb-0.5">{selectedIndustry} Thresholds</p>
                {[
                  ['Min EBITDA', `${std.minEBITDAMargin}%`],
                  ['Min DSCR', `${std.minDSCR}x`],
                  ['Min Current Ratio', `${std.minCurrentRatio}x`],
                  ['Max D/E', `${std.maxDebtEquity}x`],
                  ['Min ROA', `${std.minROA}%`],
                  ['Min Quick Ratio', `${std.minQuickRatio}x`],
                  ['Min ICR', `${std.minICR}x`],
                ].map(([lbl, val]) => (
                  <span key={lbl} className="text-xs" style={{ color: 'var(--ink-muted)' }}>
                    {lbl} <span className="font-bold tabular" style={{ color: 'var(--ink)' }}>{val}</span>
                  </span>
                ))}
              </div>
            )}

            <div className="px-5 py-4">
              <button onClick={calculateAssessment} disabled={!selectedIndustry}
                className="r-btn-primary px-6 py-2.5 text-sm gap-2 disabled:opacity-40">
                <Calculator className="h-4 w-4" strokeWidth={1.5} />Run Funding Assessment
              </button>
            </div>
          </div>

        </main>
      </div>
    );
  }

  // UI: Assessment Results Page
  if (currentPage === 'assessment' && assessmentResults) {
    const decStyle = (d) => ({
      background: d === 'APPROVED' ? 'var(--safe-tint)' : d === 'REVIEW' ? 'var(--caution-tint)' : 'var(--danger-tint)',
      border: `1px solid ${d === 'APPROVED' ? 'color-mix(in oklch, var(--safe) 20%, transparent)' : d === 'REVIEW' ? 'color-mix(in oklch, var(--caution) 20%, transparent)' : 'color-mix(in oklch, var(--danger) 20%, transparent)'}`,
    });
    const decBadgeCls = (d) => d === 'APPROVED' ? 'r-badge-safe' : d === 'REVIEW' ? 'r-badge-caution' : 'r-badge-danger';
    const scoreColor = (s) => s >= 80 ? 'var(--safe)' : s >= 60 ? 'var(--caution)' : 'var(--danger)';
    const scoreTint  = (s) => s >= 80 ? 'var(--safe-tint)' : s >= 60 ? 'var(--caution-tint)' : 'var(--danger-tint)';
    const ttSt = { background: 'var(--panel)', border: '1px solid var(--hairline)', borderRadius: 'var(--radius)', fontSize: '12px', color: 'var(--ink)' };
    const inputSt = { background: 'var(--surface)', border: '1px solid var(--hairline)', color: 'var(--ink)' };
    return (
      <div className="min-h-screen" style={{ background: 'var(--surface)' }}>
        <NavBar currentPage={currentPage} setCurrentPage={setCurrentPage}
          financialData={financialData} assessmentResults={assessmentResults} portfolio={portfolio} />

        <main className="max-w-[1320px] mx-auto px-8 py-8 space-y-6">

          {/* Page title + controls row */}
          <div className="space-y-4">
            <div className="flex items-center justify-between">
              <div>
                <h1 className="text-xl font-bold">Assessment Report</h1>
                <p className="text-xs mt-0.5" style={{ color: 'var(--ink-muted)' }}>
                  {financialData.companyName}{selectedIndustry ? ` · ${selectedIndustry}` : ''}
                </p>
              </div>
            </div>
            <div className="flex items-center gap-3 flex-wrap">
              <button
                onClick={() => {
                  if (isScenarioMode) { setIsScenarioMode(false); setScenarioData(null); setScenarioMlData(null); setScenarioMlError(false); }
                  else { const copy = JSON.parse(JSON.stringify(financialData)); setIsScenarioMode(true); setScenarioData(copy); fetchScenarioMl(copy); }
                }}
                className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded transition-colors"
                style={{ background: isScenarioMode ? 'var(--caution)' : 'var(--surface)', color: isScenarioMode ? '#fff' : 'var(--ink)', border: `1px solid ${isScenarioMode ? 'var(--caution)' : 'var(--hairline)'}` }}>
                <Zap className="h-4 w-4" strokeWidth={1.5} />
                {isScenarioMode ? 'Exit Scenario Mode' : 'Scenario Analysis'}
              </button>
              <button
                onClick={() => setShowSettings(!showSettings)}
                className="flex items-center gap-2 px-4 py-2 text-sm font-semibold rounded transition-colors"
                style={{ background: showSettings ? 'var(--navy-950)' : 'var(--surface)', color: showSettings ? 'var(--panel)' : 'var(--ink)', border: `1px solid ${showSettings ? 'var(--navy-800)' : 'var(--hairline)'}` }}>
                <Settings className="h-4 w-4" strokeWidth={1.5} />
                {showSettings ? 'Hide Weights' : 'Scoring Weights'}
              </button>
            </div>
          </div>

          {portfolioViewMeta && (
            <div className="r-panel px-5 py-4 flex items-center justify-between"
              style={{ background: 'color-mix(in oklch, var(--signal) 8%, var(--panel))', border: '1px solid color-mix(in oklch, var(--signal) 20%, transparent)' }}>
              <div className="flex items-center gap-3">
                <FileText className="h-4 w-4 shrink-0" style={{ color: 'var(--signal)' }} strokeWidth={1.5} />
                <div>
                  <p className="text-sm font-bold">Saved assessment — {portfolioViewMeta.companyName}</p>
                  <p className="text-xs" style={{ color: 'var(--ink-muted)' }}>Assessed on {portfolioViewMeta.assessedAt}. Historical snapshot, not a live re-run.</p>
                </div>
              </div>
              <button onClick={() => setPortfolioViewMeta(null)} className="r-btn-ghost text-xs px-3 py-1.5">Dismiss</button>
            </div>
          )}

          {/* UC5 Settings panel */}
          {showSettings && (
            <div className="r-panel p-6">
              <div className="flex items-center justify-between mb-5">
                <h2 className="text-sm font-bold">Scoring Weights Configuration</h2>
                <button onClick={resetThresholds} className="r-btn-ghost text-xs px-3 py-1.5">Reset Defaults</button>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-5">
                {[
                  { key: 'currentRatio', field: 'min',  step: '0.1'  },
                  { key: 'debtToEquity', field: 'max',  step: '0.1'  },
                  { key: 'ebitdaMargin', field: 'min',  step: '0.5'  },
                  { key: 'roa',          field: 'min',  step: '0.5'  },
                  { key: 'dscr',         field: 'min',  step: '0.05' },
                  { key: 'quickRatio',   field: 'min',  step: '0.1'  },
                  { key: 'icr',          field: 'min',  step: '0.1'  },
                ].map(({ key, field, step }) => (
                  <div key={key} className="r-panel p-4" style={{ background: 'var(--surface)' }}>
                    <p className="text-xs font-bold mb-3">{thresholds[key].label}</p>
                    <input type="number" step={step} value={thresholds[key][field]} onChange={(e) => handleThresholdChange(key, field, e.target.value)}
                      className="w-full px-3 py-2 text-sm rounded outline-none mb-3" style={inputSt} />
                    <div className="flex items-center justify-between text-xs mb-1" style={{ color: 'var(--ink-muted)' }}>
                      <span>Weight</span><span className="font-bold tabular" style={{ color: 'var(--ink)' }}>{thresholds[key].weight}%</span>
                    </div>
                    <input type="range" min="0" max="100" value={thresholds[key].weight} onChange={(e) => handleThresholdChange(key, 'weight', e.target.value)}
                      className="w-full" style={{ accentColor: 'var(--signal)' }} />
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-sm" style={{ color: 'var(--ink-muted)' }}>Total Weight:</span>
                  <span className="text-lg font-bold tabular" style={{ color: getTotalWeight() === 100 ? 'var(--safe)' : 'var(--danger)' }}>{getTotalWeight()}%</span>
                  {getTotalWeight() !== 100 && <span className="text-xs" style={{ color: 'var(--danger)' }}>Must equal 100%</span>}
                </div>
                <button onClick={() => { setShowSettings(false); calculateAssessment(); }} className="r-btn-primary px-5 py-2.5 text-sm gap-2">
                  <Save className="h-4 w-4" strokeWidth={1.5} />Save &amp; Recalculate
                </button>
              </div>
            </div>
          )}

          {isScenarioMode && (
            <div className="r-panel px-5 py-4 flex items-center justify-between"
              style={{ background: 'var(--caution-tint)', border: '1px solid color-mix(in oklch, var(--caution) 25%, transparent)' }}>
              <div className="flex items-center gap-3">
                <Zap className="h-5 w-5 shrink-0" style={{ color: 'var(--caution)' }} strokeWidth={1.5} />
                <div>
                  <p className="text-sm font-bold">Scenario Analysis Mode Active</p>
                  <p className="text-xs" style={{ color: 'var(--ink-muted)' }}>Viewing hypothetical numbers. Original uploaded data is unchanged.</p>
                </div>
              </div>
              <button onClick={() => setScenarioData(JSON.parse(JSON.stringify(financialData)))}
                className="text-xs font-bold px-4 py-2 rounded"
                style={{ background: 'var(--caution)', color: '#fff', border: 'none', cursor: 'pointer' }}>
                Reset to Original
              </button>
            </div>
          )}

          {/* UC6 Scenario sliders */}
          {isScenarioMode && scenarioData && (
            <div className="r-panel overflow-hidden">
              <div className="px-5 py-4" style={{ borderBottom: '1px solid var(--hairline)', background: 'var(--surface)' }}>
                <p className="text-sm font-bold">Scenario Controls</p>
                <p className="text-xs mt-0.5" style={{ color: 'var(--ink-muted)' }}>Drag sliders to simulate changes. Results update instantly.</p>
                {/* F-03 */}
                <p className="text-xs mt-1.5" style={{ color: 'var(--caution)' }}>Cash flow is adjustable independently — not derived from revenue or expenses.</p>
              </div>
              <div className="p-5 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[
                  { key: 'revenue',            label: 'Annual Revenue',      min: 0, max: financialData.revenue * 3 },
                  { key: 'expenses',           label: 'Annual Expenses',     min: 0, max: financialData.revenue * 3 },
                  // F-03
                  { key: 'cashFlow', label: 'Annual Cash Flow',
                    min: Math.min((financialData.cashFlow ?? 0) * 2, -(financialData.revenue ?? 0) * 0.5),
                    max: Math.max((financialData.cashFlow ?? 0) * 2, (financialData.revenue ?? 0) * 0.5) },
                  { key: 'totalDebt',          label: 'Total Debt',          min: 0, max: financialData.totalDebt * 4 || financialData.totalAssets },
                  { key: 'currentAssets',      label: 'Current Assets',      min: 0, max: financialData.currentAssets * 4 || financialData.totalAssets },
                  { key: 'currentLiabilities', label: 'Current Liabilities', min: 0, max: financialData.currentLiabilities * 4 || financialData.totalAssets },
                  { key: 'equity',             label: 'Equity',              min: financialData.totalAssets * -0.5, max: financialData.totalAssets * 2 },
                  ...(financialData.inventory != null ? [{ key: 'inventory', label: 'Inventory', min: 0, max: (financialData.inventory || 0) * 4 || financialData.currentAssets }] : []),
                  ...(financialData.interestExpense != null ? [{ key: 'interestExpense', label: 'Interest Expense', min: 0, max: (financialData.interestExpense || 0) * 4 || financialData.revenue * 0.2 }] : []),
                  ...(financialData.debtService != null ? [{ key: 'debtService', label: 'Annual Debt Service', min: 0, max: (financialData.debtService || 0) * 4 || financialData.totalDebt }] : []),
                ].map(({ key, label, min, max }) => (
                  <div key={key}>
                    <div className="flex items-center justify-between mb-2">
                      <label className="r-eyebrow">{label}</label>
                      <span className="text-xs font-bold tabular" style={{ color: 'var(--ink)' }}>
                        {scenarioData[key] >= 1e6 ? `${(scenarioData[key]/1e6).toFixed(2)}M` : `${(scenarioData[key]/1000).toFixed(0)}K`} SAR
                      </span>
                    </div>
                    <input type="range" min={min} max={max} step={(max - min) / 200} value={scenarioData[key] ?? 0}
                      onChange={(e) => setScenarioData({ ...scenarioData, [key]: parseFloat(e.target.value) })}
                      className="w-full" style={{ accentColor: 'var(--caution)' }} />
                    <input type="number" value={Math.round(scenarioData[key] ?? 0)}
                      onChange={(e) => setScenarioData({ ...scenarioData, [key]: parseFloat(e.target.value) || 0 })}
                      className="mt-2 w-full px-3 py-1.5 text-xs rounded outline-none" style={inputSt} />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* UC6 Results */}
          {(() => {
            const localResults = isScenarioMode && scenarioData ? computeAssessment(scenarioData) : assessmentResults;
            // F-02
            const activeResults = (isScenarioMode && scenarioMlData)
              ? { ...localResults, altmanZScore: scenarioMlData.altmanZScore, probabilityOfDefault: scenarioMlData.probabilityOfDefault }
              : localResults;
            return (
              <>
                {activeResults.knockouts && activeResults.knockouts.length > 0 && (
                  <div className="r-panel p-5" style={{ background: 'var(--danger-tint)', border: '1px solid color-mix(in oklch, var(--danger) 25%, transparent)' }}>
                    <div className="flex items-center gap-2 mb-3">
                      <XCircle className="h-5 w-5 shrink-0" style={{ color: 'var(--danger)' }} strokeWidth={1.5} />
                      <h3 className="text-sm font-bold">Automatic Disqualifiers Triggered</h3>
                    </div>
                    <ul className="space-y-2">
                      {activeResults.knockouts.map((k, idx) => (
                        <li key={idx} className="flex items-start gap-2 text-sm" style={{ color: 'var(--danger)' }}>
                          <XCircle className="h-4 w-4 shrink-0 mt-0.5" strokeWidth={1.5} />{k}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
                  {/* Decision card */}
                  <div className="rounded p-6 flex flex-col justify-between" style={decStyle(activeResults.decision)}>
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <p className="r-eyebrow">{isScenarioMode ? 'Scenario Decision' : 'Funding Decision'}</p>
                        {activeResults.decision === 'APPROVED' && <CheckCircle className="h-6 w-6" style={{ color: 'var(--safe)' }} strokeWidth={1.5} />}
                        {activeResults.decision === 'REVIEW'   && <AlertTriangle className="h-6 w-6" style={{ color: 'var(--caution)' }} strokeWidth={1.5} />}
                        {activeResults.decision === 'REJECTED' && <XCircle className="h-6 w-6" style={{ color: 'var(--danger)' }} strokeWidth={1.5} />}
                      </div>
                      <p className="text-5xl font-bold tabular mb-2">{activeResults.overallScore}%</p>
                      <p className="text-xs mb-3" style={{ color: 'var(--ink-muted)' }}>Weighted composite score</p>
                    </div>
                    <span className={`${decBadgeCls(activeResults.decision)} self-start`}
                      style={{ fontSize: '13px', padding: '5px 14px' }}>
                      {activeResults.decision === 'APPROVED' && <CheckCircle className="h-4 w-4" strokeWidth={1.5} />}
                      {activeResults.decision === 'REVIEW'   && <AlertTriangle className="h-4 w-4" strokeWidth={1.5} />}
                      {activeResults.decision === 'REJECTED' && <XCircle className="h-4 w-4" strokeWidth={1.5} />}
                      {activeResults.decision}
                    </span>
                  </div>

                  {/* Altman Z card */}
                  {(() => {
                    const altman = activeResults.altmanZScore || null;
                    const zone = altman?.zone || 'Pending';
                    const zs = getAltmanZoneStyles(zone);
                    return (
                      <div className="rounded p-6 flex flex-col justify-between" style={zs.cardStyle}>
                        <div>
                          <div className="flex items-center justify-between mb-4">
                            <p className="r-eyebrow">Altman Z''-Score</p>
                            <BarChart3 className="h-6 w-6" style={{ color: zs.iconColor }} strokeWidth={1.5} />
                          </div>
                          <p className="text-5xl font-bold tabular mb-2">
                            {altman?.score != null ? Number(altman.score).toFixed(2) : '—'}
                          </p>
                          {/* F-14 */}
                          {activeResults.mlFailed && (
                            <p className="text-[10px] font-semibold mb-3 flex items-center gap-1" style={{ color: 'var(--caution)' }}>
                              <AlertTriangle className="h-3 w-3 shrink-0" strokeWidth={1.5} />Local estimate — ML backend unavailable
                            </p>
                          )}
                          {activeResults.probabilityOfDefault != null && (
                            <div className="flex items-center justify-between px-3 py-2 rounded mb-1"
                              style={{ background: activeResults.probabilityOfDefault < 0.20 ? 'var(--safe-tint)' : activeResults.probabilityOfDefault < 0.60 ? 'var(--caution-tint)' : 'var(--danger-tint)' }}>
                              <span className="text-xs font-semibold" style={{ color: 'var(--ink-muted)' }}>Prob. of Default</span>
                              <span className="text-sm font-bold tabular"
                                style={{ color: activeResults.probabilityOfDefault < 0.20 ? 'var(--safe)' : activeResults.probabilityOfDefault < 0.60 ? 'var(--caution)' : 'var(--danger)' }}>
                                {(activeResults.probabilityOfDefault * 100).toFixed(2)}%
                              </span>
                            </div>
                          )}
                        </div>
                        <span className={`${zs.badgeCls} self-start mt-3`} style={{ fontSize: '12px', padding: '4px 12px' }}>
                          {String(zone).toLowerCase() === 'safe'    && <CheckCircle className="h-3.5 w-3.5" strokeWidth={1.5} />}
                          {(String(zone).toLowerCase() === 'grey' || String(zone).toLowerCase() === 'gray' || zone === 'Pending') && <AlertTriangle className="h-3.5 w-3.5" strokeWidth={1.5} />}
                          {String(zone).toLowerCase() === 'distress' && <XCircle className="h-3.5 w-3.5" strokeWidth={1.5} />}
                          {zone} Zone
                        </span>
                      </div>
                    );
                  })()}

                  {/* Ratio breakdown */}
                  <div className="lg:col-span-2 r-panel p-6">
                    <p className="text-sm font-bold mb-4">Financial Ratios Breakdown</p>
                    <div className="space-y-2">
                      {activeResults.activeRatios.map((r) => {
                        const score = activeResults.scores[r.key];
                        const value = formatRatioDisplay(r.key, activeResults.ratios[r.key]);
                        const weight = thresholds[r.key]?.weight ?? r.weight;
                        const benchmark = getRatioBenchmark(r.key);
                        return (
                          <div key={r.key} className="flex items-center justify-between px-4 py-3 rounded"
                            style={{
                              background: scoreTint(score),
                              border: `1px solid ${score >= 80 ? 'color-mix(in oklch, var(--safe) 15%, transparent)' : score >= 60 ? 'color-mix(in oklch, var(--caution) 15%, transparent)' : 'color-mix(in oklch, var(--danger) 15%, transparent)'}`,
                            }}>
                            <div className="flex items-center gap-3">
                              <div className="w-1.5 h-8 rounded-full shrink-0" style={{ background: scoreColor(score) }} />
                              <div>
                                <p className="text-sm font-semibold">{r.label}</p>
                                <p className="text-[11px]" style={{ color: 'var(--ink-muted)' }}>
                                  Weight: {weight}% · {benchmark}
                                  {' '}<span className="font-semibold" style={{ color: 'var(--signal)' }}>({selectedIndustry})</span>
                                </p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="text-base font-bold tabular">{value}</p>
                              <p className="text-xs font-bold tabular" style={{ color: scoreColor(score) }}>{score} / 100</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {activeResults.droppedRatios && activeResults.droppedRatios.length > 0 && (
                      <div className="mt-4 p-4 rounded" style={{ background: 'var(--caution-tint)', border: '1px solid color-mix(in oklch, var(--caution) 20%, transparent)' }}>
                        <div className="flex items-center gap-2 mb-2">
                          <AlertTriangle className="w-4 h-4 shrink-0" style={{ color: 'var(--caution)' }} strokeWidth={1.5} />
                          <p className="text-xs font-semibold" style={{ color: 'var(--caution)' }}>Ratios excluded from this assessment</p>
                        </div>
                        <ul className="text-xs space-y-0.5" style={{ color: 'var(--ink-muted)' }}>
                          {activeResults.droppedRatios.map((msg, i) => <li key={i}>· {msg}</li>)}
                        </ul>
                        <p className="text-xs mt-2" style={{ color: 'var(--ink-faint)' }}>
                          Weights redistributed across {activeResults.activeRatios.length} available ratios.
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* PoD gauge */}
                {activeResults.probabilityOfDefault != null && (
                  <div className="r-panel p-6">
                    <div className="flex justify-between items-center mb-2">
                      <p className="r-eyebrow">Probability of Default</p>
                      <span className="font-mono text-lg font-bold tabular"
                        style={{ color: activeResults.probabilityOfDefault < 0.2 ? 'var(--safe)' : activeResults.probabilityOfDefault < 0.6 ? 'var(--caution)' : 'var(--danger)' }}>
                        {(activeResults.probabilityOfDefault * 100).toFixed(2)}%
                      </span>
                    </div>
                    <div className="w-full h-3 rounded-full overflow-hidden" style={{ background: 'var(--hairline)' }}>
                      <div className="h-full transition-all duration-500 rounded-full"
                        style={{ width: `${activeResults.probabilityOfDefault * 100}%`, background: activeResults.probabilityOfDefault < 0.2 ? 'var(--safe)' : activeResults.probabilityOfDefault < 0.6 ? 'var(--caution)' : 'var(--danger)' }} />
                    </div>
                  </div>
                )}
                {/* F-13 */}
                {isScenarioMode && scenarioMlError && activeResults.probabilityOfDefault == null && (
                  <div className="r-panel p-5 flex items-center gap-2.5" style={{ border: '1px solid color-mix(in oklch, var(--caution) 25%, transparent)' }}>
                    <AlertTriangle className="h-4 w-4 shrink-0" style={{ color: 'var(--caution)' }} strokeWidth={1.5} />
                    <p className="text-sm font-semibold" style={{ color: 'var(--caution)' }}>Probability of Default unavailable — ML backend error</p>
                  </div>
                )}

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                  <div className="r-panel p-5">
                    <p className="text-sm font-bold mb-4 flex items-center gap-2">
                      <CheckCircle className="h-4 w-4" style={{ color: 'var(--safe)' }} strokeWidth={1.5} />Strengths
                    </p>
                    {activeResults.strengths.length > 0
                      ? <ul className="space-y-2">{activeResults.strengths.map((s, idx) => (
                          <li key={idx} className="flex items-start gap-2 text-sm" style={{ color: 'var(--ink-muted)' }}>
                            <CheckCircle className="h-4 w-4 shrink-0 mt-0.5" style={{ color: 'var(--safe)' }} strokeWidth={1.5} />{s}
                          </li>
                        ))}</ul>
                      : <p className="text-sm italic" style={{ color: 'var(--ink-faint)' }}>No strengths identified.</p>}
                  </div>

                  <div className="r-panel p-5">
                    <p className="text-sm font-bold mb-4 flex items-center gap-2">
                      <AlertTriangle className="h-4 w-4" style={{ color: 'var(--danger)' }} strokeWidth={1.5} />Weaknesses
                    </p>
                    {activeResults.weaknesses.length > 0
                      ? <ul className="space-y-2">{activeResults.weaknesses.map((w, idx) => (
                          <li key={idx} className="flex items-start gap-2 text-sm" style={{ color: 'var(--ink-muted)' }}>
                            <XCircle className="h-4 w-4 shrink-0 mt-0.5" style={{ color: 'var(--danger)' }} strokeWidth={1.5} />{w}
                          </li>
                        ))}</ul>
                      : <p className="text-sm italic" style={{ color: 'var(--ink-faint)' }}>No critical weaknesses identified.</p>}
                  </div>

                  <div className="rounded p-5" style={{ background: 'var(--navy-950)', border: '1px solid var(--navy-800)' }}>
                    <p className="text-sm font-bold mb-4 flex items-center gap-2" style={{ color: 'var(--panel)' }}>
                      <Save className="h-4 w-4" style={{ color: 'var(--signal)' }} strokeWidth={1.5} />Recommendations
                    </p>
                    <ul className="space-y-2">
                      {activeResults.decision === 'APPROVED' && (<>
                        <li className="text-sm flex items-start gap-2" style={{ color: 'oklch(0.75 0.015 75)' }}><span style={{ color: 'var(--safe)' }}>→</span>Approve funding request</li>
                        <li className="text-sm flex items-start gap-2" style={{ color: 'oklch(0.75 0.015 75)' }}><span style={{ color: 'var(--safe)' }}>→</span>Standard loan terms applicable</li>
                        <li className="text-sm flex items-start gap-2" style={{ color: 'oklch(0.75 0.015 75)' }}><span style={{ color: 'var(--safe)' }}>→</span>Monitor quarterly performance</li>
                      </>)}
                      {activeResults.decision === 'REVIEW' && (<>
                        <li className="text-sm flex items-start gap-2" style={{ color: 'oklch(0.75 0.015 75)' }}><span style={{ color: 'var(--caution)' }}>→</span>Request additional documentation</li>
                        <li className="text-sm flex items-start gap-2" style={{ color: 'oklch(0.75 0.015 75)' }}><span style={{ color: 'var(--caution)' }}>→</span>Consider conditional approval</li>
                        <li className="text-sm flex items-start gap-2" style={{ color: 'oklch(0.75 0.015 75)' }}><span style={{ color: 'var(--caution)' }}>→</span>Reassess after 90 days</li>
                      </>)}
                      {activeResults.decision === 'REJECTED' && (<>
                        <li className="text-sm flex items-start gap-2" style={{ color: 'oklch(0.75 0.015 75)' }}><span style={{ color: 'var(--danger)' }}>→</span>Decline funding request</li>
                        <li className="text-sm flex items-start gap-2" style={{ color: 'oklch(0.75 0.015 75)' }}><span style={{ color: 'var(--danger)' }}>→</span>Advise SME to improve liquidity</li>
                        <li className="text-sm flex items-start gap-2" style={{ color: 'oklch(0.75 0.015 75)' }}><span style={{ color: 'var(--danger)' }}>→</span>Invite reapplication after restructuring</li>
                      </>)}
                    </ul>
                  </div>
                </div>
              </>
            );
          })()}

          {/* Stress Test module */}
          <div className="r-panel overflow-hidden">
            {!isStressTestActive ? (
              <div className="p-8">
                <div className="flex items-start gap-4 mb-6">
                  <div className="p-3 rounded shrink-0" style={{ background: 'var(--navy-950)' }}>
                    <Brain className="h-6 w-6" style={{ color: 'var(--panel)' }} strokeWidth={1.5} />
                  </div>
                  <div>
                    <h2 className="text-base font-bold mb-1">Predictive Risk &amp; Covenant Stress Test</h2>
                    <p className="text-sm" style={{ color: 'var(--ink-muted)' }}>Simulate future cash flow momentum to project covenant breaches and liquidity risk.</p>
                  </div>
                </div>
                {isForecasting ? (
                  <div className="flex items-center gap-3 text-sm" style={{ color: 'var(--ink-muted)' }}>
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2" style={{ borderColor: 'var(--signal)' }} />
                    Running LightGBM inference...
                  </div>
                ) : financialData.isManualEntry ? (
                  // F-19
                  <div className="flex items-start gap-3 px-4 py-3 rounded text-sm" style={{ background: 'var(--surface)', border: '1px solid var(--hairline)', color: 'var(--ink-muted)' }}>
                    <AlertTriangle className="h-4 w-4 shrink-0 mt-0.5" style={{ color: 'var(--caution)' }} strokeWidth={1.5} />
                    Monthly cash flow history is required to run the forecast. Upload a CSV with monthly data to enable this feature.
                  </div>
                ) : (
                  <button onClick={runStressTest} className="r-btn-signal px-6 py-3 text-sm gap-2">
                    <Zap className="h-4 w-4" strokeWidth={1.5} />Run 6-Month AI Liquidity Forecast
                  </button>
                )}
              </div>
            ) : forecastData ? (
              <div>
                <div className="px-6 py-4 flex items-center justify-between" style={{ borderBottom: '1px solid var(--hairline)' }}>
                  <div className="flex items-center gap-3">
                    <div className="p-2 rounded shrink-0" style={{ background: 'var(--navy-950)' }}>
                      <Brain className="h-4 w-4" style={{ color: 'var(--panel)' }} strokeWidth={1.5} />
                    </div>
                    <div>
                      <p className="text-sm font-bold">Predictive Risk &amp; Covenant Stress Test</p>
                      <p className="text-xs" style={{ color: 'var(--ink-muted)' }}>
                        {forecastData.summary.forecastMethod === 'ARIMA' ? 'ARIMA' : 'Exponential Smoothing'} 6-month projection
                      </p>
                      {forecastData.summary.arimaFellBack && (
                        <p className="text-xs mt-0.5" style={{ color: 'var(--caution)' }}>Advanced model unavailable; used Exponential Smoothing instead.</p>
                      )}
                    </div>
                  </div>
                  <div className="flex items-center gap-3 flex-wrap">
                    <span className={forecastData.summary.trend === 'Growing' ? 'r-badge-safe' : forecastData.summary.trend === 'Declining' ? 'r-badge-danger' : 'r-badge-neutral'}>
                      {forecastData.summary.trend}
                    </span>
                    <span className="text-xs" style={{ color: 'var(--ink-muted)' }}>
                      Confidence: <span className="font-bold" style={{ color: forecastData.summary.confidenceTier === 'narrow' ? 'var(--safe)' : forecastData.summary.confidenceTier === 'wide' ? 'var(--caution)' : 'var(--ink)' }}>
                        {forecastData.summary.confidenceTier === 'narrow' ? 'High (24+ mo)' : forecastData.summary.confidenceTier === 'standard' ? 'Moderate (12-23 mo)' : forecastData.summary.confidenceTier === 'wide' ? 'Low (<12 mo)' : 'unavailable'}
                      </span>
                    </span>
                    {forecastData.summary.forecastMethod && (() => {
                      const histCount = (financialData?.monthlyRevenue ?? []).filter(m => m?.cashFlow != null).length;
                      const label = forecastData.summary.forecastMethod === 'ARIMA' ? 'ARIMA' : 'Exponential Smoothing';
                      return (
                        <span className="text-xs" style={{ color: 'var(--ink-muted)' }}>
                          Model: <span className="font-bold" style={{ color: forecastData.summary.forecastMethod === 'ARIMA' ? 'var(--safe)' : 'var(--ink-muted)' }}>{label} ({histCount} mo)</span>
                        </span>
                      );
                    })()}
                    <button onClick={() => { setIsStressTestActive(false); setForecastData(null); }}
                      className="r-btn-ghost text-xs px-2.5 py-1">Reset</button>
                  </div>
                </div>

                <div className="p-6 space-y-4">
                  <div className="flex items-center gap-4 px-5 py-3 rounded" style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}>
                    <span className="r-eyebrow whitespace-nowrap">Forecast Month</span>
                    <div className="flex items-center gap-3">
                      <span className="text-[11px]" style={{ color: 'var(--ink-faint)' }}>M1</span>
                      <input type="range" min={1} max={6} step={1} value={activeForecastMonth}
                        onChange={(e) => setActiveForecastMonth(parseInt(e.target.value))}
                        className="w-48" style={{ accentColor: 'var(--signal)' }} />
                      <span className="text-[11px]" style={{ color: 'var(--ink-faint)' }}>M6</span>
                    </div>
                    <span className="text-sm font-bold tabular px-3 py-1 rounded" style={{ background: 'var(--navy-950)', color: 'var(--panel)' }}>
                      Month {activeForecastMonth}
                    </span>
                  </div>

                  <div className="h-64 rounded p-4" style={{ background: 'var(--surface)', border: '1px solid var(--hairline)' }}>
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={forecastData.combined}>
                        <CartesianGrid strokeDasharray="3 3" stroke="var(--hairline)" />
                        <XAxis dataKey="month" stroke="var(--ink-faint)" style={{ fontSize: '10px' }} tick={{ fill: 'var(--ink-faint)' }} />
                        <YAxis stroke="var(--ink-faint)" style={{ fontSize: '10px' }} tick={{ fill: 'var(--ink-faint)' }} tickFormatter={(v) => v >= 1e6 ? `${(v/1e6).toFixed(1)}M` : v >= 1000 ? `${(v/1000).toFixed(0)}K` : v} />
                        <Tooltip contentStyle={ttSt} formatter={(value, name) => [value >= 1e6 ? `${(value/1e6).toFixed(2)}M SAR` : `${(value/1000).toFixed(0)}K SAR`, name === 'actualCashFlow' ? 'Cash Flow' : name === 'forecastedCashFlow' ? 'Forecast' : name]} />
                        <Area dataKey="upperBound" fill="var(--signal)" stroke="none" fillOpacity={0.08} />
                        <Area dataKey="lowerBound" fill="var(--signal)" stroke="none" fillOpacity={0.08} />
                        <Line dataKey="actualCashFlow" stroke="var(--navy-700)" strokeWidth={2} dot={{ r: 2, fill: 'var(--navy-700)' }} />
                        <Line dataKey="forecastedCashFlow" stroke="var(--signal)" strokeWidth={2} strokeDasharray="5 5" dot={{ r: 2, fill: 'var(--signal)' }} />
                        {forecastData.combined.findIndex(d => d.forecastedCashFlow !== undefined) > 0 && (
                          <ReferenceLine x={forecastData.combined[forecastData.combined.findIndex(d => d.forecastedCashFlow !== undefined)].month}
                            stroke="var(--ink-faint)" strokeDasharray="4 4"
                            label={{ value: 'Forecast Start', position: 'insideTopRight', fontSize: 9, fill: 'var(--ink-faint)' }} />
                        )}
                        <ReferenceLine x={forecastData.forecast[activeForecastMonth - 1].month}
                          stroke="var(--signal)" strokeWidth={2}
                          label={{ value: `M${activeForecastMonth}`, position: 'insideTopLeft', fontSize: 10, fill: 'var(--signal)' }} />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="flex items-center gap-6 justify-center">
                    <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--ink-muted)' }}><div className="w-5 h-0.5 rounded" style={{ background: 'var(--navy-700)' }} />Historical CF</div>
                    <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--ink-muted)' }}><div className="w-5 h-0.5 rounded" style={{ background: 'var(--signal)' }} />Forecast</div>
                    <div className="flex items-center gap-2 text-xs" style={{ color: 'var(--ink-muted)' }}><div className="w-5 h-3 rounded opacity-25" style={{ background: 'var(--signal)' }} />Confidence Band</div>
                  </div>
                </div>

                {/* Row 2: Covenant cards */}
                {(() => {
                  const forecastMonth = forecastData.forecast[activeForecastMonth - 1];
                  const baselineMonthlyCF = (financialData.cashFlow || 0) / 12;
                  const projectedMonthlyCF = forecastMonth?.forecastedCashFlow ?? baselineMonthlyCF;
                  const projectedAnnualCF = projectedMonthlyCF * 12;
                  // Used only for projectedFinData / funding-score estimate — not for covenant cards
                  const cumulativeCFDelta = (projectedMonthlyCF - baselineMonthlyCF) * activeForecastMonth;
                  const projectedCurrentAssets = Math.max(0, (financialData.currentAssets ?? 0) + cumulativeCFDelta);
                  // F-04: use backend per-month ratios
                  const projectedDSCR         = forecastMonth?.dscr         ?? null;
                  const projectedCurrentRatio = forecastMonth?.currentRatio ?? null;
                  const projectedQuickRatio   = forecastMonth?.quickRatio   ?? null;
                  const standards = industryStandards[selectedIndustry] || industryStandards.Default;
                  const dscrBreach         = projectedDSCR !== null && projectedDSCR < 1.0;
                  const currentRatioBreach = projectedCurrentRatio !== null && projectedCurrentRatio < standards.minCurrentRatio;
                  const quickRatioBreach   = projectedQuickRatio !== null && projectedQuickRatio < standards.minQuickRatio;
                  // revenue held static
                  const projectedFinData = { ...financialData, cashFlow: projectedAnnualCF, currentAssets: projectedCurrentAssets };
                  const projectedAssessment = computeAssessment(projectedFinData);
                  const baseline = assessmentResults.ratios;
                  // F-07
                  const podValue = forecastMonth?.probabilityOfDefault ?? null;
                  const cvSt = (breach) => ({
                    background: breach ? 'var(--danger-tint)' : 'var(--surface)',
                    border: `1px solid ${breach ? 'color-mix(in oklch, var(--danger) 25%, transparent)' : 'var(--hairline)'}`,
                  });
                  return (
                    <div className="px-6 pb-6 space-y-4">
                      <div className="flex items-center gap-3">
                        <span className="r-eyebrow">Month {activeForecastMonth} — Projected Covenant Impact</span>
                        <div className="h-px flex-1" style={{ background: 'var(--hairline)' }} />
                      </div>
                      {podValue != null && (
                        <div className="r-panel px-5 py-4">
                          <div className="flex justify-between items-center mb-2">
                            <p className="r-eyebrow">Prob. of Default — Month {activeForecastMonth}</p>
                            <span className="font-mono text-base font-bold tabular" style={{ color: podValue < 0.2 ? 'var(--safe)' : podValue < 0.6 ? 'var(--caution)' : 'var(--danger)' }}>
                              {(podValue * 100).toFixed(2)}%
                            </span>
                          </div>
                          <div className="w-full h-2.5 rounded-full overflow-hidden" style={{ background: 'var(--hairline)' }}>
                            <div className="h-full transition-all duration-500 rounded-full"
                              style={{ width: `${podValue * 100}%`, background: podValue < 0.2 ? 'var(--safe)' : podValue < 0.6 ? 'var(--caution)' : 'var(--danger)' }} />
                          </div>
                        </div>
                      )}
                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        <div className="space-y-3">
                          <p className="r-eyebrow">Dynamic Covenants</p>
                          <div className="grid grid-cols-2 gap-3">
                            <div className="col-span-2 r-panel p-4 flex items-center gap-4">
                              <div>
                                <p className="text-xs mb-1" style={{ color: 'var(--ink-muted)' }}>
                                  Projected Funding Score
                                  <span className="ml-1" style={{ color: 'var(--ink-faint)' }}>(cash flow projected, revenue held static)</span>
                                </p>
                                <p className="text-3xl font-bold tabular" style={{ color: scoreColor(parseFloat(projectedAssessment.overallScore)) }}>
                                  {projectedAssessment.overallScore}%
                                </p>
                              </div>
                              <span className={`${decBadgeCls(projectedAssessment.decision)}`} style={{ fontSize: '12px', padding: '4px 10px' }}>
                                {projectedAssessment.decision}
                              </span>
                            </div>
                            {/* F-07: second PoD gauge removed */}
                            <div className="rounded p-4" style={cvSt(dscrBreach)}>
                              <div className="flex items-center justify-between mb-2">
                                <p className="r-eyebrow" style={{ color: dscrBreach ? 'var(--danger)' : undefined }}>DSCR</p>
                                {dscrBreach && <AlertTriangle className="h-3.5 w-3.5" style={{ color: 'var(--danger)' }} strokeWidth={1.5} />}
                              </div>
                              <p className="text-xl font-bold tabular" style={{ color: dscrBreach ? 'var(--danger)' : 'var(--ink)' }}>
                                {projectedDSCR !== null ? `${projectedDSCR.toFixed(2)}x` : 'N/A'}
                              </p>
                              <p className="text-xs mt-1" style={{ color: dscrBreach ? 'var(--danger)' : 'var(--ink-faint)' }}>
                                {dscrBreach ? 'Breach — below 1.0x' : projectedDSCR !== null ? 'Min: 1.0x' : 'No debt service data'}
                              </p>
                            </div>
                            <div className="rounded p-4" style={cvSt(currentRatioBreach)}>
                              <div className="flex items-center justify-between mb-2">
                                <p className="r-eyebrow" style={{ color: currentRatioBreach ? 'var(--danger)' : undefined }}>Current Ratio</p>
                                {currentRatioBreach && <AlertTriangle className="h-3.5 w-3.5" style={{ color: 'var(--danger)' }} strokeWidth={1.5} />}
                              </div>
                              <p className="text-xl font-bold tabular" style={{ color: currentRatioBreach ? 'var(--danger)' : 'var(--ink)' }}>
                                {projectedCurrentRatio !== null ? `${projectedCurrentRatio.toFixed(2)}x` : 'N/A'}
                              </p>
                              <p className="text-xs mt-1" style={{ color: currentRatioBreach ? 'var(--danger)' : 'var(--ink-faint)' }}>
                                {currentRatioBreach ? `Breach — below ${standards.minCurrentRatio}x` : `Min: ${standards.minCurrentRatio}x`}
                              </p>
                            </div>
                            <div className="col-span-2 rounded p-4" style={cvSt(quickRatioBreach)}>
                              <div className="flex items-center justify-between mb-2">
                                <p className="r-eyebrow" style={{ color: quickRatioBreach ? 'var(--danger)' : undefined }}>Quick Ratio</p>
                                {quickRatioBreach && <AlertTriangle className="h-3.5 w-3.5" style={{ color: 'var(--danger)' }} strokeWidth={1.5} />}
                              </div>
                              <p className="text-xl font-bold tabular" style={{ color: quickRatioBreach ? 'var(--danger)' : 'var(--ink)' }}>
                                {projectedQuickRatio !== null ? `${projectedQuickRatio.toFixed(2)}x` : 'N/A (inventory data not provided)'}
                              </p>
                              <p className="text-xs mt-1" style={{ color: quickRatioBreach ? 'var(--danger)' : 'var(--ink-faint)' }}>
                                {quickRatioBreach ? `Breach — below ${standards.minQuickRatio}x` : projectedQuickRatio !== null ? `Min: ${standards.minQuickRatio}x` : ''}
                              </p>
                            </div>
                          </div>
                        </div>
                        <div className="r-panel p-5 flex flex-col" style={{ background: 'var(--surface)' }}>
                          <div className="flex items-center gap-2 mb-4 flex-wrap">
                            <p className="r-eyebrow">Structural Metrics</p>
                            <span className="r-badge-neutral">Held Static</span>
                          </div>
                          <div className="grid grid-cols-2 gap-5 flex-1">
                            {[
                              { label: 'D/E Ratio',     raw: baseline.debtToEquity, suffix: baseline.debtToEquity && !baseline.debtToEquity.startsWith('N/A') ? 'x' : '' },
                              { label: 'ICR',           raw: baseline.icr,          suffix: baseline.icr ? 'x' : '' },
                              { label: 'ROA',           raw: baseline.roa,          suffix: baseline.roa ? '%' : '' },
                              { label: 'EBITDA Margin', raw: baseline.ebitdaMargin, suffix: baseline.ebitdaMargin ? '%' : '' },
                            ].map(({ label, raw, suffix }) => (
                              <div key={label} className="pl-3" style={{ borderLeft: '2px solid var(--hairline)' }}>
                                <p className="text-xs mb-0.5" style={{ color: 'var(--ink-faint)' }}>{label}</p>
                                <p className="text-base font-bold tabular">{raw != null ? `${raw}${suffix}` : 'N/A'}</p>
                              </div>
                            ))}
                          </div>
                          <p className="text-xs mt-5 italic" style={{ color: 'var(--ink-faint)' }}>Month 0 balance sheet — unchanged by the forecast slider.</p>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            ) : null}
          </div>

          <LoanRecommendationCard financialData={financialData} industry={selectedIndustry} />

        </main>
      </div>
    );
  }

  // UI: Portfolio Page
  if (currentPage === 'portfolio') {
    return (
      <div className="min-h-screen" style={{ background: 'var(--surface)' }}>
        <NavBar currentPage={currentPage} setCurrentPage={setCurrentPage}
          financialData={financialData} assessmentResults={assessmentResults} portfolio={portfolio} />

        <main className="max-w-[1320px] mx-auto px-8 py-8">
          <div className="flex items-center justify-between mb-7">
            <div>
              <h1 className="text-2xl font-bold">Assessment History</h1>
              <p className="text-sm mt-1" style={{ color: 'var(--ink-muted)' }}>
                {portfolio.length} {portfolio.length === 1 ? 'company' : 'companies'} assessed — click a row to open the full report
              </p>
            </div>
            <button onClick={() => { setCurrentPage('upload'); setFinancialData(null); setUploadedFile(null); setAssessmentResults(null); setForecastData(null); setPortfolioViewMeta(null); setIsStressTestActive(false); setActiveForecastMonth(1); }}
              className="r-btn-ghost px-4 py-2 text-sm gap-2">
              <Upload className="h-4 w-4" strokeWidth={1.5} />New Assessment
            </button>
          </div>

          {portfolio.length === 0 ? (
            <div className="r-panel p-16 text-center">
              <Building2 className="h-12 w-12 mx-auto mb-4" style={{ color: 'var(--hairline)' }} strokeWidth={1.5} />
              <h2 className="text-xl font-bold mb-2" style={{ color: 'var(--ink-muted)' }}>No assessments yet</h2>
              <p className="text-sm" style={{ color: 'var(--ink-faint)' }}>Run your first funding assessment to see it here.</p>
            </div>
          ) : (
            <>
              <div className="grid grid-cols-3 gap-5 mb-7">
                <div className="r-panel p-5">
                  <p className="r-eyebrow mb-2">Total Assessed</p>
                  <p className="text-4xl font-bold tabular">{portfolio.length}</p>
                </div>
                <div className="r-panel p-5" style={{ background: 'var(--safe-tint)' }}>
                  <p className="r-eyebrow mb-2" style={{ color: 'var(--safe)' }}>Approved</p>
                  <p className="text-4xl font-bold tabular" style={{ color: 'var(--safe)' }}>{portfolio.filter(p => p.decision === 'APPROVED').length}</p>
                </div>
                <div className="r-panel p-5" style={{ background: 'var(--danger-tint)' }}>
                  <p className="r-eyebrow mb-2" style={{ color: 'var(--danger)' }}>Rejected</p>
                  <p className="text-4xl font-bold tabular" style={{ color: 'var(--danger)' }}>{portfolio.filter(p => p.decision === 'REJECTED').length}</p>
                </div>
              </div>

              <div className="r-panel overflow-hidden">
                <div className="px-6 py-4" style={{ background: 'var(--navy-950)', borderBottom: '1px solid var(--navy-800)' }}>
                  <p className="text-sm font-bold" style={{ color: 'var(--panel)' }}>Assessment History</p>
                </div>
                <div className="overflow-x-auto">
                  <table className="r-table">
                    <thead>
                      <tr>
                        {['Company', 'Date', 'Revenue', 'Score', 'Current Ratio', 'EBITDA Margin', 'DSCR', 'Decision'].map(h => (
                          <th key={h}>{h}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {portfolio.map((entry) => (
                        <tr key={entry.id}
                          onClick={() => openPortfolioEntry(entry)}
                          className="transition-colors"
                          style={{ cursor: entry.assessmentSnapshot ? 'pointer' : 'not-allowed', opacity: entry.assessmentSnapshot ? 1 : 0.7 }}
                          onMouseEnter={e => { if (entry.assessmentSnapshot) e.currentTarget.style.background = 'var(--surface)'; }}
                          onMouseLeave={e => { e.currentTarget.style.background = ''; }}>
                          <td>
                            <p className="font-semibold">{entry.companyName}</p>
                            {entry.knockouts > 0 && <p className="text-[11px] mt-0.5 font-medium" style={{ color: 'var(--danger)' }}>{entry.knockouts} disqualifier{entry.knockouts > 1 ? 's' : ''}</p>}
                            {entry.assessmentSnapshot && <p className="text-[11px] mt-0.5 font-medium" style={{ color: 'var(--signal)' }}>View report</p>}
                          </td>
                          <td style={{ color: 'var(--ink-muted)' }}>{entry.assessedAt}</td>
                          <td className="font-medium">{(entry.revenue / 1e6).toFixed(1)}M SAR</td>
                          <td>
                            <span className="text-lg font-bold tabular"
                              style={{ color: parseFloat(entry.overallScore) >= 70 ? 'var(--safe)' : parseFloat(entry.overallScore) >= 50 ? 'var(--caution)' : 'var(--danger)' }}>
                              {entry.overallScore}%
                            </span>
                          </td>
                          <td style={{ color: 'var(--ink-muted)' }}>{entry.ratios.currentRatio}</td>
                          <td style={{ color: 'var(--ink-muted)' }}>{(entry.ratios.ebitdaMargin ?? entry.ratios.profitMargin) + '%'}</td>
                          <td style={{ color: 'var(--ink-muted)' }}>{entry.ratios.dscr}</td>
                          <td>
                            <span className={entry.decision === 'APPROVED' ? 'r-badge-safe' : entry.decision === 'REVIEW' ? 'r-badge-caution' : 'r-badge-danger'}>
                              {entry.decision === 'APPROVED' && <CheckCircle className="h-3 w-3" strokeWidth={1.5} />}
                              {entry.decision === 'REVIEW'   && <AlertTriangle className="h-3 w-3" strokeWidth={1.5} />}
                              {entry.decision === 'REJECTED' && <XCircle className="h-3 w-3" strokeWidth={1.5} />}
                              {entry.decision}
                            </span>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            </>
          )}
        </main>
      </div>
    );
  }

  return null;
}