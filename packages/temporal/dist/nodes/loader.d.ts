import { LazyPackageDirectoryLoader } from 'n8n-core';
export declare function loadNodesFromPackage(
	packagePath: string,
	excludeNodes?: string[],
	includeNodes?: string[],
): Promise<{
	loader: LazyPackageDirectoryLoader;
	packageName: string;
}>;
export declare function findPackagePath(packageName: string): string;
export declare const DEFAULT_NODE_PACKAGES: string[];
