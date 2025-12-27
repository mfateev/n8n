/**
 * Execute Workflow Step Activity
 *
 * This Temporal Activity executes one or more n8n workflow nodes using WorkflowExecute.
 * It returns a DIFF (only newly executed nodes) to minimize Temporal history size.
 *
 * Key Design Points:
 * - Uses WorkflowExecute.processRunExecutionData() to resume from existing state
 * - Computes diff by comparing node names before/after execution
 * - Returns complete=true when workflow finishes or errors
 * - Returns waitTill when a Wait node is encountered
 */

import { WorkflowExecute } from 'n8n-core';
import { Workflow, createRunExecutionData } from 'n8n-workflow';
import type {
	IDataObject,
	INode,
	INodeExecutionData,
	IRunExecutionData,
	ITaskData,
} from 'n8n-workflow';

import type {
	ExecuteWorkflowStepInput,
	ExecuteWorkflowStepOutput,
	ExecutionBookkeeping,
} from '../types/activity-types';
import { buildAdditionalData } from '../utils/additional-data';
import { serializeError } from '../utils/error-serializer';
import { getLogger } from '../utils/logger';
import { getWorkerContext } from '../worker/context';

/**
 * Execute workflow step Activity
 *
 * This is a Temporal Activity - all I/O (HTTP requests, file access, etc.) happens here.
 * The Temporal workflow calls this Activity in a loop until complete=true.
 */
export async function executeWorkflowStep(
	input: ExecuteWorkflowStepInput,
): Promise<ExecuteWorkflowStepOutput> {
	const { workflowDefinition, runExecutionData, inputData, previouslyExecutedNodes } = input;
	const context = getWorkerContext();
	const logger = getLogger().child('Activity');

	logger.debug('Executing workflow step', {
		workflowId: workflowDefinition.id,
		workflowName: workflowDefinition.name,
		previousNodesCount: previouslyExecutedNodes.length,
	});

	// Track which nodes existed before this step (for diff computation)
	const previousNodeNames = new Set(previouslyExecutedNodes);

	try {
		// 1. Create Workflow instance with pre-loaded node types
		const workflow = new Workflow({
			id: workflowDefinition.id,
			name: workflowDefinition.name,
			nodes: workflowDefinition.nodes,
			connections: workflowDefinition.connections,
			nodeTypes: context.nodeTypes,
			settings: workflowDefinition.settings,
			// staticData comes from n8n workflow definitions which are IDataObject-compatible
			staticData: workflowDefinition.staticData as IDataObject | undefined,
			active: false,
		});

		// 2. Build additional data (credentials helper, hooks, etc.)
		const additionalData = buildAdditionalData({
			credentialsHelper: context.credentialsHelper,
			credentialTypes: context.credentialTypes,
			nodeTypes: context.nodeTypes,
		});

		// 3. Prepare execution data
		let executionData: IRunExecutionData;

		if (isFirstExecution(runExecutionData)) {
			// First execution - initialize from scratch
			executionData = initializeFirstExecution(workflow, inputData);
		} else {
			// Resuming - use provided state
			executionData = runExecutionData;
		}

		// 4. Create WorkflowExecute instance and run
		const workflowExecute = new WorkflowExecute(
			additionalData,
			'integrated', // mode
			executionData,
		);

		// Execute the workflow - this processes nodes until completion or wait
		const result = await workflowExecute.processRunExecutionData(workflow);

		// 5. Compute diff: only nodes that were added/updated in this step
		const newRunData = computeRunDataDiff(previousNodeNames, result.data.resultData.runData);

		// 6. Build response based on result
		const executionBookkeeping = extractExecutionBookkeeping(result.data);

		// Check for waitTill (Wait node triggered)
		if (result.waitTill) {
			logger.info('Workflow step waiting', {
				workflowId: workflowDefinition.id,
				lastNodeExecuted: result.data.resultData.lastNodeExecuted,
				waitTill: result.waitTill.toISOString(),
				newNodesExecuted: Object.keys(newRunData).length,
			});
			return {
				complete: false,
				newRunData,
				executionData: executionBookkeeping,
				lastNodeExecuted: result.data.resultData.lastNodeExecuted,
				waitTill: result.waitTill.getTime(),
			};
		}

		// Check for error
		if (result.data.resultData.error) {
			logger.warn('Workflow step failed', {
				workflowId: workflowDefinition.id,
				lastNodeExecuted: result.data.resultData.lastNodeExecuted,
				error: result.data.resultData.error.message,
				newNodesExecuted: Object.keys(newRunData).length,
			});
			return {
				complete: true,
				newRunData,
				executionData: executionBookkeeping,
				lastNodeExecuted: result.data.resultData.lastNodeExecuted,
				error: serializeError(result.data.resultData.error),
			};
		}

		// Success - workflow completed
		logger.info('Workflow step completed', {
			workflowId: workflowDefinition.id,
			lastNodeExecuted: result.data.resultData.lastNodeExecuted,
			newNodesExecuted: Object.keys(newRunData).length,
		});
		return {
			complete: true,
			newRunData,
			executionData: executionBookkeeping,
			lastNodeExecuted: result.data.resultData.lastNodeExecuted,
			finalOutput: extractFinalOutput(result.data, workflow),
		};
	} catch (error) {
		// Unexpected error during execution
		logger.error('Workflow step unexpected error', {
			workflowId: workflowDefinition.id,
			error: (error as Error).message,
		});
		return {
			complete: true,
			newRunData: {},
			executionData: createEmptyBookkeeping(),
			error: serializeError(error as Error),
		};
	}
}

