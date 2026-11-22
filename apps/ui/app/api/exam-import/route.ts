import { NextResponse } from "next/server";
import { API_BASE_URL, clientIpHeaders } from "@/lib/api";
import { getSession } from "@/lib/session";

/**
 * Gateway for the exam-PDF import jobs (NP-407), used by the global tracker:
 *   GET  /api/exam-import             → my recent jobs
 *   GET  /api/exam-import?log=<id>    → one job's event log
 *   POST /api/exam-import?cancel=<id> → stop a running job
 * The access token stays server-side (same pattern as /api/import).
 */
const ID = /^[\w-]{8,40}$/;

async function forward(path: string, method: "GET" | "POST") {
  const session = await getSession();
  if (!session.authenticated || !session.accessToken) {
    return NextResponse.json({ error: "Không đăng nhập" }, { status: 401 });
  }
  const r = await fetch(`${API_BASE_URL}/exams/admin/import${path}`, {
    method,
    headers: { ...(await clientIpHeaders()), Authorization: `Bearer ${session.accessToken}` },
    cache: "no-store",
  });
  const t = await r.text();
  let body: unknown = t;
  try {
    body = t ? JSON.parse(t) : null;
  } catch {
    /* keep text */
  }
  return NextResponse.json(body, { status: r.status });
}

export async function GET(request: Request) {
  const log = new URL(request.url).searchParams.get("log");
  if (log) {
    if (!ID.test(log)) return NextResponse.json({ error: "id không hợp lệ" }, { status: 400 });
    return forward(`/${log}/log`, "GET");
  }
  return forward("", "GET");
}

export async function POST(request: Request) {
  const cancel = new URL(request.url).searchParams.get("cancel");
  if (cancel) {
    if (!ID.test(cancel)) return NextResponse.json({ error: "id không hợp lệ" }, { status: 400 });
    return forward(`/${cancel}/cancel`, "POST");
  }
  // Upload: forward the multipart body as bytes (a stream needs `duplex`).
  const session = await getSession();
  if (!session.authenticated || !session.accessToken) {
    return NextResponse.json({ error: "Không đăng nhập" }, { status: 401 });
  }
  const bytes = await request.arrayBuffer();
  const r = await fetch(`${API_BASE_URL}/exams/admin/import`, {
    method: "POST",
    headers: {
      ...(await clientIpHeaders()),
      Authorization: `Bearer ${session.accessToken}`,
      "Content-Type": request.headers.get("content-type") ?? "",
    },
    body: bytes,
    cache: "no-store",
  });
  const t = await r.text();
  let body: unknown = t;
  try {
    body = t ? JSON.parse(t) : null;
  } catch {
    /* keep text */
  }
  return NextResponse.json(body, { status: r.status });
}
