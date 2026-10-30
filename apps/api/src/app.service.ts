import { Injectable } from "@nestjs/common";

@Injectable()
export class AppService {
  /**
   * API metadata for `GET /`. Kept intentionally minimal: it tells clients
   * what the service is and where the docs live. Real domain modules expose
   * their own routes from later sprints on.
   */
  getMeta(): { name: string; version: string; docs: string } {
    return {
      name: "Nihongo Path API",
      version: "0.0.1",
      docs: "api/docs", // Swagger UI path — dev/test only, disabled in production
    };
  }
}
