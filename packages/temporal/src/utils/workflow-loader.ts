/**
 * Workflow Loader
 *
 * Utility for loading n8n workflow definitions from JSON files.
 * Provides validation and error handling for malformed workflows.
 */

import * as fs from 'fs/promises';
import type { IConnections, INode, IWorkflowSettings, IDataObject, IPinData } from 'n8n-workflow';
import * as path from 'path';

/**
 * Workflow definition as stored in JSON files.
 *
 * This is a subset of IWorkflowBase, containing only the fields
 * typically found in exported workflow JSON files.
 */
export interface WorkflowFileDefinition {
	/** Workflow name (optional in files, will use filename if missing) */
	name?: string;

	/** Array of node definitions */
	nodes: INode[];

	/** Connection definitions between nodes */
	connections: IConnections;

	/** Optional workflow settings */
	settings?: IWorkflowSettings;

	/** Optional static data */
	staticData?: IDataObject;

	/** Optional pinned data for testing */
	pinData?: IPinData;
}

/**
 * Validated workflow definition with required fields.
 */
export interface LoadedWorkflow {
	/** Workflow ID (generated from file path if not in file) */
	id: string;

	/** Workflow name */
	name: string;

	/** Array of node definitions */
	nodes: INode[];

	/** Connection definitions between nodes */
	connections: IConnections;

	/** Optional workflow settings */
	settings?: IWorkflowSettings;

	/** Optional static data */
	staticData?: IDataObject;

	/** Optional pinned data */
	pinData?: IPinData;

	/** Original file path */
	filePath: string;
}

/**
 * Load a workflow definition from a JSON file.
 *
 * @param filePath - Path to the workflow JSON file (absolute or relative)
 * @returns Loaded and validated workflow definition
 * @throws Error if file not found, invalid JSON, or missing required fields
 *
 * @example
 * ```typescript
 * const workflow = await loadWorkflowFromFile('./my-workflow.json');
 * console.log(`Loaded workflow: ${workflow.name} with ${workflow.nodes.length} nodes`);
 * ```
 */
export async function loadWorkflowFromFile(filePath: string): Promise<LoadedWorkflow> {
	const absolutePath = path.resolve(filePath);

	// Read file
	let content: string;
	try {
		content = await fs.readFile(absolutePath, 'utf-8');
	} catch (error) {
		if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
			throw new Error(`Workflow file not found: ${absolutePath}`);
		}
		throw new Error(`Failed to read workflow file: ${(error as Error).message}`);
	}

	// Parse JSON
	let parsed: unknown;
	try {
		parsed = JSON.parse(content);
	} catch (error) {
		throw new Error(`Invalid JSON in workflow file: ${(error as Error).message}`);
	}

	// Validate structure
	const workflow = validateWorkflowDefinition(parsed, absolutePath);

	// Generate ID from file path if not present
	const id = generateWorkflowId(absolutePath);

	// Use filename as name if not specified
	const name = workflow.name ?? path.basename(filePath, '.json');

	return {
		id,
		name,
		nodes: workflow.nodes,
		connections: workflow.connections,
		settings: workflow.settings,
		staticData: workflow.staticData,
		pinData: workflow.pinData,
		filePath: absolutePath,
	};
}

/**
 * Validate that parsed JSON is a valid workflow definition.
 */
function validateWorkflowDefinition(parsed: unknown, filePath: string): WorkflowFileDefinition {
	if (typeof parsed !== 'object' || parsed === null) {
		throw new Error(`Workflow file must contain a JSON object: ${filePath}`);
	}

	const obj = parsed as Record<string, unknown>;

	// Validate nodes array
	if (!Array.isArray(obj.nodes)) {
		throw new Error(`Workflow must have a "nodes" array: ${filePath}`);
	}

	// Validate each node has required fields
	for (let i = 0; i < obj.nodes.length; i++) {
		const node = obj.nodes[i] as Record<string, unknown>;
		if (!node.type || typeof node.type !== 'string') {
			throw new Error(`Node at index ${i} must have a "type" string: ${filePath}`);
		}
		if (!node.name || typeof node.name !== 'string') {
			throw new Error(`Node at index ${i} must have a "name" string: ${filePath}`);
		}
	}

	// Validate connections object
	if (typeof obj.connections !== 'object' || obj.connections === null) {
		throw new Error(`Workflow must have a "connections" object: ${filePath}`);
	}

	return {
		name: typeof obj.name === 'string' ? obj.name : undefined,
		nodes: obj.nodes as INode[],
		connections: obj.connections as IConnections,
		settings: obj.settings as IWorkflowSettings | undefined,
		staticData: obj.staticData as IDataObject | undefined,
		pinData: obj.pinData as IPinData | undefined,
	};
}

/**
 * Generate a workflow ID from file path.
 */
function generateWorkflowId(filePath: string): string {
	// Use a hash-like ID based on the file path
	const basename = path.basename(filePath, '.json');
	const hash = simpleHash(filePath);
	return `workflow-${basename}-${hash}`;
}

/**
 * Simple string hash for generating IDs.
 */
function simpleHash(str: string): string {
	let hash = 0;
	for (let i = 0; i < str.length; i++) {
		const char = str.charCodeAt(i);
		hash = (hash << 5) - hash + char;
		hash = hash & hash; // Convert to 32-bit integer
	}
	return Math.abs(hash).toString(36).substring(0, 8);
}

/**
 * Find the start node in a workflow.
 *
 * Start node is typically:
 * 1. A node with type containing "Trigger"
 * 2. A node with type "n8n-nodes-base.start"
 * 3. A node with type "n8n-nodes-base.manualTrigger"
 *
 * @param nodes - Array of nodes to search
 * @returns The start node, or undefined if not found
 */
export function findStartNode(nodes: INode[]): INode | undefined {
	// First try to find a designated trigger node
	const triggerNode = nodes.find(
		(node) =>
			node.type.includes('Trigger') ||
			node.type.includes('trigger') ||
			node.type === 'n8n-nodes-base.start',
	);

	if (triggerNode) {
		return triggerNode;
	}

	// Fallback: find a node that has no incoming connections
	// (This would require analyzing connections, kept simple for now)
	return nodes[0];
}
