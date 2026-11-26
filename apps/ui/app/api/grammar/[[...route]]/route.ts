import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { API_BASE_URL, clientIpHeaders } from "@/lib/api";

/** Public grammar gateway; keeps the backend URL server-side. */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ route?: string[] }> },
) {
  const { route = [] } = await params;
  const url = new URL(request.url);
  const path = route.map((part) => `/${encodeURIComponent(part)}`).join("");
  const upstream = await fetch(`${API_BASE_URL}/content/grammar${path}${url.search}`, {
    headers: await clientIpHeaders(),
    cache: "no-store",
  });
  const text = await upstream.text();
  let payload: unknown = text;
  try { payload = JSON.parse(text); } catch { /* preserve non-JSON error */ }
  return NextResponse.json(payload, { status: upstream.status });
}
