import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  Injectable,
  NotFoundException,
} from '@nestjs/common';
import { AccessLevel, MaterialType } from '../../generated/client/enums';
import { Prisma, UserRole } from '../../generated/client/client';
import { PrismaService } from '../prisma/prisma.service';
import { CreateMaterialDto } from './dto/create-material.dto';
import { MaterialQueryDto } from './dto/material-query.dto';
import { UpdateMaterialDto } from './dto/update-material.dto';
import { UploadMaterialDto } from './dto/upload-material.dto';
import {
  GcsStorageService,
  StorageUploadFile,
} from '../storage/gcs-storage.service';
import { randomUUID } from 'node:crypto';
import { normalizeYoutubeEmbedUrl } from './youtube-url';

const materialInclude = {
  subject: {
    select: {
      id: true,
      code: true,
      name: true,
      description: true,
      displayOrder: true,
      isActive: true,
    },
  },
} as const;

type Viewer = {
  userId: string;
  role: UserRole;
};

type MaterialShape = {
  materialType: MaterialType;
  storageUrl?: string | null;
  embedUrl?: string | null;
  originalFileName?: string | null;
  mimeType?: string | null;
  fileSizeBytes?: number | null;
};

@Injectable()
export class MaterialsService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly gcsStorage: GcsStorageService,
  ) {}

  async create(createMaterialDto: CreateMaterialDto) {
    await this.ensureActiveSubject(createMaterialDto.subjectId);

    const title = createMaterialDto.title.trim();
    if (!title) throw new BadRequestException('Title cannot be empty');

    const shape = this.normalizeShape({
      materialType: createMaterialDto.materialType,
      storageUrl: createMaterialDto.storageUrl,
      embedUrl: createMaterialDto.embedUrl,
      originalFileName: createMaterialDto.originalFileName,
      mimeType: createMaterialDto.mimeType,
      fileSizeBytes: createMaterialDto.fileSizeBytes,
    });
    this.validateShape(shape);

    try {
      return await this.prisma.material.create({
        data: {
          subjectId: createMaterialDto.subjectId,
          title,
          materialType: shape.materialType,
          storageUrl: shape.storageUrl ?? null,
          embedUrl: shape.embedUrl ?? null,
          originalFileName: shape.originalFileName ?? null,
          mimeType: shape.mimeType ?? null,
          fileSizeBytes: shape.fileSizeBytes ?? null,
          accessLevel: createMaterialDto.accessLevel,
          isPublished: false,
          publishedAt: null,
        },
        include: materialInclude,
      });
    } catch (error) {
      this.handlePrismaError(error);
    }
  }

  async upload(file: StorageUploadFile, uploadMaterialDto: UploadMaterialDto) {
    await this.ensureActiveSubject(uploadMaterialDto.subjectId);

    const title = uploadMaterialDto.title.trim();
    if (!title) throw new BadRequestException('Title cannot be empty');

    const materialType = this.detectUploadedMaterialType(file);
    const safeFileName = file.originalname.replace(/[^a-zA-Z0-9._-]/g, '-');
    const objectName = `materials/${uploadMaterialDto.subjectId}/${randomUUID()}-${safeFileName || 'file'}`;
    const uploaded = await this.gcsStorage.upload(file, objectName);

    try {
      return await this.prisma.material.create({
        data: {
          subjectId: uploadMaterialDto.subjectId,
          title,
          materialType,
          storageUrl: uploaded.gsUri,
          embedUrl: null,
          originalFileName: file.originalname,
          mimeType: file.mimetype,
          fileSizeBytes: file.size,
          accessLevel: uploadMaterialDto.accessLevel,
          isPublished: false,
          publishedAt: null,
        },
        include: materialInclude,
      });
    } catch (error) {
      await this.gcsStorage.delete(uploaded.gsUri).catch(() => undefined);
      this.handlePrismaError(error);
    }
  }

  async findAll(query: MaterialQueryDto, viewer: Viewer) {
    const where: Prisma.MaterialWhereInput = {};

    if (query.subjectId) where.subjectId = query.subjectId;
    if (query.materialType) where.materialType = query.materialType;
    if (query.accessLevel) where.accessLevel = query.accessLevel;

    if (viewer.role === UserRole.ADMIN) {
      return this.prisma.material.findMany({
        where,
        include: materialInclude,
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      });
    }

    const access = await this.getStudentAccess(viewer.userId);
    where.isPublished = true;
    where.subject = { isActive: true };
    if (!access.isPro) where.accessLevel = AccessLevel.FREE;

    return this.prisma.material.findMany({
      where,
      include: materialInclude,
      orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
    });
  }

  async findOne(id: string, viewer: Viewer) {
    const query = {
      include: materialInclude,
    } as const;

    const material =
      viewer.role === UserRole.ADMIN
        ? await this.prisma.material.findUnique({ where: { id }, ...query })
        : await this.findStudentMaterial(id, viewer.userId, query);

    if (!material) throw new NotFoundException('Material not found');
    return material;
  }

  async getDownloadUrl(id: string, viewer: Viewer) {
    const material = await this.findOne(id, viewer);

    if (
      material.materialType === MaterialType.EMBEDDED_VIDEO ||
      !material.storageUrl
    ) {
      throw new NotFoundException('Download is not available for this material');
    }

    const expiresInSeconds = 15 * 60;
    const url = await this.gcsStorage.getSignedReadUrl(
      material.storageUrl,
      expiresInSeconds,
    );

    return {
      url,
      expiresAt: new Date(Date.now() + expiresInSeconds * 1000).toISOString(),
    };
  }

  async update(id: string, updateMaterialDto: UpdateMaterialDto) {
    const existing = await this.prisma.material.findUnique({ where: { id } });
    if (!existing) throw new NotFoundException('Material not found');

    const subjectId = updateMaterialDto.subjectId ?? existing.subjectId;
    if (subjectId !== existing.subjectId) {
      await this.ensureActiveSubject(subjectId);
    }

    const shape = this.normalizeShape({
      materialType: updateMaterialDto.materialType ?? existing.materialType,
      storageUrl: updateMaterialDto.storageUrl ?? existing.storageUrl,
      embedUrl: updateMaterialDto.embedUrl ?? existing.embedUrl,
      originalFileName:
        updateMaterialDto.originalFileName ?? existing.originalFileName,
      mimeType: updateMaterialDto.mimeType ?? existing.mimeType,
      fileSizeBytes: updateMaterialDto.fileSizeBytes ?? existing.fileSizeBytes,
    });
    this.validateShape(shape);

    const title =
      updateMaterialDto.title === undefined
        ? existing.title
        : updateMaterialDto.title.trim();
    if (!title) throw new BadRequestException('Title cannot be empty');

    try {
      return await this.prisma.material.update({
        where: { id },
        data: {
          subjectId,
          title,
          materialType: shape.materialType,
          storageUrl: shape.storageUrl ?? null,
          embedUrl: shape.embedUrl ?? null,
          originalFileName: shape.originalFileName ?? null,
          mimeType: shape.mimeType ?? null,
          fileSizeBytes: shape.fileSizeBytes ?? null,
          accessLevel: updateMaterialDto.accessLevel ?? existing.accessLevel,
        },
        include: materialInclude,
      });
    } catch (error) {
      this.handlePrismaError(error);
    }
  }

  async publish(id: string) {
    const material = await this.prisma.material.findUnique({
      where: { id },
      select: {
        id: true,
        subjectId: true,
        materialType: true,
        storageUrl: true,
        embedUrl: true,
        originalFileName: true,
        mimeType: true,
        fileSizeBytes: true,
        isPublished: true,
        subject: { select: { isActive: true } },
      },
    });

    if (!material) throw new NotFoundException('Material not found');
    if (material.isPublished) {
      throw new ConflictException('Material is already published');
    }
    if (!material.subject.isActive) {
      throw new NotFoundException('Subject not found');
    }

    this.validateShape(material);

    try {
      return await this.prisma.material.update({
        where: { id },
        data: { isPublished: true, publishedAt: new Date() },
        include: materialInclude,
      });
    } catch (error) {
      this.handlePrismaError(error);
    }
  }

  async unpublish(id: string) {
    const material = await this.prisma.material.findUnique({
      where: { id },
      select: { id: true, isPublished: true },
    });

    if (!material) throw new NotFoundException('Material not found');
    if (!material.isPublished) {
      throw new ConflictException('Material is already unpublished');
    }

    try {
      return await this.prisma.material.update({
        where: { id },
        data: { isPublished: false, publishedAt: null },
        include: materialInclude,
      });
    } catch (error) {
      this.handlePrismaError(error);
    }
  }

  async remove(id: string) {
    const existing = await this.prisma.material.findUnique({
      where: { id },
      select: { id: true, storageUrl: true },
    });
    if (!existing) throw new NotFoundException('Material not found');

    if (existing.storageUrl?.startsWith('gs://')) {
      await this.gcsStorage.delete(existing.storageUrl);
    }

    try {
      return await this.prisma.material.delete({ where: { id } });
    } catch (error) {
      this.handlePrismaError(error);
    }
  }

  private async findStudentMaterial(
    id: string,
    userId: string,
    query: { include: typeof materialInclude },
  ) {
    const access = await this.getStudentAccess(userId);
    const where: Prisma.MaterialWhereInput = {
      id,
      isPublished: true,
      subject: { isActive: true },
    };
    if (!access.isPro) where.accessLevel = AccessLevel.FREE;

    return this.prisma.material.findFirst({
      where,
      ...query,
    });
  }

  private async getStudentAccess(userId: string) {
    const user = await this.prisma.user.findUnique({
      where: { id: userId },
      select: { accessLevel: true, proExpiresAt: true, isActive: true },
    });

    if (!user || !user.isActive) {
      throw new ForbiddenException('User cannot access materials');
    }

    return {
      isPro:
        user.accessLevel === AccessLevel.PRO &&
        (!user.proExpiresAt || user.proExpiresAt.getTime() > Date.now()),
    };
  }

  private async ensureActiveSubject(subjectId: string) {
    const subject = await this.prisma.subject.findUnique({
      where: { id: subjectId },
      select: { id: true, isActive: true },
    });

    if (!subject || !subject.isActive) {
      throw new NotFoundException('Subject not found');
    }
  }

  private normalizeShape(shape: MaterialShape): MaterialShape {
    if (shape.materialType === MaterialType.EMBEDDED_VIDEO) {
      return {
        ...shape,
        embedUrl: normalizeYoutubeEmbedUrl(shape.embedUrl),
        storageUrl: null,
        originalFileName: null,
        mimeType: null,
        fileSizeBytes: null,
      };
    }

    // Document types use storageUrl as their source. Any stale embed metadata
    // is cleared so a type change cannot leave contradictory state behind.
    return { ...shape, embedUrl: null };
  }

  private validateShape(shape: MaterialShape) {
    if (shape.materialType === MaterialType.EMBEDDED_VIDEO) {
      if (!this.isHttpUrl(shape.embedUrl)) {
        throw new BadRequestException(
          'EMBEDDED_VIDEO materials require a valid embedUrl',
        );
      }
      return;
    }

    if (!this.isStorageUrl(shape.storageUrl)) {
      throw new BadRequestException(
        `${shape.materialType} materials require a valid storageUrl`,
      );
    }

    if (
      shape.mimeType &&
      shape.materialType === MaterialType.PDF &&
      shape.mimeType.toLowerCase() !== 'application/pdf'
    ) {
      throw new BadRequestException('PDF materials require application/pdf');
    }

    if (
      shape.mimeType &&
      shape.materialType === MaterialType.DOCX &&
      ![
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        'application/msword',
      ].includes(shape.mimeType.toLowerCase())
    ) {
      throw new BadRequestException('DOCX materials require a DOCX MIME type');
    }
  }

  private isHttpUrl(value: string | null | undefined) {
    if (!value) return false;

    try {
      const url = new URL(value);
      return url.protocol === 'http:' || url.protocol === 'https:';
    } catch {
      return false;
    }
  }

  private isStorageUrl(value: string | null | undefined) {
    return this.isHttpUrl(value) || /^gs:\/\/[^/]+\/.+/.test(value ?? '');
  }

  private detectUploadedMaterialType(file: StorageUploadFile) {
    const mimeType = file.mimetype.toLowerCase();

    if (mimeType === 'application/pdf') {
      return MaterialType.PDF;
    }

    if (
      mimeType ===
        'application/vnd.openxmlformats-officedocument.wordprocessingml.document' ||
      mimeType === 'application/msword'
    ) {
      return MaterialType.DOCX;
    }

    throw new BadRequestException('Only PDF and DOCX files can be uploaded');
  }

  private handlePrismaError(error: unknown): never {
    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2025'
    ) {
      throw new NotFoundException('Material not found');
    }

    if (
      error instanceof Prisma.PrismaClientKnownRequestError &&
      error.code === 'P2003'
    ) {
      throw new ConflictException('Material relation conflict');
    }

    throw error;
  }
}
