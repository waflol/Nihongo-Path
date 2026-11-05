import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { API_BASE_URL, clientIpHeaders } from "@/lib/api";
import { getSession } from "@/lib/session";

/**
 * Gateway for the learner's flashcard surface (P3-CARD-03/04) — mirrors the
 * admin-content proxy: the access token is exchanged server-side from the
 * httpOnly refresh cookie and never handed to the browser (P2-UI-05).
 *
 * Serves: `/api/flashcards/decks`, `/api/flashcards/decks/:id`,
 * `/api/flashcards/cards`, `/api/flashcards/save-vocabulary/:id`,
 * `/api/flashcards/save-grammar/:id`. The multipart import surface lives in
 * the static `../import` route (Next prefers it over this catch-all).
 */
async function forward(request: NextRequest, route: string[]): Promise<NextResponse> {
  const session = await getSession();
  if (!session.authenticated || !session.accessToken) {
    return NextResponse.json({ error: "Không đăng nhập" }, { status: 401 });
  }

  const hasBody = request.method !== "GET" && request.method !== "DELETE";
  const url = new URL(request.url);
  const target = `${API_BASE_URL}/flashcards/${route.join("/")}${url.search}`;

  const upstream = await fetch(target, {
    method: request.method.toUpperCase() as "GET" | "POST" | "PATCH" | "DELETE",
    headers: {
      ...(await clientIpHeaders()),
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.accessToken}`,
    },
    body: hasBody ? await request.text() : undefined,
    cache: "no-store",
  });

  // 204/205/304 must not carry a body — `NextResponse.json("", {status: 204})`
  // throws, which turned every successful DELETE into a failure in the UI.
  if (upstream.status === 204 || upstream.status === 205 || upstream.status === 304) {
    return new NextResponse(null, { status: upstream.status });
  }

  // CSV export: hand the file through untouched (BOM + attachment headers).
  const type = upstream.headers.get("content-type") ?? "";
  if (type.startsWith("text/csv")) {
    // Bytes, not text(): decoding to a string would drop the UTF-8 BOM Excel needs.
    return new NextResponse(await upstream.arrayBuffer(), {
      status: upstream.status,
      headers: {
        "Content-Type": type,
        "Content-Disposition": upstream.headers.get("content-disposition") ?? "attachment",
        "Cache-Control": "no-store",
      },
    });
  }

  const text = await upstream.text();
  let payload: unknown = text;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      // non-JSON body — pass through as a string.
    }
  }
  return NextResponse.json(payload, { status: upstream.status });
}

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ route: string[] }> },
) {
  const { route } = await params;
  return forward(request, route);
}

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ route: string[] }> },
) {
  const { route } = await params;
  return forward(request, route);
}

export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ route: string[] }> },
) {
  const { route } = await params;
  return forward(request, route);
}

export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ route: string[] }> },
) {
  const { route } = await params;
  return forward(request, route);
}
