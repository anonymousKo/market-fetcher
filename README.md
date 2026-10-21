# Market K-Line Fetcher (行情 K 线数据抓取与汇总工具)

轻量、高效的行情 K 线数据抓取与规范导出工具，支持美股（如 TSM、NVDA、AAPL）、期货（如 GC=F 黄金期货）、半导体及行业 ETF（如 SOXQ）的多维度历史与分时 K 线数据快速下载与汇总。

同时包含**现代化交互式 Web 终端**与**轻量级自动化 Python 脚本 (`fetch_data.py`)**。

---

## 🌟 核心特性

- 🔍 **美股代码智能搜索与联想**：
  - 支持键入代码（`TSM`、`NVDA`、`AAPL`）或公司名称（如“台积电”、“英伟达”），实时调用联想接口一键添加。
  - 智能标点解析：支持英文逗号（`,`）、中文逗号（`，`）、分号（`;`）、空格及换行分隔。
- ⏱️ **多维度 K 线与热门跨度自动联动**：
  - **日线 (`1d`)**：热门跨度 `1mo`, `3mo (默认)`, `6mo`, `1y`, `2y`，自动截取最新约 60 根交易日 K 线（季度波段）。
  - **周线 (`1wk`)**：热门跨度 `6mo`, `1y (默认)`, `2y`, `5y`, `max`，自动截取最新约 52 根周 K 线（年度宏观结构）。
  - **1小时 (`1h`)**：热门跨度 `5d`, `1mo (默认)`, `3mo`, `6mo`, `1y`，自动截取最新约 120 根小时线。
  - **5分钟 (`5m`)**：热门跨度 `1d`, `5d (默认)`, `1mo`，自动截取最新约 150 根高频日内分时 K 线。
- 📊 **交易员标准数据清洗**：
  - 提取 `Date`、`Open`、`High`、`Low`、`Close`、`Volume` 标准六列。
  - 开高低收价格自动四舍五入保留 2 位小数。
  - 日线/周线输出 `YYYY-MM-DD` 格式，分时线自动输出精确到分钟的 `YYYY-MM-DD HH:mm` 格式。
- 📁 **多视图呈现与一键导出**：
  - **明细表格**：红绿蜡烛涨跌幅标记，等宽数字（`tabular-nums`）对齐。
  - **原始 CSV**：支持一键复制到剪贴板，方便粘贴至 Excel 或量化回测工具。
  - **SVG 蜡烛图**：直观预览所选标的的走势形态。
  - **独立与打包下载**：支持单个下载 `{ticker}_{interval}_kline.csv`，或一键打包下载全部标的 CSV。

---

## 🚀 快速上手 (Web 终端)

### 1. 安装依赖

```bash
npm install
```

### 2. 启动开发服务器

```bash
npm run dev
```

服务默认在 `http://localhost:3000` 启动，内置 Yahoo Finance 反向代理，支持即开即用。

### 3. 构建生产版本

```bash
npm run build
```

生产构建产物将输出至 `dist/` 目录。

---

## 🐍 Python 自动化脚本使用 (`fetch_data.py`)

如果您需要在服务器或定时任务（如 GitHub Actions）中无界面批量抓取日线数据，可直接使用根目录下的 `fetch_data.py`。

### 依赖安装

```bash
pip install -r requirements.txt
```

### 执行命令示例

```bash
# 1. 默认参数抓取 (GC=F, MU, NVDA, SOXQ，跨度 3mo，日线 1d)
python fetch_data.py

# 2. 指定自定义标的代码 (例如美股 TSM 与 NVDA)
python fetch_data.py --tickers "TSM,NVDA"

# 3. 指定数据周期 (例如 6 个月或 1 年)
python fetch_data.py --tickers "TSM,AAPL,MSFT" --period "1y"
```

### 导出文件规范

数据将自动清洗并保存至 `kline_data/` 目录，文件名遵循安全命名规范：
- 特殊符号（如 `GC=F`）自动转换为安全文件名：`GC_F_kline.csv`
- 美股标的：`TSM_kline.csv`、`NVDA_kline.csv` 等

---

## 📂 项目结构

```text
├── src/
│   ├── App.tsx          # 交互式 K 线抓取核心组件 (包含搜索、图表、导出、折叠卡片)
│   ├── types.ts         # 数据模型与多维度接口定义 (TimeframeConfig, KlineRow)
│   ├── main.tsx         # React 入口
│   └── index.css        # Tailwind CSS 样式
├── fetch_data.py        # Python 批量抓取脚本 (yfinance + pandas)
├── requirements.txt     # Python 依赖清单
├── vite.config.ts       # Vite 配置文件 (含 /api/yahoo 代理转发)
├── package.json         # 项目依赖与 Scripts
└── README.md            # 项目说明文档
```

---

## 📄 导出 CSV 数据示例

```csv
Date,Open,High,Low,Close,Volume
2026-10-15,412.50,422.30,410.10,420.22,12543000
2026-10-16,421.00,426.80,419.50,425.08,9842100
...
```

---

## 💡 常见问题 (FAQ)

1. **为什么美股标的 TSM 可以抓取到？**
   - TSM 为台积电在纽交所的上市代码（NYSE: TSM），系统支持直接输入 `TSM`，或在顶部搜索框输入 `台积电` 或 `TSMC` 搜索添加。
2. **5 分钟或 1 小时数据的时间范围有限制吗？**
   - 系统已根据金融数据源规则进行智能联动约束：5分钟分时最长有效范围为 1 个月，1小时分时有效范围为 1 年以内，避免由于超出接口上限而导致抓取失败。
3. **生成的 CSV 文件如何导入量化软件？**
   - 导出的 CSV 文件包含标准的 `Date,Open,High,Low,Close,Volume` 表头，可直接无缝导入 Pandas、Backtrader、TradingView、MetaTrader 或 Excel。
