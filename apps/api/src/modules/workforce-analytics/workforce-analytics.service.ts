import { BadRequestException, Inject, Injectable } from "@nestjs/common";
import { Prisma } from "@prisma/client";
import {
  ANALYTICS_DEFINITIONS_VERSION,
  ANALYTICS_SMALL_COHORT_THRESHOLD,
  ANALYTICS_BREAKDOWN_SORT_KEYS,
  type AnalyticsBreakdownBy,
  type AnalyticsBreakdownRow,
  type AnalyticsBreakdownSortKey,
  type AnalyticsFilterOptions,
  type AnalyticsMetricKey,
  type AnalyticsMetricValue,
  type AnalyticsQuality,
  type AnalyticsSeriesBucket,
  type PrincipalContext,
  type WorkforceProjectsAnalyticsFilters,
  type WorkforceProjectsBreakdownResponse,
  type WorkforceProjectsExportResponse,
  type WorkforceProjectsSummaryMeta,
  type WorkforceProjectsSummaryResponse
} from "@b2b-crm/contracts";
import { PrismaService } from "../../shared/prisma/prisma.service";
import {
  buildAnalyticsBuckets,
  countHcmWeekdays,
  overlapFraction,
  parseAnalyticsRange,
  previousEqualRange,
  prorateCapacityPeriod,
  prorateWeeklyCapacity,
  type AnalyticsBucketBoundary,
  type AnalyticsRange
} from "./analytics-range";
import { resolveAnalyticsPolicy, type AnalyticsPolicy } from "./analytics-policy";
import { countMetric, coverageState, deltaPercent, median, ratioMetric, roundTo } from "./analytics-metrics";

const OPEN_TASK_TERMINAL_STATUSES = ["completed", "cancelled"];
const SUMMARY_BREAKDOWN_LIMIT = 8;
const BREAKDOWN_MAX_LIMIT = 100;
const DELIVERY_LEAD_PROJECT_RELATIONS = ["delivery_lead", "project_lead", "owner"];

interface ParsedFilters extends WorkforceProjectsAnalyticsFilters {}

interface ScopeResolution {
  policy: AnalyticsPolicy;
  workspaceId: string;
  /** undefined = unrestricted inside the workspace */
  projectIds?: string[];
  userIds?: string[];
  accountIds?: string[];
  /** Users whose capacity/workforce facts the viewer may aggregate over. */
  workforceUserIds: string[];
  emptyScope: boolean;
  warnings: string[];
}

interface TimeStatusFacts {
  reviewedApprovedMinutes: number;
  legacyApprovedMinutes: number;
  submittedMinutes: number;
  rejectedMinutes: number;
  reviewedBillableMinutes: number;
  reviewedReworkMinutes: number;
  unassignedActualMinutes: number;
  excludedRows: number;
}

interface PerKeyTimeFacts {
  key: string;
  reviewedMinutes: number;
  legacyMinutes: number;
  submittedMinutes: number;
  billableMinutes: number;
  reworkMinutes: number;
  projectIds: Set<string>;
}

interface TaskFacts {
  eligibleLeafTasks: number;
  completedInRange: number;
  completedWithDue: number;
  onTimeCompletions: number;
  cycleDays: number[];
  overdueOpenTasks: number;
  overdueEstimateMinutes: number;
  blockedTasks: number;
  estimateMinutes: number;
  createdInRangeProjectIds: Set<string>;
}

interface PerKeyTaskFacts {
  key: string;
  eligibleLeafTasks: number;
  completedInRange: number;
  completedWithDue: number;
  onTimeCompletions: number;
  overdueOpenTasks: number;
  blockedTasks: number;
  estimateMinutes: number;
}

interface IntervalFact {
  userId: string;
  projectId: string | null;
  startAt: Date;
  endAt: Date;
  plannedMinutes: number;
  /** plannedMinutes prorated to the collection range's overlap fraction. */
  proratedMinutes: number;
}

interface CapacityFacts {
  totalMinutes: number;
  perUser: Map<string, number>;
  coveredUsers: number;
  totalUsers: number;
}

interface CollectedFacts {
  timeStatus: TimeStatusFacts;
  timeByDay: Array<{
    dayStart: Date;
    reviewedMinutes: number;
    legacyMinutes: number;
    submittedMinutes: number;
    billableMinutes: number;
  }>;
  timeByUser: Map<string, PerKeyTimeFacts>;
  timeByProject: Map<string, PerKeyTimeFacts>;
  tasks: TaskFacts;
  tasksByUser: Map<string, PerKeyTaskFacts>;
  tasksByProject: Map<string, PerKeyTaskFacts>;
  tasksCompletedByDay: Map<string, number>;
  planningIntervals: IntervalFact[];
  allocationIntervals: IntervalFact[];
  capacity: CapacityFacts;
  workTypeVocabulary: string[];
}

@Injectable()
export class WorkforceAnalyticsService {
  constructor(@Inject(PrismaService) private readonly prisma: PrismaService) {}

  async summary(query: any, principal: PrincipalContext): Promise<WorkforceProjectsSummaryResponse> {
    const range = parseAnalyticsRange(query);
    const filters = this.parseFilters(query, range);
    const policy = resolveAnalyticsPolicy(principal);
    this.assertIdentityFiltersAllowed(filters, policy);
    const scope = await this.resolveScope(policy, principal, filters, range);

    const facts = await this.collectFacts(range.from, range.to, scope, filters);
    const buckets = buildAnalyticsBuckets(range.from, range.to, range.grain);
    const series = this.buildSeries(buckets, facts, scope);

    let compareSeries: AnalyticsSeriesBucket[] | undefined;
    let previousFacts: CollectedFacts | undefined;
    let compareRange: { from: Date; to: Date } | undefined;
    if (range.compare === "previous") {
      compareRange = previousEqualRange(range);
      previousFacts = await this.collectFacts(compareRange.from, compareRange.to, scope, filters);
      const compareBuckets = buildAnalyticsBuckets(compareRange.from, compareRange.to, range.grain);
      compareSeries = this.buildSeries(compareBuckets, previousFacts, scope);
    }

    const quality = await this.buildQuality(scope, facts, principal.workspaceId, range);
    const totals = this.buildTotals(facts, previousFacts, quality);
    const breakdowns = await this.buildSummaryBreakdowns(facts, scope, range, principal.workspaceId);
    const filterOptions = await this.buildFilterOptions(scope, principal.workspaceId, filters, range);
    const suppressedGroups = breakdowns.suppressedGroups;
    quality.suppressedGroups = suppressedGroups;

    return {
      meta: this.buildMeta({ range, filters, policy, scope, principal, compareRange, suppressedGroups }),
      totals,
      series,
      compareSeries,
      breakdowns: {
        users: breakdowns.users.slice(0, SUMMARY_BREAKDOWN_LIMIT),
        projects: breakdowns.projects.slice(0, SUMMARY_BREAKDOWN_LIMIT),
        departments: breakdowns.departments,
        teams: breakdowns.teams
      },
      quality,
      filterOptions
    };
  }

  async breakdown(query: any, principal: PrincipalContext): Promise<WorkforceProjectsBreakdownResponse> {
    const range = parseAnalyticsRange(query);
    const filters = this.parseFilters(query, range);
    const policy = resolveAnalyticsPolicy(principal);
    this.assertIdentityFiltersAllowed(filters, policy);
    const scope = await this.resolveScope(policy, principal, filters, range);

    const by = this.parseBreakdownBy(query.by);
    if (isIdentityBreakdown(by) && !policy.identityDimensionsAllowed) {
      return this.emptyBreakdownResponse(range, filters, policy, scope, principal, by, "identity_breakdown_not_authorized");
    }

    const sort = this.parseSortKey(query.sort);
    const direction: "asc" | "desc" = query.direction === "asc" ? "asc" : "desc";
    const limit = Math.min(Math.max(Number.parseInt(String(query.limit ?? "25"), 10) || 25, 1), BREAKDOWN_MAX_LIMIT);
    const offset = this.decodeCursor(query.cursor);

    const facts = await this.collectFacts(range.from, range.to, scope, filters);
    const all = await this.buildSummaryBreakdowns(facts, scope, range, principal.workspaceId);
    const rows = by === "user" ? all.users : by === "project" ? all.projects : by === "department" ? all.departments : all.teams;

    const sorted = [...rows].sort((a, b) => {
      const av = sort === "label" ? a.label : a.metrics[sort as AnalyticsMetricKey] ?? null;
      const bv = sort === "label" ? b.label : b.metrics[sort as AnalyticsMetricKey] ?? null;
      let cmp: number;
      if (typeof av === "string" || typeof bv === "string") {
        cmp = String(av ?? "").localeCompare(String(bv ?? ""), "vi");
      } else {
        // null sorts last regardless of direction so N/A never beats real data
        if (av === null && bv === null) cmp = 0;
        else if (av === null) return 1;
        else if (bv === null) return -1;
        else cmp = av - bv;
      }
      if (cmp === 0) cmp = a.id.localeCompare(b.id);
      return direction === "asc" ? cmp : -cmp;
    });

    const page = sorted.slice(offset, offset + limit);
    const nextOffset = offset + limit;
    const totals: Partial<Record<AnalyticsMetricKey, number | null>> = {
      reviewedApprovedMinutes: facts.timeStatus.reviewedApprovedMinutes,
      legacyApprovedMinutes: facts.timeStatus.legacyApprovedMinutes,
      submittedMinutes: facts.timeStatus.submittedMinutes,
      scheduledMinutes: Math.round(sumProratedIntervals(facts.planningIntervals, range.from, range.to)),
      allocationMinutes: Math.round(sumProratedIntervals(facts.allocationIntervals, range.from, range.to)),
      estimateMinutes: facts.tasks.estimateMinutes,
      capacityMinutes: facts.capacity.coveredUsers > 0 ? Math.round(facts.capacity.totalMinutes) : null,
      overdueTasks: facts.tasks.overdueOpenTasks
    };

    return {
      meta: {
        ...this.buildMeta({ range, filters, policy, scope, principal, suppressedGroups: all.suppressedGroups }),
        by,
        sort,
        direction,
        limit,
        totalRows: sorted.length
      },
      rows: page,
      totals,
      nextCursor: nextOffset < sorted.length ? this.encodeCursor(nextOffset) : undefined
    };
  }

