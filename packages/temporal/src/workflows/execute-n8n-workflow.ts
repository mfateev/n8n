/**
 * Execute n8n Workflow - Temporal Workflow
 *
 * This is a minimal orchestration loop that calls the executeWorkflowStep Activity
 * until the workflow completes. It runs in Temporal's V8 sandbox.
 *
 * IMPORTANT: This file MUST NOT import from n8n packages (n8n-core, n8n-workflow, etc.)
 * because they cannot execute in Temporal's deterministic V8 sandbox.
 *
 * Design Pattern:
 * 1. Activity receives full state (Local Activity inputs NOT in history)
 * 2. Activity returns DIFF only (minimizes history size)
 * 3. Workflow merges diff into accumulated state
 * 4. Loop continues until complete or Wait node
 */

import type { Sinks } from '@temporalio/workflow';
import { proxyLocalActivities, proxySinks, sleep } from '@temporalio/workflow';

// Import only TYPES from our package (no runtime imports)
import type { ExecuteWorkflowStepInput, ExecuteWorkflowStepOutput } from '../types/activity-types';
import type { ExecuteN8nWorkflowInput, ExecuteN8nWorkflowOutput } from '../types/workflow-types';

// Sink interface for completion tracking (must match worker-side definition)
// Extends Sinks (Record<string, Sink>) to satisfy type constraints
interface CompletionTrackerSinks extends Sinks {
	completionTracker: {
		trackCompletion(status: 'success' | 'failure' | 'error'): void;
	};
}

// Proxy sinks for completion tracking (no-op if not injected)
const { completionTracker } = proxySinks<CompletionTrackerSinks>();

// Type definition for the activities interface
interface Activities {
	executeWorkflowStep(input: ExecuteWorkflowStepInput): Promise<ExecuteWorkflowStepOutput>;
}

/**
 * Proxy Local Activities
 *
 * Using Local Activities because:
 * - Inputs are NOT stored in Temporal history (critical for passing full state)
 * - Faster execution (no separate scheduling)
 * - Still get Activity retry semantics
 */
const activities = proxyLocalActivities<Activities>({
	startToCloseTimeout: '10 minutes',
	localRetryThreshold: '1 minute',
	retry: {
		maximumAttempts: 3,
		initialInterval: '1s',
		maximumInterval: '1m',
		backoffCoefficient: 2,
	},
});

/**
 * Execute an n8n workflow via Temporal
 *
 * This workflow:
 * 1. Calls executeWorkflowStep Activity in a loop
 * 2. Merges diff results into accumulated state
 * 3. Handles Wait nodes via Temporal's durable sleep
 * 4. Returns final output when complete
 */
export async function executeN8nWorkflow(
	input: ExecuteN8nWorkflowInput,
): Promise<ExecuteN8nWorkflowOutput> {
	// Initialize execution state
	// Note: We maintain state here in the workflow, not importing createRunExecutionData
	let runExecutionData = createEmptyRunExecutionData();
	let previouslyExecutedNodes: string[] = [];

	// Orchestration loop - calls Activity until workflow completes
	while (true) {
		const result = await activities.executeWorkflowStep({
			workflowDefinition: {
				id: input.workflowId,
				name: input.workflowName,
				nodes: input.nodes,
				connections: input.connections,
				settings: input.settings,
				staticData: input.staticData,
			},
			runExecutionData: runExecutionData as unknown as ExecuteWorkflowStepInput['runExecutionData'],
			inputData: input.inputData,
			previouslyExecutedNodes,
		});

		// Merge diff into accumulated state
		runExecutionData = mergeWorkflowStepResult(runExecutionData, result);

		// Update the set of executed nodes for next iteration
		previouslyExecutedNodes = getExecutedNodeNames(runExecutionData);

		// Check for completion
		if (result.complete) {
			// Notify completion tracker sink (for exit-on-complete mode)
			const status = result.error ? 'error' : 'success';
			completionTracker.trackCompletion(status);

			return {
				success: !result.error,
				data: result.finalOutput,
				error: result.error,
				runExecutionData:
					runExecutionData as unknown as ExecuteN8nWorkflowOutput['runExecutionData'],
				status,
			};
		}

		// Handle Wait node - use Temporal's durable sleep
		if (result.waitTill) {
			const waitMs = result.waitTill - Date.now();
			if (waitMs > 0) {
				// This sleep is durable - survives worker restarts
				await sleep(waitMs);
			}
			// Clear waitTill after sleeping
			runExecutionData.waitTill = undefined;
		}

		// Continue to next step
	}
}

// ============================================================================
// Helper functions (inline because we can't import from n8n packages)
// These mirror the logic in ../utils/state-merge.ts but are standalone
// ============================================================================

interface TaskData {
	startTime?: number;
	executionTime?: number;
	executionStatus?: string;
	data?: unknown;
	error?: unknown;
	[key: string]: unknown;
}

interface RunExecutionData {
	version?: number;
	startData?: unknown;
	resultData: {
		runData: Record<string, TaskData[]>;
		pinData?: unknown;
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

function createEmptyRunExecutionData(): RunExecutionData {
	return {
		version: 1,
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

function mergeWorkflowStepResult(
	currentState: RunExecutionData,
	stepResult: ExecuteWorkflowStepOutput,
): RunExecutionData {
	// Merge newRunData into existing runData
	const mergedRunData: Record<string, TaskData[]> = { ...currentState.resultData.runData };

	for (const [nodeName, taskDataArray] of Object.entries(stepResult.newRunData)) {
		if (mergedRunData[nodeName]) {
			// Append to existing node data (cast needed for V8 sandbox compatibility)
			mergedRunData[nodeName] = [
				...mergedRunData[nodeName],
				...(taskDataArray as unknown as TaskData[]),
			];
		} else {
			// New node (cast needed for V8 sandbox compatibility)
			mergedRunData[nodeName] = taskDataArray as unknown as TaskData[];
		}
	}

	return {
		...currentState,
		resultData: {
			...currentState.resultData,
			runData: mergedRunData,
			lastNodeExecuted: stepResult.lastNodeExecuted ?? currentState.resultData.lastNodeExecuted,
			error: stepResult.error ?? currentState.resultData.error,
		},
		executionData: {
			contextData: currentState.executionData?.contextData ?? {},
			nodeExecutionStack: stepResult.executionData.nodeExecutionStack,
			waitingExecution: stepResult.executionData.waitingExecution,
			waitingExecutionSource: stepResult.executionData.waitingExecutionSource,
		},
		...(stepResult.waitTill && { waitTill: new Date(stepResult.waitTill) }),
	};
}

function getExecutedNodeNames(state: RunExecutionData): string[] {
	return Object.keys(state.resultData.runData);
}
