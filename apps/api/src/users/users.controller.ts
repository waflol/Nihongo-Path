import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Patch,
} from "@nestjs/common";
import { ApiBearerAuth, ApiOperation, ApiResponse, ApiTags } from "@nestjs/swagger";
import { IsOptional, IsString, MaxLength, MinLength } from "class-validator";
import { CurrentUser } from "../auth/decorators/current-user.decorator.js";
import type { AuthUser, PublicUser } from "../auth/auth.types.js";
import { UsersService } from "./users.service.js";

/** Own-profile self-service — no foreign ids, no role/status writes. */
export class UpdateProfileDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(120)
  displayName?: string;

  /** BCP-47 tag; free-form for now (P2-CONTENT-05 / Q-21). */
  @IsOptional()
  @IsString()
  @MaxLength(10)
  lang?: string;
}

@ApiTags("users")
@ApiBearerAuth()
@Controller("users")
export class UsersController {
  constructor(private readonly usersService: UsersService) {}

  @Get("me")
  @ApiOperation({ summary: "Read the caller's own profile" })
  @ApiResponse({ status: 200, description: "Own profile" })
  me(@CurrentUser() caller: AuthUser) {
    return this.usersService.me(caller);
  }

  @Patch("me")
  @ApiOperation({ summary: "Update the caller's own profile" })
  @ApiResponse({ status: 200, description: "Updated profile" })
  @HttpCode(HttpStatus.OK)
  updateMe(
    @CurrentUser() caller: AuthUser,
    @Body() body: UpdateProfileDto,
  ): Promise<PublicUser> {
    return this.usersService.updateProfile(caller, body);
  }
}
