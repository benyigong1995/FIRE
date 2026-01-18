// 全局配置与常量
export const chartColorsLight = {
  asset: '#2563eb',
  income: '#16a34a',
  textPrimary: '#0f172a',
  textSecondary: '#1e293b',
  background: '#ffffff',
  tooltipBg: 'rgba(255,255,255,0.95)',
  tooltipBorder: '#cbd5e1',
};

export const chartColorsDark = {
  asset: '#60a5fa',
  income: '#4ade80',
  textPrimary: '#f1f5f9',
  textSecondary: '#94a3b8',
  background: '#0f172a',
  tooltipBg: 'rgba(30,41,59,0.95)',
  tooltipBorder: '#475569',
};

// 动态获取当前主题颜色
export function getChartColors() {
  const isDark = document.documentElement.getAttribute('data-theme') === 'dark';
  return isDark ? chartColorsDark : chartColorsLight;
}

export const chartFont = {
  titleSize: 16,
  titleWeight: '600',
  tickSize: 12,
  tickWeight: '500',
  legendSize: 13,
  legendWeight: '600',
  tooltipTitleSize: 13,
  tooltipTitleWeight: '700',
  tooltipBodySize: 12,
  tooltipBodyWeight: '500',
};

export const assetLogAxis = {
  min: 1e4,
  max: 1e8,
};

export const defaults = {
  dob: '1995-01-12',
};


