"use client";

import React, { useCallback, useMemo, useState } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import { Download, Info, Link2, RotateCcw, ShieldCheck } from "lucide-react";
import {
  CustomDropdown,
  type DropdownOption,
} from "@/components/constructor-x/custom-controls";
import { getTimesheetDataset } from "./timesheet-mock-data";
import { filterLogs, type TimesheetFilters } from "./timesheet-selectors";
import { formatHours, formatMonth } from "./timesheet-format";
import {
  APPROVAL_STATUS_LABELS,
  VIEWER_SCOPE_LABELS,
  WORK_GROUP_LABELS,
  WORK_GROUPS,
  type ApprovalStatus,
  type ViewerScope,
  type WorkGroup,
} from "./timesheet-types";
import { MockDataNotice, Pill } from "./timesheet-ui";
import { MonthlyTimesheet } from "./monthly-timesheet";
import { ProjectTimesheet } from "./project-timesheet";
import { DailyWeeklyTimesheet } from "./daily-weekly-timesheet";

/**
 * /timesheet workbench — the shell that owns filters, permission scope and the
 * switch between the monthly, project and daily/weekly views.
 *
 * Data currently comes from `timesheet-mock-data`. When the real endpoints land,
 * replace `getTimesheetDataset()` here and nothing else in this folder needs to
 * change — every screen already reads through the selectors.
 */

type TimesheetView = "monthly" | "project" | "daily";
type TimesheetAudience = "user" | "admin";

const VIEW_TABS: Array<{ id: TimesheetView; label: string; hint: string }> = [
  {
    id: "monthly",
    label: "Bảng giờ theo tháng",
    hint: "Tổng hợp theo nhân sự",
  },
  { id: "project", label: "Bảng giờ theo dự án", hint: "Tổng hợp theo dự án" },
  {
    id: "daily",
    label: "Theo ngày & theo tuần",
    hint: "Chi tiết ngày công và tuần",
  },
];

/** The viewer's role decides which people and projects they may see. */
const SELF_PERSON_ID = "per-3";
const MANAGED_PROJECT_IDS = ["prj-1", "prj-2", "prj-4", "prj-5"];

