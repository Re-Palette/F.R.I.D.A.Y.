import { redirect } from "next/navigation";
import { isPasscodeEnabled } from "@/lib/auth/passcode";
import { UnlockForm } from "@/components/UnlockForm";

export const dynamic = "force-dynamic";

export default function UnlockPage() {
  // Nothing to unlock when no passcode is configured — don't show a lock
  // screen that would accept anything.
  if (!isPasscodeEnabled()) redirect("/");
  return <UnlockForm />;
}
