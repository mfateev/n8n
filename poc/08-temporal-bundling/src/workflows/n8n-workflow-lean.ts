/**
 * POC 8: Lean Temporal Workflow
 *
 * Only imports from n8n-workflow (not n8n-core) for minimal bundle size.
 * Orchestration logic is implemented here instead of using WorkflowExecute.
 */

import { proxyActivities } from '@temporalio/workflow';

// Only import from n8n-workflow - no n8n-core to avoid pulling in heavy deps
import {
	Workflow,
	NodeHelpers,
	type INode,
	type INodeType,
	type INodeTypes,
	type IConnections,
	type INodeExecutionData,
	NodeConnectionTypes,
} from 'n8n-workflow';

import type { ExecuteNodeInput, ExecuteNodeOutput } from '../activities/index.js';

// Proxy activities
const activities = proxyActivities<{
	executeNode: (input: ExecuteNodeInput) => Promise<ExecuteNodeOutput>;
}>({
	startToCloseTimeout: '5 minutes',
});

export interface N8nWorkflowLeanInput {
	workflowId: string;
	workflowName: string;
	nodes: INode[];
	connections: IConnections;
	settings?: Record<string, unknown>;
	inputData?: INodeExecutionData[];
}

export interface N8nWorkflowLeanOutput {
	success: boolean;
	nodeResults: Record<string, {
		data: INodeExecutionData[] | null;
		error?: string;
	}>;
	error?: string;
}

/**
 * Proxy INodeTypes for workflow instantiation
 */
class ProxyNodeTypes implements INodeTypes {
	getByName(nodeType: string): INodeType {
		return this.getByNameAndVersion(nodeType);
	}

	getByNameAndVersion(nodeType: string, _version?: number): INodeType {
		return {
			description: {
				displayName: nodeType,
				name: nodeType,
				group: ['transform'],
				version: 1,
				description: 'Proxy node',
				defaults: { name: nodeType },
				inputs: [NodeConnectionTypes.Main],
				outputs: [NodeConnectionTypes.Main],
				properties: [],
			},
		} as INodeType;
	}

	getKnownTypes() {
		return { nodes: {}, credentials: {} };
	}
}

/**
 * Find start node (node with no incoming connections)
 */
function findStartNode(nodes: INode[], connections: IConnections): string | null {
	const nodesWithIncoming = new Set<string>();

	for (const sourceConns of Object.values(connections)) {
		const mainConns = sourceConns[NodeConnectionTypes.Main];
		if (mainConns) {
			for (const outputs of mainConns) {
				if (outputs) {
					for (const conn of outputs) {
						if (conn?.node) {
							nodesWithIncoming.add(conn.node);
						}
					}
				}
			}
		}
	}

	for (const node of nodes) {
		if (!nodesWithIncoming.has(node.name)) {
			return node.name;
		}
	}

	return nodes[0]?.name ?? null;
}

/**
 * Get next nodes from connections
 */
function getNextNodes(currentNodeName: string, connections: IConnections): string[] {
	const sourceConns = connections[currentNodeName];
	if (!sourceConns) return [];

	const mainConns = sourceConns[NodeConnectionTypes.Main];
	if (!mainConns) return [];

	const nextNodes: string[] = [];
	for (const outputs of mainConns) {
		if (outputs) {
			for (const conn of outputs) {
				if (conn?.node) {
					nextNodes.push(conn.node);
				}
			}
		}
	}
	return nextNodes;
}

/**
 * Execute n8n workflow with lean orchestration
 */
export async function executeN8nWorkflowLean(
	input: N8nWorkflowLeanInput,
): Promise<N8nWorkflowLeanOutput> {
	console.log(`[Workflow] Starting lean workflow: ${input.workflowName}`);

	const nodeResults: N8nWorkflowLeanOutput['nodeResults'] = {};
	const nodeMap = new Map(input.nodes.map((n) => [n.name, n]));

	// Build run execution data for expression resolution
	const runExecutionData = {
		startData: {},
		resultData: {
			runData: {} as Record<string, Array<{ data: { main: INodeExecutionData[][] } }>>,
		},
		executionData: {
			nodeExecutionStack: [],
			waitingExecution: {},
			waitingExecutionSource: null,
		},
	};

	// Create workflow instance for validation and graph analysis
	const nodeTypes = new ProxyNodeTypes();
	const workflow = new Workflow({
		id: input.workflowId,
		name: input.workflowName,
		nodes: input.nodes,
		connections: input.connections,
		nodeTypes: nodeTypes as INodeTypes,
		active: false,
		settings: input.settings,
	});

	console.log('[Workflow] Workflow:', typeof Workflow);
	console.log('[Workflow] NodeHelpers:', typeof NodeHelpers);

	// Find start node
	const startNodeName = findStartNode(input.nodes, input.connections);
	if (!startNodeName) {
		return { success: false, nodeResults: {}, error: 'No start node found' };
	}

	// Simple BFS execution
	const executionQueue: string[] = [startNodeName];
	const executed = new Set<string>();
	let currentInputData: INodeExecutionData[] = input.inputData ?? [{ json: {} }];

	while (executionQueue.length > 0) {
		const nodeName = executionQueue.shift()!;

		if (executed.has(nodeName)) continue;

		const node = nodeMap.get(nodeName);
		if (!node) {
			console.log(`[Workflow] Node not found: ${nodeName}`);
			continue;
		}

		console.log(`[Workflow] Executing node: ${nodeName} (${node.type})`);

		// Execute via Activity
		const result = await activities.executeNode({
			node: node as never,
			inputData: { main: [currentInputData as never] },
			runExecutionData: runExecutionData as never,
			runIndex: 0,
			workflowId: input.workflowId,
			workflowName: input.workflowName,
			workflowNodes: input.nodes as never,
			workflowConnections: input.connections as never,
			workflowSettings: input.settings,
			executeData: {
				node: node as never,
				data: { main: [currentInputData as never] },
				source: null,
			},
		});

		// Store result
		nodeResults[nodeName] = {
			data: result.outputData?.[0] as INodeExecutionData[] | null,
			error: result.error?.message,
		};

		// Update run data for expression resolution
		if (result.outputData) {
			runExecutionData.resultData.runData[nodeName] = [{
				data: { main: result.outputData as INodeExecutionData[][] },
			}];
			currentInputData = (result.outputData[0] as INodeExecutionData[]) ?? [{ json: {} }];
		}

		if (result.error) {
			return {
				success: false,
				nodeResults,
				error: `Node ${nodeName} failed: ${result.error.message}`,
			};
		}

		executed.add(nodeName);

		// Queue next nodes
		const nextNodes = getNextNodes(nodeName, input.connections);
		for (const nextNode of nextNodes) {
			if (!executed.has(nextNode)) {
				executionQueue.push(nextNode);
			}
		}
	}

	console.log(`[Workflow] Workflow completed successfully`);

	return { success: true, nodeResults };
}
