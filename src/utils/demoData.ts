const generateMonths = (baseData, monthlyGrowth) => {
  return Array.from({ length: 12 }, (_, i) => {
    const multiplier = 1 + (monthlyGrowth * i);
    return {
      month: `Month ${i + 1}`,
      Revenue: Math.round(baseData.Revenue * multiplier),
      Expenses: Math.round(baseData.Expenses * multiplier),
      Current_Assets: Math.round(baseData.Current_Assets * multiplier),
      Current_Liabilities: Math.round(baseData.Current_Liabilities), // Keep static for stress test
      Total_Assets: Math.round(baseData.Total_Assets * multiplier),
      Total_Liabilities: Math.round(baseData.Total_Liabilities),
      Total_Debt: Math.round(baseData.Total_Debt),
      Equity: Math.round((baseData.Total_Assets * multiplier) - baseData.Total_Liabilities), // strict accounting equation
      Cashflow: Math.round((baseData.Revenue - baseData.Expenses) * multiplier)
    };
  });
};

export const demoDatasets = {
  strong: generateMonths({
    Revenue: 500000, Expenses: 300000,
    Current_Assets: 1500000, Current_Liabilities: 500000,
    Total_Assets: 3000000, Total_Liabilities: 1000000, Total_Debt: 400000
  }, 0.02), // 2% monthly growth

  borderline: generateMonths({
    Revenue: 400000, Expenses: 360000,
    Current_Assets: 600000, Current_Liabilities: 550000,
    Total_Assets: 1800000, Total_Liabilities: 1200000, Total_Debt: 1000000
  }, 0.005), // stagnant 0.5% growth

  distressed: generateMonths({
    Revenue: 200000, Expenses: 250000,
    Current_Assets: 300000, Current_Liabilities: 600000,
    Total_Assets: 1000000, Total_Liabilities: 1100000, Total_Debt: 900000
  }, -0.01) // declining -1% monthly
};

export const DEMO_COLUMNS = [
  'month', 'Revenue', 'Expenses', 'Current_Assets', 'Current_Liabilities',
  'Total_Assets', 'Total_Liabilities', 'Total_Debt', 'Equity', 'Cashflow'
];

export const demoProfiles = [
  {
    key: 'strong',
    title: 'Strong Performer',
    expectedScore: '~9/10',
    description: 'Excellent liquidity (Current Ratio > 2.5), low leverage (D/E < 0.5), and strong 40% profit margins. Highly likely to be approved.',
    cardClass: 'border-emerald-200 bg-emerald-50 hover:bg-emerald-100 hover:border-emerald-300',
    badgeClass: 'bg-emerald-100 text-emerald-700',
    scoreClass: 'text-emerald-700',
  },
  {
    key: 'borderline',
    title: 'Borderline SME',
    expectedScore: '~6.5/10',
    description: 'Acceptable liquidity, but high debt burden (D/E > 2.0) and thin profit margins (~10%). Will trigger scrutiny on cash flow.',
    cardClass: 'border-amber-200 bg-amber-50 hover:bg-amber-100 hover:border-amber-300',
    badgeClass: 'bg-amber-100 text-amber-700',
    scoreClass: 'text-amber-700',
  },
  {
    key: 'distressed',
    title: 'Distressed SME',
    expectedScore: '~3/10',
    description: 'Severe liquidity crisis (Current Ratio < 0.8), negative cash flow, and operating at a net loss. Likely to trigger knockout rules.',
    cardClass: 'border-rose-200 bg-rose-50 hover:bg-rose-100 hover:border-rose-300',
    badgeClass: 'bg-rose-100 text-rose-700',
    scoreClass: 'text-rose-700',
  },
];

// UC1 (Demo): Same ETL aggregation as processDataWithMappings — sums flows, last row for balance sheet
export function processDemoDataset(rows, companyName) {
  const numRows = rows.length;
  const annualizationFactor = numRows < 12 ? (12 / numRows) : 1;

  let sumRevenue = 0, sumExpenses = 0, sumCashFlow = 0;
  const monthlyRevenue = [];

  rows.forEach((row) => {
    sumRevenue  += row.Revenue;
    sumExpenses += row.Expenses;
    sumCashFlow += row.Cashflow;

    monthlyRevenue.push({
      month: row.month,
      revenue: row.Revenue,
      expenses: row.Expenses,
      profit: row.Revenue - row.Expenses,
      cashFlow: row.Cashflow,
    });
  });

  const lastRow = rows[numRows - 1];
  const currentAssets      = lastRow.Current_Assets;
  const currentLiabilities = lastRow.Current_Liabilities;
  const totalAssets        = lastRow.Total_Assets;
  const totalDebt          = lastRow.Total_Debt;
  const equity             = lastRow.Equity;

  return {
    companyName,
    revenue:            Math.round(sumRevenue  * annualizationFactor),
    expenses:           Math.round(sumExpenses * annualizationFactor),
    currentAssets:      Math.round(currentAssets),
    currentLiabilities: Math.round(currentLiabilities),
    totalAssets:        Math.round(totalAssets),
    totalDebt:          Math.round(totalDebt),
    equity:             Math.round(equity),
    cashFlow:           Math.round(sumCashFlow * annualizationFactor),
    monthlyRevenue,
    assetBreakdown: [
      { name: 'Current Assets',    value: Math.round(currentAssets) },
      { name: 'Fixed Assets',      value: Math.round(totalAssets * 0.55) },
      { name: 'Intangible Assets', value: Math.max(0, Math.round(totalAssets - currentAssets - (totalAssets * 0.55))) },
    ],
  };
}
