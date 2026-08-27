require('dotenv/config');

const { Storage } = require('@google-cloud/storage');
const {
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} = require('@aws-sdk/client-s3');
const { Client } = require('pg');

const sourceBucketName = required('GCS_BUCKET_NAME');
const targetBucketName =
  process.env.NEON_S3_BUCKET_NAME || 'course-media-bucket';
const storageEndpoint = required('AWS_ENDPOINT_URL_S3');
const storageRegion = process.env.AWS_REGION || 'us-east-2';

const s3 = new S3Client({
  forcePathStyle: true,
  endpoint: storageEndpoint,
  region: storageRegion,
});

const gcs = new Storage();

async function main() {
  const [files] = await gcs.bucket(sourceBucketName).getFiles();
  const sourceObjects = new Map(files.map((file) => [file.name, file]));

  console.log(
    `Found ${sourceObjects.size} GCS object(s) in ${sourceBucketName}; copying to ${targetBucketName}`,
  );

  for (const [objectName, file] of sourceObjects) {
    const [body] = await file.download();
    const metadata = file.metadata || {};
    const customMetadata = metadata.metadata || {};

    await s3.send(
      new PutObjectCommand({
        Bucket: targetBucketName,
        Key: objectName,
        Body: body,
        ContentType: metadata.contentType || undefined,
        CacheControl: metadata.cacheControl || 'private, max-age=0',
        Metadata: Object.fromEntries(
          Object.entries(customMetadata).map(([key, value]) => [
            key.toLowerCase(),
            String(value),
          ]),
        ),
      }),
    );

    const head = await s3.send(
      new HeadObjectCommand({
        Bucket: targetBucketName,
        Key: objectName,
      }),
    );

    if (Number(head.ContentLength) !== body.length) {
      throw new Error(
        `Size verification failed for ${objectName}: expected ${body.length}, got ${head.ContentLength}`,
      );
    }

    console.log(`Copied ${objectName} (${body.length} bytes)`);
  }

  await rewriteMaterialUrls(sourceObjects);
}

async function rewriteMaterialUrls(sourceObjects) {
  const databaseUrl =
    process.env.DATABASE_URL_UNPOOLED || process.env.DATABASE_URL;
  if (!databaseUrl) {
    throw new Error('DATABASE_URL_UNPOOLED or DATABASE_URL is required');
  }

  const db = new Client({ connectionString: databaseUrl });
  await db.connect();

  try {
    await db.query('BEGIN');

    const result = await db.query(
      `SELECT id, "storageUrl"
       FROM "Material"
       WHERE "storageUrl" LIKE $1
          OR "storageUrl" LIKE $2`,
      [
        `gs://${sourceBucketName}/%`,
        `https://storage.googleapis.com/${sourceBucketName}/%`,
      ],
    );

    let updated = 0;
    for (const row of result.rows) {
      const objectName = toObjectName(row.storageUrl);
      if (!sourceObjects.has(objectName)) {
        throw new Error(
          `Material ${row.id} references missing GCS object ${objectName}`,
        );
      }

      const targetUri = `s3://${targetBucketName}/${objectName}`;
      await db.query(
        `UPDATE "Material"
         SET "storageUrl" = $1
         WHERE id = $2 AND "storageUrl" = $3`,
        [targetUri, row.id, row.storageUrl],
      );
      updated += 1;
    }

    await db.query('COMMIT');
    console.log(`Rewrote ${updated} Material storage URL(s)`);
  } catch (error) {
    await db.query('ROLLBACK');
    throw error;
  } finally {
    await db.end();
  }
}

function toObjectName(storageUrl) {
  const gsPrefix = `gs://${sourceBucketName}/`;
  if (storageUrl.startsWith(gsPrefix)) {
    return storageUrl.slice(gsPrefix.length);
  }

  const httpsPrefix = `https://storage.googleapis.com/${sourceBucketName}/`;
  if (storageUrl.startsWith(httpsPrefix)) {
    return decodeURIComponent(storageUrl.slice(httpsPrefix.length));
  }

  throw new Error(`Unsupported GCS URL: ${storageUrl}`);
}

function required(name) {
  const value = process.env[name]?.trim();
  if (!value) {
    throw new Error(`${name} is required`);
  }
  return value;
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
