import { StockRecord, DrawdownEvent, FutureReturn } from "./types";

function addYears(dateStr: string, years: number): string {
  const d = new Date(dateStr);
  d.setFullYear(d.getFullYear() + years);
  return d.toISOString().slice(0, 10);
}

function binarySearchDate(data: StockRecord[], targetDate: string): number {
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
  return lo;
}

function findRecordAfter(
  data: StockRecord[],
  fromDate: string,
  years: number
): FutureReturn {
  const targetDate = addYears(fromDate, years);
  const idx = binarySearchDate(data, targetDate);

  if (idx >= data.length || data[idx].date < targetDate) {
    return { date: null, price: null, returnPct: null };
  }

  const fromIdx = binarySearchDate(data, fromDate);
  if (fromIdx >= data.length || data[fromIdx].date !== fromDate) {
    return { date: null, price: null, returnPct: null };
  }

  const fromClose = data[fromIdx].close;
  const toClose = data[idx].close;
  return {
    date: data[idx].date,
    price: toClose,
    returnPct: Math.round(((toClose - fromClose) / fromClose) * 10000) / 100,
  };
}

/**
 * @param reference - 하락 감지 기준 데이터 (QQQ)
 * @param target - 수익률 계산 대상 데이터 (QLD 또는 QQQ)
 */
export function computeDrawdownEvents(
  reference: StockRecord[],
  target: StockRecord[]
): DrawdownEvent[] {
  const refSorted = [...reference].sort((a, b) => a.date.localeCompare(b.date));
  const tgtSorted = [...target].sort((a, b) => a.date.localeCompare(b.date));
  const events: DrawdownEvent[] = [];

  let peakPrice = 0;
  let peakDate = "";
  const triggeredThresholds = new Set<number>();

  for (const record of refSorted) {
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
        after1y: findRecordAfter(tgtSorted, record.date, 1),
        after3y: findRecordAfter(tgtSorted, record.date, 3),
        after5y: findRecordAfter(tgtSorted, record.date, 5),
      });
    }
  }

  return events;
}
