"use client";

import { useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { AppShell } from "@/components/constructor-x/app-shell";
import { CustomDropdown } from "@/components/constructor-x/custom-controls";
import {
  AlertTriangle,
  ArrowDownRight,
  ArrowUpRight,
  CalendarDays,
  Check,
  ChevronDown,
  ChevronRight,
  Clock3,
  Download,
  Search,
  WalletCards,
} from "lucide-react";
import { EvTrace } from "./ev-trace";

type Project = {
  code: string;
  name: string;
  client: string;
  status: "Active" | "In Review" | "On Hold";
  plan: number;
  logwork: number;
  pnl: number;
  pending: number;
  revenue: number;
  expenses: number;
};
const PROJECTS: Project[] = [
  {
    code: "P-9001",
    name: "CRM cho Khách hàng A",
    client: "Khách hàng A",
    status: "Active",
    plan: 4800,
    logwork: 620,
    pnl: 590,
    pending: 30,
    revenue: 1680000000,
    expenses: 430000000,
  },
  {
    code: "P-9002",
    name: "Portal đối tác B",
    client: "Khách hàng B",
    status: "In Review",
    plan: 2240,
    logwork: 420,
    pnl: 390,
    pending: 30,
    revenue: 920000000,
    expenses: 286000000,
  },
  {
    code: "P-9003",
    name: "Tích hợp ERP nội bộ",
    client: "Nội bộ",
    status: "On Hold",
    plan: 1200,
    logwork: 280,
    pnl: 0,
    pending: 280,
    revenue: 0,
    expenses: 84000000,
  },
];
const EXPENSES = [
  "BD",
  "PM",
  "Delivery / DX",
  "AI / Công cụ",
  "Overhead",
  "Khác",
];
const expenseShare = [0.08, 0.18, 0.54, 0.08, 0.07, 0.05];
const LOGWORK_PEOPLE = [
  { name: "An Nguyễn", role: "Project Manager", weight: 0.22 },
  { name: "Phạm Minh Quân", role: "Delivery", weight: 0.2 },
  { name: "Bùi Thanh", role: "Delivery", weight: 0.18 },
  { name: "Đỗ Phương", role: "Business Analyst", weight: 0.14 },
  { name: "Lê Hoàng", role: "Engineering", weight: 0.14 },
  { name: "Nguyễn Linh", role: "QA / UAT", weight: 0.12 },
];
const LOGWORK_DATES = ["01/09/2026", "02/09/2026", "03/09/2026", "04/09/2026", "07/09/2026", "08/09/2026", "09/09/2026", "10/09/2026", "11/09/2026", "14/09/2026", "15/09/2026", "16/09/2026", "17/09/2026", "18/09/2026", "21/09/2026", "22/09/2026", "23/09/2026", "24/09/2026", "25/09/2026", "28/09/2026"];

function buildDailyLogwork(totalHours: number) {
  return LOGWORK_PEOPLE.flatMap((person, personIndex) => {
    const personTotal = totalHours * person.weight;
    const dailyWeights = LOGWORK_DATES.map((_, dayIndex) => 0.8 + ((personIndex * 3 + dayIndex) % 5) * 0.1);
    const weightTotal = dailyWeights.reduce((sum, value) => sum + value, 0);
    return LOGWORK_DATES.map((date, dayIndex) => ({
      ...person,
      date,
      // The report follows the contract rule of max 8h/person/day. Mock totals
      // are intentionally bounded so the detail never shows impossible daily hours.
      hours: Number(Math.min(8, (personTotal * dailyWeights[dayIndex]) / weightTotal).toFixed(1)),
      id: `${person.name}-${date}`,
      color: ["#2563eb", "#10b981", "#8b5cf6", "#f59e0b", "#ec4899", "#0891b2"][personIndex],
    }));
  });
}

function Status({
  children,
  tone = "success",
}: {
  children: React.ReactNode;
  tone?: "success" | "warning" | "info" | "danger" | "neutral";
}) {
  const styles = {
    success: "bg-emerald-50 text-emerald-700",
    warning: "bg-amber-50 text-amber-700",
    info: "bg-blue-50 text-blue-700",
    danger: "bg-red-50 text-red-700",
    neutral: "bg-slate-100 text-slate-600",
  };
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-semibold ${styles[tone]}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {children}
    </span>
  );
}
function KPI({
  label,
  value,
  hint,
  icon: Icon,
  tone = "blue",
}: {
  label: string;
  value: string;
  hint: string;
  icon: typeof Clock3;
  tone?: "blue" | "green" | "amber" | "purple";
}) {
  const tones = {
    blue: "bg-blue-50 text-blue-600",
    green: "bg-emerald-50 text-emerald-600",
    amber: "bg-amber-50 text-amber-600",
    purple: "bg-violet-50 text-violet-600",
  };
  return (
    <article className="rounded-xl border border-border bg-card p-4 shadow-sm">
      <div className="flex items-start justify-between">
        <span className="text-[11px] font-semibold text-muted-foreground">
          {label}
        </span>
        <span className={`rounded-lg p-2 ${tones[tone]}`}>
          <Icon className="h-4 w-4" />
        </span>
      </div>
      <strong className="mt-3 block text-2xl font-extrabold tracking-tight">
        {value}
      </strong>
    </article>
  );
}
function Bar({
  value,
  max,
  color,
}: {
  value: number;
  max: number;
  color: string;
}) {
  return (
    <div className="mt-1 h-1.5 w-28 rounded-full bg-muted">
      <div
        className="h-full rounded-full"
        style={{
          width: `${Math.min(100, (value / Math.max(1, max)) * 100)}%`,
          backgroundColor: color,
        }}
      />
    </div>
  );
}

