import { Module } from '@nestjs/common';
import { ConfigModule } from '@nestjs/config';
import { AppController } from './app.controller';
import { PrismaModule } from './prisma/prisma.module';
import { AuthModule } from './auth/auth.module';
import { UsersModule } from './users/users.module';
import { QuestionsModule } from './questions/questions.module';
import { SubjectsModule } from './subjects/subjects.module';
import { AssignmentsModule } from './assignments/assignments.module';
import { AttemptsModule } from './attempts/attempts.module';

@Module({
  imports: [
    ConfigModule.forRoot({
      isGlobal: true,
    }),
    PrismaModule,
    AuthModule,
    UsersModule,
    QuestionsModule,
    SubjectsModule,
    AssignmentsModule,
    AttemptsModule,
  ],
  controllers: [AppController],
})
export class AppModule { }

