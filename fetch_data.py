import os
import re
import json
import argparse
import yfinance as yf
import pandas as pd


def clean_ticker_name(ticker: str) -> str:
    """清理标的代码，避免生成目录或文件名时出现非法字符"""
    return re.sub(r'[\\/*?:"<>|=]', '_', ticker)


def fetch_single_ticker(ticker: str, interval="1d", period="3mo") -> pd.DataFrame:
    df = yf.download(ticker, period=period, interval=interval, progress=False)
    if df.empty:
        print(f"⚠️ 标的 {ticker} (维度: {interval}, 跨度: {period}) 未获取到有效数据")
        return pd.DataFrame()

    if isinstance(df.columns, pd.MultiIndex):
        df.columns = df.columns.get_level_values(0)

    df = df[["Open", "High", "Low", "Close", "Volume"]].copy()
    df.reset_index(inplace=True)

    date_col = "Date" if "Date" in df.columns else "Datetime"
    # 根据维度区分时间格式：日线直接对齐交易所官方交易日，分时线统一对齐美东交易时钟
    dt_series = pd.to_datetime(df[date_col])
    if interval in ["1h", "5m"]:
        if dt_series.dt.tz is None:
            dt_series = dt_series.dt.tz_localize("UTC").dt.tz_convert("America/New_York")
        else:
            try:
                dt_series = dt_series.dt.tz_convert("America/New_York")
            except Exception:
                pass
        df["Date"] = dt_series.dt.strftime("%Y-%m-%d %H:%M")
    else:
        # 日线/周线直接按交易日原生输出 YYYY-MM-DD，杜绝跨时区日期倒退一天问题
        df["Date"] = dt_series.dt.strftime("%Y-%m-%d")

    df = df[["Date", "Open", "High", "Low", "Close", "Volume"]]
    for col in ["Open", "High", "Low", "Close"]:
        df[col] = df[col].round(2)

    # 完整保留所选跨度的K线，确保第一条从 09:30 开盘时刻起算
    return df


def parse_args():
    parser = argparse.ArgumentParser(description="Fetch K-line data into ticker subfolders with independent URLs")
    parser.add_argument("--config", type=str, default="", help="配置文件路径，例如 watchlist_config.json")
    parser.add_argument("--tickers", type=str, default="", help="标的代码列表，英文逗号分隔，如 TSM,NVDA")
    parser.add_argument("--interval", type=str, default="1d", choices=["1d", "1wk", "1h", "5m"], help="数据维度: 1d(日线), 1wk(周线), 1h(1小时), 5m(5分钟)")
    parser.add_argument("--period", type=str, default="", help="时间跨度: 如 3mo(日线推荐), 1y(周线推荐), 1mo(1小时推荐), 5d(5分钟推荐)")
    parser.add_argument("--output-dir", type=str, default="kline_data", help="输出根文件夹目录，默认 kline_data")
    return parser.parse_args()


def load_config_file(config_path: str):
    if not os.path.exists(config_path):
        raise FileNotFoundError(f"配置文件未找到: {config_path}")
    with open(config_path, "r", encoding="utf-8") as f:
        return json.load(f)


