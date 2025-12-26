/**
 * Workflow Types
 *
 * Type definitions for the executeN8nWorkflow Temporal workflow.
 * These types define the contract between clients and the workflow.
 */

import type {
	IConnections,
	INode,
	INodeExecutionData,
	IRunExecutionData,
	IWorkflowSettings,
} from 'n8n-workflow';

import type { SerializedError } from './serialized-error';

/**
 * Input for starting an n8n workflow execution via Temporal
 */
export interface ExecuteN8nWorkflowInput {
	/** Unique identifier for the workflow */
	workflowId: string;

	/** Human-readable workflow name */
	workflowName: string;

	/** Array of node definitions */
	nodes: INode[];

	/** Connection definitions between nodes */
	connections: IConnections;

	/** Optional workflow settings */
	settings?: IWorkflowSettings;

	/** Optional initial input data for the first node */
	inputData?: INodeExecutionData[];

	/** Optional static data for the workflow */
	staticData?: Record<string, unknown>;
}

/**
 * Output from a completed n8n workflow execution
 */
export interface ExecuteN8nWorkflowOutput {
	/** Whether the workflow completed successfully */
	success: boolean;

	/** Output data from the last executed node (if successful) */
	data?: INodeExecutionData[];

	/** Serialized error if the workflow failed */
	error?: SerializedError;

	/** Complete execution data for debugging/auditing */
	runExecutionData: IRunExecutionData;

	/** Execution status */
	status: 'success' | 'error' | 'waiting' | 'canceled';
}
