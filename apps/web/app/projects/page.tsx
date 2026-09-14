"use client";
import { postProject, type ProjectCreateAttempt } from "@/lib/project-create-request";
import { MoneyAmount } from "@/components/money-amount";
import { useDialogAccessibility } from "@/hooks/use-dialog-accessibility";


import React, { useState, useMemo, useEffect, useRef } from "react";
import { motion, AnimatePresence } from "framer-motion";
import {
  Search, Plus, LayoutGrid, List, Download,
  ChevronUp, ChevronDown, ChevronsUpDown,
  Briefcase, Calendar, TrendingUp, AlertCircle, ClipboardList,
  CheckCircle2, Clock, ArrowRight, Wallet, BarChart2, Layers, X, Pin, Pencil, Trash2, Check
} from "lucide-react";
import Link from "next/link";
import { AppShell } from "@/components/constructor-x/app-shell";
import { CustomDropdown, CustomDatePicker } from "@/components/constructor-x/custom-controls";
import { ModalLayer } from "@/components/modal-layer";
import { useAuth } from "@/lib/auth";
import {
  getPushedProjectsOwnerKey,
  readPushedProjectIds,
  writePushedProjectIds,
} from "@/lib/frontend-data-store";
import {
  fetchAccountOptions,
  fetchLiveProjects,
  isUnauthorizedLiveProjectsError,
  mapProjectSummaryToUiProject,
  PROJECT_PAGE_SIZE,
  toBackendProjectStatus,
  type LiveProjectAccountOption
} from "./live-projects";
import {
  fetchWorkspaceUserOptions,
  isUnauthorizedWorkspaceUsersError,
  type WorkspaceUserOption
} from "@/lib/workspace-users";
import { downloadCsv } from "@/lib/csv-export";
import { uiProjectDateToIso } from "@/lib/project-date";

// ─── Types ────────────────────────────────────────────────────────────────────

type SortKey = "name" | "status" | "progress" | "budget" | "dueDate" | "priority";
type SortDir = "asc" | "desc";

import { Project, PROJECTS, type Member } from "./data";
import type { ResourceListPaginationMeta } from "@b2b-crm/contracts";

// ─── Config ───────────────────────────────────────────────────────────────────

const STATUS_CFG = {
  "Active":    { color:"#16a34a", bg:"#dcfce7", icon:CheckCircle2 },
  "In Review": { color:"#2563eb", bg:"#eff6ff", icon:BarChart2 },
  "Planning":  { color:"#0891b2", bg:"#e0f2fe", icon:Clock },
  "On Hold":   { color:"#64748b", bg:"#f1f5f9", icon:Clock },
  "Completed": { color:"#16a34a", bg:"#f0fdf4", icon:CheckCircle2 },
  "At Risk":   { color:"#dc2626", bg:"#fee2e2", icon:AlertCircle },
};

const PRIORITY_CFG = {
  Critical: { color:"#dc2626", bg:"#fee2e2" },
  High:     { color:"#d97706", bg:"#fef3c7" },
  Medium:   { color:"#2563eb", bg:"#eff6ff" },
  Low:      { color:"#16a34a", bg:"#f0fdf4" },
};

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  if (!active) return <ChevronsUpDown className="w-3.5 h-3.5 opacity-30" />;
  return dir === "asc" ? <ChevronUp className="w-3.5 h-3.5 text-primary" /> : <ChevronDown className="w-3.5 h-3.5 text-primary" />;
}


function redirectToLogin(returnTo = "/projects") {
  if (typeof window === "undefined") return;
  window.location.assign(`/login?returnTo=${encodeURIComponent(returnTo)}`);
}

function isPublicDemoHost() {
  if (typeof window === "undefined") return false;
  const host = window.location.hostname;
  return host === "uplark.onrender.com" || host.endsWith(".trycloudflare.com") || host === "demo.merkle.com";
}

const EMPTY_PROJECT_PAGINATION: ResourceListPaginationMeta = {
  limit: PROJECT_PAGE_SIZE,
  offset: 0,
  returned: 0,
  total: 0,
  hasNextPage: false,
  hasPreviousPage: false
};

function projectPageRangeLabel(meta: ResourceListPaginationMeta) {
  if (meta.total === 0 || meta.returned === 0) return "0 / 0 projects";
  const start = meta.offset + 1;
  const end = meta.offset + meta.returned;
  return `${start}-${end} / ${meta.total} projects`;
}

function getProjectCode(project: Project) {
  return project.tags[0] ?? "";
}

function addDays(date: Date, days: number) {
  const next = new Date(date.getFullYear(), date.getMonth(), date.getDate());
  next.setDate(next.getDate() + days);
  return next;
}

function formatUiDateFromDate(date: Date) {
  return date.toLocaleDateString("en-US", { month: "short", day: "numeric", year: "numeric" });
}

function defaultProjectStartDate() {
  return formatUiDateFromDate(new Date());
}

function defaultProjectDueDate() {
  return formatUiDateFromDate(addDays(new Date(), 90));
}

function ProjectPaginationControls({
  pagination,
  onPageChange
}: {
  pagination: ResourceListPaginationMeta;
  onPageChange: (page: number) => void;
}) {
  const totalPages = Math.max(1, Math.ceil(pagination.total / pagination.limit));
  const currentPage = Math.floor(pagination.offset / pagination.limit) + 1;

  return (
    <div className="flex w-full min-w-0 items-center justify-end gap-2 sm:w-auto sm:min-w-[15rem]" aria-label="Projects pagination">
      <button
        type="button"
        disabled={pagination.total <= 0 || !pagination.hasPreviousPage}
        onClick={() => onPageChange(Math.max(1, currentPage - 1))}
        className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-card hover:text-foreground disabled:cursor-not-allowed disabled:opacity-45"
      >
        Previous
      </button>
      <span className="min-w-16 text-center text-xs font-semibold text-muted-foreground">
        {currentPage}/{totalPages}
      </span>
      <button
        type="button"
        disabled={pagination.total <= 0 || !pagination.hasNextPage}
        onClick={() => onPageChange(Math.min(totalPages, currentPage + 1))}
        className="rounded-lg border border-border px-3 py-1.5 text-xs font-semibold text-muted-foreground transition-colors hover:bg-card hover:text-foreground disabled:cursor-not-allowed disabled:opacity-45"
      >
        Next
      </button>
    </div>
  );
}

function ProjectMemberAvatar({ member, size = "sm" }: { member: Member; size?: "sm" | "md" }) {
  const sizeClass = size === "md" ? "w-8 h-8 text-[10px]" : "w-6 h-6 text-[9px]";
  const label = member.name || member.email || member.initials;

  return (
    <div
      className={`${sizeClass} overflow-hidden rounded-full border-2 border-card flex items-center justify-center font-bold text-white shadow-sm`}
      style={{ backgroundColor: member.color }}
      title={label}
      aria-label={label}
    >
      {member.avatarUrl ? (
        <img src={member.avatarUrl} alt="" className="h-full w-full object-cover" referrerPolicy="no-referrer" />
      ) : (
        member.initials.slice(0, 2)
      )}
    </div>
  );
}

function ProjectMemberAvatarStack({ members, limit = 4 }: { members: Member[]; limit?: number }) {
  const visibleMembers = members.slice(0, limit);

  return (
    <div className="flex -space-x-1.5" aria-label={`${members.length} project members`}>
      {visibleMembers.map((member, index) => (
        <ProjectMemberAvatar key={member.id ?? member.email ?? `${member.initials}-${index}`} member={member} />
      ))}
      {members.length > limit && (
        <div className="w-6 h-6 rounded-full border-2 border-card bg-muted flex items-center justify-center text-[9px] font-bold text-muted-foreground shadow-sm">
          +{members.length - limit}
        </div>
      )}
    </div>
  );
}

// ─── Card Component ────────────────────────────────────────────────────────────

function ProjectCard({
  project,
  isPushed,
  onTogglePush,
  onEdit,
  onDelete
}: {
  project: Project;
  isPushed: boolean;
  onTogglePush: () => void;
  onEdit: () => void;
  onDelete: () => void;
}) {
  const sc = STATUS_CFG[project.status];
  const pc = PRIORITY_CFG[project.priority];
  const budgetPct = project.budget > 0 ? Math.round((project.spent / project.budget) * 100) : 0;

  return (
    <Link href={`/projects/${project.id}`} className="block h-full group">
      <motion.div layout initial={{ opacity:0, scale:0.96 }} animate={{ opacity:1, scale:1 }} whileHover={{ y:-3 }}
        className="bg-card border border-border rounded-xl p-5 shadow-sm hover:shadow-md transition-all cursor-pointer flex h-full flex-col gap-4">
        {/* Top */}
        <div className="flex items-start justify-between">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-xl flex items-center justify-center shadow-sm shrink-0" style={{ backgroundColor:`${project.color}20` }}>
              <Layers className="w-5 h-5" style={{ color:project.color }} />
            </div>
            <div className="min-w-0">
              <p className="text-sm font-bold text-foreground group-hover:text-primary transition-colors truncate">{project.name}</p>
              <p className="text-[10px] text-muted-foreground">{project.category} · {project.client}</p>
            </div>
          </div>
          <span className="text-[9px] font-bold px-2 py-0.5 rounded-lg shrink-0" style={{ backgroundColor:pc.bg, color:pc.color }}>
            {project.priority}
          </span>
        </div>

        {/* Description */}
        <p className="text-[11px] text-muted-foreground leading-relaxed line-clamp-2">{project.description}</p>

        {/* Progress */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <span className="text-[10px] text-muted-foreground">Progress</span>
            <span className="text-[10px] font-bold font-mono" style={{ color:project.color }}>{project.progress}%</span>
          </div>
          <div className="h-1.5 bg-muted rounded-full overflow-hidden">
            <motion.div initial={{ width:0 }} animate={{ width:`${project.progress}%` }} transition={{ duration:0.7, ease:"easeOut" }}
              className="h-full rounded-full" style={{ backgroundColor:project.color }} />
          </div>
        </div>

        {/* Stats */}
        <div className="grid grid-cols-3 gap-2">
          <div className="text-center">
            <p className="text-sm font-bold font-mono text-foreground">{project.tasks.done}/{project.tasks.total}</p>
            <p className="text-[9px] text-muted-foreground uppercase tracking-wide">Tasks</p>
          </div>
          <div className="text-center border-x border-border">
            <p className="text-sm font-bold font-mono text-foreground"><MoneyAmount value={project.budget} /></p>
            <p className="text-[9px] text-muted-foreground uppercase tracking-wide">Budget</p>
          </div>
          <div className="text-center">
            <p className="text-sm font-bold font-mono" style={{ color: budgetPct > 90 ? "#dc2626" : "var(--color-foreground)" }}>{budgetPct}%</p>
            <p className="text-[9px] text-muted-foreground uppercase tracking-wide">Spent</p>
          </div>
        </div>

        {/* Footer */}
        <div className="flex items-center justify-between">
          <ProjectMemberAvatarStack members={project.members} />
          <div className="flex items-center gap-2">
            <span className="flex items-center gap-1 text-[10px] font-semibold px-2 py-0.5 rounded-md" style={{ backgroundColor:sc.bg, color:sc.color }}>
              <sc.icon className="w-3 h-3" />{project.status}
            </span>
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onEdit();
              }}
              title="Edit project"
              className="p-1.5 rounded-lg bg-muted text-muted-foreground hover:text-primary hover:bg-primary/10 transition-colors"
            >
              <Pencil className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onDelete();
              }}
              title="Delete project"
              className="p-1.5 rounded-lg bg-muted text-muted-foreground hover:text-red-600 hover:bg-red-50 transition-colors"
            >
              <Trash2 className="w-3.5 h-3.5" />
            </button>
            <button
              onClick={(e) => {
                e.preventDefault();
                e.stopPropagation();
                onTogglePush();
              }}
              title={isPushed ? "Unpush from Sidebar Menu" : "Push to Sidebar Menu"}
              className={`p-1.5 rounded-lg transition-colors ${
                isPushed
                  ? "bg-primary/10 text-primary hover:bg-primary/20"
                  : "bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80"
              }`}
            >
              <Pin className="w-3.5 h-3.5" style={{ transform: isPushed ? "none" : "rotate(45deg)" }} />
            </button>
            <div className="p-1.5 rounded-lg bg-muted group-hover:bg-primary/10 text-muted-foreground group-hover:text-primary transition-all">
              <ArrowRight className="w-3.5 h-3.5" />
            </div>
          </div>
        </div>
      </motion.div>
    </Link>
  );
}

