import {
  Body,
  Controller,
  Headers,
  HttpCode,
  HttpStatus,
  Post,
  UseGuards,
} from "@nestjs/common";
import { ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { IsEmail, IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import { IsPublic } from "./decorators/is-public.decorator.js";
import { RateLimitGuard } from "./guards/rate-limit.guard.js";
import { AuthService } from "./auth.service.js";

// ── DTOs ──────────────────────────────────────────────────────────────

export class RegisterEmailDto {
  @IsEmail()
  @MaxLength(320)
  email: string;

  @IsString()
  @MinLength(8)
  @MaxLength(200)
  password: string;

  @IsOptional()
  @IsString()
  @MaxLength(120)
  displayName?: string;
}

export class LoginEmailDto {
  @IsEmail()
  @MaxLength(320)
  email: string;

  @IsString()
  password: string;
}

export class GoogleCredentialDto {
  /** Google One-Tap / OAuth ID token (JWT). */
  @IsString()
  @MaxLength(20_000)
  credential: string;
}

export class RefreshDto {
  @IsString()
  @MaxLength(128)
  refreshToken: string;
}

// ── Controller ────────────────────────────────────────────────────────

/**
 * Sign-in / sign-up / token lifecycle (P2-AUTH-04/05/08). All public routes
 * (`@IsPublic()`) so `AuthGuard` does not block them; `RateLimitGuard` sits
 * on the credential endpoints only.
 *
 * The refresh token is returned in the body AND mirrored into an httpOnly
 * cookie by the UI layer (P2-UI-05) — the API never reads it from a cookie,
 * it is a pure JWT-style bearer surface.
 */
@ApiTags("auth")
@Controller("auth")
export class AuthController {
  constructor(private readonly authService: AuthService) {}

  @Post("email/register")
  @IsPublic()
  @UseGuards(RateLimitGuard)
  @ApiOperation({ summary: "Register an email/password account" })
  @ApiResponse({ status: 201, description: "Created + token pair" })
  @ApiResponse({ status: 409, description: "Account already exists" })
  @HttpCode(HttpStatus.CREATED)
  registerEmail(@Body() body: RegisterEmailDto) {
    return this.authService.registerEmail(body);
  }

  @Post("email/login")
  @IsPublic()
  @UseGuards(RateLimitGuard)
  @ApiOperation({ summary: "Login with email + password" })
  @ApiResponse({ status: 200, description: "Token pair" })
  @ApiResponse({ status: 401, description: "Invalid credentials (generic)" })
  loginEmail(@Body() body: LoginEmailDto) {
    return this.authService.loginEmail(body);
  }

  @Post("google/login")
  @IsPublic()
  @UseGuards(RateLimitGuard)
  @ApiOperation({ summary: "Login / register with a Google ID token" })
  @ApiResponse({ status: 200, description: "Token pair" })
  @ApiResponse({ status: 401, description: "Invalid or unverified credential" })
  loginGoogle(@Body() body: GoogleCredentialDto) {
    return this.authService.loginGoogle(body);
  }

  @Post("refresh")
  @IsPublic()
  @ApiOperation({ summary: "Rotate a refresh token for a fresh pair" })
  @ApiResponse({ status: 200, description: "New token pair" })
  @ApiResponse({ status: 401, description: "Stale or expired refresh token" })
  refresh(@Body() body: RefreshDto, @Headers("user-agent") userAgent?: string) {
    return this.authService.refresh(body.refreshToken, userAgent);
  }

  @Post("logout")
  @IsPublic()
  @ApiOperation({ summary: "Revoke the presented refresh token" })
  @ApiResponse({ status: 204, description: "Session revoked" })
  @HttpCode(HttpStatus.NO_CONTENT)
  logout(@Body() body: RefreshDto) {
    return this.authService.logout(body.refreshToken);
  }

  @Post("verify")
  @IsPublic()
  @ApiOperation({
    summary:
      "Verify a refresh token (no rotation) → fresh access token + user. " +
      "For server-side session checks (Next SSR / server routes).",
  })
  @ApiResponse({ status: 200, description: "Access token + user" })
  @ApiResponse({ status: 401, description: "Stale or expired refresh token" })
  verify(@Body() body: RefreshDto) {
    return this.authService.verifyRefresh(body.refreshToken);
  }
}
