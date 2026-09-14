"use client";
import { useMemo, useState } from "react";
import { AppShell } from "@/components/constructor-x/app-shell";
import { CustomDropdown } from "@/components/constructor-x/custom-controls";
import {
  AlertTriangle,
  Check,
  Download,
  History,
  Search,
  UserRoundCog,
} from "lucide-react";
import { EvTrace } from "./ev-trace";

const PEOPLE = [
  {
    id: "u-01",
    name: "Trần Văn Minh",
    role: "Project Manager",
    department: "Delivery",
    level: "L3",
    status: "Active",
    rate: 520000,
    effective: "01/07/2026",
    logs: 142,
    plan: 640,
    actual: 612,
    color: "#2563eb",
  },
  {
    id: "u-02",
    name: "Lê Ngọc Anh",
    role: "Business Analyst",
    department: "Consulting",
    level: "L2",
    status: "Active",
    rate: 410000,
    effective: "01/05/2026",
    logs: 128,
    plan: 520,
    actual: 486,
    color: "#7c3aed",
  },
  {
    id: "u-03",
    name: "Phạm Thanh Tùng",
    role: "Developer",
    department: "Engineering",
    level: "L3",
    status: "Active",
    rate: 460000,
    effective: "01/07/2026",
    logs: 168,
    plan: 480,
    actual: 452,
    color: "#059669",
  },
  {
    id: "u-04",
    name: "Hoàng Thu Hà",
    role: "QA Engineer",
    department: "Quality",
    level: "L2",
    status: "Active",
    rate: 360000,
    effective: "01/01/2026",
    logs: 96,
    plan: 360,
    actual: 318,
    color: "#d97706",
  },
  {
    id: "u-05",
    name: "Đỗ Nhật Nam",
    role: "Support",
    department: "Customer Success",
    level: "L1",
    status: "On leave",
    rate: 280000,
    effective: "15/03/2026",
    logs: 72,
    plan: 240,
    actual: 180,
    color: "#db2777",
  },
] as const;
function Badge({
  children,
  tone = "green",
}: {
  children: React.ReactNode;
  tone?: "green" | "amber" | "slate";
}) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-md px-2 py-1 text-[10px] font-semibold ${tone === "green" ? "bg-emerald-50 text-emerald-700" : tone === "amber" ? "bg-amber-50 text-amber-700" : "bg-slate-100 text-slate-600"}`}
    >
      <span className="h-1.5 w-1.5 rounded-full bg-current" />
      {children}
    </span>
  );
}
function Avatar({
  person,
  large = false,
}: {
  person: (typeof PEOPLE)[number];
  large?: boolean;
}) {
  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-bold text-white ${large ? "h-12 w-12 text-sm" : "h-8 w-8 text-[10px]"}`}
      style={{ backgroundColor: person.color }}
    >
      {person.name
        .split(" ")
        .map((x) => x[0])
        .slice(-2)
        .join("")}
    </span>
  );
}

