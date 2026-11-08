import { NextResponse } from "next/server";
import { apiFetch, ApiError } from "@/lib/api";
import { clearSessionCookie, setSessionCookie } from "@/lib/session";

interface RegisterResult {
  user: {
    id: string;
    email: string | null;
    displayName: string | null;
    role: string;
    lang: string;
  };
  accessToken: string;
  refreshToken: string;
}

/**
 * POST /api/auth/register
 *
 * Email/password self-service signup (ADR-auth-provider). On success the
 * refresh token is stored in the httpOnly cookie; the client only receives
 * the public user shape. `displayName` is optional.
 */
export async function POST(request: Request) {
  let body: {
    email?: string;
    password?: string;
    displayName?: string;
    acceptedTerms?: boolean;
  };
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: "Bad request" }, { status: 400 });
  }

  if (!body.email || !body.password || body.password.length < 8) {
    return NextResponse.json(
      { error: "Email và mật khẩu (≥ 8 ký tự) là bắt buộc" },
      { status: 400 },
    );
  }

  if (body.acceptedTerms !== true) {
    return NextResponse.json(
      {
        error:
          "Bạn cần đọc và đồng ý với Điều khoản sử dụng cùng Chính sách bảo vệ dữ liệu cá nhân",
      },
      { status: 400 },
    );
  }

  let result: RegisterResult;
  try {
    result = await apiFetch<RegisterResult>("/auth/email/register", {
      method: "POST",
      body: {
        email: body.email,
        password: body.password,
        displayName: body.displayName,
      },
    });
  } catch (error) {
    if (error instanceof ApiError) {
      if (error.status === 409) {
        return NextResponse.json(
          { error: "Email này đã có tài khoản" },
          { status: 409 },
        );
      }
      const status = error.status >= 500 ? 502 : 400;
      return NextResponse.json({ error: "Không tạo được tài khoản" }, { status });
    }
    throw error;
  }

  await clearSessionCookie();
  await setSessionCookie(result.refreshToken, {
    secure: process.env.NODE_ENV === "production",
  });

  return NextResponse.json({ ok: true, user: result.user });
}
