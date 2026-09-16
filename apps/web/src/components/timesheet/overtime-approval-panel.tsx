"use client";

import { useMemo, useState } from "react";
import { AlertTriangle, Check, Clock3, Plus, ShieldCheck, X } from "lucide-react";
import { formatDate } from "./timesheet-format";
import { SectionCard, Pill } from "./timesheet-ui";
import type { Person, ProjectNode, TimeLog, TimesheetDataset } from "./timesheet-types";

type RequestStatus = "submitted" | "approved" | "rejected";

type OvertimeRequest = {
  id: string;
  personId: string;
  date: string;
  projectId: string;
  hours: number;
  reason: string;
  taskName: string;
  status: RequestStatus;
  taskCreated: boolean;
};

const STATUS_LABELS: Record<RequestStatus, string> = {
  submitted: "Chờ cấp trên duyệt",
  approved: "Đã duyệt OT",
  rejected: "Từ chối",
};

function statusTone(status: RequestStatus) {
  return status === "approved" ? "success" : status === "rejected" ? "danger" : "warning";
}

function seededRequests(dataset: TimesheetDataset): OvertimeRequest[] {
  const personA = dataset.people[0];
  const personB = dataset.people[1] ?? personA;
  const projectA = dataset.projects[0];
  const projectB = dataset.projects[1] ?? projectA;
  return [
    { id: "ot-001", personId: personA.id, date: "2026-07-28", projectId: projectA.id, hours: 2, reason: "Hoàn tất kiểm thử regression trước mốc nghiệm thu", taskName: "Regression test & fix blocker", status: "submitted", taskCreated: false },
    { id: "ot-002", personId: personB.id, date: "2026-07-25", projectId: projectB.id, hours: 1.5, reason: "Hỗ trợ xử lý incident production", taskName: "Production support ngoài giờ", status: "approved", taskCreated: true },
  ];
}

