import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';

import type { WorkerContext } from '../../src/worker/context';
import {
	getWorkerContext,
	initializeWorkerContext,
	isWorkerContextInitialized,
	clearWorkerContext,
} from '../../src/worker/context';

describe('WorkerContext', () => {
	// Clear context before and after each test
	beforeEach(() => {
		clearWorkerContext();
	});

	afterEach(() => {
		clearWorkerContext();
	});

	const createMockContext = (): WorkerContext => ({
		nodeTypes: {
			getByName: () => ({ description: {} }) as never,
			getByNameAndVersion: () => ({ description: {} }) as never,
			getKnownTypes: () => ({}),
		},
		credentialsHelper: {} as never,
		credentialTypes: {} as never,
		identity: 'test-worker',
	});

	describe('getWorkerContext', () => {
		it('should throw if accessed before initialization', () => {
			expect(() => getWorkerContext()).toThrow('Worker context not initialized');
		});

		it('should return context after initialization', () => {
			const mockContext = createMockContext();
			initializeWorkerContext(mockContext);

			const retrieved = getWorkerContext();
			expect(retrieved).toBe(mockContext);
			expect(retrieved.identity).toBe('test-worker');
		});
	});

	describe('initializeWorkerContext', () => {
		it('should initialize context with required services', () => {
			const mockContext = createMockContext();
			initializeWorkerContext(mockContext);

			expect(isWorkerContextInitialized()).toBe(true);
		});

		it('should warn on re-initialization but still update', () => {
			const consoleSpy = jest.spyOn(console, 'warn').mockImplementation(() => {});

			const context1 = createMockContext();
			context1.identity = 'worker-1';
			initializeWorkerContext(context1);

			const context2 = createMockContext();
			context2.identity = 'worker-2';
			initializeWorkerContext(context2);

			expect(consoleSpy).toHaveBeenCalledWith(expect.stringContaining('already initialized'));

			const retrieved = getWorkerContext();
			expect(retrieved.identity).toBe('worker-2');

			consoleSpy.mockRestore();
		});
	});

	describe('isWorkerContextInitialized', () => {
		it('should return false before initialization', () => {
			expect(isWorkerContextInitialized()).toBe(false);
		});

		it('should return true after initialization', () => {
			initializeWorkerContext(createMockContext());
			expect(isWorkerContextInitialized()).toBe(true);
		});
	});

	describe('clearWorkerContext', () => {
		it('should clear initialized context', () => {
			initializeWorkerContext(createMockContext());
			expect(isWorkerContextInitialized()).toBe(true);

			clearWorkerContext();
			expect(isWorkerContextInitialized()).toBe(false);
		});
	});
});
