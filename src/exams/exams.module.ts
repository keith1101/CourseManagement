import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { R2StorageModule } from '../storage/r2-storage.module';
import { ExamsController } from './exams.controller';
import { ExamPdfService } from './exam-pdf.service';
import { ExamsService } from './exams.service';

@Module({
  imports: [AuthModule, PrismaModule, R2StorageModule],
  controllers: [ExamsController],
  providers: [ExamsService, ExamPdfService],
  exports: [ExamsService],
})
export class ExamsModule {}