export function OvertimeApprovalPanel({
  dataset,
  logs,
  audience,
  scope,
}: {
  dataset: TimesheetDataset;
  logs: TimeLog[];
  audience: "user" | "admin";
  scope: string;
}) {
  const [requests, setRequests] = useState<OvertimeRequest[]>(() => seededRequests(dataset));
  const defaultPerson = scope === "self" ? dataset.people.find((person) => person.id === "per-3") ?? dataset.people[0] : dataset.people[0];
  const [personId, setPersonId] = useState(defaultPerson?.id ?? "");
  const [date, setDate] = useState("2026-07-29");
  const [projectId, setProjectId] = useState(dataset.projects[0]?.id ?? "");
  const [hours, setHours] = useState("2");
  const [reason, setReason] = useState("");
  const [taskName, setTaskName] = useState("");
  const [error, setError] = useState("");
  const [submitted, setSubmitted] = useState(false);

  const people = useMemo(
    () => scope === "self" ? dataset.people.filter((person) => person.id === "per-3") : dataset.people,
    [dataset.people, scope],
  );
  const selectedPerson = people.find((person) => person.id === personId) ?? people[0];
  const selectedProject = dataset.projects.find((project) => project.id === projectId) ?? dataset.projects[0];
  const standardMinutes = useMemo(
    () => logs.filter((log) => log.personId === selectedPerson?.id && log.date === date).reduce((sum, log) => sum + log.minutes, 0),
    [date, logs, selectedPerson?.id],
  );
  const regularHours = standardMinutes / 60;
  const remainingHours = Math.max(0, 8 - Math.min(8, regularHours));
  const overStandard = regularHours > 8;

  const submitRequest = () => {
    const parsedHours = Number(hours);
    if (!selectedPerson || !selectedProject || !date || parsedHours <= 0 || parsedHours > 8) {
      setError("Giờ OT phải lớn hơn 0 và tối đa 8h cho một ngày. Hãy kiểm tra lại ngày, project và nhân sự.");
      return;
    }
    if (!reason.trim() || !taskName.trim()) {
      setError("Cần nhập lý do OT và tên task dự kiến để cấp trên có đủ căn cứ phê duyệt.");
      return;
    }
    setRequests((current) => [{ id: `ot-${Date.now()}`, personId: selectedPerson.id, date, projectId: selectedProject.id, hours: parsedHours, reason: reason.trim(), taskName: taskName.trim(), status: "submitted", taskCreated: false }, ...current]);
    setReason("");
    setTaskName("");
    setSubmitted(true);
    setError("");
  };

  const transition = (id: string, status: RequestStatus) => {
    setRequests((current) => current.map((request) => request.id === id ? { ...request, status } : request));
  };

  const createTask = (id: string) => {
    setRequests((current) => current.map((request) => request.id === id ? { ...request, taskCreated: true } : request));
  };

  const projectName = (id: string) => dataset.projects.find((project) => project.id === id)?.code ?? id;
  const personName = (id: string) => dataset.people.find((person) => person.id === id)?.name ?? id;

  return (
    <SectionCard
      id="ev-060-overtime"
      title="EV-060 · Giờ chuẩn & yêu cầu OT"
      description="Giờ chuẩn được khóa tối đa 8h/ngày. OT là luồng riêng, chỉ được tính vào Timesheet sau khi cấp trên phê duyệt."
      actions={<Pill tone="info">{requests.filter((request) => request.status === "submitted").length} yêu cầu chờ duyệt</Pill>}
    >
      <div className="grid gap-4 p-4 xl:grid-cols-[1.05fr_.95fr]">
        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-3">
            <div className={`rounded-xl border p-3 ${overStandard ? "border-red-200 bg-red-50" : "border-emerald-200 bg-emerald-50"}`}>
              <div className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground"><Clock3 className="h-3.5 w-3.5" /> Giờ chuẩn trong ngày</div>
              <strong className={`mt-1 block font-mono text-xl ${overStandard ? "text-red-700" : "text-emerald-700"}`}>{regularHours.toFixed(1)}h / 8h</strong>
              <span className="text-[10px] text-muted-foreground">{overStandard ? "Vượt giới hạn — cần tách thành OT" : `${remainingHours.toFixed(1)}h còn lại`}</span>
            </div>
            <div className="rounded-xl border border-amber-200 bg-amber-50 p-3"><div className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground"><Plus className="h-3.5 w-3.5" /> OT đề nghị</div><strong className="mt-1 block font-mono text-xl text-amber-800">{requests.filter((request) => request.status === "submitted").reduce((sum, request) => sum + request.hours, 0).toFixed(1)}h</strong><span className="text-[10px] text-muted-foreground">Chưa cộng vào giờ chuẩn</span></div>
            <div className="rounded-xl border border-blue-200 bg-blue-50 p-3"><div className="flex items-center gap-1.5 text-[11px] font-semibold text-muted-foreground"><ShieldCheck className="h-3.5 w-3.5" /> OT được tính</div><strong className="mt-1 block font-mono text-xl text-blue-800">{requests.filter((request) => request.status === "approved").reduce((sum, request) => sum + request.hours, 0).toFixed(1)}h</strong><span className="text-[10px] text-muted-foreground">Chỉ OT đã duyệt</span></div>
          </div>

          <div className="rounded-xl border border-border bg-muted/20 p-4">
            <h4 className="text-sm font-bold">Tạo yêu cầu OT</h4>
            <p className="mt-1 text-[11px] text-muted-foreground">Chọn đúng người, project và ngày. Không thể ghi OT trực tiếp vào Timesheet khi chưa duyệt.</p>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <label className="text-[11px] font-semibold text-muted-foreground">Nhân sự<select className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-2 text-xs" value={personId} onChange={(event) => setPersonId(event.target.value)}>{people.map((person) => <option key={person.id} value={person.id}>{person.name}</option>)}</select></label>
              <label className="text-[11px] font-semibold text-muted-foreground">Ngày OT<input type="date" className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-2 text-xs" value={date} onChange={(event) => setDate(event.target.value)} /></label>
              <label className="text-[11px] font-semibold text-muted-foreground">Dự án<select className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-2 text-xs" value={projectId} onChange={(event) => setProjectId(event.target.value)}>{dataset.projects.map((project) => <option key={project.id} value={project.id}>{project.code} · {project.name}</option>)}</select></label>
              <label className="text-[11px] font-semibold text-muted-foreground">Số giờ OT<input type="number" min="0.5" max="8" step="0.5" className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-2 text-xs font-mono" value={hours} onChange={(event) => setHours(event.target.value)} /></label>
              <label className="text-[11px] font-semibold text-muted-foreground sm:col-span-2">Task dự kiến<input className="mt-1 h-9 w-full rounded-lg border border-border bg-background px-2 text-xs" placeholder="Ví dụ: Fix blocker nghiệm thu" value={taskName} onChange={(event) => setTaskName(event.target.value)} /></label>
              <label className="text-[11px] font-semibold text-muted-foreground sm:col-span-2">Lý do OT<textarea className="mt-1 min-h-16 w-full resize-y rounded-lg border border-border bg-background px-2 py-2 text-xs" placeholder="Nêu lý do và kết quả cần hoàn thành" value={reason} onChange={(event) => setReason(event.target.value)} /></label>
            </div>
            {error ? <p role="alert" className="mt-3 flex items-start gap-1.5 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-[11px] text-red-700"><AlertTriangle className="mt-0.5 h-3.5 w-3.5 shrink-0" />{error}</p> : null}
            {submitted ? <p role="status" className="mt-3 flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-[11px] font-semibold text-emerald-700"><Check className="h-3.5 w-3.5" />Đã gửi yêu cầu OT — đang chờ cấp trên duyệt.</p> : null}
            <button type="button" onClick={submitRequest} className="mt-3 inline-flex h-9 items-center gap-1.5 rounded-lg bg-primary px-3 text-xs font-bold text-white hover:bg-primary/90"><Plus className="h-3.5 w-3.5" /> Gửi yêu cầu OT</button>
          </div>
        </div>

        <div className="rounded-xl border border-border">
          <div className="border-b border-border px-4 py-3"><h4 className="text-sm font-bold">Danh sách yêu cầu OT</h4><p className="mt-1 text-[11px] text-muted-foreground">OT chỉ xuất hiện trong bảng giờ và được tính P&amp;L sau trạng thái Đã duyệt.</p></div>
          <div className="divide-y divide-border">
            {requests.map((request) => (
              <div key={request.id} className="space-y-2 p-3">
                <div className="flex items-start justify-between gap-2"><div><div className="text-xs font-bold">{request.taskName}</div><div className="mt-0.5 text-[10px] text-muted-foreground">{personName(request.personId)} · {projectName(request.projectId)} · {formatDate(request.date)}</div></div><Pill tone={statusTone(request.status)}>{STATUS_LABELS[request.status]}</Pill></div>
                <div className="flex items-center justify-between gap-2 text-[11px]"><span className="font-mono font-bold text-amber-700">{request.hours}h OT</span><span className="truncate text-muted-foreground">{request.reason}</span></div>
                <div className="flex flex-wrap items-center gap-2">
                  {audience === "admin" && request.status === "submitted" ? <><button type="button" onClick={() => transition(request.id, "approved")} className="inline-flex h-7 items-center gap-1 rounded-md bg-emerald-600 px-2 text-[10px] font-bold text-white hover:bg-emerald-700"><Check className="h-3 w-3" /> Duyệt OT</button><button type="button" onClick={() => transition(request.id, "rejected")} className="inline-flex h-7 items-center gap-1 rounded-md border border-red-200 px-2 text-[10px] font-bold text-red-700 hover:bg-red-50"><X className="h-3 w-3" /> Từ chối</button></> : null}
                  {request.status === "approved" && !request.taskCreated ? <button type="button" onClick={() => createTask(request.id)} className="inline-flex h-7 items-center gap-1 rounded-md border border-blue-200 bg-blue-50 px-2 text-[10px] font-bold text-blue-700 hover:bg-blue-100"><Plus className="h-3 w-3" /> Tạo task từ OT đã duyệt</button> : null}
                  {request.status === "approved" && request.taskCreated ? <span className="text-[10px] font-semibold text-emerald-700">✓ Task đã tạo · OT được tính vào Timesheet</span> : null}
                </div>
              </div>
            ))}
          </div>
        </div>
      </div>
      <div className="flex items-start gap-2 border-t border-border bg-slate-50 px-4 py-3 text-[10px] leading-relaxed text-slate-600"><ShieldCheck className="mt-0.5 h-3.5 w-3.5 shrink-0 text-primary" /><span><strong>Rule hệ thống:</strong> 8h/ngày là giờ chuẩn, không cộng dồn OT vào giờ chuẩn. Mỗi yêu cầu phải có người, ngày, project, số giờ, lý do và task dự kiến. Chỉ bản ghi <strong>Đã duyệt</strong> mới đủ điều kiện tạo task OT và đi vào tổng Timesheet/P&amp;L.</span></div>
    </SectionCard>
  );
}

