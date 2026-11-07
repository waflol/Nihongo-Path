import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { API_BASE_URL, clientIpHeaders } from "@/lib/api";

/** Public read-only gateway for `/kanji` (plan-kanji §5.3) — no token needed. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ route?: string[] }> },
) {
  const { route = [] } = await params;
  const url = new URL(request.url);
  const upstream = await fetch(
    `${API_BASE_URL}/kanji${route.map((s) => "/" + encodeURIComponent(s)).join("")}${url.search}`,
    { headers: await clientIpHeaders(), cache: "no-store" },
  );
  const text = await upstream.text();
  let payload: unknown = text;
  try {
    payload = JSON.parse(text);
  } catch {
    // non-JSON body — pass through.
  }
  return NextResponse.json(payload, { status: upstream.status });
}
