import React, { useState, useEffect } from 'react';
import { Upload, FileText, CheckCircle, AlertTriangle, XCircle, Calculator, TrendingUp, Settings, Save, BarChart3, ArrowRight, ArrowLeft, Building2, DollarSign, Circle, Brain, Zap } from 'lucide-react';
import { LineChart, Line, BarChart, Bar, PieChart, Pie, Cell, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer, AreaChart, Area, ComposedChart, RadarChart, Radar, PolarGrid, PolarAngleAxis, PolarRadiusAxis, ReferenceLine } from 'recharts';

// UC5: Industry benchmark thresholds — drives all scoring and knockout logic
const industryStandards = {
  SaaS:         { minMargin: 15, minDSCR: 1.15, minCurrentRatio: 1.2, maxDebtEquity: 0.5,  minROA: 10 },
  Retail:       { minMargin: 5,  minDSCR: 1.25, minCurrentRatio: 1.0, maxDebtEquity: 1.5,  minROA: 5  },
  Construction: { minMargin: 10, minDSCR: 1.40, minCurrentRatio: 1.5, maxDebtEquity: 2.0,  minROA: 4  },
  Logistics:    { minMargin: 8,  minDSCR: 1.20, minCurrentRatio: 1.2, maxDebtEquity: 2.0,  minROA: 4  },
  Default:      { minMargin: 10, minDSCR: 1.25, minCurrentRatio: 1.2, maxDebtEquity: 1.5,  minROA: 5  }
};

