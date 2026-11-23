import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { API_BASE_URL, clientIpHeaders } from "@/lib/api";
import { getSession } from "@/lib/session";

/**
 * Learner entitlements proxy (P5-QUOTA): `/api/entitlements/me/remaining/:key`
 * → API `/entitlements/me/remaining/:key`. The token is exchanged
 * server-side; the browser only ever sees "X lượt còn trong kỳ này".
 */
async function forward(
  request: NextRequest,
  { params }: { params: Promise<{ route?: string[] }> },
): Promise<NextResponse> {
  const session = await getSession();
  if (!session.authenticated || !session.accessToken) {
    return NextResponse.json({ error: "Không đăng nhập" }, { status: 401 });
  }
  const { route = [] } = await params;
  const upstream = await fetch(
    `${API_BASE_URL}/entitlements/${route.map((s) => encodeURIComponent(s)).join("/")}${request.nextUrl.search}`,
    {
      method: request.method.toUpperCase(),
      headers: { ...(await clientIpHeaders()), Authorization: `Bearer ${session.accessToken}` },
      cache: "no-store",
    },
  );
  const text = await upstream.text();
  let payload: unknown = text;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    // pass through non-JSON
  }
  return NextResponse.json(payload, { status: upstream.status });
}

export const GET = forward;
