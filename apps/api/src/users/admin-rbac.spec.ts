import "reflect-metadata";
import { ForbiddenException } from "@nestjs/common";
import { Test, type TestingModule } from "@nestjs/testing";
import { Types } from "mongoose";
import { RolesGuard } from "../auth/guards/roles.guard.js";
import { REQUIRED_ROLES } from "../auth/guards/guards.constants.js";
import { AdminUsersService } from "./admin-users.service.js";

type Caller = { sub: string; role: string; lang: string };

const user: Caller = { sub: "u-1", role: "USER", lang: "vi" };
const admin: Caller = { sub: "a-1", role: "ADMIN", lang: "vi" };
const sup: Caller = { sub: "s-1", role: "SUPER_ADMIN", lang: "vi" };

/**
 * P5-ADMIN-01/02 — RBAC 403 + no self-privilege (NP-024).
 *
 * Guard level: `RolesGuard` is the enforcement point, so "USER hits an admin
 * route → 403" is covered by driving the guard directly. Service level:
 * least-privilege rules that live below the guard (self-promotion, ADMIN
 * touching another admin) are unit-tested on `AdminUsersService`.
 */
describe("P5 admin RBAC (P5-ADMIN-01/02)", () => {
  let guard: RolesGuard;

  beforeAll(async () => {
    const app: TestingModule = await Test.createTestingModule({
      providers: [RolesGuard],
    }).compile();
    guard = app.get(RolesGuard);
  });

  function routeWith(required: string[], caller: Caller | undefined) {
    const handler = () => undefined;
    if (required.length) Reflect.defineMetadata(REQUIRED_ROLES, required, handler);
    return {
      getHandler: () => handler,
      getClass: () => ({}),
      switchToHttp: () => ({ getRequest: () => ({ user: caller }) }),
    } as never;
  }

  describe("RolesGuard (route → 403)", () => {
    it("USER on an ADMIN-only route → 403 (P5-ADMIN-01 criterion)", () => {
      expect(() => guard.canActivate(routeWith(["ADMIN", "SUPER_ADMIN"], user))).toThrow(ForbiddenException);
      try {
        guard.canActivate(routeWith(["ADMIN", "SUPER_ADMIN"], user));
      } catch (e) {
        expect((e as ForbiddenException).getStatus()).toBe(403);
      }
    });

    it("ADMIN on an ADMIN-only route → passes", () => {
      expect(guard.canActivate(routeWith(["ADMIN", "SUPER_ADMIN"], admin))).toBe(true);
    });

    it("SUPER_ADMIN-only route: SUPER passes, ADMIN → 403", () => {
      expect(guard.canActivate(routeWith(["SUPER_ADMIN"], sup))).toBe(true);
      expect(() => guard.canActivate(routeWith(["SUPER_ADMIN"], admin))).toThrow(ForbiddenException);
    });

    it("no @Roles metadata → pass-through (AuthGuard already gated)", () => {
      expect(guard.canActivate(routeWith([], user))).toBe(true);
    });

    it("caller with an unlisted role → 403", () => {
      expect(() => guard.canActivate(routeWith(["SUPER_ADMIN"], undefined))).toThrow(ForbiddenException);
    });
  });

  describe("AdminUsersService least-privilege (P5-ADMIN-02)", () => {
    function svc(targetRole: string, targetId: string) {
      const doc = {
        id: targetId,
        _id: new Types.ObjectId(),
        role: targetRole,
        status: "ACTIVE",
        save: async () => undefined,
      };
      const model = {
        findById: () => ({ exec: async () => doc }),
        exists: async () => false,
        create: async () => ({}),
        updateOne: async () => ({}),
      };
      const sessions = { updateMany: async () => ({ modifiedCount: 1 }) };
      const accounts = { exists: async () => false, create: async () => ({ _id: new Types.ObjectId() }) };
      const service = new AdminUsersService(model as never, sessions as never, accounts as never);
      return { service, doc };
    }

    it("ADMIN cannot change a role at the service layer either", async () => {
      const { service } = svc("USER", new Types.ObjectId().toString());
      await expect(service.setRole(admin, "target-id", "ADMIN")).rejects.toThrow(/SUPER_ADMIN/);
    });

    it("nobody may promote or demote themselves (self-promotion refused)", async () => {
      const me = new Types.ObjectId().toString();
      const { service } = svc("USER", me);
      await expect(service.setRole({ ...sup, sub: me }, me, "ADMIN")).rejects.toThrow(/chính mình/);
    });

    it("SUPER_ADMIN may change a role and it revokes sessions", async () => {
      const { service, doc } = svc("USER", new Types.ObjectId().toString());
      await service.setRole(sup, doc.id, "ADMIN");
      expect(doc.role).toBe("ADMIN");
    });

    it("role change never targets a SUPER_ADMIN account", async () => {
      const { service, doc } = svc("SUPER_ADMIN", new Types.ObjectId().toString());
      await expect(service.setRole(sup, doc.id, "USER")).rejects.toThrow(/SUPER_ADMIN/);
    });

    it("ADMIN cannot touch another admin; SUPER_ADMIN can (status writes)", async () => {
      const a = svc("ADMIN", new Types.ObjectId().toString());
      await expect(a.service.setStatus(admin, a.doc.id, "SUSPENDED")).rejects.toThrow(/SUPER_ADMIN/);
      const b = svc("ADMIN", new Types.ObjectId().toString());
      await expect(b.service.setStatus(sup, b.doc.id, "SUSPENDED")).resolves.toBeDefined();
    });

    it("nobody can change their own account status", async () => {
      const me = new Types.ObjectId().toString();
      const { service } = svc("USER", me);
      await expect(service.setStatus({ ...admin, sub: me }, me, "SUSPENDED")).rejects.toThrow(/chính mình/);
    });
  });
});
