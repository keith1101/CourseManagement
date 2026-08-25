import { ForbiddenException, Injectable, UnauthorizedException } from "@nestjs/common";
import { PassportStrategy } from "@nestjs/passport";
import { ExtractJwt, Strategy } from "passport-jwt";
import { PrismaService } from '../prisma/prisma.service';

@Injectable()
export class JwtStrategy extends PassportStrategy(Strategy) {
    constructor(private readonly prisma: PrismaService) {
        super({
            jwtFromRequest: ExtractJwt.fromAuthHeaderAsBearerToken(),
            ignoreExpiration: false, 
            secretOrKey:
                process.env.JWT_SECRET ||  "super_secret_jwt_key_course_management_2026",
        });
    }

    async validate (payload: any) {
        const user = await this.prisma.user.findUnique({
            where: { id: payload.sub },
            select: { isActive: true },
        });

        if (!user) throw new UnauthorizedException('User not found');
        if (!user.isActive) throw new ForbiddenException('Account is locked');

        return payload;
    }

}
