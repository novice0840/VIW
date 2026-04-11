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
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { DrawdownEvent } from "@/lib/types";

interface DrawdownTableProps {
  events: DrawdownEvent[];
  thresholds: number[];
}

export function DrawdownTable({ events, thresholds }: DrawdownTableProps) {
  const [selectedThreshold, setSelectedThreshold] = useState<string>("all");

  const filtered =
    selectedThreshold === "all"
      ? events
      : events.filter((e) => e.thresholdPct === Number(selectedThreshold));

  return (
    <Card>
      <CardHeader className="flex flex-row items-center justify-between space-y-0">
        <CardTitle>고점 대비 하락 분석</CardTitle>
        <Select value={selectedThreshold} onValueChange={setSelectedThreshold}>
          <SelectTrigger className="w-[140px]">
            <SelectValue placeholder="임계값 선택" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">전체</SelectItem>
            {thresholds.map((t) => (
              <SelectItem key={t} value={String(t)}>
                {t}% 이상 하락
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
      </CardHeader>
      <CardContent>
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
                <TableHead>1년 후 날짜</TableHead>
                <TableHead className="text-right">1년 후 가격</TableHead>
                <TableHead className="text-right">1년 후 수익률</TableHead>
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
                  <TableCell>
                    {event.oneYearLaterDate ?? (
                      <span className="text-muted-foreground">N/A</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right">
                    {event.oneYearLaterPrice != null ? (
                      `$${event.oneYearLaterPrice.toFixed(2)}`
                    ) : (
                      <span className="text-muted-foreground">N/A</span>
                    )}
                  </TableCell>
                  <TableCell className="text-right font-medium">
                    {event.oneYearReturn != null ? (
                      <span
                        className={
                          event.oneYearReturn >= 0
                            ? "text-green-600"
                            : "text-red-500"
                        }
                      >
                        {event.oneYearReturn >= 0 ? "+" : ""}
                        {event.oneYearReturn.toFixed(1)}%
                      </span>
                    ) : (
                      <span className="text-muted-foreground">N/A</span>
                    )}
                  </TableCell>
                </TableRow>
              ))}
              {filtered.length === 0 && (
                <TableRow>
                  <TableCell
                    colSpan={9}
                    className="h-24 text-center text-muted-foreground"
                  >
                    해당 임계값의 이벤트가 없습니다.
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
