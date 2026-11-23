import { HttpException } from "@nestjs/common";
import { of, type Observable, throwError } from "rxjs";
import { AuditInterceptor } from "./audit.interceptor.js";
import { attachAuditNote } from "./audit-note.js";

/**
 * P5-ADMIN-03 — the audit row written for an admin action carries
 * `before` / `after` / `summary` snapshots when the controller attached
 * an `auditNote` to the request. The interceptor is driven directly with a
 * stub `Reflector` (the `@Roles` metadata source) and a stub model.
 */
describe("AuditInterceptor before/after snapshots (P5-ADMIN-03)", () => {
  let create: ReturnType<typeof vi.fn>;

  function makeInterceptor(roles: string[] | undefined) {
    create = vi.fn().mockResolvedValue({});
    const interceptor = new AuditInterceptor(
      { getAllAndOverride: vi.fn().mockReturnValue(roles) } as never,
      { create } as never,
    );
    return { interceptor, create };
  }

  function httpCall(
    interceptor: AuditInterceptor,
    opts: {
      method: string;
      path: string;
      req: Record<string, unknown>;
      httpError?: HttpException;
    },
  ) {
    const context = {
      getType: () => "http",
      getHandler: () => undefined,
      getClass: () => ({}),
      switchToHttp: () => ({ getRequest: () => ({ headers: {}, ...opts.req, method: opts.method, originalUrl: opts.path }) }),
    } as never;
    let handle: () => Observable<unknown>;
    if (opts.httpError) {
      const err = opts.httpError;
      handle = () => throwError(() => err);
    } else {
      handle = () => of({ ok: true });
    }
    const obs = interceptor.intercept(context, { handle } as never);
    return (async () => {
      try {
        await new Promise((resolve, reject) => obs.subscribe({ complete: () => resolve(undefined), error: reject }));
      } catch {
        /* the thrown error is the expectation under test */
      }
      // `record()` fires and forgets `model.create(...)` — let that settle.
      await new Promise((r) => setTimeout(r, 0));
    })();
  }

  it("records before/after/summary attached via attachAuditNote", async () => {
    const { interceptor, create } = makeInterceptor(["ADMIN", "SUPER_ADMIN"]);
    const req: Record<string, unknown> = {
      user: { sub: "a-1", role: "SUPER_ADMIN" },
      body: { role: "ADMIN" },
      ip: "1.2.3.4",
    };
    attachAuditNote(req, {
      before: { id: "u-9", role: "USER" },
      after: { id: "u-9", role: "ADMIN" },
      summary: "role: USER → ADMIN",
    });
    await httpCall(interceptor, { method: "PATCH", path: "/admin/users/u-9/role", req });
    expect(create).toHaveBeenCalledWith(
      expect.objectContaining({
        method: "PATCH",
        path: "/admin/users/u-9/role",
        ok: true,
        before: { id: "u-9", role: "USER" },
        after: { id: "u-9", role: "ADMIN" },
        summary: "role: USER → ADMIN",
      }),
    );
  });

  it("leaves snapshots undefined when no note was attached", async () => {
    const { interceptor, create } = makeInterceptor(["ADMIN", "SUPER_ADMIN"]);
    const req: Record<string, unknown> = { user: { sub: "a-1", role: "ADMIN" }, body: {}, ip: "1.2.3.4" };
    await httpCall(interceptor, { method: "POST", path: "/admin/users/u-1/revoke-sessions", req });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ before: undefined, after: undefined }));
  });

  it("skips routes without @Roles metadata", async () => {
    const { interceptor, create } = makeInterceptor(undefined);
    const req: Record<string, unknown> = { user: { sub: "u-1", role: "USER" }, body: {}, ip: "1.2.3.4" };
    await httpCall(interceptor, { method: "POST", path: "/flashcards/cards", req });
    expect(create).not.toHaveBeenCalled();
  });

  it("records a failed action with its HTTP status", async () => {
    const { interceptor, create } = makeInterceptor(["ADMIN", "SUPER_ADMIN"]);
    const req: Record<string, unknown> = {
      user: { sub: "a-1", role: "ADMIN" },
      body: {},
      ip: "1.2.3.4",
    };
    await httpCall(interceptor, {
      method: "PATCH",
      path: "/admin/users/u-9/role",
      req,
      httpError: new HttpException("Insufficient role", 403),
    });
    expect(create).toHaveBeenCalledWith(expect.objectContaining({ ok: false, status: 403 }));
  });
});
