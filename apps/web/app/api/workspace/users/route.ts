import { proxyCrmBffJson, requireCrmSessionForBffWrite } from "@/lib/crm-bff-proxy";
export const dynamic = "force-dynamic";
/** Minimal authenticated member directory for assignment pickers. */
export async function GET(request: Request) {
  const gate = await requireCrmSessionForBffWrite();
  if (!gate.ok) return gate.response;
  return proxyCrmBffJson({ request, path: "/auth/workspace/users" });
}
