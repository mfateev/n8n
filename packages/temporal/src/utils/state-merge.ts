/**
 * State Merge Utility
 *
 * Merges Activity diff results into accumulated workflow state.
 * The Activity returns only newly executed nodes (diff pattern),
 * and this function combines them with existing state.
 */

import type { IRunExecutionData, ITaskData } from 'n8n-workflow';

import type { ExecuteWorkflowStepOutput } from '../types/activity-types';

/**
 * Merge an Activity's diff result into the accumulated execution state
 *
 * @param currentState - The accumulated state from previous Activity calls
 * @param stepResult - The diff result from the latest Activity call
 * @returns Updated IRunExecutionData with merged results
 *
 * @example
 * ```typescript
 * let state = createEmptyRunExecutionData();
 *
 * while (!result.complete) {
 *   result = await activities.executeWorkflowStep({ runExecutionData: state, ... });
 *   state = mergeWorkflowStepResult(state, result);
 * }
 * ```
 */
export function mergeWorkflowStepResult(
	currentState: IRunExecutionData,
	stepResult: ExecuteWorkflowStepOutput,
): IRunExecutionData {
	// Merge newRunData into existing runData
	const mergedRunData = mergeRunData(currentState.resultData.runData, stepResult.newRunData);

	// Build the merged state - we cast to IRunExecutionData since we're merging
	// compatible structures from the activity result
	const merged = {
		...currentState,
		resultData: {
			...currentState.resultData,
			runData: mergedRunData,
			lastNodeExecuted: stepResult.lastNodeExecuted ?? currentState.resultData.lastNodeExecuted,
		},
		executionData: currentState.executionData
			? {
					...currentState.executionData,
					nodeExecutionStack: stepResult.executionData.nodeExecutionStack,
					waitingExecution: stepResult.executionData.waitingExecution,
					waitingExecutionSource: stepResult.executionData.waitingExecutionSource,
				}
			: undefined,
	} as IRunExecutionData;

	// Set waitTill if Activity returned it
	if (stepResult.waitTill) {
		merged.waitTill = new Date(stepResult.waitTill);
	}

	return merged;
}

/**
 * Merge new run data into existing run data
 *
 * Handles two cases:
 * 1. New node: Simply add to runData
 * 2. Existing node with new runs: Append new task data
 */
function mergeRunData(
	existing: Record<string, ITaskData[]>,
	newData: Record<string, ITaskData[]>,
): Record<string, ITaskData[]> {
	const result = { ...existing };

	for (const [nodeName, taskDataArray] of Object.entries(newData)) {
		if (result[nodeName]) {
			// Existing node - append new task data
			result[nodeName] = [...result[nodeName], ...taskDataArray];
		} else {
			// New node - add directly
			result[nodeName] = taskDataArray;
		}
	}

	return result;
}

/**
 * Get the set of node names that have been executed
 * Used to compute the diff in subsequent Activity calls
 */
export function getExecutedNodeNames(state: IRunExecutionData): string[] {
	return Object.keys(state.resultData.runData);
}
