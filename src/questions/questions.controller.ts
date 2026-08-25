import {
    Body,
    Controller,
    Delete,
    Get,
    Param,
    Patch,
    Post,
    UseGuards,
} from '@nestjs/common';
import { JwtAuthGuard } from '../auth/jwt-auth.guard';
import { AdminGuard } from '../auth/admin.guard';
import { QuestionsService } from './questions.service';
import { UpdateQuestionsDto } from './dto/update-questions.dto';
import { UpdateQuestionOrderDto } from './dto/update-question-order.dto';
import { CreateQuestionOptionDto, UpdateQuestionOptionDto } from './dto/question-option.dto';

@UseGuards(JwtAuthGuard)
@Controller('questions')
export class QuestionsController {
    constructor(private readonly questionsService: QuestionsService) {}

    @Get(':id')
    showDetail(@Param('id') id: string) {
        return this.questionsService.find(id);
    }

    @UseGuards(AdminGuard)
    @Patch(':id')
    update(
        @Param('id') id: string,
        @Body() updateQuestionsDto: UpdateQuestionsDto,
    ) {
        return this.questionsService.update(id, updateQuestionsDto);
    }

    @UseGuards(AdminGuard)
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

    @UseGuards(AdminGuard)
    @Delete(':id')
    deleteQuestion(@Param('id') id: string) {
        return this.questionsService.deleteQuestion(id);
    }

    // Option routes
    @UseGuards(AdminGuard)
    @Post(':id/options')
    createOption(
        @Param('id') id: string,
        @Body() createOptionDto: CreateQuestionOptionDto,
    ) {
        return this.questionsService.createOption(id, createOptionDto);
    }

    @UseGuards(AdminGuard)
    @Patch('options/:optionId')
    updateOption(
        @Param('optionId') optionId: string,
        @Body() updateOptionDto: UpdateQuestionOptionDto,
    ) {
        return this.questionsService.updateOption(optionId, updateOptionDto);
    }

    @UseGuards(AdminGuard)
    @Delete('options/:optionId')
    deleteOption(@Param('optionId') optionId: string) {
        return this.questionsService.deleteOption(optionId);
    }
}
