import { proxyCrmBffJson, readJsonBody, requireCrmSessionForBffWrite } from "../../../../src/lib/crm-bff-proxy";

export const dynamic = "force-dynamic";

export async function GET(request: Request) {
  const gate = await requireCrmSessionForBffWrite();
  if (!gate.ok) return gate.response;

  return proxyCrmBffJson({
    request,
    path: "/auth/admin/users"
  });
}

export async function POST(request: Request) {
  return proxyCrmBffJson({
    request,
    path: "/auth/admin/users",
    method: "POST",
    body: await readJsonBody(request)
  });
}
