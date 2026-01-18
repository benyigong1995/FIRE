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

// 汇率缓存
let cnyToUsdRate = null;
let rateLastUpdated = null;

// 获取实时汇率（CNY to USD）
async function fetchExchangeRate() {
  try {
    // 使用免费的 exchangerate.host API
    const response = await fetch('https://api.exchangerate.host/latest?base=CNY&symbols=USD');
    const data = await response.json();
    if (data.success !== false && data.rates && data.rates.USD) {
      cnyToUsdRate = data.rates.USD;
      rateLastUpdated = new Date();
      console.log(`汇率更新: 1 CNY = ${cnyToUsdRate.toFixed(4)} USD`);
      return cnyToUsdRate;
    }
  } catch (e) {
    console.warn('获取汇率失败，尝试备用 API...');
  }
  
  // 备用 API
  try {
    const response = await fetch('https://api.exchangerate-api.com/v4/latest/CNY');
    const data = await response.json();
    if (data.rates && data.rates.USD) {
      cnyToUsdRate = data.rates.USD;
      rateLastUpdated = new Date();
      console.log(`汇率更新 (备用): 1 CNY = ${cnyToUsdRate.toFixed(4)} USD`);
      return cnyToUsdRate;
    }
  } catch (e) {
    console.warn('备用汇率 API 也失败了');
  }
  
  return null;
}

// 格式化美元金额
function formatUsd(cnyAmount) {
  if (!cnyToUsdRate || !isFinite(cnyAmount)) return '';
  const usd = cnyAmount * cnyToUsdRate;
  if (usd >= 1e6) return `≈ $${(usd / 1e6).toFixed(2)}M`;
  if (usd >= 1e3) return `≈ $${(usd / 1e3).toFixed(0)}K`;
  return `≈ $${usd.toFixed(0)}`;
}

// 更新汇率显示
function updateExchangeRateDisplay() {
  const el = document.getElementById('exchangeRateDisplay');
  if (!el) return;
  if (cnyToUsdRate) {
    const rateStr = (1 / cnyToUsdRate).toFixed(2); // 1 USD = ? CNY
    el.textContent = `(汇率: 1 USD = ${rateStr} CNY)`;
  } else {
    el.textContent = '';
  }
}

// URL 参数工具
function getUrlParams() {
  const params = new URLSearchParams(window.location.search);
  return {
    age: params.get('age'),
    savings: params.get('savings'),
    life: params.get('life'),
    inflation: params.get('inflation'),
    return: params.get('return'),
    desiredMonthly: params.get('desiredMonthly'),
    retireAge: params.get('retireAge'),
  };
}

function updateUrlParams(values) {
  const params = new URLSearchParams();
  // 使用 != null 检查以支持 0 值
  if (values.age != null) params.set('age', values.age);
  if (values.savings != null) params.set('savings', values.savings);
  if (values.life != null) params.set('life', values.life);
  if (values.inflation != null) params.set('inflation', values.inflation);
  if (values.return != null) params.set('return', values.return);
  if (values.desiredMonthly != null) params.set('desiredMonthly', values.desiredMonthly);
  if (values.retireAge != null) params.set('retireAge', values.retireAge);
  const newUrl = `${window.location.pathname}${params.toString() ? '?' + params.toString() : ''}`;
  window.history.replaceState({}, '', newUrl);
}

// 数据持久化
const STORAGE_KEY = 'fire_calculator_data';

function saveToLocalStorage(data) {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify(data));
  } catch (e) {
    console.warn('保存数据失败', e);
  }
}

function loadFromLocalStorage() {
  try {
    const saved = localStorage.getItem(STORAGE_KEY);
    return saved ? JSON.parse(saved) : null;
  } catch (e) {
    console.warn('读取数据失败', e);
    return null;
  }
}

