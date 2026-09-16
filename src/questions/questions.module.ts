import { Module } from '@nestjs/common';
import { QuestionsService } from './questions.service';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { R2StorageModule } from '../storage/r2-storage.module';
import { ExamsModule } from '../exams/exams.module';
import { QuestionsController } from './questions.controller';
import { ExamQuestionsController } from './exam-questions.controller';

@Module({
    imports: [AuthModule, PrismaModule, R2StorageModule, ExamsModule],
  providers: [QuestionsService],
  controllers: [QuestionsController, ExamQuestionsController]
})
export class QuestionsModule {}