  async export(query: any, principal: PrincipalContext): Promise<WorkforceProjectsExportResponse> {
    const range = parseAnalyticsRange(query);
    const filters = this.parseFilters(query, range);
    const policy = resolveAnalyticsPolicy(principal);
    this.assertIdentityFiltersAllowed(filters, policy);
    const scope = await this.resolveScope(policy, principal, filters, range);

    const facts = await this.collectFacts(range.from, range.to, scope, filters);
    const series = this.buildSeries(buildAnalyticsBuckets(range.from, range.to, range.grain), facts, scope);

    let compareSeries: AnalyticsSeriesBucket[] | undefined;
    let previousFacts: CollectedFacts | undefined;
    let compareRange: { from: Date; to: Date } | undefined;
    if (range.compare === "previous") {
      compareRange = previousEqualRange(range);
      previousFacts = await this.collectFacts(compareRange.from, compareRange.to, scope, filters);
      compareSeries = this.buildSeries(
        buildAnalyticsBuckets(compareRange.from, compareRange.to, range.grain),
        previousFacts,
        scope
      );
    }

    const quality = await this.buildQuality(scope, facts, principal.workspaceId, range);
    const breakdowns = await this.buildSummaryBreakdowns(facts, scope, range, principal.workspaceId);
    quality.suppressedGroups = breakdowns.suppressedGroups;

    return {
      meta: this.buildMeta({ range, filters, policy, scope, principal, compareRange, suppressedGroups: breakdowns.suppressedGroups }),
      totals: this.buildTotals(facts, previousFacts, quality),
      series,
      compareSeries,
      breakdowns: {
        users: breakdowns.users,
        projects: breakdowns.projects,
        departments: breakdowns.departments,
        teams: breakdowns.teams
      },
      quality
    };
  }

  /* ── Parsing helpers ─────────────────────────────────────────────────── */

  private parseFilters(query: any, range: AnalyticsRange): ParsedFilters {
    const billableRaw = typeof query.billable === "string" && query.billable.length > 0 ? query.billable : "all";
    if (!["all", "billable", "non_billable"].includes(billableRaw)) {
      throw new BadRequestException("billable must be all, billable or non_billable");
    }
    return {
      from: range.from.toISOString(),
      to: range.to.toISOString(),
      timezone: range.timezone,
      grain: range.grain,
      compare: range.compare,
      departmentIds: parseIdList(query.departmentId),
      teamIds: parseIdList(query.teamId),
      userIds: parseIdList(query.userId),
      accountIds: parseIdList(query.accountId),
      projectIds: parseIdList(query.projectId),
      projectStatuses: parseIdList(query.projectStatus),
      taskStatuses: parseIdList(query.taskStatus),
      workTypes: parseIdList(query.workType),
      billable: billableRaw as ParsedFilters["billable"]
    };
  }

  private assertIdentityFiltersAllowed(filters: ParsedFilters, policy: AnalyticsPolicy) {
    if (policy.identityDimensionsAllowed) return;
    if (filters.userIds.length > 0 || filters.departmentIds.length > 0 || filters.teamIds.length > 0) {
      throw new BadRequestException("user, department and team filters are not authorized for this analytics policy");
    }
  }

  private parseBreakdownBy(raw: unknown): AnalyticsBreakdownBy {
    if (raw === undefined || raw === null || raw === "") return "user";
    if (raw !== "user" && raw !== "project" && raw !== "department" && raw !== "team") {
      throw new BadRequestException("by must be user, project, department or team");
    }
    return raw;
  }

  private parseSortKey(raw: unknown): AnalyticsBreakdownSortKey {
    if (raw === undefined || raw === null || raw === "") return "reviewedApprovedMinutes";
    if (!ANALYTICS_BREAKDOWN_SORT_KEYS.includes(raw as AnalyticsBreakdownSortKey)) {
      throw new BadRequestException("sort is not an allowed breakdown sort key");
    }
    return raw as AnalyticsBreakdownSortKey;
  }

  private encodeCursor(offset: number): string {
    return Buffer.from(JSON.stringify({ o: offset }), "utf8").toString("base64url");
  }

  private decodeCursor(raw: unknown): number {
    if (raw === undefined || raw === null || raw === "") return 0;
    try {
      const parsed = JSON.parse(Buffer.from(String(raw), "base64url").toString("utf8"));
      const offset = Number.parseInt(String(parsed.o), 10);
      if (!Number.isFinite(offset) || offset < 0) throw new Error("bad offset");
      return offset;
    } catch {
      throw new BadRequestException("cursor is not valid");
    }
  }

  /* ── Scope resolution ────────────────────────────────────────────────── */

  private async resolveScope(
    policy: AnalyticsPolicy,
    principal: PrincipalContext,
    filters: ParsedFilters,
    range: AnalyticsRange
  ): Promise<ScopeResolution> {
    const warnings: string[] = [];
    const workspaceId = principal.workspaceId;

    let projectIds: string[] | undefined;
    let userIds: string[] | undefined;
    let accountIds: string[] | undefined;

    if (policy.scopeKind === "managed_projects") {
      const memberships = await this.prisma.projectMember.findMany({
        where: {
          workspaceId,
          userId: principal.subjectId,
          relation: { in: DELIVERY_LEAD_PROJECT_RELATIONS, mode: "insensitive" }
        },
        select: { projectId: true }
      });
      projectIds = [...new Set(memberships.map((row) => row.projectId))];
    }

    if (policy.scopeKind === "self") {
      // Self scope restricts every fact to the viewer's own rows; project
      // aggregates therefore only ever contain the viewer's own contribution.
      userIds = [principal.subjectId];
    }

    if (policy.scopeKind === "related_accounts") {
      const [picAccounts, memberAccounts] = await Promise.all([
        this.prisma.account.findMany({ where: { workspaceId, picUserId: principal.subjectId }, select: { id: true } }),
        this.prisma.accountMember.findMany({ where: { workspaceId, userId: principal.subjectId }, select: { accountId: true } })
      ]);
      accountIds = [...new Set([...picAccounts.map((a) => a.id), ...memberAccounts.map((m) => m.accountId)])];
    }

    // Requested filters can only narrow the authorized scope, never widen it.
    if (filters.accountIds.length > 0) {
      accountIds = accountIds === undefined ? filters.accountIds : accountIds.filter((id) => filters.accountIds.includes(id));

      // Workspace-scoped roles do not start with an account restriction, so
      // canonicalize requested ids before they are used by any fact/facet query.
      // Restricted account scopes were already sourced from workspace-bound rows.
      if (policy.scopeKind !== "related_accounts" && accountIds.length > 0) {
        const workspaceAccounts = await this.prisma.account.findMany({
          where: { workspaceId, id: { in: accountIds } },
          select: { id: true }
        });
        accountIds = workspaceAccounts.map((account) => account.id);
      }
    }
    if (filters.projectIds.length > 0) {
      projectIds = projectIds === undefined ? filters.projectIds : projectIds.filter((id) => filters.projectIds.includes(id));
    }
    if (filters.userIds.length > 0) {
      userIds = userIds === undefined ? filters.userIds : userIds.filter((id) => filters.userIds.includes(id));
    }

    // Project is a child dimension of account/client. Resolve it once against
    // workspace, authorized projects, selected accounts and current status.
    // This drops stale project ids when a client filter changes instead of
    // retaining a contradictory project selection in downstream queries.
    if (projectIds !== undefined || filters.projectStatuses.length > 0) {
      const scopedProjects = await this.prisma.project.findMany({
        where: {
          workspaceId,
          ...(projectIds !== undefined ? { id: { in: projectIds } } : {}),
          ...(accountIds !== undefined ? { accountId: { in: accountIds } } : {}),
          ...(filters.projectStatuses.length > 0 ? { status: { in: filters.projectStatuses } } : {})
        },
        select: { id: true }
      });
      projectIds = scopedProjects.map((project) => project.id);
    }

    // OR within one dimension is expressed by Prisma `in`. Distinct person,
    // department and team dimensions are intersected (AND) below.
    if (filters.departmentIds.length > 0 || filters.teamIds.length > 0) {
      let departmentUserIds: Set<string> | undefined;
      let teamUserIds: Set<string> | undefined;
      if (filters.departmentIds.length > 0) {
        const profiles = await this.prisma.workspaceMemberProfile.findMany({
          where: {
            workspaceId,
            departmentId: { in: filters.departmentIds },
            effectiveFrom: { lt: range.to },
            OR: [{ effectiveTo: null }, { effectiveTo: { gte: range.from } }]
          },
          select: { userId: true }
        });
        departmentUserIds = new Set(profiles.map((row) => row.userId));
      }
      if (filters.teamIds.length > 0) {
        const teamMembers = await this.prisma.workspaceTeamMember.findMany({
          where: {
            workspaceId,
            teamId: { in: filters.teamIds },
            effectiveFrom: { lt: range.to },
            OR: [{ effectiveTo: null }, { effectiveTo: { gte: range.from } }]
          },
          select: { userId: true }
        });
        teamUserIds = new Set(teamMembers.map((row) => row.userId));
      }

      const dimensionUserIds = departmentUserIds && teamUserIds
        ? intersectSets(departmentUserIds, teamUserIds)
        : departmentUserIds ?? teamUserIds ?? new Set<string>();
      const filtered = [...dimensionUserIds];
      userIds = userIds === undefined ? filtered : userIds.filter((id) => filtered.includes(id));
      if (filtered.length === 0) warnings.push("department_team_filter_matched_no_members");
    }

    // Treat request user ids as a narrowing filter only. They must never become
    // the authorization source for capacity data, whose tables are user-global.
    const authorizedWorkforceUserIds = await this.resolveWorkforceUsers({ workspaceId, principal, policy, projectIds });
    if (userIds !== undefined) {
      const authorizedUserIds = new Set(authorizedWorkforceUserIds);
      userIds = userIds.filter((id) => authorizedUserIds.has(id));
    }
    const workforceUserIds = userIds ?? authorizedWorkforceUserIds;

    const emptyScope =
      (projectIds !== undefined && projectIds.length === 0) ||
      (accountIds !== undefined && accountIds.length === 0) ||
      (userIds !== undefined && userIds.length === 0);

    if (emptyScope) warnings.push("scope_resolved_empty");

    return { policy, workspaceId, projectIds, userIds, accountIds, workforceUserIds, emptyScope, warnings };
  }

