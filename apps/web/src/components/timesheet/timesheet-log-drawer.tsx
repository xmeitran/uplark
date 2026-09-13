"use client";

import React, { useMemo } from "react";
import {
  Banknote,
  Briefcase,
  Building2,
  CalendarDays,
  CircleCheckBig,
  CircleX,
  Clock,
  Ellipsis,
  FileText,
  GraduationCap,
  Hourglass,
  LifeBuoy,
  PencilLine,
  Users
} from "lucide-react";
import { formatDate, formatHours, toneClasses } from "./timesheet-format";
import {
  APPROVAL_STATUS_LABELS,
  WORK_GROUP_LABELS,
  type ApprovalStatus,
  type TimeLog,
  type TimesheetDataset,
  type WorkGroup
} from "./timesheet-types";
import { Avatar, Drawer, EmptyState, Pagination, usePagination } from "./timesheet-ui";

export interface LogDrawerRequest {
  title: string;
  description?: string;
  logs: TimeLog[];
}

const LOG_PAGE_SIZE = 12;

type IconType = React.ComponentType<{ className?: string }>;

const WORK_GROUP_ICONS: Record<WorkGroup, IconType> = {
  customer_project: Briefcase,
  internal_project: Building2,
  ticket_maintenance: LifeBuoy,
  meeting: Users,
  training: GraduationCap,
  other: Ellipsis
};

const APPROVAL_ICONS: Record<ApprovalStatus, IconType> = {
  approved: CircleCheckBig,
  submitted: Hourglass,
  rejected: CircleX,
  draft: PencilLine
};

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

/**
 * Drill-down surface: the individual time-log rows behind any aggregate on
 * screen. Every number in the Timesheet must be traceable back to these rows.
 *
 * Laid out as a grouped card list rather than a table: the drawer is ~768px
 * wide and each entry carries six fields, which a table can only fit by
 * truncating names into uselessness. Entries are grouped under a date header
 * carrying that date's subtotal, so a whole-month drill-down still reads.
 */
