import React, { useState, useEffect, useRef } from 'react';
import {
  Download,
  Copy,
  Check,
  ChevronDown,
  ChevronRight,
  Terminal,
  Play,
  FileSpreadsheet,
  RefreshCw,
  FolderArchive,
  BarChart2,
  Table as TableIcon,
  Code2,
  Search,
  Calendar,
  Layers,
} from 'lucide-react';
import {
  TimeframeId,
  TimeframeConfig,
  KlineRow,
  TickerFetchResult,
  FetchApiResponse,
  SearchSuggestion,
} from './types';

// 数据维度与热门跨度配置字典 (严格遵循交易员常见使用场景)
export const TIMEFRAMES: Record<TimeframeId, TimeframeConfig> = {
  '1d': {
    id: '1d',
    label: '日线',
    shortLabel: '1D',
    description: '标准日K线，适合中短期波段与趋势研判',
    defaultPeriod: '3mo',
    defaultLimit: 60, // 约60交易日(经典季度波段)
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
    defaultLimit: 52, // 52周(整年结构)
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
    defaultLimit: 120, // 约120小时(主要交易时段波段)
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
    defaultPeriod: '5d',
    defaultLimit: 150, // 约2个交易日的高频线
    hasTime: true,
    periods: [
      { value: '1d', label: '1天 (当天日内分时 - 约78根)' },
      { value: '5d', label: '5天 (热门一周分时 - 约390根)', isPopular: true },
      { value: '1mo', label: '1个月 (分时最长有效范围)' },
    ],
  },
};

/**
 * 清理标的代码，避免生成文件名时出现非法字符
 * 原逻辑: re.sub(r'[\\/*?:"<>|=]', '_', ticker)
 */
