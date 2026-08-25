import { ConflictException, ForbiddenException, Injectable, UnauthorizedException } from '@nestjs/common';
import * as bcrypt from 'bcrypt';
import { PrismaService } from '../prisma/prisma.service';
import { RegisterDto } from './dto/register.dto';
import { LoginDto } from './dto/login.dto';
import { JwtService } from '@nestjs/jwt';
import { ChangePasswordDto } from './dto/change-password.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';

@Injectable()
export class AuthService {
    constructor (
        private readonly prisma: PrismaService,
        private readonly jwtService: JwtService,
    ) {}

    async register(registerDto : RegisterDto) {
        const { email, password, fullName, phone } = registerDto;

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
                fullName: fullName ?? '',
                phone: phone ?? '',
                dateOfBirth: new Date(),
            },
            select: {
                id: true,
                email: true,
                fullName: true,
                role: true,
                isActive: true,
                accessLevel: true,
                proExpiresAt: true,
                phone: true,
                dateOfBirth: true,
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
                accessLevel: user.accessLevel,
                proExpiresAt: user.proExpiresAt,
                phone: user.phone,
                dateOfBirth: user.dateOfBirth,
            },
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
                role: true,
                isActive: true,
                accessLevel: true,
                proExpiresAt: true,
                phone: true,
                dateOfBirth: true,
                createdAt: true,
                updatedAt: true,
            }
        })

        if (!user) {
            throw new UnauthorizedException('User not found!');
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

    async updateProfile(userId: string, updateProfileDto: UpdateProfileDto) {
        const existing = await this.prisma.user.findUnique({ where: { id: userId } });
        if (!existing) throw new UnauthorizedException('User not found');

        if (updateProfileDto.email && updateProfileDto.email !== existing.email) {
            const emailOwner = await this.prisma.user.findUnique({ where: { email: updateProfileDto.email } });
            if (emailOwner && emailOwner.id !== userId) throw new ConflictException('Email already exists');
        }

        return this.prisma.user.update({
            where: { id: userId },
            data: {
                fullName: updateProfileDto.fullName,
                email: updateProfileDto.email,
                phone: updateProfileDto.phone,
                dateOfBirth: updateProfileDto.dateOfBirth ? new Date(updateProfileDto.dateOfBirth) : undefined,
            },
            select: {
                id: true,
                email: true,
                fullName: true,
                role: true,
                isActive: true,
                accessLevel: true,
                proExpiresAt: true,
                phone: true,
                dateOfBirth: true,
                createdAt: true,
                updatedAt: true,
            },
        });
    }

}

