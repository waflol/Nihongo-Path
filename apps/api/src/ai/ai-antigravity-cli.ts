/**
 * Google AI Pro through the official Antigravity CLI (`agy`), the successor of the Gemini CLI
 * (which Google stopped serving to personal / AI Pro accounts on 2026-06-18).
 *
 * Each AI service of this kind owns a private `HOME` (`<ANTIGRAVITY_CLI_DATA_DIR>/<serviceId>/`, mode
 * 0700) for the child process, so the CLI's state (`~/.gemini/antigravity-cli`) is per service. The
 * admin authorises the service from the web page: the server runs the CLI's own Google sign-in in a
 * pseudo-terminal, hands the Google link to the admin and types the code the admin pastes back. This
 * app never reads or handles the token — "authorised" means that `agy models` really works.
 *
 * Calls are `agy -p=<prompt> --output-format json` child processes (stdin is a closed *pipe*: `agy`
 * mistakes /dev/null for a terminal and waits for a browser sign-in), planning mode, an empty working
 * directory, a minimal environment. Personal use of one account only; Google's terms for the CLI apply
 * (a forum answer says wrapping `agy` in another app is unsupported on consumer plans — unconfirmed).
 *
 * No Nest / app imports on purpose: plain Node, easy to unit-test.
 */
