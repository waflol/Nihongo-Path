import { NextResponse } from "next/server";
import type { NextRequest } from "next/server";
import { API_BASE_URL, clientIpHeaders } from "@/lib/api";
import { getSession } from "@/lib/session";

const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
/** The backup file (.xlsx / .csv) goes through as-is; everything else is JSON. */
const bodyType = (request: NextRequest) => {
  const t = request.headers.get("content-type") ?? "";
  return t.startsWith(XLSX) ? XLSX : t.startsWith("text/csv") ? "text/csv" : "application/json";
};
const isFileType = (t: string) => t === XLSX || t === "text/csv";

/** Admin proxy: `/api/admin/kanji[/...]` → API `/admin/kanji[/...]` (plan-kanji §5.3). */
async function forward(
  request: NextRequest,
  { params }: { params: Promise<{ route?: string[] }> },
): Promise<NextResponse> {
  const session = await getSession();
  if (!session.authenticated || !session.accessToken) {
    return NextResponse.json({ error: "Không đăng nhập" }, { status: 401 });
  }
  const { route = [] } = await params;
  const method = request.method.toUpperCase();
  const hasBody = method === "PATCH" || method === "POST";
  const upstream = await fetch(
    `${API_BASE_URL}/admin/kanji${route.map((s) => `/${encodeURIComponent(s)}`).join("")}${request.nextUrl.search}`,
    {
      method,
      headers: {
        ...(await clientIpHeaders()),
        Authorization: `Bearer ${session.accessToken}`,
        ...(hasBody ? { "Content-Type": bodyType(request) } : {}),
      },
      body: hasBody ? (isFileType(bodyType(request)) ? await request.arrayBuffer() : await request.text()) : undefined,
      cache: "no-store",
    },
  );
  if (upstream.status === 204 || upstream.status === 205 || upstream.status === 304) {
    return new NextResponse(null, { status: upstream.status });
  }
  // The backup is a file, not JSON: hand it through untouched.
  if (upstream.headers.get("content-type")?.startsWith(XLSX)) {
    return new NextResponse(await upstream.arrayBuffer(), {
      status: upstream.status,
      headers: {
        "Content-Type": XLSX,
        "Content-Disposition": upstream.headers.get("content-disposition") ?? 'attachment; filename="kanji.xlsx"',
      },
    });
  }
  const text = await upstream.text();
  let payload: unknown = text;
  try {
    payload = text ? JSON.parse(text) : null;
  } catch {
    // pass through non-JSON
  }
  return NextResponse.json(payload, { status: upstream.status });
}

export const GET = forward;
export const POST = forward;
export const PATCH = forward;
export const DELETE = forward;
