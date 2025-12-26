/**
 * Execution Data Utilities
 *
 * Utilities for creating and manipulating IRunExecutionData structures.
 * These are used to initialize workflow execution state.
 */

import type { INode, INodeExecutionData, IRunExecutionData } from 'n8n-workflow';
import { createRunExecutionData } from 'n8n-workflow';

/**
 * Create an empty IRunExecutionData structure for starting a new workflow execution.
 *
 * This initializes all required nested structures:
 * - resultData.runData: {}
 * - executionData.nodeExecutionStack: []
 * - executionData.waitingExecution: {}
 * - executionData.waitingExecutionSource: null
 * - executionData.contextData: {}
 * - executionData.metadata: {}
 *
 * @returns A properly initialized empty IRunExecutionData
 */
export function createEmptyExecutionData(): IRunExecutionData {
	return createRunExecutionData({});
}

/**
 * Create execution data initialized with a start node on the execution stack.
 *
 * This is the typical setup for beginning workflow execution where we have
 * a designated start node and optional initial input data.
 *
 * @param startNode - The node to begin execution from
 * @param inputData - Optional initial input data (defaults to empty JSON object)
 * @returns IRunExecutionData with the start node on the execution stack
 */
export function createExecutionDataWithStartNode(
	startNode: INode,
	inputData?: INodeExecutionData[],
): IRunExecutionData {
	const defaultInputData: INodeExecutionData[] = [{ json: {} }];

	return createRunExecutionData({
		executionData: {
			nodeExecutionStack: [
				{
					node: startNode,
					data: {
						main: [inputData ?? defaultInputData],
					},
					source: null,
				},
			],
			waitingExecution: {},
			waitingExecutionSource: null,
			contextData: {},
			metadata: {},
		},
	});
}

/**
 * Check if the execution data represents a first/fresh execution.
 *
 * A first execution is one where:
 * - No nodes have been executed yet (runData is empty)
 * - The execution stack is empty (no pending nodes)
 *
 * @param runExecutionData - The execution data to check
 * @returns true if this is a first execution, false otherwise
 */
export function isFirstExecution(runExecutionData: IRunExecutionData): boolean {
	const hasNoRunData = Object.keys(runExecutionData.resultData.runData).length === 0;
	const hasNoExecutionStack =
		!runExecutionData.executionData ||
		runExecutionData.executionData.nodeExecutionStack.length === 0;

	return hasNoRunData && hasNoExecutionStack;
}

// Note: getExecutedNodeNames is exported from './state-merge' to avoid duplication

/**
 * Check if the execution has completed.
 *
 * Execution is complete when:
 * - There are no more nodes on the execution stack
 * - There are no nodes waiting for execution
 *
 * @param runExecutionData - The execution data to check
 * @returns true if execution is complete, false otherwise
 */
export function isExecutionComplete(runExecutionData: IRunExecutionData): boolean {
	if (!runExecutionData.executionData) {
		return true;
	}

	const hasNoStack = runExecutionData.executionData.nodeExecutionStack.length === 0;
	const hasNoWaiting = Object.keys(runExecutionData.executionData.waitingExecution).length === 0;

	return hasNoStack && hasNoWaiting;
}

/**
 * Check if the execution is in a waiting state (Wait node triggered).
 *
 * @param runExecutionData - The execution data to check
 * @returns true if waiting, false otherwise
 */
export function isExecutionWaiting(runExecutionData: IRunExecutionData): boolean {
	return runExecutionData.waitTill !== undefined;
}