import { spawn, type ChildProcess, type ChildProcessWithoutNullStreams, type SpawnOptions } from "node:child_process";
import { randomUUID } from "node:crypto";
import { existsSync, readFileSync } from "node:fs";
import { userInfo } from "node:os";
import { chmod, lstat, mkdir, readdir, readFile, rm, stat, writeFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";

export type CliFailureKind = "auth" | "rate" | "transient";

/** A failed CLI call, already classified (the caller maps it to its own failure type). */
export class AntigravityCliFailure extends Error {
  constructor(
    readonly kind: CliFailureKind,
    message: string,
    readonly retryAfterMs?: number,
  ) {
    super(message);
  }
}

/** SIGKILL a child and its own process group (so no helper process is left behind). */
/** Children of each service that are running now, so removing the service can stop them first. */
const active = new Map<string, Set<ChildProcess>>();
/** Services being deleted: nothing new may start for them. */
const destroying = new Set<string>();

function track(serviceId: string, child: ChildProcess): void {
  let set = active.get(serviceId);
  if (!set) active.set(serviceId, (set = new Set()));
  set.add(child);
  child.once("close", () => {
    set.delete(child);
    if (set.size === 0 && active.get(serviceId) === set) active.delete(serviceId);
  });
}

/** Stops every process of a service (calls, sign-in, sign-out). */
export function killService(serviceId: string): void {
  for (const c of [...(active.get(serviceId) ?? [])]) killTree(c);
}

function killTree(child: ChildProcess): void {
  try {
    if (child.pid) process.kill(-child.pid, "SIGKILL");
  } catch {
    child.kill("SIGKILL");
  }
}

// ── Config ──────────────────────────────────────────────────────────────

const bin = (): string => process.env.ANTIGRAVITY_CLI_BIN?.trim() || "agy";

/** Where the per-service homes live (never inside a served / committed folder). */
export function cliDataDir(): string {
  return resolve(process.env.ANTIGRAVITY_CLI_DATA_DIR?.trim() || join(process.cwd(), "data", "antigravity-cli"));
}

// ── Running `agy` as another operating-system user ─────────────────────

export interface RunAs {
  name: string;
  uid: number;
  gid: number;
}

/**
 * `ANTIGRAVITY_CLI_USER`: the unprivileged account `agy` runs as. It is an agent that reads untrusted
 * text, so it must not share a user with the API: as its own user it cannot read the API's `.env`, the
 * database credentials or other users' files, whatever a prompt makes it try. The API (root) drops
 * privileges for the child with `setpriv` (`--clear-groups` too: Node's own `uid` option keeps the
 * supplementary groups). Every home is then owned by that user. Unset = same user as the API.
 */
export function runAs(): RunAs | null {
  const name = process.env.ANTIGRAVITY_CLI_USER?.trim();
  if (!name) return null;
  if (!/^[a-z_][a-z0-9_-]{0,31}$/.test(name)) throw new AntigravityCliFailure("auth", "ANTIGRAVITY_CLI_USER không hợp lệ");
  if (userInfo().uid !== 0) {
    throw new AntigravityCliFailure("auth", "ANTIGRAVITY_CLI_USER cần API chạy bằng root để hạ quyền cho agy — chạy API bằng root hoặc bỏ biến này");
  }
  let line: string | undefined;
  try {
    line = readFileSync("/etc/passwd", "utf8").split("\n").find((l) => l.startsWith(`${name}:`));
  } catch {
    /* handled below */
  }
  const f = line?.split(":");
  const uid = Number(f?.[2]);
  const gid = Number(f?.[3]);
  if (!f || !Number.isInteger(uid) || !Number.isInteger(gid)) throw new AntigravityCliFailure("auth", `không có user hệ điều hành “${name}” (ANTIGRAVITY_CLI_USER) — tạo bằng apps/api/scripts/setup-antigravity-cli.sh`);
  if (uid === 0) throw new AntigravityCliFailure("auth", "ANTIGRAVITY_CLI_USER không được là root");
  return { name, uid, gid };
}

/** The command to run: `agy` itself, or `setpriv` dropping to the agy user first. */
function launch(cmd: string, args: string[]): [string, string[]] {
  const as = runAs();
  if (!as) return [cmd, args];
  return ["setpriv", [`--reuid=${as.uid}`, `--regid=${as.gid}`, "--clear-groups", "--no-new-privs", "--", cmd, ...args]];
}

function spawnAs(cmd: string, args: string[], options: SpawnOptions): ChildProcessWithoutNullStreams {
  const [c, a] = launch(cmd, args);
  return spawn(c, a, options) as ChildProcessWithoutNullStreams;
}

// ── Filesystem access inside a service home ────────────────────────────
//
// With a separate user, the data directory belongs to that (less trusted) user: it can plant symlinks anywhere
// in it. A root process that wrote, chmod-ed, chown-ed or deleted there would follow them (to /etc/...), so the
// API NEVER touches those files as root: it has the agy user do it (a symlink gains that user nothing). Without a
// separate user everything is the API's own and plain fs calls are used.

/** Runs a tiny `sh -c` script as the agy user (arguments are positional, never interpolated). */
function userSh(script: string, args: string[], input?: Buffer | string): Promise<void> {
  return new Promise<void>((resolveRun, reject) => {
    const child = spawnAs("sh", ["-c", script, "_", ...args], { cwd: "/", env: { PATH: process.env.PATH ?? "/usr/bin:/bin" }, stdio: ["pipe", "ignore", "pipe"], detached: true });
    let err = "";
    const timer = setTimeout(() => killTree(child), 15_000);
    child.stderr.on("data", (d: Buffer) => {
      if (err.length < 2000) err += d.toString("utf8");
    });
    child.on("error", (e) => {
      clearTimeout(timer);
      reject(new AntigravityCliFailure("transient", `không chạy được lệnh với user agy: ${e.message}`));
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      if (code === 0) resolveRun();
      else reject(new AntigravityCliFailure("auth", `user ${runAs()?.name ?? "agy"} không ghi được vào thư mục dữ liệu (${err.trim().slice(0, 200) || `mã ${code}`}) — thư mục phải thuộc user đó: chạy apps/api/scripts/setup-antigravity-cli.sh`));
    });
    child.stdin.on("error", () => undefined);
    child.stdin.end(input);
  });
}

async function mkdirp(path: string): Promise<void> {
  if (!runAs()) await mkdir(path, { recursive: true, mode: 0o700 });
  else await userSh('umask 077; mkdir -p -- "$1"', [path]);
}

async function putFile(path: string, content: string | Buffer): Promise<void> {
  if (!runAs()) {
    await mkdir(dirname(path), { recursive: true, mode: 0o700 });
    await writeFile(path, content, { mode: 0o600 });
  } else {
    await userSh('umask 077; mkdir -p -- "$(dirname -- "$1")" && cat > "$1"', [path], content);
  }
}

/** Deletes a file or a whole tree (never follows a symlink out of it). */
async function removeTree(path: string): Promise<void> {
  if (!runAs()) await rm(path, { recursive: true, force: true });
  else await userSh('rm -rf -- "$1"', [path]);
}

/** A directory that must belong to the agy user and be a real directory (not a symlink someone planted). */
async function assertAgyOwns(path: string): Promise<void> {
  const as = runAs();
  if (!as) return;
  const st = await lstat(path).catch(() => null);
  if (!st) return; // not created yet: the agy user creates it
  if (st.isSymbolicLink() || !st.isDirectory() || st.uid !== as.uid) {
    throw new AntigravityCliFailure("auth", `thư mục ${path} không thuộc user ${as.name} (hoặc là liên kết) — xoá nó hoặc chown -R ${as.name} rồi thử lại`);
  }
}

const concurrency = (): number => Math.min(4, Math.max(1, Number(process.env.ANTIGRAVITY_CLI_CONCURRENCY) || 1));
const callTimeoutMs = (): number => Math.max(15_000, Number(process.env.ANTIGRAVITY_CLI_TIMEOUT_MS) || 120_000);

const SERVICE_ID = /^[a-f0-9]{24}$/i;
const MODEL_ID = /^[A-Za-z0-9][A-Za-z0-9._:-]{0,79}$/;
/** `default` = no `--model`: the CLI picks its own default. */
export const DEFAULT_MODEL = "default";
/** A model id that is safe to pass after `--model` (never starts with a dash). */
export const isValidCliModel = (model: string): boolean => model === "" || MODEL_ID.test(model);
/** What Google's page shows the admin to copy (a URL-safe token). */
const AUTH_CODE = /^[A-Za-z0-9/_.~%+=-]{8,512}$/;

/** Environment for the child: no API keys or app secrets; the D-Bus variables stay (an OS keyring may need them). */
function childEnv(home: string, extra: Record<string, string> = {}): NodeJS.ProcessEnv {
  const keep = [
    "PATH", "LANG", "LC_ALL", "TMPDIR", "XDG_RUNTIME_DIR", "DBUS_SESSION_BUS_ADDRESS",
    "HTTPS_PROXY", "HTTP_PROXY", "NO_PROXY", "https_proxy", "http_proxy", "no_proxy", "SSL_CERT_FILE", "NODE_EXTRA_CA_CERTS",
  ];
  const env: NodeJS.ProcessEnv = {};
  for (const k of keep) if (process.env[k]) env[k] = process.env[k];
  const as = runAs();
  return { ...env, HOME: home, NO_COLOR: "1", ...(as ? { USER: as.name, LOGNAME: as.name } : {}), ...extra };
}

export function homeOf(serviceId: string): string {
  if (!SERVICE_ID.test(serviceId)) throw new AntigravityCliFailure("transient", "invalid service id");
  return join(cliDataDir(), serviceId);
}

/** Models of a signed-in account, cached for a few minutes. */
const modelCache = new Map<string, { at: number; list: CliModel[] }>();

const markerPath = (home: string): string => join(home, ".authorized");

/**
 * `PreToolUse` hook of every service home. `agy` is an agent: a prompt that carries text from imported
 * files could try to steer it into reading other files (the app's `.env`...), fetching URLs or running
 * commands. The hook denies every tool call except viewing a file inside the service's own (otherwise
 * empty) working directory - the page image of an OCR call. It receives the call as JSON on stdin and
 * answers `{"decision": "allow" | "deny"}` (agy's documented hook contract). Best effort: not verified
 * against a signed-in agy.
 */
export const GUARD_SOURCE = `import { readFileSync } from "node:fs";
import { resolve, sep } from "node:path";
const work = resolve(process.argv[2] ?? "");
let call = {};
try { call = JSON.parse(readFileSync(0, "utf8"))?.toolCall ?? {}; } catch {}
const strings = [];
(function walk(v) { if (typeof v === "string") strings.push(v); else if (v && typeof v === "object") Object.values(v).forEach(walk); })(call.args ?? {});
const paths = strings.filter((s) => s.includes("/") || s.startsWith("."));
const inside = (p) => { const r = resolve(work, p); return r === work || r.startsWith(work + sep); };
const ok = /^(view_file|view_image|read_file)$/.test(String(call.name ?? "")) && paths.length > 0 &&
  strings.every((s) => !/^[a-z][a-z0-9+.-]*:\\/\\//i.test(s) && !s.startsWith("~")) && paths.every(inside);
process.stdout.write(JSON.stringify({ decision: ok ? "allow" : "deny", reason: ok ? "" : "tools are disabled for this service" }));
`;

/** The hooks.json that runs the guard (written to the user config dir and to the working dir's `.agents`). */
export function guardHooks(home: string): string {
  const command = `${shq(process.execPath)} ${shq(join(home, "guard.mjs"))} ${shq(join(home, "work"))}`;
  return JSON.stringify({ guard: { PreToolUse: [{ matcher: "*", hooks: [{ type: "command", command, timeout: 10 }] }] } });
}

async function writeIfChanged(file: string, content: string): Promise<void> {
  if ((await readFile(file, "utf8").catch(() => "")) === content) return;
  await putFile(file, content);
}

/** Creates the private home, an empty working directory and the tool guard. */
export async function ensureHome(serviceId: string): Promise<string> {
  const home = homeOf(serviceId);
  if (destroying.has(serviceId)) throw new AntigravityCliFailure("transient", "dịch vụ đang bị xoá");
  const as = runAs(); // a wrong ANTIGRAVITY_CLI_USER must fail here, before anything runs as the wrong user
  await assertAgyOwns(cliDataDir());
  await assertAgyOwns(home);
  if (!existsSync(cliDataDir())) await mkdirp(cliDataDir());
  if (!existsSync(join(home, "work"))) await mkdirp(join(home, "work"));
  if (!as) {
    await chmod(cliDataDir(), 0o700).catch(() => undefined);
    await chmod(home, 0o700).catch(() => undefined);
  }
  await writeIfChanged(join(home, "guard.mjs"), GUARD_SOURCE);
  const hooks = guardHooks(home);
  await writeIfChanged(join(home, ".gemini", "config", "hooks.json"), hooks);
  await writeIfChanged(join(home, "work", ".agents", "hooks.json"), hooks);
  return home;
}

/** Every `agy` call leaves a conversation (prompt + answer) on disk: keep a day of it, not forever. */
const lastPrune = new Map<string, number>();
export async function pruneHistory(serviceId: string, maxAgeMs = 24 * 3600_000, force = false): Promise<void> {
  const now = Date.now();
  if (!force && now - (lastPrune.get(serviceId) ?? 0) < 3600_000) return;
  lastPrune.set(serviceId, now);
  const base = join(homeOf(serviceId), ".gemini", "antigravity-cli");
  for (const sub of ["brain", "conversations", "implicit"]) {
    const dir = join(base, sub);
    for (const name of await readdir(dir).catch(() => [] as string[])) {
      const st = await stat(join(dir, name)).catch(() => null);
      if (st && now - st.mtimeMs > maxAgeMs) await removeTree(join(dir, name)).catch(() => undefined);
    }
  }
}

/**
 * Whether the service was authorised. A marker written only after `agy models` really worked (we never
 * look at the token itself: it is in the OS keyring or wherever the CLI keeps it) and removed when a
 * call comes back "authentication required".
 */
export function authStatus(serviceId: string): { authorized: boolean; account: string | null } {
  try {
    return { authorized: existsSync(markerPath(homeOf(serviceId))), account: null };
  } catch {
    return { authorized: false, account: null };
  }
}

async function setAuthorized(serviceId: string, on: boolean): Promise<void> {
  const home = homeOf(serviceId);
  if (on) {
    await ensureHome(serviceId);
    await putFile(markerPath(home), new Date().toISOString());
  } else {
    await removeTree(markerPath(home));
    modelCache.delete(serviceId);
  }
}

/** Forgets the authorisation of a service (the CLI is signed out and its saved state deleted; the service stays). */
export async function logout(serviceId: string): Promise<void> {
  const home = homeOf(serviceId);
  cancelLogin(serviceId);
  await revokeLogin(serviceId).catch(() => undefined);
  await setAuthorized(serviceId, false);
  await removeTree(join(home, ".gemini"));
  synced.delete(serviceId);
  if (store) await store.save(serviceId, null);
}

// ── Sharing the sign-in between servers (through the database) ────────
//
// Without an OS keyring `agy` keeps its Google OAuth token in a file of its home. The token is not tied to the
// machine, so the app copies that file into the database (encrypted by the store) and puts it back on any server
// that shares the database: one authorisation serves them all. `agy` refreshes the access token in the file now
// and then; a refreshed copy is pushed back, and a newer copy in the database (another server authorised again)
// replaces the local one. The token never leaves the server except into the store.

/** Where `agy` keeps the token when there is no keyring (relative to the service home). */
export const TOKEN_FILE = join(".gemini", "antigravity-cli", "antigravity-oauth-token");
const TOKEN_MAX = 16_384;

export interface TokenStore {
  /**
   * The stored token (`null` = none) and whether one was ever stored (then `null` means "signed out elsewhere").
   * `undefined` = the store cannot answer now (no database, wrong secret): nothing is changed.
   */
  load(serviceId: string): Promise<{ token: string | null; everStored: boolean } | undefined>;
  /** Stores a token, or `null` to forget it. */
  save(serviceId: string, token: string | null): Promise<void>;
}

let store: TokenStore | null = null;
/** Set by the services module; `null` turns sharing off. */
export function setTokenStore(s: TokenStore | null): void {
  store = s;
  synced.clear();
  lastSync.clear();
}

/** Token text last known to be equal on disk and in the store, per service. */
const synced = new Map<string, string>();
/** A token `agy` rejected: never put back from the store (it would only fail again). */
const dead = new Map<string, string>();
const lastSync = new Map<string, number>();
const syncing = new Map<string, Promise<void>>();
const SYNC_EVERY_MS = 60_000;

/** A token file `agy` wrote: JSON with a refresh token. Anything else is never stored or written. */
export function isTokenText(text: string): boolean {
  if (text.length > TOKEN_MAX) return false;
  try {
    const d = JSON.parse(text) as { token?: { refresh_token?: unknown } };
    return typeof d?.token?.refresh_token === "string" && d.token.refresh_token.length > 0;
  } catch {
    return false;
  }
}

/** The account a token belongs to (to tell "refreshed" from "another account"). */
const tokenEmail = (text: string): string => {
  try {
    return String((JSON.parse(text) as { id_token_email?: unknown }).id_token_email ?? "");
  } catch {
    return "";
  }
};

/** Reads the token file. With a separate user it is read AS that user (a planted symlink gains it nothing). */
async function readTokenFile(serviceId: string): Promise<string | null> {
  const file = join(homeOf(serviceId), TOKEN_FILE);
  let text: string | null;
  if (!runAs()) {
    const st = await lstat(file).catch(() => null);
    if (!st || !st.isFile() || st.size > TOKEN_MAX) return null;
    text = await readFile(file, "utf8").catch(() => null);
  } else {
    if (!existsSync(file)) return null;
    text = await new Promise<string | null>((done) => {
      const child = spawnAs("head", ["-c", String(TOKEN_MAX + 1), "--", file], { cwd: "/", env: { PATH: process.env.PATH ?? "/usr/bin:/bin" }, stdio: ["ignore", "pipe", "ignore"], detached: true });
      let out = "";
      const timer = setTimeout(() => killTree(child), 15_000);
      child.stdout.on("data", (d: Buffer) => (out += d.toString("utf8")));
      child.on("error", () => (clearTimeout(timer), done(null)));
      child.on("close", (code) => (clearTimeout(timer), done(code === 0 ? out : null)));
    });
  }
  return text !== null && isTokenText(text) ? text : null;
}

async function writeTokenFile(serviceId: string, text: string): Promise<void> {
  await ensureHome(serviceId);
  await putFile(join(homeOf(serviceId), TOKEN_FILE), text);
  await setAuthorized(serviceId, true);
  modelCache.delete(serviceId);
}

/** Copies this server's token into the store (after a sign-in here). */
export async function pushToken(serviceId: string): Promise<boolean> {
  if (!store) return false;
  const local = await readTokenFile(serviceId);
  if (!local) return false; // kept in an OS keyring: nothing to share
  await store.save(serviceId, local);
  synced.set(serviceId, local);
  dead.delete(serviceId);
  return true;
}

/**
 * Brings the token of this server and the store in line (at most once a minute unless `force`):
 * nothing here → take the stored one; refreshed here → push it; changed in the store → take it;
 * signed out elsewhere → sign out here too. A server authorised before sharing existed seeds the store.
 */
export function syncToken(serviceId: string, force = false): Promise<void> {
  if (!store || destroying.has(serviceId) || sessions.has(serviceId)) return Promise.resolve(); // not during a sign-in here
  const running = syncing.get(serviceId);
  if (running) return running;
  if (!force && Date.now() - (lastSync.get(serviceId) ?? 0) < SYNC_EVERY_MS) return Promise.resolve();
  const p = doSync(serviceId).finally(() => {
    lastSync.set(serviceId, Date.now());
    syncing.delete(serviceId);
  });
  syncing.set(serviceId, p);
  return p;
}

async function doSync(serviceId: string): Promise<void> {
  const s = store;
  if (!s) return;
  const db = await s.load(serviceId);
  if (!db) return;
  const authorized = authStatus(serviceId).authorized;
  const local = authorized ? await readTokenFile(serviceId) : null;
  const last = synced.get(serviceId);

  if (db.token === null) {
    if (db.everStored && local !== null && local === last) {
      // Signed out on another server: forget it here as well (its token was revoked there anyway).
      await setAuthorized(serviceId, false);
      await removeTree(join(homeOf(serviceId), TOKEN_FILE));
      synced.delete(serviceId);
    } else if (!db.everStored && local !== null) {
      await s.save(serviceId, local); // authorised before sharing existed: seed the store
      synced.set(serviceId, local);
    }
    return;
  }
  if (local === db.token) {
    synced.set(serviceId, local);
    return;
  }
  if (local !== null && last !== undefined && local !== last && db.token === last && tokenEmail(local) === tokenEmail(db.token)) {
    await s.save(serviceId, local); // agy refreshed it here
    synced.set(serviceId, local);
    return;
  }
  if (dead.get(serviceId) === db.token) return; // the stored token was already rejected here
  await writeTokenFile(serviceId, db.token);
  synced.set(serviceId, db.token);
}

/**
 * Best effort: asks the signed-in CLI to sign out (`/logout`), which clears the token wherever it keeps it
 * (the OS keyring is outside the service's home, so deleting the home alone would leave it behind).
 */
export async function revokeLogin(serviceId: string, waitMs = Number(process.env.ANTIGRAVITY_CLI_REVOKE_WAIT_MS) || 4000): Promise<void> {
  // Not only when "authorised": a token may exist after a sign-in that could not be verified. The CLI creates
  // `.gemini/antigravity-cli` itself the first time it runs, so that is the sign it was ever used here.
  const home = homeOf(serviceId);
  if (!authStatus(serviceId).authorized && !existsSync(join(home, ".gemini", "antigravity-cli"))) return;
  if (!existsSync(join(home, "work"))) return; // nothing was ever set up here
  const proc = spawnAs("script", ["-qfec", `stty cols 200 rows 50 2>/dev/null; exec ${shq(bin())}`, "/dev/null"], {
    cwd: join(home, "work"),
    env: childEnv(home, { TERM: "xterm" }),
    stdio: ["pipe", "ignore", "ignore"],
    detached: true,
  });
  track(serviceId, proc);
  proc.on("error", () => undefined);
  proc.stdin?.on("error", () => undefined);
  await new Promise((r) => setTimeout(r, waitMs)); // let the screen come up
  proc.stdin?.write("/logout\r");
  await new Promise((r) => setTimeout(r, waitMs)); // let it clear the saved credentials
  killTree(proc);
}

/** What an earlier version of this feature (Gemini CLI) left for a service: `<data>/gemini-cli/<id>`. */
function legacyHomeOf(serviceId: string): string {
  const dir = process.env.GEMINI_CLI_DATA_DIR?.trim() || join(process.cwd(), "data", "gemini-cli");
  return join(resolve(dir), serviceId);
}

/**
 * Deletes everything of a removed service: a running sign-in, the token (signed out first), the whole home
 * (CLI state, conversations, working dir, guard) and what is cached about it. Throws when something is
 * still there afterwards, so the caller can keep the service and let the admin retry.
 */
export async function destroyHome(serviceId: string): Promise<void> {
  const home = homeOf(serviceId);
  destroying.add(serviceId);
  try {
    cancelLogin(serviceId);
    killService(serviceId); // a running call would keep writing into the home while it is deleted
    await new Promise((r) => setTimeout(r, 100));
    await revokeLogin(serviceId).catch(() => undefined);
    await removeTree(home);
    await rm(legacyHomeOf(serviceId), { recursive: true, force: true }); // the old Gemini CLI's, made by the API itself
    modelCache.delete(serviceId);
    lastPrune.delete(serviceId);
    if (existsSync(home)) throw new AntigravityCliFailure("transient", "không xoá hết được thư mục dữ liệu của dịch vụ trên máy chủ");
  } finally {
    destroying.delete(serviceId);
  }
}

// ── Error classification ────────────────────────────────────────────────

/** "reset after 1h2m3s" / "retry in 12.5s" → milliseconds (capped at 12 h). */
export function retryAfterOf(text: string): number | undefined {
  const m = /(?:reset|retry)[^\d]{0,20}(?:(\d+)\s*h)?\s*(?:(\d+)\s*m(?!s))?\s*(?:(\d+(?:\.\d+)?)\s*s)?/i.exec(text);
  if (m && (m[1] || m[2] || m[3])) {
    const ms = (Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0)) * 1000;
    if (ms > 0) return Math.min(Math.round(ms), 12 * 3600_000);
  }
  return undefined;
}

