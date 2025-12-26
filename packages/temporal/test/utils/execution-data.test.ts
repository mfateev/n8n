import { describe, it, expect } from '@jest/globals';
import type { INode } from 'n8n-workflow';

import {
	createEmptyExecutionData,
	createExecutionDataWithStartNode,
	isFirstExecution,
	isExecutionComplete,
	isExecutionWaiting,
} from '../../src/utils/execution-data';
import { getExecutedNodeNames } from '../../src/utils/state-merge';

describe('Execution Data Utilities', () => {
	describe('createEmptyExecutionData', () => {
		it('should create a valid empty IRunExecutionData', () => {
			const data = createEmptyExecutionData();

			expect(data.version).toBe(1);
			expect(data.resultData.runData).toEqual({});
			expect(data.executionData).toBeDefined();
			expect(data.executionData?.nodeExecutionStack).toEqual([]);
			expect(data.executionData?.waitingExecution).toEqual({});
			expect(data.executionData?.contextData).toEqual({});
		});
	});

	describe('createExecutionDataWithStartNode', () => {
		const mockStartNode: INode = {
			id: 'node-1',
			name: 'Start',
			type: 'n8n-nodes-base.manualTrigger',
			typeVersion: 1,
			position: [0, 0],
			parameters: {},
		};

		it('should create execution data with start node on stack', () => {
			const data = createExecutionDataWithStartNode(mockStartNode);

			expect(data.executionData?.nodeExecutionStack).toHaveLength(1);
			expect(data.executionData?.nodeExecutionStack[0].node).toBe(mockStartNode);
			expect(data.executionData?.nodeExecutionStack[0].source).toBeNull();
		});

		it('should use default input data when none provided', () => {
			const data = createExecutionDataWithStartNode(mockStartNode);

			const stackItem = data.executionData?.nodeExecutionStack[0];
			expect(stackItem?.data.main).toEqual([[{ json: {} }]]);
		});

		it('should use provided input data', () => {
			const inputData = [{ json: { key: 'value' } }];
			const data = createExecutionDataWithStartNode(mockStartNode, inputData);

			const stackItem = data.executionData?.nodeExecutionStack[0];
			expect(stackItem?.data.main).toEqual([inputData]);
		});
	});

	describe('isFirstExecution', () => {
		it('should return true for empty execution data', () => {
			const data = createEmptyExecutionData();
			expect(isFirstExecution(data)).toBe(true);
		});

		it('should return false when runData has entries', () => {
			const data = createEmptyExecutionData();
			data.resultData.runData = {
				// eslint-disable-next-line @typescript-eslint/naming-convention
				'Some Node': [
					{
						startTime: Date.now(),
						executionTime: 100,
						executionIndex: 0,
						source: [],
						data: { main: [[{ json: {} }]] },
					},
				],
			};

			expect(isFirstExecution(data)).toBe(false);
		});

		it('should return false when execution stack has entries', () => {
			const mockNode: INode = {
				id: 'node-1',
				name: 'Start',
				type: 'n8n-nodes-base.manualTrigger',
				typeVersion: 1,
				position: [0, 0],
				parameters: {},
			};

			const data = createExecutionDataWithStartNode(mockNode);
			expect(isFirstExecution(data)).toBe(false);
		});
	});

	describe('getExecutedNodeNames', () => {
		it('should return empty array for fresh execution', () => {
			const data = createEmptyExecutionData();
			expect(getExecutedNodeNames(data)).toEqual([]);
		});

		it('should return node names from runData', () => {
			const data = createEmptyExecutionData();
			data.resultData.runData = {
				// eslint-disable-next-line @typescript-eslint/naming-convention
				'Node A': [{ startTime: 0, executionTime: 0, executionIndex: 0, source: [] }],
				// eslint-disable-next-line @typescript-eslint/naming-convention
				'Node B': [{ startTime: 0, executionTime: 0, executionIndex: 0, source: [] }],
			};

			const names = getExecutedNodeNames(data);
			expect(names).toContain('Node A');
			expect(names).toContain('Node B');
			expect(names).toHaveLength(2);
		});
	});

	describe('isExecutionComplete', () => {
		it('should return true when no execution data', () => {
			const data = createEmptyExecutionData();
			data.executionData = undefined;

			expect(isExecutionComplete(data)).toBe(true);
		});

		it('should return true when stack and waiting are empty', () => {
			const data = createEmptyExecutionData();
			expect(isExecutionComplete(data)).toBe(true);
		});

		it('should return false when execution stack has items', () => {
			const mockNode: INode = {
				id: 'node-1',
				name: 'Start',
				type: 'n8n-nodes-base.manualTrigger',
				typeVersion: 1,
				position: [0, 0],
				parameters: {},
			};

			const data = createExecutionDataWithStartNode(mockNode);
			expect(isExecutionComplete(data)).toBe(false);
		});
	});

	describe('isExecutionWaiting', () => {
		it('should return false when no waitTill', () => {
			const data = createEmptyExecutionData();
			expect(isExecutionWaiting(data)).toBe(false);
		});

		it('should return true when waitTill is set', () => {
			const data = createEmptyExecutionData();
			data.waitTill = new Date(Date.now() + 60000);

			expect(isExecutionWaiting(data)).toBe(true);
		});
	});
});
