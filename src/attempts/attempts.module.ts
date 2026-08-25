import { Module } from '@nestjs/common';
import { StudentGuard } from '../auth/student.guard';
import { AttemptsController } from './attempts.controller';
import { AttemptsService } from './attempts.service';
import { ExamAttemptsController } from './exam-attempts.controller';

@Module({
    controllers: [AttemptsController, ExamAttemptsController],
    providers: [AttemptsService, StudentGuard],
})
export class AttemptsModule {}
