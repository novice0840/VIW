import { StockRecord, DrawdownEvent, FutureReturn } from "./types";

function addYears(dateStr: string, years: number): string {
  const d = new Date(dateStr);
  d.setFullYear(d.getFullYear() + years);
  return d.toISOString().slice(0, 10);
}

function findRecordAfter(
  data: StockRecord[],
  fromDate: string,
  years: number
): FutureReturn {
  const targetDate = addYears(fromDate, years);

  let lo = 0;
  let hi = data.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (data[mid].date < targetDate) {
      lo = mid + 1;
    } else {
      hi = mid;
    }
  }

  if (lo >= data.length || data[lo].date < targetDate) {
    return { date: null, price: null, returnPct: null };
  }

  const record = data[lo];
  const fromRecord = data.find((r) => r.date === fromDate)!;
  return {
    date: record.date,
    price: record.close,
    returnPct:
      Math.round(
        ((record.close - fromRecord.close) / fromRecord.close) * 10000
      ) / 100,
  };
}

export function computeDrawdownEvents(data: StockRecord[]): DrawdownEvent[] {
  const sorted = [...data].sort((a, b) => a.date.localeCompare(b.date));
  const events: DrawdownEvent[] = [];

  let peakPrice = 0;
  let peakDate = "";
  const triggeredThresholds = new Set<number>();

  for (const record of sorted) {
    if (record.close > peakPrice) {
      peakPrice = record.close;
      peakDate = record.date;
      triggeredThresholds.clear();
    }

    const drawdownPct = ((record.close - peakPrice) / peakPrice) * 100;

    for (let n = 1; n * 10 <= Math.abs(drawdownPct); n++) {
      const threshold = n * 10;
      if (triggeredThresholds.has(threshold)) continue;

      triggeredThresholds.add(threshold);

      events.push({
        date: record.date,
        close: record.close,
        peakDate,
        peakPrice,
        drawdownPct: Math.round(drawdownPct * 100) / 100,
        thresholdPct: threshold,
        after1y: findRecordAfter(sorted, record.date, 1),
        after3y: findRecordAfter(sorted, record.date, 3),
        after5y: findRecordAfter(sorted, record.date, 5),
      });
    }
  }

  return events;
}
