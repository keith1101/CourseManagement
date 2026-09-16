import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';
import {
  Injectable,
  InternalServerErrorException,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import {
  StorageUploadFile,
  UploadedStorageObject,
} from './storage.types';

export { StorageUploadFile, UploadedStorageObject } from './storage.types';

type ResolvedStorageReference = {
  url: string | null;
  /** The key only when the value is managed by this R2 bucket. */
  storageUri?: string;
};

/**
 * Private Cloudflare R2 adapter.
 *
 * Database columns retain their existing names (storageUrl/imageUrl) for API
 * compatibility, but new values are object keys.  Read URLs are generated at
 * the API boundary and are never persisted.
 */
@Injectable()
export class R2StorageService {
  private readonly logger = new Logger(R2StorageService.name);
  private readonly client: S3Client;
  private readonly bucketName: string;
  private readonly endpoint: string;
  private readonly endpointOrigin: string | null;
  private readonly defaultExpiresInSeconds: number;

  constructor(private readonly config: ConfigService) {
    this.bucketName = (
      config.get<string>('R2_BUCKET') ?? config.get<string>('R2_BUCKET_NAME')
    )?.trim() ?? '';

    const accountId = config.get<string>('R2_ACCOUNT_ID')?.trim();
    this.endpoint =
      config.get<string>('R2_ENDPOINT')?.trim() ||
      (accountId ? `https://${accountId}.r2.cloudflarestorage.com` : '');

    try {
      this.endpointOrigin = this.endpoint
        ? new URL(this.endpoint).origin
        : null;
    } catch {
      this.endpointOrigin = null;
    }

    const expires = Number(config.get<string>('R2_SIGNED_URL_TTL_SECONDS'));
    this.defaultExpiresInSeconds = Number.isFinite(expires) && expires > 0
      ? Math.min(Math.floor(expires), 7 * 24 * 60 * 60)
      : 15 * 60;

    const accessKeyId = config.get<string>('R2_ACCESS_KEY_ID')?.trim();
    const secretAccessKey = config.get<string>('R2_SECRET_ACCESS_KEY')?.trim();
    this.client = new S3Client({
      region: 'auto',
      endpoint: this.endpoint || undefined,
      forcePathStyle: false,
      credentials:
        accessKeyId && secretAccessKey
          ? { accessKeyId, secretAccessKey }
          : undefined,
    });
  }

  async upload(
    file: StorageUploadFile,
    objectKey: string,
  ): Promise<UploadedStorageObject> {
    const key = this.requireObjectKey(objectKey);
    this.assertConfigured();

    try {
      await this.client.send(
        new PutObjectCommand({
          Bucket: this.bucketName,
          Key: key,
          Body: file.buffer,
          ContentLength: file.size,
          ContentType: file.mimetype || 'application/octet-stream',
          CacheControl: 'private, max-age=0',
          Metadata: file.originalname
            ? { originalfilename: file.originalname }
            : undefined,
        }),
      );

      return {
        objectKey: key,
        objectName: key,
        storageUri: key,
      };
    } catch (error) {
      this.logStorageFailure('upload', {
        objectKey: key,
        mimetype: file.mimetype,
        size: file.size,
      }, error);
      throw new InternalServerErrorException(
        'Unable to upload file to object storage',
      );
    }
  }

  async delete(storageReference: string | null | undefined): Promise<void> {
    const key = this.toObjectKey(storageReference);
    if (!key) return;
    this.assertConfigured();

    try {
      await this.client.send(
        new DeleteObjectCommand({ Bucket: this.bucketName, Key: key }),
      );
    } catch (error: unknown) {
      const status = (error as { $metadata?: { httpStatusCode?: number } })
        .$metadata?.httpStatusCode;
      const code = (error as { name?: string; Code?: string }).name ??
        (error as { Code?: string }).Code;
      if (status === 404 || code === 'NoSuchKey' || code === 'NotFound') return;

      this.logStorageFailure('delete', { objectKey: key }, error);
      throw new InternalServerErrorException(
        'Unable to delete file from object storage',
      );
    }
  }

  async getSignedReadUrl(
    storageReference: string,
    expiresInSeconds = this.defaultExpiresInSeconds,
  ): Promise<string> {
    const key = this.toObjectKey(storageReference);
    if (!key) {
      throw new NotFoundException('Object is not available in R2 storage');
    }
    this.assertConfigured();

    try {
      return await getSignedUrl(
        this.client,
        new GetObjectCommand({
          Bucket: this.bucketName,
          Key: key,
        }),
        {
          expiresIn: Math.max(1, Math.min(Math.floor(expiresInSeconds), 7 * 24 * 60 * 60)),
        },
      );
    } catch (error) {
      this.logStorageFailure('getSignedReadUrl', {
        objectKey: key,
        expiresInSeconds,
      }, error);
      throw new InternalServerErrorException(
        'Unable to generate a file access URL',
      );
    }
  }

  /**
   * Resolve a stored reference for API responses.  Old GCS references are
   * deliberately returned as null because the application no longer has GCS
   * credentials and old objects are not migrated.
   */
  async resolveReadUrl(
    storageReference: string | null | undefined,
    expiresInSeconds = this.defaultExpiresInSeconds,
  ): Promise<ResolvedStorageReference> {
    if (!storageReference) {
      return { url: storageReference ?? null };
    }

    const key = this.toObjectKey(storageReference);
    if (key) {
      return {
        url: await this.getSignedReadUrl(key, expiresInSeconds),
        storageUri: key,
      };
    }

    if (this.isLegacyGcsReference(storageReference)) {
      return { url: null };
    }

    // Keep explicitly external URLs working for legacy/admin-created records.
    // New upload paths never persist these values.
    if (/^https?:\/\//i.test(storageReference)) {
      return { url: storageReference };
    }

    return { url: null };
  }

  /** Return the canonical key for an R2 value, or null for external/legacy values. */
  toObjectKey(storageReference: string | null | undefined): string | null {
    const value = storageReference?.trim();
    if (!value || this.isLegacyGcsReference(value)) return null;

    if (/^https?:\/\//i.test(value)) {
      try {
        const url = new URL(value);
        const endpointHost = this.endpoint
          ? new URL(this.endpoint).hostname
          : null;
        const sameEndpoint = Boolean(
          this.endpointOrigin && url.origin === this.endpointOrigin,
        );
        const virtualHostEndpoint = Boolean(
          endpointHost && url.hostname === `${this.bucketName}.${endpointHost}`,
        );
        if (!sameEndpoint && !virtualHostEndpoint) {
          return null;
        }

        let path = decodeURIComponent(url.pathname).replace(/^\/+/, '');
        const bucketPrefix = `${this.bucketName}/`;
        if (path.startsWith(bucketPrefix)) path = path.slice(bucketPrefix.length);
        return this.isValidObjectKey(path) ? path : null;
      } catch {
        return null;
      }
    }

    if (value.includes('://')) return null;
    const key = value.replace(/^\/+/, '');
    return this.isValidObjectKey(key) ? key : null;
  }

  isManagedObjectKey(storageReference: string | null | undefined): boolean {
    const key = this.toObjectKey(storageReference);
    // Application-owned objects are always namespaced (materials/... or
    // questions/...). This also prevents an arbitrary user-supplied string
    // from being mistaken for a managed object during DTO validation.
    return Boolean(key && key.includes('/'));
  }

  isLegacyGcsReference(storageReference: string): boolean {
    return (
      storageReference.startsWith('gs://') ||
      /^https?:\/\/(?:storage\.googleapis\.com|storage\.cloud\.google\.com)\//i.test(
        storageReference,
      )
    );
  }

  private requireObjectKey(value: string) {
    const key = this.toObjectKey(value);
    if (!key) {
      throw new InternalServerErrorException('Invalid R2 object key');
    }
    return key;
  }

  private isValidObjectKey(value: string) {
    return value.length > 0 && value.length <= 1024 && !value.includes('\\');
  }

  private assertConfigured() {
    if (!this.bucketName || !this.endpoint) {
      throw new InternalServerErrorException(
        'R2 storage is not configured: R2_BUCKET and R2_ENDPOINT (or R2_ACCOUNT_ID) are required',
      );
    }

    const accessKeyId = this.config.get<string>('R2_ACCESS_KEY_ID')?.trim();
    const secretAccessKey = this.config.get<string>('R2_SECRET_ACCESS_KEY')?.trim();
    if (!accessKeyId || !secretAccessKey) {
      throw new InternalServerErrorException(
        'R2 storage is not configured: R2_ACCESS_KEY_ID and R2_SECRET_ACCESS_KEY are required',
      );
    }
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
          status: (error as Error & { $metadata?: { httpStatusCode?: number } })
            .$metadata?.httpStatusCode,
        }
      : {
          name: 'UnknownError',
          message: 'Non-Error value rejected the object storage operation',
        };

    this.logger.error(JSON.stringify({ operation, ...context, error: errorDetails }));
  }
}
