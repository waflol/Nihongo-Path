import { Suspense } from "react";
import { redirectIfAuthenticated } from "@/lib/auth-redirect";

/**
 * Signed-in visitors are sent on to `?from=` or their home area. The session
 * lookup reads cookies (runtime data), so it lives in its own Suspense
 * boundary: the form around it stays in the static shell and the redirect
 * streams in after it.
 */
async function Guard({
  searchParams,
  admin,
}: {
  searchParams: Promise<{ from?: string | string[] }>;
  admin?: boolean;
}) {
  await redirectIfAuthenticated(searchParams, { admin });
  return null;
}

export function RedirectIfAuthenticated(props: {
  searchParams: Promise<{ from?: string | string[] }>;
  admin?: boolean;
}) {
  return (
    <Suspense fallback={null}>
      <Guard {...props} />
    </Suspense>
  );
}