  private async resolveWorkforceUsers(input: {
    workspaceId: string;
    principal: PrincipalContext;
    policy: AnalyticsPolicy;
    projectIds?: string[];
  }): Promise<string[]> {
    if (input.policy.scopeKind === "self") return [input.principal.subjectId];

    if (input.policy.scopeKind === "managed_projects" && input.projectIds !== undefined) {
      if (input.projectIds.length === 0) return [];
      const members = await this.prisma.projectMember.findMany({
        where: { workspaceId: input.workspaceId, projectId: { in: input.projectIds } },
        select: { userId: true }
      });
      return [...new Set(members.map((row) => row.userId))];
    }

    if (input.policy.scopeKind === "related_accounts") {
      return [];
    }

    const users = await this.prisma.user.findMany({
      where: {
        status: "ACTIVE",
        subjectType: "INTERNAL_USER",
        roleBindings: { some: { workspaceId: input.workspaceId, tenantKey: input.principal.tenantKey, endsAt: null } }
      },
      select: { id: true }
    });
    return users.map((row) => row.id);
  }

  /* ── Fact collection (SQL aggregation, no per-entity fan-out) ────────── */

  private async collectFacts(from: Date, to: Date, scope: ScopeResolution, filters: ParsedFilters): Promise<CollectedFacts> {
    if (scope.emptyScope) {
      return emptyFacts();
    }

    const workspaceCondition = (alias: string) => Prisma.sql`${Prisma.raw(`"${alias}"."workspaceId"`)} = ${scope.workspaceId}`;

    const timeConditions: Prisma.Sql[] = [
      workspaceCondition("te"),
      Prisma.sql`COALESCE(te."startAt", te."workDate") >= ${from}`,
      Prisma.sql`COALESCE(te."startAt", te."workDate") < ${to}`
    ];
    if (scope.projectIds) timeConditions.push(Prisma.sql`te."projectId" IN (${Prisma.join(scope.projectIds)})`);
    if (scope.userIds) timeConditions.push(Prisma.sql`te."userId" IN (${Prisma.join(scope.userIds)})`);
    if (scope.accountIds) timeConditions.push(Prisma.sql`te."accountId" IN (${Prisma.join(scope.accountIds)})`);
    if (filters.workTypes.length > 0) timeConditions.push(Prisma.sql`te."workType" IN (${Prisma.join(filters.workTypes)})`);
    if (filters.billable === "billable") timeConditions.push(Prisma.sql`te."billable" = true`);
    if (filters.billable === "non_billable") timeConditions.push(Prisma.sql`te."billable" = false`);
    const timeWhere = Prisma.join(timeConditions, " AND ");

    const statusRows = await this.prisma.$queryRaw<Array<{
      approvalStatus: string;
      reviewed: boolean;
      minutes: bigint | number | null;
      billableMinutes: bigint | number | null;
      reworkMinutes: bigint | number | null;
      unassignedMinutes: bigint | number | null;
      rows: bigint | number;
    }>>(Prisma.sql`
      SELECT
        te."approvalStatus" AS "approvalStatus",
        (te."reviewedAt" IS NOT NULL) AS "reviewed",
        SUM(te."minutes") AS "minutes",
        SUM(te."minutes") FILTER (WHERE te."billable") AS "billableMinutes",
        SUM(te."minutes") FILTER (WHERE lower(te."workType") = 'rework') AS "reworkMinutes",
        SUM(te."minutes") FILTER (WHERE te."projectId" IS NULL) AS "unassignedMinutes",
        COUNT(*) AS "rows"
      FROM "TaskTimeEntry" te
      WHERE ${timeWhere}
      GROUP BY 1, 2
    `);

    const timeStatus: TimeStatusFacts = {
      reviewedApprovedMinutes: 0,
      legacyApprovedMinutes: 0,
      submittedMinutes: 0,
      rejectedMinutes: 0,
      reviewedBillableMinutes: 0,
      reviewedReworkMinutes: 0,
      unassignedActualMinutes: 0,
      excludedRows: 0
    };
    for (const row of statusRows) {
      const minutes = toNumber(row.minutes);
      if (row.approvalStatus === "approved" && row.reviewed) {
        timeStatus.reviewedApprovedMinutes += minutes;
        timeStatus.reviewedBillableMinutes += toNumber(row.billableMinutes);
        timeStatus.reviewedReworkMinutes += toNumber(row.reworkMinutes);
        timeStatus.unassignedActualMinutes += toNumber(row.unassignedMinutes);
      } else if (row.approvalStatus === "approved") {
        timeStatus.legacyApprovedMinutes += minutes;
      } else if (row.approvalStatus === "submitted") {
        timeStatus.submittedMinutes += minutes;
      } else if (row.approvalStatus === "rejected") {
        timeStatus.rejectedMinutes += minutes;
      } else {
        timeStatus.excludedRows += toNumber(row.rows);
      }
    }

    const dayRows = await this.prisma.$queryRaw<Array<{
      dayLocal: Date;
      reviewedMinutes: bigint | number | null;
      legacyMinutes: bigint | number | null;
      submittedMinutes: bigint | number | null;
      billableMinutes: bigint | number | null;
    }>>(Prisma.sql`
      SELECT
        -- Columns are timestamp-without-tz holding UTC wall time, so convert
        -- explicitly: UTC instant -> HCM local wall time -> day truncation.
        date_trunc('day', ((COALESCE(te."startAt", te."workDate") AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Ho_Chi_Minh')) AS "dayLocal",
        SUM(te."minutes") FILTER (WHERE te."approvalStatus" = 'approved' AND te."reviewedAt" IS NOT NULL) AS "reviewedMinutes",
        SUM(te."minutes") FILTER (WHERE te."approvalStatus" = 'approved' AND te."reviewedAt" IS NULL) AS "legacyMinutes",
        SUM(te."minutes") FILTER (WHERE te."approvalStatus" = 'submitted') AS "submittedMinutes",
        SUM(te."minutes") FILTER (WHERE te."approvalStatus" = 'approved' AND te."reviewedAt" IS NOT NULL AND te."billable") AS "billableMinutes"
      FROM "TaskTimeEntry" te
      WHERE ${timeWhere}
      GROUP BY 1
      ORDER BY 1
    `);

    const timeByDay = dayRows.map((row) => ({
      // dayLocal is an HCM-local naive timestamp; convert back to the UTC instant of that local midnight
      dayStart: new Date(row.dayLocal.getTime() - 7 * 60 * 60 * 1000),
      reviewedMinutes: toNumber(row.reviewedMinutes),
      legacyMinutes: toNumber(row.legacyMinutes),
      submittedMinutes: toNumber(row.submittedMinutes),
      billableMinutes: toNumber(row.billableMinutes)
    }));

    const perUserRows = await this.prisma.$queryRaw<Array<{
      userId: string;
      reviewedMinutes: bigint | number | null;
      legacyMinutes: bigint | number | null;
      submittedMinutes: bigint | number | null;
      billableMinutes: bigint | number | null;
      reworkMinutes: bigint | number | null;
      projectIds: string[] | null;
    }>>(Prisma.sql`
      SELECT
        te."userId" AS "userId",
        SUM(te."minutes") FILTER (WHERE te."approvalStatus" = 'approved' AND te."reviewedAt" IS NOT NULL) AS "reviewedMinutes",
        SUM(te."minutes") FILTER (WHERE te."approvalStatus" = 'approved' AND te."reviewedAt" IS NULL) AS "legacyMinutes",
        SUM(te."minutes") FILTER (WHERE te."approvalStatus" = 'submitted') AS "submittedMinutes",
        SUM(te."minutes") FILTER (WHERE te."approvalStatus" = 'approved' AND te."reviewedAt" IS NOT NULL AND te."billable") AS "billableMinutes",
        SUM(te."minutes") FILTER (WHERE te."approvalStatus" = 'approved' AND te."reviewedAt" IS NOT NULL AND lower(te."workType") = 'rework') AS "reworkMinutes",
        array_agg(DISTINCT te."projectId") FILTER (WHERE te."projectId" IS NOT NULL) AS "projectIds"
      FROM "TaskTimeEntry" te
      WHERE ${timeWhere}
      GROUP BY 1
    `);

    const perProjectRows = await this.prisma.$queryRaw<Array<{
      projectId: string;
      reviewedMinutes: bigint | number | null;
      legacyMinutes: bigint | number | null;
      submittedMinutes: bigint | number | null;
      billableMinutes: bigint | number | null;
      reworkMinutes: bigint | number | null;
    }>>(Prisma.sql`
      SELECT
        te."projectId" AS "projectId",
        SUM(te."minutes") FILTER (WHERE te."approvalStatus" = 'approved' AND te."reviewedAt" IS NOT NULL) AS "reviewedMinutes",
        SUM(te."minutes") FILTER (WHERE te."approvalStatus" = 'approved' AND te."reviewedAt" IS NULL) AS "legacyMinutes",
        SUM(te."minutes") FILTER (WHERE te."approvalStatus" = 'submitted') AS "submittedMinutes",
        SUM(te."minutes") FILTER (WHERE te."approvalStatus" = 'approved' AND te."reviewedAt" IS NOT NULL AND te."billable") AS "billableMinutes",
        SUM(te."minutes") FILTER (WHERE te."approvalStatus" = 'approved' AND te."reviewedAt" IS NOT NULL AND lower(te."workType") = 'rework') AS "reworkMinutes"
      FROM "TaskTimeEntry" te
      WHERE ${timeWhere} AND te."projectId" IS NOT NULL
      GROUP BY 1
    `);

    /* Tasks */
    const taskConditions: Prisma.Sql[] = [
      workspaceCondition("t"),
      Prisma.sql`t."archivedAt" IS NULL`,
      Prisma.sql`t."cancelledAt" IS NULL`,
      Prisma.sql`t."status" <> 'cancelled'`,
      Prisma.sql`NOT EXISTS (SELECT 1 FROM "ProjectTask" c WHERE c."parentTaskId" = t."id")`,
      Prisma.sql`t."createdAt" < ${to}`,
      Prisma.sql`(t."completedAt" IS NULL OR t."completedAt" >= ${from})`
    ];
    if (scope.projectIds) taskConditions.push(Prisma.sql`t."projectId" IN (${Prisma.join(scope.projectIds)})`);
    if (scope.userIds) taskConditions.push(Prisma.sql`t."assigneeUserId" IN (${Prisma.join(scope.userIds)})`);
    if (scope.accountIds) taskConditions.push(Prisma.sql`t."accountId" IN (${Prisma.join(scope.accountIds)})`);
    if (filters.taskStatuses.length > 0) taskConditions.push(Prisma.sql`t."status" IN (${Prisma.join(filters.taskStatuses)})`);
    const taskWhere = Prisma.join(taskConditions, " AND ");
    const asOf = new Date();

    const taskTotalsRows = await this.prisma.$queryRaw<Array<{
      eligible: bigint | number;
      completedInRange: bigint | number;
      completedWithDue: bigint | number;
      onTime: bigint | number;
      overdueOpen: bigint | number;
      overdueEstimate: bigint | number | null;
      blocked: bigint | number;
      estimate: bigint | number | null;
    }>>(Prisma.sql`
      SELECT
        COUNT(*) AS "eligible",
        COUNT(*) FILTER (WHERE t."completedAt" >= ${from} AND t."completedAt" < ${to}) AS "completedInRange",
        COUNT(*) FILTER (WHERE t."completedAt" >= ${from} AND t."completedAt" < ${to} AND t."dueAt" IS NOT NULL) AS "completedWithDue",
        COUNT(*) FILTER (WHERE t."completedAt" >= ${from} AND t."completedAt" < ${to} AND t."dueAt" IS NOT NULL AND t."completedAt" <= t."dueAt") AS "onTime",
        COUNT(*) FILTER (WHERE t."completedAt" IS NULL AND t."status" NOT IN (${Prisma.join(OPEN_TASK_TERMINAL_STATUSES)}) AND t."dueAt" IS NOT NULL AND t."dueAt" < ${asOf}) AS "overdueOpen",
        SUM(t."estimateMinutes") FILTER (WHERE t."completedAt" IS NULL AND t."status" NOT IN (${Prisma.join(OPEN_TASK_TERMINAL_STATUSES)}) AND t."dueAt" IS NOT NULL AND t."dueAt" < ${asOf}) AS "overdueEstimate",
        COUNT(*) FILTER (WHERE t."completedAt" IS NULL AND t."status" = 'blocked') AS "blocked",
        SUM(t."estimateMinutes") AS "estimate"
      FROM "ProjectTask" t
      WHERE ${taskWhere}
    `);

    const cycleRows = await this.prisma.$queryRaw<Array<{ cycleDays: number }>>(Prisma.sql`
      SELECT EXTRACT(EPOCH FROM (t."completedAt" - t."startedAt")) / 86400.0 AS "cycleDays"
      FROM "ProjectTask" t
      WHERE ${taskWhere}
        AND t."completedAt" >= ${from} AND t."completedAt" < ${to}
        AND t."startedAt" IS NOT NULL
    `);

    const createdRows = await this.prisma.$queryRaw<Array<{ projectId: string }>>(Prisma.sql`
      SELECT DISTINCT t."projectId" AS "projectId"
      FROM "ProjectTask" t
      WHERE ${taskWhere} AND t."projectId" IS NOT NULL
        AND ((t."createdAt" >= ${from} AND t."createdAt" < ${to}) OR (t."completedAt" >= ${from} AND t."completedAt" < ${to}))
    `);

    const taskGroupSelect = (groupCol: Prisma.Sql) => Prisma.sql`
      SELECT
        ${groupCol} AS "key",
        COUNT(*) AS "eligible",
        COUNT(*) FILTER (WHERE t."completedAt" >= ${from} AND t."completedAt" < ${to}) AS "completedInRange",
        COUNT(*) FILTER (WHERE t."completedAt" >= ${from} AND t."completedAt" < ${to} AND t."dueAt" IS NOT NULL) AS "completedWithDue",
        COUNT(*) FILTER (WHERE t."completedAt" >= ${from} AND t."completedAt" < ${to} AND t."dueAt" IS NOT NULL AND t."completedAt" <= t."dueAt") AS "onTime",
        COUNT(*) FILTER (WHERE t."completedAt" IS NULL AND t."status" NOT IN (${Prisma.join(OPEN_TASK_TERMINAL_STATUSES)}) AND t."dueAt" IS NOT NULL AND t."dueAt" < ${asOf}) AS "overdueOpen",
        COUNT(*) FILTER (WHERE t."completedAt" IS NULL AND t."status" = 'blocked') AS "blocked",
        SUM(t."estimateMinutes") AS "estimate"
      FROM "ProjectTask" t
      WHERE ${taskWhere} AND ${groupCol} IS NOT NULL
      GROUP BY 1
    `;

    const [tasksByUserRows, tasksByProjectRows, tasksCompletedByDayRows] = await Promise.all([
      this.prisma.$queryRaw<Array<PerKeyTaskRaw>>(taskGroupSelect(Prisma.sql`t."assigneeUserId"`)),
      this.prisma.$queryRaw<Array<PerKeyTaskRaw>>(taskGroupSelect(Prisma.sql`t."projectId"`)),
      this.prisma.$queryRaw<Array<{ dayLocal: Date; completed: bigint | number }>>(Prisma.sql`
        SELECT
          date_trunc('day', ((t."completedAt" AT TIME ZONE 'UTC') AT TIME ZONE 'Asia/Ho_Chi_Minh')) AS "dayLocal",
          COUNT(*) AS "completed"
        FROM "ProjectTask" t
        WHERE ${taskWhere} AND t."completedAt" >= ${from} AND t."completedAt" < ${to}
        GROUP BY 1
      `)
    ]);

    /* Planning blocks and allocations: minimal interval projections, prorated in service code. */
    const planningRows = await this.prisma.taskPlanningBlock.findMany({
      where: {
        workspaceId: scope.workspaceId,
        status: { not: "cancelled" },
        startAt: { lt: to },
        endAt: { gt: from },
        ...(scope.projectIds ? { projectId: { in: scope.projectIds } } : {}),
        ...(scope.userIds ? { userId: { in: scope.userIds } } : {}),
        ...(scope.accountIds ? { accountId: { in: scope.accountIds } } : {})
      },
      select: { userId: true, projectId: true, startAt: true, endAt: true, plannedMinutes: true }
    });

    const allocationRows = await this.prisma.resourceAllocation.findMany({
      where: {
        workspaceId: scope.workspaceId,
        status: { notIn: ["RELEASED", "CANCELLED"] },
        startAt: { lt: to },
        endAt: { gt: from },
        ...(scope.projectIds ? { projectId: { in: scope.projectIds } } : {}),
        ...(scope.userIds ? { userId: { in: scope.userIds } } : {}),
        ...(scope.accountIds ? { accountId: { in: scope.accountIds } } : {})
      },
      select: { userId: true, projectId: true, startAt: true, endAt: true, plannedMinutes: true }
    });

    const capacity = await this.collectCapacity(from, to, scope);

    const workTypeRows = await this.prisma.$queryRaw<Array<{ workType: string }>>(Prisma.sql`
      SELECT DISTINCT te."workType" AS "workType" FROM "TaskTimeEntry" te WHERE ${timeWhere} LIMIT 50
    `);

    const taskTotals = taskTotalsRows[0];
    return {
      timeStatus,
      timeByDay,
      timeByUser: new Map(perUserRows.map((row) => [row.userId, {
        key: row.userId,
        reviewedMinutes: toNumber(row.reviewedMinutes),
        legacyMinutes: toNumber(row.legacyMinutes),
        submittedMinutes: toNumber(row.submittedMinutes),
        billableMinutes: toNumber(row.billableMinutes),
        reworkMinutes: toNumber(row.reworkMinutes),
        projectIds: new Set(row.projectIds ?? [])
      }])),
      timeByProject: new Map(perProjectRows.map((row) => [row.projectId, {
        key: row.projectId,
        reviewedMinutes: toNumber(row.reviewedMinutes),
        legacyMinutes: toNumber(row.legacyMinutes),
        submittedMinutes: toNumber(row.submittedMinutes),
        billableMinutes: toNumber(row.billableMinutes),
        reworkMinutes: toNumber(row.reworkMinutes),
        projectIds: new Set<string>()
      }])),
      tasks: {
        eligibleLeafTasks: toNumber(taskTotals?.eligible),
        completedInRange: toNumber(taskTotals?.completedInRange),
        completedWithDue: toNumber(taskTotals?.completedWithDue),
        onTimeCompletions: toNumber(taskTotals?.onTime),
        cycleDays: cycleRows.map((row) => Number(row.cycleDays)).filter((value) => Number.isFinite(value) && value >= 0),
        overdueOpenTasks: toNumber(taskTotals?.overdueOpen),
        overdueEstimateMinutes: toNumber(taskTotals?.overdueEstimate),
        blockedTasks: toNumber(taskTotals?.blocked),
        estimateMinutes: toNumber(taskTotals?.estimate),
        createdInRangeProjectIds: new Set(createdRows.map((row) => row.projectId))
      },
      tasksByUser: new Map(tasksByUserRows.map((row) => [row.key, mapPerKeyTask(row)])),
      tasksByProject: new Map(tasksByProjectRows.map((row) => [row.key, mapPerKeyTask(row)])),
      tasksCompletedByDay: new Map(tasksCompletedByDayRows.map((row) => [
        new Date(row.dayLocal.getTime() - 7 * 60 * 60 * 1000).toISOString(),
        toNumber(row.completed)
      ])),
      planningIntervals: planningRows.map((row) => ({
        userId: row.userId,
        projectId: row.projectId,
        startAt: row.startAt,
        endAt: row.endAt,
        plannedMinutes: row.plannedMinutes,
        proratedMinutes: row.plannedMinutes * overlapFraction(from, to, row.startAt, row.endAt)
      })),
      allocationIntervals: allocationRows.map((row) => ({
        userId: row.userId,
        projectId: row.projectId,
        startAt: row.startAt,
        endAt: row.endAt,
        plannedMinutes: row.plannedMinutes,
        proratedMinutes: row.plannedMinutes * overlapFraction(from, to, row.startAt, row.endAt)
      })),
      capacity,
      workTypeVocabulary: workTypeRows.map((row) => row.workType).sort()
    };
  }

