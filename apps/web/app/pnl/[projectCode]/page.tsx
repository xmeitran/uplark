import { PnlWorkbench } from "@/components/pilot/pnl-workbench";

export const dynamic = "force-dynamic";
export const revalidate = 0;

export default async function PnlProjectDetailPage({
  params,
}: {
  params: Promise<{ projectCode: string }>;
}) {
  const { projectCode } = await params;
  return <PnlWorkbench detailProjectCode={decodeURIComponent(projectCode)} />;
}
