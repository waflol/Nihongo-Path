import { Injectable, type NestMiddleware } from "@nestjs/common";
import type { NextFunction, Request, Response } from "express";
import { IpBlockService, normalizeIp } from "./ip-block.service.js";

/** First middleware: rejects blocked IPs before any other work (or DB log). */
@Injectable()
export class IpGuardMiddleware implements NestMiddleware {
  constructor(private readonly ips: IpBlockService) {}

  use(req: Request, res: Response, next: NextFunction): void {
    const ip = normalizeIp(req.ip);
    if (this.ips.isBlocked(ip)) {
      res.status(403).json({ statusCode: 403, message: "IP address is blocked" });
      return;
    }
    this.ips.hit(ip);
    next();
  }
}