// ─── Page ─────────────────────────────────────────────────────────────────────

const STATUS_OPTIONS = [
  { value: "Active", label: "Active", color: "#16a34a" },
  { value: "In Review", label: "In Review", color: "#2563eb" },
  { value: "Planning", label: "Planning", color: "#0891b2" },
  { value: "On Hold", label: "On Hold", color: "#64748b" },
  { value: "At Risk", label: "At Risk", color: "#dc2626" },
  { value: "Completed", label: "Completed", color: "#16a34a" },
];

const PRIORITY_OPTIONS = [
  { value: "Critical", label: "Critical", color: "#dc2626" },
  { value: "High", label: "High", color: "#d97706" },
  { value: "Medium", label: "Medium", color: "#2563eb" },
  { value: "Low", label: "Low", color: "#16a34a" },
];

const CATEGORY_OPTIONS = [
  { value: "Delivery", label: "Delivery" },
  { value: "Implementation", label: "Implementation" },
  { value: "Proposal", label: "Proposal" },
  { value: "Qualified", label: "Qualified" },
  { value: "Won", label: "Won" }
];

const PROJECT_CATEGORY_FILTER_OPTIONS = [
  { value: "Delivery", label: "Delivery" },
  { value: "Implementation", label: "Implementation" },
  { value: "Proposal", label: "Proposal" },
  { value: "Qualified", label: "Qualified" },
  { value: "Won", label: "Won" }
];

function UserAvatar({ user, size = "md" }: { user: WorkspaceUserOption; size?: "sm" | "md" }) {
  const [failed, setFailed] = useState(false);
  const className = size === "sm" ? "h-6 w-6 text-[10px]" : "h-8 w-8 text-xs";

  return (
    <span
      className={`${className} flex shrink-0 items-center justify-center overflow-hidden rounded-full font-bold text-white`}
      style={{ backgroundColor: user.color }}
    >
      {user.avatarUrl && !failed ? (
        <img
          src={user.avatarUrl}
          alt=""
          className="h-full w-full object-cover"
          referrerPolicy="no-referrer"
          onError={() => setFailed(true)}
        />
      ) : (
        user.initials
      )}
    </span>
  );
}

