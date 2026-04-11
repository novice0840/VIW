"use client";

import {
  AreaChart,
  Area,
  XAxis,
  YAxis,
  CartesianGrid,
} from "recharts";
import {
  ChartContainer,
  ChartTooltip,
  ChartTooltipContent,
  type ChartConfig,
} from "@/components/ui/chart";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { StockRecord } from "@/lib/types";

const chartConfig = {
  close: {
    label: "종가",
    color: "hsl(221.2 83.2% 53.3%)",
  },
} satisfies ChartConfig;

interface PriceChartProps {
  data: StockRecord[];
}

export function PriceChart({ data }: PriceChartProps) {
  return (
    <Card>
      <CardHeader>
        <CardTitle>QLD 가격 추이</CardTitle>
      </CardHeader>
      <CardContent>
        <ChartContainer config={chartConfig} className="h-[400px] w-full">
          <AreaChart data={data} margin={{ top: 10, right: 10, left: 0, bottom: 0 }}>
            <defs>
              <linearGradient id="fillClose" x1="0" y1="0" x2="0" y2="1">
                <stop offset="5%" stopColor="var(--color-close)" stopOpacity={0.8} />
                <stop offset="95%" stopColor="var(--color-close)" stopOpacity={0.1} />
              </linearGradient>
            </defs>
            <CartesianGrid vertical={false} />
            <XAxis
              dataKey="date"
              tickFormatter={(v: string) => v.slice(0, 4)}
              interval={Math.floor(data.length / 8)}
              tickLine={false}
              axisLine={false}
            />
            <YAxis
              tickLine={false}
              axisLine={false}
              tickFormatter={(v: number) => `$${v}`}
            />
            <ChartTooltip
              content={
                <ChartTooltipContent
                  labelFormatter={(label: string) => label}
                />
              }
            />
            <Area
              dataKey="close"
              type="monotone"
              fill="url(#fillClose)"
              stroke="var(--color-close)"
              strokeWidth={1.5}
              isAnimationActive={false}
            />
          </AreaChart>
        </ChartContainer>
      </CardContent>
    </Card>
  );
}
