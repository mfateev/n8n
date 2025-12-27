import { describe, it, expect } from '@jest/globals';
import { NodeApiError, NodeOperationError } from 'n8n-workflow';
import type { INode } from 'n8n-workflow';

import { n8nPayloadConverter } from '../../src/data-converter/n8n-payload-converter';

describe('N8nPayloadConverter', () => {
	const mockNode: INode = {
		id: 'test-node-1',
		name: 'Test Node',
		type: 'n8n-nodes-base.httpRequest',
		typeVersion: 1,
		position: [0, 0],
		parameters: {},
	};

	describe('NodeApiError serialization', () => {
		it('should serialize and deserialize NodeApiError preserving properties', () => {
			const originalError = new NodeApiError(
				mockNode,
				{ message: 'API request failed' },
				{
					message: 'API request failed',
					description: 'The server returned a 500 error',
					httpCode: '500',
				},
			);
			originalError.stack = 'Error: API request failed\n    at test.ts:1:1';

			// Serialize
			const payload = n8nPayloadConverter.toPayload(originalError);
			expect(payload).toBeDefined();

			// Deserialize - returns generic Error in V8 sandbox with preserved properties
			const deserialized = n8nPayloadConverter.fromPayload<Error>(payload);

			// In the V8 sandbox, we return generic Error with preserved properties
			// (can't import n8n-workflow due to dynamic require issues)
			expect(deserialized).toBeInstanceOf(Error);
			expect(deserialized.name).toBe('NodeApiError');
			expect(deserialized.message).toBeDefined();

			// All original properties are preserved on the error object
			const errorRecord = deserialized as Error & Record<string, unknown>;
			expect(errorRecord.__type).toBe('NodeApiError');
			expect(errorRecord.node).toEqual(mockNode);
			expect(errorRecord.httpCode).toBe('500');
		});
	});

	describe('NodeOperationError serialization', () => {
		it('should serialize and deserialize NodeOperationError preserving properties', () => {
			const originalError = new NodeOperationError(mockNode, 'Operation failed', {
				description: 'Invalid parameter value',
			});
			originalError.stack = 'Error: Operation failed\n    at test.ts:1:1';

			// Serialize
			const payload = n8nPayloadConverter.toPayload(originalError);
			expect(payload).toBeDefined();

			// Deserialize - returns generic Error in V8 sandbox with preserved properties
			const deserialized = n8nPayloadConverter.fromPayload<Error>(payload);

			// In the V8 sandbox, we return generic Error with preserved properties
			expect(deserialized).toBeInstanceOf(Error);
			expect(deserialized.name).toBe('NodeOperationError');
			expect(deserialized.message).toBe('Operation failed');

			// All original properties are preserved on the error object
			const errorRecord = deserialized as Error & Record<string, unknown>;
			expect(errorRecord.__type).toBe('NodeOperationError');
			expect(errorRecord.description).toBe('Invalid parameter value');
			expect(errorRecord.node).toEqual(mockNode);
		});
	});

	describe('Generic Error serialization', () => {
		it('should serialize and deserialize standard Error', () => {
			const originalError = new Error('Something went wrong');
			originalError.name = 'CustomError';
			originalError.stack = 'Error: Something went wrong\n    at test.ts:1:1';

			// Serialize
			const payload = n8nPayloadConverter.toPayload(originalError);
			expect(payload).toBeDefined();

			// Deserialize
			const deserialized = n8nPayloadConverter.fromPayload<Error>(payload);

			expect(deserialized).toBeInstanceOf(Error);
			expect(deserialized.message).toBe('Something went wrong');
			expect(deserialized.name).toBe('CustomError');
		});
	});

	describe('Non-error value pass-through', () => {
		it('should pass through regular objects unchanged', () => {
			const original = {
				name: 'test',
				value: 123,
				nested: { foo: 'bar' },
			};

			const payload = n8nPayloadConverter.toPayload(original);
			const deserialized = n8nPayloadConverter.fromPayload<typeof original>(payload);

			expect(deserialized).toEqual(original);
		});

		it('should pass through arrays unchanged', () => {
			const original = [1, 2, 'three', { four: 4 }];

			const payload = n8nPayloadConverter.toPayload(original);
			const deserialized = n8nPayloadConverter.fromPayload<typeof original>(payload);

			expect(deserialized).toEqual(original);
		});

		it('should pass through primitive values', () => {
			const stringPayload = n8nPayloadConverter.toPayload('hello');
			expect(n8nPayloadConverter.fromPayload<string>(stringPayload)).toBe('hello');

			const numberPayload = n8nPayloadConverter.toPayload(42);
			expect(n8nPayloadConverter.fromPayload<number>(numberPayload)).toBe(42);

			const boolPayload = n8nPayloadConverter.toPayload(true);
			expect(n8nPayloadConverter.fromPayload<boolean>(boolPayload)).toBe(true);
		});
	});

	describe('Nested error handling', () => {
		it('should handle errors nested in objects', () => {
			const originalError = new Error('Nested error');
			originalError.name = 'NestedError';

			const original = {
				success: false,
				error: originalError,
				data: { foo: 'bar' },
			};

			const payload = n8nPayloadConverter.toPayload(original);
			const deserialized = n8nPayloadConverter.fromPayload<{
				success: boolean;
				error: Error;
				data: { foo: string };
			}>(payload);

			expect(deserialized.success).toBe(false);
			expect(deserialized.error).toBeInstanceOf(Error);
			expect(deserialized.error.message).toBe('Nested error');
			expect(deserialized.error.name).toBe('NestedError');
			expect(deserialized.data).toEqual({ foo: 'bar' });
		});

		it('should handle errors in arrays', () => {
			const error1 = new Error('Error 1');
			const error2 = new Error('Error 2');

			const original = [error1, error2];

			const payload = n8nPayloadConverter.toPayload(original);
			const deserialized = n8nPayloadConverter.fromPayload<Error[]>(payload);

			expect(deserialized).toHaveLength(2);
			expect(deserialized[0]).toBeInstanceOf(Error);
			expect(deserialized[0].message).toBe('Error 1');
			expect(deserialized[1]).toBeInstanceOf(Error);
			expect(deserialized[1].message).toBe('Error 2');
		});
	});

	describe('Undefined handling', () => {
		it('should handle undefined values', () => {
			const payload = n8nPayloadConverter.toPayload(undefined);
			expect(payload).toBeDefined();

			const deserialized = n8nPayloadConverter.fromPayload<undefined>(payload);
			expect(deserialized).toBeUndefined();
		});
	});
});
