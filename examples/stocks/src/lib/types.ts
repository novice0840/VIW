export interface StockRecord {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface FutureReturn {
  date: string | null;
  price: number | null;
  returnPct: number | null;
}

export interface DrawdownEvent {
  date: string;
  close: number;
  peakDate: string;
  peakPrice: number;
  drawdownPct: number;
  thresholdPct: number;
  after1y: FutureReturn;
  after3y: FutureReturn;
  after5y: FutureReturn;
}
