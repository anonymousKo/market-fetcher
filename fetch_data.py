import os
import re
import argparse
import yfinance as yf
import pandas as pd

# 各数据维度交易员常用条数限制
TIMEFRAME_LIMITS = {
    "1d": 60,    # 经典季度交易日
    "1wk": 52,   # 1年周线
    "1h": 120,   # 约1个月主要交易时段
    "5m": 150,   # 约2个交易日分时
}


def clean_ticker_name(ticker: str) -> str:
    """清理标的代码，避免生成文件名时出现非法字符"""
    return re.sub(r'[\\/*?:"<>|=]', '_', ticker)


def fetch_single_ticker(ticker: str, interval="1d", period="3mo") -> pd.DataFrame:
    df = yf.download(ticker, period=period, interval=interval, progress=False)
    if df.empty:
        print(f"⚠️ 标的 {ticker} 未获取到有效数据")
        return pd.DataFrame()

    if isinstance(df.columns, pd.MultiIndex):
        df.columns = df.columns.get_level_values(0)

    df = df[["Open", "High", "Low", "Close", "Volume"]].copy()
    df.reset_index(inplace=True)

    date_col = "Date" if "Date" in df.columns else "Datetime"
    # 根据维度区分时间格式：分时显示到分钟，日周线显示到日期
    if interval in ["1h", "5m"]:
        df["Date"] = pd.to_datetime(df[date_col]).dt.strftime("%Y-%m-%d %H:%M")
    else:
        df["Date"] = pd.to_datetime(df[date_col]).dt.strftime("%Y-%m-%d")

    df = df[["Date", "Open", "High", "Low", "Close", "Volume"]]
    for col in ["Open", "High", "Low", "Close"]:
        df[col] = df[col].round(2)

    limit = TIMEFRAME_LIMITS.get(interval, 60)
    return df.tail(limit)


def parse_args():
    parser = argparse.ArgumentParser(description="Fetch K-line data with dimension and period")
    parser.add_argument("--tickers", type=str, default="", help="标的代码列表，英文逗号分隔，如 TSM,NVDA")
    parser.add_argument("--interval", type=str, default="1d", choices=["1d", "1wk", "1h", "5m"], help="数据维度: 1d(日线), 1wk(周线), 1h(1小时), 5m(5分钟)")
    parser.add_argument("--period", type=str, default="", help="时间跨度: 如 3mo(日线推荐), 1y(周线推荐), 1mo(1小时推荐), 5d(5分钟推荐)")
    args = parser.parse_args()

    # 默认兜底参数
    tickers_str = args.tickers.strip() if args.tickers else "GC=F,MU,NVDA,SOXQ"
    interval_str = args.interval.strip() if args.interval else "1d"

    # 若未指定跨度，则根据维度匹配默认热门跨度
    default_periods = {
        "1d": "3mo",
        "1wk": "1y",
        "1h": "1mo",
        "5m": "5d",
    }
    period_str = args.period.strip() if args.period else default_periods.get(interval_str, "3mo")

    # 标的切分
    target_tickers = [t.strip().upper() for t in re.split(r'[,，;\s]+', tickers_str) if t.strip()]
    return target_tickers, interval_str, period_str


if __name__ == "__main__":
    target_tickers, interval, period = parse_args()
    limit = TIMEFRAME_LIMITS.get(interval, 60)
    print(f"本次运行抓取标的: {target_tickers} | 维度(Interval): {interval} | 跨度(Period): {period} | 提取最新常用: {limit} 根")

    output_dir = "kline_data"
    os.makedirs(output_dir, exist_ok=True)

    github_summary = os.getenv("GITHUB_STEP_SUMMARY")
    if github_summary:
        with open(github_summary, "w", encoding="utf-8") as f:
            f.write(f"# 📊 K 线数据汇总 (维度: {interval} | 跨度: {period})\n\n")

    for ticker in target_tickers:
        print(f"正在抓取 {ticker} ...")
        kline_df = fetch_single_ticker(ticker, interval=interval, period=period)
        if kline_df.empty:
            continue

        csv_text = kline_df.to_csv(index=False)
        safe_name = clean_ticker_name(ticker)

        # 保存独立 CSV 文件 (例如 TSM_1d_kline.csv, TSM_5m_kline.csv)
        file_path = os.path.join(output_dir, f"{safe_name}_{interval}_kline.csv")
        with open(file_path, "w", encoding="utf-8") as f:
            f.write(csv_text)

        # 写入 GitHub 汇总报告折叠展示卡片
        if github_summary:
            with open(github_summary, "a", encoding="utf-8") as f:
                f.write(f"<details><summary><b>点击展开查看：{ticker} ({interval})</b></summary>\n\n")
                f.write(f"```csv\n{csv_text}\n```\n\n</details>\n\n")

    print(f"全部标的抓取完成，数据已存入 {output_dir}/ 目录。")
