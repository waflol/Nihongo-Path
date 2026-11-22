import { NextResponse } from "next/server";
import { API_BASE_URL, clientIpHeaders } from "@/lib/api";
import { getSession } from "@/lib/session";

/**
 * Streams a listening clip to the sitting's `<audio>` (NP-410). The browser
 * sends only cookies, so the server adds the bearer token; `Range` is passed
 * through so seeking / the `#t=start,end` stretch work.
 */
export async function GET(request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^[\w-]{8,40}$/.test(id)) return NextResponse.json({ error: "id không hợp lệ" }, { status: 400 });
  const session = await getSession();
  if (!session.authenticated || !session.accessToken) {
    return NextResponse.json({ error: "Không đăng nhập" }, { status: 401 });
  }
  const headers: Record<string, string> = { ...(await clientIpHeaders()), Authorization: `Bearer ${session.accessToken}` };
  const range = request.headers.get("range");
  if (range) headers.Range = range;
  const r = await fetch(`${API_BASE_URL}/exams/audio/${id}`, { headers, cache: "no-store" });
  const out = new Headers();
  for (const h of ["content-type", "content-length", "content-range", "accept-ranges", "cache-control", "etag", "last-modified"]) {
    const v = r.headers.get(h);
    if (v) out.set(h, v);
  }
  return new Response(r.body, { status: r.status, headers: out });
}