/** Turns the CLI's exit code and messages into a classified failure. */
export function classifyFailure(exitCode: number | null, text: string): AntigravityCliFailure {
  const clean = text.replace(/\x1b\[[0-9;]*[A-Za-z]/g, "").replace(/\s+/g, " ").trim();
  const line = clean.slice(0, 260);
  if (/\b429\b|quota|RESOURCE_EXHAUSTED|rate.?limit|exhausted your capacity|too many requests|usage limit/i.test(clean)) {
    return new AntigravityCliFailure("rate", `hết hạn mức của tài khoản Google (${line})`, retryAfterOf(clean));
  }
  if (/unknown model|invalid model|model .{0,60}not (?:found|available|supported)|not entitled/i.test(clean)) {
    return new AntigravityCliFailure("auth", `model không dùng được với tài khoản này — hãy chọn model khác (${line})`);
  }
  if (/authentication (?:required|failed)|please sign in|not signed in|sign in to|log in to|unauthenticated|permission_denied|ineligible/i.test(clean)) {
    return new AntigravityCliFailure("auth", `chưa đăng nhập hoặc phiên Google đã hết hạn — hãy ủy quyền lại tài khoản (${line})`);
  }
  return new AntigravityCliFailure("transient", line || `agy thoát với mã ${exitCode ?? "?"}`);
}

/** `--output-format json` → its envelope. */
export function parseCliOutput(stdout: string): { status?: string; response?: string; error?: string } {
  const trimmed = stdout.trim();
  let data: unknown;
  try {
    data = JSON.parse(trimmed);
  } catch {
    const a = trimmed.indexOf("{");
    const b = trimmed.lastIndexOf("}");
    if (a < 0 || b <= a) return {};
    try {
      data = JSON.parse(trimmed.slice(a, b + 1));
    } catch {
      return {};
    }
  }
  const d = data as { status?: unknown; response?: unknown; error?: unknown };
  const error = typeof d.error === "string" ? d.error : d.error && typeof d.error === "object" ? String((d.error as { message?: unknown }).message ?? "") : undefined;
  return {
    status: typeof d.status === "string" ? d.status : undefined,
    response: typeof d.response === "string" ? d.response : undefined,
    error: error || undefined,
  };
}

// ── Running the CLI ─────────────────────────────────────────────────────

let running = 0;
const waiting: (() => void)[] = [];

async function acquire(): Promise<() => void> {
  if (running >= concurrency()) await new Promise<void>((r) => waiting.push(r));
  running++;
  let done = false;
  return () => {
    if (done) return;
    done = true;
    running--;
    waiting.shift()?.();
  };
}

interface Ran {
  code: number | null;
  out: string;
  err: string;
}

/** Runs `agy` once (stdin = a pipe closed at once, never /dev/null) and collects its output. */
function runOnce(serviceId: string, home: string, cwd: string, args: string[], timeoutMs: number): Promise<Ran> {
  return new Promise<Ran>((resolveRun, reject) => {
    const child = spawnAs(bin(), args, { cwd, env: childEnv(home), stdio: ["pipe", "pipe", "pipe"], detached: true });
    track(serviceId, child);
    let out = "";
    let err = "";
    let settled = false;
    const finish = (fn: () => void) => {
      if (settled) return;
      settled = true;
      clearTimeout(timer);
      fn();
    };
    const timer = setTimeout(() => {
      killTree(child);
      finish(() => reject(new AntigravityCliFailure("transient", `quá thời gian chờ (${Math.round(timeoutMs / 1000)} giây)`)));
    }, timeoutMs);
    child.stdout.on("data", (d: Buffer) => {
      out += d.toString("utf8");
      if (out.length > 4_000_000) {
        killTree(child);
        finish(() => reject(new AntigravityCliFailure("transient", "câu trả lời quá dài")));
      }
    });
    child.stderr.on("data", (d: Buffer) => {
      if (err.length < 64_000) err += d.toString("utf8");
    });
    child.on("error", (e: NodeJS.ErrnoException) =>
      finish(() =>
        reject(
          new AntigravityCliFailure(
            "transient",
            e.code === "ENOENT" ? `không tìm thấy lệnh “${bin()}” — cài Antigravity CLI hoặc đặt ANTIGRAVITY_CLI_BIN` : `không chạy được agy: ${e.message}`,
          ),
        ),
      ),
    );
    child.on("close", (code) => finish(() => resolveRun({ code, out, err })));
    child.stdin.on("error", () => undefined);
    child.stdin.end();
  });
}

export interface CliCall {
  serviceId: string;
  /** `""` / `default` = the CLI's own default model. */
  model: string;
  prompt: string;
  /** PNG to read (OCR): written into the working dir and named in the prompt. */
  image?: Buffer;
  timeoutMs?: number;
}

export async function runAntigravityCli(call: CliCall): Promise<string> {
  const model = call.model.trim();
  if (!isValidCliModel(model)) throw new AntigravityCliFailure("auth", `tên model không hợp lệ: ${model.slice(0, 40)}`);
  await syncToken(call.serviceId).catch(() => undefined); // a sign-in made on another server
  if (!authStatus(call.serviceId).authorized) {
    throw new AntigravityCliFailure("auth", "chưa ủy quyền tài khoản Google cho dịch vụ này — bấm “Ủy quyền tài khoản Google”");
  }
  const home = await ensureHome(call.serviceId);
  const work = join(home, "work");
  // `@path` makes the CLI read a file: user text (words, sentences from imports) must not be able to do that,
  // so its "@" becomes a full-width one. Only the file named below is ours.
  let prompt = call.prompt.replace(/@/g, "＠");
  let imageFile: string | undefined;
  if (call.image) {
    const name = `img-${randomUUID()}.png`;
    imageFile = join(work, name);
    await putFile(imageFile, call.image);
    prompt += `\n\nThe image to read is the file ${name} in the current directory — open and look at it.`;
  }

  const timeoutMs = call.timeoutMs ?? callTimeoutMs();
  // `-p` takes the NEXT token as the prompt, so it is attached (`-p=…`): safe even if the prompt starts with a dash.
  const args = [
    "--output-format", "json",
    "--mode", "plan",
    "--disable-slash-commands",
    "--print-timeout", `${Math.max(5, Math.round(timeoutMs / 1000) - 5)}s`,
  ];
  if (model && model !== DEFAULT_MODEL) args.push("--model", model);
  args.push(`-p=${prompt}`);

  const release = await acquire();
  try {
    const { code, out, err } = await runOnce(call.serviceId, home, work, args, timeoutMs);
    const parsed = parseCliOutput(out);
    if (code === 0 && parsed.response !== undefined && !parsed.error && (parsed.status === undefined || parsed.status === "SUCCESS")) {
      return parsed.response;
    }
    const failure = classifyFailure(code, `${parsed.error ?? ""} ${err} ${parsed.response === undefined ? out : ""}`);
    if (failure.kind === "auth" && /chưa đăng nhập/.test(failure.message)) {
      const bad = synced.get(call.serviceId);
      if (bad) dead.set(call.serviceId, bad);
      void setAuthorized(call.serviceId, false);
    }
    throw failure;
  } finally {
    release();
    if (imageFile) void removeTree(imageFile).catch(() => undefined);
    if (running === 0) void pruneHistory(call.serviceId).catch(() => undefined);
  }
}

// ── Models ──────────────────────────────────────────────────────────────

export interface CliModel {
  id: string;
  isDefault?: boolean;
  note?: string;
}

/** Model ids (`gemini-3.8-flash`, `claude-sonnet-4-6`…) out of `agy models`; a line without one is ignored. */
export function parseModels(text: string): CliModel[] {
  const out: CliModel[] = [];
  const seen = new Set<string>();
  for (const raw of text.replace(/\x1b\[[0-9;?]*[A-Za-z]/g, "").split(/\r?\n/)) {
    const line = raw.trim();
    if (!line || /^(fetching|available|error|please|models?:?$)/i.test(line)) continue;
    const token = line.replace(/^[^A-Za-z0-9]+/, "").split(/[\s,(|]+/)[0] ?? "";
    // An id is lower-case words joined by dashes: `gemini-3.1-pro-high`.
    if (!/^[a-z][a-z0-9.]*(?:-[a-z0-9.]+)+$/.test(token) || seen.has(token)) continue;
    seen.add(token);
    out.push({ id: token, isDefault: /default/i.test(line) || undefined, note: line.length > token.length ? line.slice(0, 120) : undefined });
  }
  return out;
}

/** Runs `agy models` in the service's home: succeeds only when the account is really signed in. */
export async function checkSignedIn(serviceId: string): Promise<{ ok: boolean; models: CliModel[]; text: string }> {
  const home = await ensureHome(serviceId);
  let r: Ran;
  try {
    r = await runOnce(serviceId, home, join(home, "work"), ["models"], 45_000);
  } catch (e) {
    return { ok: false, models: [], text: e instanceof Error ? e.message : String(e) };
  }
  const text = `${r.out}\n${r.err}`.trim();
  const ok = r.code === 0 && !/sign in|not signed|authentication required|log in/i.test(text);
  return { ok, models: ok ? parseModels(r.out) : [], text };
}

/** The models the signed-in account can use now (cached for 5 minutes); `null` when it cannot be listed. */
export async function listCliModels(serviceId: string): Promise<CliModel[] | null> {
  const hit = modelCache.get(serviceId);
  if (hit && Date.now() - hit.at < 300_000) return hit.list;
  await syncToken(serviceId).catch(() => undefined);
  if (!authStatus(serviceId).authorized) return null;
  const r = await checkSignedIn(serviceId);
  if (!r.ok || r.models.length === 0) return null;
  modelCache.set(serviceId, { at: Date.now(), list: r.models });
  return r.models;
}

// ── Web authorisation (the CLI's own Google sign-in, driven from the admin page) ──

export type LoginState = "idle" | "starting" | "awaiting_code" | "verifying" | "done" | "failed";

export interface LoginStatus {
  state: LoginState;
  /** Google's consent page — the admin opens it, approves, and copies the code it shows. */
  url?: string;
  error?: string;
}

interface LoginSession {
  state: LoginState;
  url?: string;
  error?: string;
  proc: ChildProcess;
  buf: string;
  menuSent: boolean;
  checking: boolean;
  /** The code the admin typed: the CLI echoes it on screen, so it is masked in anything shown back. */
  code?: string;
  verifyUntil: number;
  timers: NodeJS.Timeout[];
}

const sessions = new Map<string, LoginSession>();
const LOGIN_TIMEOUT_MS = 6 * 60_000;
const VERIFY_MS = 60_000;
const AUTH_URL = /https:\/\/accounts\.google\.com\/o\/oauth2\/[^\s"'<>\x1b\x07]+/g;
const OSC8_URL = /\x1b\]8;[^;\x07\x1b]*;(https:\/\/accounts\.google\.com\/[^\x07\x1b]+)(?:\x07|\x1b\\)/g;

/** Terminal escape sequences and carriage returns out of what the CLI prints. */
export function stripAnsi(s: string): string {
  return s
    .replace(/\x1b\][^\x07\x1b]*(?:\x07|\x1b\\)/g, "")
    .replace(/\x1b\[[0-9;?<>]*[ -/]*[@-~]/g, "")
    .replace(/\x1b[()][A-Za-z0-9]/g, "")
    .replace(/\r/g, "");
}

/** The latest Google authorisation link in the CLI's output: an OSC-8 hyperlink (exact), else the visible text. */
export function lastAuthUrl(text: string): string | undefined {
  const osc = [...text.matchAll(OSC8_URL)];
  if (osc.length > 0) return osc[osc.length - 1]![1];
  const all = stripAnsi(text).match(AUTH_URL);
  return all?.[all.length - 1];
}

const shq = (s: string): string => `'${s.replace(/'/g, `'\\''`)}'`;

/** Last lines of the CLI screen (links removed), to tell the admin what went wrong. */
function screenTail(buf: string, code?: string): string {
  let text = stripAnsi(buf);
  if (code) text = text.split(code).join("<code>").split(code.split("").join(" ")).join("<code>");
  return text
    .split("\n")
    .map((l) => l.replace(/https?:\/\/\S+/g, "<link>").trim())
    .filter(Boolean)
    .slice(-4)
    .join(" · ")
    .slice(0, 300);
}

export function loginStatus(serviceId: string): LoginStatus {
  const s = sessions.get(serviceId);
  if (!s) return { state: authStatus(serviceId).authorized ? "done" : "idle" };
  return { state: s.state, url: s.state === "awaiting_code" || s.state === "verifying" ? s.url : undefined, error: s.error };
}

function endSession(serviceId: string, s: LoginSession, state: LoginState, error?: string): void {
  if (s.state === "done" || s.state === "failed") return;
  s.state = state;
  s.error = error;
  for (const t of s.timers) clearTimeout(t);
  s.timers = [];
  killTree(s.proc);
  setTimeout(() => {
    if (sessions.get(serviceId) === s) sessions.delete(serviceId);
  }, 60_000).unref();
}

export function cancelLogin(serviceId: string): void {
  const s = sessions.get(serviceId);
  if (!s) return;
  endSession(serviceId, s, "failed", "đã huỷ");
  sessions.delete(serviceId);
}

/** Stops every running sign-in (server shutdown). */
export function cancelAllLogins(): void {
  for (const id of [...sessions.keys()]) cancelLogin(id);
}

/**
 * Starts the CLI's Google sign-in in a pseudo-terminal (util-linux `script`; a wide terminal so the link
 * is never wrapped), picks "Google OAuth" in its menu and returns once the link is known. Poll
 * `loginStatus` until `awaiting_code`, then call `submitLoginCode`.
 */
export async function startLogin(serviceId: string): Promise<LoginStatus> {
  const home = await ensureHome(serviceId);
  if (sessions.has(serviceId)) cancelLogin(serviceId);
  await setAuthorized(serviceId, false); // a fresh sign-in replaces the old one
  // With a token file in place agy signs itself in and never shows the login menu (only its colour-scheme
  // onboarding): remove it so the admin gets a link. The copy in the store stays until the new sign-in replaces it.
  await removeTree(join(home, TOKEN_FILE));
  synced.delete(serviceId);

  const proc = spawnAs("script", ["-qfec", `stty cols 4000 rows 50 2>/dev/null; exec ${shq(bin())}`, "/dev/null"], {
    cwd: join(home, "work"),
    // SSH hints make the CLI print the link instead of opening a browser.
    env: childEnv(home, { TERM: "xterm", SSH_CONNECTION: "127.0.0.1 50000 127.0.0.1 22", SSH_TTY: "/dev/pts/0" }),
    stdio: ["pipe", "pipe", "pipe"],
    detached: true,
  });
  track(serviceId, proc);
  const s: LoginSession = { state: "starting", proc, buf: "", menuSent: false, checking: false, verifyUntil: 0, timers: [] };
  sessions.set(serviceId, s);

  const onData = (d: Buffer) => {
    s.buf = (s.buf + d.toString("utf8")).slice(-200_000);
    if (!s.menuSent && s.state === "starting" && /Select login method/i.test(stripAnsi(s.buf))) {
      s.menuSent = true;
      s.proc.stdin?.write("\r"); // option 1: Google OAuth
    }
    // Already signed in (token in an OS keyring, say): agy goes straight to its first-run onboarding. No link
    // will come, so check with `agy models` (the watcher below) and finish when the account really works.
    if (s.state === "starting" && /Choose your color scheme|Signing in\.\.\./i.test(stripAnsi(s.buf))) {
      s.state = "verifying";
      s.verifyUntil = Date.now() + VERIFY_MS;
    }
    // The CLI says so itself when Google refuses the code ("token exchange failed … invalid_grant").
    if (s.state === "verifying" && /invalid_grant|token exchange failed/i.test(stripAnsi(s.buf))) {
      return endSession(serviceId, s, "failed", "Google từ chối mã (invalid_grant): mã sai, đã dùng hoặc đã hết hạn — bấm “Tạo liên kết đăng nhập” để lấy liên kết mới");
    }
    const url = lastAuthUrl(s.buf);
    if (url && url !== s.url && s.state !== "done" && s.state !== "failed") {
      const retry = s.state === "verifying";
      s.url = url;
      s.state = "awaiting_code";
      s.error = retry ? "mã không đúng hoặc đã hết hạn — mở liên kết mới bên dưới rồi nhập lại" : undefined;
    }
  };
  proc.stdout.on("data", onData);
  proc.stderr.on("data", onData);
  proc.stdin.on("error", () => undefined);
  proc.on("error", (e: NodeJS.ErrnoException) =>
    endSession(serviceId, s, "failed", e.code === "ENOENT" ? "không có lệnh `script` (gói util-linux/bsdutils) hoặc agy" : e.message),
  );
  proc.on("close", () => {
    if (s.state === "done" || s.state === "failed") return;
    endSession(serviceId, s, "failed", screenTail(s.buf, s.code) || "agy đã thoát trước khi đăng nhập xong");
  });

  // While verifying, ask the CLI itself whether it is signed in now (`agy models`).
  const watch = setInterval(() => {
    if (s.state === "done" || s.state === "failed") return clearInterval(watch);
    if (s.state !== "verifying" || s.checking) return;
    if (Date.now() > s.verifyUntil) {
      clearInterval(watch);
      return endSession(
        serviceId,
        s,
        "failed",
        `không xác minh được đăng nhập sau khi nhập mã (có thể mã sai, hoặc máy chủ không lưu được token vì thiếu keyring): ${screenTail(s.buf, s.code)}`,
      );
    }
    s.checking = true;
    void checkSignedIn(serviceId)
      .then(async (r) => {
        if (r.ok && s.state === "verifying") {
          clearInterval(watch);
          await setAuthorized(serviceId, true);
          modelCache.delete(serviceId);
          await pushToken(serviceId).catch(() => undefined); // share it with the other servers
          endSession(serviceId, s, "done");
        }
      })
      .finally(() => {
        s.checking = false;
      });
  }, 3000);
  watch.unref();
  s.timers.push(setTimeout(() => endSession(serviceId, s, "failed", "hết thời gian chờ (6 phút) — hãy bắt đầu lại"), LOGIN_TIMEOUT_MS));
  s.timers[0]?.unref();

  // Wait briefly for the link so the first answer already carries it.
  for (let i = 0; i < 80 && s.state === "starting"; i++) await new Promise((r) => setTimeout(r, 250));
  if (s.state === "starting") {
    endSession(serviceId, s, "failed", `agy không in ra liên kết đăng nhập: ${screenTail(s.buf) || "không có đầu ra"}`);
  }
  return loginStatus(serviceId);
}

/** The admin pasted the code Google showed; type it into the CLI. */
export function submitLoginCode(serviceId: string, code: string): LoginStatus {
  const s = sessions.get(serviceId);
  if (!s || s.state !== "awaiting_code") throw new AntigravityCliFailure("transient", "chưa có phiên đăng nhập đang chờ mã — bấm “Ủy quyền” trước");
  const c = code.trim();
  if (!AUTH_CODE.test(c)) throw new AntigravityCliFailure("transient", "mã không đúng định dạng");
  s.state = "verifying";
  s.error = undefined;
  s.verifyUntil = Date.now() + VERIFY_MS;
  s.code = c;
  s.buf = ""; // from here on only what the CLI says about this code counts
  s.proc.stdin?.write(`${c}\r`);
  return loginStatus(serviceId);
}
