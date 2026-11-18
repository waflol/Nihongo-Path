import { NextResponse } from "next/server";
import { API_BASE_URL, clientIpHeaders } from "@/lib/api";
import { clearSessionCookie, getSession } from "@/lib/session";

/**
 * DELETE /api/account — permanently delete the signed-in user's own account.
 * Server-side token exchange as in the other gateways. SUPER_ADMIN is refused
 * here as well as in the API (defence in depth). On success the session
 * cookie is cleared so the browser is signed out immediately.
 */
export async function DELETE(request: Request) {
  const session = await getSession();
  if (!session.authenticated || !session.accessToken || !session.user) {
    return NextResponse.json({ message: "Không đăng nhập" }, { status: 401 });
  }
  if (session.user.role === "SUPER_ADMIN") {
    return NextResponse.json(
      { message: "Tài khoản SUPER_ADMIN không thể tự xóa." },
      { status: 403 },
    );
  }

  const upstream = await fetch(`${API_BASE_URL}/users/me`, {
    method: "DELETE",
    headers: {
      ...(await clientIpHeaders()),
      "Content-Type": "application/json",
      Authorization: `Bearer ${session.accessToken}`,
    },
    body: await request.text(),
    cache: "no-store",
  });

  const payload = await upstream.json().catch(() => null);
  if (upstream.ok) await clearSessionCookie();
  return NextResponse.json(payload ?? {}, { status: upstream.status });
}
