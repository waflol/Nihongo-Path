#!/usr/bin/env node
/**
 * Bootstrap an ADMIN account (P2-USER-02).
 *
 * MANUAL, one-shot, and NOT auto-run at app startup — the spec forbids
 * auto-seeding accounts. Run it explicitly against a real database:
 *
 *   cd apps/api
 *   node scripts/bootstrap-admin.mjs admin@example.com "Password123!"
 *
 * Behaviour:
 * - `MONGODB_URL` missing/unreachable → the script fails with a clear error
 *   (a bootstrap without a database is a misconfiguration).
 * - User does not exist  → created with `role: "ADMIN"`, `status: "ACTIVE"`;
 *   the password is scrypt-hashed with the SAME parameters as the app
 *   (`src/common/password.ts`), so the account can log in via
 *   `POST /auth/email/login` immediately.
 * - User already exists → role is promoted to ADMIN (idempotent; the same
 *   command can be re-run to promote another account).
 *
 * The password is taken from argv or `ADMIN_BOOTSTRAP_PASSWORD` (env) and is
 * never written to the database in plain text, nor logged.
 */
import { config as loadDotenv } from "dotenv";
import { randomBytes, scrypt } from "node:crypto";
import mongoose from "mongoose";

// ---------------------------------------------------------------------------

loadDotenv();

const MONGO_URL = process.env.MONGODB_URL?.trim();
if (!MONGO_URL) {
  console.error(
    "MONGODB_URL is not set. This script requires a real database — " +
      "fill in apps/api/.env (see docs/development.md §5) and re-run.",
  );
  process.exit(1);
}

const email = process.argv[2]?.trim().toLowerCase();
const password =
  process.argv[3] ?? process.env.ADMIN_BOOTSTRAP_PASSWORD?.trim();

if (!email || !email.includes("@") || email.length > 320) {
  console.error("Usage: node scripts/bootstrap-admin.mjs <email> [password]");
  process.exit(1);
}
if (!password || password.length < 8) {
  console.error(
    "A password (min 8 chars) is required — as the 2nd argument or via " +
      "ADMIN_BOOTSTRAP_PASSWORD.",
  );
  process.exit(1);
}

// Same scrypt parameters as `src/common/password.ts` — the stored format is
// `salt$hash` (hex) and must stay compatible with `verifyPassword()`.
const SCRYPT_OPTS = { N: 16384, r: 8, p: 1, maxmem: 64 * 1024 * 1024 };
function hashPassword(plain) {
  return new Promise((resolve, reject) => {
    const salt = randomBytes(16);
    scrypt(plain, salt, 32, SCRYPT_OPTS, (error, key) => {
      if (error) {
        reject(error);
        return;
      }
      resolve(`${salt.toString("hex")}$${key.toString("hex")}`);
    });
  });
}

// ---------------------------------------------------------------------------

mongoose.set("strictQuery", true);
await mongoose.connect(MONGO_URL, {
  serverSelectionTimeoutMS: 5000,
});
console.log(`Connected to MongoDB: ${new URL(MONGO_URL).host}`);

const users = mongoose.connection.db.collection("users");
const accounts = mongoose.connection.db.collection("auth_accounts");

const existing = await users.findOne({ email });

if (existing) {
  const changes = {};
  if (existing.role !== "ADMIN") changes.role = "ADMIN";
  if (existing.status !== "ACTIVE") changes.status = "ACTIVE";
  if (Object.keys(changes).length > 0) {
    await users.updateOne({ _id: existing._id }, { $set: changes });
    console.log(
      `Updated existing user ${email}: ${Object.entries(changes)
        .map(([k, v]) => `${k} → ${v}`)
        .join(", ")}`,
    );
  } else {
    console.log(`User ${email} already has role ADMIN, status ACTIVE. No change.`);
  }
  // Idempotent: ensure an email credential link exists so login still works
  // if the account was created OAuth-only.
  const hasEmailAccount = await accounts.findOne({
    provider: "email",
    providerAccountId: email,
  });
  if (!hasEmailAccount) {
    const inserted = await accounts.insertOne({
      provider: "email",
      providerAccountId: email,
      user: existing._id,
      manual: true,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    await users.updateOne(
      { _id: existing._id },
      { $addToSet: { authAccounts: inserted.insertedId } },
    );
    console.log("Added a manual `email` credential link for this account.");
  }
} else {
  const passwordHash = await hashPassword(password);
  const now = new Date();
  const { insertedId } = await users.insertOne({
    email,
    role: "ADMIN",
    lang: "vi",
    status: "ACTIVE",
    passwordHash,
    authAccounts: [],
    createdAt: now,
    updatedAt: now,
  });
  const { insertedId: accountId } = await accounts.insertOne({
    provider: "email",
    providerAccountId: email,
    user: insertedId,
    manual: true,
    createdAt: now,
    updatedAt: now,
  });
  await users.updateOne(
    { _id: insertedId },
    { $set: { authAccounts: [accountId] } },
  );
  console.log(`Created ADMIN user ${email} (id ${String(insertedId)}).`);
  console.log("This account can now log in via POST /auth/email/login.");
}

await mongoose.disconnect();
console.log("Done.");
