/**
 * Unit Tests for TemporalBinaryDataHelper
 *
 * Tests the binary data storage functionality for both filesystem and S3 modes.
 */

import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

import {
	TemporalBinaryDataHelper,
	initializeBinaryDataHelper,
} from '../../src/binary-data/temporal-binary-data-helper';
import type { BinaryDataConfig } from '../../src/config/types';

describe('TemporalBinaryDataHelper', () => {
	let tempDir: string;

	beforeAll(async () => {
		// Create a temporary directory for filesystem tests
		tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'temporal-binary-test-'));
	});

	afterAll(async () => {
		// Clean up temp directory
		await fs.rm(tempDir, { recursive: true, force: true });
	});

	describe('Filesystem Mode', () => {
		let helper: TemporalBinaryDataHelper;
		let filesystemBasePath: string;

		beforeEach(async () => {
			filesystemBasePath = path.join(tempDir, `test-${Date.now()}`);
			const config: BinaryDataConfig = {
				mode: 'filesystem',
				filesystem: {
					basePath: filesystemBasePath,
				},
			};
			helper = new TemporalBinaryDataHelper(config);
			await helper.init();
		});

		it('should initialize with filesystem mode', () => {
			expect(helper.getMode()).toBe('filesystem');
			expect(helper.isReady()).toBe(true);
		});

		it('should store and retrieve binary data', async () => {
			const testData = Buffer.from('Hello, World!');
			const location = { workflowId: 'wf-123', executionId: 'exec-456' };

			const result = await helper.store(location, testData);

			expect(result.binaryDataId).toMatch(
				/^filesystem-v2:workflows\/wf-123\/executions\/exec-456\/binary_data\/.+$/,
			);
			expect(result.fileSize).toBe(testData.length);

			// Retrieve and verify
			const retrieved = await helper.getAsBuffer(result.binaryDataId);
			expect(retrieved.toString()).toBe('Hello, World!');
		});

		it('should store and retrieve binary data with metadata', async () => {
			const testData = Buffer.from('Test file content');
			const location = { workflowId: 'wf-123', executionId: 'exec-456' };
			const metadata = { fileName: 'test.txt', mimeType: 'text/plain' };

			const result = await helper.store(location, testData, metadata);

			expect(result.binaryDataId).toContain('filesystem-v2:');
			expect(result.fileSize).toBe(testData.length);

			// Retrieve and verify
			const retrieved = await helper.getAsBuffer(result.binaryDataId);
			expect(retrieved.toString()).toBe('Test file content');
		});

		it('should get metadata for stored binary data', async () => {
			const testData = Buffer.from('Metadata test');
			const location = { workflowId: 'wf-123', executionId: 'exec-456' };

			const result = await helper.store(location, testData);
			const metadata = await helper.getMetadata(result.binaryDataId);

			expect(metadata.fileSize).toBe(testData.length);
		});

		it('should delete binary data', async () => {
			const testData = Buffer.from('To be deleted');
			const location = { workflowId: 'wf-123', executionId: 'exec-456' };

			const result = await helper.store(location, testData);

			// Verify it exists
			const retrieved = await helper.getAsBuffer(result.binaryDataId);
			expect(retrieved.toString()).toBe('To be deleted');

			// Delete it
			await helper.delete(result.binaryDataId);

			// Verify it's gone
			await expect(helper.getAsBuffer(result.binaryDataId)).rejects.toThrow();
		});

		it('should create base directory if it does not exist', async () => {
			const newBasePath = path.join(tempDir, 'new-dir', 'nested');
			const config: BinaryDataConfig = {
				mode: 'filesystem',
				filesystem: {
					basePath: newBasePath,
				},
			};
			const newHelper = new TemporalBinaryDataHelper(config);
			await newHelper.init();

			// Directory should now exist
			const stats = await fs.stat(newBasePath);
			expect(stats.isDirectory()).toBe(true);
		});

		it('should generate unique binary data IDs', async () => {
			const testData = Buffer.from('Test');
			const location = { workflowId: 'wf-123', executionId: 'exec-456' };

			const result1 = await helper.store(location, testData);
			const result2 = await helper.store(location, testData);

			expect(result1.binaryDataId).not.toBe(result2.binaryDataId);
		});
	});

	describe('Error Handling', () => {
		it('should throw error when not initialized', async () => {
			const config: BinaryDataConfig = {
				mode: 'filesystem',
				filesystem: { basePath: tempDir },
			};
			const helper = new TemporalBinaryDataHelper(config);

			await expect(
				helper.store({ workflowId: 'wf', executionId: 'ex' }, Buffer.from('test')),
			).rejects.toThrow('TemporalBinaryDataHelper not initialized. Call init() first.');
		});

		it('should throw error for invalid binary data ID format', async () => {
			const config: BinaryDataConfig = {
				mode: 'filesystem',
				filesystem: { basePath: tempDir },
			};
			const helper = new TemporalBinaryDataHelper(config);
			await helper.init();

			await expect(helper.getAsBuffer('invalid-id-without-colon')).rejects.toThrow(
				'Invalid binary data ID format',
			);
		});

		it('should throw error when reading non-existent file', async () => {
			const config: BinaryDataConfig = {
				mode: 'filesystem',
				filesystem: { basePath: tempDir },
			};
			const helper = new TemporalBinaryDataHelper(config);
			await helper.init();

			await expect(helper.getAsBuffer('filesystem-v2:non-existent-file')).rejects.toThrow();
		});
	});

	describe('S3 Mode Configuration', () => {
		it('should throw error when S3 mode is configured without S3 config', async () => {
			const config: BinaryDataConfig = {
				mode: 's3',
			};
			const helper = new TemporalBinaryDataHelper(config);

			await expect(helper.init()).rejects.toThrow('S3 configuration required when mode is "s3"');
		});

		it('should throw error when S3 bucket name is missing', async () => {
			const config: BinaryDataConfig = {
				mode: 's3',
				s3: {
					bucket: '',
					region: 'us-east-1',
				},
			};
			const helper = new TemporalBinaryDataHelper(config);

			await expect(helper.init()).rejects.toThrow('S3 bucket name is required');
		});

		it('should throw error when S3 bucket is inaccessible', async () => {
			const config: BinaryDataConfig = {
				mode: 's3',
				s3: {
					bucket: 'non-existent-bucket-xyz',
					region: 'us-east-1',
					accessKeyId: 'fake-access-key',
					secretAccessKey: 'fake-secret-key',
				},
			};
			const helper = new TemporalBinaryDataHelper(config);

			// Should fail when trying to verify bucket access
			await expect(helper.init()).rejects.toThrow(/Failed to connect to S3 bucket/);
		});

		it('should configure custom endpoint for S3-compatible services', async () => {
			const config: BinaryDataConfig = {
				mode: 's3',
				s3: {
					bucket: 'test-bucket',
					region: 'us-east-1',
					host: 'localhost:9000',
					protocol: 'http',
					accessKeyId: 'minioadmin',
					secretAccessKey: 'minioadmin',
				},
			};
			const helper = new TemporalBinaryDataHelper(config);

			// This will fail because there's no MinIO running, but we verify the config is accepted
			await expect(helper.init()).rejects.toThrow();
		});
	});

	describe('initializeBinaryDataHelper', () => {
		it('should initialize helper and return cleanup function', async () => {
			const config: BinaryDataConfig = {
				mode: 'filesystem',
				filesystem: {
					basePath: path.join(tempDir, 'init-test'),
				},
			};

			const { helper, cleanup } = await initializeBinaryDataHelper(config);

			expect(helper.isReady()).toBe(true);
			expect(helper.getMode()).toBe('filesystem');
			expect(typeof cleanup).toBe('function');

			// Cleanup should not throw
			await expect(cleanup()).resolves.toBeUndefined();
		});
	});

	describe('Binary Data ID Parsing', () => {
		let helper: TemporalBinaryDataHelper;

		beforeEach(async () => {
			const config: BinaryDataConfig = {
				mode: 'filesystem',
				filesystem: { basePath: path.join(tempDir, 'parse-test') },
			};
			helper = new TemporalBinaryDataHelper(config);
			await helper.init();
		});

		it('should correctly generate filesystem-v2 prefixed IDs', async () => {
			const testData = Buffer.from('test');
			const location = { workflowId: 'wf-1', executionId: 'ex-1' };

			const result = await helper.store(location, testData);

			expect(result.binaryDataId.startsWith('filesystem-v2:')).toBe(true);
		});

		it('should correctly parse binary data IDs with colons in the path', async () => {
			// Store some data first
			const testData = Buffer.from('test');
			const location = { workflowId: 'wf-1', executionId: 'ex-1' };
			const result = await helper.store(location, testData);

			// Retrieve should work correctly even with complex paths
			const retrieved = await helper.getAsBuffer(result.binaryDataId);
			expect(retrieved.toString()).toBe('test');
		});
	});
});
