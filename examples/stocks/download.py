import yfinance as yf
import json
import sys
import os

tickers = {
    "QLD": "2006-06-19",
    "QQQ": "1999-03-10",
}

if len(sys.argv) > 1:
    targets = [t.upper() for t in sys.argv[1:]]
else:
    targets = list(tickers.keys())

for ticker in targets:
    start = tickers.get(ticker)
    if not start:
        print(f"Unknown ticker: {ticker}")
        continue

    df = yf.download(ticker, start=start)
    df.columns = df.columns.get_level_values(0)

    records = []
    for date, row in df.iterrows():
        records.append({
            "date": date.strftime("%Y-%m-%d"),
            "open": round(float(row["Open"]), 4),
            "high": round(float(row["High"]), 4),
            "low": round(float(row["Low"]), 4),
            "close": round(float(row["Close"]), 4),
            "volume": int(row["Volume"]),
        })

    filename = f"{ticker.lower()}.json"
    with open(os.path.join(os.path.dirname(__file__), filename), "w") as f:
        json.dump(records, f, indent=2)

    print(f"Saved {len(records)} records to {filename}")
