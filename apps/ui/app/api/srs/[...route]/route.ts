import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { API_BASE_URL, clientIpHeaders } from "@/lib/api";
import { getSession } from "@/lib/session";

/**
 * Gateway for the SRS surface (P3-SRS-04/05): `/api/srs/queue/:deckId`,
 * `/api/srs/reviews`, `/api/srs/decks-progress`. Server-side token exchange
 * as in the other learner gateways (P2-UI-05).
 *
 * The `tz` query on queue/review is passed through untouched — the API
 * falls back to the profile timezone when it is absent.
 */
async function forward(request: NextRequest, route: string[]): Promise<NextResponse> {
  const session = await getSession();
  if (!session.authenticated || !session.accessToken) {
    return NextResponse.json({ error: "Không đăng nhập" }, { status: 401 });
  }

  const hasBody = request.method !== "GET" && request.method !== "DELETE";
  const url = new URL(request.url);
  const target = `${API_BASE_URL}/srs/${route.join("/")}${url.search}`;

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

  // 204/205/304 must not carry a body; NextResponse.json("") throws on them.
  if (upstream.status === 204 || upstream.status === 205 || upstream.status === 304) {
    return new NextResponse(null, { status: upstream.status });
  }

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
