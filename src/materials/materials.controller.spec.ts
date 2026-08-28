import 'reflect-metadata';
import { GUARDS_METADATA } from '@nestjs/common/constants';
import { Test, TestingModule } from '@nestjs/testing';
import { UserRole } from '../../generated/client/client';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { ROLES_KEY } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { MaterialsController } from './materials.controller';
import { MaterialsService } from './materials.service';

describe('MaterialsController', () => {
  let controller: MaterialsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [MaterialsController],
      providers: [{ provide: MaterialsService, useValue: {} }],
    }).compile();

    controller = module.get(MaterialsController);
  });

  it('is defined', () => {
    expect(controller).toBeDefined();
  });

  it('uses JwtAuthGuard and RolesGuard', () => {
    expect(Reflect.getMetadata(GUARDS_METADATA, MaterialsController)).toEqual([
      JwtAuthGuard,
      RolesGuard,
    ]);
  });

  it('allows both roles to read and Admin only to mutate', () => {
    expect(Reflect.getMetadata(ROLES_KEY, MaterialsController)).toEqual([
      UserRole.ADMIN,
      UserRole.STUDENT,
    ]);

    for (const method of ['create', 'upload', 'update', 'remove', 'publish', 'unpublish']) {
      const handler = (MaterialsController.prototype as unknown as Record<string, unknown>)[method];
      expect(Reflect.getMetadata(ROLES_KEY, handler as object)).toEqual([
        UserRole.ADMIN,
      ]);
    }
  });
});
