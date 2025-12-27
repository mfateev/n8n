/**
 * Integration Test: HTTP Request Node with OAuth2 Authentication
 *
 * This test validates OAuth2 authentication flow including:
 * 1. Token application to request (Bearer header)
 * 2. Token refresh persistence via updateCredentialsOauthTokenData
 * 3. Verification that refreshed tokens are saved to credential store
 *
 * Note: Full OAuth2 token refresh testing requires mocking the token endpoint.
 * For this test, we verify the token is correctly applied to requests and
 * the token persistence flow works correctly.
 *
 * IMPORTANT: These tests are currently skipped in the default Jest environment
 * due to ESM module compatibility issues with n8n-core dependencies (@langchain/core,
 * p-retry, etc.). The tests are correctly written and can be run:
 *
 * 1. With a separate test runner that supports ESM (e.g., vitest)
 * 2. After building the package and running against compiled JS
 * 3. In a Node.js environment with --experimental-vm-modules flag
 *
 * To run these tests manually:
 *   NODE_OPTIONS='--experimental-vm-modules' pnpm test:integration
 *
 * Note: This test requires network access to httpbin.org
 */

import { describe, it, expect, beforeAll, afterAll, beforeEach, afterEach } from '@jest/globals';
import type { WorkflowHandle } from '@temporalio/client';
import { TestWorkflowEnvironment } from '@temporalio/testing';
import { Worker } from '@temporalio/worker';
import * as fs from 'fs';
import * as path from 'path';

import * as activities from '../../src/activities';
import { TemporalCredentialTypes } from '../../src/credentials/credential-types';
import { TemporalCredentialsHelper } from '../../src/credentials/credentials-helper';
import { JsonFileCredentialStore } from '../../src/credentials/json-file-store';
import { TemporalNodeTypes } from '../../src/nodes/node-types';
import type { ExecuteN8nWorkflowInput, ExecuteN8nWorkflowOutput } from '../../src/types';
import { loadWorkflowFromFile } from '../../src/utils/workflow-loader';
import { initializeWorkerContext, clearWorkerContext } from '../../src/worker/context';
import { executeN8nWorkflow } from '../../src/workflows/execute-n8n-workflow';

