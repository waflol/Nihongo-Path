import { Injectable, Logger, OnApplicationBootstrap } from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { InjectModel } from "@nestjs/mongoose";
import { Model } from "mongoose";
import { hashPassword } from "../common/password.js";
import type { Role } from "../common/roles.js";
import { AuthAccount, AuthAccountDocument } from "../users/schemas/auth-account.schema.js";
import type { UserStatus } from "../users/schemas/user.schema.js";
import { User, UserDocument } from "../users/schemas/user.schema.js";

/**
 * Admin bootstrap from the environment (P2-USER-02 follow-up): when BOTH
 * `ADMIN_EMAIL` and `ADMIN_PASS` are set in the API's env, ensure that account
 * exists with `role: "ADMIN"` and a working email credential at startup.
 *
 * Idempotent, mirroring `scripts/bootstrap-admin.mjs` semantics:
 * - user absent  → created (ADMIN, ACTIVE, scrypt-hashed password + a manual
 *                  `email` auth account, so it can sign in immediately);
 * - user present → promoted to ADMIN/ACTIVE and given the manual email
 *                  credential link when missing. Its password is NEVER
 *                  changed (the env value is only used on the create path).
 *
 * Opt-in and non-fatal:
 * - unset / malformed values log at most a warning and skip — an `.env` typo
 *   must never take the whole app down at startup;
 * - a failure (e.g. a transient DB error) is logged, not thrown.
 *
 * Registered only in the full (DB-backed) `AuthModule` build, so the
 * graceful-degrade contract holds: no `MONGODB_URL` → no models → no hook.
 * `onApplicationBootstrap` runs after Mongoose's `onModuleInit` connection,
 * so the database is ready when this executes.
 */
@Injectable()
export class AdminBootstrapService implements OnApplicationBootstrap {
  private readonly logger = new Logger(AdminBootstrapService.name);

  constructor(
    private readonly config: ConfigService,
    @InjectModel(User.name)
    private readonly user: Model<UserDocument>,
    @InjectModel(AuthAccount.name)
    private readonly account: Model<AuthAccountDocument>,
  ) {}

  async onApplicationBootstrap(): Promise<void> {
    const email = this.config
      .get<string>("ADMIN_EMAIL")
      ?.trim()
      .toLowerCase();
    const password = this.config.get<string>("ADMIN_PASS")?.trim();

    if (!email || !password) {
      // Not configured — the common case; nothing to do.
      return;
    }
    if (!email.includes("@") || email.length > 320) {
      this.logger.warn(
        `ADMIN_EMAIL ("${email}") is not a valid email address — skipping admin bootstrap`,
      );
      return;
    }

    try {
      const existing = await this.user.findOne({ email }).exec();

      if (existing) {
        const changes: { role?: Role; status?: UserStatus } = {};
        if (existing.role !== "ADMIN") changes.role = "ADMIN";
        if (existing.status !== "ACTIVE") changes.status = "ACTIVE";
        if (Object.keys(changes).length > 0) {
          await this.user
            .updateOne({ _id: existing._id }, { $set: changes })
            .exec();
        }

        // Idempotent: ensure a manual email credential link exists so the
        // account can sign in even if it was created OAuth-only.
        const hasEmailAccount = await this.account
          .findOne({ provider: "email", providerAccountId: email })
          .exec();
        if (!hasEmailAccount) {
          const link = await this.account.create({
            provider: "email",
            providerAccountId: email,
            user: existing._id,
            manual: true,
          });
          await this.user
            .updateOne(
              { _id: existing._id },
              { $addToSet: { authAccounts: link._id } },
            )
            .exec();
          this.logger.log(
            `Admin bootstrap: linked the manual email credential for ${email}`,
          );
        }
        this.logger.log(
          `Admin bootstrap: ${email} ensured as ADMIN/ACTIVE ` +
            (Object.keys(changes).length > 0 ? "(updated)" : "(already set)"),
        );
        return;
      }

      if (password.length < 8) {
        this.logger.warn(
          "ADMIN_PASS is shorter than 8 characters — refusing to create an admin with it",
        );
        return;
      }

      const doc = await this.user.create({
        email,
        role: "ADMIN",
        status: "ACTIVE" as UserStatus,
        lang: "vi",
        passwordHash: await hashPassword(password),
      });
      const link = await this.account.create({
        provider: "email",
        providerAccountId: email,
        user: doc._id,
        manual: true,
      });
      await this.user
        .updateOne(
          { _id: doc._id },
          { $set: { authAccounts: [link._id] } },
        )
        .exec();
      this.logger.log(`Admin bootstrap: created ADMIN user ${email}`);
    } catch (error) {
      // Non-fatal by design: log and keep serving (mirrors the manual script's
      // one-shot contract without coupling app startup to it).
      this.logger.error(
        `Admin bootstrap for ${email} failed: ${
          error instanceof Error ? error.message : String(error)
        }`,
      );
    }
  }
}
