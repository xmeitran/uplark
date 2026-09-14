"use client";

import React, { useCallback, useMemo, useState } from "react";
import { AlertTriangle, Download, FileSearch } from "lucide-react";
import {
  buildPersonDayMatrix,
  logsForPersonDay,
  OVERLOAD_THRESHOLD_PERCENT,
  UNDERLOAD_THRESHOLD_PERCENT,
  type PersonDayCell,
  type PersonDayRow,
  type TimesheetFilters
} from "./timesheet-selectors";
import { formatDate, formatHours, formatPercent, toneClasses } from "./timesheet-format";
import {
  APPROVAL_STATUS_LABELS,
  WORK_GROUP_LABELS,
  type ApprovalStatus,
  type TimeLog,
  type TimesheetDataset
} from "./timesheet-types";
import { Avatar, EmptyState, Pagination, Pill, SectionCard, TableScroll, Td, Th, usePagination } from "./timesheet-ui";
import type { LogDrawerRequest } from "./timesheet-log-drawer";

const PEOPLE_PAGE_SIZE = 8;
const WEEKDAY_SHORT = ["CN", "T2", "T3", "T4", "T5", "T6", "T7"];

/**
 * Per-person × per-day load matrix — "ai đang được ghi nhận bao nhiêu giờ mỗi ngày".
 *
 * Each cell is a real button: hover or keyboard-focus shows the breakdown of that
 * day's entries, click opens the full drill-down drawer. Hover alone would leave
 * keyboard and touch users with no way in, so both paths exist.
 *
 * Load colour is always measured against the person's OWN standard day
 * (8h × contract ratio), so a part-timer at 4h reads as a full day, not half.
 *
 * NOTE: the detail shows WHAT was worked on, not clock times — neither the mock
 * nor the production `TaskTimeEntry` rows store a start/end time (spec 35 G5).
 */
