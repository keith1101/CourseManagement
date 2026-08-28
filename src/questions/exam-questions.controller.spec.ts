import { Test, TestingModule } from '@nestjs/testing';
import { ExamQuestionsController } from './exam-questions.controller';
import { QuestionsService } from './questions.service';

describe('ExamQuestionsController', () => {
  let controller: ExamQuestionsController;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      controllers: [ExamQuestionsController],
      providers: [
        {
          provide: QuestionsService,
          useValue: {},
        },
      ],
    }).compile();

    controller = module.get<ExamQuestionsController>(ExamQuestionsController);
  });

  it('should be defined', () => {
    expect(controller).toBeDefined();
  });
});
