/**
 * The shape used by Nest's memory based Multer interceptor.  Keeping this
 * type in the storage package means controllers do not depend on a concrete
 * provider (GCS, R2, or a future provider).
 */
export type StorageUploadFile = {
  buffer: Buffer;
  originalname: string;
  mimetype: string;
  size: number;
};

export type UploadedStorageObject = {
  /** Canonical value persisted in the database. */
  objectKey: string;
  /** Backwards-compatible alias for callers that used the old name. */
  objectName: string;
  /** Canonical storage reference; for R2 this is the object key, not a URL. */
  storageUri: string;
};
