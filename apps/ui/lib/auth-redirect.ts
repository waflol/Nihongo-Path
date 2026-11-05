import { redirect } from "next/navigation";
import { getSession } from "./session";
import { isSafeFrom } from "./safe-path";

/**
 * Server-side guard for the auth pages (`/login`, `/register`, `/admin/login`):
 * a signed-in visitor has nothing to do there, so send them on to `?from=`
 * (when safe) or their home area instead of showing the form again.
 */
export async function redirectIfAuthenticated(
  searchParams: Promise<{ from?: string | string[] }>,
  opts: { admin?: boolean } = {},
): Promise<void> {
  const session = await getSession();
  if (!session.authenticated || !session.user) return;
  const raw = (await searchParams).from;
  const value = Array.isArray(raw) ? raw[0] : raw;
  const from = isSafeFrom(value) ? value : null;
  const isAdmin = session.user.role === "ADMIN" || session.user.role === "SUPER_ADMIN";
  const home = opts.admin && isAdmin ? "/admin" : "/learn";
  redirect(from ?? home);
}
