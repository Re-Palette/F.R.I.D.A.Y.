import NextAuth from "next-auth";
import Google from "next-auth/providers/google";

const allowedEmail = process.env.ALLOWED_EMAIL;

if (!allowedEmail) {
  throw new Error("ALLOWED_EMAIL is not set. FRIDAY is single-user only — see .env.example.");
}

export const { handlers, auth, signIn, signOut } = NextAuth({
  providers: [Google],
  session: { strategy: "jwt" },
  callbacks: {
    async signIn({ user }) {
      return user.email?.toLowerCase() === allowedEmail.toLowerCase();
    },
  },
  pages: {
    signIn: "/login",
  },
});
