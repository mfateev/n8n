import { describe, it, expect } from '@jest/globals';
import { createRunExecutionData } from 'n8n-workflow';
import type { IDataObject, ITaskData, ITaskDataConnections } from 'n8n-workflow';

import type { ExecuteWorkflowStepOutput } from '../../src/types/activity-types';
import { mergeWorkflowStepResult, getExecutedNodeNames } from '../../src/utils/state-merge';

// Helper to create a minimal valid ITaskData
function createTaskData(overrides: {
	startTime?: number;
	executionTime?: number;
	executionStatus?:
		| 'success'
		| 'error'
		| 'canceled'
		| 'crashed'
		| 'new'
		| 'running'
		| 'unknown'
		| 'waiting';
	data?: ITaskDataConnections;
}): ITaskData {
	return {
		startTime: overrides.startTime ?? Date.now(),
		executionTime: overrides.executionTime ?? 10,
		executionStatus: overrides.executionStatus ?? 'success',
		executionIndex: 0,
		source: [],
		data: overrides.data,
	};
}

// Helper to create node execution data
function createNodeData(json: IDataObject): ITaskDataConnections {
	return { main: [[{ json }]] };
}

describe('mergeWorkflowStepResult', () => {
	it('should merge new node outputs into empty state', () => {
		const emptyState = createRunExecutionData();

		const stepResult: ExecuteWorkflowStepOutput = {
			complete: false,
			newRunData: {
				setNode: [
					createTaskData({
						startTime: 1000,
						executionTime: 50,
						data: createNodeData({ value: 1 }),
					}),
				],
			},
			executionData: {
				nodeExecutionStack: [],
				waitingExecution: {},
				waitingExecutionSource: null,
			},
			lastNodeExecuted: 'setNode',
		};

		const merged = mergeWorkflowStepResult(emptyState, stepResult);

		expect(merged.resultData.runData.setNode).toBeDefined();
		expect(merged.resultData.runData.setNode).toHaveLength(1);
		expect(merged.resultData.lastNodeExecuted).toBe('setNode');
	});

	it('should merge additional outputs preserving existing data', () => {
		const existingState = createRunExecutionData({
			resultData: {
				runData: {
					start: [createTaskData({ startTime: 1000, executionTime: 10, data: createNodeData({}) })],
				},
				lastNodeExecuted: 'start',
			},
		});

		const stepResult: ExecuteWorkflowStepOutput = {
			complete: false,
			newRunData: {
				httpRequest: [
					createTaskData({
						startTime: 2000,
						executionTime: 100,
						data: createNodeData({ response: 'ok' }),
					}),
				],
			},
			executionData: {
				nodeExecutionStack: [],
				waitingExecution: {},
				waitingExecutionSource: null,
			},
			lastNodeExecuted: 'httpRequest',
		};

		const merged = mergeWorkflowStepResult(existingState, stepResult);

		// Original node preserved
		expect(merged.resultData.runData.start).toBeDefined();
		expect(merged.resultData.runData.start).toHaveLength(1);

		// New node added
		expect(merged.resultData.runData.httpRequest).toBeDefined();
		expect(merged.resultData.runData.httpRequest).toHaveLength(1);

		// lastNodeExecuted updated
		expect(merged.resultData.lastNodeExecuted).toBe('httpRequest');
	});

	it('should handle waitTill correctly', () => {
		const emptyState = createRunExecutionData();
		const waitTime = Date.now() + 60000;

		const stepResult: ExecuteWorkflowStepOutput = {
			complete: false,
			newRunData: {
				waitNode: [createTaskData({ startTime: 1000, executionTime: 10 })],
			},
			executionData: {
				nodeExecutionStack: [],
				waitingExecution: {},
				waitingExecutionSource: null,
			},
			waitTill: waitTime,
		};

		const merged = mergeWorkflowStepResult(emptyState, stepResult);

		expect(merged.waitTill).toBeDefined();
		expect(merged.waitTill?.getTime()).toBe(waitTime);
	});

	it('should append task data for nodes that execute multiple times', () => {
		const existingState = createRunExecutionData({
			resultData: {
				runData: {
					loopNode: [
						createTaskData({
							startTime: 1000,
							executionTime: 10,
							data: createNodeData({ iteration: 1 }),
						}),
					],
				},
			},
		});

		const stepResult: ExecuteWorkflowStepOutput = {
			complete: false,
			newRunData: {
				loopNode: [
					createTaskData({
						startTime: 2000,
						executionTime: 10,
						data: createNodeData({ iteration: 2 }),
					}),
				],
			},
			executionData: {
				nodeExecutionStack: [],
				waitingExecution: {},
				waitingExecutionSource: null,
			},
		};

		const merged = mergeWorkflowStepResult(existingState, stepResult);

		expect(merged.resultData.runData.loopNode).toHaveLength(2);

		const firstRunData = merged.resultData.runData.loopNode[0].data?.main[0]?.[0]?.json;
		const secondRunData = merged.resultData.runData.loopNode[1].data?.main[0]?.[0]?.json;
		expect(firstRunData).toEqual({ iteration: 1 });
		expect(secondRunData).toEqual({ iteration: 2 });
	});
});

describe('getExecutedNodeNames', () => {
	it('should return empty array for empty state', () => {
		const empty = createRunExecutionData();
		expect(getExecutedNodeNames(empty)).toEqual([]);
	});

	it('should return node names that have been executed', () => {
		const state = createRunExecutionData({
			resultData: {
				runData: {
					start: [],
					setNode: [],
					httpRequest: [],
				},
			},
		});

		const names = getExecutedNodeNames(state);
		expect(names).toContain('start');
		expect(names).toContain('setNode');
		expect(names).toContain('httpRequest');
		expect(names).toHaveLength(3);
	});
});
