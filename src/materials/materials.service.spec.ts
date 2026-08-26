import {
  BadRequestException,
  ConflictException,
  ForbiddenException,
  NotFoundException,
} from '@nestjs/common';
import { AccessLevel, MaterialType } from '../../generated/client/enums';
import { PrismaService } from '../prisma/prisma.service';
import { MaterialsService } from './materials.service';

describe('MaterialsService', () => {
  const activeSubject = { id: 'subject-1', isActive: true };
  const inactiveSubject = { id: 'subject-2', isActive: false };
  const pdf = {
    id: 'material-1',
    subjectId: 'subject-1',
    title: 'PDF material',
    materialType: MaterialType.PDF,
    storageUrl: 'https://example.com/material.pdf',
    embedUrl: null,
    originalFileName: 'material.pdf',
    mimeType: 'application/pdf',
    fileSizeBytes: 100,
    accessLevel: AccessLevel.FREE,
    isPublished: false,
    publishedAt: null,
    subject: {
      id: 'subject-1',
      code: 'MATH',
      name: 'Math',
      description: null,
      displayOrder: 1,
      isActive: true,
    },
  };

  let service: MaterialsService;
  let prisma: any;

  beforeEach(() => {
    prisma = {
      subject: { findUnique: jest.fn() },
      user: { findUnique: jest.fn() },
      material: {
        findUnique: jest.fn(),
        findFirst: jest.fn(),
        findMany: jest.fn(),
        create: jest.fn(),
        update: jest.fn(),
        delete: jest.fn(),
      },
    };
    service = new MaterialsService(prisma as PrismaService);
  });

  it('creates a PDF unpublished and server-controls publish fields', async () => {
    prisma.subject.findUnique.mockResolvedValue(activeSubject);
    prisma.material.create.mockResolvedValue(pdf);

    await expect(
      service.create({
        subjectId: 'subject-1',
        title: '  PDF material  ',
        materialType: MaterialType.PDF,
        storageUrl: 'https://example.com/material.pdf',
        mimeType: 'application/pdf',
        accessLevel: AccessLevel.FREE,
        isPublished: true,
        publishedAt: new Date(),
      } as any),
    ).resolves.toBe(pdf);

    expect(prisma.material.create).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          title: 'PDF material',
          isPublished: false,
          publishedAt: null,
          storageUrl: 'https://example.com/material.pdf',
        }),
      }),
    );
  });

  it('creates an embedded video without document metadata', async () => {
    prisma.subject.findUnique.mockResolvedValue(activeSubject);
    prisma.material.create.mockResolvedValue({ ...pdf, materialType: MaterialType.EMBEDDED_VIDEO });

    await service.create({
      subjectId: 'subject-1',
      title: 'Video',
      materialType: MaterialType.EMBEDDED_VIDEO,
      embedUrl: 'https://example.com/embed/video',
      storageUrl: 'https://example.com/ignored.pdf',
      originalFileName: 'ignored.pdf',
      mimeType: 'application/pdf',
      fileSizeBytes: 100,
      accessLevel: AccessLevel.PRO,
    });

    expect(prisma.material.create.mock.calls[0][0].data).toEqual(
      expect.objectContaining({
        storageUrl: null,
        originalFileName: null,
        mimeType: null,
        fileSizeBytes: null,
        embedUrl: 'https://example.com/embed/video',
        isPublished: false,
      }),
    );
  });

  it.each([null, inactiveSubject])(
    'rejects creation for a missing or inactive Subject',
    async (subject) => {
      prisma.subject.findUnique.mockResolvedValue(subject);

      await expect(
        service.create({
          subjectId: 'subject-1',
          title: 'PDF',
          materialType: MaterialType.PDF,
          storageUrl: 'https://example.com/a.pdf',
          accessLevel: AccessLevel.FREE,
        }),
      ).rejects.toBeInstanceOf(NotFoundException);
      expect(prisma.material.create).not.toHaveBeenCalled();
    },
  );

  it.each([
    [MaterialType.PDF, undefined, 'storageUrl'],
    [MaterialType.DOCX, 'not-a-url', 'storageUrl'],
    [MaterialType.EMBEDDED_VIDEO, undefined, 'embedUrl'],
  ])('rejects a material with an invalid required URL', async (type, url, field) => {
    prisma.subject.findUnique.mockResolvedValue(activeSubject);

    await expect(
      service.create({
        subjectId: 'subject-1',
        title: 'Invalid',
        materialType: type,
        ...(field === 'storageUrl' ? { storageUrl: url } : { embedUrl: url }),
        accessLevel: AccessLevel.FREE,
      } as any),
    ).rejects.toBeInstanceOf(BadRequestException);
  });

  it('lists all materials for Admin in stable order', async () => {
    prisma.material.findMany.mockResolvedValue([pdf]);

    await expect(
      service.findAll(
        { materialType: MaterialType.PDF },
        { userId: 'admin-1', role: 'ADMIN' } as any,
      ),
    ).resolves.toEqual([pdf]);

    expect(prisma.material.findMany).toHaveBeenCalledWith(
      expect.objectContaining({
        where: { materialType: MaterialType.PDF },
        orderBy: [{ createdAt: 'desc' }, { id: 'asc' }],
      }),
    );
  });

  it('limits a FREE Student to published FREE materials on active Subjects', async () => {
    prisma.user.findUnique.mockResolvedValue({
      accessLevel: AccessLevel.FREE,
      proExpiresAt: null,
      isActive: true,
    });
    prisma.material.findMany.mockResolvedValue([pdf]);

    await service.findAll({}, { userId: 'student-1', role: 'STUDENT' } as any);

    expect(prisma.material.findMany.mock.calls[0][0].where).toEqual({
      isPublished: true,
      accessLevel: AccessLevel.FREE,
      subject: { isActive: true },
    });
  });

  it('treats an expired PRO account as FREE', async () => {
    prisma.user.findUnique.mockResolvedValue({
      accessLevel: AccessLevel.PRO,
      proExpiresAt: new Date('2000-01-01T00:00:00.000Z'),
      isActive: true,
    });
    prisma.material.findMany.mockResolvedValue([]);

    await service.findAll({}, { userId: 'student-1', role: 'STUDENT' } as any);

    expect(prisma.material.findMany.mock.calls[0][0].where.accessLevel).toBe(
      AccessLevel.FREE,
    );
  });

  it('lets an active PRO account see published FREE and PRO materials', async () => {
    prisma.user.findUnique.mockResolvedValue({
      accessLevel: AccessLevel.PRO,
      proExpiresAt: null,
      isActive: true,
    });
    prisma.material.findMany.mockResolvedValue([]);

    await service.findAll({}, { userId: 'student-1', role: 'STUDENT' } as any);

    expect(prisma.material.findMany.mock.calls[0][0].where).toEqual({
      isPublished: true,
      subject: { isActive: true },
    });
  });

  it('returns 404 for a Student when a material is unpublished or inaccessible', async () => {
    prisma.user.findUnique.mockResolvedValue({
      accessLevel: AccessLevel.FREE,
      proExpiresAt: null,
      isActive: true,
    });
    prisma.material.findFirst.mockResolvedValue(null);

    await expect(
      service.findOne('material-1', { userId: 'student-1', role: 'STUDENT' } as any),
    ).rejects.toBeInstanceOf(NotFoundException);

    expect(prisma.material.findFirst.mock.calls[0][0].where).toEqual({
      id: 'material-1',
      isPublished: true,
      accessLevel: AccessLevel.FREE,
      subject: { isActive: true },
    });
  });

  it('rejects access for an inactive Student account', async () => {
    prisma.user.findUnique.mockResolvedValue({
      accessLevel: AccessLevel.FREE,
      proExpiresAt: null,
      isActive: false,
    });

    await expect(
      service.findAll({}, { userId: 'student-1', role: 'STUDENT' } as any),
    ).rejects.toBeInstanceOf(ForbiddenException);
  });

  it('updates metadata and validates a changed active Subject', async () => {
    prisma.material.findUnique.mockResolvedValue({
      ...pdf,
      subject: undefined,
    });
    prisma.subject.findUnique.mockResolvedValue({ id: 'subject-2', isActive: true });
    prisma.material.update.mockResolvedValue(pdf);

    await service.update('material-1', {
      subjectId: 'subject-2',
      title: 'Updated',
    });

    expect(prisma.material.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: expect.objectContaining({
          subjectId: 'subject-2',
          title: 'Updated',
        }),
      }),
    );
  });

  it('rejects changing a video to PDF without a storage URL', async () => {
    prisma.material.findUnique.mockResolvedValue({
      ...pdf,
      materialType: MaterialType.EMBEDDED_VIDEO,
      storageUrl: null,
      embedUrl: 'https://example.com/video',
      originalFileName: null,
      mimeType: null,
      fileSizeBytes: null,
    });

    await expect(
      service.update('material-1', { materialType: MaterialType.PDF }),
    ).rejects.toBeInstanceOf(BadRequestException);
    expect(prisma.material.update).not.toHaveBeenCalled();
  });

  it('does not allow update DTOs to change publish fields', async () => {
    prisma.material.findUnique.mockResolvedValue(pdf);
    prisma.material.update.mockResolvedValue(pdf);

    await service.update('material-1', {
      title: 'Updated',
      isPublished: true,
      publishedAt: new Date(),
    } as any);

    const data = prisma.material.update.mock.calls[0][0].data;
    expect(data).not.toHaveProperty('isPublished');
    expect(data).not.toHaveProperty('publishedAt');
  });

  it('publishes a valid material and sets publishedAt server-side', async () => {
    prisma.material.findUnique.mockResolvedValue({
      id: 'material-1',
      subjectId: 'subject-1',
      materialType: MaterialType.PDF,
      storageUrl: 'https://example.com/material.pdf',
      embedUrl: null,
      originalFileName: 'material.pdf',
      mimeType: 'application/pdf',
      fileSizeBytes: 100,
      isPublished: false,
      subject: { isActive: true },
    });
    prisma.material.update.mockResolvedValue({ ...pdf, isPublished: true });

    await service.publish('material-1');

    expect(prisma.material.update).toHaveBeenCalledWith(
      expect.objectContaining({
        data: { isPublished: true, publishedAt: expect.any(Date) },
      }),
    );
  });

  it('rejects publishing an already published or invalid material', async () => {
    prisma.material.findUnique.mockResolvedValue({
      id: 'material-1',
      isPublished: true,
      subject: { isActive: true },
    });
    await expect(service.publish('material-1')).rejects.toBeInstanceOf(
      ConflictException,
    );

    prisma.material.findUnique.mockResolvedValue({
      id: 'material-1',
      materialType: MaterialType.PDF,
      storageUrl: null,
      embedUrl: null,
      originalFileName: null,
      mimeType: null,
      fileSizeBytes: null,
      isPublished: false,
      subject: { isActive: true },
    });
    await expect(service.publish('material-1')).rejects.toBeInstanceOf(
      BadRequestException,
    );
  });

  it('unpublishes only published materials', async () => {
    prisma.material.findUnique.mockResolvedValue({ id: 'material-1', isPublished: true });
    prisma.material.update.mockResolvedValue({ ...pdf, isPublished: false });

    await service.unpublish('material-1');

    expect(prisma.material.update).toHaveBeenCalledWith(
      expect.objectContaining({ data: { isPublished: false, publishedAt: null } }),
    );

    prisma.material.findUnique.mockResolvedValue({ id: 'material-1', isPublished: false });
    await expect(service.unpublish('material-1')).rejects.toBeInstanceOf(
      ConflictException,
    );
  });

  it('deletes a material and returns 404 for a missing material', async () => {
    prisma.material.findUnique.mockResolvedValueOnce({ id: 'material-1' });
    prisma.material.delete.mockResolvedValue(pdf);
    await expect(service.remove('material-1')).resolves.toBe(pdf);

    prisma.material.findUnique.mockResolvedValueOnce(null);
    await expect(service.remove('missing')).rejects.toBeInstanceOf(
      NotFoundException,
    );
  });
});
