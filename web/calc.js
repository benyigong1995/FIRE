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

/**
 * 计算资金能维持的时长（年）
 * @param {Object} params
 * @param {number} params.savings 当前存款
 * @param {number} params.monthlySpend 每月消费（今日购买力）
 * @param {number} params.inflationPct 通胀率(%)
 * @param {number} params.nominalReturnPct 名义回报率(%)
 * @returns {number} 维持年数 (Infinity if sustainable)
 */
export function calculateDurationYears({ savings, monthlySpend, inflationPct, nominalReturnPct }) {
  if (savings <= 0) return 0;
  if (monthlySpend <= 0) return Infinity;

  const inflation = inflationPct / 100.0;
  const nominalReturn = nominalReturnPct / 100.0;
  const realAnnual = (1 + nominalReturn) / (1 + inflation) - 1;
  const realMonthly = monthlyRateFromAnnual(realAnnual);

  // Case 0: 真实收益率约为 0
  if (Math.abs(realMonthly) < 1e-9) {
    return (savings / monthlySpend) / 12;
  }

  // Case 1: 永续 (Withdrawal rate < Real Return)
  // Monthly Interest = savings * realMonthly
  // If monthlySpend <= monthly interest, it grows or stays flat (in real terms)
  if (realMonthly > 0 && monthlySpend <= savings * realMonthly) {
    return Infinity;
  }

  // Case 2: 消耗
  // Formula: N = -ln(1 - (r * PV) / w) / ln(1+r)
  const ratio = (realMonthly * savings) / monthlySpend;
  
  // If ratio > 1, it means r*PV > w, covered by Case 1 (Infinity)
  // But due to float precision, check again. 
  // If we are here, ratio should be < 1 or realMonthly < 0.

  // Log argument must be > 0 for finite duration
  // 1 - ratio > 0  => ratio < 1
  if (ratio >= 1 && realMonthly > 0) return Infinity;

  const N = -Math.log(1 - ratio) / Math.log(1 + realMonthly);
  return N / 12;
}


