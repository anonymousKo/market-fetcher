import React, { useState, useEffect, useRef } from 'react';
import {
  Clock,
  Plus,
  Trash2,
  Download,
  Play,
  RotateCcw,
  Check,
  Search,
  RefreshCw,
  FolderArchive,
  Layers,
  FileCode,
  CheckCircle2,
  AlertCircle,
  Folder,
} from 'lucide-react';
import { SearchSuggestion, TimeframeId, TickerFetchResult } from '../types';
import { TIMEFRAMES, fetchTickerData } from '../services/klineService';

export interface WatchlistTimeframeConfig {
  interval: TimeframeId;
  period: string;
  label: string;
  enabled: boolean;
}

export interface WatchlistConfig {
  version: string;
  folder_structure: string;
  schedule: {
    description: string;
    cron: string;
    timezone: string;
  };
  timeframes: WatchlistTimeframeConfig[];
  tickers: string[];
  output_dir: string;
}

const STORAGE_KEY_WATCHLIST = 'market_kline_watchlist_config_v1';

const DEFAULT_CONFIG: WatchlistConfig = {
  version: '1.1.0',
  folder_structure: 'by_ticker',
  schedule: {
    description: '美股收盘后每日定时自动抓取 (周一至周五 美东时间 16:30 / UTC 20:30)',
    cron: '30 20 * * 1-5',
    timezone: 'America/New_York',
  },
  timeframes: [
    {
      interval: '1d',
      period: '3mo',
      label: '日线 3个月',
      enabled: true,
    },
    {
      interval: '1h',
      period: '1mo',
      label: '1小时 1个月',
      enabled: true,
    },
    {
      interval: '5m',
      period: '1d',
      label: '5分钟 1天',
      enabled: false,
    },
  ],
  tickers: ['TSM', 'NVDA', 'AAPL', 'MU', 'SOXQ'],
  output_dir: 'kline_data',
};

const POPULAR_RECOMMENDATIONS = [
  { symbol: 'TSM', name: '台积电' },
  { symbol: 'NVDA', name: '英伟达' },
  { symbol: 'AAPL', name: '苹果' },
  { symbol: 'MU', name: '美光科技' },
  { symbol: 'SOXQ', name: '半导体ETF' },
  { symbol: '3033.HK', name: '南方恒生科技' },
  { symbol: 'MSFT', name: '微软' },
  { symbol: 'GC=F', name: '黄金期货' },
];

