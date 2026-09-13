import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import type { PrincipalContext } from "@b2b-crm/contracts";
import { buildCrmApiEndpoint, CRM_SESSION_COOKIE_NAME } from "../../../../src/lib/crm-bff-proxy";
import { clearCrmSessionCookies } from "../../../../src/lib/session-cookie";

export const dynamic = "force-dynamic";

export async function GET() {
  const cookieStore = await cookies();
  const sessionToken = cookieStore.get(CRM_SESSION_COOKIE_NAME)?.value;

  if (process.env.NODE_ENV !== "production" && process.env.CRM_LOCAL_DEMO_BYPASS === "true" && (!sessionToken || sessionToken === "local-founder-dev-session")) {
    return NextResponse.json({
      subjectId: "usr-kha-founder",
      displayName: "Founder (Local Pilot)",
      email: "founder@local.test",
      roleCodes: ["founder", "dx_director", "bd_lead", "pm"]
    });
  }

  if (!sessionToken) {
    return NextResponse.json({ message: "Bearer session is required" }, { status: 401 });
  }

  const response = await fetch(buildCrmApiEndpoint("/auth/me"), {
    cache: "no-store",
    headers: {
      authorization: `Bearer ${sessionToken}`
    }
  });
  const body = (await response.json().catch(() => ({ message: "Unable to read auth session" }))) as
    | PrincipalContext
    | { message?: string };
  const nextResponse = NextResponse.json(body, { status: response.status });

  if (response.status === 401) {
    clearCrmSessionCookies(nextResponse);
  }

  return nextResponse;
}
