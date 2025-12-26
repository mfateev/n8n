import type { ICredentialDataDecryptedObject } from 'n8n-workflow';
export interface StoredCredential {
	id: string;
	name: string;
	type: string;
	data: ICredentialDataDecryptedObject;
}
export interface CredentialStore {
	load(): Promise<void>;
	get(credentialId: string): StoredCredential | undefined | Promise<StoredCredential | undefined>;
	getByIdAndType(
		credentialId: string,
		type: string,
	): StoredCredential | undefined | Promise<StoredCredential | undefined>;
	getAll(): Map<string, StoredCredential> | Promise<Map<string, StoredCredential>>;
	update(credentialId: string, data: ICredentialDataDecryptedObject): Promise<void>;
	has(credentialId: string): boolean | Promise<boolean>;
}
