import { ExecutionContext } from '@nestjs/common';
import { Reflector } from '@nestjs/core';
import { UserRole } from '../../generated/client/client';
import { ROLES_KEY } from './roles.decorator';
import { RolesGuard } from './roles.guard';

describe('RolesGuard', () => {
  let reflector: { getAllAndOverride: jest.Mock };
  let guard: RolesGuard;

  const createContext = (role?: UserRole): ExecutionContext => {
    const handler = jest.fn();
    const controller = class TestController {};

    return {
      getHandler: () => handler,
      getClass: () => controller,
      switchToHttp: () => ({
        getRequest: () => (role ? { user: { role } } : {}),
      }),
    } as unknown as ExecutionContext;
  };

  beforeEach(() => {
    reflector = { getAllAndOverride: jest.fn() };
    guard = new RolesGuard(reflector as unknown as Reflector);
  });

  it('allows access when no roles metadata is defined', () => {
    reflector.getAllAndOverride.mockReturnValue(undefined);

    expect(guard.canActivate(createContext())).toBe(true);
  });

  it('allows a user whose role is included in the required roles', () => {
    reflector.getAllAndOverride.mockReturnValue([
      UserRole.STUDENT,
      UserRole.ADMIN,
    ]);

    expect(guard.canActivate(createContext(UserRole.STUDENT))).toBe(true);
  });

  it('denies a user whose role is not included in the required roles', () => {
    reflector.getAllAndOverride.mockReturnValue([UserRole.ADMIN]);

    expect(guard.canActivate(createContext(UserRole.STUDENT))).toBe(false);
  });

  it('denies access when role metadata exists but request.user is missing', () => {
    const context = createContext();
    reflector.getAllAndOverride.mockReturnValue([UserRole.ADMIN]);

    expect(guard.canActivate(context)).toBe(false);
    expect(reflector.getAllAndOverride).toHaveBeenCalledWith(ROLES_KEY, [
      context.getHandler(),
      context.getClass(),
    ]);
  });
});
