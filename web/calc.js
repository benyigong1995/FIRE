// 计算与格式化工具

export function monthlyRateFromAnnual(annualRate) {
  return Math.pow(1 + annualRate, 1 / 12) - 1;
}

export function calculateMonthlySpendableIncome({ age, savings, life, inflationPct, nominalReturnPct }) {
  if (savings <= 0) return { w: 0, months: 0 };
  const remainingYears = life - age;
  if (remainingYears <= 0) return { w: 0, months: 0 };

  const inflation = inflationPct / 100.0;
  const nominalReturn = nominalReturnPct / 100.0;
  const realAnnual = (1 + nominalReturn) / (1 + inflation) - 1;
  const realMonthly = monthlyRateFromAnnual(realAnnual);
  const months = Math.max(1, Math.floor(remainingYears * 12));

  if (Math.abs(realMonthly) < 1e-12) {
    return { w: savings / months, months };
  }
  const discount = 1 - Math.pow(1 + realMonthly, -months);
  const w = savings * realMonthly / discount;
  return { w: Math.max(0, w), months };
}

export function buildIncomeSeriesNominal(wReal, inflMonthly, length) {
  return Array.from({ length }, (_, t) => wReal * Math.pow(1 + inflMonthly, t));
}

export function buildBalanceSeriesNominal({ savings, nominalMonthlyReturn, incomeNominal }) {
  const balances = [];
  let pv = savings;
  balances.push(pv);
  for (let i = 0; i < incomeNominal.length - 1; i++) {
    pv = pv * (1 + nominalMonthlyReturn) - incomeNominal[i + 1];
    if (pv < 0) pv = 0;
    balances.push(pv);
  }
  return balances;
}

export function formatCurrency(value) {
  try {
    return value.toLocaleString('zh-CN', { style: 'currency', currency: 'CNY', maximumFractionDigits: 2 });
  } catch (e) {
    return `¥${Number(value).toFixed(2)}`;
  }
}

// 格式化大数字，去掉末尾无意义的 0（如 3.50万 → 3.5万）
function trimTrailingZeros(numStr) {
  return numStr.replace(/(\.\d*?)0+$/, '$1').replace(/\.$/, '');
}

export function formatLargeNumber(value) {
  const n = Number(value);
  if (!isFinite(n)) return '';
  const abs = Math.abs(n);
  if (abs >= 1e8) return `${trimTrailingZeros((n / 1e8).toFixed(2))}亿`;
  if (abs >= 1e4) return `${trimTrailingZeros((n / 1e4).toFixed(2))}万`;
  try { return n.toLocaleString('zh-CN'); } catch { return String(n); }
}

export function formatWan(value) {
  const n = Number(value);
  if (!isFinite(n)) return '';
  return `${trimTrailingZeros((n / 1e4).toFixed(2))}万`;
}

// 反推：给定期望月开销（以今日购买力）、目标退休年龄，反推所需当前存款（以今日购买力）
export function calculateRequiredCurrentSavingsForDesiredRealIncome({
  currentAgeYears,
  targetRetireAgeYears,
  lifeExpectancyAgeYears,
  annualInflationRatePct,
  annualNominalReturnRatePct,
  desiredMonthlyReal,
}) {
  const age = Number(currentAgeYears);
  const retireAge = Math.max(age, Number(targetRetireAgeYears));
  const life = Number(lifeExpectancyAgeYears);
  const desired = Math.max(0, Number(desiredMonthlyReal));
  if (!isFinite(age) || !isFinite(retireAge) || !isFinite(life) || !isFinite(desired)) return 0;
  const remainingYearsAfterRetire = Math.max(0, life - retireAge);
  const N = Math.max(1, Math.floor(remainingYearsAfterRetire * 12));

  const inflation = Number(annualInflationRatePct) / 100.0;
  const nominal = Number(annualNominalReturnRatePct) / 100.0;
  const realAnnual = (1 + nominal) / (1 + inflation) - 1;
  const realMonthly = monthlyRateFromAnnual(realAnnual);

  let pvAtRetireReal;
  if (Math.abs(realMonthly) < 1e-12) {
    pvAtRetireReal = desired * N;
  } else {
    const discount = 1 - Math.pow(1 + realMonthly, -N);
    pvAtRetireReal = desired * (discount / realMonthly);
  }

  const yearsUntilRetire = Math.max(0, retireAge - age);
  const growthFactorReal = Math.pow(1 + realAnnual, yearsUntilRetire);
  const requiredTodayReal = pvAtRetireReal / (growthFactorReal > 0 ? growthFactorReal : 1);

  // 名义退休时金额 = 以今日购买力计的退休时金额 × 通胀累积
  const inflationFactor = Math.pow(1 + inflation, yearsUntilRetire);
  const requiredAtRetireNominal = pvAtRetireReal * inflationFactor;

  return {
    requiredTodayReal,
    requiredAtRetireReal: pvAtRetireReal,
    requiredAtRetireNominal,
  };
}


