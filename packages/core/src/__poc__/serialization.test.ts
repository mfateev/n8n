/**
 * POC 6: Temporal Data Serialization
 *
 * Goal: Validate that n8n data structures can survive serialization/deserialization
 * through Temporal's data converter (which uses JSON by default).
 *
 * Run with: cd packages/core && pnpm test serialization
 *
 * Success Criteria:
 * - Simple JSON data round-trips
 * - Binary data references preserved
 * - Error objects need custom handling (expected)
 * - Understand payload size limits
 * - Full execution state round-trips
 *
 * Note: Temporal uses JSON serialization by default (DefaultPayloadConverter).
 * We test JSON round-trip to simulate what Temporal would do.
 */

import { NodeApiError } from 'n8n-workflow';
import type { INodeExecutionData, IBinaryData, INode } from 'n8n-workflow';

// Simulate Temporal's DefaultPayloadConverter behavior
function roundTrip<T>(value: T): T {
	const json = JSON.stringify(value);
	return JSON.parse(json);
}

// Check if two values are deeply equal
function deepEqual(a: unknown, b: unknown): boolean {
	return JSON.stringify(a) === JSON.stringify(b);
}

describe('POC 6: Temporal Data Serialization', () => {
	describe('Simple Node Output', () => {
		it('should round-trip simple node output', () => {
			const nodeOutput: INodeExecutionData[] = [
				{
					json: { name: 'John', age: 30, nested: { foo: 'bar' } },
					pairedItem: { item: 0 },
				},
			];

			const result = roundTrip(nodeOutput);

			expect(deepEqual(result, nodeOutput)).toBe(true);
			expect(result[0].json.name).toBe('John');
			expect(result[0].json.age).toBe(30);
			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			expect((result[0].json.nested as any).foo).toBe('bar');
			console.log('  ✓ Simple node output round-trip: PASS');
		});

		it('should round-trip node output with arrays', () => {
			const nodeOutput: INodeExecutionData[] = [
				{
					json: {
						items: [1, 2, 3],
						objects: [{ id: 1 }, { id: 2 }],
						nested: { arr: ['a', 'b', 'c'] },
					},
				},
			];

			const result = roundTrip(nodeOutput);

			expect(deepEqual(result, nodeOutput)).toBe(true);
			expect(result[0].json.items).toEqual([1, 2, 3]);
			console.log('  ✓ Array data round-trip: PASS');
		});

		it('should round-trip multiple output items', () => {
			const items: INodeExecutionData[] = [
				{ json: { id: 1, value: 'first' } },
				{ json: { id: 2, value: 'second' } },
				{ json: { id: 3, value: 'third' } },
			];

			const result = roundTrip(items);

			expect(result.length).toBe(3);
			expect(result[0].json.value).toBe('first');
			expect(result[2].json.value).toBe('third');
			console.log('  ✓ Multiple items round-trip: PASS');
		});
	});

	describe('Binary Data References', () => {
		it('should round-trip binary data references (S3 mode)', () => {
			const binaryData: IBinaryData = {
				data: 's3',
				id: 's3:bucket/path/to/file',
				mimeType: 'image/png',
				fileName: 'image.png',
				fileSize: '1024',
			};

			const nodeOutput: INodeExecutionData[] = [
				{
					json: {},
					binary: { data: binaryData },
				},
			];

			const result = roundTrip(nodeOutput);

			expect(result[0].binary?.data.id).toBe('s3:bucket/path/to/file');
			expect(result[0].binary?.data.mimeType).toBe('image/png');
			expect(result[0].binary?.data.fileName).toBe('image.png');
			console.log('  ✓ Binary data reference (S3 mode) round-trip: PASS');
		});

		it('should round-trip base64 binary data', () => {
			// Small binary data stored as base64
			const base64Data = Buffer.from('Hello World').toString('base64');

			const binaryData: IBinaryData = {
				data: base64Data,
				mimeType: 'text/plain',
				fileName: 'test.txt',
				fileSize: '11',
			};

			const nodeOutput: INodeExecutionData[] = [
				{
					json: {},
					binary: { file: binaryData },
				},
			];

			const result = roundTrip(nodeOutput);

			expect(result[0].binary?.file.data).toBe(base64Data);
			// Verify we can decode it back
			const decoded = Buffer.from(result[0].binary!.file.data, 'base64').toString();
			expect(decoded).toBe('Hello World');
			console.log('  ✓ Base64 binary data round-trip: PASS');
		});
	});

	describe('Error Objects', () => {
		it('should demonstrate error serialization limitations', () => {
			// Create an error object
			const originalError = new Error('Test error message');
			originalError.name = 'TestError';

			const nodeOutput = [
				{
					json: { success: false },
					error: originalError,
				},
			];

			const result = roundTrip(nodeOutput);

			// Standard Error objects don't serialize well
			// They only keep the name property, lose message and stack
			console.log('  Serialized error:', JSON.stringify(result[0].error));

			// This is expected - Error objects need custom handling
			// Only 'name' survives because it was explicitly set; message/stack are lost
			expect(result[0].error).toEqual({ name: 'TestError' });
			console.log('  ⚠️ Standard Error only serializes name property (expected)');
		});

		it('should round-trip error info as plain objects', () => {
			// For errors, store error info as plain object instead
			const errorInfo = {
				message: 'Request failed',
				code: 'HTTP_500',
				statusCode: 500,
				description: 'Internal server error',
				timestamp: new Date().toISOString(),
				context: {
					nodeName: 'HTTP Request',
					nodeType: 'n8n-nodes-base.httpRequest',
				},
			};

			const nodeOutput: INodeExecutionData[] = [
				{
					json: {
						success: false,
						error: errorInfo,
					},
				},
			];

			const result = roundTrip(nodeOutput);

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			const resultError = result[0].json.error as any;
			expect(resultError.message).toBe('Request failed');
			expect(resultError.code).toBe('HTTP_500');
			expect(resultError.context.nodeName).toBe('HTTP Request');
			console.log('  ✓ Error info as plain object round-trip: PASS');
		});

		it('should demonstrate NodeApiError serialization', () => {
			// NodeApiError is a custom error class
			const node: INode = {
				id: 'node-1',
				name: 'HTTP Request',
				type: 'n8n-nodes-base.httpRequest',
				typeVersion: 4.2,
				position: [0, 0],
				parameters: {},
			};

			const apiError = new NodeApiError(node, {
				message: 'API request failed',
				httpCode: '500',
			});

			// Try to serialize
			const serialized = JSON.stringify({ error: apiError });
			console.log('  NodeApiError serialized:', serialized);
			console.log('  ⚠️ NodeApiError needs custom serialization');

			// For Temporal, we'd convert errors to plain objects before serialization
			const errorPlainObject = {
				name: apiError.name,
				message: apiError.message,
				description: apiError.description,
				httpCode: apiError.httpCode,
				context: apiError.context,
				timestamp: apiError.timestamp,
				// Don't include stack trace in production
			};

			const result = roundTrip(errorPlainObject);
			expect(result.message).toBe(apiError.message);
			console.log('  ✓ NodeApiError as plain object round-trip: PASS');
		});
	});

	describe('Full Execution State (IRunExecutionData)', () => {
		it('should round-trip IRunExecutionData structure', () => {
			// Using a simplified structure that matches what we need to test
			const runData = {
				startData: {
					destinationNode: 'End',
				},
				resultData: {
					runData: {
						Start: [
							{
								startTime: Date.now(),
								executionTime: 10,
								executionIndex: 0,
								source: [],
								executionStatus: 'success',
								data: {
									main: [[{ json: { x: 1 } }]],
								},
							},
						],
						Middle: [
							{
								startTime: Date.now(),
								executionTime: 20,
								executionIndex: 1,
								source: [{ previousNode: 'Start' }],
								executionStatus: 'success',
								data: {
									main: [[{ json: { x: 2 } }]],
								},
							},
						],
					},
					pinData: {},
					lastNodeExecuted: 'Middle',
				},
				executionData: {
					contextData: {},
					nodeExecutionStack: [
						{
							node: { name: 'End' },
							data: { main: [[{ json: {} }]] },
							source: { main: [{ previousNode: 'Middle' }] },
						},
					],
					metadata: {},
					waitingExecution: {},
					waitingExecutionSource: {},
				},
			};

			const result = roundTrip(runData);

			// Verify structure preserved
			expect(result.startData?.destinationNode).toBe('End');
			expect(result.resultData?.runData?.Start?.[0].data?.main?.[0]?.[0]?.json?.x).toBe(1);
			expect(result.resultData?.runData?.Middle?.[0].data?.main?.[0]?.[0]?.json?.x).toBe(2);
			expect(result.executionData?.nodeExecutionStack?.length).toBe(1);
			console.log('  ✓ IRunExecutionData round-trip: PASS');
		});
	});

	describe('Payload Size Considerations', () => {
		it('should handle moderately large payloads (100KB)', () => {
			// Temporal default limit is 2MB, but best practice is to keep payloads small
			const largeString = 'x'.repeat(100 * 1024); // 100KB

			const nodeOutput: INodeExecutionData[] = [
				{
					json: {
						data: largeString,
						metadata: { size: largeString.length },
					},
				},
			];

			const result = roundTrip(nodeOutput);

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			expect((result[0].json.data as any).length).toBe(100 * 1024);
			console.log('  ✓ 100KB payload round-trip: PASS');
		});

		it('should handle 1MB payload', () => {
			const largeString = 'x'.repeat(1024 * 1024); // 1MB

			const nodeOutput: INodeExecutionData[] = [
				{
					json: { data: largeString },
				},
			];

			const startTime = Date.now();
			const result = roundTrip(nodeOutput);
			const duration = Date.now() - startTime;

			// eslint-disable-next-line @typescript-eslint/no-explicit-any
			expect((result[0].json.data as any).length).toBe(1024 * 1024);
			console.log(`  ✓ 1MB payload round-trip: PASS (${duration}ms)`);

			// Note: Temporal's default limit is 2MB per payload
			// For larger data, use external storage (S3) and pass references
		});

		it('should handle many small items', () => {
			// 1000 items with small data each
			const items: INodeExecutionData[] = Array.from({ length: 1000 }, (_, i) => ({
				json: { id: i, value: `item-${i}`, timestamp: Date.now() },
			}));

			const startTime = Date.now();
			const result = roundTrip(items);
			const duration = Date.now() - startTime;

			expect(result.length).toBe(1000);
			expect(result[0].json.id).toBe(0);
			expect(result[999].json.id).toBe(999);
			console.log(`  ✓ 1000 items round-trip: PASS (${duration}ms)`);
		});
	});

	describe('Special Values', () => {
		it('should handle null and undefined correctly', () => {
			const nodeOutput: INodeExecutionData[] = [
				{
					json: {
						nullValue: null,
						undefinedValue: undefined, // Will be stripped
						nested: {
							nullField: null,
						},
					},
				},
			];

			const result = roundTrip(nodeOutput);

			expect(result[0].json.nullValue).toBeNull();
			expect(result[0].json.undefinedValue).toBeUndefined(); // Stripped by JSON
			expect('undefinedValue' in result[0].json).toBe(false);
			console.log('  ✓ null/undefined handling: PASS (undefined stripped as expected)');
		});

		it('should handle dates as ISO strings', () => {
			const now = new Date();
			const nodeOutput: INodeExecutionData[] = [
				{
					json: {
						createdAt: now.toISOString(),
						dateObject: now, // Will become string
					},
				},
			];

			const result = roundTrip(nodeOutput);

			// Date objects become ISO strings
			expect(typeof result[0].json.dateObject).toBe('string');
			expect(result[0].json.createdAt).toBe(now.toISOString());
			console.log('  ✓ Date serialization: PASS (becomes ISO string)');
		});

		it('should handle special numeric values', () => {
			const nodeOutput: INodeExecutionData[] = [
				{
					json: {
						infinity: Infinity,
						negInfinity: -Infinity,
						nan: NaN,
						maxInt: Number.MAX_SAFE_INTEGER,
						minInt: Number.MIN_SAFE_INTEGER,
						float: 3.14159265359,
					},
				},
			];

			const result = roundTrip(nodeOutput);

			// Infinity and NaN become null in JSON
			expect(result[0].json.infinity).toBeNull();
			expect(result[0].json.negInfinity).toBeNull();
			expect(result[0].json.nan).toBeNull();
			expect(result[0].json.maxInt).toBe(Number.MAX_SAFE_INTEGER);
			expect(result[0].json.float).toBeCloseTo(3.14159265359);
			console.log('  ✓ Special numerics: PASS (Infinity/NaN become null)');
		});
	});

	afterAll(() => {
		console.log('\n=== POC 6 RESULTS ===');
		console.log('✓ Simple JSON data round-trips correctly');
		console.log('✓ Binary data references preserved');
		console.log('✓ Full IRunExecutionData round-trips');
		console.log('✓ Large payloads work (tested up to 1MB)');
		console.log('⚠️ Error objects need custom serialization (convert to plain objects)');
		console.log('⚠️ Dates become ISO strings');
		console.log('⚠️ undefined is stripped, Infinity/NaN become null');
		console.log('\nKey Finding: Standard JSON serialization works for most n8n data');
		console.log('Recommendation: Convert errors to plain objects before Temporal serialization');
	});
});
