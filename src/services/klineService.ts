import {
  TimeframeId,
  TimeframeConfig,
  KlineRow,
  TickerFetchResult,
} from '../types';

export const STORAGE_KEY_PROMPT_PREFIX = 'kline_analysis_prompt_prefix_v1';

export const DEFAULT_PROMPT_PREFIX = `# Role & Persona

You are a top-tier Quantitative Prop Trader and Senior Market Microstructure Analyst. You operate with absolute objectivity, relying purely on mathematical rigor, price action, and volume dynamics. You have zero emotional bias.

# Core Objective

Deconstruct the provided market data (OHLCV CSVs, order flow, or historical price action) to identify institutional footprints, structural turning points, and asymmetric risk-reward setups. Deliver concrete, executable trading blueprints.

# Analytical Engines

When processing any market data, sequentially execute the following analyses:

1. Microstructure & Liquidity Mapping:

Identify liquidity vacuums, multi-test structural floors/ceilings, and gap dynamics (e.g., breakaway gaps vs. exhaustion gaps).

Track shifts in market phases (accumulation, markup, distribution, markdown) and validate them against recent swing highs/lows.

2. Advanced Volume-Price Analysis (VPA):

Correlate volume expansions/contractions with price movement to detect hidden institutional accumulation or distribution.

Flag anomalies: "Effort vs. Result" divergences, capitulation climax volumes, and "Volume Dry-ups" near key resistance/support.

Distinguish authentic institutional breakouts from low-volume bull/bear traps and liquidity sweeps.

3. Statistical & Dynamic Anchors:

Evaluate price action relative to dynamic institutional baselines (e.g., Anchored VWAP from key macro events, volume spikes, or cycle highs/lows).

Analyze volatility profiles, retracement depth (e.g., Fibonacci overlays on primary impulses), and time-based price capitulation.

4. Institutional Risk Management Protocol:

Formulate strict conditional execution trees (e.g., "If Price breaches X on Volume > Y, execute Z").

Define exact entry parameters, non-negotiable hard stop-loss (invalidation) levels, and dynamic trailing-stop mechanisms (e.g., scaling out at Tier 1, moving to breakeven).

Calculate precise Risk:Reward ratios, mandating asymmetric setups.

# Output Directives

- Tone: Cold, authoritative, surgical, and data-driven. Never use comforting cliches.

- Structure: Use clear Markdown headings, concise bullet points, and data-backed justifications.

- Mandate: Never provide vague advice (e.g., "watch the market closely"). Every conclusion must be tethered to a specific price level, percentage, or volume metric provided in the prompt.`;

// 数据维度与热门跨度配置字典 (严格遵循交易员常见使用场景)
export const TIMEFRAMES: Record<TimeframeId, TimeframeConfig> = {
  '1d': {
    id: '1d',
    label: '日线',
    shortLabel: '1D',
    description: '标准日K线，适合中短期波段与宏观趋势研判',
    defaultPeriod: '3mo',
    defaultLimit: 60,
    hasTime: false,
    periods: [
      { value: '1mo', label: '1个月 (约22交易日)' },
      { value: '3mo', label: '3个月 (热门季度波段 - 约60交易日)', isPopular: true },
      { value: '6mo', label: '6个月 (半年跨度 - 约125交易日)' },
      { value: '1y', label: '1年 (经典年线视角 - 约250交易日)' },
      { value: '2y', label: '2年 (中长期宏观跨度)' },
    ],
  },
  '1wk': {
    id: '1wk',
    label: '周线',
    shortLabel: '1W',
    description: '周K线大级别，滤除日内噪音，把握中长线大趋势',
    defaultPeriod: '1y',
    defaultLimit: 52,
    hasTime: false,
    periods: [
      { value: '6mo', label: '6个月 (约26周)' },
      { value: '1y', label: '1年 (热门年度结构 - 约52周)', isPopular: true },
      { value: '2y', label: '2年 (中期牛熊 - 约104周)' },
      { value: '5y', label: '5年 (大级别周期)' },
      { value: 'max', label: '全部历史 (Max)' },
    ],
  },
  '1h': {
    id: '1h',
    label: '1小时',
    shortLabel: '1H',
    description: '分时小时线，适合数天至数周的波段切入与拐点确认',
    defaultPeriod: '1mo',
    defaultLimit: 120,
    hasTime: true,
    periods: [
      { value: '5d', label: '5天 (近一周日内结构 - 约35小时)' },
      { value: '1mo', label: '1个月 (热门中短分时 - 约140小时)', isPopular: true },
      { value: '3mo', label: '3个月 (完整波段分时)' },
      { value: '6mo', label: '6个月 (中线分时跨度)' },
      { value: '1y', label: '1年 (接口上限历史分时)' },
    ],
  },
  '5m': {
    id: '5m',
    label: '5分钟',
    shortLabel: '5M',
    description: '高频日内分时K线，用于超短线精准择时与盘中监控',
    defaultPeriod: '1d',
    defaultLimit: 150,
    hasTime: true,
    periods: [
      { value: '1d', label: '1天 (当天日内全部分时 - 约79根)', isPopular: true },
      { value: '5d', label: '5天 (热门一周分时 - 约390根)' },
      { value: '1mo', label: '1个月 (分时最长有效范围)' },
    ],
  },
};

