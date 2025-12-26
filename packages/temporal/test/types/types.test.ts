import { describe, it, expect } from '@jest/globals';
import { createRunExecutionData } from 'n8n-workflow';

import type {
	ExecuteN8nWorkflowInput,
	ExecuteWorkflowStepInput,
	ExecuteWorkflowStepOutput,
	SerializedError,
} from '../../src/types';
import { isSerializedError } from '../../src/types/serialized-error';

describe('Workflow Types', () => {
	it('should allow valid ExecuteN8nWorkflowInput', () => {
		const input: ExecuteN8nWorkflowInput = {
			workflowId: 'test-workflow-1',
			workflowName: 'Test Workflow',
			nodes: [
				{
					id: 'node-1',
					name: 'Start',
					type: 'n8n-nodes-base.manualTrigger',
					typeVersion: 1,
					position: [0, 0],
					parameters: {},
				},
			],
			connections: {},
		};
		expect(input.workflowId).toBe('test-workflow-1');
	});

	it('should allow optional fields in ExecuteN8nWorkflowInput', () => {
		const input: ExecuteN8nWorkflowInput = {
			workflowId: 'test',
			workflowName: 'Test',
			nodes: [],
			connections: {},
			settings: { executionOrder: 'v1' },
			inputData: [{ json: { foo: 'bar' } }],
		};
		expect(input.settings).toBeDefined();
		expect(input.inputData).toBeDefined();
	});
});

describe('Activity Types', () => {
	it('should allow valid ExecuteWorkflowStepInput', () => {
		const input: ExecuteWorkflowStepInput = {
			workflowDefinition: {
				id: 'wf-1',
				name: 'Test',
				nodes: [],
				connections: {},
			},
			runExecutionData: createRunExecutionData(),
			previouslyExecutedNodes: [],
		};
		expect(input.workflowDefinition.id).toBe('wf-1');
	});

	it('should allow valid ExecuteWorkflowStepOutput', () => {
		const output: ExecuteWorkflowStepOutput = {
			complete: false,
			newRunData: {},
			executionData: {
				nodeExecutionStack: [],
				waitingExecution: {},
				waitingExecutionSource: null,
			},
		};
		expect(output.complete).toBe(false);
	});
});

describe('SerializedError', () => {
	it('should identify NodeApiError', () => {
		const error: SerializedError = {
			__type: 'NodeApiError',
			message: 'API Error',
			node: {
				id: '1',
				name: 'Test',
				type: 'test',
				typeVersion: 1,
				position: [0, 0],
				parameters: {},
			},
			httpCode: '500',
		};
		expect(isSerializedError(error)).toBe(true);
	});

	it('should identify NodeOperationError', () => {
		const error: SerializedError = {
			__type: 'NodeOperationError',
			message: 'Operation failed',
			node: {
				id: '1',
				name: 'Test',
				type: 'test',
				typeVersion: 1,
				position: [0, 0],
				parameters: {},
			},
		};
		expect(isSerializedError(error)).toBe(true);
	});

	it('should identify generic Error', () => {
		const error: SerializedError = {
			__type: 'Error',
			name: 'Error',
			message: 'Something went wrong',
		};
		expect(isSerializedError(error)).toBe(true);
	});

	it('should reject non-error objects', () => {
		expect(isSerializedError(null)).toBe(false);
		expect(isSerializedError(undefined)).toBe(false);
		expect(isSerializedError({ message: 'not an error' })).toBe(false);
		expect(isSerializedError('string')).toBe(false);
	});
});
