import { chmodSync, chownSync, existsSync, symlinkSync, mkdirSync, mkdtempSync, readdirSync, readFileSync, rmSync, statSync, utimesSync, writeFileSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { tmpdir, userInfo } from "node:os";
import { join } from "node:path";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import {
  AntigravityCliFailure,
  authStatus,
  cancelLogin,
  checkSignedIn,
  destroyHome,
  classifyFailure,
  ensureHome,
  GUARD_SOURCE,
  guardHooks,
  homeOf,
  isValidCliModel,
  lastAuthUrl,
  listCliModels,
  loginStatus,
  logout,
  parseCliOutput,
  parseModels,
  pruneHistory,
  retryAfterOf,
  runAntigravityCli,
  startLogin,
  stripAnsi,
  submitLoginCode,
} from "./ai-antigravity-cli.js";

const ID = "0123456789abcdef01234567";
const OTHER = "fedcba9876543210fedcba98";

let dir: string;
const script = (name: string, body: string): string => {
  const p = join(dir, name);
  writeFileSync(p, `#!/bin/bash\n${body}\n`);
  chmodSync(p, 0o755);
  return p;
};
const authorise = async (id: string): Promise<void> => {
  const home = await ensureHome(id);
  writeFileSync(join(home, ".authorized"), "x");
};
const envelope = (response: string): string => `echo '${JSON.stringify({ conversation_id: "c", status: "SUCCESS", response })}'`;

beforeAll(() => {
  dir = mkdtempSync(join(tmpdir(), "agy-spec-"));
  process.env.ANTIGRAVITY_CLI_DATA_DIR = join(dir, "data");
  process.env.ANTIGRAVITY_CLI_REVOKE_WAIT_MS = "300"; // the real wait (4 s) is for a real CLI to start
});
afterAll(() => {
  cancelLogin("89abcdef0123456789abcdef");
  rmSync(dir, { recursive: true, force: true });
  delete process.env.ANTIGRAVITY_CLI_DATA_DIR;
  delete process.env.ANTIGRAVITY_CLI_BIN;
});

describe("output parsing and failure classification", () => {
  it("reads the JSON envelope of `--output-format json`, even with noise around it", () => {
    expect(parseCliOutput('{"status":"SUCCESS","response":"ok"}')).toMatchObject({ status: "SUCCESS", response: "ok" });
    expect(parseCliOutput('note\n{"response":"hi"}\n').response).toBe("hi");
    expect(parseCliOutput('{"status":"ERROR","response":"","error":"boom"}')).toMatchObject({ status: "ERROR", error: "boom" });
    expect(parseCliOutput("not json")).toEqual({});
  });

  it("quota → rate (with the reset time), sign-in problems → auth, unknown model → auth, the rest → transient", () => {
    const rate = classifyFailure(1, "RESOURCE_EXHAUSTED: quota exceeded, reset after 1h2m3s");
    expect(rate.kind).toBe("rate");
    expect(rate.retryAfterMs).toBe((3600 + 120 + 3) * 1000);
    const auth = classifyFailure(1, "Error: authentication required. Run 'agy' to log in, then retry. error: authentication failed or timed out");
    expect(auth.kind).toBe("auth");
    expect(auth.message).toContain("ủy quyền lại");
    const model = classifyFailure(1, "Error: unknown model gemini-9");
    expect(model.kind).toBe("auth");
    expect(model.message).toContain("model");
    expect(classifyFailure(1, "something odd happened").kind).toBe("transient");
    expect(classifyFailure(null, "").kind).toBe("transient");
  });

  it("retry hints", () => {
    expect(retryAfterOf("please retry in 12.5s")).toBe(12_500);
    expect(retryAfterOf("quota resets after 45m")).toBe(45 * 60_000);
    expect(retryAfterOf("nothing here")).toBeUndefined();
    expect(retryAfterOf("reset after 99h")).toBe(12 * 3600_000);
  });

  it("model ids out of `agy models`, ignoring headers and plain words", () => {
    const out = "Fetching available models...\n* gemini-3.8-flash (default)\n  gemini-3.1-pro-high  Gemini 3.1 Pro\n- claude-sonnet-4-6\nAvailable models:\nGemini Flash\n";
    expect(parseModels(out).map((m) => m.id)).toEqual(["gemini-3.8-flash", "gemini-3.1-pro-high", "claude-sonnet-4-6"]);
    expect(parseModels(out)[0]).toMatchObject({ isDefault: true });
    expect(parseModels("Error: Please sign in")).toEqual([]);
  });

  it("only safe model ids reach `--model`", () => {
    expect(isValidCliModel("gemini-3.8-flash")).toBe(true);
    expect(isValidCliModel("")).toBe(true);
    expect(isValidCliModel("--dangerously-skip-permissions")).toBe(false);
    expect(isValidCliModel("a b")).toBe(false);
  });
});

describe("login link extraction", () => {
  it("prefers the exact OSC-8 hyperlink, else the visible link, and returns the latest", () => {
    const a = "https://accounts.google.com/o/oauth2/auth?state=one&redirect_uri=https%3A%2F%2Fantigravity.google%2Foauth-callback";
    const b = "https://accounts.google.com/o/oauth2/auth?state=two";
    const osc = (u: string) => `\x1b]8;id=k${u.length};${u}\x1b\\`;
    expect(lastAuthUrl(`\x1b[2J${osc(a)}\x1b[94mCopy\x1b[m\n${osc(a)}\x1b]8;;\x1b\\`)).toBe(a);
    expect(lastAuthUrl(`${osc(a)}\r\nFailed\r\n${osc(b)}`)).toBe(b);
    expect(lastAuthUrl(`\x1b[0JPlease visit:\r\n${b}\r\n`)).toBe(b);
    expect(lastAuthUrl("no link")).toBeUndefined();
    expect(stripAnsi("\x1b[31mred\x1b[0m\r\x1b]8;;\x1b\\")).toBe("red");
  });
});

describe("service homes", () => {
  it("rejects ids that are not Mongo ids (no path tricks)", () => {
    expect(() => homeOf("../../etc")).toThrow(AntigravityCliFailure);
    expect(() => homeOf(ID)).not.toThrow();
  });

  it("authorisation = the marker; logout removes the marker and the CLI's saved state", async () => {
    expect(authStatus(OTHER)).toEqual({ authorized: false, account: null });
    await authorise(OTHER);
    mkdirSync(join(homeOf(OTHER), ".gemini", "antigravity-cli"), { recursive: true });
    expect(authStatus(OTHER).authorized).toBe(true);
    await logout(OTHER);
    expect(authStatus(OTHER).authorized).toBe(false);
    expect(existsSync(join(homeOf(OTHER), ".gemini"))).toBe(false);
  });
});

const removeTreeViaLogout = async (id: string): Promise<void> => {
  await logout(id); // rm -rf of the CLI state + the marker, through the agy user
};

describe("running agy as its own operating-system user", () => {
  const nobody = (() => {
    try {
      const l = readFileSync("/etc/passwd", "utf8").split("\n").find((x) => x.startsWith("nobody:"))?.split(":");
      return l ? { uid: Number(l[2]), gid: Number(l[3]) } : null;
    } catch {
      return null;
    }
  })();
  const canDrop = userInfo().uid === 0 && nobody !== null;
  const setUser = (v: string | undefined) => {
    if (v === undefined) delete process.env.ANTIGRAVITY_CLI_USER;
    else process.env.ANTIGRAVITY_CLI_USER = v;
  };

  it("refuses an invalid name, root, an unknown user, and a non-root API", async () => {
    try {
      setUser("Bad Name!");
      await expect(ensureHome("8888888888888888aaaaaaaa")).rejects.toBeInstanceOf(AntigravityCliFailure);
      if (userInfo().uid === 0) {
        setUser("root");
        await expect(ensureHome("8888888888888888aaaaaaaa")).rejects.toThrow(/root/);
        setUser("no-such-user-xyz");
        await expect(ensureHome("8888888888888888aaaaaaaa")).rejects.toThrow(/không có user/);
      } else {
        setUser("nobody");
        await expect(ensureHome("8888888888888888aaaaaaaa")).rejects.toThrow(/root/); // cannot drop privileges
      }
    } finally {
      setUser(undefined);
    }
  });

  it.skipIf(!canDrop)("runs agy and EVERY file operation inside the home through setpriv (never as root), without new privileges", async () => {
    const id = "9999999999999999aaaaaaaa";
    const log = join(dir, "setpriv.log");
    rmSync(log, { force: true });
    // Fake setpriv: records each invocation, then runs the real command.
    script("setpriv", `{ printf '%s\\n' "$@"; echo '---'; } >> ${log}\nwhile [ "$1" != "--" ]; do shift; done; shift\nexec "$@"`);
    const savedPath = process.env.PATH;
    process.env.PATH = `${dir}:${savedPath}`;
    const data = process.env.ANTIGRAVITY_CLI_DATA_DIR!;
    try {
      setUser("nobody");
      // The data dir and the home belong to the agy user (what the setup script arranges).
      mkdirSync(join(homeOf(id), "work"), { recursive: true });
      chownSync(data, nobody!.uid, nobody!.gid);
      chownSync(homeOf(id), nobody!.uid, nobody!.gid);
      process.env.ANTIGRAVITY_CLI_BIN = script("asuser.sh", `echo "$USER" > ${log}.user\n${envelope("ok")}`);
      await authorise(id);
      expect(await runAntigravityCli({ serviceId: id, model: "default", prompt: "p", image: Buffer.from([1, 2]) })).toBe("ok");
      await removeTreeViaLogout(id);
      const runs = readFileSync(log, "utf8").split("---\n").filter(Boolean).map((r) => r.split("\n").filter(Boolean));
      for (const r of runs) {
        expect(r).toContain(`--reuid=${nobody!.uid}`);
        expect(r).toContain(`--regid=${nobody!.gid}`);
        expect(r).toContain("--clear-groups");
        expect(r).toContain("--no-new-privs");
        expect(r.indexOf("--")).toBeGreaterThan(r.indexOf("--no-new-privs"));
      }
      const joined = runs.map((r) => r.join(" ")).join("\n");
      expect(joined).toMatch(/guard\.mjs/); // the guard was written by the agy user
      expect(joined).toMatch(/hooks\.json/);
      expect(joined).toMatch(/img-[0-9a-f-]+\.png/); // the page image too
      expect(joined).toMatch(/rm -rf --/); // and removal
      expect(runs.some((r) => r.some((x) => x.endsWith("asuser.sh")))).toBe(true); // the CLI itself
      expect(readFileSync(`${log}.user`, "utf8").trim()).toBe("nobody");
    } finally {
      setUser(undefined);
      process.env.PATH = savedPath;
      rmSync(join(dir, "setpriv"), { force: true });
    }
  }, 30_000);

  it.skipIf(!canDrop)("refuses a home that is a symlink or not owned by the agy user (nothing is written through it)", async () => {
    const id = "aaaaaaaaaaaaaaaa11111111";
    const victim = join(dir, "victim-dir");
    mkdirSync(victim, { recursive: true });
    const data = process.env.ANTIGRAVITY_CLI_DATA_DIR!;
    try {
      setUser("nobody");
      chownSync(data, nobody!.uid, nobody!.gid);
      symlinkSync(victim, homeOf(id)); // what a compromised agent could plant
      await expect(ensureHome(id)).rejects.toThrow(/không thuộc user nobody/);
      expect(readdirSync(victim)).toEqual([]); // nothing was created through the link
      rmSync(homeOf(id), { force: true });
      mkdirSync(homeOf(id)); // a real directory, but owned by root
      await expect(ensureHome(id)).rejects.toThrow(/không thuộc user nobody/);
      chownSync(data, 0, 0);
      await expect(ensureHome(id)).rejects.toThrow(/không thuộc user nobody/); // the data dir itself
    } finally {
      setUser(undefined);
      chownSync(data, 0, 0);
      rmSync(homeOf(id), { recursive: true, force: true });
    }
  });
});

describe("tool guard (PreToolUse hook)", () => {
  const ask = async (id: string, toolCall: unknown): Promise<string> => {
    const home = await ensureHome(id);
    const r = spawnSync(process.execPath, [join(home, "guard.mjs"), join(home, "work")], { input: JSON.stringify({ toolCall }), encoding: "utf8" });
    return (JSON.parse(r.stdout) as { decision: string }).decision;
  };

  it("is installed in the user config dir and the working dir, and runs the guard by absolute path", async () => {
    const home = await ensureHome(OTHER);
    for (const f of [join(home, ".gemini", "config", "hooks.json"), join(home, "work", ".agents", "hooks.json")]) {
      const hooks = JSON.parse(readFileSync(f, "utf8")) as { guard: { PreToolUse: { matcher: string; hooks: { command: string }[] }[] } };
      expect(hooks.guard.PreToolUse[0]!.matcher).toBe("*");
      expect(hooks.guard.PreToolUse[0]!.hooks[0]!.command).toContain(join(home, "guard.mjs"));
    }
    expect(readFileSync(join(home, "guard.mjs"), "utf8")).toBe(GUARD_SOURCE);
    expect(guardHooks(home)).toBe(readFileSync(join(home, ".gemini", "config", "hooks.json"), "utf8"));
  });

  it("allows viewing a file inside the working dir and denies everything else", async () => {
    const work = join(homeOf(OTHER), "work");
    expect(await ask(OTHER, { name: "view_file", args: { AbsolutePath: join(work, "img-1.png") } })).toBe("allow");
    expect(await ask(OTHER, { name: "view_file", args: { path: "img-1.png" } })).toBe("deny"); // no path-like value to check
    expect(await ask(OTHER, { name: "view_file", args: { AbsolutePath: "/root/Nihongo-Path/apps/api/.env" } })).toBe("deny");
    expect(await ask(OTHER, { name: "view_file", args: { AbsolutePath: join(work, "..", "..", "x", ".env") } })).toBe("deny");
    expect(await ask(OTHER, { name: "view_file", args: { AbsolutePath: join(work, "a.png"), Other: "file:///etc/passwd" } })).toBe("deny");
    expect(await ask(OTHER, { name: "view_file", args: { AbsolutePath: "~/.ssh/id_rsa" } })).toBe("deny");
    for (const name of ["run_command", "write_to_file", "search_web", "read_url_content", "browser_subagent", "list_dir", "grep_search"]) {
      expect(await ask(OTHER, { name, args: { CommandLine: `${work}/x`, Url: "https://example.com/" } }), name).toBe("deny");
    }
    expect(await ask(OTHER, "garbage")).toBe("deny");
  });
});

describe("removing a service", () => {
  it("signs the CLI out, then deletes the home, sign-in state, conversations and working files", async () => {
    const id = "2222222222222222bbbbbbbb";
    const flag = join(process.env.ANTIGRAVITY_CLI_DATA_DIR!, "revoked.flag");
    rmSync(flag, { force: true });
    // Fake agy: on "/logout" it records that it was asked (outside the home, which is about to vanish).
    process.env.ANTIGRAVITY_CLI_BIN = script("revoke.sh", `read -r line\n[ "$line" = "/logout" ] && touch "${flag}"\nsleep 5`);
    const home = await ensureHome(id);
    writeFileSync(join(home, ".authorized"), "x");
    mkdirSync(join(home, ".gemini", "antigravity-cli", "brain", "c1"), { recursive: true });
    writeFileSync(join(home, ".gemini", "antigravity-cli", "brain", "c1", "transcript.jsonl"), "secret prompt");
    writeFileSync(join(home, "work", "img-1.png"), "x");

    await destroyHome(id);

    expect(existsSync(flag)).toBe(true); // asked to sign out first
    expect(existsSync(home)).toBe(false); // nothing left of the service
    expect(authStatus(id).authorized).toBe(false);
  }, 20_000);

  it("stops a call that is still running, and nothing recreates the home afterwards", async () => {
    const id = "6666666666666666ffffffff";
    process.env.ANTIGRAVITY_CLI_BIN = script("long.sh", `sleep 30`);
    await authorise(id);
    const running = runAntigravityCli({ serviceId: id, model: "default", prompt: "p", timeoutMs: 60_000 });
    const settled = running.then(() => "ok", (e: unknown) => (e instanceof AntigravityCliFailure ? e.kind : "other"));
    await new Promise((r) => setTimeout(r, 300)); // the process is up
    await destroyHome(id);
    expect(await settled).toBe("transient"); // killed, not left running
    await new Promise((r) => setTimeout(r, 300));
    expect(existsSync(homeOf(id))).toBe(false);
  }, 20_000);

  it("signs out even when the sign-in could not be verified (state exists, no marker)", async () => {
    const id = "7777777777777777aaaaaaaa";
    const flag = join(process.env.ANTIGRAVITY_CLI_DATA_DIR!, "revoked2.flag");
    rmSync(flag, { force: true });
    process.env.ANTIGRAVITY_CLI_BIN = script("revoke2.sh", `read -r line\n[ "$line" = "/logout" ] && touch "${flag}"\nsleep 5`);
    const home = await ensureHome(id);
    mkdirSync(join(home, ".gemini", "antigravity-cli"), { recursive: true }); // agy ran here once; no .authorized
    await destroyHome(id);
    expect(existsSync(flag)).toBe(true);
    expect(existsSync(home)).toBe(false);
  }, 20_000);

  it("a service that never signed in is removed without starting the CLI", async () => {
    const id = "3333333333333333cccccccc";
    process.env.ANTIGRAVITY_CLI_BIN = join(dir, "must-not-run");
    const home = await ensureHome(id);
    await destroyHome(id);
    expect(existsSync(home)).toBe(false);
  });

  it("also removes what the earlier Gemini CLI version left for that service", async () => {
    const id = "4444444444444444dddddddd";
    const legacyRoot = join(dir, "legacy");
    process.env.GEMINI_CLI_DATA_DIR = legacyRoot;
    mkdirSync(join(legacyRoot, id, ".gemini"), { recursive: true });
    writeFileSync(join(legacyRoot, id, ".gemini", "oauth_creds.json"), "token");
    await ensureHome(id);
    await destroyHome(id);
    delete process.env.GEMINI_CLI_DATA_DIR;
    expect(existsSync(join(legacyRoot, id))).toBe(false);
  });

  // Root can delete anything, so this can only be shown as a normal user.
  it.skipIf(userInfo().uid === 0)("fails loudly (so the service is kept) when the data cannot be deleted", async () => {
    const id = "5555555555555555eeeeeeee";
    const home = await ensureHome(id);
    mkdirSync(join(home, "locked"), { recursive: true });
    writeFileSync(join(home, "locked", "f"), "x");
    chmodSync(join(home, "locked"), 0o500); // cannot unlink inside
    await expect(destroyHome(id)).rejects.toBeInstanceOf(AntigravityCliFailure);
    chmodSync(join(home, "locked"), 0o700);
    rmSync(home, { recursive: true, force: true });
  });
});

describe("history retention", () => {
  it("removes conversations older than the limit and keeps recent ones", async () => {
    const id = "1111111111111111aaaaaaaa";
    const home = await ensureHome(id);
    const base = join(home, ".gemini", "antigravity-cli");
    for (const sub of ["brain", "conversations", "implicit"]) {
      mkdirSync(join(base, sub, "old"), { recursive: true });
      mkdirSync(join(base, sub, "new"), { recursive: true });
      const past = new Date(Date.now() - 48 * 3600_000);
      utimesSync(join(base, sub, "old"), past, past);
    }
    await pruneHistory(id, 24 * 3600_000, true);
    for (const sub of ["brain", "conversations", "implicit"]) {
      expect(readdirSync(join(base, sub))).toEqual(["new"]);
    }
  });
});

describe("runAntigravityCli", () => {
  it("refuses to run before the account is authorised (no process started)", async () => {
    process.env.ANTIGRAVITY_CLI_BIN = join(dir, "does-not-exist");
    await expect(runAntigravityCli({ serviceId: "aaaaaaaaaaaaaaaaaaaaaaaa", model: "default", prompt: "x" })).rejects.toMatchObject({ kind: "auth" });
  });

  it("passes the prompt as -p=…, with the safe flags, a closed stdin pipe (not the /dev/null character device) and no secrets", async () => {
    const log = join(dir, "args.log");
    process.env.ANTIGRAVITY_CLI_BIN = script(
      "ok.sh",
      `printf '%s\\n' "$@" > ${log}\npwd > ${log}.cwd\n[ -c /dev/stdin ] && echo chardev > ${log}.stdin || echo pipe > ${log}.stdin\nenv | grep -c -E 'JWT_ACCESS_SECRET|GEMINI_API_KEY' > ${log}.env || true\necho "$HOME" > ${log}.home\n${envelope('{"items":[]}')}`,
    );
    process.env.JWT_ACCESS_SECRET = "top-secret";
    process.env.GEMINI_API_KEY = "key";
    await authorise(ID);
    const text = await runAntigravityCli({ serviceId: ID, model: "gemini-3.8-flash", prompt: "- dịch câu này" });
    delete process.env.JWT_ACCESS_SECRET;
    delete process.env.GEMINI_API_KEY;
    expect(text).toBe('{"items":[]}');
    const args = readFileSync(log, "utf8").split("\n");
    expect(args).toContain("-p=- dịch câu này"); // attached, so a leading dash is harmless
    expect(args).toContain("--mode");
    expect(args).toContain("plan");
    expect(args).toContain("--output-format");
    expect(args).toContain("json");
    expect(args).toContain("--disable-slash-commands");
    expect(args).toContain("--print-timeout");
    expect(args.join(" ")).toContain("--model gemini-3.8-flash");
    expect(readFileSync(`${log}.stdin`, "utf8").trim()).toBe("pipe");
    expect(readFileSync(`${log}.cwd`, "utf8").trim()).toBe(join(homeOf(ID), "work"));
    expect(readFileSync(`${log}.home`, "utf8").trim()).toBe(homeOf(ID));
    expect(readFileSync(`${log}.env`, "utf8").trim()).toBe("0");
  });

  it("model `default` leaves --model out; a model that looks like a flag is refused", async () => {
    const log = join(dir, "args2.log");
    process.env.ANTIGRAVITY_CLI_BIN = script("def.sh", `printf '%s\\n' "$@" > ${log}\n${envelope("x")}`);
    await runAntigravityCli({ serviceId: ID, model: "default", prompt: "p" });
    expect(readFileSync(log, "utf8")).not.toContain("--model");
    await expect(runAntigravityCli({ serviceId: ID, model: "--dangerously-skip-permissions", prompt: "p" })).rejects.toBeInstanceOf(AntigravityCliFailure);
  });

  it("an `@path` inside user text cannot make the CLI read a file", async () => {
    const log = join(dir, "at.log");
    process.env.ANTIGRAVITY_CLI_BIN = script("at.sh", `printf '%s\\n' "$@" > ${log}\n${envelope("x")}`);
    await runAntigravityCli({ serviceId: ID, model: "default", prompt: "từ: @/etc/passwd và a@b.com" });
    expect(readFileSync(log, "utf8")).toContain("-p=từ: ＠/etc/passwd và a＠b.com");
  });

  it("an image is written into the working dir, named in the prompt, and deleted afterwards", async () => {
    const log = join(dir, "img.log");
    process.env.ANTIGRAVITY_CLI_BIN = script("img.sh", `printf '%s\\n' "$@" > ${log}\nls *.png | wc -l > ${log}.n\n${envelope("read")}`);
    await runAntigravityCli({ serviceId: ID, model: "default", prompt: "OCR", image: Buffer.from([0x89, 0x50]) });
    expect(readFileSync(log, "utf8")).toMatch(/-p=OCR\n\nThe image to read is the file img-[0-9a-f-]+\.png/);
    expect(readFileSync(`${log}.n`, "utf8").trim()).toBe("1");
    await new Promise((r) => setTimeout(r, 50));
    expect(readdirSync(join(homeOf(ID), "work")).filter((f) => f.endsWith(".png"))).toEqual([]);
  });

  it("classifies quota, a lost sign-in (and forgets the authorisation), a missing binary and a timeout", async () => {
    process.env.ANTIGRAVITY_CLI_BIN = script("quota.sh", `echo "RESOURCE_EXHAUSTED quota, retry in 30s" >&2\nexit 1`);
    await expect(runAntigravityCli({ serviceId: ID, model: "default", prompt: "p" })).rejects.toMatchObject({ kind: "rate", retryAfterMs: 30_000 });
    expect(authStatus(ID).authorized).toBe(true);

    process.env.ANTIGRAVITY_CLI_BIN = script(
      "auth.sh",
      `echo "Error: authentication required. Run 'agy' to log in, then retry." >&2\necho '{"status":"ERROR","response":"","error":"authentication failed or timed out"}'\nexit 1`,
    );
    await expect(runAntigravityCli({ serviceId: ID, model: "default", prompt: "p" })).rejects.toMatchObject({ kind: "auth" });
    await new Promise((r) => setTimeout(r, 100));
    expect(authStatus(ID).authorized).toBe(false); // the page then offers to authorise again
    await authorise(ID);

    process.env.ANTIGRAVITY_CLI_BIN = join(dir, "missing-bin");
    await expect(runAntigravityCli({ serviceId: ID, model: "default", prompt: "p" })).rejects.toMatchObject({ kind: "transient", message: expect.stringContaining("không tìm thấy") });

    process.env.ANTIGRAVITY_CLI_BIN = script("slow.sh", `sleep 10`);
    await expect(runAntigravityCli({ serviceId: ID, model: "default", prompt: "p", timeoutMs: 300 })).rejects.toMatchObject({ kind: "transient", message: expect.stringContaining("quá thời gian") });
  }, 20_000);

  it("a timeout kills the whole process tree (no orphan left behind)", async () => {
    const pidFile = join(dir, "grandchild.pid");
    process.env.ANTIGRAVITY_CLI_BIN = script("tree.sh", `sleep 30 &\necho $! > ${pidFile}\nwait`);
    await expect(runAntigravityCli({ serviceId: ID, model: "default", prompt: "p", timeoutMs: 300 })).rejects.toMatchObject({ kind: "transient" });
    const pid = Number(readFileSync(pidFile, "utf8").trim());
    await new Promise((r) => setTimeout(r, 200));
    let alive = true;
    try {
      process.kill(pid, 0);
    } catch {
      alive = false;
    }
    if (alive) process.kill(pid, "SIGKILL");
    expect(alive).toBe(false);
  }, 10_000);

  it("exit 0 without a SUCCESS envelope is a failure, not an empty answer", async () => {
    process.env.ANTIGRAVITY_CLI_BIN = script("empty.sh", `echo hello`);
    await expect(runAntigravityCli({ serviceId: ID, model: "default", prompt: "p" })).rejects.toBeInstanceOf(AntigravityCliFailure);
    process.env.ANTIGRAVITY_CLI_BIN = script("err.sh", `echo '{"status":"ERROR","response":"","error":"boom"}'`);
    await expect(runAntigravityCli({ serviceId: ID, model: "default", prompt: "p" })).rejects.toBeInstanceOf(AntigravityCliFailure);
  });
});

describe("web sign-in (fake agy in a pseudo-terminal)", () => {
  const LOGIN = "89abcdef0123456789abcdef";
  const fake = `
if [ "$1" = "models" ]; then
  if [ -f "$HOME/signed-in" ]; then printf 'Fetching available models...\\n* gemini-3.8-flash (default)\\n  gemini-3.1-pro-high\\n'; exit 0; fi
  echo "Error: Please sign in to view available models." >&2; exit 1
fi
echo "Welcome to the Antigravity CLI. You are currently not signed in."
echo " Select login method:"
echo " > 1. Google OAuth"
read -r _
n=$RANDOM
while true; do
  printf '\\033]8;id=x;https://accounts.google.com/o/oauth2/auth?state=%s\\033\\\\\\n' "$n"
  echo " After authenticating, copy the code displayed in the browser and paste it below:"
  read -r code
  if [ "$code" = "4/GOOD-CODE-123" ]; then touch "$HOME/signed-in"; sleep 30;
  elif [ "$code" = "4/INVALID-GRANT-1" ]; then echo 'Got an error: token exchange failed: oauth2: "invalid_grant" "Bad Request"'; sleep 30;
  else n=$RANDOM$RANDOM; echo "invalid code"; fi
done`;

  const waitFor = async (pred: () => boolean, ms = 12_000): Promise<void> => {
    const t0 = Date.now();
    while (!pred() && Date.now() - t0 < ms) await new Promise((r) => setTimeout(r, 100));
  };

  it("picks Google OAuth, gives the link, takes a wrong code back to a fresh link, and finishes on the right code", async () => {
    process.env.ANTIGRAVITY_CLI_BIN = script("login.sh", fake);
    expect(authStatus(LOGIN).authorized).toBe(false);
    const st = await startLogin(LOGIN);
    expect(st.state).toBe("awaiting_code");
    expect(st.url).toMatch(/^https:\/\/accounts\.google\.com\/o\/oauth2\/auth\?state=\d+$/);

    expect(() => submitLoginCode(LOGIN, "bad code!")).toThrow(AntigravityCliFailure);

    submitLoginCode(LOGIN, "4/WRONG-CODE-123");
    expect(loginStatus(LOGIN).state).toBe("verifying");
    await waitFor(() => loginStatus(LOGIN).state === "awaiting_code");
    const retry = loginStatus(LOGIN);
    expect(retry.state).toBe("awaiting_code");
    expect(retry.error).toMatch(/mã không đúng/);
    expect(retry.url).not.toBe(st.url);

    submitLoginCode(LOGIN, "4/GOOD-CODE-123");
    await waitFor(() => loginStatus(LOGIN).state === "done");
    expect(loginStatus(LOGIN).state).toBe("done");
    expect(authStatus(LOGIN).authorized).toBe(true); // only because `agy models` worked
    expect((await listCliModels(LOGIN))?.map((m) => m.id)).toEqual(["gemini-3.8-flash", "gemini-3.1-pro-high"]);
  }, 40_000);

  it("when Google refuses the code (invalid_grant) the sign-in fails at once with a clear message", async () => {
    await logout(LOGIN);
    rmSync(join(homeOf(LOGIN), "signed-in"), { force: true });
    expect((await startLogin(LOGIN)).state).toBe("awaiting_code");
    submitLoginCode(LOGIN, "4/INVALID-GRANT-1");
    await waitFor(() => loginStatus(LOGIN).state === "failed", 5000);
    const st = loginStatus(LOGIN);
    expect(st.state).toBe("failed");
    expect(st.error).toContain("invalid_grant");
    expect(authStatus(LOGIN).authorized).toBe(false);
  }, 20_000);

  it("`checkSignedIn` is false when agy says to sign in", async () => {
    await logout(LOGIN);
    rmSync(join(homeOf(LOGIN), "signed-in"), { force: true });
    const r = await checkSignedIn(LOGIN);
    expect(r.ok).toBe(false);
    expect(r.models).toEqual([]);
    expect(await listCliModels(LOGIN)).toBeNull();
  });

  it("a code cannot be submitted when no sign-in is waiting for one", () => {
    cancelLogin(LOGIN);
    expect(() => submitLoginCode(LOGIN, "4/GOOD-CODE-123")).toThrow(AntigravityCliFailure);
  });
});
