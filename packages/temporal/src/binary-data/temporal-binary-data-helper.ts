/**
 * Temporal Binary Data Helper
 *
 * Provides binary data storage operations for the Temporal worker.
 * Supports both S3 and filesystem modes for storing/retrieving binary data.
 *
 * This is a standalone implementation that doesn't rely on n8n-core's
 * DI-based BinaryDataService. It provides the essential operations needed
 * for workflow execution with binary data.
 */

import type { PutObjectCommandInput, S3ClientConfig } from '@aws-sdk/client-s3';
import {
	S3Client,
	PutObjectCommand,
	GetObjectCommand,
	HeadBucketCommand,
	DeleteObjectCommand,
	HeadObjectCommand,
} from '@aws-sdk/client-s3';
import { createHash } from 'node:crypto';
import { mkdir, readFile, writeFile, unlink, stat } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import type { Readable } from 'node:stream';
import { v4 as uuid } from 'uuid';

import type { BinaryDataConfig } from '../config/types';

/**
 * Metadata associated with binary data
 */
export interface BinaryDataMetadata {
	fileName?: string;
	mimeType?: string;
	fileSize: number;
}

/**
 * Pre-write metadata (before file size is known)
 */
export interface BinaryDataPreWriteMetadata {
	fileName?: string;
	mimeType?: string;
}

/**
 * Result of a store operation
 */
export interface BinaryDataWriteResult {
	/** The generated file ID (format: mode:path) */
	binaryDataId: string;
	/** Size of the stored file in bytes */
	fileSize: number;
}

/**
 * File location for binary data
 */
export interface BinaryDataFileLocation {
	workflowId: string;
	executionId: string;
}

/**
 * Convert a stream to a buffer
 */
async function streamToBuffer(stream: Readable): Promise<Buffer> {
	const chunks: Uint8Array[] = [];
	for await (const chunk of stream) {
		chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk as string));
	}
	return Buffer.concat(chunks);
}

/**
 * Temporal Binary Data Helper
 *
 * Standalone binary data service for the Temporal worker that supports
 * both S3 and filesystem storage modes.
 */
export class TemporalBinaryDataHelper {
	private mode: 'filesystem' | 's3';
	private s3Client?: S3Client;
	private s3Bucket?: string;
	private filesystemBasePath?: string;
	private isInitialized = false;

	constructor(private readonly config: BinaryDataConfig) {
		this.mode = config.mode;
	}

	/**
	 * Initialize the binary data helper
	 */
	async init(): Promise<void> {
		if (this.isInitialized) {
			return;
		}

		if (this.mode === 's3') {
			await this.initS3();
		} else {
			await this.initFilesystem();
		}

		this.isInitialized = true;
	}

	/**
	 * Initialize S3 client and verify bucket access
	 */
	private async initS3(): Promise<void> {
		const s3Config = this.config.s3;
		if (!s3Config) {
			throw new Error('S3 configuration required when mode is "s3"');
		}

		if (!s3Config.bucket) {
			throw new Error('S3 bucket name is required');
		}

		// Build S3 client config
		const clientConfig: S3ClientConfig = {};

		// Set endpoint for S3-compatible services (MinIO, etc.)
		if (s3Config.host) {
			const protocol = s3Config.protocol ?? 'https';
			clientConfig.endpoint = `${protocol}://${s3Config.host}`;
			clientConfig.forcePathStyle = true;
		}

		// Set region
		if (s3Config.region) {
			clientConfig.region = s3Config.region;
		}

		// Set credentials (unless using auto-detect for IAM roles)
		if (!s3Config.authAutoDetect && s3Config.accessKeyId && s3Config.secretAccessKey) {
			clientConfig.credentials = {
				accessKeyId: s3Config.accessKeyId,
				secretAccessKey: s3Config.secretAccessKey,
			};
		}

		this.s3Client = new S3Client(clientConfig);
		this.s3Bucket = s3Config.bucket;

		// Verify bucket access
		try {
			// eslint-disable-next-line @typescript-eslint/naming-convention
			const command = new HeadBucketCommand({ Bucket: this.s3Bucket });
			await this.s3Client.send(command);
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			throw new Error(`Failed to connect to S3 bucket "${this.s3Bucket}": ${errorMessage}`);
		}
	}

