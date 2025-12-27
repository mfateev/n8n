/**
 * Unit tests for TemporalCredentialsHelper.preAuthentication()
 *
 * Tests OAuth preAuthentication functionality including:
 * - Token refresh flow for expirable credentials
 * - Credential persistence after refresh
 * - Edge cases (no expirable property, valid token)
 */

/* eslint-disable @typescript-eslint/naming-convention */

import type {
	ICredentialDataDecryptedObject,
	ICredentialType,
	IHttpRequestHelper,
	INode,
	INodeProperties,
} from 'n8n-workflow';

import type { CredentialStore, StoredCredential } from '../../src/credentials/credential-store';
import type { TemporalCredentialTypes } from '../../src/credentials/credential-types';
import { TemporalCredentialsHelper } from '../../src/credentials/credentials-helper';

// Mock implementations
class MockCredentialStore implements CredentialStore {
	private credentials: Map<string, StoredCredential> = new Map();

	updateCallCount = 0;

	lastUpdateId: string | null = null;

	lastUpdateData: ICredentialDataDecryptedObject | null = null;

	constructor(initialCredentials?: Record<string, StoredCredential>) {
		if (initialCredentials) {
			for (const [id, cred] of Object.entries(initialCredentials)) {
				this.credentials.set(id, cred);
			}
		}
	}

	async load(): Promise<void> {
		// No-op for mock
	}

	get(id: string): StoredCredential | undefined {
		return this.credentials.get(id);
	}

	getByIdAndType(id: string, type: string): StoredCredential | undefined {
		const cred = this.credentials.get(id);
		if (cred && cred.type === type) {
			return cred;
		}
		return undefined;
	}

	has(id: string): boolean {
		return this.credentials.has(id);
	}

	getAll(): Map<string, StoredCredential> {
		return this.credentials;
	}

	async update(id: string, data: ICredentialDataDecryptedObject): Promise<void> {
		this.updateCallCount++;
		this.lastUpdateId = id;
		this.lastUpdateData = { ...data };

		const existing = this.credentials.get(id);
		if (!existing) {
			throw new Error(`Credential not found: ${id}`);
		}
		await Promise.resolve();
		this.credentials.set(id, { ...existing, data });
	}
}

class MockCredentialTypes {
	private types: Map<string, ICredentialType> = new Map();

	constructor(types?: Record<string, ICredentialType>) {
		if (types) {
			for (const [name, type] of Object.entries(types)) {
				this.types.set(name, type);
			}
		}
	}

	getByName(name: string): ICredentialType {
		const type = this.types.get(name);
		if (!type) {
			throw new Error(`Unknown credential type: ${name}`);
		}
		return type;
	}

	getParentTypes(_name: string): string[] {
		return [];
	}

	recognizes(name: string): boolean {
		return this.types.has(name);
	}
}

// Helper to create a mock HTTP request helper
function createMockHttpRequestHelper(): IHttpRequestHelper {
	return {
		helpers: {
			httpRequest: jest.fn(),
		},
	} as unknown as IHttpRequestHelper;
}

// Helper to create a minimal mock node with credentials
function createMockNode(
	name = 'testNode',
	credentialType = 'testApi',
	credentialId = 'cred_1',
): INode {
	return {
		id: 'test-node-id',
		name,
		type: 'n8n-nodes-base.httpRequest',
		typeVersion: 1,
		position: [0, 0],
		parameters: {},
		credentials: {
			[credentialType]: {
				id: credentialId,
				name: 'Test Credential',
			},
		},
	};
}

