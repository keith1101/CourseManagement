import { Module } from '@nestjs/common';
import { QuestionsService } from './questions.service';
import { QuestionsController } from './questions.controller';
import { ExamQuestionsController } from './exam-questions.controller';

@Module({
  providers: [QuestionsService, ExamQuestionsController],
  controllers: [QuestionsController]
})
export class QuestionsModule {}