	/**
	 * Initialize filesystem storage
	 */
	private async initFilesystem(): Promise<void> {
		const fsConfig = this.config.filesystem;
		this.filesystemBasePath = fsConfig?.basePath ?? './binary-data';

		// Ensure base directory exists
		await mkdir(this.filesystemBasePath, { recursive: true });
	}

	/**
	 * Store binary data
	 *
	 * @param location - File location info (workflowId, executionId)
	 * @param data - Buffer or stream to store
	 * @param metadata - Optional metadata (fileName, mimeType)
	 * @returns Write result with binary data ID and file size
	 */
	async store(
		location: BinaryDataFileLocation,
		data: Buffer | Readable,
		metadata?: BinaryDataPreWriteMetadata,
	): Promise<BinaryDataWriteResult> {
		this.ensureInitialized();

		const buffer = Buffer.isBuffer(data) ? data : await streamToBuffer(data);
		const fileId = this.generateFileId(location);

		if (this.mode === 's3') {
			await this.storeInS3(fileId, buffer, metadata);
		} else {
			await this.storeInFilesystem(fileId, buffer);
		}

		const binaryDataId = this.createBinaryDataId(fileId);

		return {
			binaryDataId,
			fileSize: buffer.length,
		};
	}

	/**
	 * Get binary data as a buffer
	 *
	 * @param binaryDataId - The binary data ID (format: mode:path)
	 * @returns Buffer containing the binary data
	 */
	async getAsBuffer(binaryDataId: string): Promise<Buffer> {
		this.ensureInitialized();

		const [mode, fileId] = this.parseBinaryDataId(binaryDataId);

		if (mode === 's3') {
			return await this.getFromS3AsBuffer(fileId);
		} else {
			return await this.getFromFilesystemAsBuffer(fileId);
		}
	}

	/**
	 * Get metadata for binary data
	 *
	 * @param binaryDataId - The binary data ID (format: mode:path)
	 * @returns Metadata about the binary data
	 */
	async getMetadata(binaryDataId: string): Promise<BinaryDataMetadata> {
		this.ensureInitialized();

		const [mode, fileId] = this.parseBinaryDataId(binaryDataId);

		if (mode === 's3') {
			return await this.getMetadataFromS3(fileId);
		} else {
			return await this.getMetadataFromFilesystem(fileId);
		}
	}

	/**
	 * Delete binary data
	 *
	 * @param binaryDataId - The binary data ID (format: mode:path)
	 */
	async delete(binaryDataId: string): Promise<void> {
		this.ensureInitialized();

		const [mode, fileId] = this.parseBinaryDataId(binaryDataId);

		if (mode === 's3') {
			await this.deleteFromS3(fileId);
		} else {
			await this.deleteFromFilesystem(fileId);
		}
	}

	/**
	 * Get the current storage mode
	 */
	getMode(): 'filesystem' | 's3' {
		return this.mode;
	}

	/**
	 * Check if the helper is initialized
	 */
	isReady(): boolean {
		return this.isInitialized;
	}

	// ========== Private Methods ==========

	private ensureInitialized(): void {
		if (!this.isInitialized) {
			throw new Error('TemporalBinaryDataHelper not initialized. Call init() first.');
		}
	}

	private generateFileId(location: BinaryDataFileLocation): string {
		const uniqueId = uuid();
		return `workflows/${location.workflowId}/executions/${location.executionId}/binary_data/${uniqueId}`;
	}

	private createBinaryDataId(fileId: string): string {
		const modePrefix = this.mode === 's3' ? 's3' : 'filesystem-v2';
		return `${modePrefix}:${fileId}`;
	}

	private parseBinaryDataId(binaryDataId: string): [string, string] {
		const colonIndex = binaryDataId.indexOf(':');
		if (colonIndex === -1) {
			throw new Error(`Invalid binary data ID format: ${binaryDataId}`);
		}
		const mode = binaryDataId.substring(0, colonIndex);
		const fileId = binaryDataId.substring(colonIndex + 1);
		return [mode, fileId];
	}

	// ========== S3 Operations ==========

