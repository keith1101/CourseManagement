import { Module } from '@nestjs/common';
import { AuthModule } from '../auth/auth.module';
import { PrismaModule } from '../prisma/prisma.module';
import { R2StorageModule } from '../storage/r2-storage.module';
import { AttemptsController } from './attempts.controller';
import { AttemptsService } from './attempts.service';
import { ExamAttemptsController } from './exam-attempts.controller';

@Module({
    imports: [AuthModule, PrismaModule, R2StorageModule],
    controllers: [AttemptsController, ExamAttemptsController],
    providers: [AttemptsService],
})
export class AttemptsModule {}
