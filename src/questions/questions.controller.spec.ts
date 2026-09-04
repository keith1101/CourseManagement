import 'reflect-metadata';
import { ROLES_KEY } from '../auth/roles.decorator';
import { UserRole } from '../../generated/client/client';
import { Test, TestingModule } from '@nestjs/testing';
import { QuestionsController } from './questions.controller';
import { QuestionsService } from './questions.service';

describe('QuestionsController', () => {
  let controller: QuestionsController;
  let questionsService: { find: jest.Mock };

  beforeEach(async () => {
    questionsService = {
      find: jest.fn(),
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
});
