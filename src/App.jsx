import React, { useState, useEffect, useRef } from 'react';
import { Upload, FileText, CheckCircle, AlertTriangle, XCircle, Calculator, TrendingUp, Settings, Save, BarChart3, ArrowRight, ArrowLeft, Building2, DollarSign, Circle, Brain, Zap, X } from 'lucide-react';
import LoanRecommendationCard from './LoanRecommendationCard';
import { demoDatasets, demoProfiles, DEMO_COLUMNS, processDemoDataset } from './utils/demoData';
import {
  parseMappedNumeric,
  buildHistoricalMonthFromRow,
  buildForecastRequestBody,
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
    totalAssets: '', totalDebt: '', equity: '', cashFlow: '',
    inventory: '', interestExpense: '', debtService: ''
  });
  const [rawFileData, setRawFileData] = useState(null); // original parsed CSV rows, used for trend charts
  const [manualData, setManualData] = useState({
    companyName: '', revenue: '', expenses: '',
    currentAssets: '', currentLiabilities: '',
    totalAssets: '', totalDebt: '', equity: '', cashFlow: '',
    inventory: null, interestExpense: null, debtService: null
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
    fetch('https://finsight-backend.onrender.com/')
      .catch(() => {}); // silent fail — just waking the server
  }, []);

  const COLORS = ['#0F172A', '#1E293B', '#334155', '#475569', '#64748B'];

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
        const headers = lines[0].split(',').map(h => h.trim().replace(/['"]/g, ''));
        const firstDataRow = lines[1].split(',').map(d => d.trim().replace(/['"]/g, ''));
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
            const values = line.split(',').map(d => d.trim().replace(/['"]/g, ''));
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
      totalAssets: '', totalDebt: '', equity: '', cashFlow: '',
      inventory: '', interestExpense: '', debtService: ''
    };
    const matchRules = [
      { field: 'companyName',        keywords: ['company_name', 'business_name', 'firm_name', 'company', 'business', 'firm'] },
      { field: 'currentLiabilities', keywords: ['current_liabilities', 'current_liab', 'curr_liab', 'current_debt'] },
      { field: 'currentAssets',      keywords: ['current_assets', 'current_asset', 'curr_assets'] },
      { field: 'totalAssets',        keywords: ['total_assets', 'total_asset', 'totalassets'] },
      { field: 'totalDebt',          keywords: ['total_debt', 'total_liabilities', 'total_liab', 'long_term_debt'] },
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
      inventory:          inventoryVal,
      interestExpense:    interestExpenseSum,
      debtService:        debtServiceSum,
      historicalMonths,
      monthlyRevenue,
      assetBreakdown: [
        { name: 'Current Assets',   value: currentAssets ?? 0 },
        { name: 'Fixed Assets',     value: totalAssets != null ? Math.round(totalAssets * 0.55) : 0 },
        { name: 'Intangible Assets',value: totalAssets != null && currentAssets != null ? Math.max(0, Math.round(totalAssets - currentAssets - (totalAssets * 0.55))) : 0 }
      ]
    });
    setShowFieldMapping(false);
  };

  // UC4: Stress Test — sends annualized financials to FastAPI, receives 6-month LightGBM prediction
  const runStressTest = async () => {
    setIsForecasting(true);
    try {
      const forecastPayload = {
        historicalCashFlows: financialData.monthlyRevenue.map(row => row.cashFlow ?? 0),
        currentAssets:       financialData.currentAssets       ?? 0,
        currentLiabilities:  financialData.currentLiabilities  ?? 0,
        totalAssets:         financialData.totalAssets          ?? 0,
        totalDebt:           financialData.totalDebt            ?? 0,
        equity:              financialData.equity               ?? 0,
        inventory:           financialData.inventory            ?? null,
        debtService:         financialData.debtService          ?? null,
        interest_expense:    financialData.interestExpense      ?? null,
        industry:            selectedIndustry,
        revenue:             financialData.revenue              ?? 0,
        expenses:            financialData.expenses             ?? 0,
        retainedEarnings:    financialData.retainedEarnings     ?? null,
        confidenceTier: "standard"
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
      const avgConf = 80;
      const first   = mappedForecast[0].forecastedCashFlow;
      const last    = mappedForecast[mappedForecast.length - 1].forecastedCashFlow;
      const change  = (last - first) / Math.abs(first || 1);

      // Negative average overrides trend direction regardless of slope
      let trend;
      if (avg < 0)            trend = 'Declining';
      else if (change > 0.03)  trend = 'Growing';
      else if (change < -0.03) trend = 'Declining';
      else                     trend = 'Stable';

      setForecastData({
        combined,
        forecast: mappedForecast, // normalised — probabilityOfDefault is always camelCase here
        summary: { avgForecast: avg, totalForecast: Math.round(total), trend, confidence: avgConf }
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
    const baseSnapshot = { ratios, scores, activeRatios, droppedRatios, overallScore, decision, knockouts, strengths, weaknesses, altmanZScore, probabilityOfDefault: null };

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
      }
    } catch (err) {
      console.error('computeAssessment ML call failed — local Z-Score retained:', err);
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
      if (!res.ok) return;
      const ml = await res.json();
      setScenarioMlData({ altmanZScore: ml.altmanZScore, probabilityOfDefault: ml.probabilityOfDefault });
    } catch {}
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
      totalAssets: 'Total_Assets', totalDebt: 'Total_Debt', equity: 'Equity', cashFlow: 'Cashflow',
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
    const totalDebt          = parseManualNum(manualData.totalDebt);
    const equity             = parseManualNum(manualData.equity);
    const cashFlowAnnual     = parseManualNum(manualData.cashFlow);
    const inventory          = parseManualNum(manualData.inventory);
    const interestExpense    = parseManualNum(manualData.interestExpense);
    const debtService        = parseManualNum(manualData.debtService);

    months.forEach((month) => {
      const monthCF = Math.round((monthRev - monthExp) * 0.8);
      monthlyRevenue.push({
        month, revenue: monthRev, expenses: monthExp,
        profit:   monthRev - monthExp,
        cashFlow: monthCF,
      });
      historicalMonths.push({
        month,
        revenue: monthRev,
        expenses: monthExp,
        cashFlow: monthCF,
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
      currentAssets:      currentAssets ?? 0,
      currentLiabilities: currentLiabilities ?? 0,
      totalAssets:        totalAssets ?? 0,
      totalDebt:          totalDebt ?? 0,
      equity:             equity ?? 0,
      cashFlow:           cashFlowAnnual ?? 0,
      inventory,
      interestExpense,
      debtService,
      historicalMonths,
      monthlyRevenue,
      assetBreakdown: [
        { name: 'Current Assets',    value: currentAssets ?? 0 },
        { name: 'Fixed Assets',      value: totalAssets != null ? Math.round(totalAssets * 0.55) : 0 },
        { name: 'Intangible Assets', value: totalAssets != null && currentAssets != null ? totalAssets - currentAssets - Math.round(totalAssets * 0.55) : 0 }
      ]
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

  const getAltmanZoneClasses = (zone) => {
    const z = String(zone).toLowerCase();
    if (z === 'safe')    return { card: 'bg-emerald-50 border-emerald-200', icon: 'text-emerald-600', badge: 'bg-emerald-100 text-emerald-700 border-emerald-200' };
    if (z === 'distress') return { card: 'bg-rose-50 border-rose-200',       icon: 'text-rose-600',    badge: 'bg-rose-100 text-rose-700 border-rose-200' };
    return { card: 'bg-amber-50 border-amber-200', icon: 'text-amber-600', badge: 'bg-amber-100 text-amber-700 border-amber-200' };
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
    return (
      <div className="min-h-screen bg-slate-50">
        <header className="bg-slate-900 px-8 py-4 flex items-center justify-between sticky top-0 z-10 shadow-md">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="FinSight" className="h-20 w-auto" />
          </div>
          <div className="flex items-center gap-3">
            {portfolio.length > 0 && (
              <button onClick={() => setCurrentPage('portfolio')} className="flex items-center gap-2 px-4 py-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg text-sm font-medium transition-colors">
                <Building2 className="h-4 w-4" />
                Portfolio ({portfolio.length})
              </button>
            )}
            <button onClick={() => { localStorage.removeItem('finsight_auth'); window.location.href = '/'; }} className="flex items-center gap-2 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-sm font-semibold transition-colors">
              Log Out
            </button>
          </div>
        </header>

        <main className="w-full px-8 py-10 max-w-4xl mx-auto space-y-6">
          <div>
            <h1 className="text-2xl font-bold text-slate-900">New Assessment</h1>
            <p className="text-sm text-slate-500 mt-1">Upload an SME financial CSV, use demo data, or enter figures manually to begin.</p>
          </div>

          {/* UC1: CSV upload drop zone */}
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-100">
              <h2 className="text-sm font-bold text-slate-700">Upload Financial Data</h2>
            </div>
            <div className="p-6">
              <label htmlFor="file" className="flex flex-col items-center justify-center border-2 border-dashed border-slate-300 hover:border-indigo-400 rounded-xl p-12 cursor-pointer transition-colors group">
                <div className="p-3 bg-slate-100 group-hover:bg-indigo-50 rounded-xl mb-4 transition-colors">
                  <Upload className="h-8 w-8 text-slate-400 group-hover:text-indigo-500 transition-colors" />
                </div>
                <p className="text-sm font-semibold text-slate-700 mb-1">Click to select a CSV file</p>
                <p className="text-xs text-slate-400">Header row required. Multiple data rows supported.</p>
                <input type="file" accept=".csv" onChange={handleFileChange} className="hidden" id="file" />
              </label>
              <div className="flex items-center gap-4 mt-5">
                <div className="flex-1 h-px bg-slate-200" />
                <span className="text-xs text-slate-400 font-medium">or</span>
                <div className="flex-1 h-px bg-slate-200" />
              </div>
              <button onClick={() => setShowManualEntry(!showManualEntry)} className="w-full mt-4 px-4 py-3 border border-slate-300 hover:border-indigo-400 hover:bg-indigo-50 text-slate-600 hover:text-indigo-700 rounded-lg text-sm font-semibold transition-colors">
                {showManualEntry ? 'Hide Manual Entry' : 'Enter Data Manually'}
              </button>
              <button onClick={() => setShowDemoModal(true)} className="w-full mt-3 px-4 py-3 border border-dashed border-slate-300 hover:border-indigo-400 hover:bg-indigo-50/50 text-slate-600 hover:text-indigo-700 rounded-lg text-sm font-semibold transition-colors">
                Don&apos;t have financial data? Use Demo Data
              </button>
            </div>
          </div>

          {/* UC1 (Demo): SME profile picker modal */}
          {showDemoModal && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-slate-900/60 backdrop-blur-sm" onClick={() => setShowDemoModal(false)}>
              <div className="bg-white rounded-2xl shadow-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto" onClick={(e) => e.stopPropagation()}>
                <div className="px-6 py-5 border-b border-slate-100 flex items-start justify-between sticky top-0 bg-white rounded-t-2xl">
                  <div>
                    <h2 className="text-lg font-bold text-slate-900">Choose a Demo SME Profile</h2>
                    <p className="text-sm text-slate-500 mt-1">12 months of pre-built financials. Select a profile to load instantly — no CSV required.</p>
                  </div>
                  <button onClick={() => setShowDemoModal(false)} className="p-2 text-slate-400 hover:text-slate-700 hover:bg-slate-100 rounded-lg transition-colors" aria-label="Close">
                    <X className="h-5 w-5" />
                  </button>
                </div>
                <div className="p-6 grid grid-cols-1 md:grid-cols-3 gap-4">
                  {demoProfiles.map((profile) => (
                    <button
                      key={profile.key}
                      onClick={() => loadDemoProfile(profile.key)}
                      className={`text-left border-2 rounded-xl p-5 transition-all cursor-pointer ${profile.cardClass}`}
                    >
                      <span className={`inline-block text-xs font-bold px-2.5 py-1 rounded-full mb-3 ${profile.badgeClass}`}>
                        Expected Score: {profile.expectedScore}
                      </span>
                      <h3 className="text-base font-bold text-slate-900 mb-2">{profile.title}</h3>
                      <p className="text-xs text-slate-600 leading-relaxed">{profile.description}</p>
                      <p className="text-xs font-semibold text-indigo-600 mt-4">Click to load →</p>
                    </button>
                  ))}
                </div>
              </div>
            </div>
          )}

          {/* UC1: Manual entry form */}
          {showManualEntry && (
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-slate-100">
                <h2 className="text-sm font-bold text-slate-700">Manual Data Entry</h2>
                <p className="text-xs text-slate-400 mt-0.5">All figures should be annual SAR values.</p>
              </div>
              <div className="p-6">
                <div className="grid grid-cols-2 gap-4 mb-6">
                  <div className="col-span-2">
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Company Name</label>
                    <input type="text" value={manualData.companyName} onChange={(e) => handleManualDataChange('companyName', e.target.value)} className="w-full px-4 py-3 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none placeholder-slate-400" placeholder="e.g. Al Noor Trading Co." />
                  </div>
                  {[
                    { field: 'revenue',            label: 'Annual Revenue',      placeholder: '5,000,000' },
                    { field: 'expenses',           label: 'Annual Expenses',     placeholder: '4,000,000' },
                    { field: 'currentAssets',      label: 'Current Assets',      placeholder: '2,000,000' },
                    { field: 'currentLiabilities', label: 'Current Liabilities', placeholder: '1,000,000' },
                    { field: 'totalAssets',        label: 'Total Assets',        placeholder: '8,000,000' },
                    { field: 'totalDebt',          label: 'Total Debt',          placeholder: '3,000,000' },
                    { field: 'equity',             label: 'Equity',              placeholder: '5,000,000' },
                    { field: 'cashFlow',           label: 'Annual Cash Flow',    placeholder: '800,000'   },
                  ].map(({ field, label, placeholder }) => (
                    <div key={field}>
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">{label}</label>
                      <input type="number" value={manualData[field]} onChange={(e) => handleManualDataChange(field, e.target.value)} className="w-full px-4 py-3 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none placeholder-slate-400" placeholder={placeholder} />
                    </div>
                  ))}
                  <div className="col-span-2 border-t border-slate-200 pt-4 mt-2">
                    <p className="text-xs text-slate-400 mb-3">
                      Optional — enables additional ratio analysis. Leave blank if unavailable.
                    </p>
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Inventory (SAR)</label>
                    <input type="number" value={manualData.inventory ?? ''} onChange={(e) => handleManualDataChange('inventory', e.target.value === '' ? null : parseFloat(e.target.value))} className="w-full px-4 py-3 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none placeholder-slate-400" placeholder="e.g. 150000" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Annual Interest/Profit-Charge Expense (SAR)</label>
                    <input type="number" value={manualData.interestExpense ?? ''} onChange={(e) => handleManualDataChange('interestExpense', e.target.value === '' ? null : parseFloat(e.target.value))} className="w-full px-4 py-3 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none placeholder-slate-400" placeholder="e.g. 50000" />
                  </div>
                  <div>
                    <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">Annual Debt Service (SAR)</label>
                    <input type="number" value={manualData.debtService ?? ''} onChange={(e) => handleManualDataChange('debtService', e.target.value === '' ? null : parseFloat(e.target.value))} className="w-full px-4 py-3 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none placeholder-slate-400" placeholder="Principal + Interest payments per year" />
                  </div>
                </div>
                <div className="flex gap-3">
                  <button onClick={submitManualData} className="flex-1 bg-slate-900 hover:bg-slate-800 text-white py-3 rounded-lg text-sm font-semibold transition-colors">Submit Data</button>
                  <button onClick={() => setShowManualEntry(false)} className="px-6 py-3 border border-slate-300 hover:bg-slate-50 text-slate-600 rounded-lg text-sm font-semibold transition-colors">Cancel</button>
                </div>
              </div>
            </div>
          )}

          {/* UC1: Field mapping — shown after CSV upload, lets user confirm/correct auto-mapped columns */}
          {showFieldMapping && (
            <div className="bg-white border border-indigo-200 rounded-xl shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-indigo-100 bg-indigo-50 flex items-start gap-3">
                <AlertTriangle className="h-5 w-5 text-indigo-500 flex-shrink-0 mt-0.5" />
                <div>
                  <p className="text-sm font-bold text-indigo-900">Map Your Data Fields</p>
                  <p className="text-xs text-indigo-600 mt-0.5">{detectedColumns.length} columns detected. Auto-mapping applied — review and adjust if needed.</p>
                </div>
              </div>
              <div className="p-6">
                <div className="grid grid-cols-2 gap-4 mb-6">
                  {[
                    { field: 'companyName',        label: 'Company Name',        required: false },
                    { field: 'revenue',            label: 'Revenue',             required: true  },
                    { field: 'expenses',           label: 'Expenses',            required: false },
                    { field: 'currentAssets',      label: 'Current Assets',      required: false },
                    { field: 'currentLiabilities', label: 'Current Liabilities', required: false },
                    { field: 'totalAssets',        label: 'Total Assets',        required: false },
                    { field: 'totalDebt',          label: 'Total Debt',          required: false },
                    { field: 'equity',             label: 'Equity',              required: false },
                    { field: 'cashFlow',           label: 'Cash Flow',           required: false },
                    { field: 'inventory',          label: 'Inventory (Optional)',          required: false, optional: true },
                    { field: 'interestExpense',    label: 'Interest Expense (Optional)',   required: false, optional: true },
                    { field: 'debtService',        label: 'Debt Service (Optional)',       required: false, optional: true },
                  ].map(({ field, label, required, optional }) => (
                    <div key={field}>
                      <label className={`block text-xs font-semibold uppercase tracking-wide mb-2 ${optional ? 'text-slate-400' : 'text-slate-500'}`}>{label} {required && <span className="text-rose-500">*</span>}</label>
                      <select value={fieldMappings[field]} onChange={(e) => handleFieldMappingChange(field, e.target.value)} className="w-full px-3 py-2.5 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-900 focus:ring-2 focus:ring-indigo-500 outline-none">
                        <option value="">-- Not Mapped --</option>
                        {detectedColumns.map(col => (<option key={col} value={col}>{col}</option>))}
                      </select>
                      {fieldMappings[field] && (<p className="text-xs text-emerald-600 mt-1">✓ {fieldMappings[field]}</p>)}
                    </div>
                  ))}
                </div>
                <div className="flex items-center justify-between bg-slate-50 border border-slate-200 rounded-lg px-4 py-3 mb-5">
                  <span className="text-xs text-slate-500">
                    <span className="text-emerald-600 font-bold">{Object.values(fieldMappings).filter(v => v).length} mapped</span>
                    {' '}· {Object.values(fieldMappings).filter(v => !v).length} will be estimated
                  </span>
                </div>
                <div className="flex gap-3">
                  <button onClick={processDataWithMappings} className="flex-1 flex items-center justify-center gap-2 bg-indigo-600 hover:bg-indigo-500 text-white py-3 rounded-lg text-sm font-semibold transition-colors">
                    <CheckCircle className="h-4 w-4" />Process & Continue
                  </button>
                  <button onClick={() => setShowFieldMapping(false)} className="px-6 py-3 border border-slate-300 hover:bg-slate-50 text-slate-600 rounded-lg text-sm font-semibold transition-colors">Cancel</button>
                </div>
              </div>
            </div>
          )}

          {/* Data ready — proceed to dashboard */}
          {financialData && !showFieldMapping && (
            <div className="bg-white border border-emerald-200 rounded-xl shadow-sm overflow-hidden">
              <div className="px-6 py-4 bg-emerald-50 border-b border-emerald-100 flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <CheckCircle className="h-5 w-5 text-emerald-600" />
                  <div>
                    <p className="text-sm font-bold text-emerald-900">{financialData.companyName}</p>
                    <p className="text-xs text-emerald-600">{uploadedFile?.name || 'Manual entry'} — data ready</p>
                  </div>
                </div>
                <span className="text-xs font-bold bg-emerald-100 text-emerald-700 px-3 py-1 rounded-full">Ready</span>
              </div>
              <div className="p-5">
                <button onClick={() => setCurrentPage('dashboard')} className="w-full flex items-center justify-center gap-2 bg-slate-900 hover:bg-slate-800 text-white py-3.5 rounded-lg text-sm font-semibold transition-colors">
                  Continue to Dashboard <ArrowRight className="h-4 w-4" />
                </button>
              </div>
            </div>
          )}
        </main>
      </div>
    );
  }

  // UI: Dashboard Page — KPI cards, UC4 forecast, revenue chart, risk radar, debt/equity trend
  if (currentPage === 'dashboard') {
    return (
      <div className="min-h-screen bg-slate-50">
        <header className="bg-slate-900 px-8 py-4 flex items-center justify-between sticky top-0 z-10 shadow-md">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="FinSight" className="h-20 w-auto" />
            <span className="ml-4 text-slate-400 text-sm font-medium border-l border-slate-700 pl-4">{financialData.companyName}</span>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => setCurrentPage('portfolio')} className="flex items-center gap-2 px-4 py-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg text-sm font-medium transition-colors">
              <Building2 className="h-4 w-4" />Portfolio {portfolio.length > 0 && `(${portfolio.length})`}
            </button>
            <div className="w-px h-5 bg-slate-700" />
            <button onClick={() => { setCurrentPage('upload'); setFinancialData(null); setUploadedFile(null); setAssessmentResults(null); setForecastData(null); setIsStressTestActive(false); setActiveForecastMonth(1); }} className="flex items-center gap-2 px-4 py-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg text-sm font-medium transition-colors">
              <ArrowLeft className="h-4 w-4" />New Assessment
            </button>
            <button onClick={() => { localStorage.removeItem('finsight_auth'); window.location.href = '/'; }} className="flex items-center gap-2 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-sm font-semibold transition-colors">
              Log Out
            </button>
          </div>
        </header>

        <main className="w-full px-8 py-6 space-y-6">

          {/* KPI Cards: revenue trend, profit margin, current ratio, debt/equity */}
          <div className="grid grid-cols-2 lg:grid-cols-4 gap-4">
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Revenue</span>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                  financialData.monthlyRevenue.length > 1
                    ? financialData.monthlyRevenue[financialData.monthlyRevenue.length - 1].revenue >= financialData.monthlyRevenue[0].revenue
                      ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'
                    : 'bg-slate-100 text-slate-500'
                }`}>
                  {financialData.monthlyRevenue.length > 1
                    ? `${((financialData.monthlyRevenue[financialData.monthlyRevenue.length - 1].revenue - financialData.monthlyRevenue[0].revenue) / financialData.monthlyRevenue[0].revenue * 100).toFixed(1)}%`
                    : 'N/A'}
                </span>
              </div>
              <p className="text-2xl font-bold text-slate-900">{(financialData.revenue / 1000000).toFixed(2)}M</p>
              <p className="text-xs text-slate-400 mt-1">SAR — Annualised</p>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Net Profit</span>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${financialData.revenue > financialData.expenses ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'}`}>
                  {((financialData.revenue - financialData.expenses) / financialData.revenue * 100).toFixed(1)}%
                </span>
              </div>
              <p className="text-2xl font-bold text-slate-900">{((financialData.revenue - financialData.expenses) / 1000000).toFixed(2)}M</p>
              <p className="text-xs text-slate-400 mt-1">SAR — Annualised</p>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Current Ratio</span>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${financialData.currentAssets / financialData.currentLiabilities >= thresholds.currentRatio.min ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'}`}>
                  {financialData.currentAssets / financialData.currentLiabilities >= thresholds.currentRatio.min ? 'Healthy' : 'Weak'}
                </span>
              </div>
              <p className="text-2xl font-bold text-slate-900">{(financialData.currentAssets / financialData.currentLiabilities).toFixed(2)}x</p>
              <p className="text-xs text-slate-400 mt-1">Threshold: {thresholds.currentRatio.min}x</p>
            </div>

            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5">
              <div className="flex items-center justify-between mb-3">
                <span className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Debt / Equity</span>
                <span className={`text-xs font-bold px-2 py-0.5 rounded-full ${
                  financialData.equity <= 0 ? 'bg-rose-100 text-rose-600'
                  : financialData.totalDebt / financialData.equity <= thresholds.debtToEquity.max ? 'bg-emerald-100 text-emerald-600'
                  : 'bg-rose-100 text-rose-600'
                }`}>
                  {financialData.equity <= 0 ? 'Insolvent' : financialData.totalDebt / financialData.equity <= thresholds.debtToEquity.max ? 'Acceptable' : 'High'}
                </span>
              </div>
              <p className="text-2xl font-bold text-slate-900">{financialData.equity <= 0 ? 'N/A' : (financialData.totalDebt / financialData.equity).toFixed(2)}</p>
              <p className="text-xs text-slate-400 mt-1">Threshold: {thresholds.debtToEquity.max}x</p>
            </div>
          </div>

          {/* Bottom charts: revenue trend (full width), risk radar + debt/equity (side by side) */}
          <div className="flex flex-col gap-5">

            {/* UC3: Monthly revenue area chart — built from actual CSV rows */}
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5">
              <h3 className="text-sm font-bold text-slate-700 mb-1 flex items-center gap-2"><TrendingUp className="h-4 w-4 text-slate-500" />Monthly Revenue Performance</h3>
              <p className="text-xs text-slate-400 mb-4">Actual revenue across all uploaded periods (SAR)</p>
              <div className="h-48">
                <ResponsiveContainer width="100%" height="100%">
                  <AreaChart data={financialData.monthlyRevenue}>
                    <defs>
                      <linearGradient id="revenueGradient" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="5%" stopColor="#6366F1" stopOpacity={0.2}/>
                        <stop offset="95%" stopColor="#6366F1" stopOpacity={0}/>
                      </linearGradient>
                    </defs>
                    <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                    <XAxis dataKey="month" stroke="#94A3B8" style={{ fontSize: '11px' }} />
                    <YAxis stroke="#94A3B8" style={{ fontSize: '11px' }} tickFormatter={(v) => v >= 1000000 ? `${(v/1000000).toFixed(1)}M` : v >= 1000 ? `${(v/1000).toFixed(0)}K` : v} />
                    <Tooltip contentStyle={{ backgroundColor: 'white', border: '1px solid #E2E8F0', borderRadius: '8px', fontSize: '12px' }} />
                    <Area type="monotone" dataKey="revenue" stroke="#6366F1" strokeWidth={2} fill="url(#revenueGradient)" />
                  </AreaChart>
                </ResponsiveContainer>
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-5">

              {/* UC3: Risk Radar — dynamic points from active assessment ratios (0–100 scores) */}
              {(() => {
                const dashAssessment = computeAssessment(financialData);
                const radarData = dashAssessment.activeRatios.map(r => ({
                  metric: r.label,
                  score: dashAssessment.scores[r.key] || 0,
                  fullMark: 100
                }));
                return (
                  <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5">
                    <h3 className="text-sm font-bold text-slate-700 mb-1 flex items-center gap-2"><BarChart3 className="h-4 w-4 text-slate-500" />Risk Radar — Health Footprint</h3>
                    <p className="text-xs text-slate-400 mb-4">Normalised 0–100. Larger area = healthier profile.</p>
                    <div className="h-56">
                      <ResponsiveContainer width="100%" height="100%">
                        <RadarChart data={radarData} margin={{ top: 10, right: 30, bottom: 10, left: 30 }}>
                          <PolarGrid stroke="#E2E8F0" />
                          <PolarAngleAxis dataKey="metric" tick={{ fontSize: 11, fill: '#64748B', fontWeight: 600 }} />
                          <PolarRadiusAxis angle={90} domain={[0, 100]} tick={{ fontSize: 9, fill: '#CBD5E1' }} tickCount={4} />
                          <Radar name="Health" dataKey="score" stroke="#6366F1" fill="#6366F1" fillOpacity={0.2} strokeWidth={2} />
                          <Tooltip formatter={(v) => [`${v.toFixed(0)} / 100`, 'Score']} contentStyle={{ backgroundColor: 'white', border: '1px solid #E2E8F0', borderRadius: '8px', fontSize: '12px' }} />
                        </RadarChart>
                      </ResponsiveContainer>
                    </div>
                  </div>
                );
              })()}

              {/* UC3: Debt vs Equity trend — pulled directly from raw CSV rows per period */}
              {(() => {
                let trendData = [];
                if (rawFileData && rawFileData.allRows && rawFileData.allRows.length > 1) {
                  const debtCol   = fieldMappings.totalDebt;
                  const equityCol = fieldMappings.equity;
                  const monthCol  = rawFileData.columns.find(c =>
                    c.toLowerCase().includes('month') || c.toLowerCase().includes('date') || c.toLowerCase().includes('period')
                  );
                  trendData = rawFileData.allRows.map((row, idx) => ({
                    month:     monthCol && row[monthCol] ? row[monthCol] : `P${idx + 1}`,
                    totalDebt: debtCol   && row[debtCol]   != null ? parseFloat(row[debtCol])   || 0 : financialData.totalDebt,
                    equity:    equityCol && row[equityCol]  != null ? parseFloat(row[equityCol]) || 0 : financialData.equity,
                  }));
                } else {
                  trendData = [{ month: 'Current', totalDebt: financialData.totalDebt, equity: financialData.equity }];
                }
                return (
                  <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5">
                    <h3 className="text-sm font-bold text-slate-700 mb-1 flex items-center gap-2"><TrendingUp className="h-4 w-4 text-slate-500" />Debt vs. Equity Trend</h3>
                    <p className="text-xs text-slate-400 mb-4">Historical leverage movement (SAR)</p>
                    <div className="h-56">
                      <ResponsiveContainer width="100%" height="100%">
                        <LineChart data={trendData} margin={{ top: 5, right: 20, left: 0, bottom: 5 }}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                          <XAxis dataKey="month" stroke="#94A3B8" style={{ fontSize: '11px' }} />
                          <YAxis stroke="#94A3B8" style={{ fontSize: '11px' }} tickFormatter={(v) => v >= 1000000 ? `${(v/1000000).toFixed(1)}M` : v >= 1000 ? `${(v/1000).toFixed(0)}K` : v} />
                          <Tooltip formatter={(value, name) => [`${(value/1000000).toFixed(2)}M SAR`, name === 'totalDebt' ? 'Total Debt' : 'Equity']} contentStyle={{ backgroundColor: 'white', border: '1px solid #E2E8F0', borderRadius: '8px', fontSize: '12px' }} />
                          <Line type="monotone" dataKey="totalDebt" stroke="#F43F5E" strokeWidth={2.5} dot={{ r: 3, fill: '#F43F5E' }} name="totalDebt" />
                          <Line type="monotone" dataKey="equity"    stroke="#10B981" strokeWidth={2.5} dot={{ r: 3, fill: '#10B981' }} name="equity" />
                        </LineChart>
                      </ResponsiveContainer>
                    </div>
                    <div className="flex items-center gap-6 mt-3 justify-center">
                      <div className="flex items-center gap-2 text-xs text-slate-500"><div className="w-4 h-0.5 bg-rose-500 rounded" />Total Debt</div>
                      <div className="flex items-center gap-2 text-xs text-slate-500"><div className="w-4 h-0.5 bg-emerald-500 rounded" />Equity</div>
                    </div>
                  </div>
                );
              })()}

            </div>
          </div>

          {/* UC5: Industry selector + Run Assessment — industry choice drives all benchmark comparisons */}
          <div className="bg-white border border-slate-200 rounded-xl shadow-sm px-6 py-4 space-y-4">
            <div className="flex items-center gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">SME Industry</label>
                <select value={selectedIndustry} onChange={(e) => setSelectedIndustry(e.target.value)} className="px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-800 font-medium focus:ring-2 focus:ring-indigo-500 outline-none">
                  <option value="" disabled>Select an industry</option>
                  {['SaaS', 'Retail', 'Construction', 'Logistics', 'Manufacturing', 'Tourism', 'Healthcare'].map(industry => (<option key={industry} value={industry}>{industry}</option>))}
                </select>
              </div>
              {selectedIndustry && (
                <div className="text-xs text-slate-500 space-y-0.5 border-l border-slate-200 pl-4">
                  <p>Min EBITDA Margin: <span className="font-bold text-slate-700">{industryStandards[selectedIndustry].minEBITDAMargin}%</span></p>
                  <p>Min DSCR: <span className="font-bold text-slate-700">{industryStandards[selectedIndustry].minDSCR}x</span></p>
                  <p>Min Current Ratio: <span className="font-bold text-slate-700">{industryStandards[selectedIndustry].minCurrentRatio}x</span></p>
                  <p>Max D/E: <span className="font-bold text-slate-700">{industryStandards[selectedIndustry].maxDebtEquity}x</span></p>
                  <p>Min ROA: <span className="font-bold text-slate-700">{industryStandards[selectedIndustry].minROA}%</span></p>
                  <p>Min Quick Ratio: <span className="font-bold text-slate-700">{industryStandards[selectedIndustry].minQuickRatio}x</span></p>
                  <p>Min ICR: <span className="font-bold text-slate-700">{industryStandards[selectedIndustry].minICR}x</span></p>
                </div>
              )}
            </div>
            <button onClick={calculateAssessment} disabled={!selectedIndustry} className="w-full flex items-center justify-center gap-2 px-8 py-3.5 bg-slate-900 hover:bg-slate-800 disabled:opacity-40 disabled:cursor-not-allowed text-white rounded-xl font-semibold text-sm shadow-md transition-colors">
              <Calculator className="h-5 w-5" />Run Funding Assessment
            </button>
          </div>

        </main>
      </div>
    );
  }

  // UI: Assessment Results Page — decision card, ratio breakdown, strengths/weaknesses, scenario sandbox
  if (currentPage === 'assessment' && assessmentResults) {
    return (
      <div className="min-h-screen bg-slate-50">
        <header className="bg-slate-900 px-8 py-4 flex items-center justify-between sticky top-0 z-10 shadow-md">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="FinSight" className="h-20 w-auto" />
            <span className="ml-4 text-slate-400 text-sm font-medium border-l border-slate-700 pl-4">Assessment Report — {financialData.companyName}</span>
          </div>
          <div className="flex items-center gap-3">
            <button onClick={() => setCurrentPage('dashboard')} className="flex items-center gap-2 px-4 py-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg text-sm font-medium transition-colors">
              <ArrowLeft className="h-4 w-4" />Dashboard
            </button>
            <button onClick={() => setCurrentPage('portfolio')} className="flex items-center gap-2 px-4 py-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg text-sm font-medium transition-colors">
              <Building2 className="h-4 w-4" />Portfolio
            </button>
            {/* UC6 (Scenario): toggles What-If sandbox — deep copies financialData into scenarioData */}
            <button
              onClick={() => {
                if (isScenarioMode) { setIsScenarioMode(false); setScenarioData(null); setScenarioMlData(null); }
                else {
                  const copy = JSON.parse(JSON.stringify(financialData));
                  setIsScenarioMode(true);
                  setScenarioData(copy);
                  fetchScenarioMl(copy);
                }
              }}
              className={`flex items-center gap-2 px-4 py-2 rounded-lg text-sm font-semibold transition-colors ${isScenarioMode ? 'bg-amber-500 hover:bg-amber-400 text-white' : 'bg-slate-700 hover:bg-slate-600 text-white'}`}
            >
              <Zap className="h-4 w-4" />{isScenarioMode ? 'Exit Simulation' : 'Scenario Analysis Mode'}
            </button>
            <button onClick={() => setShowSettings(!showSettings)} className="flex items-center gap-2 px-4 py-2 bg-indigo-600 hover:bg-indigo-500 text-white rounded-lg text-sm font-semibold transition-colors">
              <Settings className="h-4 w-4" />{showSettings ? 'Hide Config' : 'Configure'}
            </button>
            <button onClick={() => { localStorage.removeItem('finsight_auth'); window.location.href = '/'; }} className="flex items-center gap-2 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-sm font-semibold transition-colors">
              Log Out
            </button>
          </div>
        </header>

        <main className="w-full px-8 py-6 space-y-6">

          {portfolioViewMeta && (
            <div className="bg-indigo-50 border border-indigo-200 rounded-xl px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <FileText className="h-5 w-5 text-indigo-600 flex-shrink-0" />
                <div>
                  <p className="text-sm font-bold text-indigo-900">Saved assessment — {portfolioViewMeta.companyName}</p>
                  <p className="text-xs text-indigo-600">Assessed on {portfolioViewMeta.assessedAt}. This is a historical snapshot, not a live re-run.</p>
                </div>
              </div>
              <button onClick={() => setPortfolioViewMeta(null)} className="text-xs font-semibold text-indigo-700 hover:text-indigo-900 px-3 py-1.5 hover:bg-indigo-100 rounded-lg transition-colors">
                Dismiss
              </button>
            </div>
          )}

          {/* UC5 (Configure): weight adjustment panel — only affects scoring weights, not industry benchmarks */}
          {showSettings && (
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-base font-bold text-slate-900">Assessment Criteria Configuration</h2>
                <button onClick={resetThresholds} className="text-xs text-slate-500 hover:text-slate-800 font-semibold px-3 py-1.5 hover:bg-slate-100 rounded-lg transition-colors">Reset to Defaults</button>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-4 gap-4 mb-6">
                {[
                  { key: 'currentRatio', field: 'min',  step: '0.1'  },
                  { key: 'debtToEquity', field: 'max',  step: '0.1'  },
                  { key: 'ebitdaMargin', field: 'min',  step: '0.5'  },
                  { key: 'roa',          field: 'min',  step: '0.5'  },
                  { key: 'dscr',         field: 'min',  step: '0.05' },
                  { key: 'quickRatio',   field: 'min',  step: '0.1'  },
                  { key: 'icr',          field: 'min',  step: '0.1'  },
                ].map(({ key, field, step }) => (
                  <div key={key} className="bg-slate-50 border border-slate-200 rounded-lg p-4">
                    <p className="text-xs font-bold text-slate-700 mb-3">{thresholds[key].label}</p>
                    <input type="number" step={step} value={thresholds[key][field]} onChange={(e) => handleThresholdChange(key, field, e.target.value)} className="w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:ring-2 focus:ring-indigo-500 mb-3" />
                    <div className="flex items-center justify-between text-xs text-slate-500 mb-1">
                      <span>Weight</span><span className="font-bold text-slate-700">{thresholds[key].weight}%</span>
                    </div>
                    <input type="range" min="0" max="100" value={thresholds[key].weight} onChange={(e) => handleThresholdChange(key, 'weight', e.target.value)} className="w-full accent-indigo-600" />
                  </div>
                ))}
              </div>
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <span className="text-sm text-slate-600 font-medium">Total Weight:</span>
                  <span className={`text-lg font-bold ${getTotalWeight() === 100 ? 'text-emerald-600' : 'text-rose-600'}`}>{getTotalWeight()}%</span>
                  {getTotalWeight() !== 100 && <span className="text-xs text-rose-500">Must equal 100%</span>}
                </div>
                <button onClick={() => { setShowSettings(false); calculateAssessment(); }} className="flex items-center gap-2 px-6 py-2.5 bg-slate-900 hover:bg-slate-800 text-white rounded-lg text-sm font-semibold transition-colors">
                  <Save className="h-4 w-4" />Save & Recalculate
                </button>
              </div>
            </div>
          )}

          {/* UC6 (Scenario): warning banner — shown when sandbox is active */}
          {isScenarioMode && (
            <div className="bg-amber-50 border border-amber-300 rounded-xl px-5 py-4 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <Zap className="h-5 w-5 text-amber-600 flex-shrink-0" />
                <div>
                  <p className="text-sm font-bold text-amber-800">Scenario Analysis Mode Active</p>
                  <p className="text-xs text-amber-600">You are viewing hypothetical numbers. The original uploaded data is unchanged.</p>
                </div>
              </div>
              <button
                onClick={() => setScenarioData(JSON.parse(JSON.stringify(financialData)))}
                className="flex items-center gap-2 px-4 py-2 bg-amber-100 hover:bg-amber-200 text-amber-800 rounded-lg text-xs font-bold transition-colors"
              >
                Reset to Original
              </button>
            </div>
          )}

          {/* UC6 (Scenario): slider controls — each slider updates scenarioData only, never financialData */}
          {isScenarioMode && scenarioData && (
            <div className="bg-white border border-amber-200 rounded-xl shadow-sm overflow-hidden">
              <div className="px-6 py-4 border-b border-amber-100 bg-amber-50">
                <h2 className="text-sm font-bold text-amber-900">Scenario Controls</h2>
                <p className="text-xs text-amber-600 mt-0.5">Drag the sliders to simulate changes. Results update instantly.</p>
              </div>
              <div className="p-6 grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
                {[
                  { key: 'revenue',            label: 'Annual Revenue',      min: 0, max: financialData.revenue * 3 },
                  { key: 'expenses',           label: 'Annual Expenses',     min: 0, max: financialData.revenue * 3 },
                  { key: 'totalDebt',          label: 'Total Debt',          min: 0, max: financialData.totalDebt * 4 || financialData.totalAssets },
                  { key: 'currentAssets',      label: 'Current Assets',      min: 0, max: financialData.currentAssets * 4 || financialData.totalAssets },
                  { key: 'currentLiabilities', label: 'Current Liabilities', min: 0, max: financialData.currentLiabilities * 4 || financialData.totalAssets },
                  { key: 'equity',             label: 'Equity',              min: financialData.totalAssets * -0.5, max: financialData.totalAssets * 2 },
                  ...(financialData.inventory != null
                    ? [{ key: 'inventory', label: 'Inventory', min: 0, max: (financialData.inventory || 0) * 4 || financialData.currentAssets }]
                    : []),
                  ...(financialData.interestExpense != null
                    ? [{ key: 'interestExpense', label: 'Interest Expense', min: 0, max: (financialData.interestExpense || 0) * 4 || financialData.revenue * 0.2 }]
                    : []),
                  ...(financialData.debtService != null
                    ? [{ key: 'debtService', label: 'Annual Debt Service', min: 0, max: (financialData.debtService || 0) * 4 || financialData.totalDebt }]
                    : []),
                ].map(({ key, label, min, max }) => (
                  <div key={key}>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">{label}</label>
                      <span className="text-xs font-bold text-slate-800">
                        {scenarioData[key] >= 1000000 ? `${(scenarioData[key] / 1000000).toFixed(2)}M` : `${(scenarioData[key] / 1000).toFixed(0)}K`} SAR
                      </span>
                    </div>
                    <input type="range" min={min} max={max} step={(max - min) / 200} value={scenarioData[key] ?? 0}
                      onChange={(e) => {
                        const updated = { ...scenarioData, [key]: parseFloat(e.target.value) };
                        updated.cashFlow = updated.revenue - updated.expenses; // cash flow mirrors revenue - expenses
                        setScenarioData(updated);
                      }}
                      className="w-full accent-amber-500"
                    />
                    <input type="number" value={Math.round(scenarioData[key] ?? 0)}
                      onChange={(e) => {
                        const updated = { ...scenarioData, [key]: parseFloat(e.target.value) || 0 };
                        updated.cashFlow = updated.revenue - updated.expenses;
                        setScenarioData(updated);
                      }}
                      className="mt-2 w-full px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 focus:ring-2 focus:ring-amber-400 outline-none"
                    />
                  </div>
                ))}
              </div>
            </div>
          )}

          {/* UC6: Results display — switches between real assessmentResults and live computeAssessment(scenarioData) */}
          {(() => {
            const activeResults = isScenarioMode && scenarioData ? computeAssessment(scenarioData) : assessmentResults;
            return (
              <>
                {/* Knockout disqualifiers banner */}
                {activeResults.knockouts && activeResults.knockouts.length > 0 && (
                  <div className="bg-rose-50 border border-rose-200 rounded-xl p-5">
                    <div className="flex items-center gap-2 mb-3">
                      <XCircle className="h-5 w-5 text-rose-600" />
                      <h3 className="text-sm font-bold text-rose-800">Automatic Disqualifiers Triggered</h3>
                    </div>
                    <ul className="space-y-2">
                      {activeResults.knockouts.map((k, idx) => (
                        <li key={idx} className="flex items-start gap-2 text-sm text-rose-700">
                          <XCircle className="h-4 w-4 text-rose-400 flex-shrink-0 mt-0.5" />{k}
                        </li>
                      ))}
                    </ul>
                  </div>
                )}

                {/* Decision card + ratio breakdown */}
                <div className="grid grid-cols-1 lg:grid-cols-4 gap-5">
                  <div className={`rounded-xl shadow-sm p-6 border flex flex-col justify-between ${
                    activeResults.decision === 'APPROVED' ? 'bg-emerald-50 border-emerald-200'
                    : activeResults.decision === 'REVIEW'  ? 'bg-amber-50 border-amber-200'
                    : 'bg-rose-50 border-rose-200'
                  }`}>
                    <div>
                      <div className="flex items-center justify-between mb-4">
                        <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">{isScenarioMode ? 'Scenario Decision' : 'Funding Decision'}</span>
                        {activeResults.decision === 'APPROVED' && <CheckCircle className="h-6 w-6 text-emerald-600" />}
                        {activeResults.decision === 'REVIEW'   && <AlertTriangle className="h-6 w-6 text-amber-600" />}
                        {activeResults.decision === 'REJECTED' && <XCircle className="h-6 w-6 text-rose-600" />}
                      </div>
                      <p className="text-5xl font-bold text-slate-900 mb-2">{activeResults.overallScore}%</p>
                      <p className="text-xs text-slate-500 mb-3">Weighted composite score</p>
                    </div>
                    <span className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold self-start ${
                      activeResults.decision === 'APPROVED' ? 'bg-emerald-100 text-emerald-700'
                      : activeResults.decision === 'REVIEW' ? 'bg-amber-100 text-amber-700'
                      : 'bg-rose-100 text-rose-700'
                    }`}>
                      {activeResults.decision === 'APPROVED' && <CheckCircle className="h-4 w-4" />}
                      {activeResults.decision === 'REVIEW'   && <AlertTriangle className="h-4 w-4" />}
                      {activeResults.decision === 'REJECTED' && <XCircle className="h-4 w-4" />}
                      {activeResults.decision}
                    </span>
                  </div>

                  {(() => {
                    const altman = activeResults.altmanZScore || null;
                    const zone = altman?.zone || 'Pending';
                    const classes = getAltmanZoneClasses(zone);
                    return (
                      <div className={`rounded-xl shadow-sm p-6 border flex flex-col justify-between ${classes.card}`}>
                        <div>
                          <div className="flex items-center justify-between mb-4">
                            <span className="text-xs font-bold text-slate-500 uppercase tracking-wide">Altman Z''-Score</span>
                            <BarChart3 className={`h-6 w-6 ${classes.icon}`} />
                          </div>
                          <p className="text-5xl font-bold text-slate-900 mb-2">
                            {altman?.score !== null && altman?.score !== undefined ? Number(altman.score).toFixed(2) : '—'}
                          </p>
                          <p className="text-xs text-slate-500 mb-3">Master bankruptcy-risk health metric</p>
                          {activeResults.probabilityOfDefault != null && (
                            <div className={`flex items-center justify-between px-3 py-2 rounded-lg mb-1 ${
                              activeResults.probabilityOfDefault < 0.20 ? 'bg-emerald-100'
                              : activeResults.probabilityOfDefault < 0.60 ? 'bg-amber-100'
                              : 'bg-rose-100'
                            }`}>
                              <span className="text-xs font-semibold text-slate-600">Prob. of Default</span>
                              <span className={`text-sm font-bold tabular-nums ${
                                activeResults.probabilityOfDefault < 0.20 ? 'text-emerald-700'
                                : activeResults.probabilityOfDefault < 0.60 ? 'text-amber-700'
                                : 'text-rose-700'
                              }`}>{(activeResults.probabilityOfDefault * 100).toFixed(2)}%</span>
                            </div>
                          )}
                        </div>
                        <span className={`inline-flex items-center gap-1.5 px-4 py-2 rounded-lg text-sm font-bold self-start border ${classes.badge}`}>
                          {String(zone).toLowerCase() === 'safe' && <CheckCircle className="h-4 w-4" />}
                          {(String(zone).toLowerCase() === 'grey' || String(zone).toLowerCase() === 'gray' || zone === 'Pending') && <AlertTriangle className="h-4 w-4" />}
                          {String(zone).toLowerCase() === 'distress' && <XCircle className="h-4 w-4" />}
                          {zone} Zone
                        </span>
                      </div>
                    );
                  })()}

                  <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl shadow-sm p-6">
                    <h3 className="text-sm font-bold text-slate-700 mb-4">Financial Ratios Breakdown</h3>
                    <div className="space-y-3">
                      {/* Each row shows the ratio value, its 0-100 score, weight, and industry benchmark — dynamic active ratios */}
                      {activeResults.activeRatios.map((r) => {
                        const score = activeResults.scores[r.key];
                        const value = formatRatioDisplay(r.key, activeResults.ratios[r.key]);
                        const weight = thresholds[r.key]?.weight ?? r.weight;
                        const benchmark = getRatioBenchmark(r.key);
                        return (
                          <div key={r.key} className={`flex items-center justify-between px-4 py-3 rounded-lg border ${score >= 80 ? 'bg-emerald-50 border-emerald-100' : score >= 60 ? 'bg-amber-50 border-amber-100' : 'bg-rose-50 border-rose-100'}`}>
                            <div className="flex items-center gap-3">
                              <div className={`w-1.5 h-8 rounded-full ${score >= 80 ? 'bg-emerald-500' : score >= 60 ? 'bg-amber-500' : 'bg-rose-500'}`} />
                              <div>
                                <p className="text-sm font-semibold text-slate-800">{r.label}</p>
                                <p className="text-xs text-slate-400">Weight: {weight}% · {benchmark} <span className="text-indigo-500 font-semibold">({selectedIndustry})</span></p>
                              </div>
                            </div>
                            <div className="text-right">
                              <p className="text-base font-bold text-slate-900">{value}</p>
                              <p className={`text-xs font-bold ${score >= 80 ? 'text-emerald-600' : score >= 60 ? 'text-amber-600' : 'text-rose-600'}`}>{score} / 100</p>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    {activeResults.droppedRatios && activeResults.droppedRatios.length > 0 && (
                      <div className="mt-4 bg-amber-50 border border-amber-200 rounded-xl p-4">
                        <div className="flex items-center gap-2 mb-2">
                          <AlertTriangle className="w-4 h-4 text-amber-500" />
                          <h4 className="text-sm font-semibold text-amber-700">Ratios excluded from this assessment</h4>
                        </div>
                        <ul className="text-xs text-amber-600 space-y-1">
                          {activeResults.droppedRatios.map((msg, i) => (
                            <li key={i}>• {msg}</li>
                          ))}
                        </ul>
                        <p className="text-xs text-amber-500 mt-2">
                          Weights were redistributed across {activeResults.activeRatios.length} available ratios.
                        </p>
                      </div>
                    )}
                  </div>
                </div>

                {/* Risk Gauge — Probability of Default */}
                {activeResults.probabilityOfDefault != null && (
                  <div className="bg-white p-6 rounded-xl border border-slate-200 shadow-sm">
                    <div className="flex justify-between items-center mb-2">
                      <h3 className="text-sm font-bold text-slate-500 uppercase">Prob. of Default</h3>
                      <span className="font-mono text-lg font-bold">{(activeResults.probabilityOfDefault * 100).toFixed(2)}%</span>
                    </div>
                    <div className="w-full bg-slate-100 rounded-full h-3 overflow-hidden">
                      <div
                        className={`h-full transition-all duration-500 ${activeResults.probabilityOfDefault < 0.2 ? 'bg-emerald-500' : activeResults.probabilityOfDefault < 0.6 ? 'bg-amber-500' : 'bg-red-500'}`}
                        style={{ width: `${activeResults.probabilityOfDefault * 100}%` }}
                      />
                    </div>
                  </div>
                )}

                {/* Strengths, weaknesses, recommendations */}
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
                  <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5">
                    <h3 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2"><CheckCircle className="h-4 w-4 text-emerald-500" />Strengths</h3>
                    {activeResults.strengths.length > 0 ? (
                      <ul className="space-y-2">
                        {activeResults.strengths.map((s, idx) => (
                          <li key={idx} className="flex items-start gap-2 text-sm text-slate-600"><CheckCircle className="h-4 w-4 text-emerald-500 flex-shrink-0 mt-0.5" />{s}</li>
                        ))}
                      </ul>
                    ) : <p className="text-sm text-slate-400 italic">No strengths identified.</p>}
                  </div>

                  <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-5">
                    <h3 className="text-sm font-bold text-slate-700 mb-4 flex items-center gap-2"><AlertTriangle className="h-4 w-4 text-rose-500" />Weaknesses</h3>
                    {activeResults.weaknesses.length > 0 ? (
                      <ul className="space-y-2">
                        {activeResults.weaknesses.map((w, idx) => (
                          <li key={idx} className="flex items-start gap-2 text-sm text-slate-600"><XCircle className="h-4 w-4 text-rose-400 flex-shrink-0 mt-0.5" />{w}</li>
                        ))}
                      </ul>
                    ) : <p className="text-sm text-slate-400 italic">No critical weaknesses identified.</p>}
                  </div>

                  <div className="bg-slate-900 border border-slate-700 rounded-xl shadow-sm p-5">
                    <h3 className="text-sm font-bold text-white mb-4 flex items-center gap-2"><Save className="h-4 w-4 text-indigo-400" />Recommendations</h3>
                    <ul className="space-y-2">
                      {activeResults.decision === 'APPROVED' && (<>
                        <li className="text-sm text-slate-300 flex items-start gap-2"><span className="text-emerald-400 mt-0.5">→</span>Approve funding request</li>
                        <li className="text-sm text-slate-300 flex items-start gap-2"><span className="text-emerald-400 mt-0.5">→</span>Standard loan terms applicable</li>
                        <li className="text-sm text-slate-300 flex items-start gap-2"><span className="text-emerald-400 mt-0.5">→</span>Monitor quarterly performance</li>
                      </>)}
                      {activeResults.decision === 'REVIEW' && (<>
                        <li className="text-sm text-slate-300 flex items-start gap-2"><span className="text-amber-400 mt-0.5">→</span>Request additional documentation</li>
                        <li className="text-sm text-slate-300 flex items-start gap-2"><span className="text-amber-400 mt-0.5">→</span>Consider conditional approval</li>
                        <li className="text-sm text-slate-300 flex items-start gap-2"><span className="text-amber-400 mt-0.5">→</span>Reassess after 90 days</li>
                      </>)}
                      {activeResults.decision === 'REJECTED' && (<>
                        <li className="text-sm text-slate-300 flex items-start gap-2"><span className="text-rose-400 mt-0.5">→</span>Decline funding request</li>
                        <li className="text-sm text-slate-300 flex items-start gap-2"><span className="text-rose-400 mt-0.5">→</span>Advise SME to improve liquidity</li>
                        <li className="text-sm text-slate-300 flex items-start gap-2"><span className="text-rose-400 mt-0.5">→</span>Invite reapplication after restructuring</li>
                      </>)}
                    </ul>
                  </div>
                </div>
              </>
            );
          })()}

          {/* AIStressTestModule — State 1: inactive trigger, State 2: interactive workspace */}
          <div className="bg-slate-800 border border-slate-700 rounded-xl overflow-hidden">
            {!isStressTestActive ? (
              <div className="p-8">
                <div className="flex items-start gap-4 mb-6">
                  <div className="p-3 bg-indigo-600 rounded-xl flex-shrink-0">
                    <Brain className="h-6 w-6 text-white" />
                  </div>
                  <div>
                    <h2 className="text-lg font-bold text-white mb-1">Predictive Risk & Covenant Stress Test</h2>
                    <p className="text-sm text-slate-400">Simulate future cash flow momentum to project covenant breaches and liquidity risk.</p>
                  </div>
                </div>
                {isForecasting ? (
                  <div className="flex items-center gap-3 text-slate-300 text-sm">
                    <div className="animate-spin rounded-full h-5 w-5 border-b-2 border-indigo-400" />
                    Running LightGBM inference...
                  </div>
                ) : (
                  <button
                    onClick={runStressTest}
                    className="flex items-center gap-2 px-6 py-3 bg-indigo-600 hover:bg-indigo-500 text-white rounded-xl text-sm font-semibold transition-colors"
                  >
                    <Zap className="h-4 w-4" />
                    Run 6-Month AI Liquidity Forecast
                  </button>
                )}
              </div>
            ) : forecastData ? (
              <div>
                {/* Module header */}
                <div className="px-6 py-4 border-b border-slate-700 flex items-center justify-between">
                  <div className="flex items-center gap-3">
                    <div className="p-2 bg-indigo-600 rounded-lg">
                      <Brain className="h-4 w-4 text-white" />
                    </div>
                    <div>
                      <h2 className="text-sm font-bold text-white">Predictive Risk & Covenant Stress Test</h2>
                      <p className="text-xs text-slate-400">Double Exponential Smoothing (DES) 6-month projection — move slider to project covenant impact</p>
                    </div>
                  </div>
                  <div className="flex items-center gap-3">
                    <span className={`text-xs font-bold px-2.5 py-1 rounded-full ${
                      forecastData.summary.trend === 'Growing' ? 'bg-emerald-900 text-emerald-300'
                      : forecastData.summary.trend === 'Declining' ? 'bg-rose-900 text-rose-300'
                      : 'bg-slate-700 text-slate-300'
                    }`}>{forecastData.summary.trend}</span>
                    <span className="text-xs text-slate-400">Confidence: <span className="font-bold text-slate-300">{forecastData.summary.confidence}%</span></span>
                    <button
                      onClick={() => { setIsStressTestActive(false); setForecastData(null); }}
                      className="text-xs text-slate-400 hover:text-white px-2.5 py-1 hover:bg-slate-700 rounded-lg transition-colors"
                    >
                      Reset
                    </button>
                  </div>
                </div>

                {/* Row 1: Timeline slider + Chart */}
                <div className="p-6 space-y-4">
                  <div className="flex items-center gap-4 bg-slate-900 rounded-xl px-5 py-3">
                    <span className="text-xs font-bold text-slate-400 uppercase tracking-widest whitespace-nowrap">Forecast Month</span>
                    <div className="flex-1 flex items-center gap-3">
                      <span className="text-xs text-slate-500">M1</span>
                      <input
                        type="range" min={1} max={6} step={1}
                        value={activeForecastMonth}
                        onChange={(e) => setActiveForecastMonth(parseInt(e.target.value))}
                        className="flex-1 accent-indigo-500"
                      />
                      <span className="text-xs text-slate-500">M6</span>
                    </div>
                    <span className="text-sm font-bold text-indigo-300 whitespace-nowrap bg-indigo-900 px-3 py-1 rounded-lg">Month {activeForecastMonth}</span>
                  </div>

                  <div className="h-64 bg-slate-900 rounded-xl p-4">
                    <ResponsiveContainer width="100%" height="100%">
                      <ComposedChart data={forecastData.combined}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#1E293B" />
                        <XAxis dataKey="month" stroke="#475569" style={{ fontSize: '10px' }} tick={{ fill: '#64748B' }} />
                        <YAxis stroke="#475569" style={{ fontSize: '10px' }} tick={{ fill: '#64748B' }} tickFormatter={(v) => v >= 1000000 ? `${(v/1000000).toFixed(1)}M` : v >= 1000 ? `${(v/1000).toFixed(0)}K` : v} />
                        <Tooltip
                          contentStyle={{ backgroundColor: '#0F172A', border: '1px solid #334155', borderRadius: '8px', fontSize: '12px', color: '#E2E8F0' }}
                          formatter={(value, name) => [
                            value >= 1000000 ? `${(value/1000000).toFixed(2)}M SAR` : `${(value/1000).toFixed(0)}K SAR`,
                            name === 'actualCashFlow' ? 'Cash Flow' : name === 'forecastedCashFlow' ? 'Forecast' : name
                          ]}
                        />
                        <Area dataKey="upperBound" fill="#6366F1" stroke="none" fillOpacity={0.15} />
                        <Area dataKey="lowerBound" fill="#6366F1" stroke="none" fillOpacity={0.15} />
                        <Line dataKey="actualCashFlow" stroke="#94A3B8" strokeWidth={2} dot={{ r: 2, fill: '#94A3B8' }} name="actualCashFlow" />
                        <Line dataKey="forecastedCashFlow" stroke="#818CF8" strokeWidth={2.5} strokeDasharray="5 5" dot={{ r: 2, fill: '#818CF8' }} name="forecastedCashFlow" />
                        {forecastData.combined.findIndex(d => d.forecastedCashFlow !== undefined) > 0 && (
                          <ReferenceLine
                            x={forecastData.combined[forecastData.combined.findIndex(d => d.forecastedCashFlow !== undefined)].month}
                            stroke="#475569" strokeDasharray="4 4"
                            label={{ value: 'Forecast Start', position: 'insideTopRight', fontSize: 9, fill: '#475569' }}
                          />
                        )}
                        <ReferenceLine
                          x={forecastData.forecast[activeForecastMonth - 1].month}
                          stroke="#6366F1" strokeWidth={2}
                          label={{ value: `M${activeForecastMonth}`, position: 'insideTopLeft', fontSize: 10, fill: '#818CF8' }}
                        />
                      </ComposedChart>
                    </ResponsiveContainer>
                  </div>

                  <div className="flex items-center gap-6 justify-center">
                    <div className="flex items-center gap-2 text-xs text-slate-500"><div className="w-5 h-0.5 bg-slate-400 rounded" />Historical CF</div>
                    <div className="flex items-center gap-2 text-xs text-slate-500"><div className="w-5 h-0.5 bg-indigo-400 rounded" style={{ backgroundImage: 'repeating-linear-gradient(90deg, #818CF8 0px, #818CF8 4px, transparent 4px, transparent 8px)' }} />Forecast</div>
                    <div className="flex items-center gap-2 text-xs text-slate-500"><div className="w-5 h-3 bg-indigo-500 rounded opacity-20" />Confidence Band</div>
                    <div className="flex items-center gap-2 text-xs text-slate-500"><div className="w-0.5 h-4 bg-indigo-500 rounded" />Selected Month</div>
                  </div>
                </div>

                {/* Row 2: Dynamic covenant cards + static baseline */}
                {(() => {
                  const forecastMonth = forecastData.forecast[activeForecastMonth - 1];
                  const baselineMonthlyCF = (financialData.cashFlow || 0) / 12;
                  const projectedMonthlyCF = forecastMonth?.forecastedCashFlow ?? baselineMonthlyCF;
                  const projectedAnnualCF = projectedMonthlyCF * 12;
                  const cumulativeCFDelta = (projectedMonthlyCF - baselineMonthlyCF) * activeForecastMonth;
                  const projectedCurrentAssets = Math.max(0, financialData.currentAssets + cumulativeCFDelta);

                  const projectedDSCR = financialData.debtService != null && financialData.debtService > 0
                    ? projectedAnnualCF / financialData.debtService
                    : null;
                  const projectedCurrentRatio = financialData.currentLiabilities > 0
                    ? projectedCurrentAssets / financialData.currentLiabilities
                    : null;
                  const projectedQuickRatio = financialData.currentLiabilities > 0 && financialData.inventory != null
                    ? Math.max(0, projectedCurrentAssets - financialData.inventory) / financialData.currentLiabilities
                    : null;

                  const standards = industryStandards[selectedIndustry] || industryStandards.Default;
                  const dscrBreach = projectedDSCR !== null && projectedDSCR < 1.0;
                  const currentRatioBreach = projectedCurrentRatio !== null && projectedCurrentRatio < standards.minCurrentRatio;
                  const quickRatioBreach = projectedQuickRatio !== null && projectedQuickRatio < standards.minQuickRatio;

                  const projectedFinData = {
                    ...financialData,
                    revenue: financialData.expenses + projectedAnnualCF,
                    cashFlow: projectedAnnualCF,
                    currentAssets: projectedCurrentAssets,
                  };
                  const projectedAssessment = computeAssessment(projectedFinData);
                  const baseline = assessmentResults.ratios;

                  const podValue = forecastMonth?.probabilityOfDefault ?? projectedAssessment.probabilityOfDefault;

                  return (
                    <div className="px-6 pb-6 space-y-4">
                      <div className="flex items-center gap-3">
                        <span className="text-xs font-bold text-indigo-400 uppercase tracking-widest">Month {activeForecastMonth} — Projected Covenant Impact</span>
                        <div className="h-px flex-1 bg-slate-700" />
                      </div>

                      {/* PoD Risk Gauge — uses API value when available, falls back to local projection */}
                      {podValue != null && (
                        <div className="bg-slate-900 border border-slate-700 rounded-xl px-5 py-4">
                          <div className="flex justify-between items-center mb-2">
                            <p className="text-xs font-semibold text-slate-400 uppercase tracking-widest">Prob. of Default — Month {activeForecastMonth}</p>
                            <span className={`font-mono text-base font-bold ${podValue < 0.2 ? 'text-emerald-400' : podValue < 0.6 ? 'text-amber-400' : 'text-rose-400'}`}>
                              {(podValue * 100).toFixed(2)}%
                            </span>
                          </div>
                          <div className="w-full bg-slate-700 rounded-full h-2.5 overflow-hidden">
                            <div
                              className={`h-full transition-all duration-500 ${podValue < 0.2 ? 'bg-emerald-500' : podValue < 0.6 ? 'bg-amber-500' : 'bg-rose-500'}`}
                              style={{ width: `${podValue * 100}%` }}
                            />
                          </div>
                        </div>
                      )}

                      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
                        {/* Left: dynamic covenants updated by slider */}
                        <div className="space-y-3">
                          <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Dynamic Covenants</p>
                          <div className="grid grid-cols-2 gap-3">
                            {/* Projected Score card — full width */}
                            <div className="col-span-2 bg-slate-900 border border-slate-700 rounded-xl p-4 flex items-center gap-4">
                              <div>
                                <p className="text-xs text-slate-400 mb-1">Projected Funding Score</p>
                                <p className={`text-3xl font-bold ${parseFloat(projectedAssessment.overallScore) >= 70 ? 'text-emerald-400' : parseFloat(projectedAssessment.overallScore) >= 50 ? 'text-amber-400' : 'text-rose-400'}`}>
                                  {projectedAssessment.overallScore}%
                                </p>
                              </div>
                              <span className={`text-xs font-bold px-3 py-1.5 rounded-lg ${
                                projectedAssessment.decision === 'APPROVED' ? 'bg-emerald-900 text-emerald-300'
                                : projectedAssessment.decision === 'REVIEW'  ? 'bg-amber-900 text-amber-300'
                                : 'bg-rose-900 text-rose-300'
                              }`}>{projectedAssessment.decision}</span>
                            </div>

                            {/* Risk Gauge — Projected Prob. of Default */}
                            {projectedAssessment.probabilityOfDefault != null && (
                              <div className="col-span-2 bg-slate-900 border border-slate-700 rounded-xl p-4">
                                <div className="flex justify-between items-center mb-2">
                                  <p className="text-xs font-semibold text-slate-400 uppercase tracking-wide">Prob. of Default</p>
                                  <span className={`font-mono text-base font-bold ${projectedAssessment.probabilityOfDefault < 0.2 ? 'text-emerald-400' : projectedAssessment.probabilityOfDefault < 0.6 ? 'text-amber-400' : 'text-rose-400'}`}>
                                    {(projectedAssessment.probabilityOfDefault * 100).toFixed(2)}%
                                  </span>
                                </div>
                                <div className="w-full bg-slate-700 rounded-full h-2.5 overflow-hidden">
                                  <div
                                    className={`h-full transition-all duration-500 ${projectedAssessment.probabilityOfDefault < 0.2 ? 'bg-emerald-500' : projectedAssessment.probabilityOfDefault < 0.6 ? 'bg-amber-500' : 'bg-rose-500'}`}
                                    style={{ width: `${projectedAssessment.probabilityOfDefault * 100}%` }}
                                  />
                                </div>
                              </div>
                            )}

                            {/* DSCR */}
                            <div className={`rounded-xl p-4 border ${dscrBreach ? 'bg-rose-950 border-rose-700' : 'bg-slate-900 border-slate-700'}`}>
                              <div className="flex items-center justify-between mb-2">
                                <p className={`text-xs font-semibold ${dscrBreach ? 'text-rose-300' : 'text-slate-400'}`}>DSCR</p>
                                {dscrBreach && <AlertTriangle className="h-3.5 w-3.5 text-rose-400" />}
                              </div>
                              <p className={`text-xl font-bold ${dscrBreach ? 'text-rose-300' : 'text-white'}`}>
                                {projectedDSCR !== null ? `${projectedDSCR.toFixed(2)}x` : 'N/A'}
                              </p>
                              <p className={`text-xs mt-1 ${dscrBreach ? 'text-rose-400 font-semibold' : 'text-slate-600'}`}>
                                {dscrBreach ? 'Breach — below 1.0x' : projectedDSCR !== null ? `Min: 1.0x` : 'No debt service data'}
                              </p>
                            </div>

                            {/* Current Ratio */}
                            <div className={`rounded-xl p-4 border ${currentRatioBreach ? 'bg-rose-950 border-rose-700' : 'bg-slate-900 border-slate-700'}`}>
                              <div className="flex items-center justify-between mb-2">
                                <p className={`text-xs font-semibold ${currentRatioBreach ? 'text-rose-300' : 'text-slate-400'}`}>Current Ratio</p>
                                {currentRatioBreach && <AlertTriangle className="h-3.5 w-3.5 text-rose-400" />}
                              </div>
                              <p className={`text-xl font-bold ${currentRatioBreach ? 'text-rose-300' : 'text-white'}`}>
                                {projectedCurrentRatio !== null ? `${projectedCurrentRatio.toFixed(2)}x` : 'N/A'}
                              </p>
                              <p className={`text-xs mt-1 ${currentRatioBreach ? 'text-rose-400 font-semibold' : 'text-slate-600'}`}>
                                {currentRatioBreach ? `Breach — below ${standards.minCurrentRatio}x` : `Min: ${standards.minCurrentRatio}x`}
                              </p>
                            </div>

                            {/* Quick Ratio — full width */}
                            <div className={`col-span-2 rounded-xl p-4 border ${quickRatioBreach ? 'bg-rose-950 border-rose-700' : 'bg-slate-900 border-slate-700'}`}>
                              <div className="flex items-center justify-between mb-2">
                                <p className={`text-xs font-semibold ${quickRatioBreach ? 'text-rose-300' : 'text-slate-400'}`}>Quick Ratio</p>
                                {quickRatioBreach && <AlertTriangle className="h-3.5 w-3.5 text-rose-400" />}
                              </div>
                              <p className={`text-xl font-bold ${quickRatioBreach ? 'text-rose-300' : 'text-white'}`}>
                                {projectedQuickRatio !== null ? `${projectedQuickRatio.toFixed(2)}x` : 'N/A (inventory data not provided)'}
                              </p>
                              <p className={`text-xs mt-1 ${quickRatioBreach ? 'text-rose-400 font-semibold' : 'text-slate-600'}`}>
                                {quickRatioBreach ? `Breach — below ${standards.minQuickRatio}x` : projectedQuickRatio !== null ? `Min: ${standards.minQuickRatio}x` : ''}
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Right: static structural baseline */}
                        <div className="bg-slate-900 border border-slate-700 rounded-xl p-5 flex flex-col">
                          <div className="flex items-center gap-2 mb-4 flex-wrap">
                            <p className="text-xs font-semibold text-slate-500 uppercase tracking-wide">Structural Metrics</p>
                            <span className="px-2.5 py-0.5 bg-slate-700 text-slate-300 text-xs font-bold rounded-full">Held Static (Operating Baseline)</span>
                          </div>
                          <div className="grid grid-cols-2 gap-5 flex-1">
                            {[
                              { label: 'D/E Ratio',     raw: baseline.debtToEquity, suffix: baseline.debtToEquity && !baseline.debtToEquity.startsWith('N/A') ? 'x' : '' },
                              { label: 'ICR',           raw: baseline.icr,          suffix: baseline.icr ? 'x' : '' },
                              { label: 'ROA',           raw: baseline.roa,          suffix: baseline.roa ? '%' : '' },
                              { label: 'EBITDA Margin', raw: baseline.ebitdaMargin, suffix: baseline.ebitdaMargin ? '%' : '' },
                            ].map(({ label, raw, suffix }) => (
                              <div key={label} className="border-l-2 border-slate-700 pl-3">
                                <p className="text-xs text-slate-500 mb-0.5">{label}</p>
                                <p className="text-base font-bold text-slate-300">{raw != null ? `${raw}${suffix}` : 'N/A'}</p>
                              </div>
                            ))}
                          </div>
                          <p className="text-xs text-slate-700 mt-5 italic">Reflects Month 0 balance sheet — unchanged by the forecast slider.</p>
                        </div>
                      </div>
                    </div>
                  );
                })()}
              </div>
            ) : null}
          </div>

          <LoanRecommendationCard
            financialData={financialData}
            industry={selectedIndustry}
          />

        </main>
      </div>
    );
  }

  // UI: Portfolio Page — assessment history table with summary KPI cards
  if (currentPage === 'portfolio') {
    return (
      <div className="min-h-screen bg-slate-50">
        <header className="bg-slate-900 px-8 py-4 flex items-center justify-between sticky top-0 z-10 shadow-md">
          <div className="flex items-center gap-3">
            <img src="/logo.png" alt="FinSight" className="h-20 w-auto" />
            <span className="ml-4 text-slate-400 text-sm font-medium border-l border-slate-700 pl-4">SME Portfolio</span>
          </div>
          <div className="flex items-center gap-3">
            {financialData && (
              <button onClick={() => setCurrentPage('dashboard')} className="flex items-center gap-2 px-4 py-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg text-sm font-medium transition-colors">
                <ArrowLeft className="h-4 w-4" />Dashboard
              </button>
            )}
            <button onClick={() => { setCurrentPage('upload'); setFinancialData(null); setUploadedFile(null); setAssessmentResults(null); setForecastData(null); setPortfolioViewMeta(null); setIsStressTestActive(false); setActiveForecastMonth(1); }} className="flex items-center gap-2 px-4 py-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg text-sm font-medium transition-colors">
              <Upload className="h-4 w-4" />New Assessment
            </button>
            <button onClick={() => { localStorage.removeItem('finsight_auth'); window.location.href = '/'; }} className="flex items-center gap-2 px-4 py-2 bg-rose-600 hover:bg-rose-700 text-white rounded-lg text-sm font-semibold transition-colors">
              Log Out
            </button>
          </div>
        </header>

        <main className="w-full px-8 py-8 max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-2xl font-bold text-slate-900">Assessment History</h1>
              <p className="text-sm text-slate-500 mt-1">{portfolio.length} companies assessed — click a row to open the full report</p>
            </div>
          </div>

          {portfolio.length === 0 ? (
            <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 p-16 text-center">
              <Building2 className="h-16 w-16 text-slate-300 mx-auto mb-4" />
              <h2 className="text-2xl font-bold text-slate-400 mb-2">No assessments yet</h2>
              <p className="text-slate-500">Run your first funding assessment to see it here.</p>
            </div>
          ) : (
            <>
              {/* Summary KPI cards */}
              <div className="grid grid-cols-3 gap-6 mb-8">
                <div className="bg-white rounded-2xl shadow-lg p-6">
                  <p className="text-sm font-medium text-slate-600 mb-1">Total Assessed</p>
                  <p className="text-4xl font-bold text-slate-900">{portfolio.length}</p>
                </div>
                <div className="bg-emerald-50 rounded-2xl shadow-lg p-6">
                  <p className="text-sm font-medium text-emerald-700 mb-1">Approved</p>
                  <p className="text-4xl font-bold text-emerald-700">{portfolio.filter(p => p.decision === 'APPROVED').length}</p>
                </div>
                <div className="bg-red-50 rounded-2xl shadow-lg p-6">
                  <p className="text-sm font-medium text-red-700 mb-1">Rejected</p>
                  <p className="text-4xl font-bold text-red-700">{portfolio.filter(p => p.decision === 'REJECTED').length}</p>
                </div>
              </div>

              {/* Assessment history table */}
              <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 overflow-hidden">
                <div className="bg-slate-900 px-8 py-5">
                  <h2 className="text-xl font-bold text-white">Assessment History</h2>
                </div>
                <div className="overflow-x-auto">
                  <table className="w-full">
                    <thead className="bg-slate-50 border-b border-slate-200">
                      <tr>
                        <th className="text-left px-6 py-4 text-sm font-semibold text-slate-600">Company</th>
                        <th className="text-left px-6 py-4 text-sm font-semibold text-slate-600">Date</th>
                        <th className="text-left px-6 py-4 text-sm font-semibold text-slate-600">Revenue</th>
                        <th className="text-left px-6 py-4 text-sm font-semibold text-slate-600">Score</th>
                        <th className="text-left px-6 py-4 text-sm font-semibold text-slate-600">Current Ratio</th>
                        <th className="text-left px-6 py-4 text-sm font-semibold text-slate-600">EBITDA Margin</th>
                        <th className="text-left px-6 py-4 text-sm font-semibold text-slate-600">DSCR</th>
                        <th className="text-left px-6 py-4 text-sm font-semibold text-slate-600">Decision</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {portfolio.map((entry) => (
                        <tr
                          key={entry.id}
                          onClick={() => openPortfolioEntry(entry)}
                          className={`transition-colors ${entry.assessmentSnapshot ? 'hover:bg-indigo-50 cursor-pointer' : 'hover:bg-slate-50 cursor-not-allowed opacity-70'}`}
                          title={entry.assessmentSnapshot ? 'Click to view full assessment report' : 'Full report not saved for this entry'}
                        >
                          <td className="px-6 py-4">
                            <div className="font-semibold text-slate-900">{entry.companyName}</div>
                            {entry.knockouts > 0 && <div className="text-xs text-red-600 font-medium mt-0.5">{entry.knockouts} disqualifier{entry.knockouts > 1 ? 's' : ''}</div>}
                            {entry.assessmentSnapshot && <div className="text-xs text-indigo-600 font-medium mt-0.5">View full report →</div>}
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-600">{entry.assessedAt}</td>
                          <td className="px-6 py-4 text-sm font-medium text-slate-900">{(entry.revenue / 1000000).toFixed(1)}M SAR</td>
                          <td className="px-6 py-4">
                            <span className={`text-lg font-bold ${parseFloat(entry.overallScore) >= 70 ? 'text-emerald-600' : parseFloat(entry.overallScore) >= 50 ? 'text-amber-600' : 'text-red-600'}`}>
                              {entry.overallScore}%
                            </span>
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-700">{entry.ratios.currentRatio}</td>
                          <td className="px-6 py-4 text-sm text-slate-700">{(entry.ratios.ebitdaMargin ?? entry.ratios.profitMargin) + '%'}</td>
                          <td className="px-6 py-4 text-sm text-slate-700">{entry.ratios.dscr}</td>
                          <td className="px-6 py-4">
                            <span className={`inline-flex items-center gap-1.5 px-3 py-1 rounded-full text-xs font-bold ${entry.decision === 'APPROVED' ? 'bg-emerald-100 text-emerald-700' : entry.decision === 'REVIEW' ? 'bg-amber-100 text-amber-700' : 'bg-red-100 text-red-700'}`}>
                              {entry.decision === 'APPROVED' && <CheckCircle className="h-3 w-3" />}
                              {entry.decision === 'REVIEW'   && <AlertTriangle className="h-3 w-3" />}
                              {entry.decision === 'REJECTED' && <XCircle className="h-3 w-3" />}
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