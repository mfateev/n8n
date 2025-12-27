'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.TemporalBinaryDataHelper = void 0;
exports.initializeBinaryDataHelper = initializeBinaryDataHelper;
const client_s3_1 = require('@aws-sdk/client-s3');
const node_crypto_1 = require('node:crypto');
const promises_1 = require('node:fs/promises');
const node_path_1 = require('node:path');
const uuid_1 = require('uuid');
async function streamToBuffer(stream) {
	const chunks = [];
	for await (const chunk of stream) {
		chunks.push(Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk));
	}
	return Buffer.concat(chunks);
}
class TemporalBinaryDataHelper {
	constructor(config) {
		this.config = config;
		this.isInitialized = false;
		this.mode = config.mode;
	}
	async init() {
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
	async initS3() {
		const s3Config = this.config.s3;
		if (!s3Config) {
			throw new Error('S3 configuration required when mode is "s3"');
		}
		if (!s3Config.bucket) {
			throw new Error('S3 bucket name is required');
		}
		const clientConfig = {};
		if (s3Config.host) {
			const protocol = s3Config.protocol ?? 'https';
			clientConfig.endpoint = `${protocol}://${s3Config.host}`;
			clientConfig.forcePathStyle = true;
		}
		if (s3Config.region) {
			clientConfig.region = s3Config.region;
		}
		if (!s3Config.authAutoDetect && s3Config.accessKeyId && s3Config.secretAccessKey) {
			clientConfig.credentials = {
				accessKeyId: s3Config.accessKeyId,
				secretAccessKey: s3Config.secretAccessKey,
			};
		}
		this.s3Client = new client_s3_1.S3Client(clientConfig);
		this.s3Bucket = s3Config.bucket;
		try {
			const command = new client_s3_1.HeadBucketCommand({ Bucket: this.s3Bucket });
			await this.s3Client.send(command);
		} catch (error) {
			const errorMessage = error instanceof Error ? error.message : String(error);
			throw new Error(`Failed to connect to S3 bucket "${this.s3Bucket}": ${errorMessage}`);
		}
	}
	async initFilesystem() {
		const fsConfig = this.config.filesystem;
		this.filesystemBasePath = fsConfig?.basePath ?? './binary-data';
		await (0, promises_1.mkdir)(this.filesystemBasePath, { recursive: true });
	}
	async store(location, data, metadata) {
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
	async getAsBuffer(binaryDataId) {
		this.ensureInitialized();
		const [mode, fileId] = this.parseBinaryDataId(binaryDataId);
		if (mode === 's3') {
			return await this.getFromS3AsBuffer(fileId);
		} else {
			return await this.getFromFilesystemAsBuffer(fileId);
		}
	}
	async getMetadata(binaryDataId) {
		this.ensureInitialized();
		const [mode, fileId] = this.parseBinaryDataId(binaryDataId);
		if (mode === 's3') {
			return await this.getMetadataFromS3(fileId);
		} else {
			return await this.getMetadataFromFilesystem(fileId);
		}
	}
	async delete(binaryDataId) {
		this.ensureInitialized();
		const [mode, fileId] = this.parseBinaryDataId(binaryDataId);
		if (mode === 's3') {
			await this.deleteFromS3(fileId);
		} else {
			await this.deleteFromFilesystem(fileId);
		}
	}
	getMode() {
		return this.mode;
	}
	isReady() {
		return this.isInitialized;
	}
	ensureInitialized() {
		if (!this.isInitialized) {
			throw new Error('TemporalBinaryDataHelper not initialized. Call init() first.');
		}
	}
	generateFileId(location) {
		const uniqueId = (0, uuid_1.v4)();
		return `workflows/${location.workflowId}/executions/${location.executionId}/binary_data/${uniqueId}`;
	}
	createBinaryDataId(fileId) {
		const modePrefix = this.mode === 's3' ? 's3' : 'filesystem-v2';
		return `${modePrefix}:${fileId}`;
	}
	parseBinaryDataId(binaryDataId) {
		const colonIndex = binaryDataId.indexOf(':');
		if (colonIndex === -1) {
			throw new Error(`Invalid binary data ID format: ${binaryDataId}`);
		}
		const mode = binaryDataId.substring(0, colonIndex);
		const fileId = binaryDataId.substring(colonIndex + 1);
		return [mode, fileId];
	}
	async storeInS3(fileId, buffer, metadata) {
		if (!this.s3Client || !this.s3Bucket) {
			throw new Error('S3 client not initialized');
		}
		const params = {
			Bucket: this.s3Bucket,
			Key: fileId,
			Body: buffer,
			ContentLength: buffer.length,
			ContentMD5: (0, node_crypto_1.createHash)('md5').update(buffer).digest('base64'),
		};
		if (metadata?.fileName) {
			params.Metadata = { filename: encodeURIComponent(metadata.fileName) };
		}
		if (metadata?.mimeType) {
			params.ContentType = metadata.mimeType;
		}
		const command = new client_s3_1.PutObjectCommand(params);
		await this.s3Client.send(command);
	}
	async getFromS3AsBuffer(fileId) {
		if (!this.s3Client || !this.s3Bucket) {
			throw new Error('S3 client not initialized');
		}
		const command = new client_s3_1.GetObjectCommand({ Bucket: this.s3Bucket, Key: fileId });
		const response = await this.s3Client.send(command);
		if (!response.Body) {
			throw new Error(`Empty response body for S3 object: ${fileId}`);
		}
		return await streamToBuffer(response.Body);
	}
	async getMetadataFromS3(fileId) {
		if (!this.s3Client || !this.s3Bucket) {
			throw new Error('S3 client not initialized');
		}
		const command = new client_s3_1.HeadObjectCommand({ Bucket: this.s3Bucket, Key: fileId });
		const response = await this.s3Client.send(command);
		const metadata = {
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
	async deleteFromS3(fileId) {
		if (!this.s3Client || !this.s3Bucket) {
			throw new Error('S3 client not initialized');
		}
		const command = new client_s3_1.DeleteObjectCommand({ Bucket: this.s3Bucket, Key: fileId });
		await this.s3Client.send(command);
	}
	getFilesystemPath(fileId) {
		if (!this.filesystemBasePath) {
			throw new Error('Filesystem base path not initialized');
		}
		return (0, node_path_1.join)(this.filesystemBasePath, fileId);
	}
	async storeInFilesystem(fileId, buffer) {
		const filePath = this.getFilesystemPath(fileId);
		await (0, promises_1.mkdir)((0, node_path_1.dirname)(filePath), { recursive: true });
		await (0, promises_1.writeFile)(filePath, buffer);
	}
	async getFromFilesystemAsBuffer(fileId) {
		const filePath = this.getFilesystemPath(fileId);
		return await (0, promises_1.readFile)(filePath);
	}
	async getMetadataFromFilesystem(fileId) {
		const filePath = this.getFilesystemPath(fileId);
		const stats = await (0, promises_1.stat)(filePath);
		return {
			fileSize: stats.size,
		};
	}
	async deleteFromFilesystem(fileId) {
		const filePath = this.getFilesystemPath(fileId);
		await (0, promises_1.unlink)(filePath);
	}
}
exports.TemporalBinaryDataHelper = TemporalBinaryDataHelper;
async function initializeBinaryDataHelper(config) {
	const helper = new TemporalBinaryDataHelper(config);
	await helper.init();
	return {
		helper,
		cleanup: async () => {},
	};
}
//# sourceMappingURL=temporal-binary-data-helper.js.map
