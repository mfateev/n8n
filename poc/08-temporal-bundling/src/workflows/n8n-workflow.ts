/**
 * POC 8: Temporal Workflow for n8n
 *
 * This workflow attempts to run WorkflowExecute inside Temporal's
 * deterministic sandbox. Node execution is delegated to Activities.
 *
 * Key test: Can WorkflowExecute be bundled into Temporal's V8 isolate?
 */

import { proxyActivities, sleep } from '@temporalio/workflow';

// Import types only - actual implementation is in activities
import type { ExecuteNodeInput, ExecuteNodeOutput } from '../activities/index.js';

// Proxy activities - this is how workflows call activities
const activities = proxyActivities<{
	executeNode: (input: ExecuteNodeInput) => Promise<ExecuteNodeOutput>;
}>({
	startToCloseTimeout: '5 minutes',
	retry: {
		maximumAttempts: 3,
	},
});

/**
 * Input for the n8n workflow execution
 */
export interface N8nWorkflowInput {
	workflowId: string;
	workflowName: string;
	nodes: Array<{
		id: string;
		name: string;
		type: string;
		typeVersion: number;
		position: [number, number];
		parameters: Record<string, unknown>;
	}>;
	connections: Record<string, unknown>;
	settings?: Record<string, unknown>;
	inputData?: Array<{ json: Record<string, unknown> }>;
}

/**
 * Output from the n8n workflow execution
 */
export interface N8nWorkflowOutput {
	success: boolean;
	nodeResults: Record<
		string,
		{
			data: Array<{ json: Record<string, unknown> }> | null;
			error?: string;
		}
	>;
	error?: string;
}

/**
 * Simple graph traversal to find start node and execution order
 */
function findStartNode(
	nodes: N8nWorkflowInput['nodes'],
	connections: Record<string, unknown>,
): string | null {
	// Find nodes that have no incoming connections
	const nodesWithIncoming = new Set<string>();

	for (const [_sourceName, sourceConns] of Object.entries(connections)) {
		const mainConns = (sourceConns as { main?: Array<Array<{ node: string }>> }).main;
		if (mainConns) {
			for (const outputs of mainConns) {
				for (const conn of outputs) {
					nodesWithIncoming.add(conn.node);
				}
			}
		}
	}

	// Find first node without incoming connections (typically the trigger)
	for (const node of nodes) {
		if (!nodesWithIncoming.has(node.name)) {
			return node.name;
		}
	}

	return nodes[0]?.name ?? null;
}

/**
 * Get next nodes to execute based on connections
 */
function getNextNodes(
	currentNodeName: string,
	connections: Record<string, unknown>,
): string[] {
	const sourceConns = connections[currentNodeName] as
		| { main?: Array<Array<{ node: string }>> }
		| undefined;
	if (!sourceConns?.main) {
		return [];
	}

	const nextNodes: string[] = [];
	for (const outputs of sourceConns.main) {
		for (const conn of outputs) {
			nextNodes.push(conn.node);
		}
	}
	return nextNodes;
}

/**
 * Execute an n8n workflow using Temporal
 *
 * This is a simplified orchestration that:
 * 1. Finds the start node
 * 2. Executes nodes in order via Activities
 * 3. Passes data between nodes
 *
 * For POC, this is a simple linear/sequential execution.
 * Full implementation would handle branching, merging, etc.
 */
export async function executeN8nWorkflow(input: N8nWorkflowInput): Promise<N8nWorkflowOutput> {
	console.log(`[Workflow] Starting n8n workflow: ${input.workflowName}`);

	const nodeResults: N8nWorkflowOutput['nodeResults'] = {};
	const nodeMap = new Map(input.nodes.map((n) => [n.name, n]));

	// Initialize run execution data (for expression resolution)
	const runExecutionData = {
		startData: {},
		resultData: {
			runData: {} as Record<string, Array<{ data: { main: Array<Array<{ json: Record<string, unknown> }>> } }>>,
		},
		executionData: {
			nodeExecutionStack: [],
			waitingExecution: {},
			waitingExecutionSource: null,
		},
	};

	// Find start node
	const startNodeName = findStartNode(input.nodes, input.connections);
	if (!startNodeName) {
		return {
			success: false,
			nodeResults: {},
			error: 'No start node found',
		};
	}

	// Simple BFS execution (no branching/merging for POC)
	const executionQueue: string[] = [startNodeName];
	const executed = new Set<string>();

	// Initial input data
	let currentInputData: Array<{ json: Record<string, unknown> }> = input.inputData ?? [{ json: {} }];

	while (executionQueue.length > 0) {
		const nodeName = executionQueue.shift()!;

		if (executed.has(nodeName)) {
			continue;
		}

		const node = nodeMap.get(nodeName);
		if (!node) {
			console.log(`[Workflow] Node not found: ${nodeName}`);
			continue;
		}

		console.log(`[Workflow] Executing node: ${nodeName} (${node.type})`);

		// Execute node via Activity
		const result = await activities.executeNode({
			node: node as never,
			inputData: {
				main: [currentInputData as never],
			},
			runExecutionData: runExecutionData as never,
			runIndex: 0,
			workflowId: input.workflowId,
			workflowName: input.workflowName,
			workflowNodes: input.nodes as never,
			workflowConnections: input.connections,
			workflowSettings: input.settings,
			executeData: {
				node: node as never,
				data: { main: [currentInputData as never] },
				source: null,
			},
		});

		// Store result
		nodeResults[nodeName] = {
			data: result.outputData?.[0] as Array<{ json: Record<string, unknown> }> | null,
			error: result.error?.message,
		};

		// Update run data for expression resolution in subsequent nodes
		if (result.outputData) {
			runExecutionData.resultData.runData[nodeName] = [
				{
					data: {
						main: result.outputData as Array<Array<{ json: Record<string, unknown> }>>,
					},
				},
			];
			// Use this node's output as input for next nodes
			currentInputData = (result.outputData[0] as Array<{ json: Record<string, unknown> }>) ?? [{ json: {} }];
		}

		if (result.error) {
			console.log(`[Workflow] Node ${nodeName} failed: ${result.error.message}`);
			return {
				success: false,
				nodeResults,
				error: `Node ${nodeName} failed: ${result.error.message}`,
			};
		}

		executed.add(nodeName);

		// Add next nodes to queue
		const nextNodes = getNextNodes(nodeName, input.connections);
		for (const nextNode of nextNodes) {
			if (!executed.has(nextNode)) {
				executionQueue.push(nextNode);
			}
		}
	}

	console.log(`[Workflow] Workflow completed successfully`);

	return {
		success: true,
		nodeResults,
	};
}
