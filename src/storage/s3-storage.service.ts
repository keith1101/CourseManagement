import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import { Injectable, InternalServerErrorException } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type StorageUploadFile = {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
};

export type UploadedStorageObject = {
  objectName: string;
  s3Uri: string;
};

@Injectable()
export class S3StorageService {
  private readonly s3: S3Client;
  private readonly bucketName: string;
  private readonly endpoint?: string;

  constructor(config: ConfigService) {
    this.bucketName = config.get<string>('NEON_S3_BUCKET_NAME')?.trim() ?? '';
    this.endpoint = config.get<string>('AWS_ENDPOINT_URL_S3')?.trim() || undefined;

    const region = config.get<string>('AWS_REGION')?.trim() || 'us-east-2';
    const accessKeyId = config.get<string>('AWS_ACCESS_KEY_ID')?.trim();
    const secretAccessKey = config
      .get<string>('AWS_SECRET_ACCESS_KEY')
      ?.trim();

    this.s3 = new S3Client({
      forcePathStyle: true,
      endpoint: this.endpoint,
      region,
      ...(accessKeyId && secretAccessKey
        ? { credentials: { accessKeyId, secretAccessKey } }
        : {}),
    });
  }

  async upload(
    file: StorageUploadFile,
    objectName: string,
  ): Promise<UploadedStorageObject> {
    this.ensureConfigured();

    await this.s3.send(
      new PutObjectCommand({
        Bucket: this.bucketName,
        Key: objectName,
        Body: file.buffer,
        ContentType: file.mimetype,
        CacheControl: 'private, max-age=0',
        Metadata: {
          originalFileName: file.originalname,
        },
      }),
    );

    return {
      objectName,
      s3Uri: `s3://${this.bucketName}/${objectName}`,
    };
  }

  async delete(storageUri: string) {
    this.ensureConfigured();

    try {
      await this.s3.send(
        new DeleteObjectCommand({
          Bucket: this.bucketName,
          Key: this.toObjectName(storageUri),
        }),
      );
    } catch (error: unknown) {
      if ((error as { $metadata?: { httpStatusCode?: number } }).$metadata?.httpStatusCode !== 404) {
        throw error;
      }
    }
  }

  async getSignedReadUrl(storageUri: string, expiresInSeconds = 900) {
    this.ensureConfigured();

    return getSignedUrl(
      this.s3,
      new GetObjectCommand({
        Bucket: this.bucketName,
        Key: this.toObjectName(storageUri),
      }),
      { expiresIn: expiresInSeconds },
    );
  }

  private ensureConfigured() {
    if (!this.bucketName) {
      throw new InternalServerErrorException(
        'Neon Object Storage is not configured: NEON_S3_BUCKET_NAME is missing',
      );
    }

    if (!this.endpoint) {
      throw new InternalServerErrorException(
        'Neon Object Storage is not configured: AWS_ENDPOINT_URL_S3 is missing',
      );
    }
  }

  private toObjectName(storageUri: string) {
    const trimmedUri = storageUri.trim();
    const s3Prefix = `s3://${this.bucketName}/`;
    if (trimmedUri.startsWith(s3Prefix)) {
      return trimmedUri.slice(s3Prefix.length);
    }

    const endpointPrefix = `${this.endpoint?.replace(/\/+$/, '')}/${this.bucketName}/`;
    if (trimmedUri.startsWith(endpointPrefix)) {
      return decodeURIComponent(trimmedUri.slice(endpointPrefix.length));
    }

    if (trimmedUri.startsWith('s3://')) {
      throw new InternalServerErrorException(
        'Storage URL does not belong to the configured Neon bucket',
      );
    }

    if (trimmedUri.startsWith('gs://')) {
      throw new InternalServerErrorException(
        'Legacy Google Cloud Storage URL found; migrate the object before downloading it',
      );
    }

    if (trimmedUri.startsWith('http://') || trimmedUri.startsWith('https://')) {
      throw new InternalServerErrorException(
        'Storage URL does not belong to the configured Neon bucket',
      );
    }

    return trimmedUri.replace(/^\/+/, '');
  }
}
