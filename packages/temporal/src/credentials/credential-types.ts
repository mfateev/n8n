/**
 * Temporal Credential Types Registry
 *
 * Implements ICredentialTypes for credential type lookup.
 * Works in conjunction with TemporalNodeTypes to load credential definitions.
 */

import type {
	ICredentialType,
	ICredentialTypes,
	LoadedClass,
	CredentialLoadingDetails,
} from 'n8n-workflow';

import type { TemporalNodeTypes } from '../nodes/node-types';

/**
 * ICredentialTypes implementation for Temporal workers
 *
 * @example
 * ```typescript
 * const nodeTypes = new TemporalNodeTypes();
 * await nodeTypes.loadAll();
 *
 * const credentialTypes = new TemporalCredentialTypes(nodeTypes);
 * credentialTypes.loadAll();
 *
 * const slackCred = credentialTypes.getByName('slackApi');
 * ```
 */
export class TemporalCredentialTypes implements ICredentialTypes {
	private credentialTypes: Map<string, LoadedClass<ICredentialType>> = new Map();

	private knownCredentials: Record<string, CredentialLoadingDetails> = {};

	private loaded = false;

	constructor(private readonly nodeTypes: TemporalNodeTypes) {}

	/**
	 * Load all credential types from the node type loaders
	 */
	loadAll(): void {
		if (this.loaded) {
			return;
		}

		// Get known credentials from node types
		this.knownCredentials = this.nodeTypes.getKnownCredentials();
		this.loaded = true;
	}

	/**
	 * Check if a credential type is recognized
	 */
	recognizes(credentialType: string): boolean {
		this.ensureLoaded();
		return credentialType in this.knownCredentials || this.credentialTypes.has(credentialType);
	}

	/**
	 * Get a credential type by name
	 *
	 * @param credentialType - Name of the credential type (e.g., 'slackApi')
	 */
	getByName(credentialType: string): ICredentialType {
		this.ensureLoaded();

		// Check if already loaded
		const loaded = this.credentialTypes.get(credentialType);
		if (loaded) {
			return loaded.type;
		}

		// Try to load from known credentials
		const knownInfo = this.knownCredentials[credentialType];
		if (!knownInfo) {
			throw new Error(`Unknown credential type: ${credentialType}`);
		}

		// Find the loader that has this credential
		// Credentials are not package-prefixed, so we need to search
		const loaderPackages = ['n8n-nodes-base', '@n8n/n8n-nodes-langchain'];

		for (const packageName of loaderPackages) {
			const loader = this.nodeTypes.getLoader(packageName);
			if (loader && credentialType in loader.known.credentials) {
				try {
					const loadedCred = loader.getCredential(credentialType);
					this.credentialTypes.set(credentialType, loadedCred);
					return loadedCred.type;
				} catch {
					continue;
				}
			}
		}

		throw new Error(`Could not load credential type: ${credentialType}`);
	}

	/**
	 * Get nodes that support a credential type
	 */
	getSupportedNodes(type: string): string[] {
		this.ensureLoaded();
		return this.knownCredentials[type]?.supportedNodes ?? [];
	}

	/**
	 * Get parent types of a credential type (for inheritance)
	 */
	getParentTypes(typeName: string): string[] {
		this.ensureLoaded();

		const extendsArr = this.knownCredentials[typeName]?.extends ?? [];

		if (extendsArr.length === 0) {
			return [];
		}

		// Recursively get all parent types
		const allParents = [...extendsArr];
		for (const parentType of extendsArr) {
			allParents.push(...this.getParentTypes(parentType));
		}

		return allParents;
	}

	/**
	 * Get all known credential type names
	 */
	getKnownTypes(): string[] {
		this.ensureLoaded();
		return Object.keys(this.knownCredentials);
	}

	/**
	 * Ensure credential types have been loaded
	 */
	private ensureLoaded(): void {
		if (!this.loaded) {
			throw new Error('Credential types not loaded. Call loadAll() first.');
		}
	}
}
