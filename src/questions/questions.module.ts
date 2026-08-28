import { Module } from '@nestjs/common';
import { QuestionsService } from './questions.service';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { QuestionsController } from './questions.controller';
import { ExamQuestionsController } from './exam-questions.controller';

@Module({
    imports: [AuthModule, PrismaModule],
  providers: [QuestionsService],
  controllers: [QuestionsController, ExamQuestionsController]
})
export class QuestionsModule {}