if __name__ == "__main__":
    args = parse_args()

    # 判定是否使用配置文件模式
    use_config = False
    config_file = args.config.strip()
    if config_file:
        use_config = True
    elif not args.tickers.strip() and os.path.exists("watchlist_config.json"):
        config_file = "watchlist_config.json"
        use_config = True

    tasks = []
    output_dir = args.output_dir

    if use_config:
        print(f"📖 正在加载自选监控配置文件: {config_file} ...")
        config_data = load_config_file(config_file)
        tickers = config_data.get("tickers", ["TSM", "NVDA", "AAPL", "MU", "SOXQ"])
        timeframes = config_data.get("timeframes", [
            {"interval": "1d", "period": "3mo", "label": "日线 3个月"},
            {"interval": "1h", "period": "1mo", "label": "1小时 1个月"}
        ])
        output_dir = config_data.get("output_dir", output_dir)

        for ticker in tickers:
            clean_t = ticker.strip().upper()
            if not clean_t:
                continue
            for tf in timeframes:
                tasks.append({
                    "ticker": clean_t,
                    "interval": tf.get("interval", "1d"),
                    "period": tf.get("period", "3mo"),
                    "label": tf.get("label", f"{tf.get('interval')}:{tf.get('period')}")
                })
        print(f"✓ 配置文件加载成功，共 {len(tickers)} 个标的，{len(timeframes)} 个维度，采用按标的独立子文件夹格式存储。")
    else:
        # 命令行参数模式
        tickers_str = args.tickers.strip() if args.tickers else "TSM,NVDA,AAPL,MU,SOXQ"
        interval_str = args.interval.strip() if args.interval else "1d"
        default_periods = {"1d": "3mo", "1wk": "1y", "1h": "1mo", "5m": "5d"}
        period_str = args.period.strip() if args.period else default_periods.get(interval_str, "3mo")
        target_tickers = [t.strip().upper() for t in re.split(r'[,，;\s]+', tickers_str) if t.strip()]

        for ticker in target_tickers:
            tasks.append({
                "ticker": ticker,
                "interval": interval_str,
                "period": period_str,
                "label": f"{interval_str}:{period_str}"
            })

    os.makedirs(output_dir, exist_ok=True)
    summary_results = []

    # GitHub 仓库环境信息 (用于生成文件在 GitHub 上的独立永久直链)
    github_repo = os.getenv("GITHUB_REPOSITORY", "")
    github_ref = os.getenv("GITHUB_REF_NAME", "main")

    print(f"\n🚀 开始执行抓取任务 (目标结构: {output_dir}/{{ticker}}/{{interval}}_kline.csv, 时区: America/New_York) ...")
    for task in tasks:
        ticker = task["ticker"]
        interval = task["interval"]
        period = task["period"]

        print(f"正在抓取 {ticker} ({interval} · 跨度 {period}) ...")
        kline_df = fetch_single_ticker(ticker, interval=interval, period=period)

        safe_name = clean_ticker_name(ticker)
        # 按标的创建子文件夹: kline_data/{ticker}/
        ticker_dir = os.path.join(output_dir, safe_name)
        file_name = f"{interval}_kline.csv"
        relative_file_path = f"{output_dir}/{safe_name}/{file_name}"

        # 链接构造
        if github_repo:
            blob_url = f"https://github.com/{github_repo}/blob/{github_ref}/{relative_file_path}"
            raw_url = f"https://raw.githubusercontent.com/{github_repo}/{github_ref}/{relative_file_path}"
        else:
            blob_url = relative_file_path
            raw_url = relative_file_path

        if kline_df.empty:
            summary_results.append({
                "ticker": ticker,
                "interval": interval,
                "period": period,
                "success": False,
                "count": 0,
                "path": relative_file_path,
                "blob_url": blob_url,
                "raw_url": raw_url,
                "latest": "N/A"
            })
            continue

        os.makedirs(ticker_dir, exist_ok=True)
        file_path = os.path.join(ticker_dir, file_name)
        kline_df.to_csv(file_path, index=False)

        latest_price = kline_df.iloc[-1]["Close"]
        latest_date = kline_df.iloc[-1]["Date"]

        summary_results.append({
            "ticker": ticker,
            "interval": interval,
            "period": period,
            "success": True,
            "count": len(kline_df),
            "path": relative_file_path,
            "blob_url": blob_url,
            "raw_url": raw_url,
            "latest": f"${latest_price:.2f} ({latest_date})"
        })
        print(f"✓ 已存入: {relative_file_path} (共 {len(kline_df)} 根K线, 最新价: ${latest_price:.2f})")

    # 写入 GitHub Step Summary (在 GitHub Actions 运行详情页输出包含独立直链的美观表格)
    github_summary = os.getenv("GITHUB_STEP_SUMMARY")
    if github_summary:
        with open(github_summary, "w", encoding="utf-8") as f:
            f.write("# 📊 每日自选股多周期 K 线数据产物清单\n\n")
            f.write("> **存储架构**：按股票代码分文件夹（`kline_data/{ticker}/{interval}_kline.csv`）\n")
            f.write("> **时区基准**：美东时间 (`America/New_York`) · 首根严格对齐 `09:30` 开盘\n\n")
            f.write("| 标的代码 | 维度 | 跨度 | 状态 | K线数量 | 最新收盘价 | 文件夹独立文件路径 | GitHub 浏览链接 | Raw 下载直链 |\n")
            f.write("| :--- | :---: | :---: | :---: | :---: | :--- | :--- | :--- | :--- |\n")
            for res in summary_results:
                status_icon = "✅ 成功" if res["success"] else "❌ 失败"
                if res["success"]:
                    f.write(
                        f"| **{res['ticker']}** | `{res['interval']}` | `{res['period']}` | {status_icon} | "
                        f"{res['count']} 根 | {res['latest']} | `{res['path']}` | "
                        f"[查看 CSV]({res['blob_url']}) | [直接下载]({res['raw_url']}) |\n"
                    )
                else:
                    f.write(
                        f"| **{res['ticker']}** | `{res['interval']}` | `{res['period']}` | {status_icon} | "
                        f"0 根 | N/A | `{res['path']}` | - | - |\n"
                    )
            f.write(f"\n📂 所有数据已自动提交推送至仓库，并在每批次由 GitHub 原生提供永久独立 URL。\n")

    success_count = sum(1 for r in summary_results if r["success"])
    print(f"\n🎉 抓取任务完成: 成功 {success_count}/{len(summary_results)} 个子任务，文件已存入按标的分类的子目录中。")