/**
 * 清理标的代码，避免生成文件名时出现非法字符
 */
export function cleanTickerName(ticker: string): string {
  return ticker.replace(/[\\/*?:"<>|=]/g, '_');
}

/**
 * 格式化时间戳为美东时间 (America/New_York，严格对齐美股 09:30 - 16:00 交易时钟)
 * 日线/周线: YYYY-MM-DD
 * 1小时/5分钟分时: YYYY-MM-DD HH:mm
 */
export function formatKLineDate(timestampSec: number, hasTime: boolean): string {
  const date = new Date(timestampSec * 1000);

  const parts = new Intl.DateTimeFormat('en-US', {
    timeZone: 'America/New_York',
    year: 'numeric',
    month: '2-digit',
    day: '2-digit',
    hour: hasTime ? '2-digit' : undefined,
    minute: hasTime ? '2-digit' : undefined,
    hour12: false,
  }).formatToParts(date);

  const y = parts.find((p) => p.type === 'year')?.value;
  const m = parts.find((p) => p.type === 'month')?.value;
  const d = parts.find((p) => p.type === 'day')?.value;

  if (!hasTime) {
    return `${y}-${m}-${d}`;
  }

  let hh = parts.find((p) => p.type === 'hour')?.value || '00';
  if (hh === '24') hh = '00';
  const mm = parts.find((p) => p.type === 'minute')?.value || '00';

  return `${y}-${m}-${d} ${hh}:${mm}`;
}

/**
 * 抓取单个标的并清洗数据，严格执行交易员指标规范:
 * - 统一美东时间 (America/New_York)
 * - Open, High, Low, Close 保留 2 位小数
 * - 保留完整所选跨度的数据（首根对齐 09:30）
 */
export async function fetchTickerData(
  ticker: string,
  interval: TimeframeId,
  period: string
): Promise<TickerFetchResult> {
  const safeName = cleanTickerName(ticker);
  const fileName = `${safeName}_${interval}_kline.csv`;
  const timeframeConfig = TIMEFRAMES[interval];

  const proxyEndpoints = [
    `/api/yahoo/v8/finance/chart/${encodeURIComponent(ticker)}?interval=${interval}&range=${encodeURIComponent(period)}`,
    `https://corsproxy.io/?url=${encodeURIComponent(
      `https://query1.finance.yahoo.com/v8/finance/chart/${ticker}?interval=${interval}&range=${period}`
    )}`,
  ];

  let lastError = '';

  for (const url of proxyEndpoints) {
    try {
      const res = await fetch(url, {
        headers: { Accept: 'application/json' },
        signal: AbortSignal.timeout(9000),
      });

      if (!res.ok) {
        lastError = `HTTP ${res.status}`;
        continue;
      }

      const json = await res.json();
      const result = json?.chart?.result?.[0];
      if (!result || !result.timestamp || result.timestamp.length === 0) {
        lastError = `标的 ${ticker} 未获取到有效数据`;
        continue;
      }

      const timestamps: number[] = result.timestamp;
      const quote = result.indicators?.quote?.[0] || {};
      const opens: number[] = quote.open || [];
      const highs: number[] = quote.high || [];
      const lows: number[] = quote.low || [];
      const closes: number[] = quote.close || [];
      const volumes: number[] = quote.volume || [];

      const allRows: KlineRow[] = [];
      for (let i = 0; i < timestamps.length; i++) {
        const o = opens[i];
        const h = highs[i];
        const l = lows[i];
        const c = closes[i];
        const v = volumes[i];

        if (o == null || h == null || l == null || c == null) continue;

        const dateStr = formatKLineDate(timestamps[i], timeframeConfig.hasTime);
        allRows.push({
          Date: dateStr,
          Open: Math.round(o * 100) / 100,
          High: Math.round(h * 100) / 100,
          Low: Math.round(l * 100) / 100,
          Close: Math.round(c * 100) / 100,
          Volume: v != null ? Math.round(v) : 0,
        });
      }

      if (allRows.length === 0) {
        lastError = `标的 ${ticker} 数据为空`;
        continue;
      }

      // 完整保留所选跨度的数据，确保分时首根从 09:30 开盘时刻起算
      const rows = allRows;

      // 生成标准 CSV 内容
      const csvHeader = 'Date,Open,High,Low,Close,Volume';
      const csvLines = rows.map(
        (r) =>
          `${r.Date},${r.Open.toFixed(2)},${r.High.toFixed(2)},${r.Low.toFixed(2)},${r.Close.toFixed(2)},${r.Volume}`
      );
      const csvText = [csvHeader, ...csvLines].join('\n');

      return {
        ticker,
        safeName,
        fileName,
        interval,
        period,
        success: true,
        csvText,
        rows,
      };
    } catch (err: any) {
      lastError = err.message || '网络请求超时';
    }
  }

  return {
    ticker,
    safeName,
    fileName,
    interval,
    period,
    success: false,
    error: lastError || `标的 ${ticker} 获取失败`,
    csvText: '',
    rows: [],
  };
}

export interface PromptDatasetItem {
  interval: TimeframeId;
  label: string;
  period: string;
  periodLabel: string;
  result: TickerFetchResult;
}

/**
 * 组装专业量化分析 Prompt
 */
export function composeAnalysisPrompt(
  ticker: string,
  prefix: string,
  items: PromptDatasetItem[]
): string {
  const cleanPrefix = prefix.trim();
  const upperTicker = ticker.toUpperCase().trim();

  const sections: string[] = [];
  sections.push(cleanPrefix);
  sections.push('\n---\n');
  sections.push(`# Target Market Asset: ${upperTicker}`);
  sections.push(`*Multi-Timeframe Market Microstructure & Volume Profile Feed (Timezone: America/New_York / EST/EDT)*\n`);

  items.forEach((item, index) => {
    const num = index + 1;
    const { interval, label, period, periodLabel, result } = item;
    const rowCount = result.success ? result.rows.length : 0;
    const latestPrice =
      result.success && result.rows.length > 0
        ? `$${result.rows[result.rows.length - 1].Close.toFixed(2)}`
        : 'N/A';

    sections.push(
      `## ${num}. ${label} K-Line Data (${interval.toUpperCase()} | Range: ${period} / ${periodLabel} | Total Bars: ${rowCount} | Latest: ${latestPrice})\n`
    );

    if (result.success && result.csvText) {
      sections.push('```csv\n' + result.csvText + '\n```\n');
    } else {
      sections.push(`*Note: Data fetch incomplete for ${interval} (${result.error || 'No data'}).*\n`);
    }
  });

  sections.push(
    `# Execution Instruction\n` +
      `Execute the 4 Analytical Engines sequentially for ${upperTicker} based strictly on the provided multi-timeframe OHLCV dataset above. Highlight key institutional order flow, dynamic liquidity levels, and concrete trade setups with invalidation criteria.`
  );

  return sections.join('\n');
}

/**
 * 组装纯多周期数据集合 (不带 Prompt 前缀，仅包含数据集合的纯 CSV)
 */
export function composePureDataCsv(
  ticker: string,
  items: PromptDatasetItem[]
): string {
  const upperTicker = ticker.toUpperCase().trim();
  const sections: string[] = [];

  sections.push(`# Asset: ${upperTicker}`);
  sections.push(`# Timezone: America/New_York (EST/EDT)`);
  sections.push('');

  items.forEach((item, index) => {
    const num = index + 1;
    const { interval, label, period, periodLabel, result } = item;
    const rowCount = result.success ? result.rows.length : 0;

    sections.push(
      `### [${num}] ${label} (${interval.toUpperCase()} | Range: ${period} / ${periodLabel} | Bars: ${rowCount})`
    );
    if (result.success && result.csvText) {
      sections.push(result.csvText);
    } else {
      sections.push(`Date,Open,High,Low,Close,Volume\n# Error: ${result.error || 'No data'}`);
    }
    sections.push('');
  });

  return sections.join('\n').trim();
}

