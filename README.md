# Market K-Line Fetcher (行情 K 线数据抓取与汇总工具)

轻量、高效的行情 K 线数据抓取与规范导出工具，支持美股（如 TSM、NVDA、AAPL）、期货（如 GC=F 黄金期货）、半导体及行业 ETF（如 SOXQ）的多维度历史与分时 K 线数据快速下载与汇总。

同时包含**现代化交互式 Web 终端**与**轻量级自动化 Python 脚本 (`fetch_data.py`)**。

---

## 🌟 核心特性

- 🔍 **美股代码智能搜索与联想**：
  - 支持键入代码（`TSM`、`NVDA`、`AAPL`）或公司名称（如“台积电”、“英伟达”），实时调用联想接口一键添加。
  - 智能标点解析：支持英文逗号（`,`）、中文逗号（`，`）、分号（`;`）、空格及换行分隔。
- ⏱️ **多维度与热门跨度智能联动**：
  - 支持 **数据维度 (Interval)** 与 **时间跨度 (Period)** 的自由组合搭配。
  - 选择维度后，界面自动联动过滤并推荐该维度交易员最常用的热门跨度。
  - 自动按交易员习惯提取最新经典波段条数（如日线 60 根、周线 52 根、1小时 120 根、5分钟 150 根）。
- 📊 **交易员标准数据清洗**：
  - 提取 `Date`、`Open`、`High`、`Low`、`Close`、`Volume` 标准六列。
  - 开高低收价格自动四舍五入保留 2 位小数。
  - 日线/周线输出 `YYYY-MM-DD`，分时线自动输出精确到分钟的 `YYYY-MM-DD HH:mm`。
- 🤖 **AI 量化分析 Prompt 智能生成器 (New)**：
  - 输入单一标的代码后，一键并行拉取：
    - **日线 (`1d`) 3 个月 (`3mo`)**
    - **1 小时 (`1h`) 1 个月 (`1mo`)**
    - **5 分钟 (`5m`) 1 天 (`1d`)**（全天完整分时，从美东 09:30 开盘至 16:00 收盘）
  - 自动与专业量化交易员（Top-tier Quantitative Prop Trader & Market Microstructure Analyst）Prompt 前缀组装。
  - **前缀全局可配置**：支持自定义、本地持久化保存、字数/Token 估算统计，以及一键恢复系统默认。
  - 一键复制完整 Prompt，直接粘贴给 Claude 3.5 Sonnet、ChatGPT 或 Gemini 展开微观结构与量化交易策略推演。
- 📁 **多视图呈现与按需手动导出**：
  - **明细表格**：红绿蜡烛涨跌幅标记，等宽数字（`tabular-nums`）对齐。
  - **原始 CSV**：支持一键复制到剪贴板，方便粘贴至 Excel 或量化回测工具。
  - **SVG 蜡烛图**：直观预览所选标的的走势形态。
  - **纯按需手动保存**：不占用服务端磁盘静默保存，点击“下载 CSV”或“打包下载全部 CSV”直接保存到本地电脑。

---

## 📐 数据维度 (Interval) 与时间跨度 (Period) 对照表

| 数据维度 (Interval) | 热门时间跨度 (Period 选项) | 推荐默认组合 (维度+跨度) | 交易员常用数据量 | 时间格式规范 | 适用场景 |
| :--- | :--- | :--- | :--- | :--- | :--- |
| **日线 (`1d`)** | `1mo`, **`3mo`**, `6mo`, `1y`, `2y` | **`--interval 1d --period 3mo`** | 最新约 60 根 (季度交易日) | `YYYY-MM-DD` | 经典季度中短线波段研判 |
| **周线 (`1wk`)** | `6mo`, **`1y`**, `2y`, `5y`, `max` | **`--interval 1wk --period 1y`** | 最新约 52 根 (整年结构) | `YYYY-MM-DD` | 滤除日内噪音，把握大趋势 |
| **1小时 (`1h`)** | `5d`, **`1mo`**, `3mo`, `6mo`, `1y` | **`--interval 1h --period 1mo`** | 最新约 120 根 (月度分时) | `YYYY-MM-DD HH:mm` | 数天至数周日内波段切入 |
| **5分钟 (`5m`)** | `1d`, **`5d`**, `1mo` | **`--interval 5m --period 5d`** | 最新约 150 根 (2日高频) | `YYYY-MM-DD HH:mm` | 超短线精准择时与盘中监控 |

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

