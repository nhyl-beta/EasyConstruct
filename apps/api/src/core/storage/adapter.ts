import type { Readable } from "node:stream";

export interface StoragePutInput {
  buffer: Buffer;
  filename: string;
  contentType: string;
}

export interface StorageResult {
  url: string;
  filename: string;
  contentType: string;
  sizeBytes: number;
}

export interface OpenStorageResult {
  stream: NodeJS.ReadableStream;
  contentType: string;
  sizeBytes?: number;
}

export interface StorageAdapter {
  put(input: StoragePutInput): Promise<StorageResult>;
  open(url: string): Promise<OpenStorageResult>;
  delete(url: string): Promise<void>;
  exists(url: string): boolean;
}

export type StorageStream = Readable;
