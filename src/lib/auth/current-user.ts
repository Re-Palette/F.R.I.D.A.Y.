import { eq } from "drizzle-orm";
import { db } from "@/lib/db/client";
import { users } from "@/lib/db/schema";

/**
 * FRIDAY runs unauthenticated on this deployment (explicit choice — see the
 * removed Google OAuth flow). There is no session to read, so every
 * request resolves to the same single owner row instead of checking one.
 * ALLOWED_EMAIL is kept only as an identity label for that row, not as an
 * access gate — anyone who can reach this deployment's URL can use it as
 * this user.
 */
export async function getCurrentUser() {
  const ownerEmail = (process.env.ALLOWED_EMAIL || "owner@local").toLowerCase();

  const [existing] = await db.select().from(users).where(eq(users.email, ownerEmail)).limit(1);
  if (existing) return existing;

  const [created] = await db.insert(users).values({ email: ownerEmail }).returning();
  return created;
}
