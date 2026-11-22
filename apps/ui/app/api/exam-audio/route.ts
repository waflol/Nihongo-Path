import { NextResponse } from "next/server";
import { API_BASE_URL, clientIpHeaders } from "@/lib/api";
import { getSession } from "@/lib/session";

/**
 * Admin gateway for listening clips (NP-410):
 *   GET  /api/exam-audio                                  → uploaded clips
 *   POST /api/exam-audio (multipart file, level, label)   → upload
 *   PUT  /api/exam-audio?target=question|stimulus&id=…    → attach / clear (JSON body)
 */
const ID = /^[\w-]{8,40}$/;

async function call(path: string, init: RequestInit) {
  const session = await getSession();
  if (!session.authenticated || !session.accessToken) {
    return NextResponse.json({ error: "Không đăng nhập" }, { status: 401 });
  }
  const headers = new Headers(init.headers);
  headers.set("Authorization", `Bearer ${session.accessToken}`);
  for (const [k, v] of Object.entries(await clientIpHeaders())) headers.set(k, v as string);
  const r = await fetch(`${API_BASE_URL}${path}`, { ...init, headers, cache: "no-store" });
  const t = await r.text();
  let body: unknown = t;
  try {
    body = t ? JSON.parse(t) : null;
  } catch {
    /* keep text */
  }
  return NextResponse.json(body, { status: r.status });
}

export async function GET() {
  return call("/exams/admin/audio", { method: "GET" });
}

export async function POST(request: Request) {
  const bytes = await request.arrayBuffer();
  return call("/exams/admin/audio", {
    method: "POST",
    headers: { "Content-Type": request.headers.get("content-type") ?? "" },
    body: bytes,
  });
}

export async function PUT(request: Request) {
  const q = new URL(request.url).searchParams;
  const target = q.get("target") ?? "";
  const id = q.get("id") ?? "";
  if ((target !== "question" && target !== "stimulus") || !ID.test(id)) {
    return NextResponse.json({ error: "target/id không hợp lệ" }, { status: 400 });
  }
  return call(`/exams/admin/audio/attach/${target}/${id}`, {
    method: "PUT",
    headers: { "Content-Type": "application/json" },
    body: await request.text(),
  });
}
