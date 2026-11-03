/**
 * Server-side API client for the Nihongo Path backend.
 *
 * Used only from Route Handlers / Server Components (never bundled to the
 * browser). `Next 16` reads `NEXT_PUBLIC_*` into the server process too, so
 * the base URL comes from the same `.env` as the client.
 */

const API_BASE =
  process.env.NEXT_PUBLIC_API_URL ?? "http://localhost:3000";

export interface ApiErrorBody {
  message?: string | string[];
  error?: string;
  statusCode?: number;
}

/** A failed API call. `status` is the HTTP code (0 = network/timeout). */
export class ApiError extends Error {
  constructor(
    public readonly status: number,
    public readonly body: unknown,
    message: string,
  ) {
    super(message);
    this.name = "ApiError";
  }
}

interface FetchOptions {
  method?: "GET" | "POST" | "PATCH" | "DELETE";
  /** JSON request body (serialized automatically). */
  body?: unknown;
  /** Bearer access token for guarded API routes. */
  token?: string;
  /** Retry-after hint in seconds (from a 429 response). */
  retryAfterSeconds?: number;
}

/**
 * Fetch a backend endpoint, JSON in / JSON out. Throws `ApiError` on any
 * non-2xx status (with the parsed body for UI error display).
 */
export async function apiFetch<T>(
  path: string,
  options: FetchOptions = {},
): Promise<T> {
  const { method = "GET", body, token } = options;

  const res = await fetch(`${API_BASE}${path}`, {
    method,
    headers: {
      ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      ...(token ? { Authorization: `Bearer ${token}` } : {}),
    },
    body: body !== undefined ? JSON.stringify(body) : undefined,
    cache: "no-store",
  });

  let payload: unknown;
  // 204 has no body; everything else is JSON (our API is JSON-only).
  if (res.status !== 204) {
    payload = await res.json().catch(() => null);
  }

  if (!res.ok) {
    const errBody = payload as ApiErrorBody | null;
    const message =
      typeof errBody?.message === "string"
        ? errBody.message
        : Array.isArray(errBody?.message)
          ? errBody.message.join("; ")
          : `API request failed (${res.status})`;
    throw new ApiError(res.status, payload, message);
  }

  return payload as T;
}

export const API_BASE_URL = API_BASE;
