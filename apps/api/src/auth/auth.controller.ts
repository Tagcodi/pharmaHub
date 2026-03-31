import { Body, Controller, Get, Post, UseGuards } from "@nestjs/common";
import { CurrentUser } from "../common/decorators/current-user.decorator";
import { JwtAuthGuard } from "../common/guards/jwt-auth.guard";
import type { AuthenticatedUser } from "../common/interfaces/authenticated-request.interface";
import { AuthService } from "./auth.service";
import { SetupDto } from "./dto/setup.dto";
import { LoginDto } from "./dto/login.dto";

@Controller("auth")
export class AuthController {
  private readonly authService: AuthService;

  constructor(authService: AuthService) {
    this.authService = authService;
  }

  @Get("setup-status")
  getSetupStatus() {
    return this.authService.getSetupStatus();
  }

  @Post("setup")
  setup(@Body() dto: SetupDto) {
    return this.authService.setup(dto);
  }

  @Post("login")
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @UseGuards(JwtAuthGuard)
  @Get("me")
  me(@CurrentUser() user: AuthenticatedUser) {
    return this.authService.getCurrentSession(user);
  }
}
