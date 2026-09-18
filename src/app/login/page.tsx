import { signIn } from "@/lib/auth";
import { MinimalButton } from "@/components/ui/MinimalButton";

export default function LoginPage() {
  return (
    <div className="flex flex-1 flex-col items-center justify-center gap-8 px-6">
      <div className="flex flex-col items-center gap-2 text-center">
        <span className="text-xs uppercase tracking-[var(--tracking-wider)] text-fg-muted">
          Personal Intelligence Operating System
        </span>
        <h1 className="text-2xl font-light tracking-[var(--tracking-wide)]">F.R.I.D.A.Y.</h1>
      </div>
      <form
        action={async () => {
          "use server";
          await signIn("google", { redirectTo: "/" });
        }}
      >
        <MinimalButton type="submit" variant="accent">
          Sign in with Google
        </MinimalButton>
      </form>
    </div>
  );
}
