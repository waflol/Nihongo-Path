import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { API_BASE_URL, clientIpHeaders } from "@/lib/api";
import { getSession } from "@/lib/session";

async function auth() {
  const session = await getSession();
  return session.authenticated && session.accessToken ? session.accessToken : null;
}

/** `GET` → backup groups with counts. */
export async function GET() {
  const token = await auth();
  if (!token) return NextResponse.json({ error: "Không đăng nhập" }, { status: 401 });
  const upstream = await fetch(`${API_BASE_URL}/admin/backup/groups`, {
    headers: { ...(await clientIpHeaders()), Authorization: `Bearer ${token}` },
    cache: "no-store",
  });
  return NextResponse.json(await upstream.json().catch(() => null), { status: upstream.status });
}

/** `POST { groups }` → the gzip'd backup, streamed through untouched. */
export async function POST(request: NextRequest) {
  const token = await auth();
  if (!token) return NextResponse.json({ error: "Không đăng nhập" }, { status: 401 });
  const upstream = await fetch(`${API_BASE_URL}/admin/backup`, {
    method: "POST",
    headers: {
      ...(await clientIpHeaders()),
      Authorization: `Bearer ${token}`,
      "Content-Type": "application/json",
    },
    body: await request.text(),
    cache: "no-store",
  });
  if (!upstream.ok || !upstream.body) {
    return NextResponse.json(await upstream.json().catch(() => null), { status: upstream.status });
  }
  return new NextResponse(upstream.body, {
    headers: {
      "Content-Type": "application/gzip",
      "Content-Disposition": upstream.headers.get("content-disposition") ?? "attachment",
      "Cache-Control": "no-store",
    },
  });
}
