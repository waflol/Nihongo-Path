import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { API_BASE_URL, clientIpHeaders } from "@/lib/api";
import { getSession } from "@/lib/session";

/**
 * Admin-only proxy to the API's `/admin/logs*`. `?view=` picks the sub-route
 * (summary | app | traffic | blocked | protection | whoami | simulate | allowed | audit | export); `DELETE ?ip=` lifts a block.
 */
const VIEWS = new Set(["summary", "app", "traffic", "blocked", "protection", "whoami", "simulate", "allowed", "audit", "export"]);

async function forward(request: NextRequest): Promise<NextResponse> {
  const session = await getSession();
  if (!session.authenticated || !session.accessToken) {
    return NextResponse.json({ error: "Không đăng nhập" }, { status: 401 });
  }
  const params = new URLSearchParams(request.nextUrl.searchParams);
  const view = params.get("view") ?? "";
  const ip = params.get("ip");
  params.delete("view");
  params.delete("ip");
  const qs = params.toString();
  const method = request.method.toUpperCase();

  let path = "";
  if (view) {
    if (!VIEWS.has(view)) return NextResponse.json({ error: "Bad view" }, { status: 400 });
    path = `/${view}`;
    if (method === "DELETE") {
      if ((view !== "blocked" && view !== "allowed") || !ip) return NextResponse.json({ error: "Bad request" }, { status: 400 });
      path += `/${encodeURIComponent(ip)}`;
    }
  }

  const upstream = await fetch(`${API_BASE_URL}/admin/logs${path}${qs && method === "GET" ? `?${qs}` : ""}`, {
    method,
    headers: {
      ...(await clientIpHeaders()),
      Authorization: `Bearer ${session.accessToken}`,
      ...(method === "POST" ? { "Content-Type": "application/json" } : {}),
    },
    body: method === "POST" ? await request.text() : undefined,
    cache: "no-store",
  });
  const text = await upstream.text();
  if (view === "export" && upstream.ok) {
    return new NextResponse(text, {
      headers: {
        "Content-Type": "text/csv; charset=utf-8",
        "Content-Disposition": upstream.headers.get("content-disposition") ?? "attachment",
      },
    });
  }
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
export const DELETE = forward;
