import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { API_BASE_URL } from "@/lib/api";
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
  const target = `${API_BASE_URL}/flashcards/${route.join("/")}`;

  const upstream = await fetch(target, {
    method: request.method.toUpperCase() as "GET" | "POST" | "PATCH" | "DELETE",
    headers: {
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
