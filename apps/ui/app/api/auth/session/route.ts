import { NextResponse } from "next/server";
import { getSession } from "@/lib/session";

/**
 * GET /api/auth/session
 *
 * Tells the client whether a session cookie is present and, if so, the
 * caller's identity. This is what the header / account menu call to render
 * the logged-in state. The actual verification happens in `getSession()`
 * against the API's `/auth/verify`.
 */
export async function GET() {
  const session = await getSession();
  return NextResponse.json({
    authenticated: session.authenticated,
    user: session.user,
  });
}
