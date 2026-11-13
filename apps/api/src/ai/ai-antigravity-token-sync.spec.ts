import { chmodSync, existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import { authStatus, ensureHome, homeOf, isTokenText, logout, pushToken, runAntigravityCli, setTokenStore, syncToken, TOKEN_FILE, type TokenStore } from "./ai-antigravity-cli.js";

const ID = "0a1b2c3d4e5f60718293a4b5";
const token = (access: string, email = "me@example.com"): string =>
  JSON.stringify({ token: { access_token: access, refresh_token: "r-1", token_type: "Bearer" }, auth_method: "consumer", id_token_email: email });

/** The database row, shared by every "server". */
let row: { token: string | null; everStored: boolean };
const store: TokenStore = {
  load: async () => ({ ...row }),
  save: async (_id, t) => {
    row = { token: t, everStored: true };
  },
};

let dir: string;
const file = (): string => join(homeOf(ID), TOKEN_FILE);
const writeLocal = async (text: string): Promise<void> => {
  const home = await ensureHome(ID);
  mkdirSync(dirname(file()), { recursive: true });
  writeFileSync(file(), text);
  writeFileSync(join(home, ".authorized"), "x");
};
/** Another server (or a restart): nothing on disk, nothing in memory. */
const freshServer = (): void => {
  rmSync(homeOf(ID), { recursive: true, force: true });
  setTokenStore(store);
};

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "agy-sync-"));
  process.env.ANTIGRAVITY_CLI_DATA_DIR = join(dir, "data");
  process.env.ANTIGRAVITY_CLI_REVOKE_WAIT_MS = "100";
});
afterAll(() => {
  setTokenStore(null);
  rmSync(dir, { recursive: true, force: true });
  delete process.env.ANTIGRAVITY_CLI_DATA_DIR;
  delete process.env.ANTIGRAVITY_CLI_BIN;
});
beforeEach(() => {
  row = { token: null, everStored: false };
  freshServer();
});

describe("sharing the agy sign-in through the database", () => {
  it("only a JSON token file with a refresh token counts", () => {
    expect(isTokenText(token("a"))).toBe(true);
    expect(isTokenText('{"token":{}}')).toBe(false);
    expect(isTokenText("root:x:0:0")).toBe(false);
    expect(isTokenText(token("a") + " ".repeat(20_000))).toBe(false);
  });

  it("a server authorised before sharing existed seeds the database", async () => {
    await writeLocal(token("a"));
    await syncToken(ID, true);
    expect(row).toEqual({ token: token("a"), everStored: true });
  });

  it("a new server takes the stored token: authorised without signing in", async () => {
    row = { token: token("a"), everStored: true };
    expect(authStatus(ID).authorized).toBe(false);
    await syncToken(ID, true);
    expect(authStatus(ID).authorized).toBe(true);
    expect(readFileSync(file(), "utf8")).toBe(token("a"));
  });

  it("a token agy refreshed here is pushed; one re-authorised elsewhere replaces the local copy", async () => {
    row = { token: token("a"), everStored: true };
    await syncToken(ID, true);
    writeFileSync(file(), token("b")); // agy refreshed the access token
    await syncToken(ID, true);
    expect(row.token).toBe(token("b"));
    row = { token: token("c", "other@example.com"), everStored: true }; // another server signed in again
    await syncToken(ID, true);
    expect(readFileSync(file(), "utf8")).toBe(token("c", "other@example.com"));
  });

  it("signed out on another server → signed out here too; never-shared + empty row leaves a local sign-in alone", async () => {
    row = { token: token("a"), everStored: true };
    await syncToken(ID, true);
    row = { token: null, everStored: true };
    await syncToken(ID, true);
    expect(authStatus(ID).authorized).toBe(false);
    expect(existsSync(file())).toBe(false);
  });

  it("a sign-in here is pushed at once, and logout clears the database", async () => {
    await writeLocal(token("z"));
    expect(await pushToken(ID)).toBe(true);
    expect(row.token).toBe(token("z"));
    await logout(ID);
    expect(row).toEqual({ token: null, everStored: true });
  });

  it("a call on a new server works with the stored token; a rejected token is not put back again", async () => {
    const bin = join(dir, "agy-ok");
    writeFileSync(bin, `#!/bin/bash\necho '{"status":"SUCCESS","response":"ok"}'\n`);
    chmodSync(bin, 0o755);
    process.env.ANTIGRAVITY_CLI_BIN = bin;
    row = { token: token("a"), everStored: true };
    await expect(runAntigravityCli({ serviceId: ID, model: "default", prompt: "hi" })).resolves.toBe("ok");

    const bad = join(dir, "agy-auth");
    writeFileSync(bad, `#!/bin/bash\necho "Error: authentication required. Run 'agy' to log in" >&2\nexit 1\n`);
    chmodSync(bad, 0o755);
    process.env.ANTIGRAVITY_CLI_BIN = bad;
    await expect(runAntigravityCli({ serviceId: ID, model: "default", prompt: "hi" })).rejects.toMatchObject({ kind: "auth" });
    await new Promise((r) => setTimeout(r, 100));
    await syncToken(ID, true);
    expect(authStatus(ID).authorized).toBe(false); // same dead token: not restored
    row = { token: token("new"), everStored: true }; // re-authorised elsewhere
    await syncToken(ID, true);
    expect(authStatus(ID).authorized).toBe(true);
  });
});
