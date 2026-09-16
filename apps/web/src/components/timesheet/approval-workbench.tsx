"use client";

import { useMemo } from "react";
import { useSearchParams } from "next/navigation";
import { EvTrace } from "@/components/pilot/ev-trace";
import { getTimesheetDataset } from "./timesheet-mock-data";
import { OvertimeApprovalPanel } from "./overtime-approval-panel";

/** Dedicated Approval surface for the EV-060 overtime workflow. */
export function ApprovalWorkbench() {
  const searchParams = useSearchParams();
  const dataset = useMemo(() => getTimesheetDataset(), []);
  const audience = searchParams.get("mode") === "user" ? "user" : "admin";

  return (
    <div className="mx-auto w-full max-w-[1480px] space-y-4">
      <EvTrace
        ev="EV-060"
        title="Approval"
        scope="Phê duyệt OT, tạo task và kiểm soát giờ chuẩn 8h/ngày"
      />
      <div className="rounded-2xl border border-blue-200 bg-blue-50/60 px-5 py-4">
        <h1 className="text-xl font-extrabold tracking-tight text-foreground sm:text-2xl">Approval</h1>
        <p className="mt-1 max-w-3xl text-sm text-muted-foreground">
          Trung tâm xử lý yêu cầu làm thêm giờ. Mỗi yêu cầu gắn với một nhân sự, ngày, project và task cụ thể; chỉ OT đã duyệt mới được tạo task và tính vào Timesheet/P&amp;L.
        </p>
        <div className="mt-3 inline-flex rounded-lg border border-blue-200 bg-background p-1 text-xs font-semibold">
          <span className={`rounded-md px-3 py-1.5 ${audience === "admin" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>Admin duyệt</span>
          <a href="/approval?mode=user" className={`rounded-md px-3 py-1.5 ${audience === "user" ? "bg-primary text-primary-foreground" : "text-muted-foreground"}`}>User gửi yêu cầu</a>
        </div>
      </div>
      <OvertimeApprovalPanel dataset={dataset} logs={dataset.logs} audience={audience} scope="workspace" />
    </div>
  );
}
