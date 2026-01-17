import { chartColors, chartFont, assetLogAxis } from './config.js';
import { formatCurrency, formatLargeNumber, formatWan } from './calc.js';

export function isPowerOfTen(val) {
  if (val <= 0 || !isFinite(val)) return false;
  const lg = Math.log10(val);
  return Math.abs(lg - Math.round(lg)) < 1e-8;
}

export function drawDualAxisChart({ canvas, labels, balanceRaw, incomeRaw, startAge }) {
  const startAgeMonths = Math.round(startAge * 12);

  // 固定资产轴范围，并对零值进行下限裁剪
  const yMinPow = assetLogAxis.min;
  const yMaxPow = assetLogAxis.max;
  const balanceData = balanceRaw.map(v => (v <= 0 ? yMinPow : Math.min(Math.max(v, yMinPow), yMaxPow)));

  const onlyPow10Ticks = {
    id: 'onlyPow10Ticks',
    beforeUpdate(chart) {
      const s = chart.scales && chart.scales['yAsset'];
      if (!s || !Array.isArray(s.ticks)) return;
      s.ticks = s.ticks.filter(t => isPowerOfTen(t.value));
    },
  };

  // 确保导出的 PNG 背景为白色（避免某些查看器显示为深色）
  const whiteBackground = {
    id: 'whiteBackground',
    beforeDraw(chart) {
      const { ctx, width, height } = chart;
      ctx.save();
      ctx.globalCompositeOperation = 'destination-over';
      ctx.fillStyle = '#ffffff';
      ctx.fillRect(0, 0, width, height);
      ctx.restore();
    },
  };

  return new Chart(canvas.getContext('2d'), {
    plugins: [onlyPow10Ticks, whiteBackground],
    type: 'line',
    data: {
      labels,
      datasets: [
        {
          label: '资产余额',
          data: balanceData,
          rawData: balanceRaw,
          fill: false,
          borderColor: chartColors.asset,
          backgroundColor: 'rgba(37, 99, 235, 0.2)',
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.1,
          yAxisID: 'yAsset',
        },
        {
          label: '月收入',
          data: incomeRaw,
          rawData: incomeRaw,
          fill: false,
          borderColor: chartColors.income,
          backgroundColor: 'rgba(22, 163, 74, 0.2)',
          borderWidth: 2,
          pointRadius: 0,
          tension: 0.1,
          yAxisID: 'yIncome',
        },
      ],
    },
    options: {
      responsive: true,
      maintainAspectRatio: false,
      layout: { padding: { right: 24 } },
      interaction: { mode: 'index', intersect: false },
      scales: {
        x: {
          title: { display: true, text: '年龄（岁）', color: chartColors.textPrimary, font: { size: chartFont.titleSize, weight: chartFont.titleWeight } },
          ticks: {
            autoSkip: false,
            minRotation: 0,
            maxRotation: 0,
            color: chartColors.textSecondary,
            font: { size: chartFont.tickSize, weight: chartFont.tickWeight },
            callback: (value, idx) => {
              const m = labels[idx];
              const months = Math.round(typeof m === 'number' ? m : parseFloat(m));
              if (!isFinite(months)) return '';
              const absMonths = startAgeMonths + months;
              const ageYears = Math.floor(absMonths / 12);
              const ageMonths = absMonths % 12;
              const startAgeInt = Math.floor(startAge);
              if (ageMonths !== 0) return '';
              if (ageYears % 5 !== 0 && ageYears !== startAgeInt) return '';
              return ageYears;
            },
          },
          grid: { display: false },
        },
        yIncome: {
          type: 'linear',
          position: 'left',
          title: { display: true, text: '月收入', color: chartColors.textPrimary, font: { size: chartFont.titleSize, weight: chartFont.titleWeight } },
          grid: { drawOnChartArea: true },
          ticks: {
            color: chartColors.textSecondary,
            font: { size: chartFont.tickSize, weight: chartFont.tickWeight },
            callback: (val) => formatLargeNumber(val),
          },
        },
        yAsset: {
          type: 'logarithmic',
          position: 'right',
          min: yMinPow,
          max: yMaxPow,
          title: { display: true, text: '资产余额', color: chartColors.textPrimary, padding: 20, font: { size: chartFont.titleSize, weight: chartFont.titleWeight } },
          grid: { drawOnChartArea: false, drawTicks: false, tickLength: 0 },
          ticks: {
            autoSkip: false,
            maxTicksLimit: 5,
            padding: 10,
            color: chartColors.textSecondary,
            font: { size: chartFont.tickSize, weight: chartFont.tickWeight },
            callback: (val) => {
              if (!isPowerOfTen(val)) return '';
              return formatLargeNumber(val);
            },
          },
        },
      },
      plugins: {
        legend: {
          display: true,
          labels: { color: chartColors.textPrimary, font: { size: chartFont.legendSize, weight: chartFont.legendWeight } },
        },
        tooltip: {
          backgroundColor: 'rgba(255,255,255,0.95)',
          borderColor: '#cbd5e1',
          borderWidth: 1,
          titleColor: chartColors.textPrimary,
          bodyColor: chartColors.textPrimary,
          titleFont: { size: chartFont.tooltipTitleSize, weight: chartFont.tooltipTitleWeight },
          bodyFont: { size: chartFont.tooltipBodySize, weight: chartFont.tooltipBodyWeight },
          padding: 10,
          displayColors: false,
          callbacks: {
            title: (items) => {
              const i = items && items[0] ? items[0].dataIndex : 0;
              const m = labels[i];
              const totalMonths = Math.round(typeof m === 'number' ? m : parseFloat(m));
              const absMonths = startAgeMonths + totalMonths;
              const years = Math.floor(absMonths / 12);
              const remMonths = absMonths % 12;
              return `年龄 ${years} 岁 ${remMonths} 个月`;
            },
            label: (ctx) => {
              const raw = ctx.dataset.rawData?.[ctx.dataIndex];
              if (ctx.dataset.yAxisID === 'yAsset') {
                if (raw != null && raw <= 0) {
                  return `${ctx.dataset.label}：已耗尽`;
                }
                const prettyWan = formatWan(raw != null ? raw : ctx.parsed.y);
                return `${ctx.dataset.label}：${prettyWan}`;
              }
              const pretty = formatCurrency(raw != null ? raw : ctx.parsed.y);
              return `${ctx.dataset.label}：${pretty}`;
            },
          },
        },
      },
    },
  });
}


