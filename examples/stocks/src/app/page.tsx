import fs from "fs";
import path from "path";
import { StockRecord } from "@/lib/types";
import { computeDrawdownEvents } from "@/lib/drawdown";
import { StockDashboard } from "@/components/stock-dashboard";

interface TickerConfig {
  ticker: string;
  label: string;
  file: string;
}

const tickers: TickerConfig[] = [
  { ticker: "QLD", label: "QLD (ProShares Ultra QQQ)", file: "qld.json" },
  { ticker: "QQQ", label: "QQQ (Invesco QQQ Trust)", file: "qqq.json" },
];

function loadTicker(config: TickerConfig) {
  const raw = fs.readFileSync(path.join(process.cwd(), config.file), "utf-8");
  const data: StockRecord[] = JSON.parse(raw);
  const events = computeDrawdownEvents(data);
  const thresholds = [...new Set(events.map((e) => e.thresholdPct))].sort(
    (a, b) => a - b
  );
  return { data, events, thresholds };
}

export default function Home() {
  const tickerData = tickers.map((config) => ({
    ...config,
    ...loadTicker(config),
  }));

  return (
    <main className="container mx-auto py-8 px-4 space-y-8">
      <h1 className="text-3xl font-bold">Stock Drawdown Analysis</h1>
      <StockDashboard tickers={tickerData} />
    </main>
  );
}
