import { NextResponse } from "next/server";
import { API_BASE_URL } from "@/lib/api";
import { getSession } from "@/lib/session";

/**
 * Gateway for the bulk import surface (P3-IMPORT-02/03/04):
 * `POST /api/import?action=preview` and `POST /api/import?action=confirm`.
 *
 * The wizard sends a `multipart/form-data` body with the `file` part plus
 * the `deckId` / `mapping` / `duplicatePolicy` form fields. The raw body is
 * forwarded untouched (the boundary must survive) with the server-minted
 * access token in `Authorization` — the multipart `Content-Type` header is
 * passed through so upstream multer sees an identical stream.
 */
export async function POST(request: Request) {
  const session = await getSession();
  if (!session.authenticated || !session.accessToken) {
    return NextResponse.json({ error: "Không đăng nhập" }, { status: 401 });
  }

  const url = new URL(request.url);
  const action = url.searchParams.get("action");
  if (action !== "preview" && action !== "confirm") {
    return NextResponse.json(
      { error: "action must be preview|confirm" },
      { status: 400 },
    );
  }

  const contentType = request.headers.get("content-type") ?? "";
  const upstream = await fetch(`${API_BASE_URL}/flashcards/import/${action}`, {
    method: "POST",
    headers: {
      "Content-Type": contentType,
      Authorization: `Bearer ${session.accessToken}`,
    },
    body: request.body,
    cache: "no-store",
  });

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
