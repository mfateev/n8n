/**
 * Activity Types
 *
 * Type definitions for the executeWorkflowStep Temporal activity.
 * The activity uses a diff-based output pattern to minimize Temporal history size.
 *
 * Key Design Points:
 * - Input: Full IRunExecutionData (needed for expression evaluation)
 * - Output: Diff only (newly executed nodes)
 * - Local Activity inputs are NOT stored in Temporal history
 */

import type {
	IConnections,
	IExecuteData,
	INode,
	INodeExecutionData,
	IRunExecutionData,
	ITaskData,
	IWaitingForExecution,
	IWaitingForExecutionSource,
	IWorkflowSettings,
} from 'n8n-workflow';

import type { SerializedError } from './serialized-error';

/**
 * Workflow definition passed to the activity
 * Contains all static workflow information
 */
export interface WorkflowDefinition {
	id: string;
	name: string;
	nodes: INode[];
	connections: IConnections;
	settings?: IWorkflowSettings;
	staticData?: Record<string, unknown>;
}

/**
 * Input for the executeWorkflowStep activity
 *
 * Note: Full runExecutionData is passed because:
 * 1. Expression evaluation needs access to all previous node outputs
 * 2. Local Activity inputs are NOT stored in Temporal history
 */
export interface ExecuteWorkflowStepInput {
	/** Static workflow definition */
	workflowDefinition: WorkflowDefinition;

	/** Current execution state (full state for expression evaluation) */
	runExecutionData: IRunExecutionData;

	/** Initial input data (only used on first activity call) */
	inputData?: INodeExecutionData[];

	/** Set of node names that were already executed (for diff computation) */
	previouslyExecutedNodes: string[];
}

/**
 * Execution bookkeeping data
 * Always returned in full (small size, needed for orchestration)
 */
export interface ExecutionBookkeeping {
	/** Nodes waiting to be executed */
	nodeExecutionStack: IExecuteData[];

	/** Nodes waiting for data from other branches (e.g., Merge node) */
	waitingExecution: IWaitingForExecution;

	/** Source tracking for waiting executions */
	waitingExecutionSource: IWaitingForExecutionSource | null;
}

/**
 * Output from the executeWorkflowStep activity
 *
 * Returns a DIFF, not full state:
 * - newRunData: Only nodes executed in this step
 * - executionData: Full bookkeeping (always small)
 *
 * This minimizes Temporal history size since only outputs are recorded.
 */
export interface ExecuteWorkflowStepOutput {
	/** Whether the workflow has completed (no more nodes to execute) */
	complete: boolean;

	/** Diff: Only newly executed nodes' data from this step */
	newRunData: Record<string, ITaskData[]>;

	/** Full execution bookkeeping state */
	executionData: ExecutionBookkeeping;

	/** Name of the last node that was executed */
	lastNodeExecuted?: string;

	/** Unix timestamp if a Wait node triggered (workflow should sleep) */
	waitTill?: number;

	/** Serialized error if execution failed */
	error?: SerializedError;

	/** Final output data if workflow completed successfully */
	finalOutput?: INodeExecutionData[];
}