  private async collectCapacity(from: Date, to: Date, scope: ScopeResolution): Promise<CapacityFacts> {
    const userIds = scope.workforceUserIds;
    if (userIds.length === 0) {
      return { totalMinutes: 0, perUser: new Map(), coveredUsers: 0, totalUsers: 0 };
    }

    const [periods, profiles] = await Promise.all([
      this.prisma.resourceCapacityPeriod.findMany({
        where: {
          workspaceId: scope.workspaceId,
          userId: { in: userIds },
          periodStart: { lt: to },
          periodEnd: { gt: from }
        },
        select: { userId: true, periodStart: true, periodEnd: true, availableMinutes: true, plannedLeaveMinutes: true }
      }),
      this.prisma.workspaceMemberProfile.findMany({
        where: {
          workspaceId: scope.workspaceId,
          userId: { in: userIds },
          effectiveFrom: { lt: to },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: from } }]
        },
        select: { userId: true, weeklyCapacityMinutes: true }
      })
    ]);

    const perUser = new Map<string, number>();
    for (const period of periods) {
      const minutes = prorateCapacityPeriod({
        rangeFrom: from,
        rangeTo: to,
        periodStart: period.periodStart,
        periodEnd: period.periodEnd,
        availableMinutes: Math.max(period.availableMinutes - period.plannedLeaveMinutes, 0)
      });
      if (minutes > 0) perUser.set(period.userId, (perUser.get(period.userId) ?? 0) + minutes);
    }

    // Weekly fallback applies only when the workspace profile explicitly sets a
    // weekly capacity; a missing profile stays missing (never a silent default).
    const weeklyByUser = new Map<string, number>();
    for (const profile of profiles) {
      if (profile.weeklyCapacityMinutes !== null && profile.weeklyCapacityMinutes > 0) {
        weeklyByUser.set(profile.userId, profile.weeklyCapacityMinutes);
      }
    }
    for (const [userId, weekly] of weeklyByUser) {
      if (!perUser.has(userId)) {
        const minutes = prorateWeeklyCapacity(weekly, from, to);
        if (minutes > 0) perUser.set(userId, minutes);
      }
    }

    let total = 0;
    for (const minutes of perUser.values()) total += minutes;
    return { totalMinutes: total, perUser, coveredUsers: perUser.size, totalUsers: userIds.length };
  }

  /* ── Assembly ─────────────────────────────────────────────────────────── */

  private buildSeries(buckets: AnalyticsBucketBoundary[], facts: CollectedFacts, scope: ScopeResolution): AnalyticsSeriesBucket[] {
    const bucketOf = (instant: Date): number => {
      for (let i = buckets.length - 1; i >= 0; i -= 1) {
        if (instant.getTime() >= buckets[i].start.getTime() && instant.getTime() < buckets[i].end.getTime()) return i;
      }
      return -1;
    };

    const series: AnalyticsSeriesBucket[] = buckets.map((bucket) => ({
      bucketStart: bucket.start.toISOString(),
      bucketLabel: bucket.label,
      reviewedApprovedMinutes: 0,
      legacyApprovedMinutes: 0,
      submittedMinutes: 0,
      billableMinutes: 0,
      scheduledMinutes: 0,
      allocationMinutes: 0,
      capacityMinutes: null,
      tasksCompleted: 0
    }));

    for (const day of facts.timeByDay) {
      const index = bucketOf(day.dayStart);
      if (index < 0) continue;
      series[index].reviewedApprovedMinutes += day.reviewedMinutes;
      series[index].legacyApprovedMinutes += day.legacyMinutes;
      series[index].submittedMinutes += day.submittedMinutes;
      series[index].billableMinutes += day.billableMinutes;
    }

    for (const [dayIso, completed] of facts.tasksCompletedByDay) {
      const index = bucketOf(new Date(dayIso));
      if (index >= 0) series[index].tasksCompleted += completed;
    }

    for (const interval of facts.planningIntervals) {
      for (let i = 0; i < buckets.length; i += 1) {
        const fraction = overlapFraction(buckets[i].start, buckets[i].end, interval.startAt, interval.endAt);
        if (fraction > 0) series[i].scheduledMinutes += interval.plannedMinutes * fraction;
      }
    }
    for (const interval of facts.allocationIntervals) {
      for (let i = 0; i < buckets.length; i += 1) {
        const fraction = overlapFraction(buckets[i].start, buckets[i].end, interval.startAt, interval.endAt);
        if (fraction > 0) series[i].allocationMinutes += interval.plannedMinutes * fraction;
      }
    }

    // Capacity per bucket: overall covered capacity scaled by bucket weekday share.
    if (facts.capacity.coveredUsers > 0) {
      const rangeFrom = buckets[0]?.start;
      const rangeTo = buckets[buckets.length - 1]?.end;
      if (rangeFrom && rangeTo) {
        const totalWeekdays = countHcmWeekdays(rangeFrom, rangeTo);
        for (let i = 0; i < buckets.length; i += 1) {
          if (totalWeekdays > 0) {
            const bucketWeekdays = countHcmWeekdays(buckets[i].start, buckets[i].end);
            series[i].capacityMinutes = Math.round((facts.capacity.totalMinutes * bucketWeekdays) / totalWeekdays);
          }
        }
      }
    }

    return series.map((bucket) => ({
      ...bucket,
      scheduledMinutes: Math.round(bucket.scheduledMinutes),
      allocationMinutes: Math.round(bucket.allocationMinutes)
    }));
  }

  private buildTotals(facts: CollectedFacts, previous: CollectedFacts | undefined, quality: AnalyticsQuality): AnalyticsMetricValue[] {
    const capacityCoverage = {
      covered: facts.capacity.coveredUsers,
      total: facts.capacity.totalUsers,
      description: "người có capacity xác định / tổng người trong phạm vi"
    };
    const capacityKnown = facts.capacity.coveredUsers > 0;
    const capacityMinutes = capacityKnown ? Math.round(facts.capacity.totalMinutes) : null;
    const prevCapacityKnown = previous ? previous.capacity.coveredUsers > 0 : undefined;

    const scheduled = Math.round(sumProratedIntervalsAll(facts.planningIntervals));
    const allocation = Math.round(sumProratedIntervalsAll(facts.allocationIntervals));

    const reviewed = facts.timeStatus.reviewedApprovedMinutes;
    const prevReviewed = previous?.timeStatus.reviewedApprovedMinutes ?? null;

    // Capacity covered per-user actual utilization: numerator restricted to users with known capacity.
    let coveredReviewed = 0;
    let coveredAllocation = 0;
    if (capacityKnown) {
      for (const [userId] of facts.capacity.perUser) {
        coveredReviewed += facts.timeByUser.get(userId)?.reviewedMinutes ?? 0;
      }
      const allocationByUser = groupIntervalsByUser(facts.allocationIntervals);
      for (const [userId] of facts.capacity.perUser) {
        coveredAllocation += allocationByUser.get(userId) ?? 0;
      }
    }

    const projectsTouched = new Set<string>();
    for (const projectId of facts.timeByProject.keys()) projectsTouched.add(projectId);
    for (const projectId of facts.tasks.createdInRangeProjectIds) projectsTouched.add(projectId);
    for (const interval of facts.allocationIntervals) {
      if (interval.projectId) projectsTouched.add(interval.projectId);
    }

    const reworkKnown = facts.workTypeVocabulary.some((workType) => workType.toLowerCase() === "rework");
    const cycle = median(facts.tasks.cycleDays);

    const totals: AnalyticsMetricValue[] = [
      countMetric("reviewedApprovedMinutes", reviewed, { previousValue: prevReviewed }),
      countMetric("legacyApprovedMinutes", facts.timeStatus.legacyApprovedMinutes, {
        previousValue: previous?.timeStatus.legacyApprovedMinutes ?? null,
        state: facts.timeStatus.legacyApprovedMinutes > 0 ? "partial" : "available",
        warnings: facts.timeStatus.legacyApprovedMinutes > 0
          ? ["Giờ approved trước khi có quy trình review; báo cáo tách riêng, không cộng vào giờ đã duyệt."]
          : undefined
      }),
      countMetric("submittedMinutes", facts.timeStatus.submittedMinutes, { previousValue: previous?.timeStatus.submittedMinutes ?? null }),
      countMetric("rejectedMinutes", facts.timeStatus.rejectedMinutes, { previousValue: previous?.timeStatus.rejectedMinutes ?? null }),
      ratioMetric("billableRatio", facts.timeStatus.reviewedBillableMinutes, reviewed > 0 ? reviewed : null, {
        previousValue: previous && previous.timeStatus.reviewedApprovedMinutes > 0
          ? roundTo((previous.timeStatus.reviewedBillableMinutes / previous.timeStatus.reviewedApprovedMinutes) * 100, 1)
          : null
      }),
      {
        key: "capacityMinutes",
        state: capacityKnown ? coverageState(capacityCoverage) ?? "available" : "unavailable",
        value: capacityMinutes,
        coverage: capacityCoverage,
        previousValue: previous ? (prevCapacityKnown ? Math.round(previous.capacity.totalMinutes) : null) : undefined,
        deltaPercent: capacityMinutes !== null && previous && prevCapacityKnown
          ? deltaPercent(capacityMinutes, Math.round(previous.capacity.totalMinutes))
          : null,
        warnings: capacityKnown ? undefined : ["Chưa có capacity period hoặc weekly capacity nào được khai báo trong phạm vi này."]
      },
      ratioMetric("actualUtilization", capacityKnown ? coveredReviewed : null, capacityKnown ? Math.round(facts.capacity.totalMinutes) : null, {
        coverage: capacityCoverage,
        missingState: "unavailable"
      }),
      ratioMetric("plannedUtilization", capacityKnown ? Math.round(coveredAllocation) : null, capacityKnown ? Math.round(facts.capacity.totalMinutes) : null, {
        coverage: capacityCoverage,
        missingState: "unavailable"
      }),
      countMetric("scheduledMinutes", scheduled, { previousValue: previous ? Math.round(sumProratedIntervalsAll(previous.planningIntervals)) : null }),
      countMetric("allocationMinutes", allocation, { previousValue: previous ? Math.round(sumProratedIntervalsAll(previous.allocationIntervals)) : null }),
      countMetric("estimateMinutes", facts.tasks.estimateMinutes, { previousValue: previous?.tasks.estimateMinutes ?? null }),
      countMetric("projectsTouched", projectsTouched.size, {
        previousValue: previous ? countProjectsTouched(previous) : null,
        warnings: ["Bao gồm dự án có giờ làm đã duyệt, công việc được tạo hoặc hoàn thành trong kỳ, hoặc kế hoạch phân bổ còn hiệu lực."]
      }),
      ratioMetric("taskCompletionRate", facts.tasks.completedInRange, facts.tasks.eligibleLeafTasks > 0 ? facts.tasks.eligibleLeafTasks : null),
      ratioMetric("onTimeCompletionRate", facts.tasks.onTimeCompletions, facts.tasks.completedWithDue > 0 ? facts.tasks.completedWithDue : null),
      ratioMetric("dueDateCoverage", facts.tasks.completedWithDue, facts.tasks.completedInRange > 0 ? facts.tasks.completedInRange : null),
      {
        key: "estimateVarianceMinutes",
        state: facts.tasks.estimateMinutes > 0 ? "available" : "partial",
        value: reviewed - facts.tasks.estimateMinutes,
        numerator: reviewed,
        denominator: facts.tasks.estimateMinutes,
        deltaPercent: null,
        warnings: facts.tasks.estimateMinutes > 0 ? undefined : ["Không có estimate > 0 trong phạm vi; chỉ hiển thị chênh lệch tuyệt đối."]
      },
      {
        key: "medianCycleTimeDays",
        state: cycle === null ? "unavailable" : "available",
        value: cycle === null ? null : roundTo(cycle, 1),
        coverage: {
          covered: facts.tasks.cycleDays.length,
          total: facts.tasks.completedInRange,
          description: "task hoàn thành có đủ startedAt/completedAt"
        },
        deltaPercent: null
      },
      countMetric("overdueTasks", facts.tasks.overdueOpenTasks, { previousValue: previous?.tasks.overdueOpenTasks ?? null }),
      countMetric("overdueEstimateMinutes", facts.tasks.overdueEstimateMinutes),
      countMetric("blockedTasks", facts.tasks.blockedTasks),
      this.buildOverbookedMetric(facts, capacityCoverage),
      ratioMetric("reworkShare", reworkKnown ? facts.timeStatus.reviewedReworkMinutes : null, reworkKnown && reviewed > 0 ? reviewed : null, {
        missingState: "unavailable",
        warnings: reworkKnown
          ? undefined
          : [`Chưa chuẩn hóa work-type 'rework'. Từ vựng hiện có: ${facts.workTypeVocabulary.join(", ") || "(trống)"}.`]
      })
    ];

    quality.legacyApprovedMinutes = facts.timeStatus.legacyApprovedMinutes;
    return totals;
  }

  private buildOverbookedMetric(facts: CollectedFacts, coverage: { covered: number; total: number; description?: string }): AnalyticsMetricValue {
    if (facts.capacity.coveredUsers === 0) {
      return {
        key: "overbookedPeople",
        state: "unavailable",
        value: null,
        coverage,
        deltaPercent: null,
        warnings: ["Không thể xác định overbook khi chưa có capacity."]
      };
    }
    const allocationByUser = groupIntervalsByUser(facts.allocationIntervals);
    let overbooked = 0;
    for (const [userId, capacityMinutes] of facts.capacity.perUser) {
      const allocated = allocationByUser.get(userId) ?? 0;
      if (allocated > capacityMinutes) overbooked += 1;
    }
    return {
      key: "overbookedPeople",
      state: coverageState(coverage) ?? "available",
      value: overbooked,
      coverage,
      deltaPercent: null
    };
  }

  private async buildSummaryBreakdowns(
    facts: CollectedFacts,
    scope: ScopeResolution,
    range: AnalyticsRange,
    workspaceId: string
  ): Promise<{
    users: AnalyticsBreakdownRow[];
    projects: AnalyticsBreakdownRow[];
    departments: AnalyticsBreakdownRow[];
    teams: AnalyticsBreakdownRow[];
    suppressedGroups: number;
  }> {
    const allocationByUser = groupIntervalsByUser(facts.allocationIntervals);
    const planningByUser = groupIntervalsByUser(facts.planningIntervals);
    const allocationByProject = groupIntervalsByProject(facts.allocationIntervals);
    const planningByProject = groupIntervalsByProject(facts.planningIntervals);

    const userIds = new Set<string>([
      ...facts.timeByUser.keys(),
      ...facts.tasksByUser.keys(),
      ...allocationByUser.keys(),
      ...planningByUser.keys(),
      ...facts.capacity.perUser.keys()
    ]);

    const userRecords = userIds.size > 0
      ? await this.prisma.user.findMany({
          where: { id: { in: [...userIds] } },
          select: { id: true, displayName: true, status: true, subjectType: true }
        })
      : [];
    const userLabel = new Map(userRecords.map((row) => [row.id, row.displayName]));

    let pseudoCounter = 0;
    const users: AnalyticsBreakdownRow[] = [];
    if (scope.policy.userBreakdownAllowed) {
      const orderedUsers = [...userIds].sort();
      for (const userId of orderedUsers) {
        const time = facts.timeByUser.get(userId);
        const tasks = facts.tasksByUser.get(userId);
        const capacityMinutes = facts.capacity.perUser.get(userId) ?? null;
        const reviewed = time?.reviewedMinutes ?? 0;
        pseudoCounter += 1;
        const named = scope.policy.namedWorkforce;
        users.push({
          id: named ? userId : `anon-${pseudoHash(userId)}`,
          label: named ? userLabel.get(userId) ?? "(không rõ)" : `Thành viên #${pseudoCounter}`,
          kind: "user",
          href: named ? `/users/${userId}` : undefined,
          pseudonymized: named ? undefined : true,
          metrics: {
            reviewedApprovedMinutes: reviewed,
            legacyApprovedMinutes: time?.legacyMinutes ?? 0,
            submittedMinutes: time?.submittedMinutes ?? 0,
            scheduledMinutes: Math.round(planningByUser.get(userId) ?? 0),
            allocationMinutes: Math.round(allocationByUser.get(userId) ?? 0),
            estimateMinutes: tasks?.estimateMinutes ?? 0,
            capacityMinutes: capacityMinutes === null ? null : Math.round(capacityMinutes),
            actualUtilization: capacityMinutes && capacityMinutes > 0 ? roundTo((reviewed / capacityMinutes) * 100, 1) : null,
            taskCompletionRate: tasks && tasks.eligibleLeafTasks > 0 ? roundTo((tasks.completedInRange / tasks.eligibleLeafTasks) * 100, 1) : null,
            onTimeCompletionRate: tasks && tasks.completedWithDue > 0 ? roundTo((tasks.onTimeCompletions / tasks.completedWithDue) * 100, 1) : null,
            overdueTasks: tasks?.overdueOpenTasks ?? 0,
            projectsTouched: time ? time.projectIds.size : 0
          },
          states: {
            capacityMinutes: capacityMinutes === null ? "unavailable" : "available",
            actualUtilization: capacityMinutes === null ? "unavailable" : "available"
          }
        });
      }
    }

    const projectIds = new Set<string>([
      ...facts.timeByProject.keys(),
      ...facts.tasksByProject.keys(),
      ...allocationByProject.keys(),
      ...planningByProject.keys()
    ]);
    const projectRecords = projectIds.size > 0
      ? await this.prisma.project.findMany({
          where: { id: { in: [...projectIds] }, workspaceId },
          select: { id: true, name: true, code: true, status: true, account: { select: { id: true, name: true } } }
        })
      : [];
    const projectInfo = new Map(projectRecords.map((row) => [row.id, row]));

    const projects: AnalyticsBreakdownRow[] = [...projectIds]
      .filter((projectId) => projectInfo.has(projectId))
      .sort()
      .map((projectId) => {
        const info = projectInfo.get(projectId)!;
        const time = facts.timeByProject.get(projectId);
        const tasks = facts.tasksByProject.get(projectId);
        const reviewed = time?.reviewedMinutes ?? 0;
        const estimate = tasks?.estimateMinutes ?? 0;
        return {
          id: projectId,
          label: info.name,
          kind: "project" as const,
          href: `/projects/${projectId}?tab=Dashboard`,
          accountLabel: info.account?.name,
          status: info.status,
          metrics: {
            reviewedApprovedMinutes: reviewed,
            legacyApprovedMinutes: time?.legacyMinutes ?? 0,
            submittedMinutes: time?.submittedMinutes ?? 0,
            scheduledMinutes: Math.round(planningByProject.get(projectId) ?? 0),
            allocationMinutes: Math.round(allocationByProject.get(projectId) ?? 0),
            estimateMinutes: estimate,
            estimateVarianceMinutes: estimate > 0 ? reviewed - estimate : null,
            taskCompletionRate: tasks && tasks.eligibleLeafTasks > 0 ? roundTo((tasks.completedInRange / tasks.eligibleLeafTasks) * 100, 1) : null,
            onTimeCompletionRate: tasks && tasks.completedWithDue > 0 ? roundTo((tasks.onTimeCompletions / tasks.completedWithDue) * 100, 1) : null,
            overdueTasks: tasks?.overdueOpenTasks ?? 0,
            blockedTasks: tasks?.blockedTasks ?? 0
          }
        };
      });

    const { departments, teams, suppressedGroups } = await this.buildMembershipBreakdowns(facts, scope, range, workspaceId);
    return { users, projects, departments, teams, suppressedGroups };
  }

  private async buildMembershipBreakdowns(
    facts: CollectedFacts,
    scope: ScopeResolution,
    range: AnalyticsRange,
    workspaceId: string
  ): Promise<{ departments: AnalyticsBreakdownRow[]; teams: AnalyticsBreakdownRow[]; suppressedGroups: number }> {
    if (!scope.policy.identityDimensionsAllowed || scope.emptyScope || scope.workforceUserIds.length === 0) {
      return { departments: [], teams: [], suppressedGroups: 0 };
    }

    const [departments, teams, profiles, teamMembers] = await Promise.all([
      this.prisma.department.findMany({ where: { workspaceId, active: true }, select: { id: true, name: true } }),
      this.prisma.workspaceTeam.findMany({ where: { workspaceId, active: true }, select: { id: true, name: true } }),
      this.prisma.workspaceMemberProfile.findMany({
        where: {
          workspaceId,
          effectiveFrom: { lt: range.to },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: range.from } }]
        },
        select: { userId: true, departmentId: true }
      }),
      this.prisma.workspaceTeamMember.findMany({
        where: {
          workspaceId,
          effectiveFrom: { lt: range.to },
          OR: [{ effectiveTo: null }, { effectiveTo: { gte: range.from } }]
        },
        select: { userId: true, teamId: true }
      })
    ]);

    const scopedUsers = new Set(scope.workforceUserIds);
    const usersByDepartment = new Map<string, Set<string>>();
    for (const profile of profiles) {
      if (!profile.departmentId) continue;
      if (scopedUsers.size > 0 && !scopedUsers.has(profile.userId)) continue;
      if (!usersByDepartment.has(profile.departmentId)) usersByDepartment.set(profile.departmentId, new Set());
      usersByDepartment.get(profile.departmentId)!.add(profile.userId);
    }
    const usersByTeam = new Map<string, Set<string>>();
    for (const member of teamMembers) {
      if (scopedUsers.size > 0 && !scopedUsers.has(member.userId)) continue;
      if (!usersByTeam.has(member.teamId)) usersByTeam.set(member.teamId, new Set());
      usersByTeam.get(member.teamId)!.add(member.userId);
    }

    let suppressed = 0;
    const buildGroupRow = (
      kind: "department" | "team",
      id: string,
      label: string,
      members: Set<string>
    ): AnalyticsBreakdownRow | null => {
      if (members.size === 0) return null;
      const smallCohort = members.size < ANALYTICS_SMALL_COHORT_THRESHOLD;
      if (smallCohort && !scope.policy.namedWorkforce) {
        suppressed += 1;
        return null;
      }
      let reviewed = 0;
      let legacy = 0;
      let capacityMinutes = 0;
      let capacityCovered = 0;
      for (const userId of members) {
        reviewed += facts.timeByUser.get(userId)?.reviewedMinutes ?? 0;
        legacy += facts.timeByUser.get(userId)?.legacyMinutes ?? 0;
        const capacity = facts.capacity.perUser.get(userId);
        if (capacity !== undefined) {
          capacityMinutes += capacity;
          capacityCovered += 1;
        }
      }
      return {
        id,
        label,
        kind,
        memberCount: members.size,
        metrics: {
          reviewedApprovedMinutes: reviewed,
          legacyApprovedMinutes: legacy,
          capacityMinutes: capacityCovered > 0 ? Math.round(capacityMinutes) : null,
          actualUtilization: capacityCovered > 0 && capacityMinutes > 0 ? roundTo((reviewed / capacityMinutes) * 100, 1) : null
        },
        states: {
          capacityMinutes: capacityCovered === 0 ? "unavailable" : capacityCovered < members.size ? "partial" : "available",
          actualUtilization: capacityCovered === 0 ? "unavailable" : capacityCovered < members.size ? "partial" : "available"
        }
      };
    };

    const departmentRows = departments
      .map((dept) => buildGroupRow("department", dept.id, dept.name, usersByDepartment.get(dept.id) ?? new Set()))
      .filter((row): row is AnalyticsBreakdownRow => row !== null);
    const teamRows = teams
      .map((team) => buildGroupRow("team", team.id, team.name, usersByTeam.get(team.id) ?? new Set()))
      .filter((row): row is AnalyticsBreakdownRow => row !== null);

    return { departments: departmentRows, teams: teamRows, suppressedGroups: suppressed };
  }

  private async buildQuality(
    scope: ScopeResolution,
    facts: CollectedFacts,
    workspaceId: string,
    range: AnalyticsRange
  ): Promise<AnalyticsQuality> {
    const totalUsers = scope.workforceUserIds.length;
    const profiles = totalUsers > 0
      ? await this.prisma.workspaceMemberProfile.findMany({
          where: {
            workspaceId,
            userId: { in: scope.workforceUserIds },
            effectiveFrom: { lt: range.to },
            OR: [{ effectiveTo: null }, { effectiveTo: { gte: range.from } }]
          },
          select: { userId: true, departmentId: true, primaryTeamId: true, weeklyCapacityMinutes: true }
        })
      : [];
    const teamMemberships = totalUsers > 0
      ? await this.prisma.workspaceTeamMember.findMany({
          where: {
            workspaceId,
            userId: { in: scope.workforceUserIds },
            effectiveFrom: { lt: range.to },
            OR: [{ effectiveTo: null }, { effectiveTo: { gte: range.from } }]
          },
          select: { userId: true }
        })
      : [];

    const profileByUser = new Map(profiles.map((profile) => [profile.userId, profile]));
    const teamUserIds = new Set(teamMemberships.map((member) => member.userId));

    let missingDepartment = 0;
    let missingTeam = 0;
    for (const userId of scope.workforceUserIds) {
      const profile = profileByUser.get(userId);
      if (!profile?.departmentId) missingDepartment += 1;
      if (!teamUserIds.has(userId) && !profile?.primaryTeamId) missingTeam += 1;
    }

    return {
      usersMissingDepartment: missingDepartment,
      usersMissingTeam: missingTeam,
      usersMissingCapacity: Math.max(totalUsers - facts.capacity.coveredUsers, 0),
      membershipCoverage: {
        covered: profileByUser.size,
        total: totalUsers,
        description: "người có hồ sơ thành viên workspace hiệu lực trong kỳ"
      },
      unassignedActualMinutes: facts.timeStatus.unassignedActualMinutes,
      legacyApprovedMinutes: facts.timeStatus.legacyApprovedMinutes,
      excludedTimeEntryRows: facts.timeStatus.excludedRows,
      suppressedGroups: 0,
      workTypeVocabulary: facts.workTypeVocabulary
    };
  }

  private async buildFilterOptions(
    scope: ScopeResolution,
    workspaceId: string,
    filters: ParsedFilters,
    range: AnalyticsRange
  ): Promise<AnalyticsFilterOptions> {
    const visibleWorkforceUserIds = scope.policy.identityDimensionsAllowed ? scope.workforceUserIds : [];
    const effectiveMembershipWhere = {
      workspaceId,
      userId: { in: visibleWorkforceUserIds },
      effectiveFrom: { lt: range.to },
      OR: [{ effectiveTo: null }, { effectiveTo: { gte: range.from } }]
    };
    const projectWhere: Prisma.ProjectWhereInput = {
      workspaceId,
      ...(scope.projectIds ? { id: { in: scope.projectIds } } : {}),
      ...(scope.accountIds ? { accountId: { in: scope.accountIds } } : {})
    };
    const taskWhere: Prisma.ProjectTaskWhereInput = {
      workspaceId,
      archivedAt: null,
      cancelledAt: null,
      status: { not: "cancelled" },
      createdAt: { lt: range.to },
      OR: [{ completedAt: null }, { completedAt: { gte: range.from } }],
      subtasks: { none: {} },
      ...(scope.projectIds ? { projectId: { in: scope.projectIds } } : {}),
      ...(scope.userIds ? { assigneeUserId: { in: scope.userIds } } : {}),
      ...(scope.accountIds ? { accountId: { in: scope.accountIds } } : {})
    };
    const timeWhere: Prisma.TaskTimeEntryWhereInput = {
      workspaceId,
      ...(scope.projectIds ? { projectId: { in: scope.projectIds } } : {}),
      ...(scope.userIds ? { userId: { in: scope.userIds } } : {}),
      ...(scope.accountIds ? { accountId: { in: scope.accountIds } } : {}),
      ...(filters.billable === "billable" ? { billable: true } : {}),
      ...(filters.billable === "non_billable" ? { billable: false } : {}),
      OR: [
        { startAt: { gte: range.from, lt: range.to } },
        { startAt: null, workDate: { gte: range.from, lt: range.to } }
      ]
    };

    const [departments, teams, users, accounts, projects, projectStatuses, taskStatuses, workTypes] = await Promise.all([
      visibleWorkforceUserIds.length > 0
        ? this.prisma.department.findMany({
            where: { workspaceId, active: true, memberProfiles: { some: effectiveMembershipWhere } },
            select: { id: true, name: true },
            orderBy: { name: "asc" }
          })
        : Promise.resolve([]),
      visibleWorkforceUserIds.length > 0
        ? this.prisma.workspaceTeam.findMany({
            where: { workspaceId, active: true, members: { some: effectiveMembershipWhere } },
            select: { id: true, name: true },
            orderBy: { name: "asc" }
          })
        : Promise.resolve([]),
      scope.policy.userBreakdownAllowed && scope.policy.namedWorkforce && scope.workforceUserIds.length > 0
        ? this.prisma.user.findMany({
            where: { id: { in: scope.workforceUserIds }, status: "ACTIVE", subjectType: "INTERNAL_USER" },
            select: { id: true, displayName: true },
            orderBy: { displayName: "asc" }
          })
        : Promise.resolve([]),
      this.prisma.account.findMany({
        where: {
          workspaceId,
          ...(scope.accountIds ? { id: { in: scope.accountIds } } : {}),
          ...(scope.projectIds ? { projects: { some: { workspaceId, id: { in: scope.projectIds } } } } : {})
        },
        select: { id: true, name: true },
        orderBy: { name: "asc" }
      }),
      this.prisma.project.findMany({
        where: projectWhere,
        select: { id: true, name: true, accountId: true, status: true },
        orderBy: { name: "asc" }
      }),
      this.prisma.project.groupBy({ by: ["status"], where: projectWhere, _count: { _all: true } }),
      this.prisma.projectTask.groupBy({ by: ["status"], where: taskWhere, _count: { _all: true } }),
      this.prisma.taskTimeEntry.groupBy({ by: ["workType"], where: timeWhere, _count: { _all: true } })
    ]);

    return {
      departments: departments.map((row) => ({ id: row.id, label: row.name })),
      teams: teams.map((row) => ({ id: row.id, label: row.name })),
      users: users.map((row) => ({ id: row.id, label: row.displayName })),
      accounts: accounts.map((row) => ({ id: row.id, label: row.name })),
      projects: projects.map((row) => ({ id: row.id, label: row.name, parentId: row.accountId })),
      projectStatuses: projectStatuses.map((row) => ({ id: row.status, label: row.status, count: row._count._all })),
      taskStatuses: taskStatuses.map((row) => ({ id: row.status, label: row.status, count: row._count._all })),
      workTypes: workTypes.map((row) => ({ id: row.workType, label: row.workType, count: row._count._all }))
    };
  }

  private buildMeta(input: {
    range: AnalyticsRange;
    filters: ParsedFilters;
    policy: AnalyticsPolicy;
    scope: ScopeResolution;
    principal: PrincipalContext;
    compareRange?: { from: Date; to: Date };
    suppressedGroups: number;
  }): WorkforceProjectsSummaryMeta {
    const now = new Date().toISOString();
    return {
      generatedAt: now,
      asOf: now,
      range: { from: input.range.from.toISOString(), to: input.range.to.toISOString() },
      compareRange: input.compareRange
        ? { from: input.compareRange.from.toISOString(), to: input.compareRange.to.toISOString() }
        : undefined,
      timezone: input.range.timezone,
      grain: input.range.grain,
      definitionsVersion: ANALYTICS_DEFINITIONS_VERSION,
      rowScope: input.policy.rowScope,
      policy: input.policy.policyLabel,
      hiddenFields: input.policy.hiddenFields,
      freshness: "live",
      warnings: input.scope.warnings,
      suppressedGroups: input.suppressedGroups,
      principal: input.principal.displayName,
      source: "postgresql",
      filters: input.policy.identityDimensionsAllowed
        ? input.filters
        : { ...input.filters, departmentIds: [], teamIds: [], userIds: [] }
    };
  }

  private emptyBreakdownResponse(
    range: AnalyticsRange,
    filters: ParsedFilters,
    policy: AnalyticsPolicy,
    scope: ScopeResolution,
    principal: PrincipalContext,
    by: AnalyticsBreakdownBy,
    warning: string
  ): WorkforceProjectsBreakdownResponse {
    return {
      meta: {
        ...this.buildMeta({ range, filters, policy, scope, principal, suppressedGroups: 0 }),
        warnings: [...scope.warnings, warning],
        by,
        sort: "reviewedApprovedMinutes",
        direction: "desc",
        limit: 0,
        totalRows: 0
      } as WorkforceProjectsBreakdownResponse["meta"],
      rows: [],
      totals: {}
    };
  }
}

