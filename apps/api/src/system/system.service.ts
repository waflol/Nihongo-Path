import { Injectable } from "@nestjs/common";
import { cpus, freemem, loadavg, totalmem, uptime } from "node:os";
import { statfs } from "node:fs/promises";

export interface SystemStats {
  at: string;
  uptimeSeconds: number;
  cpu: { cores: number; model: string; usagePercent: number; load: [number, number, number] };
  memory: { totalBytes: number; usedBytes: number; freeBytes: number; usedPercent: number };
  disk: { path: string; totalBytes: number; usedBytes: number; freeBytes: number; usedPercent: number } | null;
  process: { rssBytes: number; heapUsedBytes: number };
}

type CpuSnapshot = { idle: number; total: number };

function snapshot(): CpuSnapshot {
  let idle = 0;
  let total = 0;
  for (const c of cpus()) {
    const t = c.times;
    idle += t.idle;
    total += t.user + t.nice + t.sys + t.idle + t.irq;
  }
  return { idle, total };
}

/** Host metrics via node:os / fs.statfs — no extra dependencies, tiny memory. */
@Injectable()
export class SystemService {
  private last: CpuSnapshot = snapshot();

  /** CPU % since the previous call (the admin page polls every few seconds). */
  private cpuPercent(): number {
    const now = snapshot();
    const dTotal = now.total - this.last.total;
    const dIdle = now.idle - this.last.idle;
    this.last = now;
    if (dTotal <= 0) return 0;
    return Math.round((1 - dIdle / dTotal) * 1000) / 10;
  }

  private sampleSnap: CpuSnapshot = snapshot();

  /** Reading for the history recorder; own CPU baseline so page polling doesn't shorten its window. */
  async sample(): Promise<{ cpu: number; ram: number; disk?: number }> {
    const now = snapshot();
    const dTotal = now.total - this.sampleSnap.total;
    const dIdle = now.idle - this.sampleSnap.idle;
    this.sampleSnap = now;
    const cpu = dTotal > 0 ? Math.round((1 - dIdle / dTotal) * 1000) / 10 : 0;
    const total = totalmem();
    const ram = Math.round(((total - freemem()) / total) * 1000) / 10;
    const disk = (await this.stats()).disk?.usedPercent;
    return { cpu, ram, ...(disk === undefined ? {} : { disk }) };
  }

  async stats(): Promise<SystemStats> {
    const total = totalmem();
    const free = freemem();
    const cores = cpus();
    const mem = process.memoryUsage();

    let disk: SystemStats["disk"] = null;
    try {
      const s = await statfs("/");
      const totalBytes = s.blocks * s.bsize;
      const freeBytes = s.bavail * s.bsize;
      const usedBytes = totalBytes - s.bfree * s.bsize;
      disk = {
        path: "/",
        totalBytes,
        usedBytes,
        freeBytes,
        usedPercent: totalBytes ? Math.round((usedBytes / (usedBytes + freeBytes)) * 1000) / 10 : 0,
      };
    } catch {
      // statfs unsupported: leave disk null
    }

    const [l1 = 0, l5 = 0, l15 = 0] = loadavg();
    return {
      at: new Date().toISOString(),
      uptimeSeconds: Math.floor(uptime()),
      cpu: { cores: cores.length, model: cores[0]?.model ?? "", usagePercent: this.cpuPercent(), load: [l1, l5, l15] },
      memory: {
        totalBytes: total,
        usedBytes: total - free,
        freeBytes: free,
        usedPercent: Math.round(((total - free) / total) * 1000) / 10,
      },
      disk,
      process: { rssBytes: mem.rss, heapUsedBytes: mem.heapUsed },
    };
  }
}