export function WatchlistManager() {
  const [config, setConfig] = useState<WatchlistConfig>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_WATCHLIST);
      if (saved) {
        const parsed = JSON.parse(saved);
        if (parsed.tickers && parsed.timeframes) {
          return {
            ...DEFAULT_CONFIG,
            ...parsed,
          };
        }
      }
    } catch (e) {}
    return DEFAULT_CONFIG;
  });

  const [inputTicker, setInputTicker] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [showDropdown, setShowDropdown] = useState<boolean>(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  const [saveStatus, setSaveStatus] = useState<string | null>(null);

  // 本地测试运行状态
  const [isTesting, setIsTesting] = useState<boolean>(false);
  const [testProgress, setTestProgress] = useState<string>('');
  const [testResults, setTestResults] = useState<
    Array<{
      ticker: string;
      interval: TimeframeId;
      period: string;
      path: string;
      result: TickerFetchResult;
    }>
  >([]);
  const [showConfigJson, setShowConfigJson] = useState<boolean>(false);

  // 点击外部关闭搜索下拉
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

  // 搜索自动补全
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



  // 添加标的
  const handleAddTicker = (symbolToAdd: string) => {
    const cleanSym = symbolToAdd.trim().toUpperCase();
    if (!cleanSym) return;

    if (config.tickers.includes(cleanSym)) {
      alert(`标的 ${cleanSym} 已在自选列表中`);
      return;
    }

    const updated = {
      ...config,
      tickers: [...config.tickers, cleanSym],
    };
    setConfig(updated);
    saveToLocalStorage(updated);
    setInputTicker('');
    setSearchQuery('');
    setShowDropdown(false);
  };

  // 删除标的
  const handleRemoveTicker = (symToRemove: string) => {
    const updated = {
      ...config,
      tickers: config.tickers.filter((t) => t !== symToRemove),
    };
    setConfig(updated);
    saveToLocalStorage(updated);
  };

  // 修改维度周期
  const handleTimeframePeriodChange = (interval: TimeframeId, newPeriod: string) => {
    const updatedTimeframes = config.timeframes.map((tf) => {
      if (tf.interval === interval) {
        const opt = TIMEFRAMES[interval]?.periods.find((p) => p.value === newPeriod);
        return {
          ...tf,
          period: newPeriod,
          label: `${TIMEFRAMES[interval]?.label} ${opt?.label || newPeriod}`,
        };
      }
      return tf;
    });

    const updated = {
      ...config,
      timeframes: updatedTimeframes,
    };
    setConfig(updated);
    saveToLocalStorage(updated);
  };

  // 启用/禁用维度
  const handleTimeframeToggle = (interval: TimeframeId) => {
    const updatedTimeframes = config.timeframes.map((tf) => {
      if (tf.interval === interval) {
        return {
          ...tf,
          enabled: !tf.enabled,
        };
      }
      return tf;
    });

    if (updatedTimeframes.every((tf) => !tf.enabled)) {
      alert('请至少保留一个启用的监控维度');
      return;
    }

    const updated = {
      ...config,
      timeframes: updatedTimeframes,
    };
    setConfig(updated);
    saveToLocalStorage(updated);
  };

  const saveToLocalStorage = (newConfig: WatchlistConfig) => {
    try {
      localStorage.setItem(STORAGE_KEY_WATCHLIST, JSON.stringify(newConfig, null, 2));
      setSaveStatus('配置已保存');
      setTimeout(() => setSaveStatus(null), 2000);
    } catch (e) {}
  };

  // 恢复系统默认配置
  const handleResetDefault = () => {
    if (confirm('确认将自选股票和维度配置恢复为系统推荐默认值（日线3个月 + 1小时1个月）吗？')) {
      setConfig(DEFAULT_CONFIG);
      saveToLocalStorage(DEFAULT_CONFIG);
      setSaveStatus('已恢复默认配置');
      setTimeout(() => setSaveStatus(null), 2000);
    }
  };

  // 下载 JSON 配置文件
  const handleDownloadConfigJson = () => {
    const jsonStr = JSON.stringify(config, null, 2);
    const blob = new Blob([jsonStr], { type: 'application/json;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = 'watchlist_config.json';
    a.click();
    URL.revokeObjectURL(url);
  };

  // 在浏览器中立即执行模拟抓取测试
  const handleRunBrowserTest = async () => {
    const activeTfs = config.timeframes.filter((tf) => tf.enabled);
    if (config.tickers.length === 0) {
      alert('自选股票列表为空，请先添加标的代码');
      return;
    }
    if (activeTfs.length === 0) {
      alert('请至少启用一个监控维度');
      return;
    }

    setIsTesting(true);
    setTestResults([]);

    const results: Array<{
      ticker: string;
      interval: TimeframeId;
      period: string;
      path: string;
      result: TickerFetchResult;
    }> = [];

    const totalTasks = config.tickers.length * activeTfs.length;
    let completed = 0;

    for (const ticker of config.tickers) {
      for (const tf of activeTfs) {
        setTestProgress(`正在抓取 ${ticker} (${tf.interval} · ${tf.period}) [${completed + 1}/${totalTasks}]...`);
        const res = await fetchTickerData(ticker, tf.interval, tf.period);
        const safeName = ticker.replace(/[\\/*?:"<>|=]/g, '_');
        const path = `kline_data/${safeName}/${tf.interval}_kline.csv`;
        results.push({
          ticker,
          interval: tf.interval,
          period: tf.period,
          path,
          result: res,
        });
        completed++;
      }
    }

    setTestResults(results);
    setTestProgress(`模拟抓取完成！共生成 ${completed} 个子文件夹与独立文件`);
    setIsTesting(false);
  };

  const handleDownloadSingleResult = (path: string, csvText: string) => {
    const fileName = path.split('/').join('_');
    const blob = new Blob([csvText], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = fileName;
    a.click();
    URL.revokeObjectURL(url);
  };

  const activeTimeframes = config.timeframes.filter((tf) => tf.enabled);

  return (
    <div className="space-y-6">
      {/* 头部简介与 GitHub Action 状态 */}
      <section className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xl space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
          <div className="space-y-1">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Folder className="w-5 h-5 text-indigo-400" />
              自选股票监控 · 按股票分文件夹与独立链接
            </h2>
            <p className="text-xs text-slate-400">
              采用 <code className="text-indigo-300 font-mono">kline_data/{'{ticker}'}/{'{interval}'}_kline.csv</code> 结构存储，
              每天美股收盘后由 GitHub Actions 自动提交推送，每个文件均拥有永久独立的 GitHub 浏览与直链。
            </p>
          </div>

          <div className="flex items-center gap-2">
            {saveStatus && (
              <span className="text-xs text-emerald-400 font-medium animate-pulse">
                ✓ {saveStatus}
              </span>
            )}
            <button
              type="button"
              onClick={handleDownloadConfigJson}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white text-xs font-medium transition cursor-pointer"
              title="下载 watchlist_config.json 配置文件"
            >
              <Download className="w-3.5 h-3.5 text-indigo-400" />
              <span>导出 config.json</span>
            </button>
            <button
              type="button"
              onClick={handleResetDefault}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-400 hover:text-rose-400 text-xs font-medium transition cursor-pointer"
              title="恢复系统默认配置"
            >
              <RotateCcw className="w-3.5 h-3.5" />
              <span>恢复默认</span>
            </button>
          </div>
        </div>


        {/* 1. 监控维度与周期设置 (默认: 日线 3个月 + 1小时 1个月) */}
        <div className="space-y-3 pt-1">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
              <Layers className="w-4 h-4 text-indigo-400" />
              <span>1. 监控维度与时间区间配置 (默认: 日线3个月 · 1小时1个月)</span>
            </label>
            <span className="text-[11px] text-slate-500">
              数据首根严格以美东 09:30 开盘时刻起算
            </span>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
            {config.timeframes.map((tf) => {
              const tfConfig = TIMEFRAMES[tf.interval];
              return (
                <div
                  key={tf.interval}
                  className={`p-4 rounded-xl border transition space-y-3 ${
                    tf.enabled
                      ? 'bg-slate-950 border-indigo-500/40 shadow-sm'
                      : 'bg-slate-950/40 border-slate-800 opacity-60'
                  }`}
                >
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <input
                        type="checkbox"
                        id={`tf-${tf.interval}`}
                        checked={tf.enabled}
                        onChange={() => handleTimeframeToggle(tf.interval)}
                        className="rounded border-slate-700 bg-slate-900 text-indigo-600 focus:ring-0 cursor-pointer w-4 h-4"
                      />
                      <label
                        htmlFor={`tf-${tf.interval}`}
                        className="text-xs font-bold text-white cursor-pointer flex items-center gap-1.5 font-mono"
                      >
                        <span>{tfConfig.label}</span>
                        <span className="text-[10px] text-indigo-400 bg-indigo-500/10 px-1.5 py-0.5 rounded">
                          {tf.interval}_kline.csv
                        </span>
                      </label>
                    </div>

                    <span className="text-[10px] text-slate-500 font-mono">
                      {tf.enabled ? '已启用' : '未启用'}
                    </span>
                  </div>

                  <div className="space-y-1">
                    <label className="text-[11px] text-slate-400">时间区间 (Period):</label>
                    <select
                      value={tf.period}
                      disabled={!tf.enabled}
                      onChange={(e) => handleTimeframePeriodChange(tf.interval, e.target.value)}
                      className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs font-mono text-white focus:outline-none focus:border-indigo-500 disabled:opacity-50"
                    >
                      {tfConfig.periods.map((p) => (
                        <option key={p.value} value={p.value}>
                          {p.label}
                        </option>
                      ))}
                    </select>
                  </div>
                </div>
              );
            })}
          </div>
        </div>

        {/* 2. 自选股票列表管理 */}
        <div className="space-y-3 pt-2 border-t border-slate-800">
          <div className="flex items-center justify-between">
            <label className="text-xs font-bold text-white uppercase tracking-wider flex items-center gap-1.5">
              <Search className="w-4 h-4 text-indigo-400" />
              <span>2. 自选股票列表 (每个标的将建立独立文件夹)</span>
            </label>
            <span className="text-xs text-indigo-400 font-mono">
              当前共 {config.tickers.length} 个标的
            </span>
          </div>

          {/* 添加输入框与自动补全 */}
          <div className="relative" ref={searchContainerRef}>
            <div className="flex gap-2">
              <div className="relative flex-1">
                <Search className="w-4 h-4 text-slate-500 absolute left-3.5 top-1/2 -translate-y-1/2" />
                <input
                  type="text"
                  value={inputTicker}
                  onChange={(e) => {
                    setInputTicker(e.target.value);
                    setSearchQuery(e.target.value);
                  }}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      e.preventDefault();
                      handleAddTicker(inputTicker);
                    }
                  }}
                  placeholder="输入代码或公司名添加至自选 (如 TSM, NVDA, AAPL, 3033.HK)..."
                  className="w-full pl-10 pr-4 py-2.5 rounded-xl bg-slate-950 border border-slate-800 text-sm font-mono text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition shadow-inner uppercase"
                />
              </div>

              <button
                type="button"
                onClick={() => handleAddTicker(inputTicker)}
                disabled={!inputTicker.trim()}
                className="flex items-center gap-1.5 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 disabled:opacity-50 text-white text-xs font-semibold shadow-md transition cursor-pointer"
              >
                <Plus className="w-4 h-4" />
                <span>添加标的</span>
              </button>
            </div>

            {/* 自动补全浮层 */}
            {showDropdown && suggestions.length > 0 && (
              <div className="absolute left-0 right-0 top-full mt-1.5 z-30 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden divide-y divide-slate-800">
                {suggestions.map((item) => (
                  <div
                    key={item.symbol}
                    onClick={() => handleAddTicker(item.symbol)}
                    className="px-4 py-2.5 hover:bg-slate-800 cursor-pointer flex items-center justify-between text-xs transition"
                  >
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold font-mono text-white text-sm">
                          {item.symbol}
                        </span>
                        <span className="px-1.5 py-0.5 rounded text-[10px] bg-indigo-500/20 text-indigo-300 font-mono">
                          {item.exchDisp || '股票'}
                        </span>
                      </div>
                      <p className="text-slate-300 text-[11px] line-clamp-1">
                        {item.longname || item.shortname || item.symbol}
                      </p>
                    </div>
                    <button
                      type="button"
                      className="px-2.5 py-1 rounded text-xs bg-indigo-600 text-white font-medium hover:bg-indigo-500 transition"
                    >
                      + 加入自选
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 热门自选快捷点选 */}
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-400">
            <span className="text-[11px] text-slate-500">热门快捷加入:</span>
            {POPULAR_RECOMMENDATIONS.map((item) => {
              const isAdded = config.tickers.includes(item.symbol);
              return (
                <button
                  key={item.symbol}
                  type="button"
                  onClick={() => !isAdded && handleAddTicker(item.symbol)}
                  disabled={isAdded}
                  className={`px-2.5 py-1 rounded-lg border text-xs font-mono transition ${
                    isAdded
                      ? 'bg-slate-950 border-slate-850 text-slate-600 cursor-default'
                      : 'bg-slate-950 border-slate-800 text-slate-300 hover:text-white hover:border-slate-700 cursor-pointer'
                  }`}
                >
                  <span>{item.symbol}</span>
                  <span className="text-[10px] ml-1 opacity-70">({item.name})</span>
                  {isAdded && <span className="ml-1 text-emerald-500">✓</span>}
                </button>
              );
            })}
          </div>

          {/* 自选股票卡片列表 */}
          <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-5 gap-2.5 pt-2">
            {config.tickers.map((ticker) => (
              <div
                key={ticker}
                className="flex items-center justify-between p-3 rounded-xl bg-slate-950 border border-slate-800 hover:border-slate-700 transition group"
              >
                <div className="space-y-0.5">
                  <span className="font-bold font-mono text-sm text-white flex items-center gap-1">
                    <Folder className="w-3.5 h-3.5 text-indigo-400" />
                    {ticker}
                  </span>
                  <span className="text-[10px] text-slate-500 font-mono">
                    {activeTimeframes.map((tf) => `${tf.interval}`).join(', ')}
                  </span>
                </div>

                <button
                  type="button"
                  onClick={() => handleRemoveTicker(ticker)}
                  className="p-1 rounded-lg text-slate-500 hover:text-rose-400 hover:bg-slate-900 transition opacity-80 group-hover:opacity-100"
                  title={`从自选中移除 ${ticker}`}
                >
                  <Trash2 className="w-3.5 h-3.5" />
                </button>
              </div>
            ))}
          </div>
        </div>


        {/* 底部操作与模拟运行 */}
        <div className="flex flex-wrap items-center justify-between gap-3 pt-3 border-t border-slate-800">
          <div className="text-xs text-slate-400">
            监控统计: <strong className="text-white">{config.tickers.length}</strong> 个独立文件夹 ·{' '}
            <strong className="text-white">{activeTimeframes.length}</strong> 个维度 · 共生成{' '}
            <strong className="text-indigo-300 font-mono">
              {config.tickers.length * activeTimeframes.length}
            </strong>{' '}
            个带独立直链的 CSV 文件
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              onClick={handleRunBrowserTest}
              disabled={isTesting || config.tickers.length === 0}
              className="flex items-center gap-2 px-5 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:scale-95 disabled:opacity-50 text-white text-xs font-semibold shadow-lg shadow-indigo-600/30 transition cursor-pointer"
            >
              {isTesting ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>抓取测试中...</span>
                </>
              ) : (
                <>
                  <Play className="w-4 h-4 fill-current" />
                  <span>立即在浏览器中执行测试 (Run Test)</span>
                </>
              )}
            </button>
          </div>
        </div>
      </section>

      {/* 测试抓取进度 */}
      {isTesting && (
        <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 flex items-center gap-3 text-xs text-slate-300 shadow-md">
          <RefreshCw className="w-4 h-4 text-indigo-400 animate-spin" />
          <span>{testProgress}</span>
        </div>
      )}

      {/* 浏览器模拟抓取结果表格 */}
      {testResults.length > 0 && (
        <section className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
          <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
            <div>
              <h3 className="text-sm font-bold text-white flex items-center gap-2">
                <CheckCircle2 className="w-4 h-4 text-emerald-400" />
                <span>分文件夹抓取测试结果</span>
              </h3>
              <p className="text-xs text-slate-400 mt-0.5">
                成功获取{' '}
                <span className="text-emerald-400 font-bold font-mono">
                  {testResults.filter((r) => r.result.success).length}
                </span>{' '}
                / {testResults.length} 个独立文件，目录规范为{' '}
                <code className="text-indigo-300 font-mono">kline_data/{'{ticker}'}/{'{interval}'}_kline.csv</code>。
              </p>
            </div>
          </div>

          <div className="overflow-x-auto rounded-xl border border-slate-800 bg-slate-950">
            <table className="w-full text-left text-xs font-mono">
              <thead className="bg-slate-900 text-slate-400 border-b border-slate-800 uppercase text-[11px]">
                <tr>
                  <th className="py-2.5 px-4 font-semibold">标的 / 文件夹</th>
                  <th className="py-2.5 px-3 font-semibold">生成文件路径</th>
                  <th className="py-2.5 px-3 font-semibold">时间跨度</th>
                  <th className="py-2.5 px-3 font-semibold">状态</th>
                  <th className="py-2.5 px-3 font-semibold">K线数量</th>
                  <th className="py-2.5 px-3 font-semibold">最新收盘价</th>
                  <th className="py-2.5 px-4 font-semibold text-right">操作</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-850 text-slate-300">
                {testResults.map((item, idx) => {
                  const { ticker, interval, period, path, result } = item;
                  const rowCount = result.rows.length;
                  const latestRow = rowCount > 0 ? result.rows[rowCount - 1] : null;

                  return (
                    <tr key={idx} className="hover:bg-slate-900/50 transition">
                      <td className="py-2.5 px-4 font-bold text-white whitespace-nowrap flex items-center gap-1.5">
                        <Folder className="w-3.5 h-3.5 text-indigo-400" />
                        <span>{ticker}</span>
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap text-indigo-300">
                        {path}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap text-slate-400">
                        {period}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap">
                        {result.success ? (
                          <span className="text-emerald-400 flex items-center gap-1 text-[11px]">
                            <Check className="w-3 h-3" /> 成功
                          </span>
                        ) : (
                          <span className="text-rose-400 flex items-center gap-1 text-[11px]">
                            <AlertCircle className="w-3 h-3" /> 失败
                          </span>
                        )}
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap font-mono tabular-nums text-slate-200">
                        {rowCount} 根
                      </td>
                      <td className="py-2.5 px-3 whitespace-nowrap font-mono tabular-nums text-emerald-400">
                        {latestRow ? `$${latestRow.Close.toFixed(2)}` : 'N/A'}
                      </td>
                      <td className="py-2.5 px-4 whitespace-nowrap text-right">
                        {result.success && (
                          <button
                            type="button"
                            onClick={() =>
                              handleDownloadSingleResult(path, result.csvText)
                            }
                            className="inline-flex items-center gap-1 px-2.5 py-1 rounded bg-slate-900 hover:bg-slate-800 text-indigo-300 text-xs border border-slate-800 transition"
                          >
                            <Download className="w-3 h-3" />
                            <span>下载</span>
                          </button>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        </section>
      )}
    </div>
  );
}
