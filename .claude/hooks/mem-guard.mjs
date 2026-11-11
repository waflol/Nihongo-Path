// PreToolUse guard: refuse to run a command when the machine has less than
// MIN_FREE_MB of available RAM (default 1024). Works on Linux and Windows.
import { readFileSync } from 'node:fs';
import os from 'node:os';

const MIN_FREE_MB = Number(process.env.CLAUDE_MIN_FREE_MB) || 1024;

function availableMb() {
  if (process.platform === 'linux') {
    try {
      // MemAvailable counts reclaimable cache; os.freemem() on Linux does not.
      const m = readFileSync('/proc/meminfo', 'utf8').match(/^MemAvailable:\s+(\d+) kB/m);
      if (m) return Math.floor(Number(m[1]) / 1024);
    } catch {}
  }
  // Windows (and fallback): os.freemem() = available physical memory.
  return Math.floor(os.freemem() / 1024 / 1024);
}

// Lightweight commands that must stay runnable when RAM is low, otherwise the
// guard deadlocks (can't even inspect memory, kill a process or commit).
const LIGHT = new Set([
  'cd', 'git', 'free', 'ps', 'top', 'ls', 'cat', 'head', 'tail', 'grep', 'rg', 'wc', 'pwd', 'echo',
  'kill', 'pkill', 'killall', 'df', 'du', 'uptime', 'vmstat', 'tasklist', 'taskkill', 'wmic',
]);

function isLight(command) {
  // Drop quoted strings (e.g. commit messages) so their text isn't parsed as commands.
  const bare = String(command || '').replace(/"(?:[^"\\]|\\.)*"|'[^']*'/g, '""');
  if (/`|\$\(/.test(String(command || '').replace(/'[^']*'/g, ''))) return false;
  const segments = bare.split(/&&|\|\||;|\||\n/).map((s) => s.trim()).filter(Boolean);
  if (!segments.length) return false;
  return segments.every((s) => {
    const first = s.replace(/^(\w+=\S*\s+)+/, '').split(/\s+/)[0] || '';
    const name = first.replace(/^.*[\\/]/, '').replace(/\.exe$/i, '').toLowerCase();
    return LIGHT.has(name) && !/[`]|\$\(/.test(s);
  });
}

let command = '';
try {
  command = JSON.parse(readFileSync(0, 'utf8'))?.tool_input?.command ?? '';
} catch {}
if (isLight(command)) process.exit(0);

const free = availableMb();
if (free < MIN_FREE_MB) {
  console.error(
    `Blocked: only ${free} MB RAM available, need at least ${MIN_FREE_MB} MB free for the system. ` +
      `Free memory (stop other processes) or run a lighter/targeted command, then retry.`,
  );
  process.exit(2); // exit 2 = block the tool call, message goes back to Claude
}
