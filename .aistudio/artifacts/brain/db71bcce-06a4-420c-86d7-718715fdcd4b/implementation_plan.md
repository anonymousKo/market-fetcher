# 按股票代码分文件夹与 GitHub 独立永久文件链接方案

根据您的确认要求，将定时下载的 K 线数据重构为**「按股票代码分文件夹」**的目录结构，并通过 GitHub Actions 自动**提交并推送到 GitHub 仓库**，使每个 CSV 文件在 GitHub 上都拥有其**永久独立的浏览与下载直链**。

---

### 用户确认决策

> [!IMPORTANT]
> - **文件托管与链接提供**：通过 GitHub Actions 自动 `git commit & push` 提交到仓库，由 GitHub 仓库原生提供永久独立文件链接（含网页浏览链接与 Raw 纯文本直链）。
> - **文件夹层级结构**：按股票代码分文件夹，结构规范如下：
>   ```text
>   kline_data/
>   ├── TSM/
>   │   ├── 1d_kline.csv     # 日线数据
>   │   └── 1h_kline.csv     # 1小时数据
>   ├── NVDA/
>   │   ├── 1d_kline.csv
>   │   └── 1h_kline.csv
>   ├── AAPL/
>   │   ├── 1d_kline.csv
>   │   └── 1h_kline.csv
>   └── ...
>   ```
> - **每个 CSV 文件的独立链接形态**：
>   1. **仓库页面链接 (Blob URL)**：`https://github.com/<owner>/<repo>/blob/main/kline_data/{ticker}/{interval}_kline.csv`
>   2. **直接下载直链 (Raw URL)**：`https://raw.githubusercontent.com/<owner>/<repo>/main/kline_data/{ticker}/{interval}_kline.csv`

---

## 1. 架构与流程设计

```
┌────────────────────────────────────────────────────────┐
│               GitHub Action 定时触发运行               │
│               (周一至周五 美东时间 16:30)              │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│     fetch_data.py 执行多周期抓取并按标的建子目录       │
│  - 创建 kline_data/TSM/ 并写入 1d_kline.csv、1h_kline.csv│
│  - 创建 kline_data/NVDA/ 并写入 ...                    │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│     自动 git commit & git push 推送至 GitHub 仓库      │
│  - 检查变动并自动提交 "📊 update kline data: YYYY-MM-DD"│
│  - 永久保存在 GitHub 仓库的 kline_data 文件夹中        │
└───────────────────────────┬────────────────────────────┘
                            │
                            ▼
┌────────────────────────────────────────────────────────┐
│          生成每个文件的独立访问与下载链接              │
│  - 写入 GITHUB_STEP_SUMMARY 汇总直链表格               │
│  - Web 端提供每个标的子文件夹的路径与永久链接生成工具   │
└────────────────────────────────────────────────────────┘
```

---

## 2. 详细改造步骤

### 步骤 A：升级 Python 脚本 (`fetch_data.py`)
- 将原本平铺的 `{safe_name}_{interval}_kline.csv` 改为按标的建立子文件夹：
  - 标的目录：`os.path.join(output_dir, safe_name)`（如 `kline_data/TSM/`）；
  - 文件命名：`{interval}_kline.csv`（如 `1d_kline.csv`、`1h_kline.csv`、`5m_kline.csv`）；
  - 自动创建父级目录（`os.makedirs(ticker_dir, exist_ok=True)`）。
- 在汇总报告中输出规范的相对路径（如 `kline_data/TSM/1d_kline.csv`）及对应的仓库访问链接模板。

### 步骤 B：改造 GitHub Actions 工作流 (`.github/workflows/daily_kline_download.yml`)
- 授予工作流写入权限：`permissions: contents: write`；
- 新增 Git 提交与推送步骤：
  - 配置 `git config user.name "github-actions[bot]"`；
  - 暂存 `git add kline_data/`；
  - 仅在有实际数据变更时自动提交并 `git push`（带有 `[skip ci]` 避免循环触发）；
- 在 `$GITHUB_STEP_SUMMARY` 运行摘要中输出每个 CSV 文件的两个独立链接：
  - **点击在线预览**（GitHub 页面）
  - **点击直接下载**（Raw 文件）

### 步骤 C：升级 Web 界面 (`src/components/WatchlistManager.tsx`)
- 在「自选监控与 GitHub Action」面板中更新文件夹层级展示；
- 浏览器模拟测试运行生成的表格中，清晰展示每个文件的完整目录路径（例如 `kline_data/TSM/1d_kline.csv`）；
- 新增「每个 CSV 的仓库独立直链」预览卡片，用户只需输入或自动读取自己的 GitHub 仓库名，即可一键复制每个 CSV 文件的 GitHub 直链；
- 更新 `watchlist_config.json` 标注 `"folder_structure": "by_ticker"`。

---

## 3. 验证步骤

1. **测试 Python 脚本目录生成**：在本地运行 `python3 fetch_data.py --config watchlist_config.json`，验证是否生成 `kline_data/{ticker}/{interval}_kline.csv` 层级。
2. **检查 GitHub Actions 权限与命令**：核验工作流中的 `git add`、`commit`、`push` 逻辑与 `GITHUB_STEP_SUMMARY` 链接生成。
3. **前端展示验证**：在网页端查看自选股管理界面，验证目录结构、单文件下载及链接生成逻辑。
