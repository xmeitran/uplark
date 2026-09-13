"use client";
import { AdminMemberControls } from "@/components/auth/admin-access-controls";

import React, { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useSearchParams } from "next/navigation";
import {
  Activity,
  ArrowLeft,
  Briefcase,
  Calendar,
  CheckCircle2,
  Clock3,
  KeyRound,
  Mail,
  Shield,
  Sparkles,
  UserRound,
  Users,
} from "lucide-react";
import type {
  AdminAccessMemberResponse,
  AdminAccessMemberSummary,
  ProjectTaskSummary,
  ResourceListResponse,
} from "@b2b-crm/contracts";
import { AppShell } from "@/components/constructor-x/app-shell";

type ProfileTab = "Overview" | "Activity" | "Projects" | "Tasks";

const TABS: ProfileTab[] = ["Overview", "Activity", "Projects", "Tasks"];

function isProfileTab(value: string | null): value is ProfileTab {
  return Boolean(value && TABS.includes(value as ProfileTab));
}

const ROLE_COLORS: Record<string, string> = {
  FOUNDER_GM: "#2563eb",
  SALES_OWNER: "#16a34a",
  DELIVERY_LEAD: "#db2777",
  FINANCE_ADMIN: "#d97706",
};

const ROLE_LABELS: Record<string, string> = {
  FOUNDER_GM: "Founder / GM",
  SALES_OWNER: "Sales owner",
  DELIVERY_LEAD: "Delivery lead",
  FINANCE_ADMIN: "Finance admin",
};

const DEPARTMENT_LABELS: Record<string, string> = {
  CDS: "Chuyển đổi số",
  CDS_BUSINESS_DEVELOPMENT: "Business Development",
  CDS_DX_ENABLER: "DX Enabler",
  CDS_MARKETING_B2B: "Marketing B2B",
};

const STATUS_LABELS: Record<string, string> = {
  todo: "To do",
  in_progress: "In progress",
  review: "In review",
  blocked: "Blocked",
  done: "Done",
  completed: "Completed",
  cancelled: "Cancelled",
};

function initials(name: string) {
  const parts = name.trim().split(/\s+/).filter(Boolean);
  return (parts.length > 1 ? parts.slice(-2) : parts).map((part) => part[0]?.toUpperCase()).join("") || "U";
}

function formatDate(value?: string) {
  if (!value) return "TBD";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "TBD";
  return new Intl.DateTimeFormat("vi-VN", { day: "2-digit", month: "short", year: "numeric" }).format(date);
}

function formatDateTime(value?: string) {
  if (!value) return "Chưa có dữ liệu";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "Chưa có dữ liệu";
  return new Intl.DateTimeFormat("vi-VN", {
    day: "2-digit",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  }).format(date);
}

function labelRole(roleCode: string) {
  return ROLE_LABELS[roleCode] ?? roleCode.replaceAll("_", " ");
}

function labelDepartment(code?: string) {
  return code ? DEPARTMENT_LABELS[code] ?? code : "Chưa gán phòng ban";
}

function uniquePairs(ids: string[], names: string[]) {
  return ids.map((id, index) => ({ id, name: names[index] ?? id })).filter((item, index, items) => items.findIndex((candidate) => candidate.id === item.id) === index);
}

function EmptyPanel({ title, description }: { title: string; description: string }) {
  return (
    <div className="rounded-xl border border-dashed border-border bg-card p-8 text-center">
      <div className="mx-auto mb-3 flex h-10 w-10 items-center justify-center rounded-xl bg-muted text-muted-foreground">
        <Sparkles className="h-4 w-4" />
      </div>
      <h3 className="text-sm font-bold text-foreground">{title}</h3>
      <p className="mx-auto mt-1 max-w-md text-sm text-muted-foreground">{description}</p>
    </div>
  );
}