// 暗色模式
function initDarkMode() {
  const toggle = document.getElementById('darkModeToggle');
  const saved = localStorage.getItem('darkMode');
  if (saved === 'true' || (!saved && window.matchMedia('(prefers-color-scheme: dark)').matches)) {
    document.documentElement.setAttribute('data-theme', 'dark');
    if (toggle) toggle.textContent = '☀️';
  }
  if (toggle) {
    toggle.addEventListener('click', () => {
      const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
      if (isDark) {
        document.documentElement.removeAttribute('data-theme');
        localStorage.setItem('darkMode', 'false');
        toggle.textContent = '🌙';
      } else {
        document.documentElement.setAttribute('data-theme', 'dark');
        localStorage.setItem('darkMode', 'true');
        toggle.textContent = '☀️';
      }
      // 切换主题后重新渲染图表
      const form = document.getElementById('calc-form');
      if (form) form.dispatchEvent(new Event('submit', { cancelable: true }));
    });
  }
}

document.addEventListener('DOMContentLoaded', () => {
  // 初始化暗色模式
  initDarkMode();
  // 页面加载时获取汇率
  fetchExchangeRate().then(() => updateExchangeRateDisplay());
  const form = document.getElementById('calc-form');
  const resetBtn = document.getElementById('reset');
  const monthlyEl = document.getElementById('monthly');
  const monthlyAnnualEl = document.getElementById('monthlyAnnual');
  const requiredEl = document.getElementById('requiredSavings');
  const requiredUsdEl = document.getElementById('requiredSavingsUsd');
  const requiredAtRetireEl = document.getElementById('requiredAtRetire');
  const requiredAtRetireUsdEl = document.getElementById('requiredAtRetireUsd');
  const reverseGroup = document.getElementById('reverseGroup');
  const reverseBtn = document.getElementById('reverseBtn');
  const chartCanvas = document.getElementById('balanceChart');
  const exportBtn = document.getElementById('exportPng');

  // 格式化提示元素
  const savingsInput = document.getElementById('savings');
  const savingsHint = document.getElementById('savingsHint');
  const desiredMonthlyInput = document.getElementById('desiredMonthly');
  const desiredMonthlyHint = document.getElementById('desiredMonthlyHint');

  let balanceChart = null;

  // 解析带千分位的数字
  function parseFormattedNumber(str) {
    if (!str) return NaN;
    return parseFloat(String(str).replace(/,/g, ''));
  }

  // 格式化为千分位
  function formatWithCommas(value) {
    const n = parseFormattedNumber(value);
    if (!isFinite(n)) return '';
    return n.toLocaleString('en-US');
  }

  // 格式化大数字为万/亿
  function formatHint(value) {
    const n = parseFormattedNumber(value);
    if (!isFinite(n) || n === 0) return '';
    const abs = Math.abs(n);
    if (abs >= 1e8) return `= ${(n / 1e8).toFixed(2).replace(/\.00$/, '')} 亿`;
    if (abs >= 1e4) return `= ${(n / 1e4).toFixed(2).replace(/\.00$/, '')} 万`;
    return '';
  }

  // 更新格式化提示
  function updateFormatHints() {
    if (savingsHint) savingsHint.textContent = formatHint(savingsInput.value);
    if (desiredMonthlyHint) desiredMonthlyHint.textContent = formatHint(desiredMonthlyInput?.value);
  }

  // 千分位输入框：始终保持千分位格式
  function setupMoneyInput(input) {
    if (!input) return;
    
    let lastValue = input.value;
    let lastCursor = 0;
    
    // 计算字符串中某位置左边有多少个数字
    function countDigitsBeforeCursor(str, cursor) {
      let count = 0;
      for (let i = 0; i < cursor && i < str.length; i++) {
        if (/\d/.test(str[i])) count++;
      }
      return count;
    }
    
    // 根据数字个数找到格式化后的光标位置
    function findCursorByDigitCount(str, digitCount) {
      let count = 0;
      for (let i = 0; i <= str.length; i++) {
        if (count === digitCount) return i;
        if (i < str.length && /\d/.test(str[i])) count++;
      }
      return str.length;
    }
    
    // 记录按键前的状态
    input.addEventListener('keydown', () => {
      lastValue = input.value;
      lastCursor = input.selectionStart;
    });
    
    input.addEventListener('input', () => {
      const cursorPos = input.selectionStart;
      const currentValue = input.value;
      
      // 计算当前光标左边有多少个数字
      let digitsBeforeCursor = countDigitsBeforeCursor(currentValue, cursorPos);
      
      // 检测是否是删除逗号的操作
      if (currentValue.length === lastValue.length - 1 && lastCursor > 0) {
        const deletedChar = lastValue[lastCursor - 1];
        if (deletedChar === ',') {
          // 删除逗号时，实际删除逗号左边的数字
          digitsBeforeCursor = countDigitsBeforeCursor(lastValue, lastCursor - 1) - 1;
          digitsBeforeCursor = Math.max(0, digitsBeforeCursor);
        }
      }
      
      // 只保留数字并格式化
      const raw = currentValue.replace(/[^\d]/g, '');
      
      // 如果删除的是逗号，不需要额外删除数字（逗号是装饰性的）
      // 直接使用 raw，格式化后逗号会自动正确放置
      const num = parseInt(raw, 10);
      
      if (raw === '' || isNaN(num)) {
        input.value = '';
      } else {
        input.value = num.toLocaleString('en-US');
      }
      
      // 根据数字个数定位光标
      const newCursor = findCursorByDigitCount(input.value, digitsBeforeCursor);
      input.setSelectionRange(newCursor, newCursor);
      
      updateFormatHints();
    });
    
    input.addEventListener('blur', () => {
      const formatted = formatWithCommas(input.value);
      if (formatted) input.value = formatted;
      updateFormatHints();
    });
  }

  setupMoneyInput(savingsInput);
  setupMoneyInput(desiredMonthlyInput);

  // 滑动条同步
  function setupSliderSync(numberId, sliderId) {
    const numberInput = document.getElementById(numberId);
    const sliderInput = document.getElementById(sliderId);
    if (!numberInput || !sliderInput) return;
    
    // 初始同步
    sliderInput.value = numberInput.value;
    
    // number -> slider
    numberInput.addEventListener('input', () => {
      sliderInput.value = numberInput.value;
    });
    
    // slider -> number，并实时计算
    sliderInput.addEventListener('input', () => {
      numberInput.value = sliderInput.value;
      // 触发计算
      onSubmit(new Event('submit'));
    });
  }
  
  setupSliderSync('inflation', 'inflationSlider');
  setupSliderSync('ret', 'retSlider');

  // 从 URL 参数或 localStorage 加载值（合并两者，URL 优先）
  function loadSavedData() {
    const params = getUrlParams();
    const stored = loadFromLocalStorage() || {};
    
    // 合并：localStorage 作为基础，URL 参数覆盖
    const data = {
      age: params.age ?? stored.age,
      savings: params.savings ?? stored.savings,
      life: params.life ?? stored.life,
      inflation: params.inflation ?? stored.inflation,
      return: params.return ?? stored.return,
      desiredMonthly: params.desiredMonthly ?? stored.desiredMonthly,
      retireAge: params.retireAge ?? stored.retireAge,
    };
    
    // 使用 != null 检查以支持 0 值
    if (data.age != null) document.getElementById('age').value = data.age;
    if (data.savings != null) {
      const num = parseInt(String(data.savings).replace(/,/g, ''), 10);
      if (!isNaN(num)) savingsInput.value = num.toLocaleString('en-US');
    }
    if (data.life != null) document.getElementById('life').value = data.life;
    if (data.inflation != null) {
      document.getElementById('inflation').value = data.inflation;
      const slider = document.getElementById('inflationSlider');
      if (slider) slider.value = data.inflation;
    }
    if (data.return != null) {
      document.getElementById('ret').value = data.return;
      const slider = document.getElementById('retSlider');
      if (slider) slider.value = data.return;
    }
    if (data.desiredMonthly != null) {
      const num = parseInt(String(data.desiredMonthly).replace(/,/g, ''), 10);
      if (!isNaN(num)) desiredMonthlyInput.value = num.toLocaleString('en-US');
    }
    if (data.retireAge != null) document.getElementById('retireAge').value = data.retireAge;
  }

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
    if (monthlyAnnualEl) monthlyAnnualEl.textContent = '';
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
    const savings = parseFormattedNumber(document.getElementById('savings').value);
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
    // 显示年度金额
    if (monthlyAnnualEl) {
      const annual = w * 12;
      monthlyAnnualEl.textContent = `≈ ${formatLargeNumber(annual)}/年`;
    }

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
    
    // 更新 URL 参数
    const dataToSave = {
      age: age,
      savings: savings,
      life: life,
      inflation: inflationPct,
      return: nominalReturnPct,
    };
    updateUrlParams(dataToSave);
    
    // 保存到 localStorage
    saveToLocalStorage(dataToSave);
  }

  function onReset() {
    // 原生reset已经触发，这里只做后续处理
    setTimeout(() => {
      // 恢复动态默认年龄（基于 DOB）
      setDefaultAgeFromDOB(defaults.dob);
      // 格式化金额输入框
      if (savingsInput) savingsInput.value = formatWithCommas(savingsInput.value);
      // 更新格式化提示
      updateFormatHints();
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
      const desiredMonthly = parseFormattedNumber(document.getElementById('desiredMonthly').value);
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
      if (Number.isNaN(retireAge) || !isFinite(retireAge)) {
        showError('请输入有效的目标退休年龄。');
        return;
      }
      if (retireAge < age) {
        showError('目标退休年龄不能小于当前年龄。');
        return;
      }
      if (retireAge >= life) {
        showError('目标退休年龄必须小于预期寿命。');
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
      // 用万/亿格式显示，更直观
      requiredEl.textContent = `约 ${formatLargeNumber(req.requiredTodayReal)}`;
      requiredAtRetireEl.textContent = `约 ${formatLargeNumber(req.requiredAtRetireNominal)}`;
      // 显示美元等值
      if (requiredUsdEl) requiredUsdEl.textContent = formatUsd(req.requiredTodayReal);
      if (requiredAtRetireUsdEl) requiredAtRetireUsdEl.textContent = formatUsd(req.requiredAtRetireNominal);
      if (reverseGroup) reverseGroup.style.display = '';
    });
  }

  // 分享面板
  const shareBtn = document.getElementById('shareBtn');
  const sharePanel = document.getElementById('sharePanel');
  const shareQrContainer = document.getElementById('shareQr');
  const shareTip = document.getElementById('shareTip');
  const copyLinkBtn = document.getElementById('copyLink');
  const shareWechatMomentsBtn = document.getElementById('shareWechatMoments');
  const shareWechatFriendBtn = document.getElementById('shareWechatFriend');
  const shareXiaohongshuBtn = document.getElementById('shareXiaohongshu');
  
  let qrGenerated = false;
  
  // 显示提示
  function showShareTip(msg) {
    if (!shareTip) return;
    shareTip.textContent = msg;
    shareTip.classList.add('active');
    setTimeout(() => shareTip.classList.remove('active'), 4000);
  }
  
  // 复制到剪贴板
  async function copyToClipboard(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      const input = document.createElement('input');
      input.value = text;
      document.body.appendChild(input);
      input.select();
      document.execCommand('copy');
      document.body.removeChild(input);
      return true;
    }
  }
  
  // 生成二维码
  function generateQR() {
    if (qrGenerated || !shareQrContainer || typeof QRCode === 'undefined') return;
    shareQrContainer.innerHTML = '';
    QRCode.toCanvas(window.location.href, {
      width: 140,
      margin: 2,
      color: {
        dark: document.documentElement.getAttribute('data-theme') === 'dark' ? '#f1f5f9' : '#0f172a',
        light: document.documentElement.getAttribute('data-theme') === 'dark' ? '#1e293b' : '#ffffff',
      }
    }, (err, canvas) => {
      if (!err && canvas) {
        shareQrContainer.appendChild(canvas);
        qrGenerated = true;
      }
    });
  }
  
  // 切换分享面板
  if (shareBtn && sharePanel) {
    shareBtn.addEventListener('click', (e) => {
      e.stopPropagation();
      const isActive = sharePanel.classList.contains('active');
      sharePanel.classList.toggle('active');
      if (!isActive) {
        qrGenerated = false;
        generateQR();
        if (shareTip) shareTip.classList.remove('active');
      }
    });
    
    // 点击外部关闭
    document.addEventListener('click', (e) => {
      if (!sharePanel.contains(e.target) && e.target !== shareBtn) {
        sharePanel.classList.remove('active');
      }
    });
  }
  
  // 复制链接
  if (copyLinkBtn) {
    copyLinkBtn.addEventListener('click', async () => {
      await copyToClipboard(window.location.href);
      const span = copyLinkBtn.querySelector('span:last-child');
      const original = span.textContent;
      span.textContent = '已复制!';
      setTimeout(() => { span.textContent = original; }, 2000);
    });
  }
  
  // 检测是否移动端
  const isMobile = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
  
  // 尝试系统分享（移动端）
  async function tryNativeShare(title, text) {
    if (navigator.share) {
      try {
        await navigator.share({
          title: title || '财务自由计算器',
          text: text || '算算你需要多少存款才能退休',
          url: window.location.href,
        });
        return true;
      } catch (e) {
        // 用户取消或不支持
        return false;
      }
    }
    return false;
  }
  
  // 微信朋友圈
  if (shareWechatMomentsBtn) {
    shareWechatMomentsBtn.addEventListener('click', async () => {
      if (isMobile) {
        const shared = await tryNativeShare('财务自由计算器', '算算你需要多少存款才能退休！');
        if (shared) return;
      }
      await copyToClipboard(window.location.href);
      showShareTip('✅ 链接已复制！打开微信 → 朋友圈 → 粘贴链接');
    });
  }
  
  // 微信好友
  if (shareWechatFriendBtn) {
    shareWechatFriendBtn.addEventListener('click', async () => {
      if (isMobile) {
        const shared = await tryNativeShare('财务自由计算器', '算算你需要多少存款才能退休！');
        if (shared) return;
      }
      await copyToClipboard(window.location.href);
      showShareTip('✅ 链接已复制！打开微信 → 发送给好友');
    });
  }
  
  // 小红书
  if (shareXiaohongshuBtn) {
    shareXiaohongshuBtn.addEventListener('click', async () => {
      const text = `财务自由计算器 📊 算算你需要多少存款才能退休！`;
      if (isMobile) {
        const shared = await tryNativeShare('财务自由计算器', text);
        if (shared) return;
      }
      await copyToClipboard(`${text}\n${window.location.href}`);
      showShareTip('✅ 已复制文案！打开小红书 → 发布笔记 → 粘贴');
    });
  }

  // 图片模态框
  const imageModal = document.getElementById('imageModal');
  const imageModalImg = document.getElementById('imageModalImg');
  const imageModalClose = document.getElementById('imageModalClose');
  
  if (imageModalClose && imageModal) {
    imageModalClose.addEventListener('click', () => {
      imageModal.classList.remove('active');
    });
  }

  // 导出增强版 PNG（带参数信息）
  if (exportBtn) {
    exportBtn.addEventListener('click', () => {
      try {
        // 获取当前参数
        const age = document.getElementById('age').value;
        const savings = parseFormattedNumber(savingsInput.value);
        const life = document.getElementById('life').value;
        const inflationPct = document.getElementById('inflation').value;
        const nominalReturnPct = document.getElementById('ret').value;
        const monthlyIncome = monthlyEl.textContent;
        const annualIncome = monthlyAnnualEl?.textContent || '';
        
        const now = new Date();
        const dateStr = `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
        const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
        
        // 检测移动端
        const isMobileDevice = /iPhone|iPad|iPod|Android/i.test(navigator.userAgent);
        
        // 创建画布 - 统一使用横版布局，更适合分享
        const padding = 40;
        const exportCanvas = document.createElement('canvas');
        const ctx = exportCanvas.getContext('2d');
        
        // 横版布局（移动端和桌面端统一）
        const headerHeight = 130;
        const footerHeight = 50;
        // 移动端导出时使用固定宽度，保证图表清晰
        const exportWidth = isMobileDevice ? 1200 : chartCanvas.width + padding * 2;
        const exportChartHeight = isMobileDevice ? 400 : chartCanvas.height;
        
        exportCanvas.width = exportWidth;
        exportCanvas.height = exportChartHeight + headerHeight + footerHeight + padding;
        
        // 背景
        ctx.fillStyle = isDark ? '#0f172a' : '#ffffff';
        ctx.fillRect(0, 0, exportCanvas.width, exportCanvas.height);
        
        // 标题
        ctx.fillStyle = isDark ? '#f1f5f9' : '#0f172a';
        ctx.font = 'bold 32px system-ui, -apple-system, sans-serif';
        ctx.fillText('财务自由计算器', padding, padding + 32);
        
        // 参数信息
        ctx.font = '18px system-ui, -apple-system, sans-serif';
        ctx.fillStyle = isDark ? '#94a3b8' : '#64748b';
        const paramsText = `年龄 ${age}岁 · 存款 ${formatLargeNumber(savings)} · 预期寿命 ${life}岁 · 通胀 ${inflationPct}% · 收益 ${nominalReturnPct}%`;
        ctx.fillText(paramsText, padding, padding + 65);
        
        // 核心结果
        ctx.font = 'bold 28px system-ui, -apple-system, sans-serif';
        ctx.fillStyle = isDark ? '#22c55e' : '#047857';
        ctx.fillText(`每月可支配: ${monthlyIncome}`, padding, padding + 105);
        
        ctx.font = '20px system-ui, -apple-system, sans-serif';
        ctx.fillStyle = isDark ? '#4ade80' : '#059669';
        ctx.fillText(annualIncome, padding + 380, padding + 105);
        
        // 绘制图表
        const chartW = exportWidth - padding * 2;
        const chartH = exportChartHeight;
        ctx.drawImage(chartCanvas, padding, headerHeight, chartW, chartH);
        
        // 底部水印
        const footerY = headerHeight + exportChartHeight + padding;
        ctx.font = '16px system-ui, -apple-system, sans-serif';
        ctx.fillStyle = isDark ? '#64748b' : '#94a3b8';
        ctx.fillText('fire-zeta.vercel.app', padding, footerY);
        ctx.textAlign = 'right';
        ctx.fillText(dateStr, exportCanvas.width - padding, footerY);
        ctx.textAlign = 'left';

        // 导出图片
        const dataUrl = exportCanvas.toDataURL('image/png');
        const fileName = `FIRE-${age}岁-${formatLargeNumber(savings)}-${dateStr}.png`;
        
        if (isMobileDevice) {
          // 移动端：使用模态框显示图片
          if (imageModal && imageModalImg) {
            imageModalImg.src = dataUrl;
            imageModal.classList.add('active');
          }
        } else {
          // 桌面端：直接下载
          const link = document.createElement('a');
          link.download = fileName;
          link.href = dataUrl;
          link.click();
        }
      } catch (e) {
        console.error(e);
        showError('导出失败，请重试');
      }
    });
  }

  // 初始清空结果
  clearOutputs();
  // 设置默认年龄为 1995-01-12 出生对应的当前年龄
  setDefaultAgeFromDOB(defaults.dob);
  // 从 URL 参数或 localStorage 加载（覆盖默认值）
  loadSavedData();
  // 初始化格式化提示
  updateFormatHints();
  // 首次加载根据默认值绘图
  onSubmit(new Event('submit'));
});


