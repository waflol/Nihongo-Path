import { Injectable, Logger, Optional } from "@nestjs/common";
import { InjectConnection } from "@nestjs/mongoose";
import type { Connection } from "mongoose";

/**
 * Database states reported by the health endpoints.
 * - `connected`        — a configured connection successfully pinged.
 * - `unreachable`      — a configured connection failed to ping.
 * - `not-configured`   — no `MONGODB_URI` in the environment.
 * - `not-checked`      — no database probe performed (liveness).
 */
export type DatabaseStatus =
  | "connected"
  | "unreachable"
  | "not-configured"
  | "not-checked";

/** Liveness shape (`GET /health`). */
export interface HealthReport {
  status: "ok";
  uptimeSeconds: number;
  database: DatabaseStatus;
}

/** Readiness shape (`GET /health/ready`). */
export interface ReadinessReport {
  status: "ok" | "error";
  uptimeSeconds: number;
  database: DatabaseStatus;
}

@Injectable()
export class HealthService {
  private readonly logger = new Logger(HealthService.name);

  constructor(
    /**
     * The default mongoose connection, or `undefined` when no `MONGODB_URL`
     * is configured (`buildDatabaseModule()` registers no provider). Nest's
     * `@Optional()` injects `undefined` in that case; the `= null` default
     * parameter value normalizes it to `null`.
     */
    @Optional()
    @InjectConnection()
    private readonly db: Connection | null = null,
  ) {}

  /** Liveness — the process is up and the HTTP adapter answers. */
  health(): HealthReport {
    return {
      status: "ok",
      uptimeSeconds: Math.round(process.uptime()),
      database: this.db === null ? "not-configured" : "not-checked",
    };
  }

  /**
   * Readiness — additionally pings MongoDB when a connection is configured.
   * Never throws: an unreachable database degrades the report to
   * `status: "error"` (mapped to HTTP 503 by the controller); it does not
   * crash the request.
   */
  async ready(): Promise<ReadinessReport> {
    const uptimeSeconds = Math.round(process.uptime());

    if (this.db === null) {
      return { status: "ok", uptimeSeconds, database: "not-configured" };
    }

    try {
      // `db.db` (the driver `Db` handle) is populated once the connection is
      // established. `admin().ping()` is the lightest readiness probe.
      const dbHandle = this.db.db;
      if (!dbHandle) {
        // Connection object exists but the driver client is not attached yet.
        return {
          status: "error",
          uptimeSeconds,
          database: "unreachable",
        };
      }
      await dbHandle.admin().ping();
      return { status: "ok", uptimeSeconds, database: "connected" };
    } catch (error) {
      this.logger.warn(
        `MongoDB ping failed: ${error instanceof Error ? error.message : String(error)}`,
      );
      return { status: "error", uptimeSeconds, database: "unreachable" };
    }
  }
}
