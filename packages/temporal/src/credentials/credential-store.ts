/**
 * Credential Store Interface
 *
 * Defines the contract for credential storage backends.
 * The MVP uses a JSON file store, but this interface allows
 * for future implementations (Vault, AWS Secrets Manager, etc.)
 */

import type { ICredentialDataDecryptedObject } from 'n8n-workflow';

/**
 * Credential data as stored in the credential store
 * Includes metadata alongside the actual credential data
 */
export interface StoredCredential {
	/** Unique credential identifier */
	id: string;
	/** Human-readable name */
	name: string;
	/** Credential type (e.g., 'slackApi', 'httpBasicAuth') */
	type: string;
	/** Decrypted credential data */
	data: ICredentialDataDecryptedObject;
}

/**
 * Interface for credential storage backends
 */
export interface CredentialStore {
	/**
	 * Load credentials from the backing store
	 * Must be called before other methods
	 */
	load(): Promise<void>;

	/**
	 * Get a credential by ID
	 * @param credentialId - The credential identifier
	 * @returns The stored credential or undefined if not found
	 */
	get(credentialId: string): StoredCredential | undefined | Promise<StoredCredential | undefined>;

	/**
	 * Get a credential by ID and type
	 * @param credentialId - The credential identifier
	 * @param type - The credential type
	 * @returns The stored credential or undefined if not found
	 */
	getByIdAndType(
		credentialId: string,
		type: string,
	): StoredCredential | undefined | Promise<StoredCredential | undefined>;

	/**
	 * Get all credentials
	 * @returns Map of credential ID to stored credential
	 */
	getAll(): Map<string, StoredCredential> | Promise<Map<string, StoredCredential>>;

	/**
	 * Update a credential's data
	 * @param credentialId - The credential identifier
	 * @param data - New credential data
	 */
	update(credentialId: string, data: ICredentialDataDecryptedObject): Promise<void>;

	/**
	 * Check if a credential exists
	 * @param credentialId - The credential identifier
	 */
	has(credentialId: string): boolean | Promise<boolean>;
}
