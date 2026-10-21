export type TimeframeId = '1d' | '1wk' | '1h' | '5m';

export interface PeriodOption {
  value: string;
  label: string;
  isPopular?: boolean;
}

export interface TimeframeConfig {
  id: TimeframeId;
  label: string;
  shortLabel: string;
  description: string;
  defaultPeriod: string;
  defaultLimit: number; // 交易员常用条数
  hasTime: boolean; // 是否包含时间（分时线需展示 HH:mm）
  periods: PeriodOption[];
}

export interface KlineRow {
  Date: string; // 日/周线为 YYYY-MM-DD，小时/5分钟线为 YYYY-MM-DD HH:mm
  Open: number;
  High: number;
  Low: number;
  Close: number;
  Volume: number;
}

export interface TickerFetchResult {
  ticker: string;
  safeName: string;
  fileName: string;
  interval: TimeframeId;
  period: string;
  success: boolean;
  error?: string;
  csvText: string;
  rows: KlineRow[];
}

export interface FetchApiResponse {
  success: boolean;
  targetTickers: string[];
  interval: TimeframeId;
  period: string;
  logs: string[];
  results: TickerFetchResult[];
}

export interface SearchSuggestion {
  symbol: string;
  shortname?: string;
  longname?: string;
  exchDisp?: string;
  typeDisp?: string;
}