export function TimesheetWorkbench() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();

  const dataset = useMemo(() => getTimesheetDataset(), []);
  const [noticeVisible, setNoticeVisible] = useState(true);
  const [copied, setCopied] = useState(false);

  const view = (searchParams.get("view") as TimesheetView | null) ?? "monthly";
  const scope =
    (searchParams.get("scope") as ViewerScope | null) ?? "workspace";
  const audience: TimesheetAudience = searchParams.get("mode") === "admin" ? "admin" : "user";

  const filters = useMemo<TimesheetFilters>(
    () => ({
      month:
        searchParams.get("month") ?? dataset.months[dataset.months.length - 1],
      departmentId: searchParams.get("dept") ?? "all",
      personId: searchParams.get("person") ?? "all",
      projectId: searchParams.get("project") ?? "all",
      workGroup: (searchParams.get("group") as WorkGroup | null) ?? "all",
      approvalStatus:
        (searchParams.get("approval") as ApprovalStatus | null) ?? "all",
    }),
    [searchParams, dataset.months],
  );

  /** Permission narrowing applied before any screen sees the data. */
  const scopedDataset = useMemo(() => {
    if (scope === "workspace") return dataset;
    if (scope === "self") {
      return {
        ...dataset,
        people: dataset.people.filter((person) => person.id === SELF_PERSON_ID),
        logs: dataset.logs.filter((log) => log.personId === SELF_PERSON_ID),
      };
    }
    return {
      ...dataset,
      projects: dataset.projects.filter((project) =>
        MANAGED_PROJECT_IDS.includes(project.id),
      ),
      logs: dataset.logs.filter((log) =>
        MANAGED_PROJECT_IDS.includes(log.projectId),
      ),
    };
  }, [dataset, scope]);

  const logs = useMemo(
    () => filterLogs(scopedDataset, filters),
    [scopedDataset, filters],
  );

  const commit = useCallback(
    (changes: Record<string, string>) => {
      const next = new URLSearchParams(searchParams.toString());
      for (const [key, value] of Object.entries(changes)) {
        if (!value || value === "all") next.delete(key);
        else next.set(key, value);
      }
      const query = next.toString();
      router.replace(query ? `${pathname}?${query}` : pathname, {
        scroll: false,
      });
    },
    [pathname, router, searchParams],
  );

  const resetFilters = useCallback(() => {
    router.replace(`${pathname}?view=${view}`, { scroll: false });
  }, [pathname, router, view]);

  const copyLink = useCallback(async () => {
    try {
      await navigator.clipboard.writeText(window.location.href);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  }, []);

  const exportCsv = useCallback(() => {
    const peopleById = new Map(
      scopedDataset.people.map((person) => [person.id, person.name]),
    );
    const projectsById = new Map(
      scopedDataset.projects.map((project) => [project.id, project]),
    );
    const header = [
      "Ngày",
      "Nhân sự",
      "Mã dự án",
      "Tên dự án",
      "Nhóm công việc",
      "Số giờ",
      "Tính phí",
      "Trạng thái duyệt",
      "Ghi chú",
    ];
    const rows = logs.map((log) => [
      log.date,
      peopleById.get(log.personId) ?? log.personId,
      projectsById.get(log.projectId)?.code ?? log.projectId,
      projectsById.get(log.projectId)?.name ?? "",
      WORK_GROUP_LABELS[log.workGroup],
      (log.minutes / 60).toFixed(2),
      log.billable ? "Có" : "Không",
      APPROVAL_STATUS_LABELS[log.approvalStatus],
      log.note,
    ]);
    const csv = [header, ...rows]
      .map((row) =>
        row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","),
      )
      .join("\n");
    const blob = new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8;" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `timesheet-${filters.month}-${view}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
  }, [logs, scopedDataset, filters.month, view]);

  /* ── Dropdown option lists ────────────────────────────────────────── */

  const monthOptions: DropdownOption[] = dataset.months.map((month) => ({
    value: month,
    label: formatMonth(month),
  }));
  const scopeOptions: DropdownOption[] = (
    Object.keys(VIEWER_SCOPE_LABELS) as ViewerScope[]
  ).map((key) => ({
    value: key,
    label: VIEWER_SCOPE_LABELS[key],
  }));
  const departmentOptions: DropdownOption[] = [
    { value: "all", label: "Tất cả phòng ban" },
    ...dataset.departments.map((department) => ({
      value: department.id,
      label: department.name,
    })),
  ];
  const personOptions: DropdownOption[] = [
    { value: "all", label: "Tất cả nhân sự" },
    ...scopedDataset.people
      .filter(
        (person) =>
          filters.departmentId === "all" ||
          person.departmentId === filters.departmentId,
      )
      .map((person) => ({ value: person.id, label: person.name })),
  ];
  const projectOptions: DropdownOption[] = [
    { value: "all", label: "Tất cả dự án" },
    ...scopedDataset.projects.map((project) => ({
      value: project.id,
      label: `${project.code} — ${project.name}`,
    })),
  ];
  const groupOptions: DropdownOption[] = [
    { value: "all", label: "Tất cả nhóm công việc" },
    ...WORK_GROUPS.map((group) => ({
      value: group,
      label: WORK_GROUP_LABELS[group],
    })),
  ];
  const approvalOptions: DropdownOption[] = [
    { value: "all", label: "Tất cả trạng thái duyệt" },
    ...Object.entries(APPROVAL_STATUS_LABELS).map(([value, label]) => ({
      value,
      label,
    })),
  ];

  const activeFilterCount = [
    filters.departmentId,
    filters.personId,
    filters.projectId,
    filters.workGroup,
    filters.approvalStatus ?? "all",
  ].filter((value) => value !== "all").length;

  const activeFilterEntries = [
    filters.departmentId !== "all" ? { key: "dept", label: `Phòng ban: ${departmentOptions.find((o) => o.value === filters.departmentId)?.label ?? filters.departmentId}` } : null,
    filters.personId !== "all" ? { key: "person", label: `Nhân sự: ${personOptions.find((o) => o.value === filters.personId)?.label ?? filters.personId}` } : null,
    filters.projectId !== "all" ? { key: "project", label: `Dự án: ${projectOptions.find((o) => o.value === filters.projectId)?.label ?? filters.projectId}` } : null,
    filters.workGroup !== "all" ? { key: "group", label: `Nhóm: ${groupOptions.find((o) => o.value === filters.workGroup)?.label ?? filters.workGroup}` } : null,
    filters.approvalStatus !== "all" ? { key: "approval", label: `Duyệt: ${approvalOptions.find((o) => o.value === filters.approvalStatus)?.label ?? filters.approvalStatus}` } : null,
  ].filter((entry): entry is { key: string; label: string } => Boolean(entry));

  const totalMinutes = logs.reduce((acc, log) => acc + log.minutes, 0);

  return (
    <div className="space-y-4">
      {noticeVisible ? (
        <MockDataNotice onDismiss={() => setNoticeVisible(false)} />
      ) : null}

      {/* ── View tabs ──────────────────────────────────────────────────── */}
      <div
        role="tablist"
        aria-label="Chế độ xem bảng chấm công"
        className="flex flex-wrap items-center gap-1 rounded-xl border border-border bg-card p-1"
      >
        {VIEW_TABS.map((tab) => {
          const active = view === tab.id;
          return (
            <button
              key={tab.id}
              type="button"
              role="tab"
              aria-selected={active}
              onClick={() => commit({ view: tab.id })}
              className={`flex-1 rounded-lg px-3 py-2 text-left transition-colors ${active ? "bg-primary/10 text-primary" : "text-muted-foreground hover:bg-muted hover:text-foreground"}`}
            >
              <span className="block text-[13px] font-bold">{tab.label}</span>
              <span className="block text-[10.5px] opacity-80">{tab.hint}</span>
            </button>
          );
        })}
      </div>

      {/* ── Filters + permission scope ─────────────────────────────────── */}
      <section
        aria-label="Bộ lọc Timesheet"
        className="rounded-2xl border border-border bg-card p-4 shadow-sm"
      >
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <FilterField label="Kỳ báo cáo">
            <CustomDropdown
              ariaLabel="Chọn tháng"
              options={monthOptions}
              value={filters.month}
              onChange={(value) => commit({ month: value })}
            />
          </FilterField>
          <FilterField label="Phòng ban">
            <CustomDropdown
              ariaLabel="Chọn phòng ban"
              options={departmentOptions}
              value={filters.departmentId}
              onChange={(value) => commit({ dept: value, person: "all" })}
            />
          </FilterField>
          <FilterField label="Nhân sự">
            <CustomDropdown
              ariaLabel="Chọn nhân sự"
              options={personOptions}
              value={filters.personId}
              onChange={(value) => commit({ person: value })}
            />
          </FilterField>
          <FilterField label="Dự án">
            <CustomDropdown
              ariaLabel="Chọn dự án"
              options={projectOptions}
              value={filters.projectId}
              onChange={(value) => commit({ project: value })}
            />
          </FilterField>
          <FilterField label="Nhóm công việc">
            <CustomDropdown
              ariaLabel="Chọn nhóm công việc"
              options={groupOptions}
              value={filters.workGroup}
              onChange={(value) => commit({ group: value })}
            />
          </FilterField>
          <FilterField label="Trạng thái duyệt">
            <CustomDropdown
              ariaLabel="Trạng thái duyệt"
              options={approvalOptions}
              value={filters.approvalStatus ?? "all"}
              onChange={(value) => commit({ approval: value })}
            />
          </FilterField>
        </div>

        <div className="mt-3 flex flex-wrap items-center gap-2 border-t border-border pt-3">
          <span className="inline-flex items-center gap-1.5 text-[11.5px] text-muted-foreground">
            <ShieldCheck className="h-3.5 w-3.5" aria-hidden />
            Phạm vi quyền xem
          </span>
          <div className="w-full max-w-[280px]">
            <CustomDropdown
              ariaLabel="Chọn phạm vi quyền xem"
              options={scopeOptions}
              value={scope}
              onChange={(value) => commit({ scope: value })}
            />
          </div>

          <span className="ml-auto flex flex-wrap items-center gap-2">
            <Pill tone="info">{logs.length} dòng ghi nhận</Pill>
            <Pill tone="neutral">{formatHours(totalMinutes)}</Pill>
            {activeFilterCount > 0 ? (
              <Pill tone="warning">{activeFilterCount} bộ lọc</Pill>
            ) : null}
            <button
              type="button"
              onClick={resetFilters}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11.5px] font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <RotateCcw className="h-3 w-3" aria-hidden /> Đặt lại
            </button>
            <button
              type="button"
              onClick={copyLink}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11.5px] font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
            >
              <Link2 className="h-3 w-3" aria-hidden />{" "}
              {copied ? "Đã chép" : "Chép link"}
            </button>
            <button
              type="button"
              onClick={exportCsv}
              disabled={logs.length === 0}
              className="inline-flex items-center gap-1 rounded-md border border-border px-2 py-1 text-[11.5px] font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground disabled:opacity-50"
            >
              <Download className="h-3 w-3" aria-hidden /> Xuất CSV
            </button>
          </span>
        </div>

        {scope !== "workspace" ? (
          <p className="mt-2 inline-flex items-start gap-1.5 text-[11px] text-muted-foreground">
            <Info className="mt-0.5 h-3 w-3 shrink-0" aria-hidden />
            {scope === "self"
              ? "Đang xem ở phạm vi cá nhân — chỉ hiển thị dữ liệu của chính người dùng đăng nhập."
              : "Đang xem ở phạm vi Delivery Lead / PM — chỉ hiển thị các dự án người dùng quản lý."}
          </p>
        ) : null}
        {activeFilterEntries.length > 0 ? (
          <div className="mt-3 flex flex-wrap items-center gap-1.5 border-t border-border pt-3" aria-label="Bộ lọc đang áp dụng">
            <span className="mr-1 text-[11px] font-semibold text-muted-foreground">Đang lọc:</span>
            {activeFilterEntries.map((entry) => (
              <button
                key={entry.key}
                type="button"
                onClick={() => commit({ [entry.key]: "all" })}
                className="inline-flex items-center gap-1 rounded-full border border-blue-200 bg-blue-50 px-2.5 py-1 text-[11px] font-semibold text-blue-700 transition hover:border-blue-300 hover:bg-blue-100"
                title={`Bỏ lọc ${entry.label}`}
              >
                {entry.label}<span aria-hidden className="text-blue-400">×</span>
              </button>
            ))}
          </div>
        ) : null}
        {view === "project" ? (
          <div className="mt-3 flex items-center justify-between border-t border-border pt-3">
            <span className="text-[11px] font-semibold text-muted-foreground">Chế độ hiển thị</span>
            <div className="inline-flex rounded-lg border border-border bg-muted/30 p-0.5" role="group" aria-label="Chế độ xem Timesheet">
              {([['user', 'User view'], ['admin', 'Admin view']] as const).map(([value, label]) => (
                <button key={value} type="button" onClick={() => commit({ mode: value })} className={`rounded-md px-2.5 py-1 text-[11px] font-semibold transition ${audience === value ? "bg-background text-primary shadow-sm" : "text-muted-foreground hover:text-foreground"}`} aria-pressed={audience === value}>{label}</button>
              ))}
            </div>
          </div>
        ) : null}
      </section>

      {/* ── Active view ────────────────────────────────────────────────── */}
      {view === "monthly" ? (
        <MonthlyTimesheet
          dataset={scopedDataset}
          filters={filters}
          logs={logs}
        />
      ) : view === "project" ? (
        <ProjectTimesheet
          dataset={scopedDataset}
          filters={filters}
          logs={logs}
          audience={audience}
        />
      ) : (
        <DailyWeeklyTimesheet
          dataset={scopedDataset}
          filters={filters}
          logs={logs}
        />
      )}
    </div>
  );
}

function FilterField({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block">
      <span className="mb-1 block text-[11px] font-semibold text-muted-foreground">
        {label}
      </span>
      {children}
    </label>
  );
}
