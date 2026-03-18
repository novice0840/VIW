import json
import math
import yfinance as yf

ticker = yf.Ticker("KO")
df = ticker.history(period="10y")

# 분기별 EPS 가져오기
quarterly = ticker.quarterly_income_stmt
eps_map = {}
if "Diluted EPS" in quarterly.index:
    for date, val in quarterly.loc["Diluted EPS"].items():
        if not (val is None or (isinstance(val, float) and math.isnan(val))):
            eps_map[date.strftime("%Y-%m-%d")] = round(float(val), 2)

df.index = df.index.strftime("%Y-%m-%d")
df = df.round(2)

records = []
for date, row in df.iterrows():
    record = {
        "date": date,
        "open": row["Open"],
        "high": row["High"],
        "low": row["Low"],
        "close": row["Close"],
        "volume": int(row["Volume"]),
        "dividends": row["Dividends"],
        "stock_splits": row["Stock Splits"],
    }
    if date in eps_map:
        record["eps"] = eps_map[date]
    records.append(record)

with open("data.json", "w", encoding="utf-8") as f:
    json.dump(records, f, indent=2, ensure_ascii=False)

print(f"Saved {len(records)} records to data.json")
print(f"EPS data points: {len(eps_map)}")
