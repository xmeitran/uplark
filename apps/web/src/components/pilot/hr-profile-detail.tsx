"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { ArrowLeft, Check, Clock3, History, Save, ShieldCheck } from "lucide-react";
import { AppShell } from "@/components/constructor-x/app-shell";
import { EvTrace } from "./ev-trace";
import { Avatar, Badge, PEOPLE } from "./hr-profile-workbench";

export function HrProfileDetail() {
  const params = useParams<{ personId: string }>();
  const person = useMemo(
    () => PEOPLE.find((item) => item.id === params?.personId) ?? PEOPLE[0],
    [params?.personId],
  );
  const [form, setForm] = useState({
    level: person.level,
    role: person.role,
    department: person.department,
    rateCategory: person.rateCategory,
    rate: String(person.rate),
    overtimeHours: String(person.overtimeHours),
    effective: person.effective,
    status: person.status,
    employmentType: person.employmentType,
    manager: person.manager,
  });
  const [saved, setSaved] = useState(false);
  const update = (key: keyof typeof form, value: string) => {
    setSaved(false);
    setForm((current) => ({ ...current, [key]: value }));
  };
  const inputClass = "mt-1 h-10 w-full rounded-lg border border-border bg-background px-3 text-sm outline-none transition focus:border-primary focus:ring-2 focus:ring-primary/10";
  return (
    <AppShell activeRoute="/people" title="Chi tiết hồ sơ nhân sự">
      <main className="min-h-0 flex-1 overflow-y-auto bg-muted/20 p-4 sm:p-6">
        <div className="mx-auto max-w-[1180px] space-y-5">
          <EvTrace ev="EV-006" title="Hồ sơ nhân sự / Chi tiết thông tin" scope="Thông tin nhân sự, Rate Category, Cost Rate, OT và ngày hiệu lực" />
          <div className="flex items-center justify-between gap-3">
            <Link href="/people" className="inline-flex items-center gap-2 text-sm font-semibold text-muted-foreground transition hover:text-foreground">
              <ArrowLeft className="h-4 w-4" /> Quay lại danh sách nhân sự
            </Link>
            <div className="flex items-center gap-2">
              <Badge tone={form.status === "Active" ? "green" : "amber"}>{form.status}</Badge>
              <span className="font-mono text-xs text-muted-foreground">{person.id}</span>
            </div>
          </div>

          <header className="flex flex-col gap-4 rounded-2xl border border-border bg-card p-5 shadow-sm sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-center gap-4">
              <Avatar person={person} large />
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.16em] text-primary">Hồ sơ nhân sự</p>
                <h1 className="mt-1 text-2xl font-extrabold tracking-tight">{person.name}</h1>
                <p className="mt-1 text-sm text-muted-foreground">{form.role} · {form.department} · Level {form.level}</p>
              </div>
            </div>
            <button type="button" onClick={() => { setSaved(true); }} className="inline-flex h-10 items-center justify-center gap-2 rounded-lg bg-primary px-4 text-sm font-bold text-white shadow-sm transition hover:bg-primary/90">
              <Save className="h-4 w-4" /> Lưu thay đổi
            </button>
          </header>

          {saved ? <div role="status" className="flex items-center gap-2 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm font-semibold text-emerald-700"><Check className="h-4 w-4" /> Đã lưu thông tin hồ sơ (bản demo)</div> : null}

          <section className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_320px]">
            <div className="space-y-5">
              <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                <div className="mb-4"><h2 className="text-base font-bold">Thông tin định danh & tổ chức</h2><p className="mt-1 text-xs text-muted-foreground">Các trường dùng để phân quyền, lọc Timesheet và đối soát theo phòng ban.</p></div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="text-xs font-semibold text-muted-foreground">Họ và tên<input className={inputClass} value={person.name} readOnly /></label>
                  <label className="text-xs font-semibold text-muted-foreground">User ID<input className={`${inputClass} font-mono`} value={person.id} readOnly /></label>
                  <label className="text-xs font-semibold text-muted-foreground">Vai trò<input className={inputClass} value={form.role} onChange={(e) => update("role", e.target.value)} /></label>
                  <label className="text-xs font-semibold text-muted-foreground">Phòng ban<input className={inputClass} value={form.department} onChange={(e) => update("department", e.target.value)} /></label>
                  <label className="text-xs font-semibold text-muted-foreground">Level<select className={inputClass} value={form.level} onChange={(e) => update("level", e.target.value)}><option>L1</option><option>L2</option><option>L3</option><option>L4</option><option>L5</option></select></label>
                  <label className="text-xs font-semibold text-muted-foreground">Loại nhân sự<select className={inputClass} value={form.employmentType} onChange={(e) => update("employmentType", e.target.value)}><option>Full-time</option><option>Part-time</option><option>Freelance</option><option>Intern</option></select></label>
                  <label className="text-xs font-semibold text-muted-foreground">Quản lý trực tiếp<input className={inputClass} value={form.manager} onChange={(e) => update("manager", e.target.value)} /></label>
                  <label className="text-xs font-semibold text-muted-foreground">Trạng thái<select className={inputClass} value={form.status} onChange={(e) => update("status", e.target.value)}><option>Active</option><option>On leave</option><option>On Hold</option><option>Inactive</option></select></label>
                </div>
              </section>

              <section className="rounded-2xl border border-border bg-card p-5 shadow-sm">
                <div className="mb-4 flex items-start justify-between gap-3"><div><h2 className="text-base font-bold">Cấu hình chi phí & giờ làm</h2><p className="mt-1 text-xs text-muted-foreground">Rate được áp dụng cho P&amp;L theo ngày hiệu lực của logwork.</p></div><ShieldCheck className="h-5 w-5 text-emerald-600" /></div>
                <div className="grid gap-4 sm:grid-cols-2">
                  <label className="text-xs font-semibold text-muted-foreground">Rate Category<input className={inputClass} value={form.rateCategory} onChange={(e) => update("rateCategory", e.target.value)} placeholder="Ví dụ: Delivery · PM" /></label>
                  <label className="text-xs font-semibold text-muted-foreground">Cost Rate (₫ / giờ)<input className={`${inputClass} font-mono`} inputMode="numeric" value={form.rate} onChange={(e) => update("rate", e.target.value.replace(/[^0-9]/g, ""))} /></label>
                  <label className="text-xs font-semibold text-muted-foreground">Giờ OT trong kỳ<input className={`${inputClass} font-mono`} inputMode="decimal" value={form.overtimeHours} onChange={(e) => update("overtimeHours", e.target.value.replace(/[^0-9.]/g, ""))} /></label>
                  <label className="text-xs font-semibold text-muted-foreground">Ngày hiệu lực<input className={inputClass} placeholder="DD/MM/YYYY" value={form.effective} onChange={(e) => update("effective", e.target.value)} /></label>
                </div>
                <div className="mt-4 flex items-start gap-2 rounded-lg bg-blue-50 px-3 py-2.5 text-xs text-blue-800"><Clock3 className="mt-0.5 h-4 w-4 shrink-0" /><span>Giờ chuẩn hiện được tính 8h/ngày công. OT được theo dõi riêng và không tự cộng vào giờ chuẩn.</span></div>
              </section>
            </div>

            <aside className="space-y-5">
              <section className="rounded-2xl border border-border bg-card p-5 shadow-sm"><h2 className="text-base font-bold">Tóm tắt kỳ hiện tại</h2><dl className="mt-4 divide-y divide-border text-sm"><div className="flex justify-between py-3"><dt className="text-muted-foreground">Plan Hour</dt><dd className="font-mono font-semibold">{person.plan}h</dd></div><div className="flex justify-between py-3"><dt className="text-muted-foreground">Actual Hour</dt><dd className="font-mono font-semibold">{person.actual}h</dd></div><div className="flex justify-between py-3"><dt className="text-muted-foreground">P&amp;L Hour</dt><dd className="font-mono font-semibold text-emerald-700">{Math.round(person.actual * 0.95)}h</dd></div><div className="flex justify-between py-3"><dt className="text-muted-foreground">OT đã ghi nhận</dt><dd className="font-mono font-semibold text-amber-700">{form.overtimeHours}h</dd></div></dl></section>
              <section className="rounded-2xl border border-border bg-card p-5 shadow-sm"><div className="flex items-center gap-2"><History className="h-4 w-4 text-primary" /><h2 className="text-base font-bold">Lịch sử Cost Rate</h2></div><div className="mt-4 space-y-3">{[[form.effective, `${Number(form.rate || 0).toLocaleString("vi-VN")} ₫/giờ`, "Đang hiệu lực"],["01/01/2026", "480.000 ₫/giờ", "Đã kết thúc"],["01/09/2025", "430.000 ₫/giờ", "Đã kết thúc"]].map(([date, rate, state], index) => <div key={`${date}-${rate}`} className="flex items-center gap-2 text-xs"><span className={`h-2 w-2 rounded-full ${index === 0 ? "bg-emerald-500" : "bg-slate-300"}`} /><span className="flex-1 font-semibold">{date}</span><span className="font-mono text-muted-foreground">{rate}</span><span className="text-[10px] text-muted-foreground">{state}</span></div>)}</div></section>
            </aside>
          </section>
        </div>
      </main>
    </AppShell>
  );
}
