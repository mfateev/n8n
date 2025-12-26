import type { ICredentialType, ICredentialTypes } from 'n8n-workflow';
import type { TemporalNodeTypes } from '../nodes/node-types';
export declare class TemporalCredentialTypes implements ICredentialTypes {
	private readonly nodeTypes;
	private credentialTypes;
	private knownCredentials;
	private loaded;
	constructor(nodeTypes: TemporalNodeTypes);
	loadAll(): void;
	recognizes(credentialType: string): boolean;
	getByName(credentialType: string): ICredentialType;
	getSupportedNodes(type: string): string[];
	getParentTypes(typeName: string): string[];
	getKnownTypes(): string[];
	private ensureLoaded;
}