服务默认在 `http://localhost:3000` 启动，内置 Yahoo Finance 反向代理，支持即开即用。在页面上方选择**数据维度**，右侧下拉框将**自动联动匹配该维度的热门跨度**。

### 3. 构建生产版本

```bash
npm run build
```

生产构建产物将输出至 `dist/` 目录。

---

## 🐍 Python 自动化脚本使用 (`fetch_data.py`)

如果您需要在服务器、本地命令行或自动化定时任务（如 GitHub Actions）中批量抓取数据，可使用根目录下的 `fetch_data.py`。

脚本支持通过 `--interval` 指定**数据维度**，通过 `--period` 指定**时间跨度**。

### 1. 依赖安装

```bash
pip install -r requirements.txt
```

### 2. 命令行参数说明

| 参数 | 类型 | 默认值 | 说明 |
| :--- | :--- | :--- | :--- |
| `--tickers` | string | `GC=F,MU,NVDA,SOXQ` | 标的代码列表，支持逗号或空格分隔，如 `"TSM,NVDA,AAPL"` |
| `--interval` | string | `1d` | **数据维度**：可选 `1d` (日线)、`1wk` (周线)、`1h` (1小时)、`5m` (5分钟) |
| `--period` | string | `3mo` (随维度自动适配) | **时间跨度**：如 `3mo`、`1y`、`1mo`、`5d` 等 |

### 3. 执行命令示例 (维度 + 跨度)

```bash
# 示例 1: 日线 + 3个月跨度 (抓取台积电与英伟达季度日K线)
python fetch_data.py --tickers "TSM,NVDA" --interval "1d" --period "3mo"

# 示例 2: 周线 + 1年跨度 (抓取年度中长线宏观周K线)
python fetch_data.py --tickers "TSM,AAPL,MSFT" --interval "1wk" --period "1y"

# 示例 3: 1小时分时 + 1个月跨度 (抓取小时级别波段K线)
python fetch_data.py --tickers "TSM,NVDA" --interval "1h" --period "1mo"

# 示例 4: 5分钟分时 + 5天跨度 (抓取一周内日内高频分时K线)
python fetch_data.py --tickers "TSM,SOXQ" --interval "5m" --period "5d"

# 示例 5: 默认快速运行 (日线 1d + 默认热门跨度 3mo)
python fetch_data.py
```

### 4. 导出文件命名

数据清洗完成后将保存至 `kline_data/` 目录，文件名遵循安全与维度标定规范：
- 日线：`TSM_1d_kline.csv`
- 周线：`TSM_1wk_kline.csv`
- 1小时：`TSM_1h_kline.csv`
- 5分钟：`TSM_5m_kline.csv`
- 特殊符号（如黄金期货 `GC=F`）自动转换为安全文件名：`GC_F_1d_kline.csv`

---

## 🤖 GitHub Actions 每日自动下载与自选股票配置

系统包含预置的自动化 GitHub Actions 工作流（`.github/workflows/daily_kline_download.yml`），由 `watchlist_config.json` 驱动：

### 1. 定时触发机制
- **调度时间**：`cron: '30 20 * * 1-5'`（周一至周五 美东时间 16:30 收盘后，即 UTC 20:30 / 北京时间次日凌晨 04:30）。
- **手动触发**：支持在 GitHub 仓库页面随时点击 **「Actions」→「Run workflow」** 手动立即执行。

