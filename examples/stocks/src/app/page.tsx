import fs from "fs";
import path from "path";
import { StockRecord } from "@/lib/types";
import { computeDrawdownEvents } from "@/lib/drawdown";
import { SummaryCards } from "@/components/summary-cards";
import { PriceChart } from "@/components/price-chart";
import { DrawdownTable } from "@/components/drawdown-table";

export default function Home() {
  const raw = fs.readFileSync(path.join(process.cwd(), "qld.json"), "utf-8");
  const data: StockRecord[] = JSON.parse(raw);

  const events = computeDrawdownEvents(data);
  const thresholds = [...new Set(events.map((e) => e.thresholdPct))].sort(
    (a, b) => a - b
  );

  return (
    <main className="container mx-auto py-8 px-4 space-y-8">
      <h1 className="text-3xl font-bold">QLD (ProShares Ultra QQQ) Analysis</h1>
      <SummaryCards data={data} events={events} />
      <PriceChart data={data} />
      <DrawdownTable events={events} thresholds={thresholds} />
    </main>
  );
}
