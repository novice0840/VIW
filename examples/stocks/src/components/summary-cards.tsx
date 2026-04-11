import {
  Card,
  CardHeader,
  CardTitle,
  CardContent,
} from "@/components/ui/card";
import { StockRecord, DrawdownEvent } from "@/lib/types";

interface SummaryCardsProps {
  data: StockRecord[];
  events: DrawdownEvent[];
}

export function SummaryCards({ data, events }: SummaryCardsProps) {
  const lastRecord = data[data.length - 1];
  const firstRecord = data[0];

  let athPrice = 0;
  let athDate = "";
  for (const r of data) {
    if (r.close > athPrice) {
      athPrice = r.close;
      athDate = r.date;
    }
  }

  const totalReturn =
    ((lastRecord.close - firstRecord.close) / firstRecord.close) * 100;

  const cards = [
    {
      title: "현재가",
      value: `$${lastRecord.close.toFixed(2)}`,
      sub: lastRecord.date,
    },
    {
      title: "최고가 (ATH)",
      value: `$${athPrice.toFixed(2)}`,
      sub: athDate,
    },
    {
      title: "총 수익률",
      value: `${totalReturn >= 0 ? "+" : ""}${totalReturn.toFixed(1)}%`,
      sub: `${firstRecord.date} ~ ${lastRecord.date}`,
    },
    {
      title: "Drawdown 이벤트",
      value: `${events.length}건`,
      sub: `${new Set(events.map((e) => e.thresholdPct)).size}개 임계값`,
    },
  ];

  return (
    <div className="grid grid-cols-2 gap-4 lg:grid-cols-4">
      {cards.map((card) => (
        <Card key={card.title}>
          <CardHeader className="pb-2">
            <CardTitle className="text-sm font-medium text-muted-foreground">
              {card.title}
            </CardTitle>
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{card.value}</div>
            <p className="text-xs text-muted-foreground mt-1">{card.sub}</p>
          </CardContent>
        </Card>
      ))}
    </div>
  );
}
