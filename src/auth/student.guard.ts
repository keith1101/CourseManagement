import {
    CanActivate,
    ExecutionContext,
    ForbiddenException,
    Injectable,
} from '@nestjs/common';

@Injectable()
export class StudentGuard implements CanActivate {
    canActivate(context: ExecutionContext): boolean {
        const request = context.switchToHttp().getRequest<{
            user?: { role?: string };
        }>();

        if (request.user?.role !== 'STUDENT') {
            throw new ForbiddenException('Student access required');
        }

        return true;
    }
}
