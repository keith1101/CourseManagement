import { Injectable, NotFoundException } from '@nestjs/common';
import { PrismaService } from '../prisma/prisma.service';
import { CreateSubjectDto } from './dto/create-subject.dto';
import { UpdateSubjectDto } from './dto/update-subject.dto';

@Injectable()
export class SubjectsService {
    constructor (private readonly prisma: PrismaService) {}

    create(createSubjectDto: CreateSubjectDto) {
        return this.prisma.subject.create ({
            data: createSubjectDto,
        })
    }   

    async findAll() {
        return this.prisma.subject.findMany({
            where: {
                isActive: true,
            }
        });
    }

    async findOne(id: string) {
        const subject = await this.prisma.subject.findUnique({
            where: {
                id: id,
            }
        });
        if (!subject || !subject.isActive) {
            throw new NotFoundException('Subject not found!');
        }

        return subject;
    }

    async update(id: string, updateSubjectDto: UpdateSubjectDto) {
        return this.prisma.subject.update ({
            where: { id },
            data: updateSubjectDto,
        });
    }

    async remove(id: string) {
        return this.prisma.subject.update ({
            where: { id },
            data: {
                isActive: false,
            }
        });
    }
}
