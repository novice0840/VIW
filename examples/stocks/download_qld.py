import yfinance as yf
import json

df = yf.download("QLD", start="2006-06-19")

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

with open("stocks/qld.json", "w") as f:
    json.dump(records, f, indent=2)

print(f"Saved {len(records)} records")