function cleanTickerName(ticker: string): string {
  return ticker.replace(/[\\/*?:"<>|=]/g, '_');
}

/**
 * 格式化时间戳
 * 日线/周线: YYYY-MM-DD
 * 1小时/5分钟分时: YYYY-MM-DD HH:mm
 */
function formatKLineDate(timestampSec: number, hasTime: boolean): string {
  const d = new Date(timestampSec * 1000);
  const pad = (n: number) => String(n).padStart(2, '0');
  const yyyy = d.getFullYear();
  const mm = pad(d.getMonth() + 1);
  const dd = pad(d.getDate());

  if (!hasTime) {
    return `${yyyy}-${mm}-${dd}`;
  }
  const hh = pad(d.getHours());
  const min = pad(d.getMinutes());
  return `${yyyy}-${mm}-${dd} ${hh}:${min}`;
}

/**
 * 抓取单个标的并清洗数据，严格执行交易员指标规范:
 * - 支持 1d, 1wk, 1h, 5m 多维度
 * - 时间跨度 range 随维度自适应
 * - 条数截取按交易员常用习惯或全量获取
 * - Open, High, Low, Close 保留 2 位小数
 */
async function fetchTickerData(
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

      // 截取交易员常用经典条数
      const rows =
        allRows.length > timeframeConfig.defaultLimit
          ? allRows.slice(-timeframeConfig.defaultLimit)
          : allRows;

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

export default function App() {
  // 基础表单状态：默认列表为空，用户自主输入或检索
  const [tickersInput, setTickersInput] = useState<string>('');
  const [selectedInterval, setSelectedInterval] = useState<TimeframeId>('1d');
  const [period, setPeriod] = useState<string>(TIMEFRAMES['1d'].defaultPeriod);

  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [fetchResponse, setFetchResponse] = useState<FetchApiResponse | null>(null);
  const [expandedTickers, setExpandedTickers] = useState<Record<string, boolean>>({});
  const [viewModes, setViewModes] = useState<Record<string, 'table' | 'csv' | 'chart'>>({});
  const [copiedTicker, setCopiedTicker] = useState<string | null>(null);

  // 搜索自动补全状态
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [showDropdown, setShowDropdown] = useState<boolean>(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  // 当切换数据维度时，自动联动更新时间跨度至该维度推荐的热门跨度
  const handleSelectTimeframe = (newInterval: TimeframeId) => {
    setSelectedInterval(newInterval);
    const newConfig = TIMEFRAMES[newInterval];
    setPeriod(newConfig.defaultPeriod);
  };

  // 点击外部关闭搜索下拉菜单
  useEffect(() => {
    function handleClickOutside(event: MouseEvent) {
      if (
        searchContainerRef.current &&
        !searchContainerRef.current.contains(event.target as Node)
      ) {
        setShowDropdown(false);
      }
    }
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  // 智能联想搜索美股代码 (TSM, NVDA, AAPL 等)
  useEffect(() => {
    if (!searchQuery.trim()) {
      setSuggestions([]);
      return;
    }

    const timer = setTimeout(async () => {
      setIsSearching(true);
      try {
        const query = searchQuery.trim();
        const res = await fetch(`/api/yahoo/v1/finance/search?q=${encodeURIComponent(query)}`);
        if (res.ok) {
          const json = await res.json();
          const quotes = json?.quotes || [];
          setSuggestions(quotes.slice(0, 6));
          setShowDropdown(true);
        }
      } catch (err) {
        console.error('Search error:', err);
      } finally {
        setIsSearching(false);
      }
    }, 250);

    return () => clearTimeout(timer);
  }, [searchQuery]);

  // 从建议中快速添加代码
  const handleSelectSuggestion = (item: SearchSuggestion) => {
    const sym = item.symbol.toUpperCase();
    const currentList = tickersInput
      .split(/[,，;\s\n]+/)
      .map((t) => t.trim().toUpperCase())
      .filter(Boolean);

    if (!currentList.includes(sym)) {
      currentList.push(sym);
      setTickersInput(currentList.join(', '));
    }
    setSearchQuery('');
    setShowDropdown(false);
  };

  // 执行抓取任务
  const handleExecuteFetch = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    const effectiveTickersStr = tickersInput.trim();
    if (!effectiveTickersStr) {
      alert('请先输入或通过上方搜索添加要抓取的标的代码 (例如 TSM, NVDA)');
      return;
    }

    setIsLoading(true);

    // 智能切分：支持英文逗号、中文逗号、分号、空格和换行
    const targetTickers = effectiveTickersStr
      .split(/[,，;\s\n]+/)
      .map((t) => t.trim().toUpperCase())
      .filter(Boolean);

    if (targetTickers.length === 0) {
      alert('请输入有效的标的代码');
      setIsLoading(false);
      return;
    }

    const currentTfConfig = TIMEFRAMES[selectedInterval];
    const logs: string[] = [];
    logs.push(
      `本次运行抓取标的: [${targetTickers.map((t) => `'${t}'`).join(', ')}] | 维度: ${
        currentTfConfig.label
      } (${selectedInterval}) | 时间跨度: ${period} | 提取最新常用 ${currentTfConfig.defaultLimit} 根K线`
    );

    const results: TickerFetchResult[] = [];
    const initialExpanded: Record<string, boolean> = {};
    const initialViews: Record<string, 'table' | 'csv' | 'chart'> = {};

    for (const ticker of targetTickers) {
      logs.push(`正在抓取 ${ticker} ...`);
      const result = await fetchTickerData(ticker, selectedInterval, period);
      if (!result.success) {
        logs.push(`⚠️ 标的 ${ticker} 未获取到有效数据 (${result.error})`);
      } else {
        logs.push(`✓ 标的 ${ticker} 抓取成功 (${result.rows.length} 根蜡烛)`);
      }
      results.push(result);
      initialExpanded[ticker] = true;
      initialViews[ticker] = 'table';
    }

    logs.push(`全部标的抓取完成，数据已生成 CSV 并在下方展示。`);

    setFetchResponse({
      success: true,
      targetTickers,
      interval: selectedInterval,
      period,
      logs,
      results,
    });
    setExpandedTickers(initialExpanded);
    setViewModes(initialViews);
    setIsLoading(false);
  };

  // 切换折叠卡片状态
  const toggleExpand = (ticker: string) => {
    setExpandedTickers((prev) => ({
      ...prev,
      [ticker]: !prev[ticker],
    }));
  };

  // 复制 CSV 文本
  const handleCopyCsv = (ticker: string, csvText: string) => {
    navigator.clipboard.writeText(csvText);
    setCopiedTicker(ticker);
    setTimeout(() => setCopiedTicker(null), 2000);
  };

  // 下载单个 CSV
  const handleDownloadSingle = (fileName: string, csvText: string) => {
    const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  // 一键下载全部 CSV
  const handleDownloadAll = () => {
    if (!fetchResponse?.results) return;
    fetchResponse.results.forEach((item, index) => {
      if (item.success && item.csvText) {
        setTimeout(() => {
          handleDownloadSingle(item.fileName, item.csvText);
        }, index * 250);
      }
    });
  };

  const parsedCurrentTickers = tickersInput
    .split(/[,，;\s\n]+/)
    .map((t) => t.trim().toUpperCase())
    .filter(Boolean);

  const activeTf = TIMEFRAMES[selectedInterval];

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 flex flex-col font-sans selection:bg-indigo-600 selection:text-white">
      {/* Header */}
      <header className="border-b border-slate-800 bg-slate-900/80 px-6 py-4 backdrop-blur sticky top-0 z-20">
        <div className="max-w-5xl mx-auto flex flex-wrap items-center justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl bg-indigo-600 flex items-center justify-center shadow-lg shadow-indigo-600/30">
              <FileSpreadsheet className="w-5 h-5 text-white" />
            </div>
            <div>
              <h1 className="text-lg font-bold text-white tracking-tight flex items-center gap-2">
                market-kline-fetcher
                <span className="text-[11px] px-2 py-0.5 rounded bg-indigo-500/10 text-indigo-400 border border-indigo-500/20 font-mono">
                  多维度版
                </span>
              </h1>
              <p className="text-xs text-slate-400">
                多周期行情 K 线数据抓取与汇总工具 (日线 · 周线 · 1小时 · 5分钟)
              </p>
            </div>
          </div>

          {fetchResponse && (
            <div className="flex items-center gap-2 text-xs text-slate-400 bg-slate-950 px-3 py-1.5 rounded-lg border border-slate-800 font-mono">
              <FolderArchive className="w-4 h-4 text-emerald-400" />
              <span>
                成功处理{' '}
                <strong className="text-white">
                  {fetchResponse.results.filter((r) => r.success).length}
                </strong>{' '}
                / {fetchResponse.targetTickers.length} 个标的
              </span>
            </div>
          )}
        </div>
      </header>

      {/* Main Content */}
      <main className="flex-1 max-w-5xl w-full mx-auto p-4 sm:p-6 space-y-6">
        {/* 参数配置与触发卡片 */}
        <section className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xl space-y-5">
          <div className="flex items-center justify-between border-b border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Terminal className="w-4 h-4 text-indigo-400" />
              <h2 className="text-sm font-bold text-white uppercase tracking-wider">
                抓取任务参数配置 (Inputs)
              </h2>
            </div>
            <span className="text-xs text-slate-500">
              多维度自由切换 · 热门时间跨度智能联动
            </span>
          </div>

          {/* 1. 智能代码搜索框 (Smart Ticker Search) */}
          <div ref={searchContainerRef} className="relative space-y-1.5">
            <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
              <Search className="w-3.5 h-3.5 text-indigo-400" />
              <span>智能搜索美股/ETF/期货代码:</span>
              <span className="text-[11px] font-normal text-slate-400">
                (输入 TSM、台积电、NVDA、AAPL 快速检索添加)
              </span>
            </label>

            <div className="relative">
              <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
                onFocus={() => {
                  if (suggestions.length > 0) setShowDropdown(true);
                }}
                placeholder="键入标的代码或公司名称搜索，如: TSM (台积电), AAPL, NVDA..."
                className="w-full pl-10 pr-10 py-2.5 rounded-xl bg-slate-950 border border-slate-700/80 text-sm font-mono text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition shadow-inner"
              />
              {isSearching && (
                <RefreshCw className="w-4 h-4 text-indigo-400 animate-spin absolute right-3.5 top-1/2 -translate-y-1/2" />
              )}
            </div>

            {/* 智能联想下拉列表 */}
            {showDropdown && suggestions.length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-1.5 z-30 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden divide-y divide-slate-800">
                {suggestions.map((item) => {
                  const alreadyAdded = parsedCurrentTickers.includes(item.symbol.toUpperCase());
                  return (
                    <div
                      key={item.symbol}
                      onClick={() => handleSelectSuggestion(item)}
                      className="px-4 py-2.5 hover:bg-slate-800 cursor-pointer flex items-center justify-between text-xs transition"
                    >
                      <div className="space-y-0.5">
                        <div className="flex items-center gap-2">
                          <span className="font-bold font-mono text-white text-sm">
                            {item.symbol}
                          </span>
                          <span className="px-1.5 py-0.5 rounded text-[10px] bg-indigo-500/20 text-indigo-300 font-mono">
                            {item.exchDisp || '美股'}
                          </span>
                          {item.typeDisp && (
                            <span className="text-[10px] text-slate-400 font-mono">
                              {item.typeDisp}
                            </span>
                          )}
                        </div>
                        <p className="text-slate-300 text-[11px] line-clamp-1">
                          {item.longname || item.shortname || item.symbol}
                        </p>
                      </div>

                      <button
                        type="button"
                        className={`flex items-center gap-1 px-2.5 py-1 rounded text-xs font-medium transition ${
                          alreadyAdded
                            ? 'bg-slate-800 text-slate-400'
                            : 'bg-indigo-600 hover:bg-indigo-500 text-white'
                        }`}
                      >
                        {alreadyAdded ? '已在列表' : '+ 添加'}
                      </button>
                    </div>
                  );
                })}
              </div>
            )}
          </div>

          <form onSubmit={handleExecuteFetch} className="space-y-4 pt-1">
            {/* 2. 标的代码输入框 */}
            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
                <span>标的代码列表 (tickers):</span>
                {tickersInput.trim() && (
                  <button
                    type="button"
                    onClick={() => setTickersInput('')}
                    className="text-[11px] text-slate-400 hover:text-rose-400 transition"
                  >
                    清空列表
                  </button>
                )}
              </label>
              <input
                type="text"
                value={tickersInput}
                onChange={(e) => setTickersInput(e.target.value)}
                placeholder="请输入标的代码，如: TSM, NVDA, AAPL (支持搜索添加或手动输入，逗号分隔)"
                className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm font-mono text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition shadow-inner"
              />
              <p className="text-[11px] text-slate-500">
                支持中英文逗号、分号及空格分隔，例如输入{' '}
                <code className="text-indigo-300 font-mono">TSM, NVDA</code>。
              </p>
            </div>

            {/* 3. 数据维度与时间跨度配置栅格 (二列紧凑布局) */}
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4 pt-1">
              {/* 数据维度选择 (分段切换选项卡) */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <Layers className="w-3.5 h-3.5 text-indigo-400" />
                  <span>数据维度 (Interval):</span>
                </label>
                <div className="grid grid-cols-4 gap-1 p-1 bg-slate-950 border border-slate-800 rounded-xl">
                  {(Object.keys(TIMEFRAMES) as TimeframeId[]).map((tfKey) => {
                    const tf = TIMEFRAMES[tfKey];
                    const isSelected = selectedInterval === tfKey;
                    return (
                      <button
                        key={tfKey}
                        type="button"
                        onClick={() => handleSelectTimeframe(tfKey)}
                        className={`py-2 px-1 text-center rounded-lg text-xs font-semibold transition cursor-pointer ${
                          isSelected
                            ? 'bg-indigo-600 text-white shadow-md'
                            : 'text-slate-400 hover:text-slate-200 hover:bg-slate-900'
                        }`}
                      >
                        <div>{tf.label}</div>
                        <div className="text-[10px] opacity-75 font-mono">{tf.shortLabel}</div>
                      </button>
                    );
                  })}
                </div>
                <p className="text-[11px] text-slate-400">
                  {activeTf.description} (提取最新常用 ~{activeTf.defaultLimit} 根)
                </p>
              </div>

              {/* 联动时间跨度选择 */}
              <div className="space-y-2">
                <label className="text-xs font-semibold text-slate-300 flex items-center gap-1.5">
                  <Calendar className="w-3.5 h-3.5 text-indigo-400" />
                  <span>
                    热门时间跨度 (Period):
                    <span className="text-[10px] text-indigo-400 ml-1">根据维度自动联动</span>
                  </span>
                </label>
                <select
                  value={period}
                  onChange={(e) => setPeriod(e.target.value)}
                  className="w-full px-3.5 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm font-mono text-white focus:outline-none focus:border-indigo-500 transition shadow-inner"
                >
                  {activeTf.periods.map((opt) => (
                    <option key={opt.value} value={opt.value}>
                      {opt.label} {opt.isPopular ? '★ 热门推荐' : ''}
                    </option>
                  ))}
                </select>
                <p className="text-[11px] text-slate-500">
                  当前维度接口有效跨度，已过滤超限周期。
                </p>
              </div>
            </div>

            {/* Run Button */}
            <div className="flex items-center justify-between pt-3 border-t border-slate-800/80">
              <div className="text-xs text-slate-400">
                抓取维度: <strong className="text-white">{activeTf.label}</strong> · 跨度:{' '}
                <strong className="text-white">{period}</strong> · 导出格式:{' '}
                <code className="text-indigo-300 font-mono">
                  {'{ticker}'}_{selectedInterval}_kline.csv
                </code>
              </div>

              <button
                type="submit"
                disabled={isLoading}
                className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:scale-95 disabled:opacity-50 text-white text-sm font-semibold shadow-lg shadow-indigo-600/30 transition cursor-pointer"
              >
                {isLoading ? (
                  <>
                    <RefreshCw className="w-4 h-4 animate-spin" />
                    <span>正在抓取中...</span>
                  </>
                ) : (
                  <>
                    <Play className="w-4 h-4 fill-current" />
                    <span>执行抓取任务 (Run)</span>
                  </>
                )}
              </button>
            </div>
          </form>
        </section>

        {/* 运行终端日志输出 */}
        {fetchResponse && (
          <section className="bg-slate-950 border border-slate-800 rounded-2xl p-4 shadow-lg">
            <div className="flex items-center justify-between pb-2 mb-2 border-b border-slate-800/80 text-xs text-slate-400">
              <span className="flex items-center gap-1.5 font-mono">
                <Terminal className="w-3.5 h-3.5 text-indigo-400" />
                执行日志 (Execution Output)
              </span>
              <span className="text-[11px] text-emerald-400 font-mono">✓ 任务完成</span>
            </div>
            <div className="font-mono text-xs text-slate-300 space-y-1 max-h-36 overflow-y-auto leading-relaxed">
              {fetchResponse.logs.map((line, idx) => (
                <div
                  key={idx}
                  className={
                    line.includes('⚠️')
                      ? 'text-amber-400'
                      : line.includes('全部标的抓取完成')
                      ? 'text-emerald-400 font-semibold'
                      : 'text-slate-300'
                  }
                >
                  {line}
                </div>
              ))}
            </div>
          </section>
        )}

        {/* 抓取结果汇总与折叠卡片列表 */}
        {fetchResponse && (
          <section className="space-y-4">
            {/* 汇总标题栏 */}
            <div className="flex flex-wrap items-center justify-between gap-3 bg-slate-900 border border-slate-800 px-5 py-3.5 rounded-2xl">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  📊 K 线数据汇总 (维度: {TIMEFRAMES[fetchResponse.interval]?.label} · 跨度:{' '}
                  {fetchResponse.period})
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  共处理 {fetchResponse.targetTickers.length} 个标的， 成功获取{' '}
                  <span className="text-emerald-400 font-bold font-mono">
                    {fetchResponse.results.filter((r) => r.success).length}
                  </span>{' '}
                  个标的数据 · 提取各标的最新常用{' '}
                  {TIMEFRAMES[fetchResponse.interval]?.defaultLimit} 根 K 线
                </p>
              </div>

              <button
                onClick={handleDownloadAll}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl bg-emerald-600 hover:bg-emerald-500 text-white text-xs font-semibold shadow-md transition"
              >
                <Download className="w-4 h-4" />
                打包下载全部 CSV
              </button>
            </div>

            {/* 逐个标的的折叠展示卡片 */}
            <div className="space-y-3">
              {fetchResponse.results.map((item) => {
                const isExpanded = !!expandedTickers[item.ticker];
                const viewMode = viewModes[item.ticker] || 'table';

                return (
                  <div
                    key={item.ticker}
                    className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-lg transition"
                  >
                    {/* 折叠头部 */}
                    <div
                      onClick={() => toggleExpand(item.ticker)}
                      className="flex items-center justify-between px-5 py-3.5 cursor-pointer bg-slate-900 hover:bg-slate-850 transition select-none"
                    >
                      <div className="flex items-center gap-2.5">
                        {isExpanded ? (
                          <ChevronDown className="w-4 h-4 text-slate-400" />
                        ) : (
                          <ChevronRight className="w-4 h-4 text-slate-400" />
                        )}
                        <span className="font-bold text-sm text-white font-mono">
                          点击展开查看：{item.ticker}
                        </span>
                        {item.success ? (
                          <span className="text-[11px] px-2 py-0.5 rounded bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 font-mono">
                            {item.rows.length} 根蜡烛 ({TIMEFRAMES[item.interval]?.shortLabel})
                          </span>
                        ) : (
                          <span className="text-[11px] px-2 py-0.5 rounded bg-rose-500/10 text-rose-400 border border-rose-500/20 font-mono">
                            无有效数据
                          </span>
                        )}
                      </div>

                      <div className="flex items-center gap-3 text-xs text-slate-400">
                        <span className="font-mono text-slate-500 hidden sm:inline">
                          {item.fileName}
                        </span>
                        {item.success && (
                          <div
                            className="flex items-center gap-1.5"
                            onClick={(e) => e.stopPropagation()}
                          >
                            <button
                              onClick={() => handleDownloadSingle(item.fileName, item.csvText)}
                              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition"
                              title="下载 CSV"
                            >
                              <Download className="w-3.5 h-3.5" />
                            </button>
                            <button
                              onClick={() => handleCopyCsv(item.ticker, item.csvText)}
                              className="p-1.5 rounded-lg bg-slate-800 hover:bg-slate-700 text-slate-300 hover:text-white transition"
                              title="复制 CSV"
                            >
                              {copiedTicker === item.ticker ? (
                                <Check className="w-3.5 h-3.5 text-emerald-400" />
                              ) : (
                                <Copy className="w-3.5 h-3.5" />
                              )}
                            </button>
                          </div>
                        )}
                      </div>
                    </div>

                    {/* 展开内容 */}
                    {isExpanded && (
                      <div className="border-t border-slate-800 p-5 space-y-4 bg-slate-950/40">
                        {item.success ? (
                          <>
                            {/* 工具栏: 视图切换 & 操作 */}
                            <div className="flex flex-wrap items-center justify-between gap-3 text-xs">
                              <div className="flex items-center bg-slate-900 p-1 rounded-xl border border-slate-800">
                                <button
                                  onClick={() =>
                                    setViewModes((prev) => ({
                                      ...prev,
                                      [item.ticker]: 'table',
                                    }))
                                  }
                                  className={`flex items-center gap-1.5 px-3 py-1 rounded-lg transition ${
                                    viewMode === 'table'
                                      ? 'bg-indigo-600 text-white font-medium'
                                      : 'text-slate-400 hover:text-slate-200'
                                  }`}
                                >
                                  <TableIcon className="w-3.5 h-3.5" />
                                  表格视图
                                </button>
                                <button
                                  onClick={() =>
                                    setViewModes((prev) => ({
                                      ...prev,
                                      [item.ticker]: 'csv',
                                    }))
                                  }
                                  className={`flex items-center gap-1.5 px-3 py-1 rounded-lg transition ${
                                    viewMode === 'csv'
                                      ? 'bg-indigo-600 text-white font-medium'
                                      : 'text-slate-400 hover:text-slate-200'
                                  }`}
                                >
                                  <Code2 className="w-3.5 h-3.5" />
                                  原始 CSV 代码
                                </button>
                                <button
                                  onClick={() =>
                                    setViewModes((prev) => ({
                                      ...prev,
                                      [item.ticker]: 'chart',
                                    }))
                                  }
                                  className={`flex items-center gap-1.5 px-3 py-1 rounded-lg transition ${
                                    viewMode === 'chart'
                                      ? 'bg-indigo-600 text-white font-medium'
                                      : 'text-slate-400 hover:text-slate-200'
                                  }`}
                                >
                                  <BarChart2 className="w-3.5 h-3.5" />
                                  走势图预览
                                </button>
                              </div>

                              <div className="flex items-center gap-2">
                                <button
                                  onClick={() => handleCopyCsv(item.ticker, item.csvText)}
                                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-900 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white transition"
                                >
                                  {copiedTicker === item.ticker ? (
                                    <>
                                      <Check className="w-3.5 h-3.5 text-emerald-400" />
                                      已复制 CSV
                                    </>
                                  ) : (
                                    <>
                                      <Copy className="w-3.5 h-3.5" />
                                      复制 CSV
                                    </>
                                  )}
                                </button>
                                <button
                                  onClick={() =>
                                    handleDownloadSingle(item.fileName, item.csvText)
                                  }
                                  className="flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white transition font-medium"
                                >
                                  <Download className="w-3.5 h-3.5" />
                                  下载 {item.fileName}
                                </button>
                              </div>
                            </div>

                            {/* 1. 表格视图 */}
                            {viewMode === 'table' && (
                              <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950">
                                <table className="w-full text-left text-xs font-mono">
                                  <thead className="bg-slate-900/90 text-slate-400 border-b border-slate-800 uppercase text-[11px]">
                                    <tr>
                                      <th className="py-2.5 px-4 font-semibold">Date / Time</th>
                                      <th className="py-2.5 px-3 font-semibold">Open</th>
                                      <th className="py-2.5 px-3 font-semibold">High</th>
                                      <th className="py-2.5 px-3 font-semibold">Low</th>
                                      <th className="py-2.5 px-3 font-semibold">Close</th>
                                      <th className="py-2.5 px-3 font-semibold">Volume</th>
                                    </tr>
                                  </thead>
                                  <tbody className="divide-y divide-slate-850 text-slate-300">
                                    {item.rows.map((r, rIdx) => {
                                      const isUp = r.Close >= r.Open;
                                      return (
                                        <tr key={rIdx} className="hover:bg-slate-900/40 transition">
                                          <td className="py-2 px-4 whitespace-nowrap text-slate-400 tabular-nums">
                                            {r.Date}
                                          </td>
                                          <td className="py-2 px-3 whitespace-nowrap tabular-nums">
                                            {r.Open.toFixed(2)}
                                          </td>
                                          <td className="py-2 px-3 whitespace-nowrap text-emerald-400 tabular-nums">
                                            {r.High.toFixed(2)}
                                          </td>
                                          <td className="py-2 px-3 whitespace-nowrap text-rose-400 tabular-nums">
                                            {r.Low.toFixed(2)}
                                          </td>
                                          <td
                                            className={`py-2 px-3 whitespace-nowrap font-bold tabular-nums ${
                                              isUp ? 'text-emerald-400' : 'text-rose-400'
                                            }`}
                                          >
                                            {r.Close.toFixed(2)}
                                          </td>
                                          <td className="py-2 px-3 whitespace-nowrap text-amber-300 tabular-nums">
                                            {r.Volume.toLocaleString()}
                                          </td>
                                        </tr>
                                      );
                                    })}
                                  </tbody>
                                </table>
                              </div>
                            )}

                            {/* 2. 原始 CSV 代码块 */}
                            {viewMode === 'csv' && (
                              <div className="relative">
                                <pre className="p-4 rounded-xl bg-slate-950 border border-slate-800 font-mono text-xs text-slate-300 overflow-x-auto max-h-80 leading-relaxed selection:bg-indigo-600/30">
                                  {item.csvText}
                                </pre>
                              </div>
                            )}

                            {/* 3. 走势图预览 */}
                            {viewMode === 'chart' && (
                              <div className="bg-slate-950 p-4 rounded-xl border border-slate-800">
                                <div className="text-xs text-slate-400 mb-2 font-mono flex items-center justify-between">
                                  <span>
                                    {item.ticker} ({TIMEFRAMES[item.interval]?.label}) 最近{' '}
                                    {item.rows.length} 根 K 线走势
                                  </span>
                                  <span className="text-emerald-400">
                                    最新收盘价: $
                                    {item.rows[item.rows.length - 1]?.Close.toFixed(2)}
                                  </span>
                                </div>
                                <MiniCandleChart rows={item.rows} />
                              </div>
                            )}
                          </>
                        ) : (
                          <div className="p-4 text-center text-xs text-rose-400">
                            ⚠️ {item.error || '未获取到有效数据'}
                          </div>
                        )}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {/* 首次未执行时的提示介绍 */}
        {!fetchResponse && !isLoading && (
          <div className="bg-slate-900/60 border border-slate-800/80 rounded-2xl p-8 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-indigo-600/10 border border-indigo-600/20 text-indigo-400 flex items-center justify-center mx-auto">
              <FileSpreadsheet className="w-6 h-6" />
            </div>
            <h3 className="text-base font-bold text-white">输入代码并选择维度后点击「执行抓取」</h3>
            <p className="text-xs text-slate-400 max-w-md mx-auto">
              可在上方搜索框搜索美股标的（如 TSM, NVDA, AAPL），选择日线、周线、1小时或5分钟维度，
              时间跨度将自动联动为该维度热门参数。
            </p>
          </div>
        )}
      </main>

      {/* Footer */}
      <footer className="border-t border-slate-800/80 py-4 px-6 text-center text-xs text-slate-500">
        market-kline-fetcher · 多维度行情 K 线抓取与规范导出
      </footer>
    </div>
  );
}

// 简明纯 SVG 日/周/分时 K 线走势图
function MiniCandleChart({ rows }: { rows: KlineRow[] }) {
  if (rows.length === 0) return null;

  const minPrice = Math.min(...rows.map((r) => r.Low));
  const maxPrice = Math.max(...rows.map((r) => r.High));
  const range = maxPrice - minPrice || 1;

  const width = 800;
  const height = 220;
  const paddingX = 10;
  const paddingY = 20;

  const chartW = width - paddingX * 2;
  const chartH = height - paddingY * 2;
  const barSlot = chartW / rows.length;
  const barW = Math.max(2, barSlot * 0.7);

  const priceToY = (p: number) => {
    return paddingY + chartH - ((p - minPrice) / range) * chartH;
  };

  return (
    <div className="w-full overflow-x-auto">
      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-56 block">
        {/* Horizontal grid lines */}
        {[0, 0.25, 0.5, 0.75, 1].map((pct, idx) => {
          const y = paddingY + chartH * pct;
          const price = maxPrice - pct * range;
          return (
            <g key={idx}>
              <line
                x1={paddingX}
                y1={y}
                x2={width - paddingX}
                y2={y}
                stroke="#1e293b"
                strokeDasharray="4,4"
              />
              <text x={paddingX + 4} y={y - 4} fill="#64748b" fontSize="9" fontFamily="monospace">
                ${price.toFixed(2)}
              </text>
            </g>
          );
        })}

        {/* Candlesticks */}
        {rows.map((r, i) => {
          const x = paddingX + i * barSlot + barSlot / 2;
          const openY = priceToY(r.Open);
          const closeY = priceToY(r.Close);
          const highY = priceToY(r.High);
          const lowY = priceToY(r.Low);

          const isUp = r.Close >= r.Open;
          const color = isUp ? '#10b981' : '#f43f5e';
          const bodyTop = Math.min(openY, closeY);
          const bodyH = Math.max(Math.abs(closeY - openY), 1.5);

          return (
            <g key={i}>
              <line x1={x} y1={highY} x2={x} y2={lowY} stroke={color} strokeWidth="1.2" />
              <rect
                x={x - barW / 2}
                y={bodyTop}
                width={barW}
                height={bodyH}
                fill={color}
                rx="1"
              />
            </g>
          );
        })}
      </svg>
    </div>
  );
}
