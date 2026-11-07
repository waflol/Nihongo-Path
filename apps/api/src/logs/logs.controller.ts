import { BadRequestException, Body, Controller, Delete, Get, Param, Post, Query, Req, Res } from "@nestjs/common";
import type { Request, Response } from "express";
import { ApiBearerAuth, ApiOperation, ApiTags } from "@nestjs/swagger";
import { ContentAdmin } from "../auth/decorators/roles.decorator.js";
import { CurrentUser } from "../auth/decorators/current-user.decorator.js";
import type { AuthUser } from "../auth/auth.types.js";
import {
  AllowIpDto,
  BlockIpDto,
  ExportQuery,
  ListAppLogsQuery,
  ListAuditQuery,
  ListLogsQuery,
  RangeQuery,
  SimulateDto,
} from "./logs.dto.js";
import { IpBlockService, isInternalIp, normalizeIp } from "./ip-block.service.js";
import { LogsService } from "./logs.service.js";

@ApiTags("admin-logs")
@ApiBearerAuth()
@Controller("admin/logs")
export class LogsController {
  constructor(
    private readonly logs: LogsService,
    private readonly ips: IpBlockService,
  ) {}

  @Get()
  @ContentAdmin()
  @ApiOperation({ summary: "Paginated HTTP request log (ADMIN / SUPER_ADMIN)" })
  list(@Query() query: ListLogsQuery) {
    return this.logs.list(query);
  }

  @Get("request/:id")
  @ContentAdmin()
  @ApiOperation({ summary: "One request with headers and request/response bodies (scrubbed)" })
  detail(@Param("id") id: string) {
    return this.logs.detail(id);
  }

  @Get("app")
  @ContentAdmin()
  @ApiOperation({ summary: "Application log lines and exception stack traces" })
  listApp(@Query() query: ListAppLogsQuery) {
    return this.logs.listApp(query);
  }

  @Get("summary")
  @ContentAdmin()
  @ApiOperation({ summary: "Request counts for a day/week/month range" })
  summary(@Query() q: RangeQuery) {
    return this.logs.summary(q);
  }

  @Get("traffic")
  @ContentAdmin()
  @ApiOperation({ summary: "Traffic stats for a day/week/month range (top IPs, time series)" })
  traffic(@Query() q: RangeQuery) {
    return this.logs.traffic(q);
  }

  @Get("blocked")
  @ContentAdmin()
  @ApiOperation({ summary: "Blocked IP addresses" })
  blocked() {
    return this.ips.list();
  }

  @Post("blocked")
  @ContentAdmin()
  @ApiOperation({ summary: "Block an IP address (permanent unless `minutes` is set)" })
  async block(@Body() body: BlockIpDto, @CurrentUser() caller: AuthUser) {
    const ip = normalizeIp(body.ip);
    if (this.ips.isAllowed(ip)) {
      throw new BadRequestException("IP nằm trong danh sách cho phép — bỏ khỏi allowlist trước khi chặn");
    }
    await this.ips.block(ip, body.reason, body.minutes ?? null, caller.sub);
    return { ip, blocked: true };
  }

  @Delete("blocked/:ip")
  @ContentAdmin()
  @ApiOperation({ summary: "Unblock an IP address" })
  async unblock(@Param("ip") ip: string) {
    await this.ips.unblock(ip);
    return { ip, blocked: false };
  }

  @Get("protection")
  @ContentAdmin()
  @ApiOperation({ summary: "Flood-protection config and live per-IP counters" })
  protection() {
    return this.ips.live();
  }

  @Get("whoami")
  @ContentAdmin()
  @ApiOperation({ summary: "How the API sees the caller's IP (checks TRUST_PROXY)" })
  whoami(@Req() req: Request) {
    const ip = normalizeIp(req.ip);
    return {
      ip,
      forwardedFor: req.headers["x-forwarded-for"] ?? null,
      trustProxy: Boolean(process.env.TRUST_PROXY?.trim()),
      internal: isInternalIp(ip),
      blocked: this.ips.isBlocked(ip),
    };
  }

  @Post("simulate")
  @ContentAdmin()
  @ApiOperation({ summary: "Dry-run the rate limiter for a fake client (blocks nothing)" })
  simulate(@Body() body: SimulateDto) {
    return this.ips.simulate(body.requests, body.intervalMs ?? 0);
  }

  @Get("allowed")
  @ContentAdmin()
  @ApiOperation({ summary: "Allowlisted IPs (never blocked)" })
  allowed() {
    return this.ips.listAllowed();
  }

  @Post("allowed")
  @ContentAdmin()
  @ApiOperation({ summary: "Allowlist an IP (also lifts an existing block)" })
  async allow(@Body() body: AllowIpDto, @CurrentUser() caller: AuthUser) {
    const ip = normalizeIp(body.ip);
    await this.ips.allow(ip, body.note, caller.sub);
    return { ip, allowed: true };
  }

  @Delete("allowed/:ip")
  @ContentAdmin()
  @ApiOperation({ summary: "Remove an IP from the allowlist (env entries cannot be removed)" })
  async disallow(@Param("ip") ip: string) {
    if (!(await this.ips.disallow(ip))) {
      throw new BadRequestException("IP cấu hình qua IP_ALLOWLIST — sửa biến môi trường để gỡ");
    }
    return { ip, allowed: false };
  }

  @Get("audit")
  @ContentAdmin()
  @ApiOperation({ summary: "Audit trail of admin actions" })
  audit(@Query() query: ListAuditQuery) {
    return this.logs.listAudit(query);
  }

  @Get("export")
  @ContentAdmin()
  @ApiOperation({ summary: "CSV export (requests | app | audit), same filters as the lists" })
  async export(@Query() query: ExportQuery, @Res({ passthrough: true }) res: Response) {
    const csv = await this.logs.exportCsv(query);
    res.setHeader("Content-Type", "text/csv; charset=utf-8");
    res.setHeader(
      "Content-Disposition",
      `attachment; filename="${query.type}-logs-${new Date().toISOString().slice(0, 10)}.csv"`,
    );
    return csv;
  }
}
