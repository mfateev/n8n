/**
 * POC 8: Minimal Temporal Workflow
 *
 * This workflow imports WorkflowExecute but we'll use aggressive
 * module ignoring to reduce bundle size.
 */

import { proxyActivities } from '@temporalio/workflow';

// Standard imports - we'll reduce bundle via ignoreModules
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
export interface N8nWorkflowMinimalInput {
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
				inputs: ['main'],
				outputs: ['main'],
				properties: [],
			},
			execute: async function (this: unknown) {
				throw new Error('Proxy execute not implemented');
			},
		};
	}

	getKnownTypes() {
		return { nodes: {}, credentials: {} };
	}
}

/**
 * Execute workflow with minimal imports
 */
export async function executeN8nWorkflowMinimal(
	input: N8nWorkflowMinimalInput,
): Promise<{ success: boolean; error?: string }> {
	console.log(`[Workflow] Starting minimal workflow: ${input.workflowName}`);

	try {
		const nodeTypes = new ProxyNodeTypes();

		// Verify classes are available
		console.log('[Workflow] WorkflowExecute available:', typeof WorkflowExecute);
		console.log('[Workflow] Workflow available:', typeof Workflow);
		console.log('[Workflow] NodeHelpers available:', typeof NodeHelpers);

		// Create workflow instance
		const workflow = new Workflow({
			id: input.workflowId,
			name: input.workflowName,
			nodes: input.nodes,
			connections: input.connections as never,
			nodeTypes: nodeTypes as never,
			active: false,
			settings: input.settings,
		});

		console.log('[Workflow] Workflow instance created with', input.nodes.length, 'nodes');

		return { success: true };
	} catch (error) {
		return {
			success: false,
			error: error instanceof Error ? error.message : String(error),
		};
	}
}
