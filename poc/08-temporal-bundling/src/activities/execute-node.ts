/**
 * POC 8: Node Execution Activity
 *
 * This Activity executes a single n8n node. All I/O happens here,
 * making the Workflow (which calls this) purely orchestration logic.
 */

import { Container } from '@n8n/di';
import { Logger } from '@n8n/backend-common';
import { mock } from 'jest-mock-extended';
import {
	Workflow,
	NodeHelpers,
	type INode,
	type INodeExecutionData,
	type INodeTypeData,
	type IRunExecutionData,
	type ITaskDataConnections,
	type IWorkflowExecuteAdditionalData,
	type IExecuteData,
	type IHttpRequestOptions,
} from 'n8n-workflow';
import { ExecuteContext } from 'n8n-core';

// Import actual node implementations
import { Set as SetNode } from 'n8n-nodes-base/dist/nodes/Set/Set.node.js';
import { Code } from 'n8n-nodes-base/dist/nodes/Code/Code.node.js';
import { NoOp } from 'n8n-nodes-base/dist/nodes/NoOp/NoOp.node.js';
import { ManualTrigger } from 'n8n-nodes-base/dist/nodes/ManualTrigger/ManualTrigger.node.js';

// Set up minimal DI
class MinimalLogger {
	error(message: string) {
		console.error('[ERROR]', message);
	}
	warn(message: string) {
		console.warn('[WARN]', message);
	}
	info(message: string) {
		console.info('[INFO]', message);
	}
	debug(_message: string) {
		// suppress debug
	}
	scoped(_scopes: string | string[]) {
		return this;
	}
}

// Register logger if not already
try {
	Container.get(Logger);
} catch {
	Container.set(Logger, new MinimalLogger() as unknown as Logger);
}

// Available node types
const nodeTypes: INodeTypeData = {
	'n8n-nodes-base.manualTrigger': {
		type: new ManualTrigger(),
		sourcePath: '',
	},
	'n8n-nodes-base.set': {
		type: new SetNode(),
		sourcePath: '',
	},
	'n8n-nodes-base.code': {
		type: new Code(),
		sourcePath: '',
	},
	'n8n-nodes-base.noOp': {
		type: new NoOp(),
		sourcePath: '',
	},
};

// Simple INodeTypes implementation
class ActivityNodeTypes {
	getByName(nodeType: string) {
		const data = nodeTypes[nodeType];
		if (!data) throw new Error(`Unknown node type: ${nodeType}`);
		return data.type;
	}

	getByNameAndVersion(nodeType: string, version?: number) {
		const data = nodeTypes[nodeType];
		if (!data) throw new Error(`Unknown node type: ${nodeType}`);
		return NodeHelpers.getVersionedNodeType(data.type, version);
	}

	getKnownTypes() {
		return { nodes: {}, credentials: {} };
	}
}

const activityNodeTypes = new ActivityNodeTypes();

/**
 * Input for the executeNode activity
 */
export interface ExecuteNodeInput {
	/** The node to execute */
	node: INode;

	/** Input data for the node */
	inputData: ITaskDataConnections;

	/** Current run execution data (for expressions referencing previous nodes) */
	runExecutionData: IRunExecutionData;

	/** Run index for this node */
	runIndex: number;

	/** Workflow definition (needed for Workflow instance) */
	workflowId: string;
	workflowName: string;
	workflowNodes: INode[];
	workflowConnections: Record<string, unknown>;
	workflowSettings?: Record<string, unknown>;

	/** Execute data for context */
	executeData: IExecuteData;
}

/**
 * Output from the executeNode activity
 */
export interface ExecuteNodeOutput {
	/** Output data from the node */
	outputData: INodeExecutionData[][] | null;

	/** Any error that occurred */
	error?: {
		message: string;
		stack?: string;
	};
}

/**
 * Execute a single n8n node
 *
 * This is a Temporal Activity - all I/O happens here.
 */
export async function executeNode(input: ExecuteNodeInput): Promise<ExecuteNodeOutput> {
	console.log(`[Activity] Executing node: ${input.node.name} (${input.node.type})`);

	try {
		// Create Workflow instance
		const workflow = new Workflow({
			id: input.workflowId,
			name: input.workflowName,
			nodes: input.workflowNodes,
			connections: input.workflowConnections as never,
			nodeTypes: activityNodeTypes as never,
			active: false,
			settings: input.workflowSettings,
		});

		// Get the node type
		const nodeType = activityNodeTypes.getByNameAndVersion(
			input.node.type,
			input.node.typeVersion,
		);

		// Prepare connection input data
		let connectionInputData: INodeExecutionData[] = [];
		if (input.inputData.main?.[0]) {
			connectionInputData = input.inputData.main[0];
		}

		// Create minimal additionalData
		const additionalData = mock<IWorkflowExecuteAdditionalData>({
			credentialsHelper: {
				getDecrypted: async () => ({}),
				authenticate: async (
					_creds: unknown,
					_type: string,
					requestOptions: IHttpRequestOptions,
				) => requestOptions,
				getCredentialsProperties: () => [],
				getParentTypes: () => [],
			} as never,
			executeWorkflow: async () => ({ data: [[]], executionId: 'sub-exec' }),
			restApiUrl: 'http://localhost:5678/rest',
			webhookBaseUrl: 'http://localhost:5678/webhook',
			webhookTestBaseUrl: 'http://localhost:5678/webhook-test',
			webhookWaitingBaseUrl: 'http://localhost:5678/webhook-waiting',
			currentNodeExecutionIndex: 0,
		});

		// Create ExecuteContext
		const context = new ExecuteContext(
			workflow,
			input.node,
			additionalData,
			'integrated',
			input.runExecutionData,
			input.runIndex,
			connectionInputData,
			input.inputData,
			input.executeData,
			[], // closeFunctions
		);

		// Execute the node
		if (!nodeType.execute) {
			// For trigger nodes, just return empty data to continue
			if (nodeType.trigger) {
				return {
					outputData: [[{ json: {} }]],
				};
			}
			throw new Error(`Node ${input.node.type} has no execute method`);
		}

		const result = await nodeType.execute.call(context);

		// Handle EngineRequest (AI agent nodes) - for POC we just treat as error
		if (result && 'requestType' in result) {
			throw new Error('EngineRequest not supported in POC');
		}

		const outputData = result as INodeExecutionData[][] | null;

		console.log(
			`[Activity] Node ${input.node.name} completed with ${outputData?.[0]?.length ?? 0} items`,
		);

		return {
			outputData,
		};
	} catch (error) {
		const err = error as Error;
		console.error(`[Activity] Node ${input.node.name} failed:`, err.message);
		return {
			outputData: null,
			error: {
				message: err.message,
				stack: err.stack,
			},
		};
	}
}
