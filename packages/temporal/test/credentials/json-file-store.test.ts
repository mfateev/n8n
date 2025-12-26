import * as fs from 'fs/promises';
import * as os from 'os';
import * as path from 'path';

import { JsonFileCredentialStore } from '../../src/credentials/json-file-store';

describe('JsonFileCredentialStore', () => {
	let tempDir: string;
	let credentialsPath: string;

	beforeEach(async () => {
		// Create a temp directory for each test
		tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'temporal-test-'));
		credentialsPath = path.join(tempDir, 'credentials.json');
	});

	afterEach(async () => {
		// Clean up temp directory
		try {
			await fs.rm(tempDir, { recursive: true });
		} catch {
			// Ignore cleanup errors
		}
	});

	describe('load()', () => {
		it('should load credentials from a JSON file', async () => {
			// Create a test credentials file
			const testCredentials = {
				cred_1: {
					name: 'Test API',
					type: 'testApi',
					data: {
						apiKey: 'test-key-123',
					},
				},
				cred_2: {
					name: 'Test OAuth',
					type: 'testOAuth',
					data: {
						accessToken: 'token-abc',
						refreshToken: 'refresh-xyz',
					},
				},
			};

			await fs.writeFile(credentialsPath, JSON.stringify(testCredentials, null, 2));

			const store = new JsonFileCredentialStore(credentialsPath);
			await store.load();

			const cred1 = store.get('cred_1');
			expect(cred1).toBeDefined();
			expect(cred1?.name).toBe('Test API');
			expect(cred1?.type).toBe('testApi');
			expect(cred1?.data.apiKey).toBe('test-key-123');

			const cred2 = store.get('cred_2');
			expect(cred2).toBeDefined();
			expect(cred2?.data.accessToken).toBe('token-abc');
		});

		it('should handle non-existent file gracefully', async () => {
			const nonExistentPath = path.join(tempDir, 'nonexistent.json');
			const store = new JsonFileCredentialStore(nonExistentPath);

			// Should not throw
			await store.load();

			// Should have no credentials
			expect(store.has('any-id')).toBe(false);
		});

		it('should throw on invalid JSON', async () => {
			await fs.writeFile(credentialsPath, 'not valid json {{{');

			const store = new JsonFileCredentialStore(credentialsPath);

			await expect(store.load()).rejects.toThrow('Failed to load credentials');
		});
	});

	describe('get() and getByIdAndType()', () => {
		it('should return undefined for non-existent credential', async () => {
			const store = new JsonFileCredentialStore(credentialsPath);
			await store.load();

			expect(store.get('nonexistent')).toBeUndefined();
			expect(store.getByIdAndType('nonexistent', 'anyType')).toBeUndefined();
		});

		it('should return undefined if type does not match', async () => {
			const testCredentials = {
				cred_1: {
					name: 'Test',
					type: 'typeA',
					data: { key: 'value' },
				},
			};

			await fs.writeFile(credentialsPath, JSON.stringify(testCredentials));

			const store = new JsonFileCredentialStore(credentialsPath);
			await store.load();

			expect(store.get('cred_1')).toBeDefined();
			expect(store.getByIdAndType('cred_1', 'typeA')).toBeDefined();
			expect(store.getByIdAndType('cred_1', 'typeB')).toBeUndefined();
		});
	});

	describe('update()', () => {
		it('should update credential and persist to file', async () => {
			const testCredentials = {
				cred_1: {
					name: 'Test',
					type: 'testType',
					data: { apiKey: 'old-key' },
				},
			};

			await fs.writeFile(credentialsPath, JSON.stringify(testCredentials));

			const store = new JsonFileCredentialStore(credentialsPath);
			await store.load();

			// Update the credential
			await store.update('cred_1', { apiKey: 'new-key', newField: 'value' });

			// Check in-memory update
			const updated = store.get('cred_1');
			expect(updated?.data.apiKey).toBe('new-key');
			expect(updated?.data.newField).toBe('value');

			// Check file persistence
			const fileContent = await fs.readFile(credentialsPath, 'utf-8');
			let parsed: Record<string, { data: { apiKey: string } }>;
			try {
				parsed = JSON.parse(fileContent) as Record<string, { data: { apiKey: string } }>;
			} catch {
				throw new Error('Failed to parse credentials file');
			}
			expect(parsed.cred_1.data.apiKey).toBe('new-key');
		});

		it('should throw when updating non-existent credential', async () => {
			const store = new JsonFileCredentialStore(credentialsPath);
			await store.load();

			await expect(store.update('nonexistent', { key: 'value' })).rejects.toThrow(
				'Credential not found',
			);
		});
	});

	describe('has()', () => {
		it('should return true for existing credentials', async () => {
			const testCredentials = {
				cred_1: {
					name: 'Test',
					type: 'testType',
					data: {},
				},
			};

			await fs.writeFile(credentialsPath, JSON.stringify(testCredentials));

			const store = new JsonFileCredentialStore(credentialsPath);
			await store.load();

			expect(store.has('cred_1')).toBe(true);
			expect(store.has('cred_2')).toBe(false);
		});
	});

	describe('getAll()', () => {
		it('should return all credentials', async () => {
			const testCredentials = {
				cred_1: { name: 'One', type: 'type1', data: {} },
				cred_2: { name: 'Two', type: 'type2', data: {} },
				cred_3: { name: 'Three', type: 'type3', data: {} },
			};

			await fs.writeFile(credentialsPath, JSON.stringify(testCredentials));

			const store = new JsonFileCredentialStore(credentialsPath);
			await store.load();

			const all = store.getAll();
			expect(all.size).toBe(3);
			expect(all.has('cred_1')).toBe(true);
			expect(all.has('cred_2')).toBe(true);
			expect(all.has('cred_3')).toBe(true);
		});
	});

	describe('ensureLoaded', () => {
		it('should throw if methods are called before load()', () => {
			const store = new JsonFileCredentialStore(credentialsPath);

			expect(() => store.get('any')).toThrow('Credential store not loaded');
			expect(() => store.has('any')).toThrow('Credential store not loaded');
			expect(() => store.getAll()).toThrow('Credential store not loaded');
		});
	});
});