	private async storeInS3(
		fileId: string,
		buffer: Buffer,
		metadata?: BinaryDataPreWriteMetadata,
	): Promise<void> {
		if (!this.s3Client || !this.s3Bucket) {
			throw new Error('S3 client not initialized');
		}

		// AWS SDK requires PascalCase property names
		/* eslint-disable @typescript-eslint/naming-convention */
		const params: PutObjectCommandInput = {
			Bucket: this.s3Bucket,
			Key: fileId,
			Body: buffer,
			ContentLength: buffer.length,
			ContentMD5: createHash('md5').update(buffer).digest('base64'),
		};
		/* eslint-enable @typescript-eslint/naming-convention */

		if (metadata?.fileName) {
			params.Metadata = { filename: encodeURIComponent(metadata.fileName) };
		}

		if (metadata?.mimeType) {
			params.ContentType = metadata.mimeType;
		}

		const command = new PutObjectCommand(params);
		await this.s3Client.send(command);
	}

	private async getFromS3AsBuffer(fileId: string): Promise<Buffer> {
		if (!this.s3Client || !this.s3Bucket) {
			throw new Error('S3 client not initialized');
		}

		// eslint-disable-next-line @typescript-eslint/naming-convention
		const command = new GetObjectCommand({ Bucket: this.s3Bucket, Key: fileId });

		const response = await this.s3Client.send(command);

		if (!response.Body) {
			throw new Error(`Empty response body for S3 object: ${fileId}`);
		}

		// Body is a Readable stream in Node.js
		return await streamToBuffer(response.Body as Readable);
	}

	private async getMetadataFromS3(fileId: string): Promise<BinaryDataMetadata> {
		if (!this.s3Client || !this.s3Bucket) {
			throw new Error('S3 client not initialized');
		}

		// eslint-disable-next-line @typescript-eslint/naming-convention
		const command = new HeadObjectCommand({ Bucket: this.s3Bucket, Key: fileId });

		const response = await this.s3Client.send(command);

		const metadata: BinaryDataMetadata = {
			fileSize: response.ContentLength ?? 0,
		};

		if (response.ContentType) {
			metadata.mimeType = response.ContentType;
		}

		if (response.Metadata?.filename) {
			metadata.fileName = decodeURIComponent(response.Metadata.filename);
		}

		return metadata;
	}

	private async deleteFromS3(fileId: string): Promise<void> {
		if (!this.s3Client || !this.s3Bucket) {
			throw new Error('S3 client not initialized');
		}

		// eslint-disable-next-line @typescript-eslint/naming-convention
		const command = new DeleteObjectCommand({ Bucket: this.s3Bucket, Key: fileId });

		await this.s3Client.send(command);
	}

	// ========== Filesystem Operations ==========

	private getFilesystemPath(fileId: string): string {
		if (!this.filesystemBasePath) {
			throw new Error('Filesystem base path not initialized');
		}
		return join(this.filesystemBasePath, fileId);
	}

	private async storeInFilesystem(fileId: string, buffer: Buffer): Promise<void> {
		const filePath = this.getFilesystemPath(fileId);

		// Ensure directory exists
		await mkdir(dirname(filePath), { recursive: true });

		await writeFile(filePath, buffer);
	}

	private async getFromFilesystemAsBuffer(fileId: string): Promise<Buffer> {
		const filePath = this.getFilesystemPath(fileId);
		return await readFile(filePath);
	}

	private async getMetadataFromFilesystem(fileId: string): Promise<BinaryDataMetadata> {
		const filePath = this.getFilesystemPath(fileId);
		const stats = await stat(filePath);

		return {
			fileSize: stats.size,
		};
	}

	private async deleteFromFilesystem(fileId: string): Promise<void> {
		const filePath = this.getFilesystemPath(fileId);
		await unlink(filePath);
	}
}

/**
 * Initialize binary data helper from configuration
 *
 * @param config - Binary data configuration
 * @returns Initialized helper and cleanup function
 */
export async function initializeBinaryDataHelper(config: BinaryDataConfig): Promise<{
	helper: TemporalBinaryDataHelper;
	cleanup: () => Promise<void>;
}> {
	const helper = new TemporalBinaryDataHelper(config);
	await helper.init();

	return {
		helper,
		cleanup: async () => {
			// S3 and filesystem don't need explicit cleanup
			// This is a placeholder for any future cleanup needs
		},
	};
}