### 2. 配置文件 (`watchlist_config.json`)
```json
{
  "schedule": {
    "description": "美股收盘后每日定时自动抓取 (周一至周五 美东时间 16:30)",
    "cron": "30 20 * * 1-5"
  },
  "timeframes": [
    { "interval": "1d", "period": "3mo", "label": "日线 3个月" },
    { "interval": "1h", "period": "1mo", "label": "1小时 1个月" }
  ],
  "tickers": ["TSM", "NVDA", "AAPL", "MU", "SOXQ"],
  "output_dir": "kline_data"
}
```

### 3. 文件夹层级与独立文件链接
数据将按股票代码建立独立子目录，每个 CSV 文件均在 GitHub 仓库中拥有其永久独立链接：
```text
kline_data/
├── TSM/
│   ├── 1d_kline.csv     # 网页链接: blob/main/kline_data/TSM/1d_kline.csv
│   └── 1h_kline.csv     # 直链下载: raw.githubusercontent.com/.../TSM/1h_kline.csv
├── NVDA/
│   ├── 1d_kline.csv
│   └── 1h_kline.csv
└── ...
```

- **自动 Git 提交推送**：工作流每日抓取后自动 `git commit & push` 到 GitHub 仓库。
- **独立文件直链**：每个 CSV 文件均支持在 GitHub 页面直接查看（Blob 链接）或通过 Raw 链接直接下载。
- **Step Summary 汇总直链表**：在 GitHub Actions 运行记录页自动渲染带每个 CSV 独立超链接的清单。

---

## 📂 项目结构

```text
├── .github/
│   └── workflows/
│       └── daily_kline_download.yml # GitHub Actions 每日定时运行工作流
├── src/
│   ├── App.tsx                      # 交互式主组件 (含三大模式 Tab 切换)
│   ├── components/
│   │   ├── PromptGenerator.tsx      # AI 量化分析 Prompt 智能生成器
│   │   └── WatchlistManager.tsx     # 自选股监控与 GitHub Action 配置面板
│   ├── services/
│   │   └── klineService.ts          # 数据抓取、时区清洗与 Prompt 组装服务
│   ├── types.ts                     # 数据模型与类型定义
│   └── index.css                    # Tailwind CSS 样式
├── watchlist_config.json            # 自选股列表与定时监控配置文件
├── fetch_data.py                    # Python 批量抓取脚本 (支持 --config 读取配置)
├── requirements.txt                 # Python 依赖清单
├── vite.config.ts                   # Vite 配置文件 (含 /api/yahoo 代理转发)
└── README.md                        # 项目说明文档
```

---

## 📄 导出 CSV 数据示例

### 日线 / 周线示例 (`YYYY-MM-DD` 格式)
```csv
Date,Open,High,Low,Close,Volume
2026-10-15,412.50,422.30,410.10,420.22,12543000
2026-10-16,421.00,426.80,419.50,425.08,9842100
...
```

### 1小时 / 5分钟分时示例 (`YYYY-MM-DD HH:mm` 精确到分钟)
```csv
Date,Open,High,Low,Close,Volume
2026-10-20 09:30,420.10,423.50,419.80,422.90,1432000
2026-10-20 09:35,422.80,424.10,421.90,423.60,987000
...
```

---

## 💡 常见问题 (FAQ)

1. **为什么数据维度与时间跨度需要组合选择？**
   - 不同的技术分析级别需要匹配合理的时间范围（如 5 分钟线适合看 1 天或 5 天日内波动，不适合拉取 5 年数据；周线适合看 1 年至 5 年宏观趋势，不适合仅看 1 天）。系统已将各个维度合法、热门的跨度进行了联动绑定。
2. **为什么美股标的 TSM 可以抓取到？**
   - TSM 为台积电在纽交所的上市代码（NYSE: TSM），系统支持直接输入 `TSM`，或在顶部搜索框输入 `台积电` 或 `TSMC` 实时联想添加。
3. **生成的 CSV 文件如何导入量化软件？**
   - 导出的 CSV 文件包含标准的 `Date,Open,High,Low,Close,Volume` 表头，格式规范，可直接无缝导入 Pandas、Backtrader、TradingView、MetaTrader 或 Excel。
