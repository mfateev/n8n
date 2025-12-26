import type { ICredentialDataDecryptedObject } from 'n8n-workflow';
import type { CredentialStore, StoredCredential } from './credential-store';
export declare class JsonFileCredentialStore implements CredentialStore {
	private readonly filePath;
	private credentials;
	private loaded;
	constructor(filePath: string);
	load(): Promise<void>;
	private ensureLoaded;
	get(credentialId: string): StoredCredential | undefined;
	getByIdAndType(credentialId: string, type: string): StoredCredential | undefined;
	getAll(): Map<string, StoredCredential>;
	update(credentialId: string, data: ICredentialDataDecryptedObject): Promise<void>;
	has(credentialId: string): boolean;
	private persist;
	getFilePath(): string;
}
