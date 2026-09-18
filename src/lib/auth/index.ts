import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

// IMPORTANT: never validate required env vars at module scope here. Next.js
// imports every route module (and its transitive imports) during `next
// build`'s "Collecting page data" step to statically analyze routes — this
// runs on the build machine, before any real request exists and often
// before all runtime secrets are configured there. A throw at import time
// crashes the *entire build*, not just requests that need the missing var.
//
// The single-user gate is enforced instead inside the signIn callback
// below, which only runs against a real sign-in attempt at request time —
// and fails closed (denies everyone) if ALLOWED_EMAIL isn't configured,
// so a missing env var can never accidentally open access to anyone.
export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  session: { strategy: "jwt" },
  callbacks: {
    async signIn({ user }) {
      const allowedEmail = process.env.ALLOWED_EMAIL;
      if (!allowedEmail) {
        console.error(
          "ALLOWED_EMAIL is not set — denying sign-in. FRIDAY is single-user only; see .env.example."
        );
        return false;
      }
      return user.email?.toLowerCase() === allowedEmail.toLowerCase();
    },
  },
  pages: {
    signIn: "/login",
  },
});
