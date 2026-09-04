import { Test, TestingModule } from '@nestjs/testing';
import { UserRole } from '../../generated/client/client';
import { ExamQuestionsController } from './exam-questions.controller';
import { QuestionsService } from './questions.service';

describe('ExamQuestionsController', () => {
  let controller: ExamQuestionsController;
  let questionsService: { findByExam: jest.Mock };

  beforeEach(async () => {
    questionsService = {
      findByExam: jest.fn().mockResolvedValue([]),
    };
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ExamQuestionsController],
      providers: [
        {
          provide: QuestionsService,
          useValue: questionsService,
        },
      ],
    }).compile();

    controller = module.get<ExamQuestionsController>(ExamQuestionsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });

  it('keeps the student exam question flow sanitized', async () => {
    await expect(
      controller.findByExam('exam-1', { user: { sub: 'student-1', role: UserRole.STUDENT } }),
    ).resolves.toEqual([]);
    expect(questionsService.findByExam).toHaveBeenCalledWith('exam-1', false, 'student-1');
  });

  it('keeps answer-bearing exam question retrieval available to Admin management', async () => {
    await controller.findByExam('exam-1', { user: { sub: 'admin-1', role: UserRole.ADMIN } });
    expect(questionsService.findByExam).toHaveBeenCalledWith('exam-1', true, undefined);
  });
});
