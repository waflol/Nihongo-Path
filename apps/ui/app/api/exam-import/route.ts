import { NextResponse } from "next/server";
import { API_BASE_URL, clientIpHeaders } from "@/lib/api";
import { getSession } from "@/lib/session";

/**
 * Gateway for the exam-PDF import jobs (NP-407), used by the global tracker:
 *   GET  /api/exam-import             → my recent jobs
 *   GET  /api/exam-import?log=<id>    → one job's event log
 *   POST /api/exam-import?cancel=<id> → stop a running job
 *   POST /api/exam-import?remove=<id> → delete a job with its drafts
 *   GET  /api/exam-import?drafts=<jobId>[&status=] → the job's review drafts
 *   POST /api/exam-import?publish=<draftId> {answers} / ?discard=<draftId>
 *   GET  /api/exam-import?page=<jobId>&n=<page> → the source page as a PNG
 *   POST /api/exam-import?update=<draftId> {stimuli, questions, answers} → hand edits
 * The access token stays server-side (same pattern as /api/import).
 */
const ID = /^[\w-]{8,40}$/;

async function forward(path: string, method: "GET" | "POST", json?: string) {
  const session = await getSession();
  if (!session.authenticated || !session.accessToken) {
    return NextResponse.json({ error: "Không đăng nhập" }, { status: 401 });
  }
  const r = await fetch(`${API_BASE_URL}/exams/admin/import${path}`, {
    method,
    headers: {
      ...(await clientIpHeaders()),
      Authorization: `Bearer ${session.accessToken}`,
      ...(json !== undefined ? { "Content-Type": "application/json" } : {}),
    },
    body: json,
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
  const pageJob = new URL(request.url).searchParams.get("page");
  if (pageJob) {
    const n = Number(new URL(request.url).searchParams.get("n"));
    if (!/^[a-f0-9]{24}$/i.test(pageJob) || !Number.isInteger(n) || n < 1 || n > 2000) {
      return NextResponse.json({ error: "tham số không hợp lệ" }, { status: 400 });
    }
    const session = await getSession();
    if (!session.authenticated || !session.accessToken) {
      return NextResponse.json({ error: "Không đăng nhập" }, { status: 401 });
    }
    const r = await fetch(`${API_BASE_URL}/exams/admin/import/${pageJob}/pages/${n}`, {
      headers: { ...(await clientIpHeaders()), Authorization: `Bearer ${session.accessToken}` },
      cache: "no-store",
    });
    if (!r.ok) return NextResponse.json({ error: "Không có ảnh trang" }, { status: r.status });
    return new Response(await r.arrayBuffer(), {
      headers: { "Content-Type": "image/png", "Cache-Control": "private, max-age=3600" },
    });
  }
  const log = new URL(request.url).searchParams.get("log");
  if (log) {
    if (!ID.test(log)) return NextResponse.json({ error: "id không hợp lệ" }, { status: 400 });
    return forward(`/${log}/log`, "GET");
  }
  const drafts = new URL(request.url).searchParams.get("drafts");
  if (drafts) {
    if (!ID.test(drafts)) return NextResponse.json({ error: "id không hợp lệ" }, { status: 400 });
    const status = new URL(request.url).searchParams.get("status");
    const q = new URLSearchParams({ jobId: drafts });
    if (status && /^[a-z_]{3,20}$/.test(status)) q.set("status", status);
    return forward(`/drafts?${q}`, "GET");
  }
  return forward("", "GET");
}

export async function POST(request: Request) {
  const cancel = new URL(request.url).searchParams.get("cancel");
  if (cancel) {
    if (!ID.test(cancel)) return NextResponse.json({ error: "id không hợp lệ" }, { status: 400 });
    return forward(`/${cancel}/cancel`, "POST");
  }
  const remove = new URL(request.url).searchParams.get("remove");
  if (remove) {
    if (!/^[a-f0-9]{24}$/i.test(remove)) return NextResponse.json({ error: "id không hợp lệ" }, { status: 400 });
    return forward(`/${remove}/delete`, "POST", "{}");
  }
  const sp = new URL(request.url).searchParams;
  for (const action of ["publish", "discard", "update"] as const) {
    const id = sp.get(action);
    if (!id) continue;
    if (!ID.test(id)) return NextResponse.json({ error: "id không hợp lệ" }, { status: 400 });
    return forward(`/drafts/${id}/${action}`, "POST", action === "discard" ? "{}" : await request.text());
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
