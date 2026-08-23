import { Body, Controller, Delete, Get, Param, Patch} from '@nestjs/common';
import { QuestionsService } from './questions.service';
import { UpdateQuestionsDto } from './dto/update-questions.dto';

@Controller('questions')
export class QuestionsController {
    constructor(
        private readonly questionsService: QuestionsService
    ) {

    }

    @Get(':id')
    showDetail(
        @Param('id') id: string) {
        return this.questionsService.find(id);
    }

    @Patch(':id')
    update(
        @Param('id') id: string, 
        @Body() updateQuestionsDto: UpdateQuestionsDto) {
        return this.questionsService.update(id, updateQuestionsDto);
    }

    @Patch(':id/order') 
    updateOrder(
        @Param('id') id: string, 
        @Param('order') order: number) {
        return this.questionsService.updateOrder(id, order);
    }

    @Delete(':id')
    deleteQuestion(
        @Param('id') id: string) {
        
    }

}
