import { Module } from '@nestjs/common';
import { AdminGuard } from '../auth/admin.guard';
import { AssignmentsController } from './assignments.controller';
import { AssignmentsService } from './assignments.service';

@Module({
    controllers: [AssignmentsController],
    providers: [AssignmentsService, AdminGuard],
})
export class AssignmentsModule {}
