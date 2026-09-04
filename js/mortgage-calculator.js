(() => {
const THEORETICAL_INTEREST_RATE = 0.05;
const MAINTENANCE_RATE = 0.01;
const MAX_AFFORDABILITY_RATIO = 0.33;
const MIN_EQUITY_RATIO = 0.2;
const MIN_CASH_RATIO = 0.1;
const FIRST_MORTGAGE_RATIO = 2 / 3;
const AMORTIZATION_YEARS = 15;

const positive = (value) => Number(value);

function calculateMortgage(input) {
  const propertyPrice = positive(input.propertyPrice);
  const cashEquity = positive(input.cashEquity);
  const pensionEquity = positive(input.pensionEquity);
  const annualGrossIncome = positive(input.annualGrossIncome);
  const monthlyDebts = positive(input.monthlyDebts || 0);

  if (propertyPrice <= 0 || annualGrossIncome <= 0) {
    throw new RangeError('Le prix et le revenu doivent être strictement supérieurs à zéro.');
  }
  if ([cashEquity, pensionEquity, monthlyDebts].some((value) => value < 0)) {
    throw new RangeError('Les montants saisis ne peuvent pas être négatifs.');
  }

  const totalEquity = cashEquity + pensionEquity;
  const mortgage = Math.max(0, propertyPrice - totalEquity);
  const equityRatio = totalEquity / propertyPrice;
  const cashRatio = cashEquity / propertyPrice;
  const secondMortgage = Math.max(0, mortgage - propertyPrice * FIRST_MORTGAGE_RATIO);
  const annualInterest = mortgage * THEORETICAL_INTEREST_RATE;
  const annualMaintenance = propertyPrice * MAINTENANCE_RATE;
  const annualAmortization = secondMortgage / AMORTIZATION_YEARS;
  const annualDebtCost = monthlyDebts * 12;
  const annualTheoreticalCost = annualInterest + annualMaintenance + annualAmortization + annualDebtCost;
  const affordabilityRatio = annualTheoreticalCost / annualGrossIncome;
  const equityOk = equityRatio >= MIN_EQUITY_RATIO && cashRatio >= MIN_CASH_RATIO;
  const affordabilityOk = affordabilityRatio <= MAX_AFFORDABILITY_RATIO;

  return {
    propertyPrice,
    cashEquity,
    pensionEquity,
    totalEquity,
    mortgage,
    equityRatio,
    cashRatio,
    annualInterest,
    annualMaintenance,
    annualAmortization,
    annualDebtCost,
    annualTheoreticalCost,
    affordabilityRatio,
    equityOk,
    affordabilityOk,
    eligible: equityOk && affordabilityOk,
    assumptions: {
      theoreticalInterestRate: THEORETICAL_INTEREST_RATE,
      maintenanceRate: MAINTENANCE_RATE,
      maxAffordabilityRatio: MAX_AFFORDABILITY_RATIO,
      minEquityRatio: MIN_EQUITY_RATIO,
      minCashRatio: MIN_CASH_RATIO,
      amortizationYears: AMORTIZATION_YEARS,
    },
  };
}

globalThis.KizuniMortgage = Object.freeze({ calculateMortgage });
})();