describe('TemporalCredentialsHelper.preAuthentication()', () => {
	describe('No Expirable Property', () => {
		it('should return undefined when no expirable property exists', async () => {
			// Setup credential type without expirable property
			const credentialType: ICredentialType = {
				name: 'simpleApi',
				displayName: 'Simple API',
				properties: [
					{
						displayName: 'API Key',
						name: 'apiKey',
						type: 'string',
						default: '',
					},
				],
			};

			const mockStore = new MockCredentialStore({
				cred_1: {
					id: 'cred_1',
					name: 'Test Simple API',
					type: 'simpleApi',
					data: { apiKey: 'my-api-key' },
				},
			});

			const mockCredentialTypes = new MockCredentialTypes({
				simpleApi: credentialType,
			});

			const helper = new TemporalCredentialsHelper(
				mockStore,
				mockCredentialTypes as unknown as TemporalCredentialTypes,
			);

			const httpHelper = createMockHttpRequestHelper();
			const credentials: ICredentialDataDecryptedObject = {
				apiKey: 'my-api-key',
			};

			const node = createMockNode('testNode', 'simpleApi', 'cred_1');

			const result = await helper.preAuthentication(
				httpHelper,
				credentials,
				'simpleApi',
				node,
				false,
			);

			expect(result).toBeUndefined();
			expect(mockStore.updateCallCount).toBe(0);
		});

		it('should return undefined when expirable property has no name', async () => {
			// Setup credential type with expirable property but no name
			const credentialType: ICredentialType = {
				name: 'noNameApi',
				displayName: 'No Name API',
				properties: [
					{
						displayName: 'Token',
						name: undefined as unknown as string, // Intentionally invalid
						type: 'hidden',
						typeOptions: { expirable: true },
						default: '',
					} as unknown as INodeProperties,
				],
			};

			const mockStore = new MockCredentialStore();
			const mockCredentialTypes = new MockCredentialTypes({
				noNameApi: credentialType,
			});

			const helper = new TemporalCredentialsHelper(
				mockStore,
				mockCredentialTypes as unknown as TemporalCredentialTypes,
			);

			const httpHelper = createMockHttpRequestHelper();
			const credentials: ICredentialDataDecryptedObject = {};

			const node = createMockNode('testNode', 'noNameApi', 'cred_1');

			const result = await helper.preAuthentication(
				httpHelper,
				credentials,
				'noNameApi',
				node,
				false,
			);

			expect(result).toBeUndefined();
		});
	});

	describe('Token Empty', () => {
		it('should call preAuthentication when token is empty', async () => {
			const preAuthFn = jest.fn().mockResolvedValue({
				sessionToken: 'new-session-token-abc123',
			});

			// Metabase-style credential type with expirable session token
			const credentialType: ICredentialType = {
				name: 'metabaseApi',
				displayName: 'Metabase API',
				properties: [
					{
						displayName: 'URL',
						name: 'url',
						type: 'string',
						default: '',
					},
					{
						displayName: 'Username',
						name: 'username',
						type: 'string',
						default: '',
					},
					{
						displayName: 'Password',
						name: 'password',
						type: 'string',
						typeOptions: { password: true },
						default: '',
					},
					{
						displayName: 'Session Token',
						name: 'sessionToken',
						type: 'hidden',
						typeOptions: { expirable: true },
						default: '',
					},
				],
				preAuthentication: preAuthFn,
			};

			const mockStore = new MockCredentialStore({
				cred_metabase: {
					id: 'cred_metabase',
					name: 'Test Metabase',
					type: 'metabaseApi',
					data: {
						url: 'https://metabase.example.com',
						username: 'admin',
						password: 'secret',
						sessionToken: '', // Empty - needs refresh
					},
				},
			});

			const mockCredentialTypes = new MockCredentialTypes({
				metabaseApi: credentialType,
			});

			const helper = new TemporalCredentialsHelper(
				mockStore,
				mockCredentialTypes as unknown as TemporalCredentialTypes,
			);

			const httpHelper = createMockHttpRequestHelper();
			const credentials: ICredentialDataDecryptedObject = {
				url: 'https://metabase.example.com',
				username: 'admin',
				password: 'secret',
				sessionToken: '',
			};

			const node = createMockNode('testNode', 'metabaseApi', 'cred_metabase');

			const result = await helper.preAuthentication(
				httpHelper,
				credentials,
				'metabaseApi',
				node,
				false,
			);

			// Verify preAuthentication was called
			expect(preAuthFn).toHaveBeenCalledTimes(1);
			expect(preAuthFn).toHaveBeenCalledWith(credentials);

			// Verify result contains updated credentials
			expect(result).toBeDefined();
			expect(result?.sessionToken).toBe('new-session-token-abc123');
			expect(result?.url).toBe('https://metabase.example.com');
			expect(result?.username).toBe('admin');
			expect(result?.password).toBe('secret');

			// Verify credentials were persisted to store
			expect(mockStore.updateCallCount).toBe(1);
			expect(mockStore.lastUpdateId).toBe('cred_metabase');
			expect(mockStore.lastUpdateData?.sessionToken).toBe('new-session-token-abc123');
		});
	});

	describe('Token Expired', () => {
		it('should call preAuthentication when credentialsExpired is true', async () => {
			const preAuthFn = jest.fn().mockResolvedValue({
				sessionToken: 'refreshed-token-xyz789',
			});

			const credentialType: ICredentialType = {
				name: 'expirableApi',
				displayName: 'Expirable API',
				properties: [
					{
						displayName: 'API Key',
						name: 'apiKey',
						type: 'string',
						default: '',
					},
					{
						displayName: 'Session Token',
						name: 'sessionToken',
						type: 'hidden',
						typeOptions: { expirable: true },
						default: '',
					},
				],
				preAuthentication: preAuthFn,
			};

			const mockStore = new MockCredentialStore({
				cred_exp: {
					id: 'cred_exp',
					name: 'Expirable Credential',
					type: 'expirableApi',
					data: {
						apiKey: 'my-api-key',
						sessionToken: 'old-expired-token', // Existing but expired
					},
				},
			});

			const mockCredentialTypes = new MockCredentialTypes({
				expirableApi: credentialType,
			});

			const helper = new TemporalCredentialsHelper(
				mockStore,
				mockCredentialTypes as unknown as TemporalCredentialTypes,
			);

			const httpHelper = createMockHttpRequestHelper();
			const credentials: ICredentialDataDecryptedObject = {
				apiKey: 'my-api-key',
				sessionToken: 'old-expired-token',
			};

			const node = createMockNode('testNode', 'expirableApi', 'cred_exp');

			// Pass credentialsExpired=true to force refresh
			const result = await helper.preAuthentication(
				httpHelper,
				credentials,
				'expirableApi',
				node,
				true, // credentialsExpired
			);

			// Verify preAuthentication was called
			expect(preAuthFn).toHaveBeenCalledTimes(1);

			// Verify result contains refreshed token
			expect(result).toBeDefined();
			expect(result?.sessionToken).toBe('refreshed-token-xyz789');
			expect(result?.apiKey).toBe('my-api-key');

			// Verify credentials were persisted
			expect(mockStore.updateCallCount).toBe(1);
		});
	});

	describe('Token Valid', () => {
		it('should skip preAuthentication when token exists and not expired', async () => {
			const preAuthFn = jest.fn().mockResolvedValue({
				sessionToken: 'should-not-be-called',
			});

			const credentialType: ICredentialType = {
				name: 'validTokenApi',
				displayName: 'Valid Token API',
				properties: [
					{
						displayName: 'Session Token',
						name: 'sessionToken',
						type: 'hidden',
						typeOptions: { expirable: true },
						default: '',
					},
				],
				preAuthentication: preAuthFn,
			};

			const mockStore = new MockCredentialStore({
				cred_valid: {
					id: 'cred_valid',
					name: 'Valid Credential',
					type: 'validTokenApi',
					data: {
						sessionToken: 'valid-session-token', // Non-empty and not expired
					},
				},
			});

			const mockCredentialTypes = new MockCredentialTypes({
				validTokenApi: credentialType,
			});

			const helper = new TemporalCredentialsHelper(
				mockStore,
				mockCredentialTypes as unknown as TemporalCredentialTypes,
			);

			const httpHelper = createMockHttpRequestHelper();
			const credentials: ICredentialDataDecryptedObject = {
				sessionToken: 'valid-session-token',
			};

			const node = createMockNode('testNode', 'validTokenApi', 'cred_valid');

			// Pass credentialsExpired=false - token should NOT be refreshed
			const result = await helper.preAuthentication(
				httpHelper,
				credentials,
				'validTokenApi',
				node,
				false,
			);

			// preAuthentication should NOT be called
			expect(preAuthFn).not.toHaveBeenCalled();

			// Result should be undefined (no update needed)
			expect(result).toBeUndefined();

			// Store should NOT be updated
			expect(mockStore.updateCallCount).toBe(0);
		});
	});

	describe('Credential Store Persistence', () => {
		it('should update credentials in store after refresh', async () => {
			const preAuthFn = jest.fn().mockResolvedValue({
				sessionToken: 'new-persisted-token',
				extraField: 'extra-value',
			});

			const credentialType: ICredentialType = {
				name: 'persistApi',
				displayName: 'Persist API',
				properties: [
					{
						displayName: 'Base URL',
						name: 'baseUrl',
						type: 'string',
						default: '',
					},
					{
						displayName: 'Session Token',
						name: 'sessionToken',
						type: 'hidden',
						typeOptions: { expirable: true },
						default: '',
					},
				],
				preAuthentication: preAuthFn,
			};

			const mockStore = new MockCredentialStore({
				cred_persist: {
					id: 'cred_persist',
					name: 'Persist Credential',
					type: 'persistApi',
					data: {
						baseUrl: 'https://api.example.com',
						sessionToken: '', // Empty - needs refresh
					},
				},
			});

			const mockCredentialTypes = new MockCredentialTypes({
				persistApi: credentialType,
			});

			const helper = new TemporalCredentialsHelper(
				mockStore,
				mockCredentialTypes as unknown as TemporalCredentialTypes,
			);

			const httpHelper = createMockHttpRequestHelper();
			const credentials: ICredentialDataDecryptedObject = {
				baseUrl: 'https://api.example.com',
				sessionToken: '',
			};

			const node = createMockNode('testNode', 'persistApi', 'cred_persist');

			await helper.preAuthentication(httpHelper, credentials, 'persistApi', node, false);

			// Verify store was updated
			expect(mockStore.updateCallCount).toBe(1);
			expect(mockStore.lastUpdateId).toBe('cred_persist');

			// Verify all fields were persisted (original + new)
			expect(mockStore.lastUpdateData?.baseUrl).toBe('https://api.example.com');
			expect(mockStore.lastUpdateData?.sessionToken).toBe('new-persisted-token');
			expect(mockStore.lastUpdateData?.extraField).toBe('extra-value');

			// Verify the store actually has the updated data
			const storedCred = mockStore.get('cred_persist');
			expect(storedCred?.data.sessionToken).toBe('new-persisted-token');
		});

		it('should not update store if preAuthentication returns undefined for expirable property', async () => {
			const preAuthFn = jest.fn().mockResolvedValue({
				// Return does NOT include the expirable property
				otherField: 'some-value',
			});

			const credentialType: ICredentialType = {
				name: 'noTokenReturnApi',
				displayName: 'No Token Return API',
				properties: [
					{
						displayName: 'Session Token',
						name: 'sessionToken',
						type: 'hidden',
						typeOptions: { expirable: true },
						default: '',
					},
				],
				preAuthentication: preAuthFn,
			};

			const mockStore = new MockCredentialStore({
				cred_no_return: {
					id: 'cred_no_return',
					name: 'No Return Credential',
					type: 'noTokenReturnApi',
					data: {
						sessionToken: '',
					},
				},
			});

			const mockCredentialTypes = new MockCredentialTypes({
				noTokenReturnApi: credentialType,
			});

			const helper = new TemporalCredentialsHelper(
				mockStore,
				mockCredentialTypes as unknown as TemporalCredentialTypes,
			);

			const httpHelper = createMockHttpRequestHelper();
			const credentials: ICredentialDataDecryptedObject = {
				sessionToken: '',
			};

			const node = createMockNode('testNode', 'noTokenReturnApi', 'cred_no_return');

			const result = await helper.preAuthentication(
				httpHelper,
				credentials,
				'noTokenReturnApi',
				node,
				false,
			);

			// preAuthentication was called
			expect(preAuthFn).toHaveBeenCalledTimes(1);

			// But result should be undefined since expirable property not in output
			expect(result).toBeUndefined();

			// Store should NOT be updated
			expect(mockStore.updateCallCount).toBe(0);
		});
	});

	describe('No preAuthentication Function', () => {
		it('should return undefined when credential type has no preAuthentication function', async () => {
			// Credential type with expirable property but no preAuthentication function
			const credentialType: ICredentialType = {
				name: 'noPreAuthApi',
				displayName: 'No PreAuth API',
				properties: [
					{
						displayName: 'Session Token',
						name: 'sessionToken',
						type: 'hidden',
						typeOptions: { expirable: true },
						default: '',
					},
				],
				// No preAuthentication function defined
			};

			const mockStore = new MockCredentialStore({
				cred_no_preauth: {
					id: 'cred_no_preauth',
					name: 'No PreAuth Credential',
					type: 'noPreAuthApi',
					data: {
						sessionToken: '', // Empty but no preAuth to refresh
					},
				},
			});

			const mockCredentialTypes = new MockCredentialTypes({
				noPreAuthApi: credentialType,
			});

			const helper = new TemporalCredentialsHelper(
				mockStore,
				mockCredentialTypes as unknown as TemporalCredentialTypes,
			);

			const httpHelper = createMockHttpRequestHelper();
			const credentials: ICredentialDataDecryptedObject = {
				sessionToken: '',
			};

			const node = createMockNode('testNode', 'noPreAuthApi', 'cred_no_preauth');

			const result = await helper.preAuthentication(
				httpHelper,
				credentials,
				'noPreAuthApi',
				node,
				false,
			);

			expect(result).toBeUndefined();
			expect(mockStore.updateCallCount).toBe(0);
		});
	});

	describe('Node Without Credentials', () => {
		it('should not persist when node has no credentials configured', async () => {
			const preAuthFn = jest.fn().mockResolvedValue({
				sessionToken: 'new-token',
			});

			const credentialType: ICredentialType = {
				name: 'noNodeCredApi',
				displayName: 'No Node Cred API',
				properties: [
					{
						displayName: 'Session Token',
						name: 'sessionToken',
						type: 'hidden',
						typeOptions: { expirable: true },
						default: '',
					},
				],
				preAuthentication: preAuthFn,
			};

			const mockStore = new MockCredentialStore();

			const mockCredentialTypes = new MockCredentialTypes({
				noNodeCredApi: credentialType,
			});

			const helper = new TemporalCredentialsHelper(
				mockStore,
				mockCredentialTypes as unknown as TemporalCredentialTypes,
			);

			const httpHelper = createMockHttpRequestHelper();
			const credentials: ICredentialDataDecryptedObject = {
				sessionToken: '',
			};

			// Node without credentials
			const node: INode = {
				id: 'test-node-id',
				name: 'testNode',
				type: 'n8n-nodes-base.httpRequest',
				typeVersion: 1,
				position: [0, 0],
				parameters: {},
				// No credentials field
			};

			const result = await helper.preAuthentication(
				httpHelper,
				credentials,
				'noNodeCredApi',
				node,
				false,
			);

			// preAuthentication should be called
			expect(preAuthFn).toHaveBeenCalledTimes(1);

			// Result should contain the new token
			expect(result).toBeDefined();
			expect(result?.sessionToken).toBe('new-token');

			// But store should NOT be updated since node has no credentials
			expect(mockStore.updateCallCount).toBe(0);
		});

		it('should not persist when node credentials have no ID', async () => {
			const preAuthFn = jest.fn().mockResolvedValue({
				sessionToken: 'new-token',
			});

			const credentialType: ICredentialType = {
				name: 'noIdCredApi',
				displayName: 'No ID Cred API',
				properties: [
					{
						displayName: 'Session Token',
						name: 'sessionToken',
						type: 'hidden',
						typeOptions: { expirable: true },
						default: '',
					},
				],
				preAuthentication: preAuthFn,
			};

			const mockStore = new MockCredentialStore();

			const mockCredentialTypes = new MockCredentialTypes({
				noIdCredApi: credentialType,
			});

			const helper = new TemporalCredentialsHelper(
				mockStore,
				mockCredentialTypes as unknown as TemporalCredentialTypes,
			);

			const httpHelper = createMockHttpRequestHelper();
			const credentials: ICredentialDataDecryptedObject = {
				sessionToken: '',
			};

			// Node with credentials but no ID
			const node: INode = {
				id: 'test-node-id',
				name: 'testNode',
				type: 'n8n-nodes-base.httpRequest',
				typeVersion: 1,
				position: [0, 0],
				parameters: {},
				credentials: {
					noIdCredApi: {
						id: null, // No ID
						name: 'Test Credential',
					},
				},
			};

			const result = await helper.preAuthentication(
				httpHelper,
				credentials,
				'noIdCredApi',
				node,
				false,
			);

			// preAuthentication should be called
			expect(preAuthFn).toHaveBeenCalledTimes(1);

			// Result should contain the new token
			expect(result).toBeDefined();
			expect(result?.sessionToken).toBe('new-token');

			// But store should NOT be updated since credential has no ID
			expect(mockStore.updateCallCount).toBe(0);
		});
	});

	describe('HTTP Request Helper', () => {
		it('should call preAuthentication with httpHelper context', async () => {
			const preAuthFn = jest.fn().mockImplementation(async function (
				this: IHttpRequestHelper,
				credentials: ICredentialDataDecryptedObject,
			) {
				// Verify 'this' context has the helpers
				expect(this.helpers).toBeDefined();
				expect(this.helpers.httpRequest).toBeDefined();

				// Use await to satisfy linting rules
				await Promise.resolve();

				return {
					sessionToken: `token-for-${credentials.username as string}`,
				};
			});

			const credentialType: ICredentialType = {
				name: 'httpHelperApi',
				displayName: 'HTTP Helper API',
				properties: [
					{
						displayName: 'Username',
						name: 'username',
						type: 'string',
						default: '',
					},
					{
						displayName: 'Session Token',
						name: 'sessionToken',
						type: 'hidden',
						typeOptions: { expirable: true },
						default: '',
					},
				],
				preAuthentication: preAuthFn,
			};

			const mockStore = new MockCredentialStore({
				cred_http: {
					id: 'cred_http',
					name: 'HTTP Credential',
					type: 'httpHelperApi',
					data: {
						username: 'testuser',
						sessionToken: '',
					},
				},
			});

			const mockCredentialTypes = new MockCredentialTypes({
				httpHelperApi: credentialType,
			});

			const helper = new TemporalCredentialsHelper(
				mockStore,
				mockCredentialTypes as unknown as TemporalCredentialTypes,
			);

			const httpHelper = createMockHttpRequestHelper();
			const credentials: ICredentialDataDecryptedObject = {
				username: 'testuser',
				sessionToken: '',
			};

			const node = createMockNode('testNode', 'httpHelperApi', 'cred_http');

			const result = await helper.preAuthentication(
				httpHelper,
				credentials,
				'httpHelperApi',
				node,
				false,
			);

			expect(preAuthFn).toHaveBeenCalledTimes(1);
			expect(result?.sessionToken).toBe('token-for-testuser');
		});
	});

	describe('Null and Undefined Values', () => {
		it('should filter out null values from preAuthentication output', async () => {
			const preAuthFn = jest.fn().mockResolvedValue({
				sessionToken: 'new-token',
				nullField: null,
				undefinedField: undefined,
			});

			const credentialType: ICredentialType = {
				name: 'nullValuesApi',
				displayName: 'Null Values API',
				properties: [
					{
						displayName: 'Existing Field',
						name: 'existingField',
						type: 'string',
						default: '',
					},
					{
						displayName: 'Session Token',
						name: 'sessionToken',
						type: 'hidden',
						typeOptions: { expirable: true },
						default: '',
					},
				],
				preAuthentication: preAuthFn,
			};

			const mockStore = new MockCredentialStore({
				cred_null: {
					id: 'cred_null',
					name: 'Null Values Credential',
					type: 'nullValuesApi',
					data: {
						existingField: 'original-value',
						sessionToken: '',
					},
				},
			});

			const mockCredentialTypes = new MockCredentialTypes({
				nullValuesApi: credentialType,
			});

			const helper = new TemporalCredentialsHelper(
				mockStore,
				mockCredentialTypes as unknown as TemporalCredentialTypes,
			);

			const httpHelper = createMockHttpRequestHelper();
			const credentials: ICredentialDataDecryptedObject = {
				existingField: 'original-value',
				sessionToken: '',
			};

			const node = createMockNode('testNode', 'nullValuesApi', 'cred_null');

			const result = await helper.preAuthentication(
				httpHelper,
				credentials,
				'nullValuesApi',
				node,
				false,
			);

			// Result should contain valid values but not null/undefined
			expect(result?.sessionToken).toBe('new-token');
			expect(result?.existingField).toBe('original-value');
			expect(result?.nullField).toBeUndefined();
			expect(result?.undefinedField).toBeUndefined();

			// Check persisted data also filters null/undefined
			expect(mockStore.lastUpdateData?.sessionToken).toBe('new-token');
			expect(mockStore.lastUpdateData?.nullField).toBeUndefined();
		});
	});
});