export default function FinSightApp() {

  // --- App state ---
  const [currentPage, setCurrentPage] = useState('upload');
  const [uploadedFile, setUploadedFile] = useState(null);
  const [financialData, setFinancialData] = useState(null);       // source of truth from CSV/manual entry
  const [assessmentResults, setAssessmentResults] = useState(null); // snapshot after UC5 runs
  const [forecastData, setForecastData] = useState(null);         // UC4 backend response
  const [isForecasting, setIsForecasting] = useState(false);
  const [isScenarioMode, setIsScenarioMode] = useState(false);    // What-If sandbox toggle
  const [scenarioData, setScenarioData] = useState(null);         // deep copy of financialData for sandbox
  const [selectedIndustry, setSelectedIndustry] = useState('Default');
  const [showSettings, setShowSettings] = useState(false);
  const [showManualEntry, setShowManualEntry] = useState(false);
  const [showFieldMapping, setShowFieldMapping] = useState(false);
  const [detectedColumns, setDetectedColumns] = useState([]);
  const [fieldMappings, setFieldMappings] = useState({
    companyName: '', revenue: '', expenses: '',
    currentAssets: '', currentLiabilities: '',
    totalAssets: '', totalDebt: '', equity: '', cashFlow: ''

    
  });
  const [rawFileData, setRawFileData] = useState(null); // original parsed CSV rows, used for trend charts
  const [manualData, setManualData] = useState({
    companyName: '', revenue: '', expenses: '',
    currentAssets: '', currentLiabilities: '',
    totalAssets: '', totalDebt: '', equity: '', cashFlow: ''
  });
  const [portfolio, setPortfolio] = useState([]); // assessment history, saved on every UC5 run
  const [thresholds, setThresholds] = useState({  // configurable scoring weights per ratio
    currentRatio: { min: 1.5,  weight: 25, label: 'Current Ratio (Min)' },
    debtToEquity: { max: 2.0,  weight: 25, label: 'Debt-to-Equity (Max)' },
    profitMargin: { min: 10,   weight: 20, label: 'Profit Margin % (Min)' },
    roa:          { min: 5,    weight: 15, label: 'Return on Assets % (Min)' },
    dscr:         { min: 1.25, weight: 15, label: 'DSCR (Min)' }
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
      totalAssets: '', totalDebt: '', equity: '', cashFlow: ''
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

    let sumRevenue = 0, sumExpenses = 0, sumCashFlow = 0;
    const monthlyRevenue = [];

    // Find date/month column for chart X-axis labels
    const monthColName = rawFileData.columns.find(col =>
      col.toLowerCase().includes('month') || col.toLowerCase().includes('date')
    );

    rows.forEach((row, idx) => {
      const getMappedNum = (field) => {
        const mappedColumn = fieldMappings[field];
        if (!mappedColumn || row[mappedColumn] === undefined) return 0;
        const val = row[mappedColumn];
        return isNaN(parseFloat(val)) ? 0 : parseFloat(val);
      };

      const rowRev = getMappedNum('revenue');
      const rowExp = getMappedNum('expenses');
      let rowCF = getMappedNum('cashFlow');

      sumRevenue   += rowRev;
      sumExpenses  += rowExp;
      sumCashFlow  += rowCF;

      const monthLabel = monthColName && row[monthColName] ? row[monthColName] : `Month ${idx + 1}`;

      // Estimate missing row-level cashflow for chart only
      if (!rowCF && rowRev > 0) {
        rowCF = (rowRev - (rowExp || (rowRev * 0.75))) * 0.8;
      }

      monthlyRevenue.push({
        month: monthLabel,
        revenue: rowRev,
        expenses: rowExp || (rowRev * 0.75),
        profit: rowRev - (rowExp || (rowRev * 0.75)),
        cashFlow: rowCF
      });
    });

    // Scale to 12-month run-rate for ML model input
    const annualizationFactor = numRows < 12 ? (12 / numRows) : 1;
    let annualizedRevenue  = sumRevenue  * annualizationFactor;
    let annualizedExpenses = sumExpenses * annualizationFactor;
    let annualizedCashFlow = sumCashFlow * annualizationFactor;

    // Balance sheet: most recent row only
    const lastRow = rows[numRows - 1];
    const getLatestMappedNum = (field) => {
      const mappedColumn = fieldMappings[field];
      if (!mappedColumn || lastRow[mappedColumn] === undefined) return undefined;
      const val = lastRow[mappedColumn];
      return isNaN(parseFloat(val)) ? undefined : parseFloat(val);
    };

    let currentAssets      = getLatestMappedNum('currentAssets');
    let currentLiabilities = getLatestMappedNum('currentLiabilities');
    let totalAssets        = getLatestMappedNum('totalAssets');
    let totalDebt          = getLatestMappedNum('totalDebt');
    let equity             = getLatestMappedNum('equity');

    // Fallbacks for missing fields
    annualizedRevenue  = annualizedRevenue  || 5000000;
    annualizedExpenses = annualizedExpenses || (annualizedRevenue * 0.75);
    annualizedCashFlow = annualizedCashFlow || ((annualizedRevenue - annualizedExpenses) * 0.8);
    currentAssets      = currentAssets      || (annualizedRevenue * 0.4);
    currentLiabilities = currentLiabilities || (currentAssets * 0.5);
    totalAssets        = totalAssets        || (annualizedRevenue * 1.6);

    // Derive missing equity or debt from the accounting identity: Assets = Debt + Equity
    if (!equity && totalAssets && totalDebt)       equity    = totalAssets - totalDebt;
    else if (!totalDebt && totalAssets && equity)  totalDebt = totalAssets - equity;
    else if (!equity && !totalDebt) { equity = totalAssets * 0.6; totalDebt = totalAssets - equity; }
    else if (!equity)    equity    = totalAssets * 0.6;
    else if (!totalDebt) totalDebt = totalAssets - equity;

    let companyName = uploadedFile?.name?.replace(/\.[^/.]+$/, '') || 'Unknown Company';
    if (fieldMappings.companyName && lastRow[fieldMappings.companyName]) {
      companyName = lastRow[fieldMappings.companyName];
    }

    setFinancialData({
      companyName,
      revenue:            Math.round(annualizedRevenue),
      expenses:           Math.round(annualizedExpenses),
      currentAssets:      Math.round(currentAssets),
      currentLiabilities: Math.round(currentLiabilities),
      totalAssets:        Math.round(totalAssets),
      totalDebt:          Math.round(totalDebt),
      equity:             Math.round(equity),
      cashFlow:           Math.round(annualizedCashFlow),
      monthlyRevenue,
      assetBreakdown: [
        { name: 'Current Assets',   value: Math.round(currentAssets) },
        { name: 'Fixed Assets',     value: Math.round(totalAssets * 0.55) },
        { name: 'Intangible Assets',value: Math.max(0, Math.round(totalAssets - currentAssets - (totalAssets * 0.55))) }
      ]
    });
    setShowFieldMapping(false);
  };

  // UC4: ML Forecast — sends annualized financials to FastAPI, receives 6-month LightGBM prediction
  const runForecast = async () => {
    setIsForecasting(true);
    try {
      const response = await fetch(`${import.meta.env.VITE_API_URL}/api/forecast`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          revenue:            financialData.revenue,
          expenses:           financialData.expenses,
          currentAssets:      financialData.currentAssets,
          currentLiabilities: financialData.currentLiabilities,
          totalAssets:        financialData.totalAssets,
          totalDebt:          financialData.totalDebt,
          equity:             financialData.equity,
          cashFlow:           financialData.cashFlow
        })
      });

      if (!response.ok) {
        const err = await response.json();
        alert('Forecast error: ' + (err.detail || 'Unknown error'));
        setIsForecasting(false);
        return;
      }

      const forecast = await response.json();

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
        ...forecast.map(d => ({
          month:              d.month,
          forecastedCashFlow: d.forecastedCashFlow,
          upperBound:         d.upperBound,
          lowerBound:         d.lowerBound
        }))
      ];

      const total   = forecast.reduce((sum, f) => sum + f.forecastedCashFlow, 0);
      const avg     = Math.round(total / forecast.length);
      const avgConf = Math.round(forecast.reduce((sum, f) => sum + f.confidence, 0) / forecast.length * 100);
      const first   = forecast[0].forecastedCashFlow;
      const last    = forecast[forecast.length - 1].forecastedCashFlow;
      const change  = (last - first) / Math.abs(first);

      // Negative average overrides trend direction regardless of slope
      let trend;
      if (avg < 0)           trend = 'Declining';
      else if (change > 0.03)  trend = 'Growing';
      else if (change < -0.03) trend = 'Declining';
      else                     trend = 'Stable';

      setForecastData({
        combined, forecast,
        summary: { avgForecast: avg, totalForecast: Math.round(total), trend, confidence: avgConf }
      });
    } catch (error) {
      alert('Could not reach the backend. Make sure your FastAPI server is running:\n\nuvicorn main:app --reload --port 8000');
    }
    setIsForecasting(false);
  };

  // UC5 (Scenario): Pure assessment engine — takes any data object, returns results without touching state
  // Used by the What-If sandbox for real-time recalculation as sliders move
  const computeAssessment = (data) => {
    const bench = industryStandards[selectedIndustry];

    const currentRatio      = data.currentAssets / data.currentLiabilities;
    const profitMargin      = ((data.revenue - data.expenses) / data.revenue) * 100;
    const hasNegativeEquity = data.equity <= 0;
    const debtToEquity      = hasNegativeEquity ? null : data.totalDebt / data.equity;
    const roa               = (data.revenue - data.expenses) / data.totalAssets * 100;
    const hasDebt           = data.totalDebt > 0;
    const dscr              = hasDebt ? data.cashFlow / data.totalDebt : null;

    const knockouts = [];
    if (hasNegativeEquity) knockouts.push('Negative or zero equity — company is technically insolvent');
    if (currentRatio < 0.5) knockouts.push('Critical liquidity failure — current ratio below 0.5');
    if (data.cashFlow < 0 && data.totalDebt > 0) knockouts.push('Negative cash flow with outstanding debt');
    if (hasDebt && dscr < bench.minDSCR) knockouts.push(`DSCR of ${dscr.toFixed(2)} — below ${selectedIndustry} minimum of ${bench.minDSCR}x`);

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

    const scores = {
      currentRatio: scoreMetric(currentRatio, bench.minCurrentRatio, 'min'),
      debtToEquity: hasNegativeEquity ? 0 : scoreMetric(debtToEquity, bench.maxDebtEquity, 'max'),
      profitMargin: scoreMetric(profitMargin, bench.minMargin,        'min'),
      roa:          scoreMetric(roa,          bench.minROA,           'min'),
      dscr:         !hasDebt ? 100 : dscr < 0 ? 0 : scoreMetric(dscr, bench.minDSCR, 'min')
    };

    const totalWeight = thresholds.currentRatio.weight + thresholds.debtToEquity.weight +
                        thresholds.profitMargin.weight + thresholds.roa.weight + thresholds.dscr.weight;
    const weightedScore = (
      scores.currentRatio * thresholds.currentRatio.weight +
      scores.debtToEquity * thresholds.debtToEquity.weight +
      scores.profitMargin * thresholds.profitMargin.weight +
      scores.roa          * thresholds.roa.weight +
      scores.dscr         * thresholds.dscr.weight
    ) / totalWeight;

    // Knockouts cap the score at 30 and force REJECTED regardless of weighted score
    const overallScore = knockouts.length > 0 ? Math.min(weightedScore, 30) : weightedScore;
    const decision = knockouts.length > 0 ? 'REJECTED' : overallScore >= 70 ? 'APPROVED' : overallScore >= 50 ? 'REVIEW' : 'REJECTED';

    return {
      ratios: {
        currentRatio: currentRatio.toFixed(2),
        debtToEquity: hasNegativeEquity ? 'N/A (Negative Equity)' : debtToEquity.toFixed(2),
        profitMargin: profitMargin.toFixed(2),
        roa:          roa.toFixed(2),
        dscr:         !hasDebt ? 'N/A (No Debt)' : dscr.toFixed(2)
      },
      scores, overallScore: overallScore.toFixed(1), decision, knockouts,
      strengths: [
        ...(scores.currentRatio >= 80 ? ['Strong liquidity position'] : []),
        ...(!hasNegativeEquity && scores.debtToEquity >= 80 ? ['Low debt relative to equity'] : []),
        ...(scores.profitMargin >= 80 ? ['Healthy profit margins'] : []),
        ...(scores.roa >= 80 ? ['Strong return on assets'] : []),
        ...(!hasDebt || scores.dscr >= 80 ? ['Strong debt service capacity'] : []),
      ],
      weaknesses: [
        ...(scores.currentRatio < 60 ? ['Weak liquidity — current assets may not cover short-term obligations'] : []),
        ...(hasNegativeEquity ? ['Negative equity — liabilities exceed assets'] : scores.debtToEquity < 60 ? ['High debt levels relative to equity'] : []),
        ...(scores.profitMargin < 60 ? ['Low or negative profit margin'] : []),
        ...(scores.roa < 60 ? ['Poor return on assets — inefficient use of asset base'] : []),
        ...(hasDebt && scores.dscr < 60 ? ['Insufficient cash flow to comfortably service debt'] : []),
      ]
    };
  };

  // UC5: Scoring Engine — calculates 5 ratios, applies knockouts, produces APPROVED/REVIEW/REJECTED
  // Also saves a snapshot to the portfolio and sets assessmentResults state
  const calculateAssessment = () => {
    const bench = industryStandards[selectedIndustry];

    const currentRatio      = financialData.currentAssets / financialData.currentLiabilities;
    const profitMargin      = ((financialData.revenue - financialData.expenses) / financialData.revenue) * 100;
    const hasNegativeEquity = financialData.equity <= 0;
    const debtToEquity      = hasNegativeEquity ? null : financialData.totalDebt / financialData.equity;
    const roa               = (financialData.revenue - financialData.expenses) / financialData.totalAssets * 100;
    const hasDebt           = financialData.totalDebt > 0;
    const dscr              = hasDebt ? financialData.cashFlow / financialData.totalDebt : null;

    // Knockout rules — any match forces REJECTED regardless of weighted score
    const knockouts = [];
    if (hasNegativeEquity) knockouts.push('Negative or zero equity — company is technically insolvent');
    if (currentRatio < 0.5) knockouts.push('Critical liquidity failure — current ratio below 0.5');
    if (financialData.cashFlow < 0 && financialData.totalDebt > 0) knockouts.push('Negative cash flow with outstanding debt — unable to service obligations');
    if (hasDebt && dscr < bench.minDSCR) knockouts.push(`DSCR of ${dscr.toFixed(2)} — below ${selectedIndustry} minimum of ${bench.minDSCR}x`);

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

    const scores = {
      currentRatio: scoreMetric(currentRatio, bench.minCurrentRatio, 'min'),
      debtToEquity: hasNegativeEquity ? 0 : scoreMetric(debtToEquity, bench.maxDebtEquity, 'max'),
      profitMargin: scoreMetric(profitMargin, bench.minMargin,        'min'),
      roa:          scoreMetric(roa,          bench.minROA,           'min'),
      dscr:         !hasDebt ? 100 : dscr < 0 ? 0 : scoreMetric(dscr, bench.minDSCR, 'min')
    };

    const totalWeight = thresholds.currentRatio.weight + thresholds.debtToEquity.weight +
                        thresholds.profitMargin.weight + thresholds.roa.weight + thresholds.dscr.weight;
    const weightedScore = (
      scores.currentRatio * thresholds.currentRatio.weight +
      scores.debtToEquity * thresholds.debtToEquity.weight +
      scores.profitMargin * thresholds.profitMargin.weight +
      scores.roa          * thresholds.roa.weight +
      scores.dscr         * thresholds.dscr.weight
    ) / totalWeight;

    // Knockouts cap the score at 30 and force REJECTED
    const overallScore = knockouts.length > 0 ? Math.min(weightedScore, 30) : weightedScore;
    const decision = knockouts.length > 0 ? 'REJECTED' : overallScore >= 70 ? 'APPROVED' : overallScore >= 50 ? 'REVIEW' : 'REJECTED';

    // Portfolio: save snapshot — update existing entry if same company, otherwise append
    const portfolioEntry = {
      id: Date.now(),
      companyName:  financialData.companyName,
      assessedAt:   new Date().toLocaleDateString('en-SA'),
      overallScore: overallScore.toFixed(1),
      decision,
      industry: selectedIndustry,
      ratios: {
        currentRatio: currentRatio.toFixed(2),
        debtToEquity: hasNegativeEquity ? 'N/A' : debtToEquity.toFixed(2),
        profitMargin: profitMargin.toFixed(2),
        roa:          roa.toFixed(2),
        dscr:         !hasDebt ? 'N/A' : dscr.toFixed(2)
      },
      revenue:   financialData.revenue,
      knockouts: knockouts.length
    };
    setPortfolio(prev => {
      const exists = prev.findIndex(p => p.companyName === financialData.companyName);
      if (exists >= 0) { const updated = [...prev]; updated[exists] = portfolioEntry; return updated; }
      return [...prev, portfolioEntry];
    });

    setAssessmentResults({
      ratios: {
        currentRatio: currentRatio.toFixed(2),
        debtToEquity: hasNegativeEquity ? 'N/A (Negative Equity)' : debtToEquity.toFixed(2),
        profitMargin: profitMargin.toFixed(2),
        roa:          roa.toFixed(2),
        dscr:         !hasDebt ? 'N/A (No Debt)' : dscr.toFixed(2)
      },
      scores, overallScore: overallScore.toFixed(1), decision, knockouts,
      strengths: [
        ...(scores.currentRatio >= 80 ? ['Strong liquidity position'] : []),
        ...(!hasNegativeEquity && scores.debtToEquity >= 80 ? ['Low debt relative to equity'] : []),
        ...(scores.profitMargin >= 80 ? ['Healthy profit margins'] : []),
        ...(scores.roa >= 80 ? ['Strong return on assets'] : []),
        ...(!hasDebt || scores.dscr >= 80 ? ['Strong debt service capacity'] : []),
      ],
      weaknesses: [
        ...(scores.currentRatio < 60 ? ['Weak liquidity — current assets may not cover short-term obligations'] : []),
        ...(hasNegativeEquity ? ['Negative equity — liabilities exceed assets'] : scores.debtToEquity < 60 ? ['High debt levels relative to equity'] : []),
        ...(scores.profitMargin < 60 ? ['Low or negative profit margin'] : []),
        ...(scores.roa < 60 ? ['Poor return on assets — inefficient use of asset base'] : []),
        ...(hasDebt && scores.dscr < 60 ? ['Insufficient cash flow to comfortably service debt'] : []),
      ],
    });
    setCurrentPage('assessment');
  };

  // Updates a single threshold field (value or weight) in state
  const handleThresholdChange = (metric, field, value) => {
    setThresholds({ ...thresholds, [metric]: { ...thresholds[metric], [field]: parseFloat(value) || 0 } });
  };

  const handleManualDataChange = (field, value) => {
    setManualData({ ...manualData, [field]: value });
  };

  // UC1 (Manual): Builds flat 6-month chart data from a single annual entry
  const submitManualData = () => {
    const revenue  = parseFloat(manualData.revenue)  || 0;
    const expenses = parseFloat(manualData.expenses) || 0;
    const monthlyRevenue = [];
    const months   = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun'];
    const monthRev = Math.round(revenue  / 12);
    const monthExp = Math.round(expenses / 12);
    months.forEach((month) => {
      monthlyRevenue.push({
        month, revenue: monthRev, expenses: monthExp,
        profit:   monthRev - monthExp,
        cashFlow: Math.round((monthRev - monthExp) * 0.8)
      });
    });
    const currentAssets = parseFloat(manualData.currentAssets) || 0;
    const totalAssets   = parseFloat(manualData.totalAssets)   || 0;
    setFinancialData({
      companyName:        manualData.companyName || 'My Company',
      revenue, expenses, currentAssets,
      currentLiabilities: parseFloat(manualData.currentLiabilities) || 0,
      totalAssets,
      totalDebt:          parseFloat(manualData.totalDebt) || 0,
      equity:             parseFloat(manualData.equity)    || 0,
      cashFlow:           parseFloat(manualData.cashFlow)  || 0,
      monthlyRevenue,
      assetBreakdown: [
        { name: 'Current Assets',    value: currentAssets },
        { name: 'Fixed Assets',      value: Math.round(totalAssets * 0.55) },
        { name: 'Intangible Assets', value: totalAssets - currentAssets - Math.round(totalAssets * 0.55) }
      ]
    });
    setShowManualEntry(false);
  };

  // Resets all scoring weights to defaults
  const resetThresholds = () => {
    setThresholds({
      currentRatio: { min: 1.5,  weight: 25, label: 'Current Ratio (Min)' },
      debtToEquity: { max: 2.0,  weight: 25, label: 'Debt-to-Equity (Max)' },
      profitMargin: { min: 10,   weight: 20, label: 'Profit Margin % (Min)' },
      roa:          { min: 5,    weight: 15, label: 'Return on Assets % (Min)' },
      dscr:         { min: 1.25, weight: 15, label: 'DSCR (Min)' }
    });
  };

  // Returns sum of all weights — must equal 100 for valid scoring
  const getTotalWeight = () => {
    return thresholds.currentRatio.weight + thresholds.debtToEquity.weight +
           thresholds.profitMargin.weight + thresholds.roa.weight + thresholds.dscr.weight;
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
            <p className="text-sm text-slate-500 mt-1">Upload an SME financial CSV or enter data manually to begin.</p>
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
            </div>
          </div>

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
                  ].map(({ field, label, required }) => (
                    <div key={field}>
                      <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-2">{label} {required && <span className="text-rose-500">*</span>}</label>
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
            <button onClick={() => { setCurrentPage('upload'); setFinancialData(null); setUploadedFile(null); setAssessmentResults(null); setForecastData(null); }} className="flex items-center gap-2 px-4 py-2 text-slate-300 hover:text-white hover:bg-slate-800 rounded-lg text-sm font-medium transition-colors">
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
                  financialData.monthlyRevenue.length > 1 &&
                  financialData.monthlyRevenue[financialData.monthlyRevenue.length - 1].revenue >= financialData.monthlyRevenue[0].revenue
                    ? 'bg-emerald-100 text-emerald-600' : 'bg-rose-100 text-rose-600'
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

          {/* UC4: AI Forecast card */}
          <div className="bg-slate-900 border-2 border-slate-800 rounded-xl shadow-md p-6">
            <div className="flex items-center justify-between mb-6">
              <div className="flex items-center gap-3">
                <div className="p-2.5 bg-indigo-600 rounded-lg"><Brain className="h-5 w-5 text-white" /></div>
                <div>
                  <h2 className="text-base font-bold text-white">AI Cash Flow Forecast</h2>
                  <p className="text-xs text-slate-400">LightGBM model — 6-month forward projection</p>
                </div>
              </div>
              <button onClick={runForecast} disabled={isForecasting} className="flex items-center gap-2 px-5 py-2.5 bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white rounded-lg text-sm font-semibold transition-colors">
                <Zap className="h-4 w-4" />
                {isForecasting ? 'Running Model...' : forecastData ? 'Re-run Forecast' : 'Run Forecast'}
              </button>
            </div>

            {isForecasting && (
              <div className="flex items-center justify-center h-64 gap-4">
                <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-indigo-400" />
                <p className="text-slate-300 text-sm font-medium">Running LightGBM inference...</p>
              </div>
            )}

            {!isForecasting && !forecastData && (
              <div className="flex items-center justify-center h-64 border border-dashed border-slate-700 rounded-lg">
                <div className="text-center">
                  <Brain className="h-10 w-10 text-slate-600 mx-auto mb-2" />
                  <p className="text-slate-500 text-sm">Click Run Forecast to generate the 6-month projection</p>
                </div>
              </div>
            )}

            {forecastData && (
              <div className="space-y-5">
                <div className="grid grid-cols-2 lg:grid-cols-4 gap-3">
                  {[
                    { label: 'Avg Monthly CF', value: `${(forecastData.summary.avgForecast / 1000).toFixed(0)}K SAR` },
                    { label: '6-Month Total',  value: `${(forecastData.summary.totalForecast / 1000000).toFixed(2)}M SAR` },
                    { label: 'Trend',          value: forecastData.summary.trend },
                    { label: 'Confidence',     value: `${forecastData.summary.confidence}%` },
                  ].map(({ label, value }, idx) => (
                    <div key={idx} className="bg-slate-800 border border-slate-700 rounded-lg p-4">
                      <p className="text-xs text-slate-400 mb-1">{label}</p>
                      <p className="text-lg font-bold text-white">{value}</p>
                    </div>
                  ))}
                </div>

                {/* Forecast chart — white box inside dark card */}
                <div className="h-72 bg-white rounded-xl p-4">
                  <ResponsiveContainer width="100%" height="100%">
                    <ComposedChart data={forecastData.combined}>
                      <CartesianGrid strokeDasharray="3 3" stroke="#F1F5F9" />
                      <XAxis dataKey="month" stroke="#94A3B8" style={{ fontSize: '11px' }} />
                      <YAxis stroke="#94A3B8" style={{ fontSize: '11px' }} tickFormatter={(v) => v >= 1000000 ? `${(v/1000000).toFixed(1)}M` : v >= 1000 ? `${(v/1000).toFixed(0)}K` : v} />
                      <Tooltip contentStyle={{ backgroundColor: 'white', border: '1px solid #E2E8F0', borderRadius: '8px', fontSize: '12px', color: '#1E293B' }}
                        formatter={(value, name) => [
                          value >= 1000000 ? `${(value/1000000).toFixed(2)}M SAR` : `${(value/1000).toFixed(0)}K SAR`,
                          name === 'actualCashFlow' ? 'Current Cash Flow' : name === 'forecastedCashFlow' ? 'Forecast' : name
                        ]} />
                      <Area dataKey="upperBound" fill="#6366F1" stroke="none" fillOpacity={0.1} />
                      <Area dataKey="lowerBound" fill="#6366F1" stroke="none" fillOpacity={0.1} />
                      <Line dataKey="actualCashFlow" stroke="#0F172A" strokeWidth={2} dot={{ r: 3 }} name="actualCashFlow" />
                      <Line dataKey="forecastedCashFlow" stroke="#6366F1" strokeWidth={2.5} strokeDasharray="5 5" dot={{ r: 3 }} name="forecastedCashFlow" />
                      {/* Dashed vertical line marking where forecast begins */}
                      {forecastData.combined.findIndex(d => d.forecastedCashFlow !== undefined) > 0 && (
                        <ReferenceLine
                          x={forecastData.combined[forecastData.combined.findIndex(d => d.forecastedCashFlow !== undefined)].month}
                          stroke="#94A3B8" strokeDasharray="4 4"
                          label={{ value: 'Forecast Start', position: 'insideTopRight', fontSize: 10, fill: '#94A3B8', dy: -6 }}
                        />
                      )}
                    </ComposedChart>
                  </ResponsiveContainer>
                </div>
                <div className="flex items-center gap-6 mt-4 justify-center">
                  <div className="flex items-center gap-2 text-xs text-slate-400"><div className="w-5 h-0.5 bg-slate-900 rounded" />Current Cash Flow</div>
                  <div className="flex items-center gap-2 text-xs text-slate-400"><div className="w-5 h-0.5 bg-indigo-500 rounded" style={{ backgroundImage: 'repeating-linear-gradient(90deg, #6366F1 0px, #6366F1 4px, transparent 4px, transparent 8px)' }} />Forecast</div>
                  <div className="flex items-center gap-2 text-xs text-slate-400"><div className="w-5 h-3 bg-indigo-500 rounded opacity-20" />Confidence Band</div>
                </div>
              </div>
            )}
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

              {/* UC3: Risk Radar — normalises all 5 ratios to 0-100 for visual health footprint */}
              {(() => {
                const cr   = financialData.currentAssets / financialData.currentLiabilities;
                const de   = financialData.equity > 0 ? financialData.totalDebt / financialData.equity : 0;
                const pm   = ((financialData.revenue - financialData.expenses) / financialData.revenue) * 100;
                const roa  = ((financialData.revenue - financialData.expenses) / financialData.totalAssets) * 100;
                const dscr = financialData.totalDebt > 0 ? financialData.cashFlow / financialData.totalDebt : 2.5;
                const clamp = (v, min, max) => Math.min(100, Math.max(0, ((v - min) / (max - min)) * 100));
                const radarData = [
                  { metric: 'Current Ratio', score: clamp(cr,     0,   3),  fullMark: 100 },
                  { metric: 'Debt / Equity', score: clamp(4 - de, 0,   4),  fullMark: 100 }, // inverted: lower D/E = higher score
                  { metric: 'Profit Margin', score: clamp(pm,   -50,  40),  fullMark: 100 },
                  { metric: 'ROA %',         score: clamp(roa,  -30,  20),  fullMark: 100 },
                  { metric: 'DSCR',          score: clamp(dscr,   0, 2.5),  fullMark: 100 },
                ];
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
          <div className="flex items-center justify-between pb-4 bg-white border border-slate-200 rounded-xl shadow-sm px-6 py-4">
            <div className="flex items-center gap-4">
              <div>
                <label className="block text-xs font-semibold text-slate-500 uppercase tracking-wide mb-1">SME Industry</label>
                <select value={selectedIndustry} onChange={(e) => setSelectedIndustry(e.target.value)} className="px-4 py-2.5 bg-slate-50 border border-slate-300 rounded-lg text-sm text-slate-800 font-medium focus:ring-2 focus:ring-indigo-500 outline-none">
                  {Object.keys(industryStandards).map(industry => (<option key={industry} value={industry}>{industry}</option>))}
                </select>
              </div>
              <div className="text-xs text-slate-500 space-y-0.5 border-l border-slate-200 pl-4">
                <p>Min Margin: <span className="font-bold text-slate-700">{industryStandards[selectedIndustry].minMargin}%</span></p>
                <p>Min DSCR: <span className="font-bold text-slate-700">{industryStandards[selectedIndustry].minDSCR}x</span></p>
                <p>Min Current Ratio: <span className="font-bold text-slate-700">{industryStandards[selectedIndustry].minCurrentRatio}x</span></p>
                <p>Max D/E: <span className="font-bold text-slate-700">{industryStandards[selectedIndustry].maxDebtEquity}x</span></p>
                <p>Min ROA: <span className="font-bold text-slate-700">{industryStandards[selectedIndustry].minROA}%</span></p>
              </div>
            </div>
            <button onClick={calculateAssessment} className="flex items-center gap-2 px-8 py-3.5 bg-slate-900 hover:bg-slate-800 text-white rounded-xl font-semibold text-sm shadow-md transition-colors">
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
                if (isScenarioMode) { setIsScenarioMode(false); setScenarioData(null); }
                else {
                  setIsScenarioMode(true);
                  setScenarioData({
                    revenue: financialData.revenue, expenses: financialData.expenses,
                    currentAssets: financialData.currentAssets, currentLiabilities: financialData.currentLiabilities,
                    totalAssets: financialData.totalAssets, totalDebt: financialData.totalDebt,
                    equity: financialData.equity, cashFlow: financialData.cashFlow,
                  });
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

          {/* UC5 (Configure): weight adjustment panel — only affects scoring weights, not industry benchmarks */}
          {showSettings && (
            <div className="bg-white border border-slate-200 rounded-xl shadow-sm p-6">
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-base font-bold text-slate-900">Assessment Criteria Configuration</h2>
                <button onClick={resetThresholds} className="text-xs text-slate-500 hover:text-slate-800 font-semibold px-3 py-1.5 hover:bg-slate-100 rounded-lg transition-colors">Reset to Defaults</button>
              </div>
              <div className="grid grid-cols-2 lg:grid-cols-5 gap-4 mb-6">
                {[
                  { key: 'currentRatio', field: 'min',  step: '0.1'  },
                  { key: 'debtToEquity', field: 'max',  step: '0.1'  },
                  { key: 'profitMargin', field: 'min',  step: '0.5'  },
                  { key: 'roa',          field: 'min',  step: '0.5'  },
                  { key: 'dscr',         field: 'min',  step: '0.05' },
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
                onClick={() => setScenarioData({
                  revenue: financialData.revenue, expenses: financialData.expenses,
                  currentAssets: financialData.currentAssets, currentLiabilities: financialData.currentLiabilities,
                  totalAssets: financialData.totalAssets, totalDebt: financialData.totalDebt,
                  equity: financialData.equity, cashFlow: financialData.cashFlow,
                })}
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
                ].map(({ key, label, min, max }) => (
                  <div key={key}>
                    <div className="flex items-center justify-between mb-2">
                      <label className="text-xs font-semibold text-slate-600 uppercase tracking-wide">{label}</label>
                      <span className="text-xs font-bold text-slate-800">
                        {scenarioData[key] >= 1000000 ? `${(scenarioData[key] / 1000000).toFixed(2)}M` : `${(scenarioData[key] / 1000).toFixed(0)}K`} SAR
                      </span>
                    </div>
                    <input type="range" min={min} max={max} step={(max - min) / 200} value={scenarioData[key]}
                      onChange={(e) => {
                        const updated = { ...scenarioData, [key]: parseFloat(e.target.value) };
                        updated.cashFlow = updated.revenue - updated.expenses; // cash flow mirrors revenue - expenses
                        setScenarioData(updated);
                      }}
                      className="w-full accent-amber-500"
                    />
                    <input type="number" value={Math.round(scenarioData[key])}
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
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-5">
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
                      <p className="text-xs text-slate-500 mb-4">Weighted composite score</p>
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

                  <div className="lg:col-span-2 bg-white border border-slate-200 rounded-xl shadow-sm p-6">
                    <h3 className="text-sm font-bold text-slate-700 mb-4">Financial Ratios Breakdown</h3>
                    <div className="space-y-3">
                      {/* Each row shows the ratio value, its 0-100 score, weight, and industry benchmark */}
                      {[
                        { label: 'Current Ratio',                value: activeResults.ratios.currentRatio,       score: activeResults.scores.currentRatio,  weight: thresholds.currentRatio.weight, benchmark: `Min: ${industryStandards[selectedIndustry].minCurrentRatio}x` },
                        { label: 'Debt to Equity',               value: activeResults.ratios.debtToEquity,       score: activeResults.scores.debtToEquity,  weight: thresholds.debtToEquity.weight, benchmark: `Max: ${industryStandards[selectedIndustry].maxDebtEquity}x` },
                        { label: 'Profit Margin',                value: `${activeResults.ratios.profitMargin}%`, score: activeResults.scores.profitMargin,  weight: thresholds.profitMargin.weight, benchmark: `Min: ${industryStandards[selectedIndustry].minMargin}%` },
                        { label: 'Return on Assets (ROA)',       value: `${activeResults.ratios.roa}%`,          score: activeResults.scores.roa,           weight: thresholds.roa.weight,          benchmark: `Min: ${industryStandards[selectedIndustry].minROA}%` },
                        { label: 'Debt Service Coverage (DSCR)', value: activeResults.ratios.dscr,               score: activeResults.scores.dscr,           weight: thresholds.dscr.weight,         benchmark: `Min: ${industryStandards[selectedIndustry].minDSCR}x` },
                      ].map(({ label, value, score, weight, benchmark }) => (
                        <div key={label} className={`flex items-center justify-between px-4 py-3 rounded-lg border ${score >= 80 ? 'bg-emerald-50 border-emerald-100' : score >= 60 ? 'bg-amber-50 border-amber-100' : 'bg-rose-50 border-rose-100'}`}>
                          <div className="flex items-center gap-3">
                            <div className={`w-1.5 h-8 rounded-full ${score >= 80 ? 'bg-emerald-500' : score >= 60 ? 'bg-amber-500' : 'bg-rose-500'}`} />
                            <div>
                              <p className="text-sm font-semibold text-slate-800">{label}</p>
                              <p className="text-xs text-slate-400">Weight: {weight}% · {benchmark} <span className="text-indigo-500 font-semibold">({selectedIndustry})</span></p>
                            </div>
                          </div>
                          <div className="text-right">
                            <p className="text-base font-bold text-slate-900">{value}</p>
                            <p className={`text-xs font-bold ${score >= 80 ? 'text-emerald-600' : score >= 60 ? 'text-amber-600' : 'text-rose-600'}`}>{score} / 100</p>
                          </div>
                        </div>
                      ))}
                    </div>
                  </div>
                </div>

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

        </main>
      </div>
    );
  }

  // UI: Portfolio Page — assessment history table with summary KPI cards
  if (currentPage === 'portfolio') {
    return (
      <div className="min-h-screen bg-gradient-to-br from-slate-100 to-white p-8">
        <div className="max-w-7xl mx-auto">
          <div className="flex items-center justify-between mb-8">
            <div>
              <h1 className="text-4xl font-bold text-slate-900">SME Portfolio</h1>
              <p className="text-slate-600 mt-1">{portfolio.length} companies assessed</p>
            </div>
            <button onClick={() => { setCurrentPage('upload'); setFinancialData(null); setUploadedFile(null); setAssessmentResults(null); setForecastData(null); }} className="flex items-center gap-2 px-5 py-3 bg-slate-900 text-white rounded-xl hover:bg-slate-800">
              <Upload className="h-5 w-5" />New Assessment
            </button>
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
                        <th className="text-left px-6 py-4 text-sm font-semibold text-slate-600">Profit Margin</th>
                        <th className="text-left px-6 py-4 text-sm font-semibold text-slate-600">DSCR</th>
                        <th className="text-left px-6 py-4 text-sm font-semibold text-slate-600">Decision</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-slate-100">
                      {portfolio.map((entry) => (
                        <tr key={entry.id} className="hover:bg-slate-50 transition-colors">
                          <td className="px-6 py-4">
                            <div className="font-semibold text-slate-900">{entry.companyName}</div>
                            {entry.knockouts > 0 && <div className="text-xs text-red-600 font-medium mt-0.5">{entry.knockouts} disqualifier{entry.knockouts > 1 ? 's' : ''}</div>}
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-600">{entry.assessedAt}</td>
                          <td className="px-6 py-4 text-sm font-medium text-slate-900">{(entry.revenue / 1000000).toFixed(1)}M SAR</td>
                          <td className="px-6 py-4">
                            <span className={`text-lg font-bold ${parseFloat(entry.overallScore) >= 70 ? 'text-emerald-600' : parseFloat(entry.overallScore) >= 50 ? 'text-amber-600' : 'text-red-600'}`}>
                              {entry.overallScore}%
                            </span>
                          </td>
                          <td className="px-6 py-4 text-sm text-slate-700">{entry.ratios.currentRatio}</td>
                          <td className="px-6 py-4 text-sm text-slate-700">{entry.ratios.profitMargin}%</td>
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
        </div>
      </div>
    );
  }

  return null;
}