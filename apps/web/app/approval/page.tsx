"use client";

import React, { Suspense } from "react";
import { AppShell } from "@/components/constructor-x/app-shell";
import { ApprovalWorkbench } from "@/components/timesheet/approval-workbench";

export default function ApprovalPage() {
  return (
    <AppShell activeRoute="/approval" shellTestId="approval-shell" title="Approval">
      <main className="min-h-0 flex-1 overflow-x-hidden overflow-y-auto overscroll-y-none p-4 sm:p-6">
        <Suspense fallback={<div className="h-96 animate-pulse rounded-2xl bg-muted" />}>
          <ApprovalWorkbench />
        </Suspense>
      </main>
    </AppShell>
  );
}
