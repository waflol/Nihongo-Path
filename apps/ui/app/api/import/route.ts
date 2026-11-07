import { NextResponse } from "next/server";
import { API_BASE_URL, clientIpHeaders } from "@/lib/api";
import { getSession } from "@/lib/session";

/**
 * Gateway for the bulk import surface (P3-IMPORT-02/03/04):
 * `POST /api/import?action=preview` and `POST /api/import?action=confirm`.
 *
 * The wizard sends a `multipart/form-data` body with the `file` part plus
 * the `deckId` / `mapping` / `duplicatePolicy` form fields. The raw body is
 * forwarded untouched (the boundary must survive) with the server-minted
 * access token in `Authorization` — the multipart `Content-Type` header is
 * passed through so upstream multer sees an identical stream.
 */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session.authenticated || !session.accessToken) {
    return NextResponse.json({ error: "Không đăng nhập" }, { status: 401 });
  }

  const url = new URL(request.url);
  const action = url.searchParams.get("action");
  if (action !== "preview" && action !== "confirm" && action !== "job" && action !== "retry") {
    return NextResponse.json(
      { error: "action must be preview|confirm|job|retry" },
      { status: 400 },
    );
  }

  // Read one page of a finished PDF job again (no body).
  if (action === "retry") {
    const job = url.searchParams.get("job") ?? "";
    const page = url.searchParams.get("page") ?? "";
    const pages = url.searchParams.get("pages") ?? "";
    if (!/^[\w-]+$/.test(job) || !(/^\d{1,4}$/.test(page) || /^\d{1,4}(,\d{1,4}){0,299}$/.test(pages))) {
      return NextResponse.json({ error: "job/page không hợp lệ" }, { status: 400 });
    }
    const target = pages ? `jobs/${job}/retry?pages=${pages}` : `jobs/${job}/pages/${page}/retry`;
    const r = await fetch(`${API_BASE_URL}/flashcards/import/${target}`, {
      method: "POST",
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

  const contentType = request.headers.get("content-type") ?? "";
  // Forward the multipart body as bytes. Passing the request STREAM makes
  // Node's fetch throw "duplex option is required" (every upload 500'd); the
  // API caps files at 10 MB (PDF: 50 MB), so buffering is fine.
  const bytes = await request.arrayBuffer();
  const upstream = await fetch(`${API_BASE_URL}/flashcards/import/${action === "job" ? "jobs" : action}`, {
    method: "POST",
    headers: {
      ...(await clientIpHeaders()),
      "Content-Type": contentType,
      Authorization: `Bearer ${session.accessToken}`,
    },
    body: bytes,
    cache: "no-store",
  });

  const text = await upstream.text();
  let payload: unknown = text;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      payload = text;
    }
  }
  return NextResponse.json(payload, { status: upstream.status });
}

/** `DELETE /api/import?job=<id>` → cancel a PDF reading job (stops it, removes it). */
export async function DELETE(request: Request) {
  const session = await getSession();
  if (!session.authenticated || !session.accessToken) {
    return NextResponse.json({ error: "Không đăng nhập" }, { status: 401 });
  }
  const job = new URL(request.url).searchParams.get("job") ?? "";
  if (!/^[\w-]+$/.test(job)) return NextResponse.json({ error: "job không hợp lệ" }, { status: 400 });
  const r = await fetch(`${API_BASE_URL}/flashcards/import/jobs/${job}`, {
    method: "DELETE",
    headers: { ...(await clientIpHeaders()), Authorization: `Bearer ${session.accessToken}` },
    cache: "no-store",
  });
  return new NextResponse(null, { status: r.status });
}

/** `GET /api/import` → my PDF jobs; `GET /api/import?job=<id>` → one job (progress polling). */
export async function GET(request: Request) {
  const session = await getSession();
  if (!session.authenticated || !session.accessToken) {
    return NextResponse.json({ error: "Không đăng nhập" }, { status: 401 });
  }
  const params = new URL(request.url).searchParams;
  const job = params.get("job");
  const page = params.get("page");
  const deck = params.get("deck");
  let path = job ? `jobs/${encodeURIComponent(job)}` : deck ? `decks/${encodeURIComponent(deck)}/review` : "jobs";
  if (job && page && /^\d{1,4}$/.test(page)) {
    path += params.get("kind") === "image" ? `/pages/${page}/image` : `/pages/${page}`;
    if (params.get("kind") === "image") {
      const img = await fetch(`${API_BASE_URL}/flashcards/import/${path}`, {
        headers: { ...(await clientIpHeaders()), Authorization: `Bearer ${session.accessToken}` },
        cache: "no-store",
      });
      return new Response(img.ok ? await img.arrayBuffer() : null, {
        status: img.status,
        headers: img.ok ? { "Content-Type": "image/png", "Cache-Control": "private, max-age=300" } : undefined,
      });
    }
  }
  const upstream = await fetch(`${API_BASE_URL}/flashcards/import/${path}`, {
    headers: {
      ...(await clientIpHeaders()),
      Authorization: `Bearer ${session.accessToken}`,
    },
    cache: "no-store",
  });
  const text = await upstream.text();
  let payload: unknown = text;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    payload = text;
  }
  return NextResponse.json(payload, { status: upstream.status });
}