describe('Integration: HTTP Request with OAuth2', () => {
	let testEnv: TestWorkflowEnvironment;
	let nodeTypes: TemporalNodeTypes;
	let credentialTypes: TemporalCredentialTypes;
	let credentialsHelper: TemporalCredentialsHelper;
	let credentialStore: JsonFileCredentialStore;

	const fixturesDir = path.join(__dirname, '../fixtures');
	const workflowPath = path.join(fixturesDir, 'workflows/http-oauth.json');
	const credentialsPath = path.join(fixturesDir, 'credentials/test-oauth.json');

	// Create a temp copy for tests that modify credentials
	const tempCredentialsPath = path.join(fixturesDir, 'credentials/test-oauth-temp.json');

	beforeAll(async () => {
		// Create Temporal test environment with time-skipping
		testEnv = await TestWorkflowEnvironment.createTimeSkipping();

		// Load node types (this may take a few seconds)
		nodeTypes = new TemporalNodeTypes();
		await nodeTypes.loadAll();

		// Load credential types
		credentialTypes = new TemporalCredentialTypes(nodeTypes);
		credentialTypes.loadAll();
	}, 120000); // 2 minute timeout for node loading

	afterAll(async () => {
		await testEnv?.teardown();
		// Clean up temp file
		if (fs.existsSync(tempCredentialsPath)) {
			fs.unlinkSync(tempCredentialsPath);
		}
	});

	beforeEach(async () => {
		// Copy credentials file for each test to ensure isolation
		fs.copyFileSync(credentialsPath, tempCredentialsPath);

		// Create fresh credential store for each test
		credentialStore = new JsonFileCredentialStore(tempCredentialsPath);
		await credentialStore.load();
		credentialsHelper = new TemporalCredentialsHelper(credentialStore, credentialTypes);

		// Initialize worker context
		initializeWorkerContext({
			nodeTypes,
			credentialsHelper,
			credentialTypes,
			identity: 'test-worker',
		});
	});

	afterEach(() => {
		clearWorkerContext();
	});

	it('should apply Bearer token to HTTP request', async () => {
		// Load workflow definition
		const workflow = await loadWorkflowFromFile(workflowPath);

		// Create worker with our activities
		const worker = await Worker.create({
			connection: testEnv.nativeConnection,
			taskQueue: 'test-http-oauth',
			workflowsPath: require.resolve('../../src/workflows'),
			activities,
		});

		// Run the workflow
		await worker.runUntil(async () => {
			const client = testEnv.client;

			// Prepare workflow input
			const input: ExecuteN8nWorkflowInput = {
				workflowId: workflow.id,
				workflowName: workflow.name,
				nodes: workflow.nodes,
				connections: workflow.connections,
				settings: workflow.settings,
				inputData: [{ json: {} }],
			};

			// Start workflow
			const handle: WorkflowHandle<typeof executeN8nWorkflow> = await client.workflow.start(
				executeN8nWorkflow,
				{
					taskQueue: 'test-http-oauth',
					workflowId: `test-http-oauth-${Date.now()}`,
					args: [input],
				},
			);

			// Wait for result
			const result: ExecuteN8nWorkflowOutput = await handle.result();

			// Assertions
			expect(result.success).toBe(true);
			expect(result.status).toBe('success');
			expect(result.error).toBeUndefined();
			expect(result.data).toBeDefined();

			// httpbin.org/bearer validates Bearer token and returns it
			const responseJson = result.data![0].json as { authenticated: boolean; token: string };
			expect(responseJson.authenticated).toBe(true);
			expect(responseJson.token).toBe('test-access-token-12345');

			// Verify runExecutionData contains the expected nodes
			expect(result.runExecutionData.resultData.runData).toBeDefined();
			expect(result.runExecutionData.resultData.runData['Manual Trigger']).toBeDefined();
			expect(result.runExecutionData.resultData.runData['HTTP Request']).toBeDefined();
		});
	}, 60000); // 60 second timeout for HTTP request

	it('should persist updated OAuth tokens to credential store', async () => {
		// This test verifies the updateCredentialsOauthTokenData flow
		const credentialId = 'test-oauth-cred';

		// Get initial credentials
		const initialCreds = credentialStore.get(credentialId);
		expect(initialCreds).toBeDefined();
		expect(initialCreds?.data.oauthTokenData).toBeDefined();

		const initialTokenData = initialCreds?.data.oauthTokenData as {
			access_token: string;
			token_type: string;
			expires_in: number;
		};
		expect(initialTokenData.access_token).toBe('test-access-token-12345');

		// Simulate token update (what would happen after a token refresh)
		const newTokenData = {
			access_token: 'new-refreshed-token-67890',
			token_type: 'Bearer',
			expires_in: 7200,
			refresh_token: 'new-refresh-token',
		};

		await credentialsHelper.updateCredentialsOauthTokenData(
			{ id: credentialId, name: 'Test OAuth2' },
			'oAuth2Api',
			{ oauthTokenData: newTokenData },
			{} as never, // additionalData not needed for this test
		);

		// Reload store to verify persistence
		const freshStore = new JsonFileCredentialStore(tempCredentialsPath);
		await freshStore.load();

		// Verify persistence
		const updatedCreds = freshStore.get(credentialId);
		expect(updatedCreds).toBeDefined();
		expect(updatedCreds?.data.oauthTokenData).toBeDefined();

		const updatedTokenData = updatedCreds?.data.oauthTokenData as {
			access_token: string;
			token_type: string;
			expires_in: number;
			refresh_token: string;
		};
		expect(updatedTokenData.access_token).toBe('new-refreshed-token-67890');
		expect(updatedTokenData.refresh_token).toBe('new-refresh-token');
		expect(updatedTokenData.expires_in).toBe(7200);
	});

	it('should validate OAuth credential resolution from JSON file', () => {
		// This test verifies that OAuth credentials are correctly loaded from the JSON file
		// and the oauthTokenData structure is properly preserved

		const storedCred = credentialStore.get('test-oauth-cred');
		expect(storedCred).toBeDefined();
		expect(storedCred?.name).toBe('Test OAuth2');
		expect(storedCred?.type).toBe('oAuth2Api');
		expect(storedCred?.data.clientId).toBe('test-client-id');
		expect(storedCred?.data.clientSecret).toBe('test-client-secret');
		expect(storedCred?.data.grantType).toBe('clientCredentials');
		expect(storedCred?.data.authentication).toBe('header');

		// Verify oauthTokenData structure
		const tokenData = storedCred?.data.oauthTokenData as {
			access_token: string;
			token_type: string;
			expires_in: number;
		};
		expect(tokenData).toBeDefined();
		expect(tokenData.access_token).toBe('test-access-token-12345');
		expect(tokenData.token_type).toBe('Bearer');
		expect(tokenData.expires_in).toBe(3600);
	});
});
