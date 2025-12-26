/**
 * Node Loading Utilities
 *
 * Handles loading n8n nodes from installed packages.
 * Uses the LazyPackageDirectoryLoader pattern for efficient loading.
 */

import { LazyPackageDirectoryLoader } from 'n8n-core';
import * as path from 'path';

/**
 * Load nodes from a package directory
 *
 * @param packagePath - Path to the package directory
 * @param excludeNodes - Node types to exclude
 * @param includeNodes - Node types to include (if empty, includes all)
 */
export async function loadNodesFromPackage(
	packagePath: string,
	excludeNodes: string[] = [],
	includeNodes: string[] = [],
): Promise<{
	loader: LazyPackageDirectoryLoader;
	packageName: string;
}> {
	const loader = new LazyPackageDirectoryLoader(packagePath, excludeNodes, includeNodes);
	await loader.loadAll();

	return {
		loader,
		packageName: loader.packageName,
	};
}

/**
 * Find the path to a node package
 *
 * @param packageName - Name of the package (e.g., 'n8n-nodes-base')
 * @returns Resolved path to the package
 */
export function findPackagePath(packageName: string): string {
	try {
		// Try to resolve the package's main entry point
		const packageJson = require.resolve(`${packageName}/package.json`);
		return path.dirname(packageJson);
	} catch {
		throw new Error(`Could not find package "${packageName}". Is it installed?`);
	}
}

/**
 * Default packages to load nodes from
 */
export const DEFAULT_NODE_PACKAGES = ['n8n-nodes-base', '@n8n/n8n-nodes-langchain'];
