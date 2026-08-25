import { Body, Controller, HttpCode, HttpStatus, Post, Get, Patch, UseGuards, Request  } from '@nestjs/common';
import { AuthService } from './auth.service'; 
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { JwtAuthGuard } from './jwt-auth.guard';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';


@Controller('auth')
export class AuthController {
    constructor (private readonly authService: AuthService){}

    @Post('register')
    register(@Body() registerDto: RegisterDto) {
        return this.authService.register(registerDto);
    } 

    @HttpCode(HttpStatus.OK)
    @Post('login')
    login(@Body() loginDto: LoginDto) {
        return this.authService.login(loginDto);
    }

    @UseGuards(JwtAuthGuard)
    @Get('me')
    getMe(@Request() req: any) {
        return this.authService.getMe(req.user.sub);
    }

    @UseGuards(JwtAuthGuard)
    @Patch('change-password')
    changePassword (
        @Request() req: any,
        @Body() changePasswordDto: ChangePasswordDto,
    ) {
        return this.authService.changePassword (
            req.user.sub,
            changePasswordDto,
        )
    }

    @UseGuards(JwtAuthGuard)
    @Patch('profile')
    updateProfile(
        @Request() req: any,
        @Body() updateProfileDto: UpdateProfileDto,
    ) {
        return this.authService.updateProfile(req.user.sub, updateProfileDto);
    }

}
