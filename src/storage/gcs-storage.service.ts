import { Storage } from '@google-cloud/storage';
import {
  Injectable,
  InternalServerErrorException,
  Logger,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';

export type StorageUploadFile = {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
};

export type UploadedStorageObject = {
  objectName: string;
  gsUri: string;
};

@Injectable()
export class GcsStorageService {
  private readonly logger = new Logger(GcsStorageService.name);
  private readonly storage: Storage;
  private readonly bucketName: string;

  constructor(config: ConfigService) {
    this.bucketName = config.get<string>('GCS_BUCKET_NAME')?.trim() ?? '';
    const projectId = config.get<string>('GCP_PROJECT_ID')?.trim();
    this.storage = projectId ? new Storage({ projectId }) : new Storage();
  }

  async upload(
    file: StorageUploadFile,
    objectName: string,
  ): Promise<UploadedStorageObject> {
    try {
      const object = this.getBucket().file(objectName);

      await object.save(file.buffer, {
        resumable: false,
        metadata: {
          contentType: file.mimetype,
          cacheControl: 'private, max-age=0',
          metadata: {
            originalFileName: file.originalname,
          },
        },
      });

      return {
        objectName,
        gsUri: `gs://${this.bucketName}/${objectName}`,
      };
    } catch (error) {
      this.logStorageFailure('upload', {
        objectName,
        mimetype: file.mimetype,
        size: file.size,
      }, error);

      if (error instanceof InternalServerErrorException) {
        throw error;
      }

      throw new InternalServerErrorException(
        'Unable to upload file to Cloud Storage',
      );
    }
  }

  async delete(storageUri: string) {
    try {
      await this.getBucket().file(this.toObjectName(storageUri)).delete();
    } catch (error: unknown) {
      if ((error as { code?: number }).code !== 404) {
        throw error;
      }
    }
  }

  async getSignedReadUrl(storageUri: string, expiresInSeconds = 900) {
    try {
      const expiresAt = Date.now() + expiresInSeconds * 1000;
      const [url] = await this.getBucket()
        .file(this.toObjectName(storageUri))
        .getSignedUrl({
          version: 'v4',
          action: 'read',
          expires: expiresAt,
        });

      return url;
    } catch (error) {
      this.logStorageFailure(
        'getSignedReadUrl',
        { storageUri, expiresInSeconds },
        error,
      );

      if (error instanceof InternalServerErrorException) {
        throw error;
      }

      throw new InternalServerErrorException(
        'Unable to generate a file access URL',
      );
    }
  }

  async resolveReadUrl(storageUri: string | null | undefined) {
    if (!storageUri) {
      return { url: storageUri ?? null, storageUri: undefined };
    }

    if (!storageUri.startsWith('gs://')) {
      return { url: storageUri, storageUri: undefined };
    }

    return {
      url: await this.getSignedReadUrl(storageUri),
      storageUri,
    };
  }

  private getBucket() {
    if (!this.bucketName) {
      throw new InternalServerErrorException(
        'Cloud Storage is not configured: GCS_BUCKET_NAME is missing',
      );
    }

    return this.storage.bucket(this.bucketName);
  }

  private toObjectName(storageUri: string) {
    const gsPrefix = `gs://${this.bucketName}/`;
    if (storageUri.startsWith(gsPrefix)) {
      return storageUri.slice(gsPrefix.length);
    }

    const publicPrefix = `https://storage.googleapis.com/${this.bucketName}/`;
    if (storageUri.startsWith(publicPrefix)) {
      return decodeURIComponent(storageUri.slice(publicPrefix.length));
    }

    if (storageUri.startsWith('gs://') || storageUri.startsWith('https://')) {
      throw new InternalServerErrorException(
        'Storage URL does not belong to the configured bucket',
      );
    }

    return storageUri.replace(/^\/+/, '');
  }

  private logStorageFailure(
    operation: string,
    context: Record<string, string | number>,
    error: unknown,
  ) {
    const errorDetails = error instanceof Error
      ? {
          name: error.name,
          message: error.message,
          code: (error as Error & { code?: string | number }).code,
          status: (error as Error & { response?: { status?: number } }).response
            ?.status,
        }
      : {
          name: 'UnknownError',
          message: 'Non-Error value rejected the Cloud Storage operation',
        };

    this.logger.error(
      JSON.stringify({
        operation,
        ...context,
        error: errorDetails,
      }),
    );
  }
}