export function PnlWorkbench({ detailProjectCode }: { detailProjectCode?: string } = {}) {
  const router = useRouter();
  const [status, setStatus] = useState("all");
  const [query, setQuery] = useState("");
  const [projectCode, setProjectCode] = useState("all");
  const [detailOpen, setDetailOpen] = useState(Boolean(detailProjectCode));
  const [period, setPeriod] = useState("09/2026");
  const [showExpenses, setShowExpenses] = useState(true);
  const matchingProjects = useMemo(
    () =>
      PROJECTS.filter(
        (p) =>
          (status === "all" || p.status === status) &&
          `${p.code} ${p.name} ${p.client}`
            .toLowerCase()
            .includes(query.trim().toLowerCase()),
      ),
    [status, query],
  );
  // The project selector is a real report filter: all cards, totals, table
  // rows and the detail panel must use the same filtered collection.
  const requestedProjectCode = detailProjectCode ?? projectCode;
  const effectiveProjectCode = matchingProjects.some((p) => p.code === requestedProjectCode) ? requestedProjectCode : "all";
  const projects = useMemo(
    () => matchingProjects.filter((p) => effectiveProjectCode === "all" || p.code === effectiveProjectCode),
    [matchingProjects, effectiveProjectCode],
  );
  const project =
    projects[0] ?? matchingProjects[0] ?? PROJECTS[0];
  const totals = useMemo(
    () =>
      projects.reduce(
        (a, p) => ({
          plan: a.plan + p.plan,
          logwork: a.logwork + p.logwork,
          pnl: a.pnl + p.pnl,
          pending: a.pending + p.pending,
          revenue: a.revenue + p.revenue,
          expenses: a.expenses + p.expenses,
        }),
        { plan: 0, logwork: 0, pnl: 0, pending: 0, revenue: 0, expenses: 0 },
      ),
    [projects],
  );
  const excluded = Math.max(0, project.logwork - project.pnl - project.pending);
  const revenueConfirmed = project.revenue > 0;
  const ebit = revenueConfirmed ? project.revenue - project.expenses : null;
  const margin = revenueConfirmed && ebit !== null ? (ebit / project.revenue) * 100 : null;
  const dailyLogwork = useMemo(() => buildDailyLogwork(project.logwork), [project.logwork]);
  const dailyLogworkTotals = useMemo(
    () => LOGWORK_PEOPLE.map((person) => ({
      ...person,
      total: dailyLogwork.filter((entry) => entry.name === person.name).reduce((sum, entry) => sum + entry.hours, 0),
    })),
    [dailyLogwork],
  );
  const dailyTotals = useMemo(
    () => LOGWORK_DATES.map((date) => ({ date, hours: dailyLogwork.filter((entry) => entry.date === date).reduce((sum, entry) => sum + entry.hours, 0) })),
    [dailyLogwork],
  );
  const deliveryDxPeople = useMemo(
    () => LOGWORK_PEOPLE.filter((person) => person.role === "Delivery" || person.role === "Engineering"),
    [],
  );
  const deliveryDxBreakdown = useMemo(
    () => deliveryDxPeople.map((person) => {
      const logwork = dailyLogwork.filter((entry) => entry.name === person.name).reduce((sum, entry) => sum + entry.hours, 0);
      return {
        ...person,
        plan: project.plan * person.weight,
        logwork,
        pnl: logwork * (project.logwork ? project.pnl / project.logwork : 0),
      };
    }),
    [dailyLogwork, deliveryDxPeople, project.logwork, project.pnl, project.plan],
  );
  return (
    <AppShell activeRoute="/pnl" title="Project P&L">
      <main className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="mx-auto max-w-[1480px] space-y-5">
          {!detailProjectCode ? <>
          <EvTrace ev="EV-007" title="Project P&L" scope="Plan · Logwork · P&L Hour, Worklog Daily, chi phí và đối soát ngoại lệ" />
          <header className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
            <div>
              <p className="text-xs font-semibold text-primary">
                FINANCE · PROJECT CONTROL · PNL-01
              </p>
              <h1 className="mt-1 text-2xl font-extrabold tracking-tight">
                Project P&amp;L — tổng quan & đối soát
              </h1>
            </div>
            <div className="flex flex-wrap items-center gap-2">
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
                <input
                  aria-label="Tìm project"
                  value={query}
                  onChange={(event) => setQuery(event.target.value)}
                  placeholder="Tìm project, client..."
                  className="h-10 w-56 rounded-lg border border-border bg-card pl-9 pr-3 text-xs outline-none focus:border-primary"
                />
              </div>
              <CustomDropdown
                ariaLabel="Kỳ báo cáo"
                options={[
                  { value: "09/2026", label: "Tháng 09/2026" },
                  { value: "08/2026", label: "Tháng 08/2026" },
                ]}
                value={period}
                onChange={setPeriod}
              />
              <CustomDropdown
                ariaLabel="Trạng thái project"
                options={[
                  { value: "all", label: "Tất cả trạng thái" },
                  { value: "Active", label: "Active" },
                  { value: "In Review", label: "In Review" },
                  { value: "On Hold", label: "On Hold" },
                ]}
                value={status}
                onChange={setStatus}
              />
              <CustomDropdown
                ariaLabel="Lọc theo project"
                options={[{ value: "all", label: "Tất cả project" }, ...matchingProjects.map((p) => ({ value: p.code, label: `${p.code} · ${p.name}` }))]}
                value={matchingProjects.some((p) => p.code === projectCode) ? projectCode : "all"}
                onChange={setProjectCode}
              />
              <button className="inline-flex h-10 items-center gap-2 rounded-lg border border-border px-3 text-xs font-semibold hover:bg-muted">
                <Download className="h-3.5 w-3.5" /> Xuất báo cáo
              </button>
            </div>
          </header>
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-blue-100 bg-blue-50/60 px-3 py-2 text-xs">
            <span className="font-semibold text-blue-900">Đang hiển thị</span>
            <span className="rounded-md bg-white px-2 py-1 font-semibold text-blue-700 shadow-sm">
              {projects.length} / {matchingProjects.length} project
            </span>
            {effectiveProjectCode !== "all" ? (
              <span className="rounded-md bg-white px-2 py-1 text-blue-800">
                {project.code} · {project.name}
              </span>
            ) : null}
            {status !== "all" ? <span className="rounded-md bg-white px-2 py-1 text-blue-800">Trạng thái: {status}</span> : null}
            {query.trim() ? <span className="rounded-md bg-white px-2 py-1 text-blue-800">Tìm: “{query.trim()}”</span> : null}
            {(projectCode !== "all" || status !== "all" || query.trim()) ? (
              <button type="button" onClick={() => { setProjectCode("all"); setStatus("all"); setQuery(""); }} className="ml-auto font-semibold text-blue-700 hover:text-blue-900">Xoá bộ lọc</button>
            ) : <span className="text-blue-700/70">Tất cả dữ liệu trong kỳ báo cáo</span>}
          </div>
          <section className="grid grid-cols-2 gap-3 xl:grid-cols-6">
            <KPI
              label="Projects"
              value={`${projects.length}`}
              hint="Trong phạm vi lọc"
              icon={WalletCards}
            />
            <KPI
              label="Revenue"
              value={`${(totals.revenue / 1e9).toFixed(2)}B ₫`}
              hint="Chưa VAT"
              icon={ArrowUpRight}
              tone="green"
            />
            <KPI
              label="Plan Hour"
              value={`${totals.plan.toLocaleString("vi-VN")}h`}
              hint="Baseline kế hoạch"
              icon={CalendarDays}
            />
            <KPI
              label="Logwork Hour"
              value={`${totals.logwork.toLocaleString("vi-VN")}h`}
              hint="Giờ đã ghi"
              icon={Clock3}
            />
            <KPI
              label="P&L Hour"
              value={`${totals.pnl.toLocaleString("vi-VN")}h`}
              hint={`${Math.round((totals.pnl / Math.max(1, totals.logwork)) * 100)}% đủ điều kiện`}
              icon={Check}
              tone="purple"
            />
            <KPI
              label="Chờ xử lý"
              value={`${totals.pending.toLocaleString("vi-VN")}h`}
              hint="Chưa được tính P&L"
              icon={AlertTriangle}
              tone="amber"
            />
          </section>
          <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <div className="border-b border-border px-4 py-3">
              <h2 className="text-sm font-bold">PNL-01 · Đối soát theo project</h2>
              <p className="mt-1 text-[11px] text-muted-foreground">Plan ≠ Logwork ≠ P&amp;L. Chọn một dòng để mở toàn bộ chi tiết theo người và ngày.</p>
            </div>
            <div className="overflow-x-auto">
              <table className="w-full min-w-[900px] text-left text-xs">
                <thead className="bg-muted/50 text-[10px] uppercase tracking-wide text-muted-foreground">
                  <tr>
                    <th className="px-4 py-3">Project / phạm vi</th>
                    <th className="px-3 py-3">Plan Hour</th>
                    <th className="px-3 py-3">Logwork Hour</th>
                    <th className="px-3 py-3">P&amp;L Hour</th>
                    <th className="px-3 py-3">Bị loại</th>
                    <th className="px-3 py-3">Chờ xử lý</th>
                    <th className="px-3 py-3">Trạng thái</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-border">
                  {projects.map((item) => {
                    const itemExcluded = Math.max(
                      0,
                      item.logwork - item.pnl - item.pending,
                    );
                    const ok =
                      item.pnl + itemExcluded + item.pending === item.logwork;
                    return (
                      <tr
                        key={item.code}
                        onClick={() => {
                          setProjectCode(item.code);
                          router.push(`/pnl/${item.code}`);
                        }}
                        className={`cursor-pointer hover:bg-blue-50/40 ${item.code === project.code ? "bg-blue-50/60" : ""}`}
                      >
                        <td className="px-4 py-3">
                          <div className="font-semibold">{item.name}</div>
                          <div className="mt-1 flex items-center gap-2 text-[10px] text-muted-foreground">
                            <span className="font-mono">{item.code}</span>
                            <span>·</span>
                            <span>{item.client}</span>
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <div className="font-mono font-semibold">
                            {item.plan.toLocaleString("vi-VN")}h
                          </div>
                          <Bar
                            value={item.plan}
                            max={item.plan}
                            color="#2563eb"
                          />
                        </td>
                        <td className="px-3 py-3">
                          <div className="font-mono font-semibold">
                            {item.logwork.toLocaleString("vi-VN")}h
                          </div>
                          <Bar
                            value={item.logwork}
                            max={item.plan}
                            color="#10b981"
                          />
                        </td>
                        <td className="px-3 py-3">
                          <div className="font-mono font-semibold">
                            {item.pnl.toLocaleString("vi-VN")}h
                          </div>
                          <Bar
                            value={item.pnl}
                            max={item.plan}
                            color="#8b5cf6"
                          />
                        </td>
                        <td className="px-3 py-3 font-mono">{itemExcluded}h</td>
                        <td className="px-3 py-3 font-mono text-amber-700">
                          {item.pending}h
                        </td>
                        <td className="px-3 py-3">
                          <Status
                            tone={
                              ok
                                ? item.pending
                                  ? "warning"
                                  : "success"
                                : "danger"
                            }
                          >
                            {ok
                              ? item.pending
                                ? "Chờ xử lý"
                                : "Đã khớp"
                              : "Lệch số liệu"}
                          </Status>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </section>
          <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <div className="border-b border-border px-4 py-3">
              <h2 className="text-sm font-bold">Expenses theo 6 nhóm · PNL-01</h2>
            </div>
            {showExpenses ? (
              <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
                {EXPENSES.map((label, index) => (
                  <div
                    key={label}
                    className={`rounded-lg border border-border p-3 ${label === "Delivery / DX" ? "cursor-pointer transition hover:border-amber-300 hover:bg-amber-50/40" : ""}`}
                    onClick={() => label === "Delivery / DX" && router.push(`/pnl/${project.code}`)}
                    role={label === "Delivery / DX" ? "button" : undefined}
                    tabIndex={label === "Delivery / DX" ? 0 : undefined}
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold">{label}</span>
                      <span className="font-mono">
                        {Math.round(expenseShare[index] * 100)}%
                      </span>
                    </div>
                    <div className="mt-2 h-1.5 rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-amber-500"
                        style={{ width: `${expenseShare[index] * 100}%` }}
                      />
                    </div>
                    <p className="mt-2 font-mono text-xs font-semibold">
                      {Math.round(
                        project.expenses * expenseShare[index],
                      ).toLocaleString("vi-VN")}{" "}
                      ₫
                    </p>
                  </div>
                ))}
              </div>
            ) : null}
          </section>
          <section className="grid gap-4 xl:grid-cols-[1.15fr_.85fr]">
            <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <div className="flex flex-wrap items-start justify-between gap-3">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-primary">
                    PNL-01 · Project được chọn
                  </p>
                  <h2 className="mt-1 text-lg font-bold">{project.name}</h2>
                </div>
                <CustomDropdown
                  ariaLabel="Chọn project"
                  options={projects.map((p) => ({
                    value: p.code,
                    label: `${p.code} · ${p.name}`,
                  }))}
                  value={project.code}
                  onChange={setProjectCode}
                />
              </div>
              <div className="mt-5 grid grid-cols-3 gap-2">
                <div className="rounded-lg bg-blue-50 p-3">
                  <span className="text-[10px] text-blue-700">Plan</span>
                  <strong className="mt-1 block font-mono text-xl text-blue-800">
                    {project.plan}h
                  </strong>
                </div>
                <div className="rounded-lg bg-emerald-50 p-3">
                  <span className="text-[10px] text-emerald-700">Logwork</span>
                  <strong className="mt-1 block font-mono text-xl text-emerald-800">
                    {project.logwork}h
                  </strong>
                </div>
                <div className="rounded-lg bg-violet-50 p-3">
                  <span className="text-[10px] text-violet-700">P&amp;L</span>
                  <strong className="mt-1 block font-mono text-xl text-violet-800">
                    {project.pnl}h
                  </strong>
                </div>
              </div>
              <div className="mt-5 space-y-3">
                <div className="flex items-center justify-between text-xs">
                  <span>Plan → Logwork → P&amp;L</span>
                  <Status tone={project.pending ? "warning" : "success"}>
                    {project.pending
                      ? `${project.pending}h cần xử lý`
                      : "Đã khớp"}
                  </Status>
                </div>
                <div className="grid grid-cols-3 gap-2 text-[11px]">
                  <div className="rounded-lg bg-emerald-50 p-3">
                    <span className="text-emerald-700">Được tính</span>
                    <strong className="mt-1 block font-mono text-emerald-800">
                      {project.pnl}h
                    </strong>
                  </div>
                  <div className="rounded-lg bg-slate-100 p-3">
                    <span className="text-slate-600">Bị loại</span>
                    <strong className="mt-1 block font-mono text-slate-800">
                      {excluded}h
                    </strong>
                  </div>
                  <div className="rounded-lg bg-amber-50 p-3">
                    <span className="text-amber-700">Chờ xử lý</span>
                    <strong className="mt-1 block font-mono text-amber-800">
                      {project.pending}h
                    </strong>
                  </div>
                </div>
              </div>
            </div>
            <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <h2 className="text-sm font-bold">Kết quả P&amp;L theo kỳ</h2>
              <dl className="mt-4 divide-y divide-border text-xs">
                <div className="flex justify-between py-3">
                  <dt className="text-muted-foreground">Revenue chưa VAT</dt>
                  <dd className="font-mono font-semibold">
                    {project.revenue.toLocaleString("vi-VN")} ₫
                  </dd>
                </div>
                <div className="flex justify-between py-3">
                  <dt className="text-muted-foreground">Total Expenses</dt>
                  <dd className="font-mono font-semibold">
                    {project.expenses.toLocaleString("vi-VN")} ₫
                  </dd>
                </div>
                <div className="flex justify-between py-3">
                  <dt className="text-muted-foreground">EBIT</dt>
                  <dd
                    className={`font-mono font-bold ${ebit === null ? "text-amber-700" : ebit >= 0 ? "text-emerald-700" : "text-red-700"}`}
                  >
                    {ebit === null ? "Thiếu dữ liệu" : `${ebit.toLocaleString("vi-VN")} ₫`}
                  </dd>
                </div>
                <div className="flex justify-between py-3">
                  <dt className="text-muted-foreground">
                    % Expenses / Revenue
                  </dt>
                  <dd className="font-mono font-semibold">
                    {project.revenue
                      ? `${((project.expenses / project.revenue) * 100).toFixed(1)}%`
                      : "N/A"}
                  </dd>
                </div>
                <div className="flex justify-between py-3">
                  <dt className="text-muted-foreground">Biên EBIT</dt>
                  <dd className="font-mono font-semibold">
                    {margin === null ? "Thiếu dữ liệu" : `${margin.toFixed(1)}%`}
                  </dd>
                </div>
              </dl>
            </div>
          </section>
          <section className="hidden overflow-hidden rounded-xl border border-border bg-card shadow-sm">
            <button
              onClick={() => setShowExpenses(!showExpenses)}
              className="flex w-full items-center justify-between border-b border-border px-4 py-3 text-left hover:bg-muted/30"
            >
              <div>
                <h2 className="text-sm font-bold">Expenses theo 6 nhóm</h2>
              </div>
              {showExpenses ? (
                <ChevronDown className="h-4 w-4" />
              ) : (
                <ChevronRight className="h-4 w-4" />
              )}
            </button>
            {showExpenses ? (
              <div className="grid gap-3 p-4 sm:grid-cols-2 lg:grid-cols-3">
                {EXPENSES.map((label, index) => (
                  <div
                    key={label}
                    className="rounded-lg border border-border p-3"
                  >
                    <div className="flex items-center justify-between text-xs">
                      <span className="font-semibold">{label}</span>
                      <span className="font-mono">
                        {Math.round(expenseShare[index] * 100)}%
                      </span>
                    </div>
                    <div className="mt-2 h-1.5 rounded-full bg-muted">
                      <div
                        className="h-full rounded-full bg-amber-500"
                        style={{ width: `${expenseShare[index] * 100}%` }}
                      />
                    </div>
                    <p className="mt-2 font-mono text-xs font-semibold">
                      {Math.round(
                        project.expenses * expenseShare[index],
                      ).toLocaleString("vi-VN")}{" "}
                      ₫
                    </p>
                  </div>
                ))}
              </div>
            ) : null}
          </section>
          </> : null}
          {(detailOpen || detailProjectCode) ? (
            <section id="pnl-detail" className="scroll-mt-4 space-y-5 rounded-2xl border border-border bg-card p-5 shadow-sm sm:p-7">
                <div className="relative -mx-5 -mt-5 border-b border-border bg-card px-5 py-4 sm:-mx-7 sm:-mt-7 sm:px-7">
                <div className="flex items-start justify-between">
                  <div>
                    <p className="text-[10px] font-bold uppercase tracking-wider text-primary">
                      PNL-01 · Project detail
                    </p>
                    <h2 className="mt-1 text-2xl font-extrabold tracking-tight">{project.name}</h2>
                    <p className="mt-1 text-xs text-muted-foreground">{project.code} · {project.client} · Kỳ báo cáo {period}</p>
                  </div>
                  <button
                    type="button"
                    onClick={() => router.push("/pnl")}
                    className="inline-flex items-center gap-2 rounded-lg border border-border px-3 py-2 text-xs font-semibold hover:bg-muted"
                  >
                    <ChevronRight className="h-3.5 w-3.5 rotate-180" /> Quay lại tổng quan
                  </button>
                </div>
                <div className="mt-3 flex flex-wrap items-center gap-2 text-[11px] text-muted-foreground">
                  <span className="rounded-md bg-blue-50 px-2 py-1 font-semibold text-blue-700">Kỳ báo cáo: {period}</span>
                  <span className="rounded-md bg-slate-100 px-2 py-1">Client: {project.client}</span>
                  <Status tone={project.pending ? "warning" : "success"}>{project.pending ? "Tạm tính · còn giờ chờ" : "Đủ điều kiện tính"}</Status>
                </div>
                </div>
                <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
                  <KPI
                    label="Plan Hour"
                    value={`${project.plan}h`}
                    hint=""
                    icon={CalendarDays}
                  />
                  <KPI
                    label="Logwork Hour"
                    value={`${project.logwork}h`}
                    hint=""
                    icon={Clock3}
                    tone="green"
                  />
                  <KPI
                    label="P&amp;L Hour"
                    value={`${project.pnl}h`}
                    hint=""
                    icon={Check}
                    tone="purple"
                  />
                  <KPI
                    label="Chờ xử lý"
                    value={`${project.pending}h`}
                    hint=""
                    icon={AlertTriangle}
                    tone="amber"
                  />
                </div>
                <div className="mt-4 grid gap-3 md:grid-cols-3">
                  <div className="rounded-xl border border-blue-100 bg-blue-50/60 p-3"><span className="text-[10px] font-semibold uppercase tracking-wide text-blue-700">Chênh lệch Plan → Logwork</span><strong className="mt-1 block font-mono text-lg text-blue-900">{(project.logwork - project.plan).toLocaleString("vi-VN")}h</strong><span className="text-[10px] text-blue-800/70">Actual so với baseline</span></div>
                  <div className="rounded-xl border border-violet-100 bg-violet-50/60 p-3"><span className="text-[10px] font-semibold uppercase tracking-wide text-violet-700">Tỷ lệ P&amp;L hợp lệ</span><strong className="mt-1 block font-mono text-lg text-violet-900">{Math.round((project.pnl / Math.max(1, project.logwork)) * 100)}%</strong><span className="text-[10px] text-violet-800/70">P&amp;L Hour / Logwork Hour</span></div>
                  <div className="rounded-xl border border-amber-100 bg-amber-50/70 p-3"><span className="text-[10px] font-semibold uppercase tracking-wide text-amber-700">Cần xử lý</span><strong className="mt-1 block font-mono text-lg text-amber-900">{project.pending}h</strong><span className="text-[10px] text-amber-800/70">Thiếu duyệt hoặc Cost Rate hiệu lực</span></div>
                </div>
                <section className="rounded-xl border border-border bg-muted/20 p-4">
                  <div className="flex items-center justify-between gap-3">
                    <div><h3 className="text-sm font-bold">Tổng quan Logwork theo ngày</h3><p className="mt-1 text-[11px] text-muted-foreground">Tổng giờ của tất cả nhân sự trong từng ngày thuộc kỳ báo cáo.</p></div>
                    <span className="rounded-md bg-white px-2 py-1 text-[10px] font-semibold text-slate-600">{LOGWORK_DATES.length} ngày ghi nhận</span>
                  </div>
                  <div className="mt-4 grid grid-cols-2 gap-3 md:grid-cols-4">
                    {dailyTotals.map((item) => <div key={item.date} className="rounded-lg border border-border bg-card p-3"><div className="text-[10px] font-semibold text-muted-foreground">{item.date}</div><strong className="mt-1 block font-mono text-lg">{item.hours.toFixed(1)}h</strong><div className="mt-2 h-1.5 rounded-full bg-muted"><div className="h-full rounded-full bg-emerald-500" style={{ width: `${Math.min(100, (item.hours / Math.max(...dailyTotals.map((day) => day.hours), 1)) * 100)}%` }} /></div></div>)}
                  </div>
                </section>
                <section className="overflow-hidden rounded-xl border border-border">
                  <div className="border-b border-border bg-muted/30 px-4 py-4">
                    <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
                      <div>
                        <div className="flex items-center gap-2"><h3 className="text-sm font-bold">Logwork Daily · ma trận theo người và ngày</h3><Status tone="info">EV-007</Status></div>
                        <p className="mt-1 text-[11px] text-muted-foreground">Mỗi ô là số giờ thực tế đã ghi nhận. Tổng người và tổng ngày dùng để đối soát với Logwork Hour ở trên.</p>
                      </div>
                      <div className="flex items-center gap-2"><span className="rounded-md bg-white px-2 py-1 text-[10px] font-semibold text-slate-600">{LOGWORK_PEOPLE.length} nhân sự</span><span className="rounded-md bg-emerald-50 px-2 py-1 text-[10px] font-semibold text-emerald-700">Tổng {project.logwork.toLocaleString("vi-VN")}h</span></div>
                    </div>
                    <div className="mt-4 flex flex-wrap items-center gap-2 text-[10px]">
                      <span className="rounded-md bg-white px-2 py-1 font-semibold text-slate-600">Bảng chi tiết theo ngày</span>
                      <span className="rounded-md bg-emerald-50 px-2 py-1 font-semibold text-emerald-700">Tổng {project.logwork.toLocaleString("vi-VN")}h</span>
                      <span className="rounded-md bg-blue-50 px-2 py-1 font-semibold text-blue-700">Tối đa 8h / người / ngày</span>
                      <span className="text-muted-foreground">Màu xanh: giờ đã ghi nhận · Tổng cuối dòng: tổng giờ của nhân sự</span>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[820px] text-left text-xs">
                      <thead className="bg-muted/20 text-[10px] uppercase tracking-wide text-muted-foreground"><tr><th className="sticky left-0 z-[1] bg-muted/20 px-4 py-3">Nhân sự / vai trò</th>{LOGWORK_DATES.map((date) => <th key={date} className="px-3 py-3 text-right">{date}</th>)}<th className="px-4 py-3 text-right">Tổng người</th></tr></thead>
                      <tbody className="divide-y divide-border">
                        {dailyLogworkTotals.map((person) => <tr key={person.name} className="hover:bg-muted/20"><td className="sticky left-0 bg-card px-4 py-3"><div className="flex items-center gap-2"><span className="flex h-7 w-7 items-center justify-center rounded-full text-[9px] font-bold text-white" style={{ backgroundColor: dailyLogwork.find((entry) => entry.name === person.name)?.color }}>{person.name.split(" ").map((part) => part[0]).join("").slice(0, 2)}</span><div><div className="font-semibold">{person.name}</div><div className="text-[10px] text-muted-foreground">{person.role}</div></div></div></td>{LOGWORK_DATES.map((date) => { const entry = dailyLogwork.find((item) => item.name === person.name && item.date === date); return <td key={date} className="px-3 py-3 text-right"><span className={`inline-flex min-w-[48px] justify-center rounded-md px-2 py-1 font-mono font-semibold ${entry && entry.hours > 9 ? "bg-amber-50 text-amber-700" : "bg-emerald-50 text-emerald-700"}`}>{entry?.hours.toFixed(1)}h</span></td>; })}<td className="px-4 py-3 text-right font-mono font-bold">{person.total.toFixed(1)}h</td></tr>)}
                        <tr className="bg-muted/30 font-bold"><td className="px-4 py-3">Tổng theo ngày</td>{dailyTotals.map((item) => <td key={item.date} className="px-3 py-3 text-right font-mono">{item.hours.toFixed(1)}h</td>)}<td className="px-4 py-3 text-right font-mono text-emerald-700">{dailyTotals.reduce((sum, item) => sum + item.hours, 0).toFixed(1)}h</td></tr>
                      </tbody>
                    </table>
                  </div>
                </section>
                <section className="overflow-hidden rounded-xl border border-amber-200 bg-amber-50/30">
                  <div className="border-b border-amber-200 px-4 py-4">
                    <div className="flex items-center justify-between gap-3">
                      <div><h3 className="text-sm font-bold">Delivery / DX · phân bổ theo nhân sự</h3><p className="mt-1 text-[11px] text-muted-foreground">Đối soát 3 lớp giờ cho từng thành viên thuộc nhóm Delivery / DX.</p></div>
                      <Status tone="warning">{deliveryDxPeople.length} nhân sự</Status>
                    </div>
                  </div>
                  <div className="overflow-x-auto">
                    <table className="w-full min-w-[900px] text-left text-xs">
                      <thead className="bg-amber-50/60 text-[10px] uppercase tracking-wide text-muted-foreground"><tr><th className="px-4 py-3">Nhân sự / vai trò</th><th className="px-3 py-3 text-right">Plan Hour</th><th className="px-3 py-3 text-right">Logwork Hour</th><th className="px-3 py-3 text-right">P&amp;L Hour</th>{LOGWORK_DATES.slice(0, 10).map((date) => <th key={date} className="px-2 py-3 text-right">{date.slice(0, 5)}</th>)}</tr></thead>
                      <tbody className="divide-y divide-amber-100">
                        {deliveryDxBreakdown.map((person) => <tr key={person.name} className="hover:bg-amber-50/60"><td className="px-4 py-3"><div className="font-semibold">{person.name}</div><div className="text-[10px] text-muted-foreground">{person.role}</div></td><td className="px-3 py-3 text-right font-mono">{person.plan.toFixed(1)}h</td><td className="px-3 py-3 text-right font-mono font-semibold text-emerald-700">{person.logwork.toFixed(1)}h</td><td className="px-3 py-3 text-right font-mono font-semibold text-violet-700">{person.pnl.toFixed(1)}h</td>{LOGWORK_DATES.slice(0, 10).map((date) => { const entry = dailyLogwork.find((item) => item.name === person.name && item.date === date); return <td key={date} className="px-2 py-3 text-right font-mono text-slate-700">{entry?.hours.toFixed(1)}h</td>; })}</tr>)}
                        <tr className="bg-amber-50/70 font-bold"><td className="px-4 py-3">Tổng Delivery / DX</td><td className="px-3 py-3 text-right font-mono">{deliveryDxBreakdown.reduce((sum, person) => sum + person.plan, 0).toFixed(1)}h</td><td className="px-3 py-3 text-right font-mono text-emerald-700">{deliveryDxBreakdown.reduce((sum, person) => sum + person.logwork, 0).toFixed(1)}h</td><td className="px-3 py-3 text-right font-mono text-violet-700">{deliveryDxBreakdown.reduce((sum, person) => sum + person.pnl, 0).toFixed(1)}h</td>{LOGWORK_DATES.slice(0, 10).map((date) => <td key={date} className="px-2 py-3 text-right font-mono">{dailyLogwork.filter((item) => item.date === date && deliveryDxPeople.some((person) => person.name === item.name)).reduce((sum, item) => sum + item.hours, 0).toFixed(1)}h</td>)}</tr>
                      </tbody>
                    </table>
                  </div>
                  <p className="border-t border-amber-200 px-4 py-3 text-[10px] text-muted-foreground">Bảng hiển thị 10 ngày đầu; ma trận Logwork Daily phía trên chứa toàn bộ ngày trong kỳ.</p>
                </section>
                {project.pending > 0 ? <section className="mt-4 rounded-xl border border-amber-200 bg-amber-50/70 p-4"><div className="flex items-start gap-3"><AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-amber-700" /><div><h3 className="text-sm font-bold text-amber-900">Danh sách chờ xử lý</h3><p className="mt-1 text-xs leading-relaxed text-amber-800">{project.pending}h Logwork chưa được đưa vào P&amp;L Hour. Cần kiểm tra trạng thái duyệt, mapping project và Cost Rate hiệu lực trước khi chốt kỳ.</p><div className="mt-3 flex flex-wrap gap-2"><span className="rounded-md bg-white px-2 py-1 text-[10px] font-semibold text-amber-800">Kiểm tra approval</span><span className="rounded-md bg-white px-2 py-1 text-[10px] font-semibold text-amber-800">Kiểm tra Cost Rate</span><span className="rounded-md bg-white px-2 py-1 text-[10px] font-semibold text-amber-800">Ghi audit reason</span></div></div></div></section> : null}
                <div className="grid gap-4 md:grid-cols-2">
                  <section className="rounded-xl border border-border p-4">
                    <h3 className="text-sm font-bold">Đối soát giờ</h3>
                    <dl className="mt-3 space-y-3 text-xs">
                      <div className="flex justify-between">
                        <dt>Được tính vào P&amp;L</dt>
                        <dd className="font-mono font-semibold text-emerald-700">
                          {project.pnl}h
                        </dd>
                      </div>
                      <div className="flex justify-between">
                        <dt>Bị loại</dt>
                        <dd className="font-mono">{excluded}h</dd>
                      </div>
                      <div className="flex justify-between">
                        <dt>Chờ xử lý</dt>
                        <dd className="font-mono font-semibold text-amber-700">
                          {project.pending}h
                        </dd>
                      </div>
                    </dl>
                  </section>
                  <section className="rounded-xl border border-border p-4">
                    <h3 className="text-sm font-bold">Kết quả</h3>
                    <dl className="mt-3 space-y-3 text-xs">
                      <div className="flex justify-between">
                        <dt>Revenue chưa VAT</dt>
                        <dd className="font-mono font-semibold">
                          {project.revenue.toLocaleString("vi-VN")} ₫
                        </dd>
                      </div>
                      <div className="flex justify-between">
                        <dt>Total Expenses</dt>
                        <dd className="font-mono font-semibold">
                          {project.expenses.toLocaleString("vi-VN")} ₫
                        </dd>
                      </div>
                      <div className="flex justify-between">
                        <dt>EBIT</dt>
                        <dd className="font-mono font-bold text-emerald-700">
                          {ebit === null ? "Thiếu dữ liệu" : `${ebit.toLocaleString("vi-VN")} ₫`}
                        </dd>
                      </div>
                      <div className="flex justify-between">
                        <dt>Biên EBIT</dt>
                        <dd className="font-mono font-semibold">
                          {margin === null ? "Thiếu dữ liệu" : `${margin.toFixed(1)}%`}
                        </dd>
                      </div>
                    </dl>
                  </section>
                </div>
                <section className="rounded-xl border border-border p-4">
                  <h3 className="text-sm font-bold">Expenses theo 6 nhóm</h3>
                  <div className="mt-3 grid grid-cols-2 gap-2 md:grid-cols-3">
                    {EXPENSES.map((label, index) => (
                      <div
                        key={label}
                        className="rounded-lg bg-muted/40 p-3 text-xs"
                      >
                        <div className="flex justify-between">
                          <span className="font-semibold">{label}</span>
                          <span>{Math.round(expenseShare[index] * 100)}%</span>
                        </div>
                        <strong className="mt-1 block font-mono">
                          {Math.round(
                            project.expenses * expenseShare[index],
                          ).toLocaleString("vi-VN")}{" "}
                          ₫
                        </strong>
                      </div>
                    ))}
                  </div>
                </section>
            </section>
          ) : null}
          <div className="rounded-xl border border-amber-200 bg-amber-50/70 p-4 text-xs text-amber-900">
            <div className="flex items-start gap-2">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
              <div>
                <strong>Quy tắc dữ liệu</strong>
                <p className="mt-1 leading-relaxed">
                  Plan là baseline, Logwork là giờ thực tế, P&amp;L Hour chỉ gồm
                  Logwork đã được duyệt và có Cost Rate hiệu lực. Nếu còn giờ
                  chờ xử lý, kết quả EBIT được xem là tạm tính.
                </p>
              </div>
            </div>
          </div>
        </div>
      </main>
    </AppShell>
  );
}