export function PersonDayLoad({
  dataset,
  filters,
  logs,
  onOpenLogs
}: {
  dataset: TimesheetDataset;
  filters: TimesheetFilters;
  logs: TimeLog[];
  onOpenLogs: (request: LogDrawerRequest) => void;
}) {
  const matrix = useMemo(() => buildPersonDayMatrix(dataset, filters, logs), [dataset, filters, logs]);
  const paged = usePagination(matrix.rows, PEOPLE_PAGE_SIZE);
  const [hover, setHover] = useState<{ row: PersonDayRow; cell: PersonDayCell; x: number; y: number } | null>(null);

  const showDetail = useCallback((event: React.SyntheticEvent<HTMLElement>, row: PersonDayRow, cell: PersonDayCell) => {
    const rect = event.currentTarget.getBoundingClientRect();
    setHover({ row, cell, x: rect.left + rect.width / 2, y: rect.bottom });
  }, []);

  const overloadedPeople = matrix.rows.filter((row) => row.overloadedDays > 0).length;

  const exportExcel = useCallback(() => {
    const escape = (value: string | number) => String(value).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;");
    const cellStyle = (cell: PersonDayCell) => {
      if (!cell.isWorkingDay) return "background:#f1f5f9;color:#94a3b8;";
      if (cell.minutes === 0) return "background:#fee2e2;color:#dc2626;border:1px solid #fca5a5;";
      if (cell.loadPercent > OVERLOAD_THRESHOLD_PERCENT) return "background:#fca5a5;color:#991b1b;";
      if (cell.loadPercent >= UNDERLOAD_THRESHOLD_PERCENT) return "background:#bbf7d0;color:#15803d;";
      return "background:#fef3c7;color:#b45309;";
    };
    const headers = ["Nhân sự", "Định mức/ngày", ...matrix.days.map((day) => `${day.date.slice(8, 10)}/${day.date.slice(5, 7)}`), "Tổng kỳ"];
    const body = matrix.rows.map((row) => `<tr><td><b>${escape(row.person.name)}</b></td><td>${escape(formatHours(row.person.standardMinutesPerDay * row.person.contractRatio))}</td>${row.cells.map((cell) => `<td style="${cellStyle(cell)}">${cell.minutes > 0 ? escape(Math.round(cell.minutes / 6) / 10) : cell.isWorkingDay ? "·" : ""}</td>`).join("")}<td><b>${escape(formatHours(row.totalMinutes))}</b></td></tr>`).join("");
    const totals = `<tr style="font-weight:bold;background:#f8fafc"><td>Tổng theo ngày</td><td></td>${matrix.dayTotals.map((total) => `<td>${total > 0 ? escape(formatHours(total)) : "—"}</td>`).join("")}<td>${escape(formatHours(matrix.dayTotals.reduce((sum, value) => sum + value, 0)))}</td></tr>`;
    const html = `<html><head><meta charset="UTF-8"></head><body><h2>Timesheet — Giờ ghi nhận mỗi ngày theo nhân sự</h2><p>Kỳ báo cáo: ${escape(filters.month)} · Xuất từ bộ lọc hiện tại</p><table border="1" cellspacing="0" cellpadding="5" style="border-collapse:collapse;font-family:Arial;font-size:11px"><thead><tr style="background:#e2e8f0;font-weight:bold">${headers.map((header) => `<th>${escape(header)}</th>`).join("")}</tr></thead><tbody>${body}${totals}</tbody></table><p>Chú thích: ô xanh = đủ ngày chuẩn; ô vàng = dưới ngày chuẩn; ô đỏ = quá tải; ô đỏ nhạt = ngày công chưa ghi nhận; ô xám = cuối tuần/ngày lễ.</p></body></html>`;
    const blob = new Blob([`\ufeff${html}`], { type: "application/vnd.ms-excel;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `timesheet-person-day-${filters.month}.xls`;
    anchor.click();
    URL.revokeObjectURL(url);
  }, [filters.month, matrix]);

  return (
    <SectionCard
      id="person-day-load"
      title="Giờ ghi nhận mỗi ngày theo nhân sự"
      description="Di chuột (hoặc tab) vào một ô để xem chi tiết công việc đã ghi trong ngày; bấm vào ô để mở toàn bộ dòng ghi nhận."
      actions={
        <span className="flex flex-wrap items-center gap-2 text-[11px]">
          <Pill tone={overloadedPeople === 0 ? "success" : "danger"}>
            {overloadedPeople === 0 ? "Không ai quá tải" : `${overloadedPeople} người có ngày quá tải`}
          </Pill>
          <button type="button" onClick={exportExcel} disabled={matrix.rows.length === 0} className="inline-flex items-center gap-1.5 rounded-lg border border-border bg-card px-2.5 py-1.5 text-[11px] font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:cursor-not-allowed disabled:opacity-50" title="Xuất bảng hiện tại sang Excel"><Download className="h-3.5 w-3.5" aria-hidden /> Xuất Excel</button>
        </span>
      }
    >
      {matrix.rows.length === 0 ? (
        <EmptyState message="Không có nhân sự nào khớp bộ lọc hiện tại." />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-3 border-b border-border px-4 py-2 text-[11px] text-muted-foreground">
            <LegendSwatch className="bg-muted" label="Cuối tuần / ngày lễ" />
            <LegendSwatch className="bg-destructive/15 ring-1 ring-inset ring-destructive/40" label="Ngày công chưa ghi nhận" />
            <LegendSwatch className="bg-warning/20" label="Dưới ngày chuẩn" />
            <LegendSwatch className="bg-success/25" label="Đủ ngày chuẩn (90–110%)" />
            <LegendSwatch className="bg-destructive/45" label="Quá tải (>110%)" />
            <span className="ml-auto">Ngày chuẩn tính riêng cho từng người theo tỷ lệ hợp đồng.</span>
          </div>

          <TableScroll>
            <table className="w-full border-collapse" style={{ minWidth: 220 + matrix.days.length * 34 }}>
              <colgroup>
                <col style={{ width: 220 }} />
                {matrix.days.map((day) => (
                  <col key={day.date} style={{ width: 34 }} />
                ))}
                <col style={{ width: 96 }} />
              </colgroup>
              <thead className="border-b border-border bg-muted/40">
                <tr>
                  <Th>Nhân sự</Th>
                  {matrix.days.map((day) => (
                    <th
                      key={day.date}
                      scope="col"
                      className={`px-0 py-2 text-center text-[10px] font-semibold tabular-nums ${day.isWorkingDay ? "text-muted-foreground" : "text-muted-foreground/50"}`}
                    >
                      <span className="block">{Number(day.date.slice(8, 10))}</span>
                      <span className="block text-[9px] font-normal">{WEEKDAY_SHORT[new Date(`${day.date}T00:00:00Z`).getUTCDay()]}</span>
                    </th>
                  ))}
                  <Th align="right">Tổng</Th>
                </tr>
              </thead>
              <tbody onMouseLeave={() => setHover(null)}>
                {paged.items.map((row) => (
                  <tr key={row.person.id} className="border-b border-border">
                    <Td>
                      <span className="flex items-center gap-2">
                        <Avatar initials={row.person.initials} name={row.person.name} />
                        <span className="min-w-0">
                          <span className="block truncate font-semibold" title={row.person.name}>{row.person.name}</span>
                          <span className="block truncate text-[10.5px] text-muted-foreground">
                            {formatHours(row.person.standardMinutesPerDay * row.person.contractRatio)}/ngày
                            {row.overloadedDays > 0 ? <span className="text-destructive"> · {row.overloadedDays} ngày quá tải</span> : null}
                            {row.emptyWorkingDays > 0 ? <span className="text-warning"> · {row.emptyWorkingDays} ngày trống</span> : null}
                          </span>
                        </span>
                      </span>
                    </Td>
                    {row.cells.map((cell) => (
                      <td key={cell.date} className="p-0.5 align-middle">
                        <button
                          type="button"
                          disabled={cell.entryCount === 0}
                          onMouseEnter={(event) => showDetail(event, row, cell)}
                          onFocus={(event) => showDetail(event, row, cell)}
                          onBlur={() => setHover(null)}
                          onClick={() =>
                            onOpenLogs({
                              title: `${row.person.name} — ${formatDate(cell.date)}`,
                              description: `${formatHours(cell.minutes)} · ${cell.entryCount} dòng ghi nhận`,
                              logs: logsForPersonDay(logs, row.person.id, cell.date)
                            })
                          }
                          aria-label={`${row.person.name}, ${formatDate(cell.date)}: ${cell.minutes > 0 ? formatHours(cell.minutes) : "chưa ghi nhận"}`}
                          className={`flex h-8 w-full items-center justify-center rounded text-[10.5px] font-semibold tabular-nums transition-transform disabled:cursor-default ${cellClass(cell)} ${cell.entryCount > 0 ? "hover:scale-110 focus-visible:scale-110" : ""}`}
                        >
                          {cell.minutes > 0 ? Math.round(cell.minutes / 6) / 10 : cell.isWorkingDay ? "·" : ""}
                        </button>
                      </td>
                    ))}
                    <Td align="right" className="font-mono font-bold tabular-nums">{formatHours(row.totalMinutes)}</Td>
                  </tr>
                ))}
              </tbody>
              <tfoot className="border-t-2 border-border bg-muted/40">
                <tr>
                  <Td className="font-bold">Tổng theo ngày</Td>
                  {matrix.dayTotals.map((total, index) => (
                    <td key={matrix.days[index].date} className="px-0 py-2 text-center text-[10px] font-bold tabular-nums text-muted-foreground">
                      {total > 0 ? Math.round(total / 60) : "—"}
                    </td>
                  ))}
                  <Td align="right" className="font-mono font-bold tabular-nums">
                    {formatHours(matrix.dayTotals.reduce((acc, value) => acc + value, 0))}
                  </Td>
                </tr>
              </tfoot>
            </table>
          </TableScroll>
          <Pagination state={paged} unit="nhân sự" />
        </>
      )}

      {hover ? <DayDetailCard dataset={dataset} logs={logs} hover={hover} /> : null}
    </SectionCard>
  );
}

function LegendSwatch({ className, label }: { className: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5">
      <span className={`inline-block h-3 w-3 rounded ${className}`} aria-hidden />
      {label}
    </span>
  );
}

function cellClass(cell: PersonDayCell): string {
  if (!cell.isWorkingDay) {
    return cell.minutes > 0
      ? "bg-accent/25 text-accent-foreground ring-1 ring-inset ring-accent/50"
      : "bg-muted text-transparent";
  }
  if (cell.minutes === 0) return "bg-destructive/15 text-destructive/70 ring-1 ring-inset ring-destructive/40";
  if (cell.loadPercent > OVERLOAD_THRESHOLD_PERCENT) return "bg-destructive/45 text-destructive-foreground";
  if (cell.loadPercent >= UNDERLOAD_THRESHOLD_PERCENT) return "bg-success/25 text-success";
  return "bg-warning/20 text-warning";
}

/**
 * Floating detail card. Fixed-positioned from the cell's own bounding box and
 * clamped to the viewport, because the matrix lives inside a horizontally
 * scrolling container where an absolutely-positioned card would be clipped.
 */
function DayDetailCard({
  dataset,
  logs,
  hover
}: {
  dataset: TimesheetDataset;
  logs: TimeLog[];
  hover: { row: PersonDayRow; cell: PersonDayCell; x: number; y: number };
}) {
  const { row, cell } = hover;
  const entries = useMemo(() => logsForPersonDay(logs, row.person.id, cell.date), [logs, row.person.id, cell.date]);
  const projectsById = useMemo(() => new Map(dataset.projects.map((project) => [project.id, project])), [dataset.projects]);
  const taskNames = useMemo(() => {
    const map = new Map<string, string>();
    for (const project of dataset.projects) {
      for (const milestone of project.milestones) {
        for (const stage of milestone.stages) {
          for (const task of stage.tasks) map.set(task.id, task.name);
        }
      }
    }
    return map;
  }, [dataset.projects]);

  const width = 340;
  const left = Math.min(Math.max(hover.x - width / 2, 12), (typeof window !== "undefined" ? window.innerWidth : 1280) - width - 12);
  const flipUp = typeof window !== "undefined" && hover.y + 260 > window.innerHeight;
  const standardDay = row.person.standardMinutesPerDay * row.person.contractRatio;

  return (
    <div
      role="tooltip"
      style={{ position: "fixed", left, top: flipUp ? undefined : hover.y + 8, bottom: flipUp ? window.innerHeight - hover.y + 34 : undefined, width }}
      className="z-50 rounded-xl border border-border bg-popover p-3 text-popover-foreground shadow-xl"
    >
      <div className="flex items-start justify-between gap-2 border-b border-border pb-2">
        <div className="min-w-0">
          <p className="truncate text-[12.5px] font-bold">{row.person.name}</p>
          <p className="text-[11px] text-muted-foreground">{formatDate(cell.date)}</p>
        </div>
        <div className="shrink-0 text-right">
          <p className="font-mono text-[14px] font-bold tabular-nums">{formatHours(cell.minutes)}</p>
          <p className={`text-[10.5px] font-semibold ${cell.loadPercent > OVERLOAD_THRESHOLD_PERCENT ? "text-destructive" : cell.loadPercent >= UNDERLOAD_THRESHOLD_PERCENT ? "text-success" : "text-warning"}`}>
            {formatPercent(cell.loadPercent)} ngày chuẩn ({formatHours(standardDay)})
          </p>
        </div>
      </div>

      {cell.loadPercent > OVERLOAD_THRESHOLD_PERCENT ? (
        <p className="mt-2 inline-flex items-start gap-1.5 rounded-md bg-destructive/10 px-2 py-1 text-[10.5px] text-destructive">
          <AlertTriangle className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
          Ghi nhận vượt hơn 10% ngày công chuẩn — cần xác nhận là làm thêm giờ hay ghi nhầm.
        </p>
      ) : null}

      <ul className="mt-2 max-h-[200px] space-y-1.5 overflow-y-auto">
        {entries.map((entry) => (
          <li key={entry.id} className="rounded-md border border-border bg-background px-2 py-1.5">
            <div className="flex items-start justify-between gap-2">
              <span className="min-w-0">
                <span className="block truncate text-[11.5px] font-semibold">
                  {projectsById.get(entry.projectId)?.code ?? entry.projectId}
                </span>
                <span className="block text-[10.5px] leading-snug text-muted-foreground">
                  {taskNames.get(entry.taskId) ?? entry.taskId}
                </span>
              </span>
              <span className="shrink-0 font-mono text-[11.5px] font-bold tabular-nums">{formatHours(entry.minutes)}</span>
            </div>
            <div className="mt-1 flex flex-wrap items-center gap-1.5 text-[10px]">
              <span className="text-muted-foreground">{WORK_GROUP_LABELS[entry.workGroup]}</span>
              {entry.billable ? <span className="text-success">· tính phí</span> : null}
              <span className={`ml-auto rounded-full px-1.5 py-0.5 font-semibold ${toneClasses(approvalTone(entry.approvalStatus))}`}>
                {APPROVAL_STATUS_LABELS[entry.approvalStatus]}
              </span>
            </div>
          </li>
        ))}
      </ul>

      <p className="mt-2 inline-flex items-center gap-1 text-[10px] text-muted-foreground">
        <FileSearch className="h-3 w-3" aria-hidden />
        Bấm vào ô để mở toàn bộ dòng ghi nhận. Hệ thống chưa lưu giờ bắt đầu/kết thúc nên không hiển thị được khung giờ trong ngày.
      </p>
    </div>
  );
}

function approvalTone(status: ApprovalStatus): "success" | "warning" | "danger" | "neutral" {
  switch (status) {
    case "approved":
      return "success";
    case "submitted":
      return "warning";
    case "rejected":
      return "danger";
    default:
      return "neutral";
  }
}
