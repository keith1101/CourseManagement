import 'reflect-metadata';
import { BadRequestException, InternalServerErrorException } from '@nestjs/common';
import { ROLES_KEY } from '../auth/roles.decorator';
import { UserRole } from '../../generated/client/client';
import { Test, TestingModule } from '@nestjs/testing';
import { QuestionsController } from './questions.controller';
import { QuestionsService } from './questions.service';

describe('QuestionsController', () => {
  let controller: QuestionsController;
  let questionsService: { find: jest.Mock; uploadImage: jest.Mock };

  beforeEach(async () => {
    questionsService = {
      find: jest.fn(),
      uploadImage: jest.fn(),
    };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [QuestionsController],
      providers: [
        {
          provide: QuestionsService,
          useValue: questionsService,
        },
      ],
    }).compile();

    controller = module.get<QuestionsController>(QuestionsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('restricts direct question retrieval to Admin', () => {
    expect(
      Reflect.getMetadata(ROLES_KEY, QuestionsController.prototype.showDetail),
    ).toEqual([UserRole.ADMIN]);
  });

  it('keeps answer-bearing direct retrieval available to Admin management', async () => {
    questionsService.find.mockResolvedValue({ correctTextAnswer: 'management-only' });

    await expect(
      controller.showDetail('question-1', { user: { role: UserRole.ADMIN } }),
    ).resolves.toEqual({ correctTextAnswer: 'management-only' });
    expect(questionsService.find).toHaveBeenCalledWith('question-1', true);
  });

  it('rejects an upload without a file', () => {
    expect(() => controller.uploadImage(undefined)).toThrow(BadRequestException);
    expect(questionsService.uploadImage).not.toHaveBeenCalled();
  });

  it('delegates an image upload and preserves a controlled R2 failure', async () => {
    const file = {
      buffer: Buffer.from('png'),
      originalname: 'screenshot.png',
      mimetype: 'image/png',
      size: 3,
    };
    const failure = new InternalServerErrorException(
      'Unable to upload file to object storage',
    );
    questionsService.uploadImage.mockRejectedValue(failure);

    await expect(controller.uploadImage(file)).rejects.toBe(failure);
    expect(questionsService.uploadImage).toHaveBeenCalledTimes(1);
    expect(questionsService.uploadImage).toHaveBeenCalledWith(file);
  });
});