/* ── module-private helpers ─────────────────────────────────────────────── */

type PerKeyTaskRaw = {
  key: string;
  eligible: bigint | number;
  completedInRange: bigint | number;
  completedWithDue: bigint | number;
  onTime: bigint | number;
  overdueOpen: bigint | number;
  blocked: bigint | number;
  estimate: bigint | number | null;
};

function mapPerKeyTask(row: PerKeyTaskRaw): PerKeyTaskFacts {
  return {
    key: row.key,
    eligibleLeafTasks: toNumber(row.eligible),
    completedInRange: toNumber(row.completedInRange),
    completedWithDue: toNumber(row.completedWithDue),
    onTimeCompletions: toNumber(row.onTime),
    overdueOpenTasks: toNumber(row.overdueOpen),
    blockedTasks: toNumber(row.blocked),
    estimateMinutes: toNumber(row.estimate)
  };
}

function toNumber(value: bigint | number | null | undefined): number {
  if (value === null || value === undefined) return 0;
  return typeof value === "bigint" ? Number(value) : Number(value);
}

function parseIdList(raw: unknown): string[] {
  if (raw === undefined || raw === null) return [];
  const values = Array.isArray(raw) ? raw : String(raw).split(",");
  const cleaned = values
    .map((value) => String(value).trim())
    .filter((value) => value.length > 0 && value.length <= 128 && /^[\w.:-]+$/.test(value));
  return [...new Set(cleaned)];
}

