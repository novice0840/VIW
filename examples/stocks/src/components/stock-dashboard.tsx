"use client";

import { Tabs, TabsContent, TabsList, TabsTrigger } from "@/components/ui/tabs";
import { SummaryCards } from "@/components/summary-cards";
import { PriceChart } from "@/components/price-chart";
import { DrawdownTable } from "@/components/drawdown-table";
import { StockRecord, DrawdownEvent } from "@/lib/types";

interface TickerData {
  ticker: string;
  label: string;
  data: StockRecord[];
  events: DrawdownEvent[];
  thresholds: number[];
}

interface StockDashboardProps {
  tickers: TickerData[];
}

export function StockDashboard({ tickers }: StockDashboardProps) {
  return (
    <Tabs defaultValue={tickers[0].ticker}>
      <TabsList>
        {tickers.map((t) => (
          <TabsTrigger key={t.ticker} value={t.ticker}>
            {t.ticker}
          </TabsTrigger>
        ))}
      </TabsList>
      {tickers.map((t) => (
        <TabsContent key={t.ticker} value={t.ticker} className="space-y-8">
          <h2 className="text-xl font-semibold">{t.label}</h2>
          <SummaryCards data={t.data} events={t.events} />
          <PriceChart data={t.data} />
          <DrawdownTable events={t.events} thresholds={t.thresholds} ticker={t.ticker} />
        </TabsContent>
      ))}
    </Tabs>
  );
}