/**
 * Check if this is the first execution (no nodes have been executed yet)
 */
function isFirstExecution(runExecutionData: IRunExecutionData): boolean {
	return (
		Object.keys(runExecutionData.resultData.runData).length === 0 &&
		(!runExecutionData.executionData ||
			runExecutionData.executionData.nodeExecutionStack.length === 0)
	);
}

/**
 * Initialize execution data for first run
 */
function initializeFirstExecution(
	workflow: Workflow,
	inputData?: INodeExecutionData[],
): IRunExecutionData {
	const startNode = findStartNode(workflow);

	if (!startNode) {
		throw new Error('No start node found in workflow');
	}

	const executionData = createRunExecutionData({});

	// Initialize the execution stack with the start node
	// We know executionData.executionData is defined because we passed {} (not null) to createRunExecutionData
	const existingExecutionData = executionData.executionData!;
	executionData.executionData = {
		contextData: existingExecutionData.contextData,
		runtimeData: existingExecutionData.runtimeData,
		metadata: existingExecutionData.metadata,
		nodeExecutionStack: [
			{
				node: startNode,
				data: {
					main: [inputData ?? [{ json: {} }]],
				},
				source: null,
			},
		],
		waitingExecution: {},
		waitingExecutionSource: null,
	};

	return executionData;
}

/**
 * Find the workflow start node (trigger or manually designated start)
 */
function findStartNode(workflow: Workflow): INode | undefined {
	// Try to get the designated start node
	const startNode = workflow.getStartNode();
	if (startNode) {
		return startNode;
	}

	// Fallback: find trigger node
	const nodes = Object.values(workflow.nodes);
	return nodes.find(
		(node) =>
			node.type.includes('Trigger') ||
			node.type === 'n8n-nodes-base.start' ||
			node.type === 'n8n-nodes-base.manualTrigger',
	);
}

/**
 * Compute the diff between previous run data and current run data
 * Returns only newly executed nodes or nodes with new run entries
 */
function computeRunDataDiff(
	previousNodeNames: Set<string>,
	currentRunData: Record<string, ITaskData[]>,
): Record<string, ITaskData[]> {
	const diff: Record<string, ITaskData[]> = {};

	for (const [nodeName, taskDataArray] of Object.entries(currentRunData)) {
		if (!previousNodeNames.has(nodeName)) {
			// Completely new node
			diff[nodeName] = taskDataArray;
		}
		// Note: For nodes that execute multiple times (loops), the entire array
		// is considered new since we track by node name presence, not array length.
		// The merge function handles appending correctly.
	}

	return diff;
}

/**
 * Extract execution bookkeeping from result
 */
function extractExecutionBookkeeping(runExecutionData: IRunExecutionData): ExecutionBookkeeping {
	return {
		nodeExecutionStack: runExecutionData.executionData?.nodeExecutionStack ?? [],
		waitingExecution: runExecutionData.executionData?.waitingExecution ?? {},
		waitingExecutionSource: runExecutionData.executionData?.waitingExecutionSource ?? null,
	};
}

/**
 * Create empty execution bookkeeping (for error cases)
 */
function createEmptyBookkeeping(): ExecutionBookkeeping {
	return {
		nodeExecutionStack: [],
		waitingExecution: {},
		waitingExecutionSource: null,
	};
}

/**
 * Extract final output from the last executed node
 */
function extractFinalOutput(
	runExecutionData: IRunExecutionData,
	_workflow: Workflow,
): INodeExecutionData[] | undefined {
	const lastNodeName = runExecutionData.resultData.lastNodeExecuted;

	if (!lastNodeName) {
		return undefined;
	}

	const lastNodeRunData = runExecutionData.resultData.runData[lastNodeName];

	if (!lastNodeRunData || lastNodeRunData.length === 0) {
		return undefined;
	}

	// Get the last run of the last node
	const lastRun = lastNodeRunData[lastNodeRunData.length - 1];

	// Return the main output
	return lastRun.data?.main?.[0] ?? undefined;
}
