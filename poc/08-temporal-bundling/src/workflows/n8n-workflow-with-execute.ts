/**
 * POC 8: Temporal Workflow using WorkflowExecute
 *
 * This is the ambitious test - can we import WorkflowExecute from n8n-core
 * and run it inside Temporal's deterministic sandbox?
 *
 * The key insight is that WorkflowExecute's orchestration logic (graph traversal,
 * stack management) should be deterministic. Only the actual node execution
 * (I/O) needs to be in Activities.
 */

import { proxyActivities } from '@temporalio/workflow';

// Try importing WorkflowExecute - this is the key test
// If this fails to bundle, we need to know why
import { WorkflowExecute } from 'n8n-core';
import { Workflow, NodeHelpers, type INode, type INodeType, type INodeTypes } from 'n8n-workflow';

import type { ExecuteNodeInput, ExecuteNodeOutput } from '../activities/index.js';

// Proxy activities
const activities = proxyActivities<{
	executeNode: (input: ExecuteNodeInput) => Promise<ExecuteNodeOutput>;
}>({
	startToCloseTimeout: '5 minutes',
});

/**
 * Input for the workflow
 */
export interface N8nWorkflowWithExecuteInput {
	workflowId: string;
	workflowName: string;
	nodes: INode[];
	connections: Record<string, unknown>;
	settings?: Record<string, unknown>;
}

/**
 * Proxy INodeTypes that delegates execution to Activities
 */
class ProxyNodeTypes implements INodeTypes {
	private nodeDescriptions: Map<string, { description: INodeType['description'] }> = new Map();

	constructor(
		private workflowId: string,
		private workflowName: string,
		private nodes: INode[],
		private connections: Record<string, unknown>,
		private settings?: Record<string, unknown>,
	) {}

	getByName(nodeType: string): INodeType {
		return this.getByNameAndVersion(nodeType);
	}

	getByNameAndVersion(nodeType: string, _version?: number): INodeType {
		// Return a proxy node type that calls an Activity for execution
		return {
			description: {
				displayName: nodeType,
				name: nodeType,
				group: ['transform'],
				version: 1,
				description: 'Proxy node',
				defaults: { name: nodeType },
				inputs: ['main'],
				outputs: ['main'],
				properties: [],
			},
			// This execute method runs INSIDE the Temporal Workflow
			// So it can call Activities!
			execute: async function (this: unknown) {
				// We can't use 'this' properly here, but this demonstrates the pattern
				// In practice, we'd need to pass the context differently
				throw new Error('Proxy execute not implemented in this POC');
			},
		};
	}

	getKnownTypes() {
		return { nodes: {}, credentials: {} };
	}
}

/**
 * Execute an n8n workflow using WorkflowExecute from n8n-core
 *
 * This tests whether WorkflowExecute can run inside Temporal's sandbox
 * with node execution delegated to Activities.
 */
export async function executeN8nWorkflowWithExecute(
	input: N8nWorkflowWithExecuteInput,
): Promise<{ success: boolean; error?: string }> {
	console.log(`[Workflow] Starting with WorkflowExecute: ${input.workflowName}`);

	try {
		// Create proxy node types
		const nodeTypes = new ProxyNodeTypes(
			input.workflowId,
			input.workflowName,
			input.nodes,
			input.connections,
			input.settings,
		);

		// Create Workflow instance
		const workflow = new Workflow({
			id: input.workflowId,
			name: input.workflowName,
			nodes: input.nodes,
			connections: input.connections as never,
			nodeTypes: nodeTypes as never,
			active: false,
			settings: input.settings,
		});

		console.log('[Workflow] Workflow instance created');
		console.log(`[Workflow] Nodes: ${input.nodes.map((n) => n.name).join(', ')}`);

		// Note: We can't actually run WorkflowExecute here because it needs
		// additionalData with hooks, and the execution context is complex.
		// But the key test is whether it can be IMPORTED and BUNDLED.

		// For now, just verify we can create instances
		console.log('[Workflow] WorkflowExecute class available:', typeof WorkflowExecute);
		console.log('[Workflow] Workflow class available:', typeof Workflow);
		console.log('[Workflow] NodeHelpers available:', typeof NodeHelpers);

		return {
			success: true,
		};
	} catch (error) {
		return {
			success: false,
			error: error instanceof Error ? error.message : String(error),
		};
	}
}
