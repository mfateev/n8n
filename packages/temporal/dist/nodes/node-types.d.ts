import type { LazyPackageDirectoryLoader } from 'n8n-core';
import type {
	INodeType,
	INodeTypes,
	IVersionedNodeType,
	IDataObject,
	KnownNodesAndCredentials,
} from 'n8n-workflow';
export interface TemporalNodeTypesOptions {
	packages?: string[];
	excludeNodes?: string[];
	includeNodes?: string[];
}
export declare class TemporalNodeTypes implements INodeTypes {
	private loaders;
	private known;
	private loaded;
	private readonly packages;
	private readonly excludeNodes;
	private readonly includeNodes;
	constructor(options?: TemporalNodeTypesOptions);
	loadAll(): Promise<void>;
	getByName(nodeType: string): INodeType | IVersionedNodeType;
	getByNameAndVersion(nodeType: string, version?: number): INodeType;
	getKnownTypes(): IDataObject;
	getKnownCredentials(): KnownNodesAndCredentials['credentials'];
	hasNode(nodeType: string): boolean;
	getLoader(packageName: string): LazyPackageDirectoryLoader | undefined;
	private parseNodeType;
	private ensureLoaded;
}
