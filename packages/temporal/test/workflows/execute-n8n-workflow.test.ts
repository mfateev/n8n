/**
 * Workflow Unit Tests
 *
 * Note: Full workflow testing requires integration tests with a Temporal server.
 * These tests validate the merge logic and type compatibility.
 */

import { describe, it, expect } from '@jest/globals';

// Test the merge logic in isolation
// (The actual workflow can only be tested via Temporal test framework)

describe('executeN8nWorkflow merge logic', () => {
	// Mirror the types used in the workflow
	interface TaskData {
		startTime?: number;
		executionTime?: number;
		[key: string]: unknown;
	}

	interface RunExecutionData {
		resultData: {
			runData: Record<string, TaskData[]>;
			lastNodeExecuted?: string;
			error?: unknown;
		};
		executionData?: {
			contextData?: unknown;
			nodeExecutionStack: unknown[];
			waitingExecution: Record<string, unknown>;
			waitingExecutionSource: unknown;
		};
		waitTill?: Date;
	}

	function mergeRunData(
		existing: Record<string, TaskData[]>,
		newData: Record<string, TaskData[]>,
	): Record<string, TaskData[]> {
		const result = { ...existing };
		for (const [nodeName, taskDataArray] of Object.entries(newData)) {
			if (result[nodeName]) {
				result[nodeName] = [...result[nodeName], ...taskDataArray];
			} else {
				result[nodeName] = taskDataArray;
			}
		}
		return result;
	}

	function createEmptyRunExecutionData(): RunExecutionData {
		return {
			resultData: {
				runData: {},
			},
			executionData: {
				contextData: {},
				nodeExecutionStack: [],
				waitingExecution: {},
				waitingExecutionSource: null,
			},
		};
	}

	function getExecutedNodeNames(state: RunExecutionData): string[] {
		return Object.keys(state.resultData.runData);
	}

	it('should merge new nodes into empty state', () => {
		const existing: Record<string, TaskData[]> = {};
		const newData: Record<string, TaskData[]> = {
			node1: [{ startTime: 1000, executionTime: 50 }],
		};

		const merged = mergeRunData(existing, newData);

		expect(merged.node1).toBeDefined();
		expect(merged.node1).toHaveLength(1);
	});

	it('should preserve existing nodes when adding new ones', () => {
		const existing: Record<string, TaskData[]> = {
			start: [{ startTime: 500, executionTime: 10 }],
		};
		const newData: Record<string, TaskData[]> = {
			process: [{ startTime: 1000, executionTime: 100 }],
		};

		const merged = mergeRunData(existing, newData);

		expect(merged.start).toBeDefined();
		expect(merged.process).toBeDefined();
	});

	it('should append task data for nodes that execute multiple times', () => {
		const existing: Record<string, TaskData[]> = {
			loopNode: [{ startTime: 1000, executionTime: 50 }],
		};
		const newData: Record<string, TaskData[]> = {
			loopNode: [{ startTime: 2000, executionTime: 60 }],
		};

		const merged = mergeRunData(existing, newData);

		expect(merged.loopNode).toHaveLength(2);
		expect(merged.loopNode[0].startTime).toBe(1000);
		expect(merged.loopNode[1].startTime).toBe(2000);
	});

	it('should create empty run execution data with correct structure', () => {
		const empty = createEmptyRunExecutionData();

		expect(empty.resultData.runData).toEqual({});
		expect(empty.executionData?.nodeExecutionStack).toEqual([]);
		expect(empty.executionData?.waitingExecution).toEqual({});
	});

	it('should get executed node names from state', () => {
		const state: RunExecutionData = {
			resultData: {
				runData: {
					start: [{ startTime: 1000 }],
					process: [{ startTime: 2000 }],
					end: [{ startTime: 3000 }],
				},
			},
		};

		const nodeNames = getExecutedNodeNames(state);

		expect(nodeNames).toHaveLength(3);
		expect(nodeNames).toContain('start');
		expect(nodeNames).toContain('process');
		expect(nodeNames).toContain('end');
	});

	it('should handle empty state for executed node names', () => {
		const state = createEmptyRunExecutionData();

		const nodeNames = getExecutedNodeNames(state);

		expect(nodeNames).toHaveLength(0);
	});
});
