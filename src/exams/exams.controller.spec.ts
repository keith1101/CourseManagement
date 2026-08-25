import 'reflect-metadata';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Test, TestingModule } from '@nestjs/testing';
import { UserRole } from '../../generated/client/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ROLES_KEY } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { ExamsController } from './exams.controller';
import { ExamsService } from './exams.service';

describe('ExamsController', () => {
  let controller: ExamsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ExamsController],
      providers: [{ provide: ExamsService, useValue: {} }],
    }).compile();

    controller = module.get(ExamsController);
  });

  it('is defined', () => {
    expect(controller).toBeDefined();
  });

  it('protects the controller with JWT and RolesGuard', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, ExamsController)).toEqual([
      JwtAuthGuard,
      RolesGuard,
    ]);
  });

  it('allows both roles to read and Admin only to mutate', () => {
    expect(Reflect.getMetadata(ROLES_KEY, ExamsController)).toEqual([
      UserRole.ADMIN,
      UserRole.STUDENT,
    ]);
    expect(Reflect.getMetadata(ROLES_KEY, ExamsController.prototype.create)).toEqual([
      UserRole.ADMIN,
    ]);
    expect(Reflect.getMetadata(ROLES_KEY, ExamsController.prototype.publish)).toEqual([
      UserRole.ADMIN,
    ]);
    expect(Reflect.getMetadata(ROLES_KEY, ExamsController.prototype.remove)).toEqual([
      UserRole.ADMIN,
    ]);
  });
});
