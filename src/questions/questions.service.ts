import { Injectable } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { UpdateQuestionsDto } from './dto/update-questions.dto';
import { PipesConsumer } from '@nestjs/core/pipes';

@Injectable()
export class QuestionsService {

    constructor(
        private readonly prismaService: PrismaService
    ) {

    }

    async find(id: string) {
        const question = this.prismaService.question.findUnique({
            where: { id }
        });
        return question;
    }

    async update(id: string, updateQuestionsDto: UpdateQuestionsDto) {
        const question = this.prismaService.question.update({
            where: { id },
            data: updateQuestionsDto
        })
        return question;
    }

    async updateOrder(id: string, order: number) {
        const question = await this.prismaService.question.findUnique({ where: { id: id } });

        if (question == null || question.position == order) {
            return false;
        }

        const numbersOfQuestion = await this.prismaService.question.count();

        if (order > numbersOfQuestion || order < 0) {
            return false;
        }

        if (order < question.position) {
            await this.prismaService.question.updateMany({
                where: {
                    position: {
                        gte: order,
                        lt: question.position,
                    }
                },
                data: {
                    position: {
                        increment: 1,
                    }
                }
            });
        } else {
            await this.prismaService.question.updateMany({
                where: {
                    position: {
                        gt: question.position,
                        lte: order,
                    }
                },
                data: {
                    position: {
                        decrement: 1,
                    }
                }
            });
        }

        const updateStatus = await this.prismaService.question.update({
            where: {
                id: id
            },
            data: {
                position: order
            }
        });

        return updateStatus;
    }

    async deleteQuestion(id: string) {
        const question = await this.prismaService.question.findUnique({
            where: {id: id}
        })

        if (question == null) {
            return false;
        }

        const deleteStatus = await this.prismaService.question.update({
            where: {id: id},
            data: {
                deletedAt: new Date(),
            }
        });

        await this.prismaService.question.updateMany({
            where: {
                id: id,
                position: {
                    gt: question.position + 1
                }
            },
            data: {
                position: {
                    decrement: 1
                }
            }
        })


        return deleteStatus;
    }
}
