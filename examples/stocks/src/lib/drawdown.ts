import { StockRecord, DrawdownEvent } from "./types";

function addOneYear(dateStr: string): string {
  const d = new Date(dateStr);
  d.setFullYear(d.getFullYear() + 1);
  return d.toISOString().slice(0, 10);
}

function findOneYearLater(
  data: StockRecord[],
  fromDate: string
): StockRecord | null {
  const targetDate = addOneYear(fromDate);

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

  if (lo >= data.length) return null;
  if (data[lo].date < targetDate) return null;

  return data[lo];
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

      const later = findOneYearLater(sorted, record.date);

      events.push({
        date: record.date,
        close: record.close,
        peakDate,
        peakPrice,
        drawdownPct: Math.round(drawdownPct * 100) / 100,
        thresholdPct: threshold,
        oneYearLaterDate: later?.date ?? null,
        oneYearLaterPrice: later?.close ?? null,
        oneYearReturn: later
          ? Math.round(((later.close - record.close) / record.close) * 10000) /
            100
          : null,
      });
    }
  }

  return events;
}
