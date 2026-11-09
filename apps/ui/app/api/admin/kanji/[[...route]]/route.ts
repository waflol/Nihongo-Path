import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { API_BASE_URL, clientIpHeaders } from "@/lib/api";
import { getSession } from "@/lib/session";

/** Admin proxy: `/api/admin/kanji[/...]` → API `/admin/kanji[/...]` (plan-kanji §5.3). */
async function forward(
  request: NextRequest,
  { params }: { params: Promise<{ route?: string[] }> },
): Promise<NextResponse> {
  const session = await getSession();
  if (!session.authenticated || !session.accessToken) {
    return NextResponse.json({ error: "Không đăng nhập" }, { status: 401 });
  }
  const { route = [] } = await params;
  const method = request.method.toUpperCase();
  const hasBody = method === "PATCH" || method === "POST";
  const upstream = await fetch(
    `${API_BASE_URL}/admin/kanji${route.map((s) => `/${encodeURIComponent(s)}`).join("")}${request.nextUrl.search}`,
    {
      method,
      headers: {
        ...(await clientIpHeaders()),
        Authorization: `Bearer ${session.accessToken}`,
        ...(hasBody ? { "Content-Type": "application/json" } : {}),
      },
      body: hasBody ? await request.text() : undefined,
      cache: "no-store",
    },
  );
  if (upstream.status === 204 || upstream.status === 205 || upstream.status === 304) {
    return new NextResponse(null, { status: upstream.status });
  }
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
export const POST = forward;
export const PATCH = forward;
export const DELETE = forward;
