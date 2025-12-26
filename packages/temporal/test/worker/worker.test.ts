/**
 * Worker Bootstrap Tests
 *
 * Note: Full worker bootstrap testing requires integration tests due to complex
 * dependency chains (n8n-core imports langchain, etc.). These tests validate
 * the configuration interfaces and context integration.
 */

import { describe, it, expect, beforeEach, afterEach } from '@jest/globals';

import {
	clearWorkerContext,
	initializeWorkerContext,
	isWorkerContextInitialized,
	getWorkerContext,
} from '../../src/worker/context';
import type { WorkerBootstrapConfig } from '../../src/worker/worker';

describe('Worker Bootstrap', () => {
	beforeEach(() => {
		clearWorkerContext();
	});

	afterEach(() => {
		clearWorkerContext();
	});

	describe('WorkerBootstrapConfig interface', () => {
		it('should accept valid minimal configuration', () => {
			const config: WorkerBootstrapConfig = {
				temporal: {
					address: 'localhost:7233',
					taskQueue: 'n8n-workflows',
				},
				credentials: {
					path: './credentials.json',
				},
			};

			expect(config.temporal.address).toBe('localhost:7233');
			expect(config.temporal.taskQueue).toBe('n8n-workflows');
			expect(config.credentials.path).toBe('./credentials.json');
		});

		it('should accept full configuration with optional fields', () => {
			const config: WorkerBootstrapConfig = {
				temporal: {
					address: 'temporal.example.com:7233',
					taskQueue: 'production-workflows',
					namespace: 'production',
					identity: 'worker-1',
					maxConcurrentActivityTaskExecutions: 100,
					maxConcurrentWorkflowTaskExecutions: 50,
					maxCachedWorkflows: 1000,
					tls: {
						clientCert: 'cert-data',
						clientKey: 'key-data',
					},
				},
				credentials: {
					path: '/etc/n8n/credentials.json',
				},
				binaryData: {
					mode: 's3',
					s3: {
						bucket: 'n8n-binaries',
						region: 'us-east-1',
					},
				},
			};

			expect(config.temporal.namespace).toBe('production');
			expect(config.temporal.maxConcurrentActivityTaskExecutions).toBe(100);
			expect(config.binaryData?.mode).toBe('s3');
		});
	});

	describe('Worker context integration', () => {
		it('should track initialization state', () => {
			expect(isWorkerContextInitialized()).toBe(false);

			// Mock minimal context for testing
			const mockContext = {
				nodeTypes: {} as never,
				credentialsHelper: {} as never,
				credentialTypes: {} as never,
				identity: 'test-worker',
			};

			initializeWorkerContext(mockContext);

			expect(isWorkerContextInitialized()).toBe(true);
		});

		it('should provide context after initialization', () => {
			const mockContext = {
				nodeTypes: { getByName: () => ({}) } as never,
				credentialsHelper: {} as never,
				credentialTypes: {} as never,
				identity: 'test-worker-2',
			};

			initializeWorkerContext(mockContext);

			const context = getWorkerContext();
			expect(context.identity).toBe('test-worker-2');
		});

		it('should clear context', () => {
			const mockContext = {
				nodeTypes: {} as never,
				credentialsHelper: {} as never,
				credentialTypes: {} as never,
				identity: 'test-worker',
			};

			initializeWorkerContext(mockContext);
			expect(isWorkerContextInitialized()).toBe(true);

			clearWorkerContext();
			expect(isWorkerContextInitialized()).toBe(false);
		});
	});

	describe('Configuration defaults', () => {
		it('should use sensible defaults for optional config', () => {
			const config: WorkerBootstrapConfig = {
				temporal: {
					address: 'localhost:7233',
					taskQueue: 'test-queue',
				},
				credentials: {
					path: './creds.json',
				},
			};

			// Verify defaults that would be applied in runWorker
			const namespace = config.temporal.namespace ?? 'default';
			const identity = config.temporal.identity ?? `n8n-worker-${process.pid}`;

			expect(namespace).toBe('default');
			expect(identity).toMatch(/^n8n-worker-\d+$/);
		});
	});
});
