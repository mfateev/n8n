/**
 * Unit tests for TemporalCredentialsHelper
 *
 * Tests credential authentication functionality including:
 * - Generic authentication (headers, query string, body)
 * - Custom function authentication
 * - Expression resolution in auth properties
 */

/* eslint-disable @typescript-eslint/naming-convention */

import type {
	ICredentialDataDecryptedObject,
	ICredentialType,
	IHttpRequestOptions,
	INode,
	INodeProperties,
} from 'n8n-workflow';
import { Workflow } from 'n8n-workflow';

import type { CredentialStore, StoredCredential } from '../../src/credentials/credential-store';
import type { TemporalCredentialTypes } from '../../src/credentials/credential-types';
import { TemporalCredentialsHelper } from '../../src/credentials/credentials-helper';

// Mock implementations
class MockCredentialStore implements CredentialStore {
	private credentials: Map<string, StoredCredential> = new Map();

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

// Helper to create a minimal mock node
function createMockNode(name = 'testNode'): INode {
	return {
		id: 'test-node-id',
		name,
		type: 'n8n-nodes-base.httpRequest',
		typeVersion: 1,
		position: [0, 0],
		parameters: {},
	};
}

// Helper to create a minimal mock workflow
function createMockWorkflow(): Workflow {
	return new Workflow({
		id: 'test-workflow',
		name: 'Test Workflow',
		nodes: [],
		connections: {},
		active: false,
		nodeTypes: {
			getByNameAndVersion: () =>
				({
					description: {
						properties: [] as INodeProperties[],
						displayName: 'Mock Node',
						name: 'mockNode',
						group: ['transform'],
						version: 1,
						defaults: {},
						inputs: ['main'],
						outputs: ['main'],
					},
				}) as never,
			getByName: () =>
				({
					description: {
						properties: [] as INodeProperties[],
						displayName: 'Mock Node',
						name: 'mockNode',
						group: ['transform'],
						version: 1,
						defaults: {},
						inputs: ['main'],
						outputs: ['main'],
					},
				}) as never,
			getKnownTypes: () => ({}),
		},
	});
}

describe('TemporalCredentialsHelper', () => {
	describe('authenticate()', () => {
		describe('Generic Authentication', () => {
			it('should apply API key to headers', async () => {
				// Setup credential type with header auth
				const credentialType: ICredentialType = {
					name: 'headerAuthApi',
					displayName: 'Header Auth API',
					properties: [
						{
							displayName: 'API Key',
							name: 'apiKey',
							type: 'string',
							default: '',
						},
					],
					authenticate: {
						type: 'generic',
						properties: {
							headers: {
								'X-API-Key': '={{$credentials.apiKey}}',
							},
						},
					},
				};

				const mockStore = new MockCredentialStore({
					cred_1: {
						id: 'cred_1',
						name: 'Test Header Auth',
						type: 'headerAuthApi',
						data: { apiKey: 'my-secret-api-key' },
					},
				});

				const mockCredentialTypes = new MockCredentialTypes({
					headerAuthApi: credentialType,
				});

				const helper = new TemporalCredentialsHelper(
					mockStore,
					mockCredentialTypes as unknown as TemporalCredentialTypes,
				);

				const credentials: ICredentialDataDecryptedObject = {
					apiKey: 'my-secret-api-key',
				};

				const requestOptions: IHttpRequestOptions = {
					url: 'https://api.example.com/data',
					method: 'GET',
				};

				const workflow = createMockWorkflow();
				const node = createMockNode();

				const result = await helper.authenticate(
					credentials,
					'headerAuthApi',
					requestOptions,
					workflow,
					node,
				);

				expect(result.headers).toBeDefined();
				expect(result.headers!['X-API-Key']).toBe('my-secret-api-key');
			});

			it('should apply API key to query string', async () => {
				// Setup credential type with query string auth
				const credentialType: ICredentialType = {
					name: 'queryAuthApi',
					displayName: 'Query Auth API',
					properties: [
						{
							displayName: 'API Key',
							name: 'apiKey',
							type: 'string',
							default: '',
						},
					],
					authenticate: {
						type: 'generic',
						properties: {
							qs: {
								api_key: '={{$credentials.apiKey}}',
							},
						},
					},
				};

				const mockStore = new MockCredentialStore();
				const mockCredentialTypes = new MockCredentialTypes({
					queryAuthApi: credentialType,
				});

				const helper = new TemporalCredentialsHelper(
					mockStore,
					mockCredentialTypes as unknown as TemporalCredentialTypes,
				);

				const credentials: ICredentialDataDecryptedObject = {
					apiKey: 'query-api-key-123',
				};

				const requestOptions: IHttpRequestOptions = {
					url: 'https://api.example.com/data',
					method: 'GET',
				};

				const workflow = createMockWorkflow();
				const node = createMockNode();

				const result = await helper.authenticate(
					credentials,
					'queryAuthApi',
					requestOptions,
					workflow,
					node,
				);

				expect(result.qs).toBeDefined();
				expect((result.qs as Record<string, string>).api_key).toBe('query-api-key-123');
			});

			it('should apply multiple authentication properties', async () => {
				// Setup credential type with both headers and qs
				const credentialType: ICredentialType = {
					name: 'multiAuthApi',
					displayName: 'Multi Auth API',
					properties: [
						{
							displayName: 'API Key',
							name: 'apiKey',
							type: 'string',
							default: '',
						},
						{
							displayName: 'Client ID',
							name: 'clientId',
							type: 'string',
							default: '',
						},
					],
					authenticate: {
						type: 'generic',
						properties: {
							headers: {
								Authorization: '={{$credentials.apiKey}}',
							},
							qs: {
								client_id: '={{$credentials.clientId}}',
							},
						},
					},
				};

				const mockStore = new MockCredentialStore();
				const mockCredentialTypes = new MockCredentialTypes({
					multiAuthApi: credentialType,
				});

				const helper = new TemporalCredentialsHelper(
					mockStore,
					mockCredentialTypes as unknown as TemporalCredentialTypes,
				);

				const credentials: ICredentialDataDecryptedObject = {
					apiKey: 'Bearer token123',
					clientId: 'client-abc',
				};

				const requestOptions: IHttpRequestOptions = {
					url: 'https://api.example.com/data',
					method: 'GET',
				};

				const workflow = createMockWorkflow();
				const node = createMockNode();

				const result = await helper.authenticate(
					credentials,
					'multiAuthApi',
					requestOptions,
					workflow,
					node,
				);

				expect(result.headers).toBeDefined();
				expect(result.headers!.Authorization).toBe('Bearer token123');
				expect(result.qs).toBeDefined();
				expect((result.qs as Record<string, string>).client_id).toBe('client-abc');
			});

			it('should resolve expressions in authentication properties', async () => {
				// Setup credential type with expression-based header
				const credentialType: ICredentialType = {
					name: 'expressionAuthApi',
					displayName: 'Expression Auth API',
					properties: [
						{
							displayName: 'Token',
							name: 'token',
							type: 'string',
							default: '',
						},
					],
					authenticate: {
						type: 'generic',
						properties: {
							headers: {
								Authorization: '=Bearer {{$credentials.token}}',
							},
						},
					},
				};

				const mockStore = new MockCredentialStore();
				const mockCredentialTypes = new MockCredentialTypes({
					expressionAuthApi: credentialType,
				});

				const helper = new TemporalCredentialsHelper(
					mockStore,
					mockCredentialTypes as unknown as TemporalCredentialTypes,
				);

				const credentials: ICredentialDataDecryptedObject = {
					token: 'abc123xyz',
				};

				const requestOptions: IHttpRequestOptions = {
					url: 'https://api.example.com/data',
					method: 'GET',
				};

				const workflow = createMockWorkflow();
				const node = createMockNode();

				const result = await helper.authenticate(
					credentials,
					'expressionAuthApi',
					requestOptions,
					workflow,
					node,
				);

				expect(result.headers).toBeDefined();
				expect(result.headers!.Authorization).toBe('Bearer abc123xyz');
			});

			it('should handle non-expression static values', async () => {
				// Setup credential type with static header value
				const credentialType: ICredentialType = {
					name: 'staticAuthApi',
					displayName: 'Static Auth API',
					properties: [],
					authenticate: {
						type: 'generic',
						properties: {
							headers: {
								'X-Custom-Header': 'static-value',
							},
						},
					},
				};

				const mockStore = new MockCredentialStore();
				const mockCredentialTypes = new MockCredentialTypes({
					staticAuthApi: credentialType,
				});

				const helper = new TemporalCredentialsHelper(
					mockStore,
					mockCredentialTypes as unknown as TemporalCredentialTypes,
				);

				const credentials: ICredentialDataDecryptedObject = {};

				const requestOptions: IHttpRequestOptions = {
					url: 'https://api.example.com/data',
					method: 'GET',
				};

				const workflow = createMockWorkflow();
				const node = createMockNode();

				const result = await helper.authenticate(
					credentials,
					'staticAuthApi',
					requestOptions,
					workflow,
					node,
				);

				expect(result.headers).toBeDefined();
				expect(result.headers!['X-Custom-Header']).toBe('static-value');
			});

			it('should preserve existing headers when adding authentication', async () => {
				const credentialType: ICredentialType = {
					name: 'preserveHeadersApi',
					displayName: 'Preserve Headers API',
					properties: [
						{
							displayName: 'API Key',
							name: 'apiKey',
							type: 'string',
							default: '',
						},
					],
					authenticate: {
						type: 'generic',
						properties: {
							headers: {
								'X-API-Key': '={{$credentials.apiKey}}',
							},
						},
					},
				};

				const mockStore = new MockCredentialStore();
				const mockCredentialTypes = new MockCredentialTypes({
					preserveHeadersApi: credentialType,
				});

				const helper = new TemporalCredentialsHelper(
					mockStore,
					mockCredentialTypes as unknown as TemporalCredentialTypes,
				);

				const credentials: ICredentialDataDecryptedObject = {
					apiKey: 'my-key',
				};

				const requestOptions: IHttpRequestOptions = {
					url: 'https://api.example.com/data',
					method: 'GET',
					headers: {
						'Content-Type': 'application/json',
						Accept: 'application/json',
					},
				};

				const workflow = createMockWorkflow();
				const node = createMockNode();

				const result = await helper.authenticate(
					credentials,
					'preserveHeadersApi',
					requestOptions,
					workflow,
					node,
				);

				expect(result.headers).toBeDefined();
				expect(result.headers!['Content-Type']).toBe('application/json');
				expect(result.headers!.Accept).toBe('application/json');
				expect(result.headers!['X-API-Key']).toBe('my-key');
			});
		});

		describe('Custom Function Authentication', () => {
			it('should call custom authenticate function', async () => {
				// Setup credential type with custom function auth
				const customAuthFn = jest.fn(
					async (
						credentials: ICredentialDataDecryptedObject,
						requestOptions: IHttpRequestOptions,
					): Promise<IHttpRequestOptions> => {
						await Promise.resolve();
						return {
							...requestOptions,
							headers: {
								...requestOptions.headers,
								Authorization: `Bearer ${credentials.token as string}`,
								'X-Custom': 'custom-value',
							},
						};
					},
				);

				const credentialType: ICredentialType = {
					name: 'customAuthApi',
					displayName: 'Custom Auth API',
					properties: [
						{
							displayName: 'Token',
							name: 'token',
							type: 'string',
							default: '',
						},
					],
					authenticate: customAuthFn,
				};

				const mockStore = new MockCredentialStore();
				const mockCredentialTypes = new MockCredentialTypes({
					customAuthApi: credentialType,
				});

				const helper = new TemporalCredentialsHelper(
					mockStore,
					mockCredentialTypes as unknown as TemporalCredentialTypes,
				);

				const credentials: ICredentialDataDecryptedObject = {
					token: 'custom-token-xyz',
				};

				const requestOptions: IHttpRequestOptions = {
					url: 'https://api.example.com/data',
					method: 'POST',
				};

				const workflow = createMockWorkflow();
				const node = createMockNode();

				const result = await helper.authenticate(
					credentials,
					'customAuthApi',
					requestOptions,
					workflow,
					node,
				);

				expect(customAuthFn).toHaveBeenCalledTimes(1);
				expect(customAuthFn).toHaveBeenCalledWith(credentials, requestOptions);
				expect(result.headers).toBeDefined();
				expect(result.headers!.Authorization).toBe('Bearer custom-token-xyz');
				expect(result.headers!['X-Custom']).toBe('custom-value');
			});

			it('should handle async custom authenticate function', async () => {
				const credentialType: ICredentialType = {
					name: 'asyncAuthApi',
					displayName: 'Async Auth API',
					properties: [],
					authenticate: async (
						_credentials: ICredentialDataDecryptedObject,
						requestOptions: IHttpRequestOptions,
					): Promise<IHttpRequestOptions> => {
						// Simulate async operation
						await new Promise((resolve) => setTimeout(resolve, 10));
						return {
							...requestOptions,
							headers: {
								...requestOptions.headers,
								'X-Async-Header': 'async-value',
							},
						};
					},
				};

				const mockStore = new MockCredentialStore();
				const mockCredentialTypes = new MockCredentialTypes({
					asyncAuthApi: credentialType,
				});

				const helper = new TemporalCredentialsHelper(
					mockStore,
					mockCredentialTypes as unknown as TemporalCredentialTypes,
				);

				const credentials: ICredentialDataDecryptedObject = {};
				const requestOptions: IHttpRequestOptions = {
					url: 'https://api.example.com/data',
					method: 'GET',
				};

				const workflow = createMockWorkflow();
				const node = createMockNode();

				const result = await helper.authenticate(
					credentials,
					'asyncAuthApi',
					requestOptions,
					workflow,
					node,
				);

				expect(result.headers).toBeDefined();
				expect(result.headers!['X-Async-Header']).toBe('async-value');
			});
		});

		describe('No Authentication', () => {
			it('should return request options unchanged when no authenticate defined', async () => {
				const credentialType: ICredentialType = {
					name: 'noAuthApi',
					displayName: 'No Auth API',
					properties: [
						{
							displayName: 'API URL',
							name: 'apiUrl',
							type: 'string',
							default: '',
						},
					],
					// No authenticate property defined
				};

				const mockStore = new MockCredentialStore();
				const mockCredentialTypes = new MockCredentialTypes({
					noAuthApi: credentialType,
				});

				const helper = new TemporalCredentialsHelper(
					mockStore,
					mockCredentialTypes as unknown as TemporalCredentialTypes,
				);

				const credentials: ICredentialDataDecryptedObject = {
					apiUrl: 'https://example.com',
				};

				const requestOptions: IHttpRequestOptions = {
					url: 'https://api.example.com/data',
					method: 'GET',
					headers: {
						'Content-Type': 'application/json',
					},
				};

				const workflow = createMockWorkflow();
				const node = createMockNode();

				const result = await helper.authenticate(
					credentials,
					'noAuthApi',
					requestOptions,
					workflow,
					node,
				);

				// Should return unchanged
				expect(result.url).toBe('https://api.example.com/data');
				expect(result.method).toBe('GET');
				expect(result.headers).toBeDefined();
				expect(result.headers!['Content-Type']).toBe('application/json');
			});
		});

		describe('Edge Cases', () => {
			it('should throw for unknown credential type', async () => {
				const mockStore = new MockCredentialStore();
				const mockCredentialTypes = new MockCredentialTypes({});

				const helper = new TemporalCredentialsHelper(
					mockStore,
					mockCredentialTypes as unknown as TemporalCredentialTypes,
				);

				const credentials: ICredentialDataDecryptedObject = {};
				const requestOptions: IHttpRequestOptions = {
					url: 'https://api.example.com/data',
					method: 'GET',
				};

				const workflow = createMockWorkflow();
				const node = createMockNode();

				await expect(
					helper.authenticate(credentials, 'unknownType', requestOptions, workflow, node),
				).rejects.toThrow('Unknown credential type: unknownType');
			});

			it('should handle empty expression result gracefully', async () => {
				const credentialType: ICredentialType = {
					name: 'emptyExprApi',
					displayName: 'Empty Expression API',
					properties: [
						{
							displayName: 'Token',
							name: 'token',
							type: 'string',
							default: '',
						},
					],
					authenticate: {
						type: 'generic',
						properties: {
							headers: {
								Authorization: '={{$credentials.nonexistent}}',
							},
						},
					},
				};

				const mockStore = new MockCredentialStore();
				const mockCredentialTypes = new MockCredentialTypes({
					emptyExprApi: credentialType,
				});

				const helper = new TemporalCredentialsHelper(
					mockStore,
					mockCredentialTypes as unknown as TemporalCredentialTypes,
				);

				const credentials: ICredentialDataDecryptedObject = {
					token: 'value',
				};

				const requestOptions: IHttpRequestOptions = {
					url: 'https://api.example.com/data',
					method: 'GET',
				};

				const workflow = createMockWorkflow();
				const node = createMockNode();

				const result = await helper.authenticate(
					credentials,
					'emptyExprApi',
					requestOptions,
					workflow,
					node,
				);

				// Should handle gracefully (empty string)
				expect(result.headers).toBeDefined();
				expect(result.headers!.Authorization).toBe('');
			});
		});
	});

	describe('getParentTypes()', () => {
		it('should delegate to credential types registry', () => {
			const mockStore = new MockCredentialStore();
			const mockCredentialTypes = {
				getByName: jest.fn(),
				getParentTypes: jest.fn().mockReturnValue(['oAuth2Api', 'baseApi']),
				recognizes: jest.fn(),
			};

			const helper = new TemporalCredentialsHelper(
				mockStore,
				mockCredentialTypes as unknown as TemporalCredentialTypes,
			);

			const result = helper.getParentTypes('googleOAuth2Api');

			expect(mockCredentialTypes.getParentTypes).toHaveBeenCalledWith('googleOAuth2Api');
			expect(result).toEqual(['oAuth2Api', 'baseApi']);
		});
	});

	describe('getCredentials()', () => {
		it('should return credentials from store', async () => {
			const mockStore = new MockCredentialStore({
				cred_123: {
					id: 'cred_123',
					name: 'Test Credential',
					type: 'testApi',
					data: { apiKey: 'secret-key' },
				},
			});

			const mockCredentialTypes = new MockCredentialTypes();

			const helper = new TemporalCredentialsHelper(
				mockStore,
				mockCredentialTypes as unknown as TemporalCredentialTypes,
			);

			const result = await helper.getCredentials(
				{ id: 'cred_123', name: 'Test Credential' },
				'testApi',
			);

			expect(result).toBeDefined();
			expect(result.id).toBe('cred_123');
			expect(result.name).toBe('Test Credential');
			expect(result.type).toBe('testApi');
			expect(result.getData()).toEqual({ apiKey: 'secret-key' });
		});

		it('should throw when credential ID is missing', async () => {
			const mockStore = new MockCredentialStore();
			const mockCredentialTypes = new MockCredentialTypes();

			const helper = new TemporalCredentialsHelper(
				mockStore,
				mockCredentialTypes as unknown as TemporalCredentialTypes,
			);

			await expect(helper.getCredentials({ id: null, name: 'Test' }, 'testApi')).rejects.toThrow(
				'Credential ID is required',
			);
		});

		it('should throw when credential not found', async () => {
			const mockStore = new MockCredentialStore();
			const mockCredentialTypes = new MockCredentialTypes();

			const helper = new TemporalCredentialsHelper(
				mockStore,
				mockCredentialTypes as unknown as TemporalCredentialTypes,
			);

			await expect(
				helper.getCredentials({ id: 'nonexistent', name: 'Test' }, 'testApi'),
			).rejects.toThrow('Credential not found: nonexistent (type: testApi)');
		});
	});

	describe('updateCredentials()', () => {
		it('should update credentials in store', async () => {
			const mockStore = new MockCredentialStore({
				cred_123: {
					id: 'cred_123',
					name: 'Test Credential',
					type: 'testApi',
					data: { apiKey: 'old-key' },
				},
			});

			const mockCredentialTypes = new MockCredentialTypes();

			const helper = new TemporalCredentialsHelper(
				mockStore,
				mockCredentialTypes as unknown as TemporalCredentialTypes,
			);

			await helper.updateCredentials({ id: 'cred_123', name: 'Test Credential' }, 'testApi', {
				apiKey: 'new-key',
				newField: 'value',
			});

			const updated = mockStore.get('cred_123');
			expect(updated?.data.apiKey).toBe('new-key');
			expect(updated?.data.newField).toBe('value');
		});

		it('should throw when credential ID is missing', async () => {
			const mockStore = new MockCredentialStore();
			const mockCredentialTypes = new MockCredentialTypes();

			const helper = new TemporalCredentialsHelper(
				mockStore,
				mockCredentialTypes as unknown as TemporalCredentialTypes,
			);

			await expect(
				helper.updateCredentials({ id: null, name: 'Test' }, 'testApi', { key: 'value' }),
			).rejects.toThrow('Credential ID is required for update');
		});
	});

	describe('updateCredentialsOauthTokenData()', () => {
		it('should update OAuth token data in credentials', async () => {
			const mockStore = new MockCredentialStore({
				oauth_cred: {
					id: 'oauth_cred',
					name: 'OAuth Credential',
					type: 'oAuth2Api',
					data: {
						clientId: 'client-123',
						clientSecret: 'secret',
						oauthTokenData: {
							access_token: 'old-token',
							refresh_token: 'refresh-123',
						},
					},
				},
			});

			const mockCredentialTypes = new MockCredentialTypes();

			const helper = new TemporalCredentialsHelper(
				mockStore,
				mockCredentialTypes as unknown as TemporalCredentialTypes,
			);

			await helper.updateCredentialsOauthTokenData(
				{ id: 'oauth_cred', name: 'OAuth Credential' },
				'oAuth2Api',
				{
					oauthTokenData: {
						access_token: 'new-token',
						refresh_token: 'new-refresh',
						expires_in: 3600,
					},
				},
				{} as never, // additionalData not used in implementation
			);

			const updated = mockStore.get('oauth_cred');
			expect(updated?.data.clientId).toBe('client-123');
			expect(updated?.data.clientSecret).toBe('secret');
			expect(updated?.data.oauthTokenData).toEqual({
				access_token: 'new-token',
				refresh_token: 'new-refresh',
				expires_in: 3600,
			});
		});

		it('should throw when credential ID is missing', async () => {
			const mockStore = new MockCredentialStore();
			const mockCredentialTypes = new MockCredentialTypes();

			const helper = new TemporalCredentialsHelper(
				mockStore,
				mockCredentialTypes as unknown as TemporalCredentialTypes,
			);

			await expect(
				helper.updateCredentialsOauthTokenData(
					{ id: null, name: 'Test' },
					'oAuth2Api',
					{ oauthTokenData: {} },
					{} as never,
				),
			).rejects.toThrow('Credential ID is required for OAuth update');
		});

		it('should throw when credential not found', async () => {
			const mockStore = new MockCredentialStore();
			const mockCredentialTypes = new MockCredentialTypes();

			const helper = new TemporalCredentialsHelper(
				mockStore,
				mockCredentialTypes as unknown as TemporalCredentialTypes,
			);

			await expect(
				helper.updateCredentialsOauthTokenData(
					{ id: 'nonexistent', name: 'Test' },
					'oAuth2Api',
					{ oauthTokenData: {} },
					{} as never,
				),
			).rejects.toThrow('Credential not found: nonexistent');
		});
	});
});
