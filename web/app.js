import { defaults } from './config.js';
import {
  monthlyRateFromAnnual,
  calculateMonthlySpendableIncome,
  buildIncomeSeriesNominal,
  buildBalanceSeriesNominal,
  formatCurrency,
  formatLargeNumber,
  formatWan,
  calculateRequiredCurrentSavingsForDesiredRealIncome,
} from './calc.js';
import { drawDualAxisChart } from './chart.js';

document.addEventListener('DOMContentLoaded', () => {
  const form = document.getElementById('calc-form');
  const resetBtn = document.getElementById('reset');
  const monthlyEl = document.getElementById('monthly');
  // months 已移除
  const requiredEl = document.getElementById('requiredSavings');
  const requiredAtRetireEl = document.getElementById('requiredAtRetire');
  const reverseGroup = document.getElementById('reverseGroup');
  const reverseBtn = document.getElementById('reverseBtn');
  const chartCanvas = document.getElementById('balanceChart');
  const exportBtn = document.getElementById('exportPng');

  let balanceChart = null;

  // 格式化函数改由 calc.js 提供

  // 根据固定生日自动设置默认年龄（年份为整数）
  function setDefaultAgeFromDOB(dobStr) {
    const ageInput = document.getElementById('age');
    if (!ageInput) return;
    try {
      const now = new Date();
      const dob = new Date(dobStr);
      if (isNaN(dob.getTime())) return;
      let years = now.getFullYear() - dob.getFullYear();
      const monthDelta = now.getMonth() - dob.getMonth();
      if (monthDelta < 0 || (monthDelta === 0 && now.getDate() < dob.getDate())) {
        years -= 1;
      }
      years = Math.max(0, years);
      ageInput.value = String(years);
    } catch (_) {
      // ignore parse errors
    }
  }

  function ensureErrorBox() {
    let box = document.getElementById('error-box');
    if (!box) {
      const resultSection = document.querySelector('.result');
      box = document.createElement('div');
      box.id = 'error-box';
      box.className = 'error-box';
      resultSection.parentNode.insertBefore(box, resultSection);
    }
    return box;
  }

  function showError(message) {
    const box = ensureErrorBox();
    box.textContent = message || '';
    box.style.display = message ? 'block' : 'none';
  }

  function clearOutputs() {
    monthlyEl.textContent = '—';
    showError('');
    if (balanceChart) {
      balanceChart.destroy();
      balanceChart = null;
    }
  }

  // 计算与构建序列由 calc.js 提供

  function drawChart({ labels, balanceRaw, incomeRaw, startAge }) {
    if (balanceChart) {
      balanceChart.destroy();
      balanceChart = null;
    }
    balanceChart = drawDualAxisChart({ canvas: chartCanvas, labels, balanceRaw, incomeRaw, startAge });
  }

  function onSubmit(e) {
    e.preventDefault();
    showError('');

    const age = parseFloat(document.getElementById('age').value);
    const savings = parseFloat(document.getElementById('savings').value);
    const life = parseFloat(document.getElementById('life').value);
    const inflationPct = parseFloat(document.getElementById('inflation').value);
    const nominalReturnPct = parseFloat(document.getElementById('ret').value);
    // 主计算不使用反推输入

    if (Number.isNaN(age) || Number.isNaN(savings) || Number.isNaN(life) || Number.isNaN(inflationPct) || Number.isNaN(nominalReturnPct)) {
      clearOutputs();
      showError('请输入有效数字。');
      return;
    }
    if (age < 0 || life <= 0 || life <= age) {
      clearOutputs();
      showError('请检查年龄与预期寿命：预期寿命必须大于当前年龄。');
      return;
    }
    if (savings <= 0) {
      clearOutputs();
      showError('当前存款需要大于 0。');
      return;
    }
    if (inflationPct < 0) {
      clearOutputs();
      showError('通胀率不能为负。');
      return;
    }

    const inflation = inflationPct / 100.0;
    const nominal = nominalReturnPct / 100.0;
    const realAnnual = (1 + nominal) / (1 + inflation) - 1;
    const realMonthly = Math.pow(1 + realAnnual, 1 / 12) - 1;
    const inflMonthly = monthlyRateFromAnnual(inflation);
    const nominalMonthly = monthlyRateFromAnnual(nominal);

    const { w, months } = calculateMonthlySpendableIncome({ age, savings, life, inflationPct, nominalReturnPct });

    monthlyEl.textContent = formatCurrency(w);

    // 主计算结束：隐藏反推结果
    requiredEl.textContent = '—';
    requiredAtRetireEl.textContent = '—';
    if (reverseGroup) reverseGroup.style.display = 'none';

    const labels = Array.from({ length: months + 1 }, (_, i) => i);
    const incomeNominal = buildIncomeSeriesNominal(w, inflMonthly, labels.length);
    const balancesNominal = buildBalanceSeriesNominal({
      savings,
      nominalMonthlyReturn: nominalMonthly,
      incomeNominal,
    });
    drawChart({ labels, balanceRaw: balancesNominal, incomeRaw: incomeNominal, startAge: age });
  }

  function onReset() {
    // 原生reset已经触发，这里只做后续处理
    setTimeout(() => {
      // 恢复动态默认年龄（基于 DOB）
      setDefaultAgeFromDOB(defaults.dob);
      // 立即按默认值重算并绘图
      onSubmit(new Event('submit'));
    }, 0);
  }

  form.addEventListener('submit', onSubmit);
  form.addEventListener('reset', onReset);

  // 目标反推（独立按钮）
  if (reverseBtn) {
    reverseBtn.addEventListener('click', () => {
      showError('');
      const age = parseFloat(document.getElementById('age').value);
      const life = parseFloat(document.getElementById('life').value);
      const inflationPct = parseFloat(document.getElementById('inflation').value);
      const nominalReturnPct = parseFloat(document.getElementById('ret').value);
      const desiredMonthly = parseFloat(document.getElementById('desiredMonthly').value);
      const retireAgeInput = document.getElementById('retireAge').value;
      const retireAge = retireAgeInput === '' ? age : parseFloat(retireAgeInput);

      if (Number.isNaN(age) || Number.isNaN(life) || Number.isNaN(inflationPct) || Number.isNaN(nominalReturnPct)) {
        showError('请输入有效数字。');
        return;
      }
      if (age < 0 || life <= 0 || life <= age) {
        showError('请检查年龄与预期寿命：预期寿命必须大于当前年龄。');
        return;
      }
      if (Number.isNaN(desiredMonthly) || desiredMonthly <= 0) {
        showError('请输入期望月开销（今日购买力）。');
        return;
      }

      const req = calculateRequiredCurrentSavingsForDesiredRealIncome({
        currentAgeYears: age,
        targetRetireAgeYears: retireAge,
        lifeExpectancyAgeYears: life,
        annualInflationRatePct: inflationPct,
        annualNominalReturnRatePct: nominalReturnPct,
        desiredMonthlyReal: desiredMonthly,
      });
      requiredEl.textContent = formatCurrency(req.requiredTodayReal);
      requiredAtRetireEl.textContent = formatCurrency(req.requiredAtRetireNominal);
      if (reverseGroup) reverseGroup.style.display = '';
    });
  }

  // 导出图表 PNG
  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      try {
        const link = document.createElement('a');
        link.download = 'financial-freedom-chart.png';
        link.href = chartCanvas.toDataURL('image/png');
        link.click();
      } catch (e) {
        showError('导出失败，请重试');
      }
    });
  }

  // 初始清空结果
  clearOutputs();
  // 设置默认年龄为 1995-01-12 出生对应的当前年龄
  setDefaultAgeFromDOB(defaults.dob);
  // 首次加载根据默认值绘图
  onSubmit(new Event('submit'));
});


