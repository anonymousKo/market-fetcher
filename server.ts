import express, { Request, Response } from 'express';
import { createServer as createViteServer } from 'vite';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();
// AI Studio dev server MUST run on port 3000 (DEFAULT_APP_PORT).
// Note: process.env.PORT is set to 8080 by Cloud Run for Nginx, so do NOT use process.env.PORT here.
const PORT = 3000;

app.use(express.json());

// Ensure kline_data directory exists, exactly as in fetch_data.py
const OUTPUT_DIR = path.resolve(__dirname, 'kline_data');
if (!fs.existsSync(OUTPUT_DIR)) {
  fs.mkdirSync(OUTPUT_DIR, { recursive: true });
}

/**
 * 清理标的代码，避免生成文件名时出现非法字符
 * 原逻辑: re.sub(r'[\\/*?:"<>|=]', '_', ticker)
 */
function cleanTickerName(ticker: string): string {
  return ticker.replace(/[\\/*?:"<>|=]/g, '_');
}

export interface KlineRow {
  Date: string;
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
  success: boolean;
  error?: string;
  csvText: string;
  rows: KlineRow[];
}

/**
 * 抓取单个标的并清洗数据，行为与 fetch_data.py 完全一致:
 * - range: 1mo, 3mo, 6mo, 1y (默认 3mo)
 * - interval: 1d
 * - 取尾部 60 根 K 线 (.tail(60))
 * - Open, High, Low, Close 保留 2 位小数
 * - 导出 Date, Open, High, Low, Close, Volume
 */
async function fetchSingleTicker(
  ticker: string,
  period = '3mo'
): Promise<TickerFetchResult> {
  const safeName = cleanTickerName(ticker);
  const fileName = `${safeName}_kline.csv`;

  try {
    const url = `https://query1.finance.yahoo.com/v8/finance/chart/${encodeURIComponent(
      ticker
    )}?interval=1d&range=${encodeURIComponent(period)}`;

    const res = await fetch(url, {
      headers: {
        'User-Agent':
          'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36',
      },
      signal: AbortSignal.timeout(8000),
    });

    if (!res.ok) {
      throw new Error(`HTTP ${res.status}: ${await res.text()}`);
    }

    const json = await res.json();
    const result = json?.chart?.result?.[0];
    if (!result || !result.timestamp || result.timestamp.length === 0) {
      return {
        ticker,
        safeName,
        fileName,
        success: false,
        error: `标的 ${ticker} 未获取到有效数据`,
        csvText: '',
        rows: [],
      };
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

      // 日期格式: YYYY-MM-DD
      const dateStr = new Date(timestamps[i] * 1000).toISOString().slice(0, 10);
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
      return {
        ticker,
        safeName,
        fileName,
        success: false,
        error: `标的 ${ticker} 数据为空`,
        csvText: '',
        rows: [],
      };
    }

    // 取最后 60 条 (.tail(60))
    const rows = allRows.slice(-60);

    // 生成 CSV 内容
    const csvHeader = 'Date,Open,High,Low,Close,Volume';
    const csvLines = rows.map(
      (r) => `${r.Date},${r.Open.toFixed(2)},${r.High.toFixed(2)},${r.Low.toFixed(2)},${r.Close.toFixed(2)},${r.Volume}`
    );
    const csvText = [csvHeader, ...csvLines].join('\n');

    // 保存独立 CSV 到 kline_data 目录 (对应原逻辑 file_path = os.path.join(output_dir, f"{safe_name}_kline.csv"))
    const filePath = path.join(OUTPUT_DIR, fileName);
    fs.writeFileSync(filePath, csvText, 'utf-8');

    return {
      ticker,
      safeName,
      fileName,
      success: true,
      csvText,
      rows,
    };
  } catch (err: any) {
    return {
      ticker,
      safeName,
      fileName,
      success: false,
      error: err.message || `抓取 ${ticker} 异常`,
      csvText: '',
      rows: [],
    };
  }
}

// API: POST /api/fetch-data (执行抓取任务)
app.post('/api/fetch-data', async (req: Request, res: Response) => {
  const tickersStr = typeof req.body.tickers === 'string' ? req.body.tickers.trim() : '';
  const periodStr = typeof req.body.period === 'string' ? req.body.period.trim() : '';

  // 对应 parse_args() 原兜底逻辑:
  // tickers_str = args.tickers.strip() if args.tickers else "GC=F,MU,NVDA,SOXQ"
  // period_str = args.period.strip() if args.period else "3mo"
  const defaultTickers = 'GC=F,MU,NVDA,SOXQ';
  const effectiveTickersStr = tickersStr || defaultTickers;
  const effectivePeriod = periodStr || '3mo';

  const targetTickers = effectiveTickersStr
    .split(',')
    .map((t: string) => t.trim().toUpperCase())
    .filter(Boolean);

  const logs: string[] = [];
  logs.push(`本次运行抓取标的: [${targetTickers.map((t: string) => `'${t}'`).join(', ')}] | 周期: ${effectivePeriod}`);

  const results: TickerFetchResult[] = [];

  for (const ticker of targetTickers) {
    logs.push(`正在抓取 ${ticker} ...`);
    const result = await fetchSingleTicker(ticker, effectivePeriod);
    if (!result.success) {
      logs.push(`⚠️ 标的 ${ticker} 未获取到有效数据`);
    } else {
      logs.push(`✓ 标的 ${ticker} 抓取成功 (${result.rows.length} 条记录)`);
    }
    results.push(result);
  }

  logs.push(`全部标的抓取完成，数据已存入 kline_data/ 目录。`);

  res.json({
    success: true,
    targetTickers,
    period: effectivePeriod,
    logs,
    results,
  });
});

// API: GET /api/download/:fileName (下载单个 CSV 文件)
app.get('/api/download/:fileName', (req: Request, res: Response) => {
  const fileName = req.params.fileName;
  const safeFileName = path.basename(fileName);
  const filePath = path.join(OUTPUT_DIR, safeFileName);

  if (!fs.existsSync(filePath)) {
    return res.status(404).send('File not found');
  }

  res.setHeader('Content-Type', 'text/csv');
  res.setHeader('Content-Disposition', `attachment; filename="${safeFileName}"`);
  res.sendFile(filePath);
});

// API: GET /api/files (列出已保存的 CSV 文件)
app.get('/api/files', (_req: Request, res: Response) => {
  if (!fs.existsSync(OUTPUT_DIR)) {
    return res.json({ files: [] });
  }
  const files = fs.readdirSync(OUTPUT_DIR).filter((f) => f.endsWith('.csv'));
  res.json({ files });
});

// Vite Middleware for development / static files for production
async function startServer() {
  if (process.env.NODE_ENV === 'production') {
    app.use(express.static(path.resolve(__dirname, 'dist')));
    app.get('*', (_req, res) => {
      res.sendFile(path.resolve(__dirname, 'dist', 'index.html'));
    });
  } else {
    const vite = await createViteServer({
      server: {
        middlewareMode: true,
        hmr: process.env.DISABLE_HMR !== 'true',
        watch: process.env.DISABLE_HMR === 'true' ? null : {},
      },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Server running at http://0.0.0.0:${PORT}`);
  });
}

startServer();