export function HrProfileWorkbench() {
  const [query, setQuery] = useState("");
  const [department, setDepartment] = useState("all");
  const [status, setStatus] = useState("all");
  const [selectedId, setSelectedId] = useState<string>(PEOPLE[0].id);
  const [showHistory, setShowHistory] = useState(false);
  const filtered = useMemo(
    () =>
      PEOPLE.filter(
        (p) =>
          `${p.id} ${p.name} ${p.role} ${p.department}`
            .toLowerCase()
            .includes(query.toLowerCase()) &&
          (department === "all" || p.department === department) &&
          (status === "all" || p.status === status),
      ),
    [query, department, status],
  );
  // Keep the detail panel in the same filtered scope as the table. Previously
  // changing department/status left the old person selected, which made the
  // page appear not to react to the filter.
  const selected =
    filtered.find((p) => p.id === selectedId) ?? filtered[0] ?? PEOPLE[0];
  const exportCsv = () => {
    const rows = filtered.map((p) => [
      p.id,
      p.name,
      p.role,
      p.department,
      p.level,
      p.status,
      p.rate,
      p.effective,
      p.plan,
      p.actual,
    ]);
    const csv = [
      [
        "User ID",
        "Họ tên",
        "Vai trò",
        "Phòng ban",
        "Level",
        "Trạng thái",
        "Cost Rate/giờ",
        "Hiệu lực từ",
        "Plan Hour",
        "Actual Hour",
      ],
      ...rows,
    ]
      .map((row) =>
        row.map((cell) => `"${String(cell).replaceAll('"', '""')}"`).join(","),
      )
      .join("\n");
    const url = URL.createObjectURL(
      new Blob([`﻿${csv}`], { type: "text/csv;charset=utf-8" }),
    );
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "ho-so-nhan-su.csv";
    anchor.click();
    URL.revokeObjectURL(url);
  };
  return (
    <AppShell activeRoute="/people" title="Hồ sơ nhân sự">
      <main className="min-h-0 flex-1 overflow-y-auto p-4 sm:p-6">
        <div className="mx-auto max-w-[1480px] space-y-5">
          <EvTrace ev="EV-006" title="Hồ sơ nhân sự / Chi phí nguồn lực" scope="User ID, Level, Cost Rate và ngày hiệu lực phục vụ Timesheet/P&L" />
          <header className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
            <div>
              <p className="text-xs font-semibold text-primary">
                PEOPLE · COST CONTROL
              </p>
              <h1 className="mt-1 text-2xl font-extrabold tracking-tight">
                Hồ sơ nhân sự
              </h1>
              <p className="mt-1 text-xs text-muted-foreground">
                Nguồn chuẩn cho User ID, Cost Rate, Timesheet và P&amp;L.
              </p>
            </div>
            <button
              onClick={() => setShowHistory(true)}
              className="inline-flex h-10 items-center gap-2 rounded-lg bg-primary px-4 text-xs font-bold text-white"
            >
              <History className="h-4 w-4" /> Quản lý Cost Rate
            </button>
          </header>
          <div className="grid grid-cols-2 gap-3 xl:grid-cols-4">
            {[
              ["Tổng nhân sự", "24", "18 Active"],
              ["Cost Rate hợp lệ", "22 / 24", "2 cần xử lý"],
              ["User ID đã map", "22 / 24", "Dùng được cho P&L"],
              ["Time log tháng này", "606", "Từ Timesheet"],
            ].map(([label, value, hint], i) => (
              <article
                key={label}
                className="rounded-xl border border-border bg-card p-4 shadow-sm"
              >
                <div className="flex items-center justify-between">
                  <span className="text-[11px] font-semibold text-muted-foreground">
                    {label}
                  </span>
                  <span
                    className={`rounded-lg p-2 ${i === 1 ? "bg-amber-50 text-amber-600" : "bg-blue-50 text-blue-600"}`}
                  >
                    <UserRoundCog className="h-4 w-4" />
                  </span>
                </div>
                <strong className="mt-3 block text-2xl font-extrabold">
                  {value}
                </strong>
                <span className="mt-1 block text-[11px] text-muted-foreground">
                  {hint}
                </span>
              </article>
            ))}
          </div>
          <div className="flex flex-col gap-3 rounded-xl border border-border bg-card p-3 md:flex-row md:items-center">
            <div className="relative min-w-0 flex-1">
              <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
              <input
                aria-label="Tìm nhân sự"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Tìm theo tên, User ID, vai trò..."
                className="h-10 w-full rounded-lg border border-border bg-muted/30 pl-9 pr-3 text-xs outline-none focus:border-primary"
              />
            </div>
            <CustomDropdown
              ariaLabel="Phòng ban"
              options={[
                { value: "all", label: "Tất cả phòng ban" },
                ...Array.from(new Set(PEOPLE.map((p) => p.department))).map(
                  (d) => ({ value: d, label: d }),
                ),
              ]}
              value={department}
              onChange={setDepartment}
            />
            <CustomDropdown
              ariaLabel="Trạng thái"
              options={[
                { value: "all", label: "Tất cả trạng thái" },
                { value: "Active", label: "Active" },
                { value: "On leave", label: "On leave" },
              ]}
              value={status}
              onChange={setStatus}
            />
            <button
              type="button"
              onClick={exportCsv}
              className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-3 text-xs font-bold text-white shadow-sm transition hover:bg-primary/90"
            >
              <Download className="h-3.5 w-3.5" /> Xuất Excel
            </button>
          </div>
          <div className="flex flex-wrap items-center gap-2 rounded-xl border border-blue-100 bg-blue-50/60 px-3 py-2 text-xs">
            <span className="font-semibold text-blue-900">Đang hiển thị</span>
            <span className="rounded-md bg-white px-2 py-1 font-semibold text-blue-700 shadow-sm">{filtered.length} / {PEOPLE.length} hồ sơ</span>
            {department !== "all" ? <span className="rounded-md bg-white px-2 py-1 text-blue-800">Phòng ban: {department}</span> : null}
            {status !== "all" ? <span className="rounded-md bg-white px-2 py-1 text-blue-800">Trạng thái: {status}</span> : null}
            {query.trim() ? <span className="rounded-md bg-white px-2 py-1 text-blue-800">Tìm: “{query.trim()}”</span> : null}
            {(department !== "all" || status !== "all" || query.trim()) ? (
              <button type="button" onClick={() => { setDepartment("all"); setStatus("all"); setQuery(""); }} className="ml-auto font-semibold text-blue-700 hover:text-blue-900">Xoá bộ lọc</button>
            ) : <span className="text-blue-700/70">Tất cả hồ sơ trong workspace</span>}
          </div>
          <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_380px]">
            <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
              <div className="border-b border-border px-4 py-3">
                <h2 className="text-sm font-bold">Danh sách nhân sự</h2>
                <p className="text-[11px] text-muted-foreground">
                  {filtered.length} hồ sơ trong phạm vi lọc
                </p>
              </div>
              <div className="overflow-x-auto">
                <table className="w-full min-w-[900px] text-left text-xs">
                  <thead className="bg-muted/40 text-[10px] uppercase tracking-wide text-muted-foreground">
                    <tr>
                      <th className="px-4 py-3">Nhân sự / User ID</th>
                      <th className="px-3 py-3">Vai trò · Phòng ban</th>
                      <th className="px-3 py-3">Level</th>
                      <th className="px-3 py-3">Trạng thái</th>
                      <th className="px-3 py-3">Cost Rate</th>
                      <th className="px-3 py-3">Hiệu lực</th>
                      <th className="px-3 py-3">Logwork</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-border">
                    {filtered.map((person) => (
                      <tr
                        key={person.id}
                        onClick={() => setSelectedId(person.id)}
                        className={`cursor-pointer hover:bg-blue-50/40 ${selected.id === person.id ? "bg-blue-50/60" : ""}`}
                      >
                        <td className="px-4 py-3">
                          <div className="flex items-center gap-2.5">
                            <Avatar person={person} />
                            <div>
                              <div className="font-semibold">{person.name}</div>
                              <div className="font-mono text-[10px] text-muted-foreground">
                                {person.id}
                              </div>
                            </div>
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <div className="font-medium">{person.role}</div>
                          <div className="text-[10px] text-muted-foreground">
                            {person.department}
                          </div>
                        </td>
                        <td className="px-3 py-3">
                          <span className="rounded-md bg-violet-50 px-2 py-1 text-[10px] font-bold text-violet-700">
                            {person.level}
                          </span>
                        </td>
                        <td className="px-3 py-3">
                          <Badge
                            tone={
                              person.status === "Active" ? "green" : "amber"
                            }
                          >
                            {person.status}
                          </Badge>
                        </td>
                        <td className="px-3 py-3 font-mono font-semibold">
                          {person.rate.toLocaleString("vi-VN")} ₫/h
                        </td>
                        <td className="px-3 py-3 text-muted-foreground">
                          {person.effective}
                        </td>
                        <td className="px-3 py-3 font-mono">
                          {person.actual}h / {person.plan}h
                        </td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              </div>
            </section>
            <aside className="rounded-xl border border-border bg-card p-5 shadow-sm">
              <div className="flex items-start justify-between">
                <div>
                  <p className="text-[10px] font-bold uppercase tracking-wider text-primary">
                    Hồ sơ đang chọn
                  </p>
                  <h2 className="mt-1 text-lg font-bold">{selected.name}</h2>
                  <p className="text-xs text-muted-foreground">
                    {selected.role} · {selected.department}
                  </p>
                </div>
                <Badge tone={selected.status === "Active" ? "green" : "amber"}>
                  {selected.status}
                </Badge>
              </div>
              <div className="mt-4 flex items-center gap-3">
                <Avatar person={selected} large />
                <div>
                  <div className="font-mono text-xs font-semibold">
                    {selected.id}
                  </div>
                  <div className="mt-1 text-[11px] text-muted-foreground">
                    Level {selected.level}
                  </div>
                </div>
              </div>
              <dl className="mt-5 divide-y divide-border text-xs">
                <div className="flex justify-between py-3">
                  <dt className="text-muted-foreground">Cost Rate hiện tại</dt>
                  <dd className="font-mono font-semibold">
                    {selected.rate.toLocaleString("vi-VN")} ₫/giờ
                  </dd>
                </div>
                <div className="flex justify-between py-3">
                  <dt className="text-muted-foreground">Hiệu lực từ</dt>
                  <dd className="font-semibold">{selected.effective}</dd>
                </div>
                <div className="flex justify-between py-3">
                  <dt className="text-muted-foreground">Plan / Actual</dt>
                  <dd className="font-mono font-semibold">
                    {selected.plan}h / {selected.actual}h
                  </dd>
                </div>
                <div className="flex justify-between py-3">
                  <dt className="text-muted-foreground">P&amp;L Hour</dt>
                  <dd className="font-mono font-semibold text-emerald-700">
                    {Math.round(selected.actual * 0.95)}h
                  </dd>
                </div>
              </dl>
              <div className="mt-4 rounded-lg bg-blue-50 p-3 text-[11px] text-blue-800">
                <div className="flex items-center gap-1.5 font-bold">
                  <Check className="h-3.5 w-3.5" /> Mapping P&amp;L hợp lệ
                </div>
                <p className="mt-1">
                  User ID và Cost Rate được dùng theo đúng ngày logwork.
                </p>
              </div>
              <button
                onClick={() => setShowHistory(true)}
                className="mt-4 flex w-full items-center justify-between rounded-lg border border-border px-3 py-2.5 text-xs font-semibold hover:bg-muted"
              >
                <span className="flex items-center gap-2">
                  <History className="h-3.5 w-3.5 text-primary" /> Xem lịch sử
                  Cost Rate
                </span>
                <span>→</span>
              </button>
            </aside>
          </div>
          {showHistory ? (
            <div
              className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/40 p-4"
              role="dialog"
              aria-modal="true"
            >
              <div className="w-full max-w-lg rounded-2xl border border-border bg-card p-5 shadow-2xl">
                <div className="flex items-start justify-between">
                  <div>
                    <h2 className="text-base font-bold">
                      Cost Rate · {selected.name}
                    </h2>
                    <p className="mt-1 text-xs text-muted-foreground">
                      Lịch sử hiệu lực dùng cho tính chi phí P&amp;L.
                    </p>
                  </div>
                  <button
                    onClick={() => setShowHistory(false)}
                    className="rounded-lg border border-border px-2 py-1 text-xs"
                  >
                    Đóng
                  </button>
                </div>
                <div className="mt-4 space-y-2">
                  {[
                    ["01/07/2026", "520.000 ₫/giờ", "Đang hiệu lực"],
                    ["01/01/2026", "480.000 ₫/giờ", "Đã kết thúc"],
                    ["01/09/2025", "430.000 ₫/giờ", "Đã kết thúc"],
                  ].map(([date, rate, state], index) => (
                    <div
                      key={date}
                      className="flex items-center gap-3 rounded-lg border border-border p-3"
                    >
                      <span
                        className={`h-2 w-2 rounded-full ${index === 0 ? "bg-emerald-500" : "bg-slate-300"}`}
                      />
                      <span className="flex-1 text-xs font-semibold">
                        {date}
                      </span>
                      <span className="font-mono text-xs">{rate}</span>
                      <Badge tone={index === 0 ? "green" : "slate"}>
                        {state}
                      </Badge>
                    </div>
                  ))}
                </div>
              </div>
            </div>
          ) : null}
        </div>
      </main>
    </AppShell>
  );
}
