jest.mock('@google-cloud/storage', () => {
  const mockSave = jest.fn();
  const mockDelete = jest.fn();
  const mockGetSignedUrl = jest.fn();
  const mockFile = jest.fn(() => ({
    save: mockSave,
    delete: mockDelete,
    getSignedUrl: mockGetSignedUrl,
  }));
  const mockBucket = jest.fn(() => ({ file: mockFile }));

  return {
    Storage: jest.fn().mockImplementation(() => ({
      bucket: mockBucket,
    })),
    mockBucket,
    mockFile,
    mockSave,
    mockDelete,
    mockGetSignedUrl,
  };
});

import { InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { Storage } from '@google-cloud/storage';
import { GcsStorageService, StorageUploadFile } from './gcs-storage.service';

const {
  mockBucket,
  mockFile,
  mockSave,
  mockDelete,
  mockGetSignedUrl,
} = jest.requireMock('@google-cloud/storage') as {
  mockBucket: jest.Mock;
  mockFile: jest.Mock;
  mockSave: jest.Mock;
  mockDelete: jest.Mock;
  mockGetSignedUrl: jest.Mock;
};

const storageFile: StorageUploadFile = {
  buffer: Buffer.from('png-bytes'),
  originalname: 'screen shot.png',
  mimetype: 'image/png',
  size: 9,
};

describe('GcsStorageService', () => {
  let service: GcsStorageService;
  let errorSpy: jest.SpyInstance;

  beforeEach(() => {
    mockSave.mockReset();
    mockDelete.mockReset();
    mockGetSignedUrl.mockReset();
    mockFile.mockClear();
    mockBucket.mockClear();
    mockSave.mockResolvedValue(undefined);
    mockGetSignedUrl.mockResolvedValue(['https://signed.example/image.png']);

    service = new GcsStorageService(
      new ConfigService({
        GCP_PROJECT_ID: 'course-management-2026',
        GCS_BUCKET_NAME: 'course-media-bucket',
      }),
    );
    errorSpy = jest
      .spyOn((service as unknown as { logger: { error: jest.Mock } }).logger, 'error')
      .mockImplementation();
  });

  afterEach(() => {
    errorSpy.mockRestore();
  });

  it('saves the PNG buffer once with private, non-resumable upload options', async () => {
    await expect(
      service.upload(storageFile, 'questions/unique-id-screen-shot.png'),
    ).resolves.toEqual({
      objectName: 'questions/unique-id-screen-shot.png',
      gsUri: 'gs://course-media-bucket/questions/unique-id-screen-shot.png',
    });

    expect(Storage).toHaveBeenCalledWith({ projectId: 'course-management-2026' });
    expect(mockBucket).toHaveBeenCalledWith('course-media-bucket');
    expect(mockFile).toHaveBeenCalledWith('questions/unique-id-screen-shot.png');
    expect(mockSave).toHaveBeenCalledTimes(1);
    expect(mockSave).toHaveBeenCalledWith(storageFile.buffer, {
      resumable: false,
      metadata: {
        contentType: 'image/png',
        cacheControl: 'private, max-age=0',
        metadata: { originalFileName: 'screen shot.png' },
      },
    });
  });

  it('does not resolve before Cloud Storage reports upload completion', async () => {
    let resolveSave!: () => void;
    mockSave.mockReturnValue(
      new Promise<void>((resolve) => {
        resolveSave = resolve;
      }),
    );
    let settled = false;

    const resultPromise = service
      .upload(storageFile, 'questions/pending.png')
      .finally(() => {
        settled = true;
      });

    await Promise.resolve();
    expect(settled).toBe(false);
    expect(mockSave).toHaveBeenCalledTimes(1);

    resolveSave();
    await expect(resultPromise).resolves.toEqual({
      objectName: 'questions/pending.png',
      gsUri: 'gs://course-media-bucket/questions/pending.png',
    });
  });

  it('logs the original GCS failure and returns a controlled exception', async () => {
    const gcsError = Object.assign(new Error('permission denied'), {
      code: 403,
      response: { status: 403 },
    });
    mockSave.mockRejectedValue(gcsError);

    await expect(
      service.upload(storageFile, 'questions/failed.png'),
    ).rejects.toMatchObject({
      constructor: InternalServerErrorException,
      message: 'Unable to upload file to Cloud Storage',
      status: 500,
    });

    expect(mockSave).toHaveBeenCalledTimes(1);
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('"operation":"upload"'),
    );
    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('permission denied'),
    );
  });

  it('returns a controlled exception when signing the read URL fails', async () => {
    mockGetSignedUrl.mockRejectedValue(new Error('signing failed'));

    await expect(
      service.getSignedReadUrl('gs://course-media-bucket/questions/image.png'),
    ).rejects.toThrow('Unable to generate a file access URL');

    expect(errorSpy).toHaveBeenCalledWith(
      expect.stringContaining('"operation":"getSignedReadUrl"'),
    );
  });
});
