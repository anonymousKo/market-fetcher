import React, { useState, useEffect, useRef } from 'react';
import {
  Sparkles,
  Copy,
  Check,
  Download,
  RefreshCw,
  Search,
  Settings2,
  RotateCcw,
  Layers,
  ChevronDown,
  ChevronRight,
  FileText,
  SlidersHorizontal,
  FileSpreadsheet,
  Code2,
} from 'lucide-react';
import { SearchSuggestion } from '../types';
import {
  DEFAULT_PROMPT_PREFIX,
  STORAGE_KEY_PROMPT_PREFIX,
  TIMEFRAMES,
  fetchTickerData,
  composeAnalysisPrompt,
  composePureDataCsv,
  PromptDatasetItem,
} from '../services/klineService';

const POPULAR_TICKERS = [
  { symbol: 'TSM', name: '台积电' },
  { symbol: 'NVDA', name: '英伟达' },
  { symbol: 'AAPL', name: '苹果' },
  { symbol: 'MU', name: '美光科技' },
  { symbol: 'MSFT', name: '微软' },
  { symbol: 'SOXQ', name: '半导体ETF' },
  { symbol: '3033.HK', name: '恒生科技' },
];

export function PromptGenerator() {
  const [tickerInput, setTickerInput] = useState<string>('');
  const [searchQuery, setSearchQuery] = useState<string>('');
  const [isSearching, setIsSearching] = useState<boolean>(false);
  const [suggestions, setSuggestions] = useState<SearchSuggestion[]>([]);
  const [showDropdown, setShowDropdown] = useState<boolean>(false);
  const searchContainerRef = useRef<HTMLDivElement>(null);

  // 三个时间维度的跨度配置 (默认为用户要求的: 日线3个月, 1小时1个月, 5分钟1天)
  const [periodDaily, setPeriodDaily] = useState<string>('3mo');
  const [periodHourly, setPeriodHourly] = useState<string>('1mo');
  const [period5Min, setPeriod5Min] = useState<string>('1d');
  const [showConfigPeriods, setShowConfigPeriods] = useState<boolean>(false);

  // Prompt 前缀全局配置
  const [promptPrefix, setPromptPrefix] = useState<string>(() => {
    try {
      const saved = localStorage.getItem(STORAGE_KEY_PROMPT_PREFIX);
      if (saved && saved.trim()) return saved;
    } catch (e) {}
    return DEFAULT_PROMPT_PREFIX;
  });
  const [prefixEditDraft, setPrefixEditDraft] = useState<string>(promptPrefix);
  const [showPrefixEditor, setShowPrefixEditor] = useState<boolean>(false);
  const [saveSuccessMsg, setSaveSuccessMsg] = useState<string | null>(null);

  // 抓取与生成状态
  const [isGenerating, setIsGenerating] = useState<boolean>(false);
  const [generationStep, setGenerationStep] = useState<string>('');
  const [generatedPrompt, setGeneratedPrompt] = useState<string | null>(null);
  const [generatedPureData, setGeneratedPureData] = useState<string | null>(null);
  const [generatedTicker, setGeneratedTicker] = useState<string>('');
  const [datasetItems, setDatasetItems] = useState<PromptDatasetItem[]>([]);
  const [isCopiedPrompt, setIsCopiedPrompt] = useState<boolean>(false);
  const [isCopiedPureData, setIsCopiedPureData] = useState<boolean>(false);
  const [activePreviewMode, setActivePreviewMode] = useState<'prompt' | 'pure_data'>('prompt');
  const [expandedDatasets, setExpandedDatasets] = useState<Record<string, boolean>>({});

  // 点击外部收起下拉框
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

  // 搜索自动联想
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

  const handleSelectSuggestion = (item: SearchSuggestion) => {
    setTickerInput(item.symbol.toUpperCase());
    setSearchQuery('');
    setShowDropdown(false);
  };

  const handleSavePrefix = () => {
    const val = prefixEditDraft.trim();
    if (!val) {
      alert('Prompt 前缀内容不能为空');
      return;
    }
    setPromptPrefix(val);
    try {
      localStorage.setItem(STORAGE_KEY_PROMPT_PREFIX, val);
    } catch (e) {}
    setSaveSuccessMsg('Prompt 前缀已保存为全局默认');
    setTimeout(() => setSaveSuccessMsg(null), 2500);
    setShowPrefixEditor(false);
  };

  const handleResetPrefix = () => {
    if (confirm('确认将 Prompt 前缀恢复为系统内置的量化交易员默认模板吗？')) {
      setPromptPrefix(DEFAULT_PROMPT_PREFIX);
      setPrefixEditDraft(DEFAULT_PROMPT_PREFIX);
      try {
        localStorage.removeItem(STORAGE_KEY_PROMPT_PREFIX);
      } catch (e) {}
      setSaveSuccessMsg('已恢复系统默认前缀');
      setTimeout(() => setSaveSuccessMsg(null), 2500);
    }
  };

  // 生成分析 Prompt
  const handleGenerate = async (e?: React.FormEvent) => {
    if (e) e.preventDefault();

    const targetTicker = tickerInput.trim().toUpperCase();
    if (!targetTicker) {
      alert('请输入要分析的股票或标的代码 (如 TSM, NVDA, AAPL)');
      return;
    }

    setIsGenerating(true);
    setGeneratedPrompt(null);
    setGeneratedPureData(null);
    setDatasetItems([]);
    setGeneratedTicker(targetTicker);

    try {
      setGenerationStep(`正在并行获取 ${targetTicker} 的日线 (3mo)、1小时 (1mo)、5分钟 (1d) 数据...`);

      const [resDaily, resHourly, res5Min] = await Promise.all([
        fetchTickerData(targetTicker, '1d', periodDaily),
        fetchTickerData(targetTicker, '1h', periodHourly),
        fetchTickerData(targetTicker, '5m', period5Min),
      ]);

      const items: PromptDatasetItem[] = [
        {
          interval: '1d',
          label: '日线 (Daily)',
          period: periodDaily,
          periodLabel: TIMEFRAMES['1d'].periods.find((p) => p.value === periodDaily)?.label || periodDaily,
          result: resDaily,
        },
        {
          interval: '1h',
          label: '1小时 (1-Hour)',
          period: periodHourly,
          periodLabel: TIMEFRAMES['1h'].periods.find((p) => p.value === periodHourly)?.label || periodHourly,
          result: resHourly,
        },
        {
          interval: '5m',
          label: '5分钟 (5-Minute)',
          period: period5Min,
          periodLabel: TIMEFRAMES['5m'].periods.find((p) => p.value === period5Min)?.label || period5Min,
          result: res5Min,
        },
      ];

      setDatasetItems(items);

      // 同时组装：完整分析 Prompt (带前缀) 与 纯数据集合 (无前缀纯 CSV)
      const promptText = composeAnalysisPrompt(targetTicker, promptPrefix, items);
      const pureDataText = composePureDataCsv(targetTicker, items);

      setGeneratedPrompt(promptText);
      setGeneratedPureData(pureDataText);
      setGenerationStep('数据与 Prompt 已成功生成');
    } catch (err: any) {
      alert(`生成失败: ${err.message || '网络异常'}`);
    } finally {
      setIsGenerating(false);
    }
  };

  // 复制完整 Prompt (含前缀)
  const handleCopyPrompt = () => {
    if (!generatedPrompt) return;
    navigator.clipboard.writeText(generatedPrompt);
    setIsCopiedPrompt(true);
    setTimeout(() => setIsCopiedPrompt(false), 2200);
  };

  // 复制纯数据集合 (无 Prompt 前缀，纯 CSV)
  const handleCopyPureData = () => {
    if (!generatedPureData) return;
    navigator.clipboard.writeText(generatedPureData);
    setIsCopiedPureData(true);
    setTimeout(() => setIsCopiedPureData(false), 2200);
  };

  // 下载完整 Prompt (.md)
  const handleDownloadPrompt = () => {
    if (!generatedPrompt || !generatedTicker) return;
    const blob = new Blob([generatedPrompt], { type: 'text/markdown;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${generatedTicker}_quant_analysis_prompt.md`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // 下载纯数据集合 (.csv)
  const handleDownloadPureData = () => {
    if (!generatedPureData || !generatedTicker) return;
    const blob = new Blob([generatedPureData], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `${generatedTicker}_multitimeframe_data.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  const toggleDatasetExpand = (key: string) => {
    setExpandedDatasets((prev) => ({
      ...prev,
      [key]: !prev[key],
    }));
  };

  const isCustomPrefix = promptPrefix.trim() !== DEFAULT_PROMPT_PREFIX.trim();

  return (
    <div className="space-y-6">
      {/* 顶部介绍与前缀配置入口 */}
      <section className="bg-slate-900 border border-slate-800 rounded-2xl p-5 sm:p-6 shadow-xl space-y-5">
        <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-4">
          <div className="space-y-1">
            <h2 className="text-base font-bold text-white flex items-center gap-2">
              <Sparkles className="w-5 h-5 text-indigo-400" />
              量化分析 Prompt 智能生成器
            </h2>
            <p className="text-xs text-slate-400">
              输入股票代码后，自动拉取{' '}
              <strong className="text-slate-200">日线 3 个月</strong>、
              <strong className="text-slate-200">1 小时 1 个月</strong> 与{' '}
              <strong className="text-slate-200">5 分钟 1 天</strong>（美东时间对齐），可一键输出带前缀的完整 Prompt 或纯数据集合 CSV。
            </p>
          </div>

          <div className="flex items-center gap-2">
            {saveSuccessMsg && (
              <span className="text-xs text-emerald-400 font-medium animate-pulse">
                ✓ {saveSuccessMsg}
              </span>
            )}
            <button
              type="button"
              onClick={() => {
                setPrefixEditDraft(promptPrefix);
                setShowPrefixEditor(!showPrefixEditor);
              }}
              className="flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-slate-950 hover:bg-slate-800 border border-slate-800 text-slate-300 hover:text-white text-xs font-medium transition cursor-pointer"
            >
              <Settings2 className="w-3.5 h-3.5 text-indigo-400" />
              <span>Prompt 前缀全局配置</span>
              {isCustomPrefix && (
                <span className="w-1.5 h-1.5 rounded-full bg-indigo-400"></span>
              )}
            </button>
          </div>
        </div>

        {/* Prompt 前缀全局配置弹展抽屉 */}
        {showPrefixEditor && (
          <div className="bg-slate-950/80 border border-slate-800 rounded-xl p-4 space-y-3 transition">
            <div className="flex items-center justify-between text-xs text-slate-300 border-b border-slate-800 pb-2">
              <div className="flex items-center gap-2">
                <FileText className="w-4 h-4 text-indigo-400" />
                <span className="font-semibold">自定义 Prompt 前缀模板</span>
                <span className="text-[11px] text-slate-500">
                  (保存在浏览器本地，后续每次生成均自动沿用)
                </span>
              </div>
              <div className="flex items-center gap-3">
                <span className="text-slate-500 font-mono text-[11px]">
                  {prefixEditDraft.length} 字符 · 约 {Math.round(prefixEditDraft.length / 4)} Tokens
                </span>
                {isCustomPrefix && (
                  <button
                    type="button"
                    onClick={handleResetPrefix}
                    className="flex items-center gap-1 text-slate-400 hover:text-rose-400 transition text-[11px]"
                  >
                    <RotateCcw className="w-3 h-3" />
                    恢复系统默认
                  </button>
                )}
              </div>
            </div>

            <textarea
              value={prefixEditDraft}
              onChange={(e) => setPrefixEditDraft(e.target.value)}
              rows={12}
              className="w-full p-3.5 rounded-lg bg-slate-900 border border-slate-800 font-mono text-xs text-slate-200 placeholder-slate-500 focus:outline-none focus:border-indigo-500 leading-relaxed transition shadow-inner"
              placeholder="在此输入您的自定义分析 Prompt 前缀..."
            />

            <div className="flex items-center justify-between pt-1">
              <span className="text-[11px] text-slate-500">
                支持 Markdown 标题、角色设定、分析引擎步骤及输出约束。
              </span>
              <div className="flex items-center gap-2">
                <button
                  type="button"
                  onClick={() => setShowPrefixEditor(false)}
                  className="px-3 py-1.5 rounded-lg text-xs text-slate-400 hover:text-slate-200 transition"
                >
                  取消
                </button>
                <button
                  type="button"
                  onClick={handleSavePrefix}
                  className="px-4 py-1.5 rounded-lg bg-indigo-600 hover:bg-indigo-500 text-white text-xs font-semibold shadow-md transition"
                >
                  保存配置
                </button>
              </div>
            </div>
          </div>
        )}

        {/* 标的输入与周期设置表单 */}
        <form onSubmit={handleGenerate} className="space-y-4">
          <div className="space-y-1.5" ref={searchContainerRef}>
            <label className="text-xs font-semibold text-slate-300 flex items-center justify-between">
              <span className="flex items-center gap-1.5">
                <Search className="w-3.5 h-3.5 text-indigo-400" />
                <span>输入股票代码或名称:</span>
              </span>
              <span className="text-[11px] text-slate-500">
                支持美股 (TSM, NVDA)、港股 (3033.HK, 9988.HK)、指数期货
              </span>
            </label>

            <div className="relative">
              <input
                type="text"
                value={tickerInput}
                onChange={(e) => {
                  setTickerInput(e.target.value);
                  setSearchQuery(e.target.value);
                }}
                onFocus={() => {
                  if (suggestions.length > 0) setShowDropdown(true);
                }}
                placeholder="例如: TSM, NVDA, AAPL, MSFT, 3033.HK..."
                className="w-full pl-3.5 pr-10 py-3 rounded-xl bg-slate-950 border border-slate-800 text-base font-mono text-white placeholder-slate-500 focus:outline-none focus:border-indigo-500 transition shadow-inner uppercase"
              />
              {isSearching ? (
                <RefreshCw className="w-4 h-4 text-indigo-400 animate-spin absolute right-3.5 top-1/2 -translate-y-1/2" />
              ) : (
                tickerInput && (
                  <button
                    type="button"
                    onClick={() => {
                      setTickerInput('');
                      setSearchQuery('');
                    }}
                    className="absolute right-3.5 top-1/2 -translate-y-1/2 text-xs text-slate-500 hover:text-slate-300"
                  >
                    清空
                  </button>
                )
              )}
            </div>

            {/* 智能联想下拉 */}
            {showDropdown && suggestions.length > 0 && (
              <div className="absolute left-0 right-0 mt-1.5 z-30 bg-slate-900 border border-slate-700 rounded-xl shadow-2xl overflow-hidden divide-y divide-slate-800">
                {suggestions.map((item) => (
                  <div
                    key={item.symbol}
                    onClick={() => handleSelectSuggestion(item)}
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
                      选择
                    </button>
                  </div>
                ))}
              </div>
            )}
          </div>

          {/* 快捷点击热门标的 */}
          <div className="flex flex-wrap items-center gap-1.5 text-xs text-slate-400">
            <span className="text-[11px] text-slate-500">热门快捷填充:</span>
            {POPULAR_TICKERS.map((item) => (
              <button
                key={item.symbol}
                type="button"
                onClick={() => setTickerInput(item.symbol)}
                className={`px-2.5 py-1 rounded-lg border text-xs font-mono transition ${
                  tickerInput.toUpperCase() === item.symbol
                    ? 'bg-indigo-600/30 border-indigo-500 text-indigo-300'
                    : 'bg-slate-950 border-slate-800 text-slate-400 hover:text-white hover:border-slate-700'
                }`}
              >
                <span>{item.symbol}</span>
                <span className="text-[10px] ml-1 opacity-70">({item.name})</span>
              </button>
            ))}
          </div>

          {/* 默认周期信息 & 可选自定义设置 */}
          <div className="p-3.5 bg-slate-950 border border-slate-800 rounded-xl space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2 text-xs">
              <div className="flex flex-wrap items-center gap-3 text-slate-300">
                <span className="text-slate-400 font-medium">预设获取组合:</span>
                <span className="font-mono text-indigo-300 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">
                  日线 · {periodDaily}
                </span>
                <span className="text-slate-600">/</span>
                <span className="font-mono text-indigo-300 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">
                  1小时 · {periodHourly}
                </span>
                <span className="text-slate-600">/</span>
                <span className="font-mono text-indigo-300 bg-indigo-500/10 px-2 py-0.5 rounded border border-indigo-500/20">
                  5分钟 · {period5Min}
                </span>
                <span className="text-[11px] text-slate-500 hidden sm:inline">
                  (首根均严格按美东 09:30 开盘对齐)
                </span>
              </div>

              <button
                type="button"
                onClick={() => setShowConfigPeriods(!showConfigPeriods)}
                className="flex items-center gap-1 text-[11px] text-indigo-400 hover:text-indigo-300 transition cursor-pointer"
              >
                <SlidersHorizontal className="w-3 h-3" />
                <span>{showConfigPeriods ? '收起周期微调' : '微调跨度'}</span>
              </button>
            </div>

            {/* 展开自定义跨度 */}
            {showConfigPeriods && (
              <div className="grid grid-cols-1 md:grid-cols-3 gap-3 pt-2 border-t border-slate-855">
                <div className="space-y-1">
                  <label className="text-[11px] text-slate-400">日线跨度 (Daily):</label>
                  <select
                    value={periodDaily}
                    onChange={(e) => setPeriodDaily(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs font-mono text-white focus:outline-none focus:border-indigo-500"
                  >
                    {TIMEFRAMES['1d'].periods.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] text-slate-400">1小时跨度 (1-Hour):</label>
                  <select
                    value={periodHourly}
                    onChange={(e) => setPeriodHourly(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs font-mono text-white focus:outline-none focus:border-indigo-500"
                  >
                    {TIMEFRAMES['1h'].periods.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>

                <div className="space-y-1">
                  <label className="text-[11px] text-slate-400">5分钟跨度 (5-Minute):</label>
                  <select
                    value={period5Min}
                    onChange={(e) => setPeriod5Min(e.target.value)}
                    className="w-full px-2.5 py-1.5 rounded-lg bg-slate-900 border border-slate-800 text-xs font-mono text-white focus:outline-none focus:border-indigo-500"
                  >
                    {TIMEFRAMES['5m'].periods.map((p) => (
                      <option key={p.value} value={p.value}>
                        {p.label}
                      </option>
                    ))}
                  </select>
                </div>
              </div>
            )}
          </div>

          {/* 生成主操作按钮 */}
          <div className="flex items-center justify-between pt-2">
            <span className="text-xs text-slate-400">
              数据源: <strong className="text-slate-200">Yahoo Finance (America/New_York)</strong> · 自动清洗保留 2 位小数
            </span>

            <button
              type="submit"
              disabled={isGenerating || !tickerInput.trim()}
              className="flex items-center gap-2 px-6 py-2.5 rounded-xl bg-indigo-600 hover:bg-indigo-500 active:scale-95 disabled:opacity-50 text-white text-sm font-semibold shadow-lg shadow-indigo-600/30 transition cursor-pointer"
            >
              {isGenerating ? (
                <>
                  <RefreshCw className="w-4 h-4 animate-spin" />
                  <span>抓取并组装中...</span>
                </>
              ) : (
                <>
                  <Sparkles className="w-4 h-4 fill-current text-amber-300" />
                  <span>获取数据并生成 (Generate)</span>
                </>
              )}
            </button>
          </div>
        </form>
      </section>

      {/* 抓取中状态条 */}
      {isGenerating && (
        <div className="bg-slate-950 border border-slate-800 rounded-2xl p-4 flex items-center gap-3 text-xs text-slate-300 shadow-md">
          <RefreshCw className="w-4 h-4 text-indigo-400 animate-spin" />
          <span>{generationStep || '正在处理中...'}</span>
        </div>
      )}

      {/* 生成结果展现区 */}
      {generatedPrompt && generatedPureData && (
        <section className="space-y-4">
          {/* 汇总顶部栏与操作按钮 */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl p-5 shadow-xl space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3 border-b border-slate-800 pb-3">
              <div>
                <h3 className="text-base font-bold text-white flex items-center gap-2">
                  <Check className="w-4 h-4 text-emerald-400" />
                  <span>{generatedTicker} 多周期数据与 Prompt 已就绪</span>
                </h3>
                <p className="text-xs text-slate-400 mt-0.5">
                  已成功获取{' '}
                  <span className="text-white font-mono font-semibold">
                    {datasetItems.map((d) => `${d.interval}: ${d.result.rows.length} 根`).join(' | ')}
                  </span>
                  ，提供带 Prompt 前缀与不带前缀的纯 CSV 两种输出。
                </p>
              </div>

              {/* 核心操作按钮组 */}
              <div className="flex flex-wrap items-center gap-2">
                {/* 1. 输出纯数据按钮 (不带 Prompt 前缀) */}
                <button
                  type="button"
                  onClick={handleCopyPureData}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition border cursor-pointer ${
                    isCopiedPureData
                      ? 'bg-emerald-600 border-emerald-500 text-white'
                      : 'bg-slate-950 hover:bg-slate-800 border-slate-700 text-emerald-400 hover:text-emerald-300'
                  }`}
                  title="仅复制日线、1小时、5分钟的纯 CSV 数据集合，不包含 Prompt 角色与指令前缀"
                >
                  {isCopiedPureData ? (
                    <>
                      <Check className="w-4 h-4" />
                      <span>纯数据已复制！</span>
                    </>
                  ) : (
                    <>
                      <FileSpreadsheet className="w-4 h-4" />
                      <span>复制纯数据 (无前缀 CSV)</span>
                    </>
                  )}
                </button>

                {/* 2. 复制完整 Prompt 按钮 (含角色前缀) */}
                <button
                  type="button"
                  onClick={handleCopyPrompt}
                  className={`flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold transition shadow-lg cursor-pointer ${
                    isCopiedPrompt
                      ? 'bg-emerald-600 text-white shadow-emerald-600/30'
                      : 'bg-indigo-600 hover:bg-indigo-500 text-white shadow-indigo-600/30'
                  }`}
                  title="复制包含 Role & Persona 前缀与完整多周期数据的分析 Prompt"
                >
                  {isCopiedPrompt ? (
                    <>
                      <Check className="w-4 h-4" />
                      <span>完整 Prompt 已复制！</span>
                    </>
                  ) : (
                    <>
                      <Copy className="w-4 h-4" />
                      <span>复制完整 Prompt (含前缀)</span>
                    </>
                  )}
                </button>

                {/* 3. 下载按钮 */}
                <div className="flex items-center gap-1 bg-slate-950 p-0.5 rounded-xl border border-slate-800">
                  <button
                    type="button"
                    onClick={handleDownloadPureData}
                    className="p-2 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 text-xs transition"
                    title="下载纯数据集合 CSV 文件"
                  >
                    <Download className="w-3.5 h-3.5" />
                  </button>
                  <button
                    type="button"
                    onClick={handleDownloadPrompt}
                    className="p-2 rounded-lg text-slate-300 hover:text-white hover:bg-slate-800 text-xs transition font-mono"
                    title="下载完整分析 Prompt Markdown 文件"
                  >
                    .md
                  </button>
                </div>
              </div>
            </div>

            {/* 数据指标三列概览卡片 */}
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              {datasetItems.map((item) => {
                const rowCount = item.result.rows.length;
                const latestRow = rowCount > 0 ? item.result.rows[rowCount - 1] : null;
                const firstRow = rowCount > 0 ? item.result.rows[0] : null;

                return (
                  <div
                    key={item.interval}
                    className="p-3.5 rounded-xl bg-slate-950 border border-slate-800 space-y-1"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold text-white">{item.label}</span>
                      <span className="font-mono text-indigo-400 text-[11px] bg-indigo-500/10 px-1.5 py-0.5 rounded">
                        {item.period}
                      </span>
                    </div>
                    <div className="flex items-baseline justify-between pt-1">
                      <span className="text-xl font-bold font-mono text-emerald-400">
                        {item.result.success ? `$${latestRow?.Close.toFixed(2)}` : '获取失败'}
                      </span>
                      <span className="text-xs text-slate-400 font-mono">
                        {rowCount} 根蜡烛
                      </span>
                    </div>
                    {firstRow && latestRow && (
                      <div className="text-[10px] text-slate-500 font-mono truncate pt-0.5">
                        {firstRow.Date} → {latestRow.Date}
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>

          {/* 输出文本预览框 (带双模式切换：完整 Prompt vs 纯数据 CSV) */}
          <div className="bg-slate-900 border border-slate-800 rounded-2xl overflow-hidden shadow-xl">
            <div className="flex flex-wrap items-center justify-between px-5 py-3 border-b border-slate-800 bg-slate-950/60 gap-3">
              {/* 模式切换 Tabs */}
              <div className="flex items-center p-1 bg-slate-900 border border-slate-800 rounded-xl">
                <button
                  type="button"
                  onClick={() => setActivePreviewMode('prompt')}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                    activePreviewMode === 'prompt'
                      ? 'bg-indigo-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <Sparkles className="w-3.5 h-3.5" />
                  <span>完整分析 Prompt (含前缀)</span>
                </button>
                <button
                  type="button"
                  onClick={() => setActivePreviewMode('pure_data')}
                  className={`flex items-center gap-1.5 px-3 py-1 rounded-lg text-xs font-semibold transition cursor-pointer ${
                    activePreviewMode === 'pure_data'
                      ? 'bg-emerald-600 text-white shadow-sm'
                      : 'text-slate-400 hover:text-slate-200'
                  }`}
                >
                  <FileSpreadsheet className="w-3.5 h-3.5" />
                  <span>仅纯数据集合 (无前缀 CSV)</span>
                </button>
              </div>

              {/* 统计指标与直接复制按钮 */}
              <div className="flex items-center gap-3">
                <span className="text-[11px] text-slate-400 font-mono">
                  {activePreviewMode === 'prompt'
                    ? `${generatedPrompt.length.toLocaleString()} 字符 · 约 ${Math.round(
                        generatedPrompt.length / 4
                      ).toLocaleString()} Tokens`
                    : `${generatedPureData.length.toLocaleString()} 字符 · 约 ${Math.round(
                        generatedPureData.length / 4
                      ).toLocaleString()} Tokens`}
                </span>

                <button
                  type="button"
                  onClick={
                    activePreviewMode === 'prompt' ? handleCopyPrompt : handleCopyPureData
                  }
                  className="flex items-center gap-1 text-xs text-indigo-400 hover:text-indigo-300 font-medium transition cursor-pointer"
                >
                  <Copy className="w-3 h-3" />
                  <span>
                    {activePreviewMode === 'prompt'
                      ? isCopiedPrompt
                        ? '已复制 Prompt'
                        : '复制此视图'
                      : isCopiedPureData
                      ? '已复制纯数据'
                      : '复制纯数据'}
                  </span>
                </button>
              </div>
            </div>

            {/* 预览代码内容 */}
            <div className="relative">
              <pre className="p-5 font-mono text-xs text-slate-200 bg-slate-950 overflow-x-auto max-h-[500px] leading-relaxed selection:bg-indigo-600/40 whitespace-pre-wrap">
                {activePreviewMode === 'prompt' ? generatedPrompt : generatedPureData}
              </pre>
            </div>
          </div>

          {/* 各周期数据源详情可折叠卡片 */}
          <div className="space-y-2 pt-2">
            <h4 className="text-xs font-bold text-slate-400 uppercase tracking-wider flex items-center gap-1.5">
              <Layers className="w-3.5 h-3.5" />
              原始行情数据详情 (可点击展开独立查看各个周期的 CSV)
            </h4>

            {datasetItems.map((item) => {
              const isExpanded = !!expandedDatasets[item.interval];
              return (
                <div
                  key={item.interval}
                  className="bg-slate-900 border border-slate-800 rounded-xl overflow-hidden"
                >
                  <div
                    onClick={() => toggleDatasetExpand(item.interval)}
                    className="flex items-center justify-between px-4 py-2.5 cursor-pointer hover:bg-slate-850 transition select-none text-xs"
                  >
                    <div className="flex items-center gap-2">
                      {isExpanded ? (
                        <ChevronDown className="w-3.5 h-3.5 text-slate-400" />
                      ) : (
                        <ChevronRight className="w-3.5 h-3.5 text-slate-400" />
                      )}
                      <span className="font-semibold text-white font-mono">
                        {item.label} · {item.period} 数据
                      </span>
                      <span className="text-slate-400 font-mono text-[11px]">
                        ({item.result.rows.length} 根 K 线)
                      </span>
                    </div>

                    <span className="text-[11px] text-indigo-400 hover:text-indigo-300">
                      {isExpanded ? '收起' : '展开查看 CSV'}
                    </span>
                  </div>

                  {isExpanded && (
                    <div className="p-4 border-t border-slate-800 bg-slate-950">
                      <pre className="p-3 bg-slate-900 rounded-lg font-mono text-[11px] text-slate-300 overflow-x-auto max-h-60 leading-relaxed">
                        {item.result.csvText}
                      </pre>
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}
