import 'reflect-metadata';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { AccessLevel, MaterialType } from '../../../generated/client/enums';
import { CreateMaterialDto } from './create-material.dto';

describe('CreateMaterialDto', () => {
  it('requires storageUrl for PDF and embedUrl for embedded video', async () => {
    const pdfErrors = await validate(
      plainToInstance(CreateMaterialDto, {
        subjectId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        title: 'PDF',
        materialType: MaterialType.PDF,
        accessLevel: AccessLevel.FREE,
      }),
    );
    const videoErrors = await validate(
      plainToInstance(CreateMaterialDto, {
        subjectId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        title: 'Video',
        materialType: MaterialType.EMBEDDED_VIDEO,
        accessLevel: AccessLevel.FREE,
      }),
    );

    expect(pdfErrors.length).toBeGreaterThan(0);
    expect(videoErrors.length).toBeGreaterThan(0);
  });

  it('accepts valid DOCX metadata and rejects invalid file size', async () => {
    const validErrors = await validate(
      plainToInstance(CreateMaterialDto, {
        subjectId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        title: 'DOCX',
        materialType: MaterialType.DOCX,
        storageUrl: 'https://example.com/file.docx',
        mimeType:
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
        fileSizeBytes: 12,
        accessLevel: AccessLevel.PRO,
      }),
    );
    const invalidErrors = await validate(
      plainToInstance(CreateMaterialDto, {
        subjectId: 'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',
        title: 'DOCX',
        materialType: MaterialType.DOCX,
        storageUrl: 'https://example.com/file.docx',
        fileSizeBytes: 0,
        accessLevel: AccessLevel.PRO,
      }),
    );

    expect(validErrors).toHaveLength(0);
    expect(invalidErrors.length).toBeGreaterThan(0);
  });
});