function isIdentityBreakdown(by: AnalyticsBreakdownBy): boolean {
  return by === "user" || by === "department" || by === "team";
}

function intersectSets<T>(left: Set<T>, right: Set<T>): Set<T> {
  const [smaller, larger] = left.size <= right.size ? [left, right] : [right, left];
  return new Set([...smaller].filter((value) => larger.has(value)));
}

function sumProratedIntervalsAll(intervals: IntervalFact[]): number {
  let total = 0;
  for (const interval of intervals) total += interval.proratedMinutes;
  return total;
}

function sumProratedIntervals(intervals: IntervalFact[], from: Date, to: Date): number {
  let total = 0;
  for (const interval of intervals) {
    total += interval.plannedMinutes * overlapFraction(from, to, interval.startAt, interval.endAt);
  }
  return total;
}

function groupIntervalsByUser(intervals: IntervalFact[]): Map<string, number> {
  const grouped = new Map<string, number>();
  for (const interval of intervals) {
    grouped.set(interval.userId, (grouped.get(interval.userId) ?? 0) + interval.proratedMinutes);
  }
  return grouped;
}

function groupIntervalsByProject(intervals: IntervalFact[]): Map<string, number> {
  const grouped = new Map<string, number>();
  for (const interval of intervals) {
    if (!interval.projectId) continue;
    grouped.set(interval.projectId, (grouped.get(interval.projectId) ?? 0) + interval.proratedMinutes);
  }
  return grouped;
}

