export interface StockRecord {
  date: string;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
}

export interface DrawdownEvent {
  date: string;
  close: number;
  peakDate: string;
  peakPrice: number;
  drawdownPct: number;
  thresholdPct: number;
  oneYearLaterDate: string | null;
  oneYearLaterPrice: number | null;
  oneYearReturn: number | null;
}
