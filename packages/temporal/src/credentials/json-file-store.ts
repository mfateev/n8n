/**
 * JSON File Credential Store
 *
 * Simple file-based credential storage for MVP.
 * Credentials are stored as plaintext JSON - suitable for
 * development/testing or environments with secure file systems.
 *
 * Production deployments should consider using encrypted storage
 * or secret management services.
 */

import * as fs from 'fs/promises';
import type { ICredentialDataDecryptedObject } from 'n8n-workflow';
import * as path from 'path';

import type { CredentialStore, StoredCredential } from './credential-store';

/**
 * JSON file format for credentials
 */
interface CredentialsFileFormat {
	[credentialId: string]: {
		name: string;
		type: string;
		data: ICredentialDataDecryptedObject;
	};
}

/**
 * JSON file-based credential store implementation
 *
 * @example
 * ```typescript
 * const store = new JsonFileCredentialStore('./credentials.json');
 * await store.load();
 *
 * const cred = await store.get('cred-123');
 * console.log(cred?.data.apiKey);
 * ```
 *
 * Expected file format:
 * ```json
 * {
 *   "cred-123": {
 *     "name": "My Slack API",
 *     "type": "slackApi",
 *     "data": {
 *       "accessToken": "xoxb-..."
 *     }
 *   }
 * }
 * ```
 */
export class JsonFileCredentialStore implements CredentialStore {
	private credentials: Map<string, StoredCredential> = new Map();

	private loaded = false;

	/**
	 * Create a new JSON file credential store
	 * @param filePath - Path to the credentials JSON file
	 */
	constructor(private readonly filePath: string) {}

	/**
	 * Load credentials from the JSON file
	 * Creates an empty file if it doesn't exist
	 */
	async load(): Promise<void> {
		try {
			const absolutePath = path.resolve(this.filePath);
			const content = await fs.readFile(absolutePath, 'utf-8');
			const parsed = JSON.parse(content) as CredentialsFileFormat;

			this.credentials.clear();
			for (const [id, credential] of Object.entries(parsed)) {
				this.credentials.set(id, {
					id,
					name: credential.name,
					type: credential.type,
					data: credential.data,
				});
			}

			this.loaded = true;
		} catch (error) {
			// If file doesn't exist, start with empty credentials
			if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
				this.credentials.clear();
				this.loaded = true;
				return;
			}
			throw new Error(
				`Failed to load credentials from ${this.filePath}: ${(error as Error).message}`,
			);
		}
	}

	/**
	 * Ensure the store has been loaded
	 */
	private ensureLoaded(): void {
		if (!this.loaded) {
			throw new Error('Credential store not loaded. Call load() first.');
		}
	}

	/**
	 * Get a credential by ID
	 */
	get(credentialId: string): StoredCredential | undefined {
		this.ensureLoaded();
		return this.credentials.get(credentialId);
	}

	/**
	 * Get a credential by ID and type
	 * Returns undefined if the credential exists but has a different type
	 */
	getByIdAndType(credentialId: string, type: string): StoredCredential | undefined {
		this.ensureLoaded();
		const credential = this.credentials.get(credentialId);
		if (credential && credential.type === type) {
			return credential;
		}
		return undefined;
	}

	/**
	 * Get all credentials
	 */
	getAll(): Map<string, StoredCredential> {
		this.ensureLoaded();
		return new Map(this.credentials);
	}

	/**
	 * Update a credential's data and persist to file
	 */
	async update(credentialId: string, data: ICredentialDataDecryptedObject): Promise<void> {
		this.ensureLoaded();

		const existing = this.credentials.get(credentialId);
		if (!existing) {
			throw new Error(`Credential not found: ${credentialId}`);
		}

		// Update in memory
		this.credentials.set(credentialId, {
			...existing,
			data,
		});

		// Persist to file
		await this.persist();
	}

	/**
	 * Check if a credential exists
	 */
	has(credentialId: string): boolean {
		this.ensureLoaded();
		return this.credentials.has(credentialId);
	}

	/**
	 * Persist credentials to the JSON file
	 */
	private async persist(): Promise<void> {
		const obj: CredentialsFileFormat = {};

		for (const [id, credential] of this.credentials) {
			obj[id] = {
				name: credential.name,
				type: credential.type,
				data: credential.data,
			};
		}

		const absolutePath = path.resolve(this.filePath);

		// Ensure directory exists
		await fs.mkdir(path.dirname(absolutePath), { recursive: true });

		// Write with pretty printing for readability
		await fs.writeFile(absolutePath, JSON.stringify(obj, null, 2), 'utf-8');
	}

	/**
	 * Get the file path (useful for debugging/logging)
	 */
	getFilePath(): string {
		return this.filePath;
	}
}
