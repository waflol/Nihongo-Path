import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { API_BASE_URL, clientIpHeaders } from "@/lib/api";
import { getSession } from "@/lib/session";

/**
 * Learner feedback gateway (P5-FEEDBACK-01): `/api/feedback` → API `/feedback`
 * (POST a general feedback) and `/api/feedback/me` → GET my own threads.
 * Authenticated learners only — admins use `/api/admin/feedback`.
 */
async function forward(request: NextRequest, route: string[]): Promise<NextResponse> {
  const session = await getSession();
  if (!session.authenticated || !session.accessToken) {
    return NextResponse.json({ error: "Không đăng nhập" }, { status: 401 });
  }
  // Allow at most one segment and only the learner self-service verb.
  const seg = route[0];
  const allowed = seg === undefined || seg === "me";
  if (!allowed || (route.length > 1 && request.method !== "GET")) {
    return NextResponse.json({ error: "Không hợp lệ" }, { status: 400 });
  }
  const target = `${API_BASE_URL}/feedback${seg ? `/${encodeURIComponent(seg)}` : ""}${request.nextUrl.search}`;
  const method = request.method.toUpperCase();
  const hasBody = method === "POST" || method === "PATCH";
  const upstream = await fetch(target, {
    method: method as "GET" | "POST",
    headers: {
      ...(await clientIpHeaders()),
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.accessToken}`,
    },
    body: hasBody ? await request.text() : undefined,
    cache: "no-store",
  });
  const text = await upstream.text();
  let payload: unknown = text;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      // non-JSON — pass through
    }
  }
  return NextResponse.json(payload, { status: upstream.status });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ route?: string[] }> },
) {
  const { route = [] } = await params;
  return forward(request, route);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ route?: string[] }> },
) {
  const { route = [] } = await params;
  return forward(request, route);
}
