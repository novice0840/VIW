import fs from "fs";
import path from "path";
import { StockRecord } from "@/lib/types";
import { computeDrawdownEvents } from "@/lib/drawdown";
import { StockDashboard } from "@/components/stock-dashboard";

function loadJson(file: string): StockRecord[] {
  const raw = fs.readFileSync(path.join(process.cwd(), file), "utf-8");
  return JSON.parse(raw);
}

export default function Home() {
  const qqqData = loadJson("qqq.json");
  const qldData = loadJson("qld.json");

  const tickers = [
    {
      ticker: "QLD",
      label: "QLD (ProShares Ultra QQQ)",
      data: qldData,
      events: computeDrawdownEvents(qqqData, qldData),
    },
    {
      ticker: "QQQ",
      label: "QQQ (Invesco QQQ Trust)",
      data: qqqData,
      events: computeDrawdownEvents(qqqData, qqqData),
    },
  ].map((t) => ({
    ...t,
    thresholds: [...new Set(t.events.map((e) => e.thresholdPct))].sort(
      (a, b) => a - b
    ),
  }));

  return (
    <main className="container mx-auto py-8 px-4 space-y-8">
      <h1 className="text-3xl font-bold">Stock Drawdown Analysis</h1>
      <StockDashboard tickers={tickers} />
    </main>
  );
}
