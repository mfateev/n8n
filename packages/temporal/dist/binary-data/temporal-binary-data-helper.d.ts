import type { Readable } from 'node:stream';
import type { BinaryDataConfig } from '../config/types';
export interface BinaryDataMetadata {
	fileName?: string;
	mimeType?: string;
	fileSize: number;
}
export interface BinaryDataPreWriteMetadata {
	fileName?: string;
	mimeType?: string;
}
export interface BinaryDataWriteResult {
	binaryDataId: string;
	fileSize: number;
}
export interface BinaryDataFileLocation {
	workflowId: string;
	executionId: string;
}
export declare class TemporalBinaryDataHelper {
	private readonly config;
	private mode;
	private s3Client?;
	private s3Bucket?;
	private filesystemBasePath?;
	private isInitialized;
	constructor(config: BinaryDataConfig);
	init(): Promise<void>;
	private initS3;
	private initFilesystem;
	store(
		location: BinaryDataFileLocation,
		data: Buffer | Readable,
		metadata?: BinaryDataPreWriteMetadata,
	): Promise<BinaryDataWriteResult>;
	getAsBuffer(binaryDataId: string): Promise<Buffer>;
	getMetadata(binaryDataId: string): Promise<BinaryDataMetadata>;
	delete(binaryDataId: string): Promise<void>;
	getMode(): 'filesystem' | 's3';
	isReady(): boolean;
	private ensureInitialized;
	private generateFileId;
	private createBinaryDataId;
	private parseBinaryDataId;
	private storeInS3;
	private getFromS3AsBuffer;
	private getMetadataFromS3;
	private deleteFromS3;
	private getFilesystemPath;
	private storeInFilesystem;
	private getFromFilesystemAsBuffer;
	private getMetadataFromFilesystem;
	private deleteFromFilesystem;
}
export declare function initializeBinaryDataHelper(config: BinaryDataConfig): Promise<{
	helper: TemporalBinaryDataHelper;
	cleanup: () => Promise<void>;
}>;
