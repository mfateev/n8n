/**
 * Temporal Node Types Registry
 *
 * Implements INodeTypes for node lookup during workflow execution.
 * Loads nodes lazily from installed packages.
 */

import type { LazyPackageDirectoryLoader } from 'n8n-core';
import type {
	INodeType,
	INodeTypes,
	IVersionedNodeType,
	IDataObject,
	KnownNodesAndCredentials,
} from 'n8n-workflow';
import { NodeHelpers } from 'n8n-workflow';

import { loadNodesFromPackage, findPackagePath, DEFAULT_NODE_PACKAGES } from './loader';

/**
 * Options for creating the node types registry
 */
export interface TemporalNodeTypesOptions {
	/** Packages to load nodes from (defaults to n8n-nodes-base and langchain) */
	packages?: string[];
	/** Node types to exclude */
	excludeNodes?: string[];
	/** Node types to include (if specified, only these are loaded) */
	includeNodes?: string[];
}

/**
 * INodeTypes implementation for Temporal workers
 *
 * @example
 * ```typescript
 * const nodeTypes = new TemporalNodeTypes();
 * await nodeTypes.loadAll();
 *
 * const setNode = nodeTypes.getByNameAndVersion('n8n-nodes-base.set', 1);
 * ```
 */
export class TemporalNodeTypes implements INodeTypes {
	private loaders: Map<string, LazyPackageDirectoryLoader> = new Map();

	private known: KnownNodesAndCredentials = { nodes: {}, credentials: {} };

	private loaded = false;

	private readonly packages: string[];

	private readonly excludeNodes: string[];

	private readonly includeNodes: string[];

	constructor(options: TemporalNodeTypesOptions = {}) {
		this.packages = options.packages ?? DEFAULT_NODE_PACKAGES;
		this.excludeNodes = options.excludeNodes ?? [];
		this.includeNodes = options.includeNodes ?? [];
	}

	/**
	 * Load all nodes from configured packages
	 */
	async loadAll(): Promise<void> {
		if (this.loaded) {
			return;
		}

		for (const packageName of this.packages) {
			try {
				const packagePath = findPackagePath(packageName);
				const { loader } = await loadNodesFromPackage(
					packagePath,
					this.excludeNodes,
					this.includeNodes,
				);

				this.loaders.set(loader.packageName, loader);

				// Merge known nodes with full names
				for (const [nodeType, info] of Object.entries(loader.known.nodes)) {
					const fullName = `${loader.packageName}.${nodeType}`;
					this.known.nodes[fullName] = info;
				}

				// Merge known credentials
				for (const [credType, info] of Object.entries(loader.known.credentials)) {
					this.known.credentials[credType] = info;
				}
			} catch (error) {
				console.warn(`Failed to load nodes from ${packageName}: ${(error as Error).message}`);
			}
		}

		this.loaded = true;
	}

	/**
	 * Get a node type by its full name
	 *
	 * @param nodeType - Full node type name (e.g., 'n8n-nodes-base.set')
	 */
	getByName(nodeType: string): INodeType | IVersionedNodeType {
		this.ensureLoaded();

		const [packageName, shortName] = this.parseNodeType(nodeType);
		const loader = this.loaders.get(packageName);

		if (!loader) {
			throw new Error(`Unknown node package: ${packageName}`);
		}

		try {
			return loader.getNode(shortName).type;
		} catch {
			throw new Error(`Unknown node type: ${nodeType}`);
		}
	}

	/**
	 * Get a specific version of a node type
	 *
	 * @param nodeType - Full node type name
	 * @param version - Version number (optional, defaults to latest)
	 */
	getByNameAndVersion(nodeType: string, version?: number): INodeType {
		const node = this.getByName(nodeType);
		return NodeHelpers.getVersionedNodeType(node, version);
	}

	/**
	 * Get known node types
	 */
	getKnownTypes(): IDataObject {
		this.ensureLoaded();
		return this.known.nodes;
	}

	/**
	 * Get known credential types
	 * (Useful for the credential types registry)
	 */
	getKnownCredentials(): KnownNodesAndCredentials['credentials'] {
		this.ensureLoaded();
		return this.known.credentials;
	}

	/**
	 * Check if a node type is known
	 */
	hasNode(nodeType: string): boolean {
		this.ensureLoaded();
		return nodeType in this.known.nodes;
	}

	/**
	 * Get a loader by package name
	 * (Useful for credential loading)
	 */
	getLoader(packageName: string): LazyPackageDirectoryLoader | undefined {
		return this.loaders.get(packageName);
	}

	/**
	 * Parse a full node type name into package and short name
	 */
	private parseNodeType(nodeType: string): [string, string] {
		const lastDotIndex = nodeType.lastIndexOf('.');

		// Handle scoped packages like @n8n/n8n-nodes-langchain.agent
		if (nodeType.startsWith('@')) {
			// Find the second dot for scoped packages
			const firstDot = nodeType.indexOf('.');
			if (firstDot !== -1 && firstDot !== lastDotIndex) {
				return [nodeType.substring(0, lastDotIndex), nodeType.substring(lastDotIndex + 1)];
			}
		}

		if (lastDotIndex === -1) {
			throw new Error(`Invalid node type format: ${nodeType}`);
		}

		return [nodeType.substring(0, lastDotIndex), nodeType.substring(lastDotIndex + 1)];
	}

	/**
	 * Ensure nodes have been loaded
	 */
	private ensureLoaded(): void {
		if (!this.loaded) {
			throw new Error('Node types not loaded. Call loadAll() first.');
		}
	}
}