export function LogDrawer({
  dataset,
  request,
  onClose
}: {
  dataset: TimesheetDataset;
  request: LogDrawerRequest | null;
  onClose: () => void;
}) {
  const peopleById = useMemo(() => new Map(dataset.people.map((person) => [person.id, person])), [dataset.people]);
  const projectsById = useMemo(() => new Map(dataset.projects.map((project) => [project.id, project])), [dataset.projects]);
  const taskPaths = useMemo(() => {
    const map = new Map<string, string>();
    for (const project of dataset.projects) {
      for (const milestone of project.milestones) {
        for (const stage of milestone.stages) {
          for (const task of stage.tasks) map.set(task.id, `${stage.name} › ${task.name}`);
        }
      }
    }
    return map;
  }, [dataset.projects]);

  const rows = useMemo(
    () => (request?.logs ?? []).slice().sort((a, b) => b.date.localeCompare(a.date) || b.minutes - a.minutes),
    [request]
  );
  const paged = usePagination(rows, LOG_PAGE_SIZE);

  const totals = useMemo(
    () => ({
      minutes: rows.reduce((acc, log) => acc + log.minutes, 0),
      people: new Set(rows.map((log) => log.personId)).size,
      projects: new Set(rows.map((log) => log.projectId)).size
    }),
    [rows]
  );

  /** Consecutive entries on the same date, so each page renders date headers. */
  const groups = useMemo(() => {
    const out: Array<{ date: string; entries: TimeLog[]; minutes: number }> = [];
    for (const log of paged.items) {
      const last = out[out.length - 1];
      if (last && last.date === log.date) {
        last.entries.push(log);
        last.minutes += log.minutes;
      } else {
        out.push({ date: log.date, entries: [log], minutes: log.minutes });
      }
    }
    return out;
  }, [paged.items]);

  return (
    <Drawer open={request !== null} title={request?.title ?? ""} description={request?.description} icon={Clock} onClose={onClose}>
      {rows.length === 0 ? (
        <EmptyState message="Không có dòng ghi nhận nào khớp." />
      ) : (
        <>
          <div className="flex flex-wrap items-center gap-2 border-b border-border bg-muted/30 px-4 py-2.5">
            <SummaryChip icon={FileText} label="dòng ghi nhận" value={`${rows.length}`} />
            <SummaryChip icon={Clock} label="tổng giờ" value={formatHours(totals.minutes)} tone="primary" />
            <SummaryChip icon={Users} label="nhân sự" value={`${totals.people}`} />
            <SummaryChip icon={Briefcase} label="dự án" value={`${totals.projects}`} />
          </div>

          <div className="divide-y divide-border">
            {groups.map((group) => (
              <section key={group.date}>
                <header className="flex items-center justify-between gap-2 bg-muted/20 px-4 py-1.5">
                  <span className="inline-flex items-center gap-1.5 text-[11.5px] font-semibold text-muted-foreground">
                    <CalendarDays className="h-3.5 w-3.5" aria-hidden />
                    {formatDate(group.date)}
                  </span>
                  <span className="font-mono text-[11.5px] font-bold tabular-nums text-muted-foreground">
                    {formatHours(group.minutes)}
                  </span>
                </header>

                <ul>
                  {group.entries.map((entry) => {
                    const person = peopleById.get(entry.personId);
                    const project = projectsById.get(entry.projectId);
                    const GroupIcon = WORK_GROUP_ICONS[entry.workGroup];
                    const ApprovalIcon = APPROVAL_ICONS[entry.approvalStatus];
                    return (
                      <li key={entry.id} className="flex items-start gap-3 px-4 py-2.5 transition-colors hover:bg-muted/30">
                        {person ? <Avatar initials={person.initials} name={person.name} /> : null}

                        <div className="min-w-0 flex-1">
                          <div className="flex items-baseline justify-between gap-2">
                            <span className="truncate text-[12.5px] font-semibold" title={person?.name}>
                              {person?.name ?? entry.personId}
                            </span>
                            <span className="shrink-0 font-mono text-[13px] font-bold tabular-nums">
                              {formatHours(entry.minutes)}
                            </span>
                          </div>

                          <div className="mt-0.5 flex min-w-0 items-start gap-1.5">
                            {/* Code stays compact; the full project name is on hover. */}
                            <span
                              className="mt-px shrink-0 cursor-help rounded border border-border bg-muted px-1.5 py-0.5 font-mono text-[10.5px] font-semibold text-foreground"
                              title={project ? `${project.code} — ${project.name} · ${project.accountName}` : entry.projectId}
                            >
                              {project?.code ?? entry.projectId}
                            </span>
                            <span className="min-w-0 text-[11.5px] leading-snug text-muted-foreground">
                              {taskPaths.get(entry.taskId) ?? entry.taskId}
                            </span>
                          </div>

                          <div className="mt-1 flex flex-wrap items-center gap-x-2.5 gap-y-1 text-[10.5px]">
                            <span className="inline-flex items-center gap-1 text-muted-foreground">
                              <GroupIcon className="h-3 w-3" aria-hidden />
                              {WORK_GROUP_LABELS[entry.workGroup]}
                            </span>
                            {entry.billable ? (
                              <span className="inline-flex items-center gap-1 text-success">
                                <Banknote className="h-3 w-3" aria-hidden />
                                Tính phí
                              </span>
                            ) : null}
                            <span
                              className={`ml-auto inline-flex shrink-0 items-center gap-1 whitespace-nowrap rounded-full px-1.5 py-0.5 font-semibold ${toneClasses(approvalTone(entry.approvalStatus))}`}
                            >
                              <ApprovalIcon className="h-3 w-3" aria-hidden />
                              {APPROVAL_STATUS_LABELS[entry.approvalStatus]}
                            </span>
                          </div>

                          {entry.note ? (
                            <p className="mt-1 truncate text-[10.5px] italic text-muted-foreground" title={entry.note}>
                              {entry.note}
                            </p>
                          ) : null}
                        </div>
                      </li>
                    );
                  })}
                </ul>
              </section>
            ))}
          </div>

          <Pagination state={paged} unit="dòng" className="sticky bottom-0 z-10 bg-card" />
        </>
      )}
    </Drawer>
  );
}

function SummaryChip({
  icon: Icon,
  label,
  value,
  tone = "muted"
}: {
  icon: IconType;
  label: string;
  value: string;
  tone?: "muted" | "primary";
}) {
  return (
    <span
      className={`inline-flex items-center gap-1.5 rounded-lg border px-2 py-1 text-[11.5px] ${
        tone === "primary" ? "border-primary/30 bg-primary/10 text-primary" : "border-border bg-card text-muted-foreground"
      }`}
    >
      <Icon className="h-3.5 w-3.5 shrink-0" aria-hidden />
      <span className="font-mono font-bold tabular-nums">{value}</span>
      <span>{label}</span>
    </span>
  );
}
