import { Body, Controller, Get, Headers, Inject, Param, Patch, Post } from "@nestjs/common";
import { nonEmptyString } from "../../shared/http/request-context";
import { PrincipalService } from "./principal.service";
import { AuthService } from "./auth.service";

@Controller("auth")
export class SessionController {
  constructor(@Inject(PrincipalService) private readonly principals: PrincipalService, @Inject(AuthService) private readonly auth: AuthService) {}

  @Get("workspace/users")
  directory(@Headers("authorization") authorization?: string) { return this.auth.listWorkspaceUsers(authorization); }

  @Get("sessions")
  sessions(@Headers("authorization") authorization?: string) { return this.principals.listSessions(authorization); }

  @Post("sessions/revoke-others")
  revokeOthers(@Headers("authorization") authorization?: string) { return this.principals.revokeOwnSession(authorization, undefined, true); }

  @Post("sessions/:id/revoke")
  revoke(@Headers("authorization") authorization: string | undefined, @Param("id") id: string) { return this.principals.revokeOwnSession(authorization, id); }

  @Get("workspaces")
  workspaces(@Headers("authorization") authorization?: string) { return this.principals.listOwnWorkspaces(authorization); }

  @Post("workspaces/switch")
  switchWorkspace(@Headers("authorization") authorization: string | undefined, @Body() body: { workspaceId?: string }) {
    return this.principals.switchWorkspace(authorization, nonEmptyString(body?.workspaceId, "workspaceId"));
  }

  @Post("admin/users/:id/reactivate")
  reactivate(@Headers("authorization") authorization: string | undefined, @Param("id") id: string) { return this.auth.reactivateUser(authorization, id); }

  @Patch("admin/users/:id/role")
  changeRole(@Headers("authorization") authorization: string | undefined, @Param("id") id: string, @Body() body: { roleCode?: string }) {
    return this.auth.changeUserRole(authorization, id, nonEmptyString(body?.roleCode, "roleCode"));
  }
}
