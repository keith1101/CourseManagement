import {
    BadRequestException,
    Body,
    Controller,
    Delete,
    Get,
    Param,
    Patch,
    Post,
    Request,
    UploadedFile,
    UseInterceptors,
    UseGuards,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { Roles } from '../auth/roles.decorator';
import { RolesGuard } from '../auth/roles.guard';
import { UserRole } from '../../generated/client/client';
import { QuestionsService } from './questions.service';
import { UpdateQuestionsDto } from './dto/update-questions.dto';
import { UpdateQuestionOrderDto } from './dto/update-question-order.dto';
import { CreateQuestionOptionDto, UpdateQuestionOptionDto } from './dto/question-option.dto';
import { StorageUploadFile } from '../storage/gcs-storage.service';

type AuthenticatedRequest = {
    user: { role: UserRole };
};

@UseGuards(JwtAuthGuard, RolesGuard)
@Roles(UserRole.ADMIN, UserRole.STUDENT)
@Controller('questions')
export class QuestionsController {
    constructor(private readonly questionsService: QuestionsService) {}

    @Roles(UserRole.ADMIN)
    @Post('images')
    @UseInterceptors(
        FileInterceptor('file', {
            limits: { fileSize: 5 * 1024 * 1024 },
            fileFilter: (_request, file, callback) => {
                if (!file.mimetype?.startsWith('image/')) {
                    callback(new Error('Only image files are allowed'), false);
                    return;
                }

                callback(null, true);
            },
        }),
    )
    uploadImage(@UploadedFile() file: StorageUploadFile | undefined) {
        if (!file) {
            throw new BadRequestException('Image file is required');
        }

        return this.questionsService.uploadImage(file);
    }

    @Get(':id')
    showDetail(@Param('id') id: string, @Request() request: AuthenticatedRequest) {
        return this.questionsService.find(id, request.user.role === UserRole.ADMIN);
    }

    @Roles(UserRole.ADMIN)
    @Patch(':id')
    update(
        @Param('id') id: string,
        @Body() updateQuestionsDto: UpdateQuestionsDto,
    ) {
        return this.questionsService.update(id, updateQuestionsDto);
    }

    @Roles(UserRole.ADMIN)
    @Patch(':id/order')
    updateOrder(
        @Param('id') id: string,
        @Body() updateQuestionOrderDto: UpdateQuestionOrderDto,
    ) {
        return this.questionsService.updateOrder(
            id,
            updateQuestionOrderDto.order,
        );
    }

    @Roles(UserRole.ADMIN)
    @Delete(':id')
    deleteQuestion(@Param('id') id: string) {
        return this.questionsService.deleteQuestion(id);
    }

    // Option routes
    @Roles(UserRole.ADMIN)
    @Post(':id/options')
    createOption(
        @Param('id') id: string,
        @Body() createOptionDto: CreateQuestionOptionDto,
    ) {
        return this.questionsService.createOption(id, createOptionDto);
    }

    @Roles(UserRole.ADMIN)
    @Patch('options/:optionId')
    updateOption(
        @Param('optionId') optionId: string,
        @Body() updateOptionDto: UpdateQuestionOptionDto,
    ) {
        return this.questionsService.updateOption(optionId, updateOptionDto);
    }

    @Roles(UserRole.ADMIN)
    @Delete('options/:optionId')
    deleteOption(@Param('optionId') optionId: string) {
        return this.questionsService.deleteOption(optionId);
    }
}
