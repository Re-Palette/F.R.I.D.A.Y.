import { getCurrentUser } from "@/lib/auth/current-user";
import { listPendingApprovals } from "@/lib/agents/approvals";
import { ApprovalQueue } from "@/components/ApprovalQueue";

export const dynamic = "force-dynamic";

export default async function ApprovalsPage() {
  const user = await getCurrentUser();
  return <ApprovalQueue initial={await listPendingApprovals(user.id)} />;
}
