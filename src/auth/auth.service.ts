import {
    ConflictException,
    ForbiddenException,
    Injectable,
    UnauthorizedException,
} from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { JwtService } from '@nestjs/jwt';
import { ChangePasswordDto } from './dto/change-password.dto';
import { Prisma } from '../../generated/client/client';


@Injectable()
export class AuthService {
    constructor (
        private readonly prisma: PrismaService,
        private readonly jwtService: JwtService,
    ) {}

    async register(registerDto : RegisterDto) {
        const { password, dateOfBirth } = registerDto;
        const email = this.normalizeEmail(registerDto.email);

        const existingUser = await this.prisma.user.findUnique({
            where: { email },
        });

        if (existingUser) {
            throw new ConflictException('Email already exists');
        }

        const passwordHash = await bcrypt.hash(password, 10);

        try {
            return await this.prisma.user.create ({
                data: {
                    email,
                    passwordHash,
                    fullName: registerDto.fullName.trim(),
                    phone: registerDto.phone?.trim() || null,
                    dateOfBirth: dateOfBirth ? new Date(dateOfBirth) : null,
                },
                select: {
                    id: true,
                    email: true,
                    fullName: true,
                    phone: true,
                    dateOfBirth: true,
                    role: true,
                    isActive: true,
                    accessLevel: true,
                    proExpiresAt: true,
                    createdAt: true,
                    updatedAt: true,
                },
            });
        } catch (error) {
            if (
                error instanceof Prisma.PrismaClientKnownRequestError &&
                error.code === 'P2002'
            ) {
                throw new ConflictException('Email already exists');
            }

            throw error;
        }
    }

    async login(loginDto : LoginDto) {
        const { password } = loginDto;
        const email = this.normalizeEmail(loginDto.email);

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
            role: user.role,
            tokenVersion: user.tokenVersion,
        }

        const loggedInUser = await this.prisma.user.update({
            where: { id: user.id },
            data: { lastLoginAt: new Date() },
            select: {
                id: true,
                email: true,
                fullName: true,
                phone: true,
                dateOfBirth: true,
                role: true,
                isActive: true,
                accessLevel: true,
                lastLoginAt: true,
                proExpiresAt: true,
            },
        });

        const accessToken = await this.jwtService.signAsync(payload);
        return {
            accessToken,
            user: loggedInUser,
        };  
    }

    async getMe(userId: string) {

        const user = await this.prisma.user.findUnique ({
            where: {
                id: userId,
            },
            select: {
                id: true,
                email: true,
                fullName: true,
                phone: true,
                dateOfBirth: true,
                role: true,
                isActive: true,
                accessLevel: true,
                lastLoginAt: true,
                proExpiresAt: true,
                createdAt: true,
                updatedAt: true,
            }
        })

        if (!user) {
            throw new UnauthorizedException('User not found!');
        }

        if (!user.isActive) {
            throw new ForbiddenException('Account is locked');
        }

        return user;
    }

    async changePassword (
        userId: string,
        changePasswordDto: ChangePasswordDto,
    ) {
        const { oldPassword, newPassword } = changePasswordDto;

        const user = await this.prisma.user.findUnique({
            where: {
                id: userId,
            },
        });

        if(!user) {
            throw new UnauthorizedException('User not found');
        }

        if (!user.isActive) {
            throw new ForbiddenException('Account is locked');
        }

        const isOldPasswordValid = await bcrypt.compare(
            oldPassword,
            user.passwordHash,
        );

        if (!isOldPasswordValid) {
            throw new UnauthorizedException('Old password is incorrect');
        }

        const newPasswordHash = await bcrypt.hash(newPassword, 10);
        await this.prisma.user.update({
            where: {
                id: userId,
            },
            data: {
                passwordHash: newPasswordHash,
            },
        });

        return {
            message: 'Password changed successfully',
        };

    }

    private normalizeEmail(email: string): string {
        return email.trim().toLowerCase();
    }

}
