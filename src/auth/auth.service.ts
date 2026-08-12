import { ConflictException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { JwtService } from '@nestjs/jwt';



@Injectable()
export class AuthService {
    constructor (
        private readonly prisma: PrismaService,
        private readonly jwtService: JwtService,
    ) {}

    async register(registerDto : RegisterDto) {
        const { email, password, fullName } = registerDto;

        const existingUser = await this.prisma.user.findUnique({
            where: { email },
        });

        if (existingUser) {
            throw new ConflictException('Email already exists');
        }

        const passwordHash = await bcrypt.hash(password, 10);

        const user = await this.prisma.user.create ({
            data: {
                email,
                passwordHash,
                fullName,
            },
            select: {
                id: true,
                email: true,
                fullName: true,
                role: true,
                isActive: true,
                isPro: true,
                proExpiresAt: true,
                createdAt: true,
                updatedAt: true,
            },
        });
        return user;
    }

    async login(loginDto : LoginDto) {
        const { email, password } = loginDto;

        const user = await this.prisma.user.findUnique({
            where: { email }
        });

        if (!user) {
            throw new UnauthorizedException('Invalid email or password'); //exception
        }

        if (user.isActive === false) {
            throw new ForbiddenException('Account is locked');
        }

        const isPasswordValid = await bcrypt.compare(password, user.passwordHash);
        
        if (!isPasswordValid) {
            throw new UnauthorizedException('Invalid email or password');
        }

        const payload = {
            sub: user.id,
            email: user.email,
            role: user.role
        }
        
        const accessToken = await this.jwtService.signAsync(payload);
        return {
            accessToken,
            user: {
                id: user.id,
                email: user.email,
                fullName: user.fullName,
                role: user.role,
                isActive: user.isActive,
                isPro: user.isPro,
                proExpiresAt: user.proExpiresAt,
            },
        };  
    }

}
