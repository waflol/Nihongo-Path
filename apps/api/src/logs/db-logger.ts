import { ConsoleLogger, type LogLevel } from "@nestjs/common";
import type { AppLogLevel } from "./app-log.schema.js";

export interface LogEntry {
  level: AppLogLevel;
  context?: string;
  message: string;
  stack?: string;
  exception?: string;
  status?: number;
  request?: string;
  user?: string;
  ip?: string;
  details?: Record<string, unknown>;
}

/** Framework start-up chatter that would only drown real entries. */
const NOISY = new Set([
  "InstanceLoader",
  "RoutesResolver",
  "RouterExplorer",
  "NestFactory",
  "NestApplication",
  // written with full details by AllExceptionsFilter
  "Exception",
]);

const looksLikeStack = (s: string) => /\n\s+at /.test(s);

/**
 * Console logger that also forwards `log` / `warn` / `error` lines to a sink
 * (set once the DB-backed `LogsService` is up). Never throws; entries logged
 * before the sink exists are only printed.
 */
export class DbLogger extends ConsoleLogger {
  static sink?: (entry: LogEntry) => void;

  log(message: unknown, ...rest: unknown[]) {
    super.log(message, ...rest);
    this.forward("log", message, rest);
  }

  warn(message: unknown, ...rest: unknown[]) {
    super.warn(message, ...rest);
    this.forward("warn", message, rest);
  }

  error(message: unknown, ...rest: unknown[]) {
    super.error(message, ...rest);
    this.forward("error", message, rest);
  }

  private forward(level: AppLogLevel, message: unknown, rest: unknown[]) {
    const sink = DbLogger.sink;
    if (!sink) return;
    try {
      const strings = rest.filter((r): r is string => typeof r === "string");
      let stack = strings.find(looksLikeStack);
      const rawContext = strings.filter((s) => s !== stack).pop();
      const context = rawContext ?? this.context;
      if (context && NOISY.has(context)) return;

      let text: string;
      if (message instanceof Error) {
        text = message.message;
        stack ??= message.stack;
      } else if (typeof message === "string") {
        text = message;
      } else {
        text = JSON.stringify(message);
      }
      sink({
        level,
        context,
        message: text.slice(0, 2000),
        stack: stack?.slice(0, 8000),
      });
    } catch {
      // logging must never break the app
    }
  }
}

export type { LogLevel };
