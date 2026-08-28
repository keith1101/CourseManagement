import 'reflect-metadata';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { UserRole } from '../../generated/client/client';
import { JwtAuthGuard } from './jwt-auth.guard';
import { ROLES_KEY } from './roles.decorator';
import { RolesGuard } from './roles.guard';
import { UsersController } from '../users/users.controller';
import { QuestionsController } from '../questions/questions.controller';
import { AssignmentsController } from '../assignments/assignments.controller';
import { AttemptsController } from '../attempts/attempts.controller';

describe('integrated module authorization metadata', () => {
  it.each([
    UsersController,
    QuestionsController,
    AssignmentsController,
    AttemptsController,
  ])('protects %p with JWT and RolesGuard', (controller) => {
    expect(Reflect.getMetadata(GUARDS_METADATA, controller)).toEqual([
      JwtAuthGuard,
      RolesGuard,
    ]);
  });

  it('restricts user administration to Admin', () => {
    expect(Reflect.getMetadata(ROLES_KEY, UsersController)).toEqual([
      UserRole.ADMIN,
    ]);
  });

  it('allows Students to read questions but restricts mutations to Admin', () => {
    expect(Reflect.getMetadata(ROLES_KEY, QuestionsController)).toEqual([
      UserRole.ADMIN,
      UserRole.STUDENT,
    ]);
    expect(
      Reflect.getMetadata(ROLES_KEY, QuestionsController.prototype.update),
    ).toEqual([UserRole.ADMIN]);
  });

  it('allows Students to read assignments and attempts but protects writes', () => {
    expect(Reflect.getMetadata(ROLES_KEY, AssignmentsController)).toEqual([
      UserRole.ADMIN,
      UserRole.STUDENT,
    ]);
    expect(Reflect.getMetadata(ROLES_KEY, AttemptsController)).toEqual([
      UserRole.ADMIN,
      UserRole.STUDENT,
    ]);
    expect(
      Reflect.getMetadata(ROLES_KEY, AttemptsController.prototype.submit),
    ).toEqual([UserRole.STUDENT]);
  });
});