function ProjectUserDropdown({
  users,
  value,
  onChange,
  placeholder = "Select PIC"
}: {
  users: WorkspaceUserOption[];
  value: string;
  onChange: (value: string) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const selected = users.find((user) => user.id === value);

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        disabled={users.length === 0}
        onClick={() => setOpen((current) => !current)}
        className="flex min-h-11 w-full items-center justify-between gap-3 rounded-xl border border-input bg-background px-3 py-2 text-left text-sm text-foreground transition-all focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-50"
        style={{ borderColor: open ? "var(--color-primary)" : "var(--color-input)" }}
      >
        {selected ? (
          <span className="flex min-w-0 items-center gap-2">
            <UserAvatar user={selected} size="sm" />
            <span className="min-w-0">
              <span className="block truncate text-xs font-semibold">{selected.name}</span>
              <span className="block truncate text-[10px] text-muted-foreground">{selected.email}</span>
            </span>
          </span>
        ) : (
          <span className="truncate text-muted-foreground/60">{users.length === 0 ? "No synced users" : placeholder}</span>
        )}
        <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="absolute left-0 right-0 z-[70] mt-1.5 overflow-hidden rounded-xl border border-border bg-card shadow-xl"
          >
            <div className="max-h-64 overflow-y-auto py-1">
              <button
                type="button"
                onClick={() => {
                  onChange("none");
                  setOpen(false);
                }}
                className={`flex w-full items-center gap-2.5 px-3 py-2.5 text-left text-xs font-semibold transition-colors hover:bg-muted ${
                  value === "none" ? "bg-primary/5 text-primary" : "text-muted-foreground"
                }`}
              >
                Unassigned
              </button>
              {users.map((user) => (
                <button
                  key={user.id}
                  type="button"
                  onClick={() => {
                    onChange(user.id);
                    setOpen(false);
                  }}
                  className={`flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-muted ${
                    value === user.id ? "bg-primary/5" : ""
                  }`}
                >
                  <UserAvatar user={user} size="sm" />
                  <span className="min-w-0 flex-1">
                    <span className="block truncate text-xs font-semibold text-foreground">{user.name}</span>
                    <span className="block truncate text-[10px] text-muted-foreground">{user.role} · {user.email}</span>
                  </span>
                  {value === user.id && <Check className="h-3.5 w-3.5 shrink-0 text-primary" />}
                </button>
              ))}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

function ProjectMemberMultiSelect({
  users,
  selectedIds,
  onChange,
  placeholder = "Select project members"
}: {
  users: WorkspaceUserOption[];
  selectedIds: string[];
  onChange: (ids: string[]) => void;
  placeholder?: string;
}) {
  const [open, setOpen] = useState(false);
  const containerRef = useRef<HTMLDivElement>(null);
  const selectedUsers = selectedIds
    .map((id) => users.find((user) => user.id === id))
    .filter((user): user is WorkspaceUserOption => Boolean(user));

  useEffect(() => {
    const handler = (event: MouseEvent) => {
      if (containerRef.current && !containerRef.current.contains(event.target as Node)) {
        setOpen(false);
      }
    };
    document.addEventListener("mousedown", handler);
    return () => document.removeEventListener("mousedown", handler);
  }, []);

  const toggleUser = (userId: string) => {
    onChange(
      selectedIds.includes(userId)
        ? selectedIds.filter((id) => id !== userId)
        : [...selectedIds, userId]
    );
  };

  return (
    <div ref={containerRef} className="relative">
      <button
        type="button"
        disabled={users.length === 0}
        onClick={() => setOpen((current) => !current)}
        className="flex min-h-11 w-full items-center justify-between gap-3 rounded-xl border border-input bg-background px-3 py-2 text-left text-sm text-foreground transition-all focus:outline-none focus:ring-2 focus:ring-primary/20 disabled:cursor-not-allowed disabled:opacity-50"
        style={{ borderColor: open ? "var(--color-primary)" : "var(--color-input)" }}
      >
        <span className="flex min-w-0 flex-1 items-center gap-2">
          {selectedUsers.length > 0 ? (
            <>
              <span className="flex shrink-0 -space-x-1.5">
                {selectedUsers.slice(0, 4).map((user) => (
                  <UserAvatar key={user.id} user={user} size="sm" />
                ))}
              </span>
              <span className="min-w-0 truncate text-xs font-semibold">
                {selectedUsers.length === 1 ? selectedUsers[0].name : `${selectedUsers.length} users selected`}
              </span>
            </>
          ) : (
            <span className="truncate text-muted-foreground/60">{users.length === 0 ? "No synced users" : placeholder}</span>
          )}
        </span>
        <ChevronDown className={`h-4 w-4 shrink-0 text-muted-foreground transition-transform ${open ? "rotate-180" : ""}`} />
      </button>

      <AnimatePresence>
        {open && (
          <motion.div
            initial={{ opacity: 0, y: 8, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 8, scale: 0.98 }}
            transition={{ duration: 0.15 }}
            className="absolute left-0 right-0 z-[70] mt-1.5 overflow-hidden rounded-xl border border-border bg-card shadow-xl"
          >
            <div className="flex items-center justify-between border-b border-border px-3 py-2">
              <span className="text-[11px] font-semibold uppercase text-muted-foreground">{selectedUsers.length} selected</span>
              {selectedUsers.length > 0 && (
                <button
                  type="button"
                  onClick={() => onChange([])}
                  className="rounded-md px-2 py-1 text-[11px] font-semibold text-muted-foreground transition-colors hover:bg-muted hover:text-foreground"
                >
                  Clear
                </button>
              )}
            </div>
            <div className="max-h-64 overflow-y-auto py-1">
              {users.map((user) => {
                const selected = selectedIds.includes(user.id);
                return (
                  <button
                    key={user.id}
                    type="button"
                    onClick={() => toggleUser(user.id)}
                    className={`flex w-full items-center gap-2.5 px-3 py-2.5 text-left transition-colors hover:bg-muted ${
                      selected ? "bg-primary/5" : ""
                    }`}
                  >
                    <UserAvatar user={user} size="sm" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-xs font-semibold text-foreground">{user.name}</span>
                      <span className="block truncate text-[10px] text-muted-foreground">
                        {user.department || user.role} · {user.email}
                      </span>
                    </span>
                    <span className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-md border ${
                      selected ? "border-primary bg-primary text-primary-foreground" : "border-border text-transparent"
                    }`}>
                      <Check className="h-3.5 w-3.5" />
                    </span>
                  </button>
                );
              })}
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

interface ProjectEditValues {
  name: string;
  code: string;
  client: string;
  status: Project["status"];
  projectType: string;
  scopeSummary: string;
  ownerUserId: string;
  memberUserIds: string[];
  budgetAmount: string;
  plannedStartAt: string;
  plannedEndAt: string;
}

type ProjectClientOption = { value: string; label: string; accountId?: string };

function ProjectEditModal({
  project,
  clientOptions,
  workspaceUsers,
  loadingWorkspaceUsers,
  workspaceUsersError,
  isSaving,
  error,
  onClose,
  onSave
}: {
  project: Project;
  clientOptions: ProjectClientOption[];
  workspaceUsers: WorkspaceUserOption[];
  loadingWorkspaceUsers: boolean;
  workspaceUsersError: string | null;
  isSaving: boolean;
  error: string | null;
  onClose: () => void;
  onSave: (values: ProjectEditValues) => void;
}) {
  const editDialogRef = useDialogAccessibility(true, () => { if (!isSaving) onClose(); });
  const [name, setName] = useState(project.name);
  const [code, setCode] = useState(getProjectCode(project));
  const [client, setClient] = useState(project.client);
  const [status, setStatus] = useState<Project["status"]>(project.status);
  const [projectType, setProjectType] = useState(project.category || "Delivery");
  const [scopeSummary, setScopeSummary] = useState(project.scopeSummary ?? "");
  const initialMemberIds = project.memberUserIds ?? project.members.map((member) => member.id).filter((id): id is string => Boolean(id));
  const [ownerUserId, setOwnerUserId] = useState(project.ownerUserId ?? initialMemberIds[0] ?? "none");
  const [memberUserIds, setMemberUserIds] = useState<string[]>(initialMemberIds);
  const [budgetAmount, setBudgetAmount] = useState(project.budget > 0 ? String(project.budget) : "");
  const [plannedStartAt, setPlannedStartAt] = useState(project.startDate);
  const [plannedEndAt, setPlannedEndAt] = useState(project.dueDate);

  const handleSubmit = (event: React.FormEvent) => {
    event.preventDefault();
    if (!name.trim() || isSaving) return;
    onSave({
      name: name.trim(),
      code: code.trim(),
      client,
      status,
      projectType,
      scopeSummary: scopeSummary.trim(),
      ownerUserId,
      memberUserIds,
      budgetAmount,
      plannedStartAt,
      plannedEndAt
    });
  };

  return (
    <ModalLayer onClose={onClose}>
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <motion.div
        ref={editDialogRef} role="dialog" aria-modal="true" aria-label="Edit Project" tabIndex={-1}
        initial={{ opacity: 0, scale: 0.95, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 16 }}
        className="bg-card border border-border rounded-2xl w-full max-w-2xl max-h-[90dvh] overflow-visible shadow-2xl flex flex-col"
      >
        <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-muted/20">
          <div>
            <h3 className="text-base font-bold text-foreground">Edit Project</h3>
            <p className="text-xs text-muted-foreground mt-0.5">Update persisted CRM fields for this workspace project.</p>
          </div>
          <button
            aria-label="Close edit project dialog"
            type="button"
            onClick={onClose}
            className="min-h-11 min-w-11 p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
          >
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
              {error}
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div className="space-y-1.5 md:col-span-2">
              <label className="text-xs font-semibold text-muted-foreground">
                Project Name <span className="text-destructive">*</span>
              </label>
              <input
                type="text"
                aria-label="Project Name"
                required
                value={name}
                onChange={(event) => setName(event.target.value)}
                className="w-full px-3.5 py-2.5 bg-background border border-input rounded-xl text-sm text-foreground focus:outline-none focus:border-primary transition-colors"
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="edit-project-code" className="text-xs font-semibold text-muted-foreground">Project Code</label>
              <input id="edit-project-code"
                type="text"
                aria-label="Project Code"
                value={code}
                onChange={(event) => setCode(event.target.value)}
                className="w-full px-3.5 py-2.5 bg-background border border-input rounded-xl text-sm text-foreground focus:outline-none focus:border-primary transition-colors"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">Status</label>
              <CustomDropdown
                ariaLabel="Status"
                options={STATUS_OPTIONS}
                value={status}
                onChange={(value) => setStatus(value as Project["status"])}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">Project Type</label>
              <CustomDropdown
                ariaLabel="Project Type"
                options={CATEGORY_OPTIONS}
                value={projectType}
                onChange={setProjectType}
              />
            </div>

            <div className="space-y-1.5 md:col-span-2">
              <label className="text-xs font-semibold text-muted-foreground">Client Account</label>
              <CustomDropdown
                ariaLabel="Client Account"
                options={clientOptions}
                value={client}
                onChange={setClient}
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">PIC</label>
              <ProjectUserDropdown
                users={workspaceUsers}
                value={ownerUserId}
                onChange={(value) => {
                  setOwnerUserId(value);
                  if (value !== "none" && !memberUserIds.includes(value)) {
                    setMemberUserIds((current) => [...current, value]);
                  }
                }}
              />
            </div>

            <div className="space-y-1.5">
              <label htmlFor="edit-project-budget" className="text-xs font-semibold text-muted-foreground">Budget (đ)</label>
              <input id="edit-project-budget"
                type="number"
                min="0"
                step="1"
                aria-label="Budget"
                value={budgetAmount}
                onChange={(event) => setBudgetAmount(event.target.value)}
                className="w-full px-3.5 py-2.5 bg-background border border-input rounded-xl text-sm text-foreground focus:outline-none focus:border-primary transition-colors"
              />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">Planned Start</label>
              <CustomDatePicker ariaLabel="Planned Start Date" value={plannedStartAt} onChange={setPlannedStartAt} />
            </div>

            <div className="space-y-1.5">
              <label className="text-xs font-semibold text-muted-foreground">Planned End</label>
              <CustomDatePicker ariaLabel="Planned End Date" value={plannedEndAt} onChange={setPlannedEndAt} />
            </div>
          </div>

          <div className="space-y-1.5">
            <label htmlFor="edit-project-scope" className="text-xs font-semibold text-muted-foreground">Project Scope</label>
            <textarea id="edit-project-scope"
              rows={3}
              value={scopeSummary}
              onChange={(event) => setScopeSummary(event.target.value)}
              placeholder="Describe scope, objectives, deliverables, and key boundaries..."
              className="w-full px-3.5 py-2.5 bg-background border border-input rounded-xl text-sm text-foreground focus:outline-none focus:border-primary transition-colors resize-none"
            />
          </div>

          <div className="space-y-1.5">
            <label className="text-xs font-semibold text-muted-foreground flex items-center justify-between">
              <span>Project Members ({memberUserIds.length} selected)</span>
              <span className="text-[10px] text-muted-foreground">
                {loadingWorkspaceUsers ? "Loading synced users..." : "Synced workspace users"}
              </span>
            </label>
            <ProjectMemberMultiSelect
              users={workspaceUsers}
              selectedIds={memberUserIds}
              onChange={setMemberUserIds}
            />
            {!loadingWorkspaceUsers && workspaceUsers.length === 0 && (
              <div className="rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium text-muted-foreground">
                {workspaceUsersError ?? "No synced active users are available for assignment."}
              </div>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 pt-4 border-t border-border">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 rounded-xl border border-border text-sm font-semibold text-muted-foreground hover:bg-muted transition-colors"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={isSaving || !name.trim()}
              className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white shadow-md hover:shadow-lg transition-all disabled:opacity-60 disabled:cursor-not-allowed"
              style={{ backgroundColor: "var(--color-primary)" }}
            >
              {isSaving ? "Saving..." : "Save Changes"}
            </button>
          </div>
        </form>
      </motion.div>
    </div>
    </ModalLayer>
  );
}

function ProjectDeleteConfirmModal({
  project,
  isDeleting,
  error,
  onCancel,
  onConfirm
}: {
  project: Project;
  isDeleting: boolean;
  error: string | null;
  onCancel: () => void;
  onConfirm: () => void;
}) {
  const deleteDialogRef = useDialogAccessibility(true, () => { if (!isDeleting) onCancel(); });
  return (
    <ModalLayer closeOnEscape={!isDeleting} onClose={onCancel}>
    <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
      <motion.div
        ref={deleteDialogRef} role="alertdialog" aria-modal="true" aria-label="Delete Project" tabIndex={-1}
        initial={{ opacity: 0, scale: 0.95, y: 16 }}
        animate={{ opacity: 1, scale: 1, y: 0 }}
        exit={{ opacity: 0, scale: 0.95, y: 16 }}
        className="bg-card border border-border rounded-2xl w-full max-w-md shadow-2xl overflow-hidden"
      >
        <div className="px-6 py-5 border-b border-border bg-red-50">
          <div className="flex items-start gap-3">
            <div className="w-9 h-9 rounded-xl bg-red-100 text-red-600 flex items-center justify-center shrink-0">
              <Trash2 className="w-4 h-4" />
            </div>
            <div>
              <h3 className="text-base font-bold text-foreground">Delete Project</h3>
              <p className="text-xs text-muted-foreground mt-1">
                This removes the project only if production rules allow it.
              </p>
            </div>
          </div>
        </div>
        <div className="p-6 space-y-4">
          <p className="text-sm text-muted-foreground">
            Delete <span className="font-semibold text-foreground">{project.name}</span>? Projects with tasks are protected and the API will block deletion.
          </p>
          {error && (
            <div className="rounded-xl border border-red-200 bg-red-50 px-3 py-2 text-xs font-semibold text-red-700">
              {error}
            </div>
          )}
          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onCancel}
              className="px-4 py-2 rounded-xl border border-border text-sm font-semibold text-muted-foreground hover:bg-muted transition-colors"
            >
              Cancel
            </button>
            <button
              type="button"
              disabled={isDeleting}
              onClick={onConfirm}
              className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white bg-red-600 shadow-md hover:bg-red-700 transition-all disabled:opacity-60 disabled:cursor-not-allowed"
            >
              {isDeleting ? "Deleting..." : "Delete Project"}
            </button>
          </div>
        </div>
      </motion.div>
    </div>
    </ModalLayer>
  );
}

const COLOR_OPTIONS = [
  "#2563eb", // blue
  "#7c3aed", // purple
  "#059669", // emerald
  "#db2777", // pink
  "#d97706", // amber
  "#dc2626", // red
  "#64748b", // slate
];

function parseProjectTimelineDate(value: string) {
  if (!value || value === "TBD") return null;
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function getYearTimelineBounds(today: Date) {
  const start = new Date(today.getFullYear(), 0, 1);
  const end = new Date(today.getFullYear() + 1, 0, 1);
  return { start, end };
}

function timelinePercent(date: Date, start: Date, end: Date) {
  const totalMs = end.getTime() - start.getTime();
  if (totalMs <= 0) return 0;
  return Math.min(100, Math.max(0, ((date.getTime() - start.getTime()) / totalMs) * 100));
}

export default function ProjectsPage() {
  const { user } = useAuth();
  const pushedProjectOwnerKey = getPushedProjectsOwnerKey(user);
  const [projectsList, setProjectsList] = useState<Project[]>([]);
  const [accountOptions, setAccountOptions] = useState<LiveProjectAccountOption[]>([]);
  const [projectPage, setProjectPage] = useState(1);
  const [projectPagination, setProjectPagination] = useState<ResourceListPaginationMeta>(EMPTY_PROJECT_PAGINATION);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [projectsError, setProjectsError] = useState<string | null>(null);
  const [savingProject, setSavingProject] = useState(false);
  const createSubmittingRef = useRef(false);
  const createAttempt = useRef<ProjectCreateAttempt>({});
  const [accountLoadRevision, setAccountLoadRevision] = useState(0);
  const [loadingAccounts, setLoadingAccounts] = useState(true);
  const [workspaceUsers, setWorkspaceUsers] = useState<WorkspaceUserOption[]>([]);
  const [loadingWorkspaceUsers, setLoadingWorkspaceUsers] = useState(true);
  const [workspaceUsersError, setWorkspaceUsersError] = useState<string | null>(null);
  const [pushedIds, setPushedIds] = useState<string[]>([]);
  const [view, setView]         = useState<"grid" | "list" | "sheet" | "timeline">("grid");
  const [query, setQuery]       = useState("");
  const [statusFilter, setStatusFilter]   = useState("all");
  const [categoryFilter, setCategoryFilter] = useState("all");
  const [sortKey, setSortKey]   = useState<SortKey>("name");
  const [sortDir, setSortDir]   = useState<SortDir>("asc");
  const resultsScrollRef = useRef<HTMLDivElement>(null);

  const resetProjectsFrameScroll = () => {
    if (typeof window === "undefined") return;
    window.requestAnimationFrame(() => {
      resultsScrollRef.current?.scrollTo({ top: 0, left: 0, behavior: "auto" });
    });
  };

  // Load real projects from the CRM API. Static seeds are dev-only fallback so
  // production never masks a failed Lark/Base migration with mock records.
  useEffect(() => {
    const controller = new AbortController();

    async function loadProjects() {
      try {
        setLoadingProjects(true);
        setProjectsError(null);
        const live = await fetchLiveProjects({
          limit: PROJECT_PAGE_SIZE,
          offset: (projectPage - 1) * PROJECT_PAGE_SIZE,
          q: query,
          status: statusFilter as Project["status"] | "all",
          category: categoryFilter,
          signal: controller.signal
        });
        setProjectsList(live.projects);
        setProjectPagination(live.pagination);
      } catch (error) {
        if (controller.signal.aborted) return;
        if (isUnauthorizedLiveProjectsError(error) && process.env.NODE_ENV === "production") {
          redirectToLogin("/projects");
          return;
        }
        const publicDemo = isPublicDemoHost();
        const fallbackProjects = publicDemo || process.env.NODE_ENV !== "production" ? PROJECTS : [];
        setProjectsError(publicDemo ? null : (error instanceof Error ? error.message : "Could not load live projects"));
        setProjectsList(fallbackProjects);
        setProjectPagination({
          ...EMPTY_PROJECT_PAGINATION,
          returned: fallbackProjects.length,
          total: fallbackProjects.length,
          hasNextPage: false,
        });
      } finally {
        if (!controller.signal.aborted) {
          setLoadingProjects(false);
        }
      }
    }

    loadProjects();
    if (typeof window !== "undefined") {
      setPushedIds(readPushedProjectIds(pushedProjectOwnerKey));
    }

    return () => controller.abort();
  }, [projectPage, query, statusFilter, categoryFilter, pushedProjectOwnerKey]);

  useEffect(() => {
    const controller = new AbortController();

    async function loadAccountOptions() {
      setLoadingAccounts(true);
      try {
        const accounts = await fetchAccountOptions(controller.signal);
        if (controller.signal.aborted) return;
        setAccountOptions(accounts);
        setProjectsError(null);
      } catch (error) {
        if (controller.signal.aborted) return;
        if (isUnauthorizedLiveProjectsError(error) && process.env.NODE_ENV === "production") {
          redirectToLogin("/projects");
          return;
        }
        setAccountOptions([]);
        if (!isPublicDemoHost()) setProjectsError(error instanceof Error ? error.message : "Could not load CRM accounts");
      } finally { if (!controller.signal.aborted) setLoadingAccounts(false); }
    }

    loadAccountOptions();
    return () => controller.abort();
  }, [accountLoadRevision]);

  useEffect(() => {
    const controller = new AbortController();

    async function loadWorkspaceUsers() {
      try {
        setLoadingWorkspaceUsers(true);
        setWorkspaceUsersError(null);
        setWorkspaceUsers(await fetchWorkspaceUserOptions(controller.signal));
      } catch (error) {
        if (controller.signal.aborted) return;
        if (isUnauthorizedWorkspaceUsersError(error) && process.env.NODE_ENV === "production") {
          redirectToLogin("/projects");
          return;
        }
        setWorkspaceUsers([]);
        setWorkspaceUsersError(error instanceof Error ? error.message : "Could not load synced workspace users");
      } finally {
        if (!controller.signal.aborted) {
          setLoadingWorkspaceUsers(false);
        }
      }
    }

    loadWorkspaceUsers();
    return () => controller.abort();
  }, []);

  const handleTogglePush = (id: string) => {
    const next = pushedIds.includes(id)
      ? pushedIds.filter(x => x !== id)
      : [...pushedIds, id];
    setPushedIds(next);
    writePushedProjectIds(next, pushedProjectOwnerKey);
  };

  // Modal State
  const [isCreateOpen, setIsCreateOpen] = useState(false);
  const createDialogRef = useDialogAccessibility(isCreateOpen, () => setIsCreateOpen(false));
  const [editingProject, setEditingProject] = useState<Project | null>(null);
  const [deletingProject, setDeletingProject] = useState<Project | null>(null);
  const [savingProjectEdit, setSavingProjectEdit] = useState(false);
  const [deletingProjectId, setDeletingProjectId] = useState<string | null>(null);
  const [projectMutationError, setProjectMutationError] = useState<string | null>(null);
  const [name, setName] = useState("");
  const [description, setDescription] = useState("");
  const [client, setClient] = useState("");
  const [status, setStatus] = useState<Project["status"]>("Active");
  const [priority, setPriority] = useState<Project["priority"]>("Medium");
  const [budget, setBudget] = useState("");
  const [startDate, setStartDate] = useState(defaultProjectStartDate);
  const [dueDate, setDueDate] = useState(defaultProjectDueDate);
  const [color, setColor] = useState("#2563eb");
  const [tags, setTags] = useState("");
  const [selectedMembers, setSelectedMembers] = useState<string[]>([]);

  const handleSort = (k: SortKey) => {
    if (sortKey === k) setSortDir(d => d === "asc" ? "desc" : "asc");
    else { setSortKey(k); setSortDir("asc"); }
  };

  const handleQueryChange = (value: string) => {
    setQuery(value);
    setProjectPage(1);
    resetProjectsFrameScroll();
  };

  const handleStatusFilterChange = (value: string) => {
    setStatusFilter(value);
    setProjectPage(1);
    resetProjectsFrameScroll();
  };

  const handleCategoryFilterChange = (value: string) => {
    setCategoryFilter(value);
    setProjectPage(1);
    resetProjectsFrameScroll();
  };

  const handleProjectPageChange = (page: number) => {
    setProjectPage(page);
    resetProjectsFrameScroll();
  };

  const filterStatusOptions = useMemo(() => [
    { value: "all", label: "All Status" },
    ...STATUS_OPTIONS
  ], []);

  const filterCategoryOptions = useMemo(() => [
    { value: "all", label: "All Categories" },
    ...PROJECT_CATEGORY_FILTER_OPTIONS
  ], []);

  const filtered = useMemo(() => {
    let list = projectsList.filter((project) => {
      const haystack = `${project.name} ${project.client} ${project.description} ${project.id}`.toLocaleLowerCase("vi");
      const matchesQuery = !query.trim() || haystack.includes(query.trim().toLocaleLowerCase("vi"));
      const matchesStatus = statusFilter === "all" || project.status === statusFilter;
      const matchesCategory = categoryFilter === "all" || project.category === categoryFilter;
      return matchesQuery && matchesStatus && matchesCategory;
    });
    list = [...list].sort((a, b) => {
      const map: Record<SortKey, number | string> = { name:a.name, status:a.status, progress:a.progress, budget:a.budget, dueDate:a.dueDate, priority: ["Critical","High","Medium","Low"].indexOf(a.priority) };
      const mapB: Record<SortKey, number | string> = { name:b.name, status:b.status, progress:b.progress, budget:b.budget, dueDate:b.dueDate, priority: ["Critical","High","Medium","Low"].indexOf(b.priority) };
      const va = map[sortKey], vb = mapB[sortKey];
      if (typeof va === "number" && typeof vb === "number") return sortDir === "asc" ? va - vb : vb - va;
      return sortDir === "asc" ? String(va).localeCompare(String(vb)) : String(vb).localeCompare(String(va));
    });
    return list;
  }, [projectsList, query, statusFilter, categoryFilter, sortKey, sortDir]);

  // KPI stats
  const totalBudget = useMemo(() => filtered.reduce((s, p) => s + p.budget, 0), [filtered]);
  const totalSpent  = useMemo(() => filtered.reduce((s, p) => s + p.spent, 0), [filtered]);
  const active      = useMemo(() => filtered.filter(p => p.status === "Active").length, [filtered]);
  const atRisk      = useMemo(() => filtered.filter(p => p.status === "At Risk").length, [filtered]);

  const COLS: { key: SortKey; label: string }[] = [
    { key:"name",     label:"Project" },
    { key:"status",   label:"Status" },
    { key:"priority", label:"Priority" },
    { key:"progress", label:"Progress" },
    { key:"budget",   label:"Budget" },
    { key:"dueDate",  label:"Due Date" },
  ];

  const clientOptions: ProjectClientOption[] = accountOptions;

  useEffect(() => {
    if (accountOptions.length > 0 && !accountOptions.some(option => option.value === client)) {
      setClient(accountOptions[0].value);
    }
  }, [accountOptions, client]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!name.trim() || createSubmittingRef.current) return;

    const selectedAccount = accountOptions.find(option => option.value === client);
    if (!selectedAccount) {
      setProjectsError("Select an existing CRM account before creating a production project.");
      return;
    }

    createSubmittingRef.current = true;
    setSavingProject(true);
    setProjectsError(null);

    try {
      const ownerUserId = selectedMembers[0];
      const parsedBudget = budget.trim() === "" ? 0 : Number(budget);
      if (!Number.isFinite(parsedBudget) || parsedBudget < 0) {
        throw new Error("Budget must be a valid positive number.");
      }
      const response = await postProject(createAttempt.current, {
          accountId: selectedAccount.accountId,
          name: name.trim(),
          status: toBackendProjectStatus(status),
          ownerUserId: ownerUserId || undefined,
          memberUserIds: selectedMembers,
          budgetAmount: parsedBudget,
          scopeSummary: description.trim() || undefined,
          plannedStartAt: uiProjectDateToIso(startDate),
          plannedEndAt: uiProjectDateToIso(dueDate),
          priority: priority.toLowerCase(),
          tags: tags.split(",").map((tag) => tag.trim()).filter(Boolean),
          color,
          createStageTemplate: true
      });

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(typeof body.message === "string" ? body.message : Array.isArray(body.message) ? body.message.join("; ") : `Could not create project: ${response.status}`);
      }

      const created = await response.json();
      createAttempt.current = {};
      setProjectsList(current => [mapProjectSummaryToUiProject(created), ...current].slice(0, PROJECT_PAGE_SIZE));
      setProjectPagination(current => {
        const total = current.total + 1;
        const returned = Math.min(current.limit, current.returned + 1);
        return {
          ...current,
          total,
          returned,
          hasNextPage: current.offset + returned < total
        };
      });
      setProjectPage(1);
      setIsCreateOpen(false);

      // Reset Form
      setName("");
      setDescription("");
      setClient(accountOptions[0]?.value ?? "");
      setStatus("Active");
      setPriority("Medium");
      setBudget("");
      setStartDate(defaultProjectStartDate());
      setDueDate(defaultProjectDueDate());
      setColor("#2563eb");
      setTags("");
      setSelectedMembers([]);
    } catch (error) {
      setProjectsError(error instanceof Error ? error.message : "Could not create project");
    } finally {
      createSubmittingRef.current = false;
      setSavingProject(false);
    }
  };

  const handleUpdateProject = async (project: Project, values: ProjectEditValues) => {
    if (savingProjectEdit) return;

    const selectedAccount = clientOptions.find(option => option.value === values.client || option.label === values.client);
    if (!selectedAccount?.accountId) {
      setProjectMutationError("Select an existing CRM account before saving this production project.");
      return;
    }

    setSavingProjectEdit(true);
    setProjectMutationError(null);
    setProjectsError(null);

    try {
      const parsedBudget = values.budgetAmount.trim() === "" ? 0 : Number(values.budgetAmount);
      if (!Number.isFinite(parsedBudget) || parsedBudget < 0) {
        throw new Error("Budget must be a valid positive number.");
      }
      const ownerUserId = values.ownerUserId === "none" ? null : values.ownerUserId;
      const memberUserIds = Array.from(new Set([
        ...values.memberUserIds,
        ...(ownerUserId ? [ownerUserId] : [])
      ]));
      const response = await fetch(`/api/projects/${encodeURIComponent(project.id)}`, {
        method: "PATCH",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          accountId: selectedAccount.accountId,
          name: values.name,
          code: values.code || undefined,
          status: toBackendProjectStatus(values.status),
          projectType: values.projectType,
          scopeSummary: values.scopeSummary || null,
          ownerUserId,
          memberUserIds,
          budgetAmount: parsedBudget,
          plannedStartAt: uiProjectDateToIso(values.plannedStartAt),
          plannedEndAt: uiProjectDateToIso(values.plannedEndAt)
        })
      });

      if (response.status === 401 && process.env.NODE_ENV === "production") {
        redirectToLogin("/projects");
        return;
      }

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(typeof body.message === "string" ? body.message : `Could not update project: ${response.status}`);
      }

      const updated = mapProjectSummaryToUiProject(await response.json());
      setProjectsList(current => current.map(item => item.id === project.id ? updated : item));
      setEditingProject(null);
    } catch (error) {
      setProjectMutationError(error instanceof Error ? error.message : "Could not update project");
    } finally {
      setSavingProjectEdit(false);
    }
  };

  const handleDeleteProject = async (project: Project) => {
    if (deletingProjectId) return;

    setDeletingProjectId(project.id);
    setProjectMutationError(null);
    setProjectsError(null);

    try {
      const response = await fetch(`/api/projects/${encodeURIComponent(project.id)}`, {
        method: "DELETE"
      });

      if (response.status === 401 && process.env.NODE_ENV === "production") {
        redirectToLogin("/projects");
        return;
      }

      if (!response.ok) {
        const body = await response.json().catch(() => ({}));
        throw new Error(typeof body.message === "string" ? body.message : `Could not delete project: ${response.status}`);
      }

      setProjectsList(current => current.filter(item => item.id !== project.id));
      setProjectPagination(current => {
        const total = Math.max(0, current.total - 1);
        const returned = Math.max(0, current.returned - 1);
        return {
          ...current,
          total,
          returned,
          hasNextPage: current.offset + returned < total
        };
      });
      if (pushedIds.includes(project.id)) {
        const nextPushedIds = pushedIds.filter(id => id !== project.id);
        setPushedIds(nextPushedIds);
        writePushedProjectIds(nextPushedIds, pushedProjectOwnerKey);
      }
      setDeletingProject(null);
    } catch (error) {
      setProjectMutationError(error instanceof Error ? error.message : "Could not delete project");
    } finally {
      setDeletingProjectId(null);
    }
  };

  return (
    <AppShell activeRoute="/projects" onCreateProjectClick={() => setIsCreateOpen(true)} title="Projects">
        <main className="flex min-h-0 flex-1 flex-col overflow-y-auto overflow-x-hidden p-3 sm:p-4 xl:p-6">
          {/* Page Header */}
          <div className="mb-4 flex shrink-0 flex-col items-start justify-between gap-3 sm:mb-6 sm:flex-row sm:items-center">
            <div>
              <h1 className="text-xl font-bold text-foreground">All Projects</h1>
              <p className="text-sm text-muted-foreground mt-0.5">
                {filtered.length} projects · {projectsList.length} loaded · {active} active in view
              </p>
            </div>
            <div className="flex w-full flex-wrap items-center gap-2 sm:w-auto sm:justify-end">
              <motion.button whileHover={{ scale:1.02 }} whileTap={{ scale:0.97 }}
                onClick={() => downloadCsv("uplark-projects-loaded.csv", ["Name", "Status", "Priority", "Client", "Budget", "Spent", "Due date"], filtered.map((project) => [project.name, project.status, project.priority, project.client, project.budget, project.spent, project.dueDate]))}
                aria-label={`Export ${filtered.length} loaded projects as CSV`}
                title="Export the currently loaded project result set"
                className="flex items-center gap-1.5 px-3.5 py-2 rounded-xl border border-border text-sm font-medium text-muted-foreground hover:bg-muted transition-colors">
                <Download className="w-4 h-4" /> Export loaded CSV
              </motion.button>
              <motion.button whileHover={{ scale:1.02 }} whileTap={{ scale:0.97 }}
                onClick={() => setIsCreateOpen(true)}
                className="flex items-center gap-1.5 px-4 py-2 rounded-xl text-sm font-semibold text-white shadow-sm"
                style={{ backgroundColor:"var(--color-primary)" }}>
                <Plus className="w-4 h-4" /> New Project
              </motion.button>
            </div>
          </div>

          {projectsError && !isPublicDemoHost() && (
            <div className="mb-4 shrink-0 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm font-medium text-red-700">
              {projectsError}
            </div>
          )}

          {/* KPI row */}
          <div className="mb-4 grid shrink-0 grid-cols-2 gap-3 sm:mb-6 sm:gap-4 xl:grid-cols-4">
            {[
              { label:"Total Budget",  value:<MoneyAmount value={totalBudget} />, icon:Wallet,  color:"#2563eb" },
              { label:"Total Spent",   value:<MoneyAmount value={totalSpent} />,  icon:TrendingUp,  color:"#7c3aed" },
              { label:"Active Loaded", value:active,                               icon:CheckCircle2,color:"#16a34a" },
              { label:"At Risk Loaded",value:atRisk,                               icon:AlertCircle, color:"#dc2626" },
            ].map(s => (
              <motion.div key={s.label} whileHover={{ y:-2 }} className="bg-card border border-border rounded-xl p-4 shadow-sm">
                <div className="flex items-center justify-between mb-2">
                  <p className="text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">{s.label}</p>
                  <div className="w-7 h-7 rounded-lg flex items-center justify-center" style={{ backgroundColor:`${s.color}15` }}>
                    <s.icon className="w-3.5 h-3.5" style={{ color:s.color }} />
                  </div>
                </div>
                <p className="text-2xl font-bold font-mono tabular-nums text-foreground">{s.value}</p>
              </motion.div>
            ))}
          </div>

          {/* Cross-project Project Sheet overview. This is additive; the All Projects result set stays below. */}
          <section className="mb-4 shrink-0 rounded-xl border border-blue-200/80 bg-card p-4 shadow-sm sm:mb-5 sm:p-5" data-testid="project-sheet-overview">
            <div className="flex flex-col gap-1 sm:flex-row sm:items-end sm:justify-between">
              <div>
                <div className="flex items-center gap-2">
                  <span className="rounded-md bg-blue-50 px-2 py-1 text-[10px] font-bold uppercase tracking-wider text-blue-700">Project Sheet</span>
                  <h2 className="text-lg font-bold text-foreground">Tổng quan theo project</h2>
                </div>
                <p className="mt-1 text-xs text-muted-foreground">So sánh tiến độ, task, ngân sách và giờ Plan · Logwork · P&amp;L trước khi mở chi tiết từng project.</p>
              </div>
              <span className="text-xs font-semibold text-muted-foreground">{filtered.length} project theo bộ lọc hiện tại</span>
            </div>
            <div className="mt-4 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {filtered.slice(0, 6).map((item) => (
                <Link key={item.id} href={`/projects/${item.id}?tab=Project%20Sheet`} className="rounded-xl border border-border/80 bg-background p-4 text-left transition hover:-translate-y-0.5 hover:border-primary/50 hover:shadow-sm">
                  <div className="flex items-start justify-between gap-3"><div className="flex min-w-0 items-center gap-2"><span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} /><span className="truncate text-sm font-semibold">{item.name}</span></div><span className="shrink-0 rounded-full bg-muted px-2 py-1 text-[10px] font-semibold">{item.status}</span></div>
                  <div className="mt-1 text-xs text-muted-foreground">{item.client} · {item.category}</div>
                  <div className="mt-3 flex items-center justify-between text-xs"><span className="text-muted-foreground">Tiến độ</span><span className="font-mono font-semibold">{item.progress}%</span></div>
                  <div className="mt-1.5 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full" style={{ width: `${item.progress}%`, backgroundColor: item.color }} /></div>
                  <div className="mt-3 grid grid-cols-2 gap-x-3 gap-y-2 text-[11px] sm:grid-cols-4"><div><div className="text-muted-foreground">Task</div><div className="mt-1 font-mono font-semibold">{item.tasks.done}/{item.tasks.total}</div></div><div><div className="text-muted-foreground">Budget</div><div className="mt-1 truncate font-mono font-semibold"><MoneyAmount value={item.budget} /></div></div><div><div className="text-muted-foreground">Plan hour</div><div className="mt-1 font-mono font-semibold text-blue-700">{Math.max(8, item.tasks.total * 8).toLocaleString('vi-VN')}h</div></div><div><div className="text-muted-foreground">Due</div><div className="mt-1 truncate font-semibold">{item.dueDate}</div></div></div>
                  <div className="mt-3 flex items-center justify-between border-t border-border/60 pt-2 text-[11px]"><span className="text-muted-foreground">Members</span><ProjectMemberAvatarStack members={item.members} limit={4} /></div>
                </Link>
              ))}
            </div>
            {filtered.length > 6 && <p className="mt-3 text-xs text-muted-foreground">Đang hiển thị 6 project đầu tiên · dùng khu vực <span className="font-semibold text-foreground">All Projects</span> bên dưới để xem toàn bộ {filtered.length} project.</p>}
          </section>

          <div className="mb-4 flex shrink-0 flex-wrap items-center gap-2 rounded-xl border border-blue-100 bg-blue-50/60 px-3 py-2.5 text-xs sm:mb-5">
            <span className="mr-1 font-semibold text-blue-900">Pilot vận hành:</span>
            <Link href="/timesheet" className="rounded-lg bg-white px-3 py-1.5 font-semibold text-blue-700 shadow-sm ring-1 ring-blue-100 hover:bg-blue-100">Timesheet theo Project</Link>
            <Link href="/pnl" className="rounded-lg bg-white px-3 py-1.5 font-semibold text-blue-700 shadow-sm ring-1 ring-blue-100 hover:bg-blue-100">Project P&amp;L</Link>
            <span className="text-[11px] text-blue-700/70">Theo dõi giờ kế hoạch, logwork, P&amp;L và ngoại lệ từ cùng workspace.</span>
          </div>

          {/* Filters */}
          <div className="relative flex min-h-[560px] shrink-0 flex-col overflow-hidden rounded-xl border border-border bg-card shadow-sm" data-testid="projects-stable-shell">
            <div className="flex min-h-[4.25rem] shrink-0 flex-col items-stretch gap-3 border-b border-border px-3 py-3 sm:flex-row sm:flex-wrap sm:items-center sm:px-4 xl:flex-nowrap" data-testid="projects-control-bar">
              <div className="flex min-w-0 items-center gap-2.5 flex-1 bg-background border border-input rounded-xl px-3.5 py-2">
                <Search className="w-4 h-4 text-muted-foreground shrink-0" />
                <input value={query} onChange={e => handleQueryChange(e.target.value)} placeholder="Search by name, client, description..."
                  className="flex-1 bg-transparent text-sm text-foreground placeholder:text-muted-foreground/50 focus:outline-none" />
              </div>

              <CustomDropdown
                options={filterStatusOptions}
                value={statusFilter}
                onChange={handleStatusFilterChange}
                className="w-full shrink-0 sm:w-40"
              />

              <CustomDropdown
                options={filterCategoryOptions}
                value={categoryFilter}
                onChange={handleCategoryFilterChange}
                className="w-full shrink-0 sm:w-44"
              />

              <div className="flex items-center self-end bg-muted rounded-xl p-0.5 sm:ml-auto sm:self-auto">
                <button onClick={() => setView("grid")} className={`p-2 rounded-lg transition-all ${view==="grid" ? "bg-card shadow-sm text-foreground" : "text-muted-foreground"}`} title="Grid View">
                  <LayoutGrid className="w-4 h-4" />
                </button>
                <button onClick={() => setView("list")} className={`p-2 rounded-lg transition-all ${view==="list" ? "bg-card shadow-sm text-foreground" : "text-muted-foreground"}`} title="List View">
                  <List className="w-4 h-4" />
                </button>
                <button onClick={() => setView("sheet")} className={`p-2 rounded-lg transition-all ${view==="sheet" ? "bg-card shadow-sm text-foreground" : "text-muted-foreground"}`} title="Project Sheet View" aria-label="Project Sheet View">
                  <ClipboardList className="w-4 h-4" />
                </button>
                <button onClick={() => setView("timeline")} className={`p-2 rounded-lg transition-all ${view==="timeline" ? "bg-card shadow-sm text-foreground" : "text-muted-foreground"}`} title="Timeline View">
                  <Calendar className="w-4 h-4" />
                </button>
              </div>
            </div>
            <div className="flex shrink-0 flex-wrap items-center gap-2 border-b border-border bg-blue-50/50 px-3 py-2 text-xs sm:px-4">
              <span className="font-semibold text-blue-900">Đang hiển thị</span>
              <span className="rounded-md bg-white px-2 py-1 font-semibold text-blue-700 shadow-sm">{filtered.length} project</span>
              {query.trim() ? <span className="rounded-md bg-white px-2 py-1 text-blue-800">Tìm: “{query.trim()}”</span> : null}
              {statusFilter !== "all" ? <span className="rounded-md bg-white px-2 py-1 text-blue-800">Status: {statusFilter}</span> : null}
              {categoryFilter !== "all" ? <span className="rounded-md bg-white px-2 py-1 text-blue-800">Category: {categoryFilter}</span> : null}
              {(query.trim() || statusFilter !== "all" || categoryFilter !== "all") ? (
                <button type="button" onClick={() => { setQuery(""); setStatusFilter("all"); setCategoryFilter("all"); setProjectPage(1); }} className="ml-auto font-semibold text-blue-700 hover:text-blue-900">Xoá bộ lọc</button>
              ) : <span className="text-blue-700/70">Tất cả project đã tải</span>}
            </div>

            <AnimatePresence>
              {loadingProjects && (
                <motion.div
                  role="status"
                  aria-live="polite"
                  initial={{ opacity: 0, y: -4 }}
                  animate={{ opacity: 1, y: 0 }}
                  exit={{ opacity: 0, y: -4 }}
                  transition={{ duration: 0.15 }}
                  className="pointer-events-none absolute right-3 top-[4.75rem] z-30 rounded-lg border border-border bg-card/95 px-3 py-1.5 text-xs font-semibold text-muted-foreground shadow-sm backdrop-blur"
                >
                  Updating projects...
                </motion.div>
              )}
            </AnimatePresence>

            {/* Grid */}
            {view === "grid" && (
              <div ref={resultsScrollRef} className="min-h-0 flex-1 overflow-y-auto p-4" data-testid="projects-results-frame">
                <div className="grid auto-rows-fr grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
                  <AnimatePresence mode="popLayout">
                    {filtered.map(p => (
                      <ProjectCard
                        key={p.id}
                        project={p}
                        isPushed={pushedIds.includes(p.id)}
                        onTogglePush={() => handleTogglePush(p.id)}
                        onEdit={() => {
                          setProjectMutationError(null);
                          setEditingProject(p);
                        }}
                        onDelete={() => {
                          setProjectMutationError(null);
                          setDeletingProject(p);
                        }}
                      />
                    ))}
                  </AnimatePresence>
                </div>
                {filtered.length === 0 && (
                  <div className="flex h-full flex-col items-center justify-center py-16 text-center">
                    <Briefcase className="w-10 h-10 text-muted-foreground/30 mb-3" />
                    <p className="text-sm font-medium text-foreground">No projects found</p>
                    <p className="text-xs text-muted-foreground mt-1">Adjust your filters to see more</p>
                  </div>
                )}
              </div>
            )}

            {/* List */}
            {view === "list" && (
              <div ref={resultsScrollRef} className="min-h-0 flex-1 overflow-auto" data-testid="projects-results-frame">
                <table className="w-full">
                  <thead>
                    <tr className="bg-muted/30 border-b border-border">
                      <th className="py-3 px-4 text-left w-10"><input type="checkbox" className="w-4 h-4 rounded border border-input" /></th>
                      {COLS.map(col => (
                        <th key={col.key} className="py-3 px-4 text-left">
                          <button onClick={() => handleSort(col.key)}
                            className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wider text-muted-foreground hover:text-foreground transition-colors">
                            {col.label} <SortIcon active={sortKey===col.key} dir={sortDir} />
                          </button>
                        </th>
                      ))}
                      <th className="py-3 px-4 text-left text-[11px] font-semibold uppercase tracking-wider text-muted-foreground">Team</th>
                      <th className="py-3 px-4 w-20" />
                    </tr>
                  </thead>
                  <tbody>
                    <AnimatePresence mode="popLayout">
                      {filtered.map((p, i) => {
                        const sc = STATUS_CFG[p.status];
                        const pc = PRIORITY_CFG[p.priority];
                        const budgetPct = p.budget > 0 ? Math.round((p.spent / p.budget) * 100) : 0;
                        return (
                          <motion.tr key={p.id} layout initial={{ opacity:0, y:5 }} animate={{ opacity:1, y:0 }} exit={{ opacity:0 }}
                            transition={{ delay:i*0.02 }}
                            className="border-b border-border/50 hover:bg-muted/30 transition-colors group">
                            <td className="py-3.5 px-4"><input type="checkbox" className="w-4 h-4 rounded border border-input" /></td>
                            <td className="py-3.5 px-4">
                              <Link href={`/projects/${p.id}`} className="flex items-center gap-3">
                                <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor:`${p.color}20` }}>
                                  <Layers className="w-4 h-4" style={{ color:p.color }} />
                                </div>
                                <div>
                                  <p className="text-sm font-semibold text-foreground group-hover:text-primary transition-colors">{p.name}</p>
                                  <p className="text-[11px] text-muted-foreground">{p.category} · {p.client}</p>
                                </div>
                              </Link>
                            </td>
                            <td className="py-3.5 px-4">
                              <span className="inline-flex items-center gap-1.5 text-[11px] font-semibold px-2.5 py-1 rounded-lg" style={{ backgroundColor:sc.bg, color:sc.color }}>
                                <sc.icon className="w-3 h-3" />{p.status}
                              </span>
                            </td>
                            <td className="py-3.5 px-4">
                              <span className="text-[11px] font-semibold px-2 py-0.5 rounded-md" style={{ backgroundColor:pc.bg, color:pc.color }}>{p.priority}</span>
                            </td>
                            <td className="py-3.5 px-4">
                              <div className="flex items-center gap-2 w-28">
                                <div className="flex-1 h-1.5 bg-muted rounded-full overflow-hidden">
                                  <div className="h-full rounded-full" style={{ width:`${p.progress}%`, backgroundColor:p.color }} />
                                </div>
                                <span className="text-xs font-mono font-bold text-foreground w-8 shrink-0">{p.progress}%</span>
                              </div>
                            </td>
                            <td className="py-3.5 px-4">
                              <div>
                                <p className="text-sm font-semibold font-mono text-foreground"><MoneyAmount value={p.budget} /></p>
                                <p className="text-[10px] text-muted-foreground">{budgetPct}% spent</p>
                              </div>
                            </td>
                            <td className="py-3.5 px-4">
                              <div className="flex items-center gap-1.5">
                                <Calendar className="w-3.5 h-3.5 text-muted-foreground" />
                                <span className="text-xs text-muted-foreground">{p.dueDate}</span>
                              </div>
                            </td>
                            <td className="py-3.5 px-4">
                              <ProjectMemberAvatarStack members={p.members} limit={3} />
                            </td>
                            <td className="py-3.5 px-4">
                              <div className="flex items-center gap-1">
                                <button
                                  onClick={() => handleTogglePush(p.id)}
                                  aria-label={pushedIds.includes(p.id) ? `Remove ${p.name} from sidebar` : `Add ${p.name} to sidebar`}
                                  title={pushedIds.includes(p.id) ? "Unpush from Sidebar Menu" : "Push to Sidebar Menu"}
                                  className={`p-1.5 rounded-lg transition-colors ${
                                    pushedIds.includes(p.id)
                                      ? "bg-primary/10 text-primary hover:bg-primary/20"
                                      : "bg-muted text-muted-foreground hover:text-foreground hover:bg-muted/80"
                                  }`}
                                >
                                  <Pin className="w-3.5 h-3.5" style={{ transform: pushedIds.includes(p.id) ? "none" : "rotate(45deg)" }} />
                                </button>
                                <Link aria-label={`Open ${p.name}`} href={`/projects/${p.id}`} className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-primary transition-colors">
                                  <ArrowRight className="w-4 h-4" />
                                </Link>
                                <button
                                  type="button"
                                  title="Edit project"
                                  onClick={() => {
                                    setProjectMutationError(null);
                                    setEditingProject(p);
                                  }}
                                  className="p-1.5 rounded-lg hover:bg-primary/10 text-muted-foreground hover:text-primary transition-colors"
                                >
                                  <Pencil className="w-4 h-4" />
                                </button>
                                <button
                                  type="button"
                                  title="Delete project"
                                  onClick={() => {
                                    setProjectMutationError(null);
                                    setDeletingProject(p);
                                  }}
                                  className="p-1.5 rounded-lg hover:bg-red-50 text-muted-foreground hover:text-red-600 transition-colors"
                                >
                                  <Trash2 className="w-4 h-4" />
                                </button>
                              </div>
                            </td>
                          </motion.tr>
                        );
                      })}
                    </AnimatePresence>
                  </tbody>
                </table>
                {filtered.length === 0 && (
                  <div className="flex h-full flex-col items-center justify-center py-16 text-center">
                    <Briefcase className="w-10 h-10 text-muted-foreground/30 mb-3" />
                    <p className="text-sm font-medium text-foreground">No projects found</p>
                  </div>
                )}
              </div>
            )}

            {/* Project Sheet: cross-project operational view */}
            {view === "sheet" && (
              <div ref={resultsScrollRef} className="min-h-0 flex-1 overflow-auto" data-testid="projects-results-frame">
                <div className="min-w-[1080px]">
                  <div className="border-b border-border bg-muted/20 px-5 py-4">
                    <div className="flex items-center justify-between gap-4">
                      <div>
                        <h2 className="text-base font-bold text-foreground">Project Sheet</h2>
                        <p className="mt-1 text-xs text-muted-foreground">Tổng quan kế hoạch, tiến độ, giờ và chi phí của từng project.</p>
                      </div>
                      <span className="rounded-lg bg-blue-50 px-3 py-1.5 text-xs font-semibold text-blue-700">{filtered.length} project đang hiển thị</span>
                    </div>
                  </div>
                  <table className="w-full border-collapse">
                    <thead className="sticky top-0 z-10 bg-card shadow-sm">
                      <tr className="border-b border-border">
                        {['Project / Client','Status','Progress','Tasks','Plan hour','Logwork hour','P&L hour','Budget / spent','Members',''].map((label) => (
                          <th key={label} className="whitespace-nowrap px-4 py-3 text-left text-[10px] font-bold uppercase tracking-wider text-muted-foreground">{label}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {filtered.map((p) => {
                        const planHours = Math.max(8, p.tasks.total * 8);
                        const logworkHours = Math.round(planHours * Math.max(0.15, p.progress / 100) * 10) / 10;
                        const pnlHours = Math.round(logworkHours * 0.86 * 10) / 10;
                        const spendPct = p.budget > 0 ? Math.min(100, Math.round((p.spent / p.budget) * 100)) : 0;
                        const sc = STATUS_CFG[p.status];
                        return (
                          <tr key={p.id} className="group border-b border-border/60 transition-colors hover:bg-blue-50/40">
                            <td className="px-4 py-3">
                              <Link href={`/projects/${p.id}?tab=Project%20Sheet`} className="block min-w-[230px]">
                                <div className="flex items-center gap-2.5">
                                  <span className="flex h-8 w-8 items-center justify-center rounded-lg" style={{ backgroundColor: `${p.color}18` }}><Layers className="h-4 w-4" style={{ color: p.color }} /></span>
                                  <span className="min-w-0"><span className="block truncate text-sm font-semibold text-foreground group-hover:text-primary">{p.name}</span><span className="block truncate text-[11px] text-muted-foreground">{p.client} · {p.category}</span></span>
                                </div>
                              </Link>
                            </td>
                            <td className="px-4 py-3"><span className="inline-flex items-center gap-1.5 rounded-lg px-2 py-1 text-[11px] font-semibold" style={{ backgroundColor: sc.bg, color: sc.color }}><sc.icon className="h-3 w-3" />{p.status}</span></td>
                            <td className="px-4 py-3"><div className="flex w-28 items-center gap-2"><div className="h-1.5 flex-1 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full" style={{ width: `${p.progress}%`, backgroundColor: p.color }} /></div><span className="w-8 text-right text-xs font-bold tabular-nums">{p.progress}%</span></div></td>
                            <td className="px-4 py-3 text-xs font-medium tabular-nums">{p.tasks.done}/{p.tasks.total}</td>
                            <td className="px-4 py-3 text-xs font-semibold tabular-nums text-blue-700">{planHours.toLocaleString('vi-VN')}h</td>
                            <td className="px-4 py-3 text-xs font-semibold tabular-nums text-emerald-700">{logworkHours.toLocaleString('vi-VN')}h</td>
                            <td className="px-4 py-3 text-xs font-semibold tabular-nums text-violet-700">{pnlHours.toLocaleString('vi-VN')}h</td>
                            <td className="px-4 py-3"><div className="min-w-[145px]"><div className="flex justify-between text-xs font-semibold tabular-nums"><span><MoneyAmount value={p.spent} /></span><span className="text-muted-foreground">{spendPct}%</span></div><div className="mt-1 h-1.5 overflow-hidden rounded-full bg-muted"><div className="h-full rounded-full bg-violet-500" style={{ width: `${spendPct}%` }} /></div></div></td>
                            <td className="px-4 py-3"><ProjectMemberAvatarStack members={p.members} limit={4} /></td>
                            <td className="px-4 py-3"><Link aria-label={`Open Project Sheet for ${p.name}`} href={`/projects/${p.id}?tab=Project%20Sheet`} className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs font-semibold text-primary opacity-80 transition hover:bg-primary/5 hover:opacity-100">Open <ArrowRight className="h-3.5 w-3.5" /></Link></td>
                          </tr>
                        );
                      })}
                    </tbody>
                  </table>
                  {filtered.length === 0 && <div className="flex flex-col items-center justify-center py-16 text-center"><Briefcase className="mb-3 h-10 w-10 text-muted-foreground/30" /><p className="text-sm font-medium text-foreground">No projects found</p><p className="mt-1 text-xs text-muted-foreground">Adjust your filters to see more</p></div>}
                </div>
              </div>
            )}
            {/* Timeline View */}
            {view === "timeline" && (
              <div ref={resultsScrollRef} className="min-h-0 flex-1 overflow-auto p-4" data-testid="projects-results-frame">
                {(() => {
                  const today = new Date();
                  const { start: yearStart, end: yearEnd } = getYearTimelineBounds(today);
                  const todayLeft = timelinePercent(today, yearStart, yearEnd);
                  const currentYear = today.getFullYear();

                  return (
                <div className="min-w-[950px]">
                  {/* Calendar Grid Header */}
                  <div className="flex border-b border-border pb-3 mb-4">
                    <div className="w-72 shrink-0 font-bold text-xs uppercase tracking-wider text-muted-foreground">Project Detail</div>
                    <div className="flex-1 grid grid-cols-12 gap-1 text-center font-bold text-xs text-muted-foreground">
                      {["Jan", "Feb", "Mar", "Apr", "May", "Jun", "Jul", "Aug", "Sep", "Oct", "Nov", "Dec"].map(m => (
                        <div key={m} className="py-1 bg-muted/30 rounded-lg">{m}</div>
                      ))}
                    </div>
                  </div>

                  {/* Timeline Rows */}
                  <div className="relative space-y-4">
                    <div className="absolute top-0 bottom-0 left-72 right-0 z-20 pointer-events-none">
                      <div className="absolute top-0 bottom-0 w-0.5 bg-rose-500/80 transition-all duration-300" style={{ left: `${todayLeft}%` }}>
                        <div className="absolute top-0 -translate-x-1/2 bg-rose-500 text-white text-[9px] font-bold px-1.5 py-0.5 rounded shadow-sm">
                          TODAY
                        </div>
                      </div>
                    </div>

                    {filtered.map(p => {
                      const parsedStart = parseProjectTimelineDate(p.startDate);
                      const parsedDue = parseProjectTimelineDate(p.dueDate);
                      const rawStart = parsedStart ?? parsedDue ?? yearStart;
                      const rawEnd = parsedDue ?? parsedStart ?? yearEnd;
                      const rangeStart = rawStart <= rawEnd ? rawStart : rawEnd;
                      const rangeEnd = rawStart <= rawEnd ? rawEnd : rawStart;
                      const visibleStart = rangeStart < yearStart ? yearStart : rangeStart;
                      const visibleEnd = rangeEnd > yearEnd ? yearEnd : rangeEnd;
                      const isInCurrentYear = rangeEnd >= yearStart && rangeStart <= yearEnd;
                      const pillLeft = timelinePercent(visibleStart, yearStart, yearEnd);
                      const pillWidth = isInCurrentYear
                        ? Math.max(1.5, timelinePercent(visibleEnd, yearStart, yearEnd) - pillLeft)
                        : 0;
                      const sc = STATUS_CFG[p.status];

                      return (
                        <div key={p.id} className="flex items-center group">
                          {/* Left Column: Project Summary info */}
                          <div className="w-72 shrink-0 pr-4 flex items-center gap-3">
                            <div className="w-8 h-8 rounded-lg flex items-center justify-center shrink-0" style={{ backgroundColor: `${p.color}15` }}>
                              <Layers className="w-4 h-4" style={{ color: p.color }} />
                            </div>
                            <div className="min-w-0 flex-1">
                              <Link href={`/projects/${p.id}`} className="text-xs font-bold text-foreground hover:text-primary truncate block transition-colors">{p.name}</Link>
                              <span className="text-[10px] text-muted-foreground block truncate">{p.client} · {p.category}</span>
                            </div>
                            <span className="text-[9px] font-bold px-2 py-0.5 rounded-lg shrink-0" style={{ backgroundColor: sc.bg, color: sc.color }}>{p.status}</span>
                          </div>

                          {/* Right Column: Month grid with the Gantt pill */}
                          <div className="flex-1 grid grid-cols-12 gap-1 relative h-10 items-center">
                            {/* Grid vertical grid lines */}
                            {Array.from({ length: 12 }).map((_, idx) => (
                              <div key={idx} className="h-full border-l border-dashed border-border/40 first:border-l-0" />
                            ))}

                            {isInCurrentYear ? (
                              <Link href={`/projects/${p.id}`} className="absolute h-8 rounded-xl flex items-center px-3 border text-[10px] font-bold shadow-sm transition-all hover:scale-[1.01] hover:shadow-md cursor-pointer select-none truncate"
                                style={{
                                  left: `${pillLeft}%`,
                                  width: `${pillWidth}%`,
                                  minWidth: "7rem",
                                  maxWidth: `calc(100% - ${pillLeft}%)`,
                                  backgroundColor: `${p.color}15`,
                                  borderColor: `${p.color}40`,
                                  color: p.color
                                }}>
                                <span className="truncate flex-1 font-semibold">{p.name} ({p.progress}%)</span>
                                <span className="text-[9px] opacity-90 shrink-0 font-mono hidden sm:inline">{p.startDate.split(",")[0]} - {p.dueDate.split(",")[0]}</span>
                              </Link>
                            ) : (
                              <Link href={`/projects/${p.id}`} className="absolute left-0 h-8 rounded-xl flex items-center px-3 border border-dashed border-border bg-muted/30 text-[10px] font-bold text-muted-foreground">
                                Outside {currentYear}
                              </Link>
                            )}
                          </div>
                        </div>
                      );
                    })}

                    {filtered.length === 0 && (
                      <div className="flex flex-col items-center justify-center py-16 text-center">
                        <Briefcase className="w-10 h-10 text-muted-foreground/30 mb-3" />
                        <p className="text-sm font-medium text-foreground">No projects found</p>
                      </div>
                    )}
                  </div>
                </div>
                  );
                })()}
              </div>
            )}

            {/* Footer */}
            <div className="flex min-h-[3.75rem] shrink-0 items-center justify-between border-t border-border bg-muted/20 px-4 py-3" data-testid="projects-pagination-footer">
              <p className="text-xs text-muted-foreground">
                Showing <span className="font-semibold text-foreground">{(query.trim() || statusFilter !== "all" || categoryFilter !== "all") ? `${filtered.length} / ${filtered.length} projects` : projectPageRangeLabel(projectPagination)}</span>
              </p>
              <ProjectPaginationControls pagination={projectPagination} onPageChange={handleProjectPageChange} />
            </div>
          </div>
        </main>

        <footer className="h-11 border-t border-border bg-card flex items-center justify-between px-5 shrink-0">
          <span className="text-[11px] text-muted-foreground">UpLark Partner CRM</span>
          <span className="text-[11px] text-muted-foreground">Legal pages are not published yet.</span>
        </footer>

        <AnimatePresence>
          {isCreateOpen && (
            <ModalLayer onClose={() => setIsCreateOpen(false)}>
            <div className="fixed inset-0 bg-black/60 backdrop-blur-sm z-50 flex items-center justify-center p-4">
              <motion.div
                ref={createDialogRef} tabIndex={-1}
                aria-labelledby="create-project-title"
                aria-modal="true"
                role="dialog"
                initial={{ opacity: 0, scale: 0.95, y: 16 }}
                animate={{ opacity: 1, scale: 1, y: 0 }}
                exit={{ opacity: 0, scale: 0.95, y: 16 }}
                className="bg-card border border-border rounded-2xl w-full max-w-2xl overflow-visible shadow-2xl flex flex-col max-h-[90dvh]"
              >
                {/* Modal Header */}
                <div className="flex items-center justify-between px-6 py-4 border-b border-border bg-muted/20">
                  <div>
                    <h3 id="create-project-title" className="text-base font-bold text-foreground">Create New Project</h3>
                    <p className="text-xs text-muted-foreground mt-0.5">Define core properties, schedules, budget, and assign team members.</p>
                  </div>
                  <button
                    aria-label="Close create project dialog"
                    type="button"
                    onClick={() => setIsCreateOpen(false)}
                    className="p-1.5 rounded-lg hover:bg-muted text-muted-foreground hover:text-foreground transition-colors"
                  >
                    <X className="w-4 h-4" />
                  </button>
                </div>

                {/* Modal Body */}
                <form onSubmit={handleSubmit} className="flex-1 overflow-y-auto p-6 space-y-4">
                  {projectsError && <div role="alert" className="rounded-xl border border-destructive/30 bg-destructive/10 p-3 text-sm text-destructive">{projectsError}{accountOptions.length === 0 && <button type="button" className="ml-2 underline" onClick={() => setAccountLoadRevision(value => value + 1)}>Retry loading clients</button>}</div>}
                  {loadingAccounts && <p role="status">Loading clients…</p>}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Project Name */}
                    <div className="space-y-1.5">
                      <label htmlFor="create-project-name" className="text-xs font-semibold text-muted-foreground">Project Name <span className="text-destructive">*</span></label>
                      <input
                        id="create-project-name"
                        type="text"
                        required
                        value={name}
                        onChange={e => setName(e.target.value)}
                        placeholder="e.g. Mobile App Redesign"
                        className="w-full px-3.5 py-2.5 bg-background border border-input rounded-xl text-sm text-foreground focus:outline-none focus:border-primary transition-colors"
                      />
                    </div>

                    {/* Client */}
                    <div className="space-y-1.5">
                      <span className="text-xs font-semibold text-muted-foreground">Client</span>
                      <CustomDropdown
                        ariaLabel="Client"
                        options={clientOptions}
                        value={client}
                        onChange={setClient}
                      />
                    </div>

                    {/* Budget */}
                    <div className="space-y-1.5">
                      <label htmlFor="create-project-budget" className="text-xs font-semibold text-muted-foreground">Budget (đ)</label>
                      <input
                        id="create-project-budget"
                        type="number"
                        placeholder="e.g. 50000"
                        value={budget}
                        onChange={e => setBudget(e.target.value)}
                        className="w-full px-3.5 py-2.5 bg-background border border-input rounded-xl text-sm text-foreground focus:outline-none focus:border-primary transition-colors"
                      />
                    </div>

                    {/* Status */}
                    <div className="space-y-1.5">
                      <span className="text-xs font-semibold text-muted-foreground">Status</span>
                      <CustomDropdown
                        ariaLabel="Status"
                        options={STATUS_OPTIONS}
                        value={status}
                        onChange={val => setStatus(val as Project["status"])}
                      />
                    </div>

                    {/* Priority */}
                    <div className="space-y-1.5">
                      <span className="text-xs font-semibold text-muted-foreground">Priority</span>
                      <CustomDropdown
                        ariaLabel="Priority"
                        options={PRIORITY_OPTIONS}
                        value={priority}
                        onChange={val => setPriority(val as Project["priority"])}
                      />
                    </div>

                    {/* Start Date */}
                    <div className="space-y-1.5">
                      <span className="text-xs font-semibold text-muted-foreground">Start Date</span>
                      <CustomDatePicker
                        ariaLabel="Start Date"
                        value={startDate}
                        onChange={setStartDate}
                      />
                    </div>

                    {/* Due Date */}
                    <div className="space-y-1.5">
                      <span className="text-xs font-semibold text-muted-foreground">Due Date</span>
                      <CustomDatePicker
                        ariaLabel="Due Date"
                        value={dueDate}
                        onChange={setDueDate}
                      />
                    </div>
                  </div>

                  {/* Description */}
                  <div className="space-y-1.5">
                    <label htmlFor="create-project-description" className="text-xs font-semibold text-muted-foreground">Description</label>
                    <textarea
                      id="create-project-description"
                      rows={3}
                      value={description}
                      onChange={e => setDescription(e.target.value)}
                      placeholder="Describe the scope, objectives, and deliverables of this project..."
                      className="w-full px-3.5 py-2.5 bg-background border border-input rounded-xl text-sm text-foreground focus:outline-none focus:border-primary transition-colors resize-none"
                    />
                  </div>

                  {/* Highlight Color & Tags */}
                  <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                    {/* Tags */}
                    <div className="space-y-1.5">
                      <label htmlFor="create-project-tags" className="text-xs font-semibold text-muted-foreground">Tags (comma-separated)</label>
                      <input
                        id="create-project-tags"
                        type="text"
                        value={tags}
                        onChange={e => setTags(e.target.value)}
                        placeholder="e.g. Core, Design, Marketing"
                        className="w-full px-3.5 py-2.5 bg-background border border-input rounded-xl text-sm text-foreground focus:outline-none focus:border-primary transition-colors"
                      />
                    </div>

                    {/* Highlight Color */}
                    <div aria-labelledby="create-project-color-label" className="space-y-1.5" role="group">
                      <span id="create-project-color-label" className="text-xs font-semibold text-muted-foreground">Highlight Color</span>
                      <div className="flex items-center gap-2 pt-2">
                        {COLOR_OPTIONS.map(c => (
                          <button
                            key={c}
                            type="button"
                            aria-label={`Select project color ${c}`}
                            aria-pressed={color === c}
                            onClick={() => setColor(c)}
                            className="w-6 h-6 rounded-full border-2 transition-transform hover:scale-110 flex items-center justify-center shrink-0"
                            style={{
                              backgroundColor: c,
                              borderColor: color === c ? "var(--color-foreground)" : "transparent",
                              boxShadow: color === c ? "0 0 0 2px var(--color-background)" : "none"
                            }}
                          >
                            {color === c && <div className="w-1.5 h-1.5 rounded-full bg-white" />}
                          </button>
                        ))}
                      </div>
                    </div>
                  </div>

                  {/* Team Members Assignment */}
                  <div aria-labelledby="create-project-members-label" className="space-y-1.5 pt-2" role="group">
                    <div id="create-project-members-label" className="text-xs font-semibold text-muted-foreground flex items-center justify-between">
                      <span>Assign Team Members ({selectedMembers.length} selected)</span>
                      <span className="text-[10px] text-muted-foreground">
                        {loadingWorkspaceUsers ? "Loading synced users..." : "Click to select/deselect"}
                      </span>
                    </div>
                    <div className="grid grid-cols-2 sm:grid-cols-4 gap-2 bg-muted/20 border border-border p-3.5 rounded-xl">
                      {workspaceUsers.map(m => {
                        const isSelected = selectedMembers.includes(m.id);
                        return (
                          <button
                            key={m.id}
                            type="button"
                            onClick={() => {
                              if (isSelected) {
                                setSelectedMembers(selectedMembers.filter(x => x !== m.id));
                              } else {
                                setSelectedMembers([...selectedMembers, m.id]);
                              }
                            }}
                            className="flex items-center gap-2 p-2 rounded-lg border text-left transition-all hover:bg-card"
                            style={{
                              borderColor: isSelected ? m.color : "var(--color-border)",
                              backgroundColor: isSelected ? `${m.color}10` : "transparent"
                            }}
                          >
                            <UserAvatar user={m} size="sm" />
                            <span className={`text-[11px] font-semibold truncate ${isSelected ? "text-foreground" : "text-muted-foreground"}`}>
                              {m.name}
                            </span>
                          </button>
                        );
                      })}
                      {!loadingWorkspaceUsers && workspaceUsers.length === 0 && (
                        <div className="col-span-full rounded-lg border border-border bg-background px-3 py-2 text-xs font-medium text-muted-foreground">
                          {workspaceUsersError ?? "No synced active users are available for assignment."}
                        </div>
                      )}
                    </div>
                  </div>

                  {/* Modal Action Buttons */}
                  <div className="flex items-center justify-end gap-2 pt-4 border-t border-border mt-6">
                    <button
                      type="button"
                      onClick={() => setIsCreateOpen(false)}
                      className="px-4 py-2 rounded-xl border border-border text-sm font-semibold text-muted-foreground hover:bg-muted transition-colors"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      disabled={savingProject}
                      className="px-5 py-2.5 rounded-xl text-sm font-semibold text-white shadow-md hover:shadow-lg transition-all"
                      style={{ backgroundColor: "var(--color-primary)" }}
                    >
                      {savingProject ? "Creating..." : "Create Project"}
                    </button>
                  </div>
                </form>
              </motion.div>
            </div>
            </ModalLayer>
          )}
        </AnimatePresence>

        <AnimatePresence>
          {editingProject && (
            <ProjectEditModal
              project={editingProject}
              clientOptions={clientOptions}
              workspaceUsers={workspaceUsers}
              loadingWorkspaceUsers={loadingWorkspaceUsers}
              workspaceUsersError={workspaceUsersError}
              isSaving={savingProjectEdit}
              error={projectMutationError}
              onClose={() => {
                setProjectMutationError(null);
                setEditingProject(null);
              }}
              onSave={(values) => handleUpdateProject(editingProject, values)}
            />
          )}
          {deletingProject && (
            <ProjectDeleteConfirmModal
              project={deletingProject}
              isDeleting={deletingProjectId === deletingProject.id}
              error={projectMutationError}
              onCancel={() => {
                setProjectMutationError(null);
                setDeletingProject(null);
              }}
              onConfirm={() => handleDeleteProject(deletingProject)}
            />
          )}
        </AnimatePresence>
    </AppShell>
  );
}
