"use client";

import { useState } from "react";
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from "@/components/ui/table";
import { Checkbox } from "@/components/ui/checkbox";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { DrawdownEvent, FutureReturn } from "@/lib/types";

interface DrawdownTableProps {
  events: DrawdownEvent[];
  thresholds: number[];
  ticker: string;
}

function computeStats(events: DrawdownEvent[], key: "after1y" | "after3y" | "after5y") {
  const withReturn = events.filter((e) => e[key].returnPct != null);
  if (withReturn.length === 0) return null;

  const wins = withReturn.filter((e) => e[key].returnPct! > 0).length;
  const avg =
    withReturn.reduce((sum, e) => sum + e[key].returnPct!, 0) /
    withReturn.length;

  return {
    total: withReturn.length,
    winRate: (wins / withReturn.length) * 100,
    avgReturn: avg,
  };
}

function ReturnCell({ r }: { r: FutureReturn }) {
  if (r.returnPct == null) {
    return <span className="text-muted-foreground">N/A</span>;
  }
  return (
    <span className={r.returnPct >= 0 ? "text-green-600" : "text-red-500"}>
      {r.returnPct >= 0 ? "+" : ""}
      {r.returnPct.toFixed(1)}%
    </span>
  );
}

function StatRow({
  label,
  stat,
}: {
  label: string;
  stat: { total: number; winRate: number; avgReturn: number } | null;
}) {
  if (!stat) return null;
  return (
    <div className="flex gap-6">
      <span className="text-muted-foreground w-16">{label}</span>
      <div>
        <span className="text-muted-foreground">이벤트</span>
        <span className="ml-1 font-semibold">{stat.total}건</span>
      </div>
      <div>
        <span className="text-muted-foreground">승률</span>
        <span className="ml-1 font-semibold">{stat.winRate.toFixed(1)}%</span>
      </div>
      <div>
        <span className="text-muted-foreground">평균 수익률</span>
        <span
          className={`ml-1 font-semibold ${
            stat.avgReturn >= 0 ? "text-green-600" : "text-red-500"
          }`}
        >
          {stat.avgReturn >= 0 ? "+" : ""}
          {stat.avgReturn.toFixed(1)}%
        </span>
      </div>
    </div>
  );
}

export function DrawdownTable({ events, thresholds, ticker }: DrawdownTableProps) {
  const [checkedThresholds, setCheckedThresholds] = useState<Set<number>>(
    () => new Set(thresholds)
  );

  function toggleThreshold(t: number) {
    setCheckedThresholds((prev) => {
      const next = new Set(prev);
      if (next.has(t)) {
        next.delete(t);
      } else {
        next.add(t);
      }
      return next;
    });
  }

  const filtered = events.filter((e) => checkedThresholds.has(e.thresholdPct));

  const stats1y = computeStats(filtered, "after1y");
  const stats3y = computeStats(filtered, "after3y");
  const stats5y = computeStats(filtered, "after5y");
  const hasStats = stats1y || stats3y || stats5y;

  return (
    <Card>
      <CardHeader>
        <CardTitle>고점 대비 하락 분석</CardTitle>
        <p className="text-sm text-muted-foreground">
          QQQ(Nasdaq-100) 종가 기준으로 고점 대비 N*10% 이상 하락한 시점을 감지하고,
          해당 시점에서 {ticker}에 투자했을 때 1년/3년/5년 후 수익률을 표시합니다.
          고점이 갱신되면 임계값이 리셋되어 새로운 하락 사이클을 별도로 감지합니다.
        </p>
      </CardHeader>
      <CardContent className="space-y-4">
        <div className="flex flex-wrap gap-4">
          {thresholds.map((t) => (
            <label
              key={t}
              className="flex items-center gap-2 cursor-pointer text-sm"
            >
              <Checkbox
                checked={checkedThresholds.has(t)}
                onCheckedChange={() => toggleThreshold(t)}
              />
              {t}% 이상 하락
            </label>
          ))}
        </div>

        {hasStats && (
          <div className="flex flex-col gap-2 rounded-lg border bg-muted/50 p-4 text-sm">
            <StatRow label="1년 후" stat={stats1y} />
            <StatRow label="3년 후" stat={stats3y} />
            <StatRow label="5년 후" stat={stats5y} />
          </div>
        )}

        <div className="rounded-md border overflow-auto max-h-[600px]">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>날짜</TableHead>
                <TableHead>고점 날짜</TableHead>
                <TableHead className="text-right">고점 가격</TableHead>
                <TableHead className="text-right">하락 시 가격</TableHead>
                <TableHead className="text-right">하락률</TableHead>
                <TableHead className="text-center">임계값</TableHead>
                <TableHead className="text-right">1년 후</TableHead>
                <TableHead className="text-right">3년 후</TableHead>
                <TableHead className="text-right">5년 후</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {filtered.map((event, i) => (
                <TableRow key={`${event.date}-${event.thresholdPct}-${i}`}>
                  <TableCell className="font-medium">{event.date}</TableCell>
                  <TableCell>{event.peakDate}</TableCell>
                  <TableCell className="text-right">
                    ${event.peakPrice.toFixed(2)}
                  </TableCell>
                  <TableCell className="text-right">
                    ${event.close.toFixed(2)}
                  </TableCell>
                  <TableCell className="text-right text-red-500">
                    {event.drawdownPct.toFixed(1)}%
                  </TableCell>
                  <TableCell className="text-center">
                    <span className="inline-flex items-center rounded-full bg-muted px-2 py-0.5 text-xs font-medium">
                      {event.thresholdPct}%
                    </span>
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    <ReturnCell r={event.after1y} />
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    <ReturnCell r={event.after3y} />
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    <ReturnCell r={event.after5y} />
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={9}
                    className="h-24 text-center text-muted-foreground"
                  >
                    선택된 임계값의 이벤트가 없습니다.
                  </TableCell>
                </TableRow>
              )}
            </TableBody>
          </Table>
        </div>
      </CardContent>
    </Card>
  );
}