function countProjectsTouched(facts: CollectedFacts): number {
  const projects = new Set<string>();
  for (const projectId of facts.timeByProject.keys()) projects.add(projectId);
  for (const projectId of facts.tasks.createdInRangeProjectIds) projects.add(projectId);
  for (const interval of facts.allocationIntervals) {
    if (interval.projectId) projects.add(interval.projectId);
  }
  return projects.size;
}

function pseudoHash(value: string): string {
  let hash = 0;
  for (let i = 0; i < value.length; i += 1) {
    hash = (hash * 31 + value.charCodeAt(i)) >>> 0;
  }
  return hash.toString(36);
}

function emptyFacts(): CollectedFacts {
  return {
    timeStatus: {
      reviewedApprovedMinutes: 0,
      legacyApprovedMinutes: 0,
      submittedMinutes: 0,
      rejectedMinutes: 0,
      reviewedBillableMinutes: 0,
      reviewedReworkMinutes: 0,
      unassignedActualMinutes: 0,
      excludedRows: 0
    },
    timeByDay: [],
    timeByUser: new Map(),
    timeByProject: new Map(),
    tasks: {
      eligibleLeafTasks: 0,
      completedInRange: 0,
      completedWithDue: 0,
      onTimeCompletions: 0,
      cycleDays: [],
      overdueOpenTasks: 0,
      overdueEstimateMinutes: 0,
      blockedTasks: 0,
      estimateMinutes: 0,
      createdInRangeProjectIds: new Set()
    },
    tasksByUser: new Map(),
    tasksByProject: new Map(),
    tasksCompletedByDay: new Map(),
    planningIntervals: [],
    allocationIntervals: [],
    capacity: { totalMinutes: 0, perUser: new Map(), coveredUsers: 0, totalUsers: 0 },
    workTypeVocabulary: []
  };
}