export default function UserProfilePage() {
  const params = useParams<{ userId: string }>();
  const searchParams = useSearchParams();
  const userId = params?.userId;
  const requestedTab = searchParams.get("tab");
  const [activeTab, setActiveTab] = useState<ProfileTab>(isProfileTab(requestedTab) ? requestedTab : "Overview");
  const [user, setUser] = useState<AdminAccessMemberSummary | null>(null);
  const [tasks, setTasks] = useState<ProjectTaskSummary[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [isTasksLoading, setIsTasksLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [tasksError, setTasksError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadUser() {
      if (!userId) return;
      setIsLoading(true);
      setError(null);
      try {
        const response = await fetch(`/api/admin/users/${encodeURIComponent(userId)}`, { cache: "no-store" });
        if (response.status === 401) {
          window.location.assign(`/login?returnTo=${encodeURIComponent(`/users/${userId}`)}`);
          return;
        }
        if (response.status === 404) {
          if (!cancelled) setUser(null);
          return;
        }
        if (!response.ok) throw new Error(`User detail API returned ${response.status}`);
        const payload = (await response.json()) as AdminAccessMemberResponse;
        if (!cancelled) setUser(payload.data);
      } catch (err) {
        if (!cancelled) setError(err instanceof Error ? err.message : "Could not load user profile");
      } finally {
        if (!cancelled) setIsLoading(false);
      }
    }

    void loadUser();
    return () => {
      cancelled = true;
    };
  }, [userId]);

  useEffect(() => {
    let cancelled = false;

    async function loadTasks() {
      if (!user?.id) return;
      setIsTasksLoading(true);
      setTasksError(null);
      try {
        const response = await fetch(`/api/tasks?assigneeUserId=${encodeURIComponent(user.id)}&limit=20&offset=0`, { cache: "no-store" });
        if (!response.ok) throw new Error(`Tasks API returned ${response.status}`);
        const payload = (await response.json()) as ResourceListResponse<ProjectTaskSummary>;
        if (!cancelled) setTasks(payload.data);
      } catch (err) {
        if (!cancelled) setTasksError(err instanceof Error ? err.message : "Could not load assigned tasks");
      } finally {
        if (!cancelled) setIsTasksLoading(false);
      }
    }

    void loadTasks();
    return () => {
      cancelled = true;
    };
  }, [user?.id]);

  const primaryRole = user?.roleCodes[0] ?? "DELIVERY_LEAD";
  const roleColor = ROLE_COLORS[primaryRole] ?? "#64748b";
  const projects = useMemo(() => uniquePairs(user?.projectIds ?? [], user?.projectNames ?? []), [user?.projectIds, user?.projectNames]);
  const accounts = useMemo(() => uniquePairs(user?.accountIds ?? [], user?.accountNames ?? []), [user?.accountIds, user?.accountNames]);

  useEffect(() => {
    setActiveTab(isProfileTab(requestedTab) ? requestedTab : "Overview");
  }, [requestedTab]);

  function handleTabChange(tab: ProfileTab) {
    setActiveTab(tab);
    const nextUrl = new URL(window.location.href);
    if (tab === "Overview") {
      nextUrl.searchParams.delete("tab");
    } else {
      nextUrl.searchParams.set("tab", tab);
    }
    window.history.replaceState(null, "", `${nextUrl.pathname}${nextUrl.search}${nextUrl.hash}`);
  }

  return (
    <AppShell activeRoute="/users" title="User Profile">
        <main className="flex-1 overflow-auto p-4 sm:p-6">
          <Link href="/users" className="inline-flex items-center gap-1.5 text-xs font-medium text-muted-foreground hover:text-foreground transition-colors">
            <ArrowLeft className="w-3.5 h-3.5" /> Back to Users
          </Link>

          {isLoading && (
            <div className="mt-6 rounded-xl border border-border bg-card p-6 text-sm text-muted-foreground shadow-sm">
              Loading real user profile...
            </div>
          )}

          {!isLoading && error && (
            <div className="mt-6 rounded-xl border border-red-100 bg-red-50 p-6 text-sm text-red-700 shadow-sm">
              {error}
            </div>
          )}

          {!isLoading && !error && !user && (
            <div className="mt-6 rounded-xl border border-border bg-card p-6 shadow-sm">
              <h1 className="text-lg font-bold text-foreground">User not found</h1>
              <p className="mt-1 text-sm text-muted-foreground">This user is not present in the production identity database.</p>
            </div>
          )}

          {!isLoading && !error && user && (
            <div className="mt-5 space-y-5">
              <AdminMemberControls userId={user.id} status={user.status} currentRole={primaryRole} />
              <section className="overflow-hidden rounded-xl border border-border bg-card shadow-sm">
                <div className="min-h-32 px-4 pt-5 pb-16 sm:px-6" style={{ background: `linear-gradient(135deg, ${roleColor}, #0f172a)` }}>
                  <div className="flex min-w-0 items-start justify-between gap-3">
                    <div className="min-w-0 flex-1">
                      <p className="text-xs font-bold uppercase tracking-wide text-white/70">{labelDepartment(user.departmentCode)}</p>
                      <h1 className="mt-1 max-w-4xl break-words text-2xl font-bold text-white sm:text-3xl">{user.displayName || user.email}</h1>
                    </div>
                    <a
                      href={`mailto:${user.email}`}
                      className="inline-flex min-h-11 shrink-0 items-center gap-1.5 rounded-xl border border-white/25 bg-white/10 px-3.5 py-2 text-sm font-semibold text-white transition-colors hover:bg-white/20"
                    >
                      <Mail className="h-4 w-4" /> Email
                    </a>
                  </div>
                </div>

                <div className="px-6 pb-6">
                  <div className="-mt-12 flex flex-col gap-4 sm:flex-row sm:items-end sm:justify-between">
                    <div className="flex min-w-0 items-end gap-4">
                      <div className="relative h-24 w-24 shrink-0 overflow-hidden rounded-2xl border-4 border-card bg-muted shadow-sm">
                        {user.avatarUrl ? (
                          <img src={user.avatarUrl} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
                        ) : (
                          <div className="flex h-full w-full items-center justify-center text-2xl font-bold text-white" style={{ backgroundColor: roleColor }}>
                            {initials(user.displayName || user.email)}
                          </div>
                        )}
                        <span
                          className="absolute bottom-1.5 right-1.5 h-4 w-4 rounded-full border-2 border-card"
                          style={{ backgroundColor: user.status === "active" ? "#16a34a" : "#94a3b8" }}
                        />
                      </div>
                      <div className="min-w-0 pb-1">
                        <p className="truncate text-sm font-semibold text-foreground">{user.email}</p>
                        <div className="mt-2 flex flex-wrap items-center gap-2">
                          <span className="inline-flex items-center gap-1 rounded-lg px-2.5 py-1 text-xs font-semibold" style={{ backgroundColor: `${roleColor}15`, color: roleColor }}>
                            <Shield className="h-3.5 w-3.5" /> {labelRole(primaryRole)}
                          </span>
                          <span className="inline-flex items-center gap-1 rounded-lg bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">
                            <KeyRound className="h-3.5 w-3.5" /> {user.larkOpenId ? "Lark SSO linked" : "Internal identity"}
                          </span>
                          <span className="inline-flex items-center gap-1 rounded-lg bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-700">
                            <CheckCircle2 className="h-3.5 w-3.5" /> {user.status === "active" ? "Active" : "Suspended"}
                          </span>
                        </div>
                      </div>
                    </div>
                  </div>
                </div>
              </section>

              <section className="grid grid-cols-2 gap-4 xl:grid-cols-4">
                {[
                  { label: "Project grants", value: projects.length, icon: Briefcase },
                  { label: "Assigned tasks", value: user.assignedTaskCount ?? tasks.length, icon: CheckCircle2 },
                  { label: "Active sessions", value: user.activeSessionCount, icon: Activity },
                  { label: "Joined", value: formatDate(user.createdAt), icon: Calendar },
                ].map((item) => (
                  <div key={item.label} className="rounded-xl border border-border bg-card p-4 shadow-sm">
                    <div className="mb-3 inline-flex h-8 w-8 items-center justify-center rounded-lg bg-muted text-muted-foreground">
                      <item.icon className="h-4 w-4" />
                    </div>
                    <p className="text-[11px] font-semibold uppercase text-muted-foreground">{item.label}</p>
                    <p className="mt-1 truncate text-lg font-bold text-foreground">{item.value}</p>
                  </div>
                ))}
              </section>

              <div className="overflow-x-auto border-b border-border">
                <nav className="flex min-w-max gap-2">
                  {TABS.map((tab) => (
                    <button
                      key={tab}
                      type="button"
                      aria-pressed={activeTab === tab}
                      aria-controls={`${tab.toLowerCase()}-profile-panel`}
                      onClick={() => handleTabChange(tab)}
                      className={`border-b-2 px-3 py-3 text-sm font-semibold transition-colors ${
                        activeTab === tab
                          ? "border-primary text-foreground"
                          : "border-transparent text-muted-foreground hover:text-foreground"
                      }`}
                    >
                      {tab}
                    </button>
                  ))}
                </nav>
              </div>

              {activeTab === "Overview" && (
                <section id="overview-profile-panel" className="grid gap-5 lg:grid-cols-2">
                  <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
                    <h2 className="text-sm font-bold text-foreground">Identity</h2>
                    <dl className="mt-4 space-y-3 text-sm">
                      <InfoRow label="User ID" value={user.id} mono />
                      <InfoRow label="Email" value={user.email} />
                      <InfoRow label="Department" value={labelDepartment(user.departmentCode)} />
                      <InfoRow label="Lark open ID" value={user.larkOpenId ?? "Not linked"} mono />
                      <InfoRow label="Lark tenant" value={user.larkTenantKey ?? "Not linked"} mono />
                      <InfoRow label="Last seen" value={formatDateTime(user.lastSeenAt)} />
                    </dl>
                  </div>

                  <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
                    <h2 className="text-sm font-bold text-foreground">Access & Capacity</h2>
                    <div className="mt-4 flex flex-wrap gap-2">
                      {user.roleCodes.length ? user.roleCodes.map((role) => (
                        <span key={role} className="rounded-lg bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">
                          {labelRole(role)}
                        </span>
                      )) : (
                        <span className="rounded-lg bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">No roles assigned</span>
                      )}
                    </div>
                    <dl className="mt-4 space-y-3 text-sm">
                      <InfoRow label="Display role" value={user.resourceDisplayRole ?? "Chưa gán"} />
                      <InfoRow label="Weekly capacity" value={user.resourceWeeklyCapacityMinutes ? `${user.resourceWeeklyCapacityMinutes} minutes` : "Chưa gán"} />
                      <InfoRow label="Billable target" value={user.resourceBillableTargetPercent ? `${user.resourceBillableTargetPercent}%` : "Chưa gán"} />
                      <InfoRow label="Time entries" value={`${user.timeEntryCount ?? 0}`} />
                    </dl>
                    {user.resourceSkills.length ? (
                      <div className="mt-4 flex flex-wrap gap-2">
                        {user.resourceSkills.map((skill) => (
                          <span key={skill} className="rounded-lg bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">
                            {skill}
                          </span>
                        ))}
                      </div>
                    ) : null}
                  </div>
                </section>
              )}

              {activeTab === "Activity" && (
                <section id="activity-profile-panel" className="rounded-xl border border-border bg-card p-5 shadow-sm">
                  <h2 className="text-sm font-bold text-foreground">Identity Activity</h2>
                  <div className="mt-4 space-y-4">
                    <TimelineItem icon={Clock3} title="Last active session" description={formatDateTime(user.lastSeenAt)} />
                    <TimelineItem icon={KeyRound} title={user.larkOpenId ? "Lark identity linked" : "Lark identity not linked"} description={user.larkOpenId ?? "User can be linked when SSO profile is available."} />
                    <TimelineItem icon={UserRound} title="Profile created" description={formatDateTime(user.createdAt)} />
                  </div>
                </section>
              )}

              {activeTab === "Projects" && (
                <section id="projects-profile-panel" className="space-y-4">
                  {projects.length ? (
                    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
                      {projects.map((project) => (
                        <Link key={project.id} href={`/projects/${project.id}`} className="rounded-xl border border-border bg-card p-5 shadow-sm transition-colors hover:border-primary/40 hover:bg-muted/30">
                          <p className="text-xs font-bold uppercase text-muted-foreground">Project access</p>
                          <h3 className="mt-2 truncate text-base font-bold text-foreground">{project.name}</h3>
                          <p className="mt-1 truncate font-mono text-xs text-muted-foreground">{project.id}</p>
                        </Link>
                      ))}
                    </div>
                  ) : (
                    <EmptyPanel title="Chưa có project được gán" description="User này đã đồng bộ vào hệ thống nhưng chưa có grant hoặc project membership trong database." />
                  )}

                  {accounts.length ? (
                    <div className="rounded-xl border border-border bg-card p-5 shadow-sm">
                      <h2 className="text-sm font-bold text-foreground">Account grants</h2>
                      <div className="mt-4 flex flex-wrap gap-2">
                        {accounts.map((account) => (
                          <span key={account.id} className="rounded-lg bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">
                            {account.name}
                          </span>
                        ))}
                      </div>
                    </div>
                  ) : null}
                </section>
              )}

              {activeTab === "Tasks" && (
                <section id="tasks-profile-panel" className="space-y-4">
                  {isTasksLoading && (
                    <div className="rounded-xl border border-border bg-card p-5 text-sm text-muted-foreground shadow-sm">Loading assigned tasks...</div>
                  )}
                  {!isTasksLoading && tasksError && (
                    <div className="rounded-xl border border-amber-100 bg-amber-50 p-5 text-sm text-amber-700 shadow-sm">{tasksError}</div>
                  )}
                  {!isTasksLoading && !tasksError && tasks.length ? (
                    <div className="rounded-xl border border-border bg-card shadow-sm">
                      {tasks.map((task) => {
                        const taskHref = task.projectId ? `/projects/${task.projectId}?tab=Tasks` : null;
                        const taskContent = (
                          <>
                            <div className="min-w-0">
                              <p className="truncate text-sm font-bold text-foreground">{task.title}</p>
                              <p className="mt-1 truncate text-xs text-muted-foreground">{task.projectName ?? task.accountName}</p>
                            </div>
                            <div className="flex shrink-0 flex-wrap items-center gap-2">
                              <span className="rounded-lg bg-muted px-2.5 py-1 text-xs font-semibold text-muted-foreground">{STATUS_LABELS[task.status] ?? task.status}</span>
                              <span className="rounded-lg bg-blue-50 px-2.5 py-1 text-xs font-semibold text-blue-700">Due {formatDate(task.dueAt)}</span>
                            </div>
                          </>
                        );

                        return taskHref ? (
                          <Link
                            key={task.id}
                            href={taskHref}
                            className="flex flex-col gap-3 border-b border-border p-5 transition-colors last:border-b-0 hover:bg-muted/30 md:flex-row md:items-center md:justify-between"
                            aria-label={`Open task ${task.title}`}
                          >
                            {taskContent}
                          </Link>
                        ) : (
                          <div key={task.id} className="flex flex-col gap-3 border-b border-border p-5 last:border-b-0 md:flex-row md:items-center md:justify-between">
                            {taskContent}
                          </div>
                        );
                      })}
                    </div>
                  ) : null}
                  {!isTasksLoading && !tasksError && !tasks.length && (
                    <EmptyPanel title="Chưa có task được gán" description="Không có task active nào đang gán cho user này trong bảng ProjectTask." />
                  )}
                </section>
              )}
            </div>
          )}
        </main>

        <footer className="h-11 border-t border-border bg-card flex items-center justify-between px-5 shrink-0">
          <span className="text-[11px] text-muted-foreground">UpLark Partner CRM</span>
          <span className="text-[11px] text-muted-foreground">Legal pages are not published yet.</span>
        </footer>
    </AppShell>
  );
}

function InfoRow({ label, value, mono = false }: { label: string; value: string; mono?: boolean }) {
  return (
    <div className="flex justify-between gap-4">
      <dt className="text-muted-foreground">{label}</dt>
      <dd className={`truncate text-right text-foreground ${mono ? "font-mono text-xs" : "font-semibold"}`}>{value}</dd>
    </div>
  );
}

function TimelineItem({
  icon: Icon,
  title,
  description,
}: {
  icon: React.ComponentType<{ className?: string }>;
  title: string;
  description: string;
}) {
  return (
    <div className="flex gap-3">
      <div className="mt-0.5 flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-muted text-muted-foreground">
        <Icon className="h-4 w-4" />
      </div>
      <div className="min-w-0">
        <p className="text-sm font-bold text-foreground">{title}</p>
        <p className="mt-1 truncate text-sm text-muted-foreground">{description}</p>
      </div>
    </div>
  );
}
