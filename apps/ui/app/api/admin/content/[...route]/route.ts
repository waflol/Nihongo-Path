import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { API_BASE_URL, clientIpHeaders } from "@/lib/api";
import { getSession } from "@/lib/session";

async function forward(
  request: NextRequest,
  route: string[],
): Promise<NextResponse> {
  const session = await getSession();
  if (!session.authenticated || !session.accessToken) {
    return NextResponse.json({ error: "Không đăng nhập" }, { status: 401 });
  }

  const target = `${API_BASE_URL}/admin/content/${route.join("/")}`;
  const method = request.method.toUpperCase();
  const hasBody = method !== "GET" && method !== "DELETE";

  const upstream = await fetch(target, {
    method: method as "GET" | "POST" | "PATCH" | "DELETE",
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

  // Preserve the API's status + body (incl. 403 role, 404, 429 rate-limit).
  const text = await upstream.text();
  let payload: unknown = text;
  if (text) {
    try {
      payload = JSON.parse(text);
    } catch {
      // non-JSON body (rare) — pass through as a string.
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
