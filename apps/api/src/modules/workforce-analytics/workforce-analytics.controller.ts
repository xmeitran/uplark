import { Controller, Get, Headers, Inject, NotFoundException, Query } from "@nestjs/common";
import { PrincipalService } from "../identity-access/principal.service";
import { WorkforceAnalyticsService } from "./workforce-analytics.service";

@Controller()
export class WorkforceAnalyticsController {
  constructor(
    @Inject(PrincipalService)
    private readonly principals: PrincipalService,
    @Inject(WorkforceAnalyticsService)
    private readonly analytics: WorkforceAnalyticsService
  ) {}

  @Get("analytics/workforce-projects/summary")
  async summary(@Headers("authorization") authorization: string | undefined, @Query() query: any) {
    this.assertApiEnabled();
    const principal = await this.principals.resolveFromAuthorization(authorization, query.principal);
    return this.analytics.summary(query, principal);
  }

  @Get("analytics/workforce-projects/breakdown")
  async breakdown(@Headers("authorization") authorization: string | undefined, @Query() query: any) {
    this.assertApiEnabled();
    const principal = await this.principals.resolveFromAuthorization(authorization, query.principal);
    return this.analytics.breakdown(query, principal);
  }

  @Get("analytics/workforce-projects/export")
  async export(@Headers("authorization") authorization: string | undefined, @Query() query: any) {
    this.assertApiEnabled();
    const principal = await this.principals.resolveFromAuthorization(authorization, query.principal);
    return this.analytics.export(query, principal);
  }

  private assertApiEnabled() {
    if (!isWorkforceAnalyticsApiEnabled()) {
      throw new NotFoundException("Workforce analytics is not available");
    }
  }
}

export function isWorkforceAnalyticsApiEnabled({
  enabled = process.env.WORKFORCE_ANALYTICS_GA_ENABLED,
  nodeEnv = process.env.NODE_ENV
}: {
  enabled?: string;
  nodeEnv?: string;
} = {}): boolean {
  if (enabled === "true" || enabled === "1") return true;
  if (enabled === "false" || enabled === "0") return false;
  return nodeEnv === "development" || nodeEnv === "test";
}
