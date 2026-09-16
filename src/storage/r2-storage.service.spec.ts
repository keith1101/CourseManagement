jest.mock('@aws-sdk/s3-request-presigner', () => ({
  getSignedUrl: jest.fn(),
}));

import { S3Client } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { R2StorageService } from './r2-storage.service';

describe('R2StorageService', () => {
  const configValues: Record<string, string> = {
    R2_ACCOUNT_ID: 'account-1',
    R2_ACCESS_KEY_ID: 'access-key',
    R2_SECRET_ACCESS_KEY: 'secret-key',
    R2_BUCKET: 'course-media',
    R2_ENDPOINT: 'https://account-1.r2.cloudflarestorage.com',
  };

  let service: R2StorageService;
  let send: jest.Mock;

  beforeAll(() => {
    send = jest
      .spyOn(S3Client.prototype, 'send')
      .mockResolvedValue({} as never) as unknown as jest.Mock;
  });

  beforeEach(() => {
    jest.clearAllMocks();
    send.mockReset();
    send.mockResolvedValue({} as never);
    (getSignedUrl as jest.Mock).mockResolvedValue(
      'https://signed.example/object?X-Amz-Signature=test',
    );

    service = new R2StorageService({
      get: (key: string) => configValues[key],
    } as any);
  });

  it('uploads a private object and returns its durable key', async () => {
    await expect(
      service.upload(
        {
          buffer: Buffer.from('pdf'),
          originalname: 'lesson.pdf',
          mimetype: 'application/pdf',
          size: 3,
        },
        'materials/material-1/lesson.pdf',
      ),
    ).resolves.toEqual({
      objectKey: 'materials/material-1/lesson.pdf',
      objectName: 'materials/material-1/lesson.pdf',
      storageUri: 'materials/material-1/lesson.pdf',
    });

    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0].input).toEqual(
      expect.objectContaining({
        Bucket: 'course-media',
        Key: 'materials/material-1/lesson.pdf',
        ContentType: 'application/pdf',
        CacheControl: 'private, max-age=0',
      }),
    );
  });

  it('deletes an object key and ignores a legacy GCS reference', async () => {
    await service.delete('questions/question-1/image.png');
    expect(send).toHaveBeenCalledTimes(1);
    expect(send.mock.calls[0][0].input).toEqual({
      Bucket: 'course-media',
      Key: 'questions/question-1/image.png',
    });

    send.mockClear();
    await service.delete('gs://old-bucket/questions/image.png');
    expect(send).not.toHaveBeenCalled();
  });

  it('signs R2 keys but returns old GCS references as unavailable', async () => {
    await expect(
      service.resolveReadUrl('questions/question-1/image.png'),
    ).resolves.toEqual({
      url: 'https://signed.example/object?X-Amz-Signature=test',
      storageUri: 'questions/question-1/image.png',
    });
    expect(getSignedUrl).toHaveBeenCalledTimes(1);

    await expect(
      service.resolveReadUrl(
        'https://storage.googleapis.com/old-bucket/questions/image.png',
      ),
    ).resolves.toEqual({ url: null });
  });

  it('normalizes a signed R2 URL back to its object key', () => {
    expect(
      service.toObjectKey(
        'https://account-1.r2.cloudflarestorage.com/course-media/questions/q/image.png?X-Amz-Signature=test',
      ),
    ).toBe('questions/q/image.png');
    expect(service.toObjectKey('https://example.com/image.png')).toBeNull();
    expect(service.toObjectKey('questions/q/image.png')).toBe('questions/q/image.png');
  });
});
