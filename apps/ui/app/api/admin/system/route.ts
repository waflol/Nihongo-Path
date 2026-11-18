import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { API_BASE_URL, clientIpHeaders } from "@/lib/api";
import { getSession } from "@/lib/session";

/** Admin proxy: `/api/admin/system` → API `/admin/system/stats`; `?range=` → `/admin/system/history`. */
export async function GET(request: NextRequest): Promise<NextResponse> {
  const session = await getSession();
  if (!session.authenticated || !session.accessToken) {
    return NextResponse.json({ error: "Không đăng nhập" }, { status: 401 });
  }
  const range = request.nextUrl.searchParams.get("range");
  const path = range ? `/history?range=${encodeURIComponent(range)}` : "/stats";
  const upstream = await fetch(`${API_BASE_URL}/admin/system${path}`, {
    headers: { ...(await clientIpHeaders()), Authorization: `Bearer ${session.accessToken}` },
    cache: "no-store",
  }).catch(() => null);
  if (!upstream) return NextResponse.json({ message: "Không kết nối được API" }, { status: 502 });
  const payload: unknown = await upstream.json().catch(() => null);
  return NextResponse.json(payload, { status: upstream.status });
}
