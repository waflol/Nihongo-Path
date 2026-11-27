import { NextResponse } from "next/server";
import { API_BASE_URL, clientIpHeaders } from "@/lib/api";
import { getSession } from "@/lib/session";

/**
 * A question's picture (NP-407), for the review desk and the sitting. The browser sends only
 * cookies, so the server adds the bearer token. The id is the picture's sha256: it never changes.
 */
export async function GET(_request: Request, ctx: { params: Promise<{ id: string }> }) {
  const { id } = await ctx.params;
  if (!/^[a-f0-9]{64}$/.test(id)) return NextResponse.json({ error: "id không hợp lệ" }, { status: 400 });
  const session = await getSession();
  if (!session.authenticated || !session.accessToken) {
    return NextResponse.json({ error: "Không đăng nhập" }, { status: 401 });
  }
  const r = await fetch(`${API_BASE_URL}/exams/images/${id}`, {
    headers: { ...(await clientIpHeaders()), Authorization: `Bearer ${session.accessToken}` },
    cache: "no-store",
  });
  if (!r.ok) return NextResponse.json({ error: "Không có hình" }, { status: r.status });
  return new Response(r.body, {
    headers: { "Content-Type": "image/png", "Cache-Control": "private, max-age=31536000, immutable" },
  });
}
