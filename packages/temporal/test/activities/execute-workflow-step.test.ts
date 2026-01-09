import { describe, it, expect, beforeEach, afterEach, jest } from '@jest/globals';
import { createRunExecutionData, NodeApiError, NodeOperationError } from 'n8n-workflow';
import type { INode, ITaskData } from 'n8n-workflow';

import type { WorkflowDefinition } from '../../src/types/activity-types';
import { buildAdditionalData } from '../../src/utils/additional-data';
import { serializeError, deserializeError } from '../../src/utils/error-serializer';
import {
	clearWorkerContext,
	getWorkerContext,
	initializeWorkerContext,
	type WorkerContext,
} from '../../src/worker/context';

const mockWorkflowData: WorkflowDefinition = {
	id: 'test-workflow-1',
	name: 'Test Workflow',
	nodes: [],
	connections: {},
};

describe('executeWorkflowStep Activity', () => {
	describe('Error Serialization', () => {
		it('should serialize and deserialize NodeApiError', () => {
			const node: INode = {
				id: 'node1',
				name: 'HTTP Request',
				type: 'n8n-nodes-base.httpRequest',
				typeVersion: 1,
				position: [0, 0],
				parameters: {},
			};

			const originalError = new NodeApiError(
				node,
				{ message: 'API request failed' },
				{
					httpCode: '500',
					description: 'Internal Server Error',
				},
			);

			const serialized = serializeError(originalError);
			expect(serialized.__type).toBe('NodeApiError');
			// NodeApiError may transform the message internally
			expect(serialized.message).toBeDefined();

			const deserialized = deserializeError(serialized);
			expect(deserialized).toBeInstanceOf(NodeApiError);
			// Message should match the serialized message after round-trip
			expect(deserialized.message).toBe(serialized.message);
		});

		it('should serialize and deserialize NodeOperationError', () => {
			const node: INode = {
				id: 'node1',
				name: 'Set',
				type: 'n8n-nodes-base.set',
				typeVersion: 1,
				position: [0, 0],
				parameters: {},
			};

			const originalError = new NodeOperationError(node, 'Invalid configuration', {
				description: 'Missing required field',
			});

			const serialized = serializeError(originalError);
			expect(serialized.__type).toBe('NodeOperationError');
			expect(serialized.message).toBe('Invalid configuration');

			const deserialized = deserializeError(serialized);
			expect(deserialized).toBeInstanceOf(NodeOperationError);
			expect(deserialized.message).toBe('Invalid configuration');
		});

		it('should serialize and deserialize generic Error', () => {
			const originalError = new Error('Something went wrong');

			const serialized = serializeError(originalError);
			expect(serialized.__type).toBe('Error');
			expect(serialized.message).toBe('Something went wrong');

			const deserialized = deserializeError(serialized);
			expect(deserialized).toBeInstanceOf(Error);
			expect(deserialized.message).toBe('Something went wrong');
		});
	});

	describe('Additional Data Builder', () => {
		it('should build additional data with required properties', () => {
			const mockCredentialsHelper = {
				getCredentials: jest.fn(),
			};

			const mockCredentialTypes = {
				getByName: jest.fn(),
				recognizes: jest.fn(),
				getCredentialTypeByName: jest.fn(),
			};

			const mockNodeTypes = {
				getByName: jest.fn(),
				getByNameAndVersion: jest.fn(),
				getKnownTypes: jest.fn().mockReturnValue({}),
			};

			const additionalData = buildAdditionalData({
				credentialsHelper: mockCredentialsHelper as never,
				credentialTypes: mockCredentialTypes as never,
				nodeTypes: mockNodeTypes as never,
				workflowData: mockWorkflowData,
				executionId: 'test-execution-123',
				userId: 'test-user',
			});

			expect(additionalData.credentialsHelper).toBe(mockCredentialsHelper);
			expect(additionalData.executionId).toBe('test-execution-123');
			expect(additionalData.userId).toBe('test-user');
		});

		it('should generate execution ID if not provided', () => {
			const mockCredentialsHelper = {
				getCredentials: jest.fn(),
			};

			const mockCredentialTypes = {
				getByName: jest.fn(),
				recognizes: jest.fn(),
				getCredentialTypeByName: jest.fn(),
			};

			const mockNodeTypes = {
				getByName: jest.fn(),
				getByNameAndVersion: jest.fn(),
				getKnownTypes: jest.fn().mockReturnValue({}),
			};

			const additionalData = buildAdditionalData({
				credentialsHelper: mockCredentialsHelper as never,
				credentialTypes: mockCredentialTypes as never,
				nodeTypes: mockNodeTypes as never,
				workflowData: mockWorkflowData,
			});

			expect(additionalData.executionId).toBeDefined();
			expect(additionalData.executionId).toMatch(/^temporal-/);
		});

		it('should throw error when executeWorkflow is called', async () => {
			const mockCredentialsHelper = {
				getCredentials: jest.fn(),
			};

			const mockCredentialTypes = {
				getByName: jest.fn(),
				recognizes: jest.fn(),
				getCredentialTypeByName: jest.fn(),
			};

			const mockNodeTypes = {
				getByName: jest.fn(),
				getByNameAndVersion: jest.fn(),
				getKnownTypes: jest.fn().mockReturnValue({}),
			};

			const additionalData = buildAdditionalData({
				credentialsHelper: mockCredentialsHelper as never,
				credentialTypes: mockCredentialTypes as never,
				nodeTypes: mockNodeTypes as never,
				workflowData: mockWorkflowData,
			});

			await expect(
				additionalData.executeWorkflow({} as never, {} as never, {} as never),
			).rejects.toThrow('Sub-workflow execution');
		});
	});

	describe('Execution State Helpers', () => {
		it('should detect first execution from empty run data', () => {
			const runData = createRunExecutionData({});

			// Check conditions for first execution
			const isFirst =
				Object.keys(runData.resultData.runData).length === 0 &&
				(!runData.executionData || runData.executionData.nodeExecutionStack.length === 0);

			expect(isFirst).toBe(true);
		});

		it('should detect non-first execution from populated run data', () => {
			const runData = createRunExecutionData({
				resultData: {
					runData: {
						start: [createTestTaskData()],
					},
				},
			});

			const isFirst =
				Object.keys(runData.resultData.runData).length === 0 &&
				(!runData.executionData || runData.executionData.nodeExecutionStack.length === 0);

			expect(isFirst).toBe(false);
		});
	});

	describe('Diff Computation', () => {
		it('should compute empty diff when no new nodes', () => {
			const previousNodes = new Set(['start', 'set']);
			const currentRunData: Record<string, ITaskData[]> = {
				start: [createTestTaskData()],
				set: [createTestTaskData()],
			};

			const diff = computeRunDataDiff(previousNodes, currentRunData);

			expect(Object.keys(diff).length).toBe(0);
		});

		it('should include new nodes in diff', () => {
			const previousNodes = new Set(['start']);
			const currentRunData: Record<string, ITaskData[]> = {
				start: [createTestTaskData()],
				set: [createTestTaskData()],
				end: [createTestTaskData()],
			};

			const diff = computeRunDataDiff(previousNodes, currentRunData);

			expect(Object.keys(diff).length).toBe(2);
			expect(diff.set).toBeDefined();
			expect(diff.end).toBeDefined();
			expect(diff.start).toBeUndefined();
		});

		it('should handle empty previous nodes', () => {
			const previousNodes = new Set<string>();
			const currentRunData: Record<string, ITaskData[]> = {
				start: [createTestTaskData()],
				set: [createTestTaskData()],
			};

			const diff = computeRunDataDiff(previousNodes, currentRunData);

			expect(Object.keys(diff).length).toBe(2);
		});
	});

	describe('Worker Context Integration', () => {
		beforeEach(() => {
			clearWorkerContext();
		});

		afterEach(() => {
			clearWorkerContext();
		});

		it('should require initialized context before activity execution', () => {
			// Attempting to get context without initialization should throw
			expect(() => getWorkerContext()).toThrow('Worker context not initialized');
		});

		it('should provide context after initialization', () => {
			const mockContext: WorkerContext = {
				nodeTypes: {
					getByName: () => ({ description: {} }) as never,
					getByNameAndVersion: () => ({ description: {} }) as never,
					getKnownTypes: () => ({}),
				},
				credentialsHelper: {} as never,
				credentialTypes: {} as never,
				identity: 'test-worker',
			};

			initializeWorkerContext(mockContext);

			const context = getWorkerContext();

			expect(context.identity).toBe('test-worker');
		});
	});
});

// Helper function to create test task data
function createTestTaskData(): ITaskData {
	return {
		startTime: Date.now(),
		executionTime: 100,
		executionStatus: 'success' as const,
		executionIndex: 0,
		source: [],
		data: {
			main: [[{ json: { test: true } }]],
		},
	};
}

// Helper function mirroring the activity's diff computation
function computeRunDataDiff(
	previousNodeNames: Set<string>,
	currentRunData: Record<string, ITaskData[]>,
): Record<string, ITaskData[]> {
	const diff: Record<string, ITaskData[]> = {};

	for (const [nodeName, taskDataArray] of Object.entries(currentRunData)) {
		if (!previousNodeNames.has(nodeName)) {
			diff[nodeName] = taskDataArray;
		}
	}

	return diff;
}
