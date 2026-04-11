import json
import os

dir = os.path.dirname(__file__)

with open(os.path.join(dir, "qqq.json")) as f:
    qqq = json.load(f)

with open(os.path.join(dir, "qld.json")) as f:
    qld = json.load(f)

# QQQ 데이터에서 QLD 상장일(2006-06-21) 이전 데이터 추출
qld_start = qld[0]["date"]
qqq_before = [r for r in qqq if r["date"] < qld_start]

if not qqq_before:
    print("No QQQ data before QLD start date")
    exit()

# QLD 첫날 종가로 스케일링하기 위해 역방향으로 시뮬레이션
# QLD 첫날 close = 0.9834
qld_first_close = qld[0]["close"]

# QQQ의 QLD 상장 직전 거래일 종가 (스케일링 기준점)
qqq_anchor_close = qqq_before[-1]["close"]

# 역방향으로 QLD 시뮬레이션 가격 생성
# 먼저 QQQ 일일 수익률로 2x 레버리지 누적 수익률 계산
# simulated_close[i] 기준: 마지막 날의 close가 qld_first_close와 연결되도록

# 1) QQQ 일일 수익률 계산 (qqq_before 범위)
daily_returns = []
for i in range(1, len(qqq_before)):
    prev_close = qqq_before[i - 1]["close"]
    curr_close = qqq_before[i]["close"]
    daily_returns.append((curr_close - prev_close) / prev_close)

# 2) 2x 레버리지 적용하여 순방향 누적 가격 계산
# prices[0] = 임의값, 이후 2x 수익률로 누적
prices = [1.0]  # 시작점 (나중에 스케일링)
for r in daily_returns:
    prices.append(prices[-1] * (1 + 2 * r))

# 3) 마지막 simulated 가격이 qld_first_close가 되도록 스케일링
# prices[-1]은 qqq_before의 마지막 날에 대응
# QLD 첫날은 qqq_before 마지막 날 다음 거래일이므로
# qqq_before[-1] 날의 simulated QLD close에서 -> QLD 첫날로 이어져야 함
# QLD 첫날의 QQQ 수익률을 적용하면 QLD 첫날 가격이 나와야 함
# 여기서는 qqq_before[-1]의 simulated close가 QLD 전일 종가 역할

# QLD 상장일의 QQQ 수익률 계산
qqq_on_qld_start = next(r for r in qqq if r["date"] == qld_start)
qqq_prev = qqq_before[-1]
qld_start_qqq_return = (qqq_on_qld_start["close"] - qqq_prev["close"]) / qqq_prev["close"]

# simulated_prev_close * (1 + 2 * qld_start_qqq_return) = qld_first_close
simulated_prev_close = qld_first_close / (1 + 2 * qld_start_qqq_return)

scale = simulated_prev_close / prices[-1]
prices = [p * scale for p in prices]

# 4) OHLC 모두 같은 비율로 스케일링
simulated_records = []
for i, record in enumerate(qqq_before):
    qqq_close = record["close"]
    sim_close = prices[i]
    ratio = sim_close / qqq_close if qqq_close != 0 else 1

    simulated_records.append({
        "date": record["date"],
        "open": round(record["open"] * ratio, 4),
        "high": round(record["high"] * ratio, 4),
        "low": round(record["low"] * ratio, 4),
        "close": round(sim_close, 4),
        "volume": 0,  # 실제 거래량 없음
    })

# 5) 시뮬레이션 데이터 + 실제 QLD 데이터 합치기
combined = simulated_records + qld

with open(os.path.join(dir, "qld.json"), "w") as f:
    json.dump(combined, f, indent=2)

print(f"Backfilled {len(simulated_records)} simulated records (1999~2006)")
print(f"Total QLD records: {len(combined)}")
print(f"Simulated last close: ${prices[-1]:.4f}")
print(f"Actual QLD first close: ${qld_first_close}")
