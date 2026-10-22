import {
  DeleteObjectCommand,
  GetObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";
import { Upload } from "@aws-sdk/lib-storage";
import { createReadStream } from "node:fs";
import { stat } from "node:fs/promises";
import { Readable } from "node:stream";
import { env } from "../config/env.js";
import { AppError, NotFoundError } from "../utils/errors.js";
import type { OpenStorageResult, StorageAdapter, StoragePutInput, StorageResult } from "./adapter.js";

// Stored URL format: "s3:<key>". The bucket, endpoint and credentials come only from the environment, so the
// same rows keep working when the endpoint changes (Filebase today, MinIO or a local disk bucket later).
const PREFIX = "s3:";
const KEY_PREFIX = "easyconstruct/";

export const isS3Url = (value: string): boolean => value.startsWith(PREFIX);

/** Same filename cleaning as the Vercel Blob adapter. */
export const s3KeyFor = (filename: string, now: number = Date.now()): string =>
  `${KEY_PREFIX}${now}-${filename.replace(/[^a-zA-Z0-9.\-_]/g, "-")}`;

/**
 * The object key behind an s3: url. Only keys this app writes (under easyconstruct/, no path tricks) are
 * accepted, because the url arrives from the client on GET /uploads/file.
 */
export const keyFromS3Url = (url: string): string => {
  const key = url.slice(PREFIX.length);
  if (!key.startsWith(KEY_PREFIX) || key.includes("..") || key.includes("\\") || key.includes("\0")) {
    throw new NotFoundError("File");
  }
  return key;
};

const unavailable = (action: string, error: unknown) => {
  console.error(`[uploads] S3 ${action} failed.`, error instanceof Error ? error.message : error);
  return new AppError(502, "STORAGE_UNAVAILABLE", "File storage is unavailable right now. Please try again.");
};

let client: S3Client | undefined;
const getClient = (): S3Client => {
  client ??= new S3Client({
    endpoint: env.S3_ENDPOINT,
    region: env.S3_REGION,
    forcePathStyle: true,
    credentials: { accessKeyId: env.S3_ACCESS_KEY_ID ?? "", secretAccessKey: env.S3_SECRET_ACCESS_KEY ?? "" },
  });
  return client;
};

export interface S3FileStorage extends StorageAdapter {
  /** Streams a file on disk to the bucket (multipart for large files); nothing is held in memory. */
  putFile(absolutePath: string, filename: string, contentType: string): Promise<StorageResult>;
}

export const s3Adapter: S3FileStorage = {
  async put(input: StoragePutInput): Promise<StorageResult> {
    const key = s3KeyFor(input.filename);
    try {
      await getClient().send(
        new PutObjectCommand({ Bucket: env.S3_BUCKET, Key: key, Body: input.buffer, ContentType: input.contentType }),
      );
    } catch (error) {
      throw unavailable("put", error);
    }
    return { url: `${PREFIX}${key}`, filename: input.filename, contentType: input.contentType, sizeBytes: input.buffer.byteLength };
  },

  async putFile(absolutePath: string, filename: string, contentType: string): Promise<StorageResult> {
    const key = s3KeyFor(filename);
    const body = createReadStream(absolutePath);
    try {
      const { size } = await stat(absolutePath);
      await new Upload({
        client: getClient(),
        params: { Bucket: env.S3_BUCKET, Key: key, Body: body, ContentType: contentType },
      }).done();
      return { url: `${PREFIX}${key}`, filename, contentType, sizeBytes: size };
    } catch (error) {
      body.destroy();
      throw unavailable("upload", error);
    }
  },

  async open(url: string): Promise<OpenStorageResult> {
    const key = keyFromS3Url(url);
    let result;
    try {
      result = await getClient().send(new GetObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
    } catch (error) {
      const name = (error as { name?: string }).name;
      if (name === "NoSuchKey" || name === "NotFound") throw new NotFoundError("File");
      throw unavailable("get", error);
    }
    if (!(result.Body instanceof Readable)) throw new NotFoundError("File");
    return {
      stream: result.Body,
      contentType: result.ContentType ?? "application/octet-stream",
      sizeBytes: result.ContentLength,
    };
  },

  async delete(url: string): Promise<void> {
    const key = keyFromS3Url(url);
    try {
      await getClient().send(new DeleteObjectCommand({ Bucket: env.S3_BUCKET, Key: key }));
    } catch (error) {
      throw unavailable("delete", error);
    }
  },

  // The interface is synchronous, so (like the Blob adapter) existence is assumed; open() reports a missing object.
  exists(): boolean {
    return true;
  },
};
