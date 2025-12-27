/**
 * Integration Test: HTTP Request Node with API Key Authentication
 *
 * This test validates that the HTTP Request node correctly applies
 * API key authentication from credentials when making requests.
 *
 * Uses httpbin.org/headers which echoes back all request headers.
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

describe('Integration: HTTP Request with API Key', () => {
	let testEnv: TestWorkflowEnvironment;
	let nodeTypes: TemporalNodeTypes;
	let credentialTypes: TemporalCredentialTypes;
	let credentialsHelper: TemporalCredentialsHelper;

	const fixturesDir = path.join(__dirname, '../fixtures');
	const workflowPath = path.join(fixturesDir, 'workflows/http-api-key.json');
	const credentialsPath = path.join(fixturesDir, 'credentials/test-api-key.json');

	beforeAll(async () => {
		// Create Temporal test environment with time-skipping
		testEnv = await TestWorkflowEnvironment.createTimeSkipping();

		// Load node types (this may take a few seconds)
		nodeTypes = new TemporalNodeTypes();
		await nodeTypes.loadAll();

		// Load credential types
		credentialTypes = new TemporalCredentialTypes(nodeTypes);
		credentialTypes.loadAll();

		// Create credential store and helper with API key credentials
		const credentialStore = new JsonFileCredentialStore(credentialsPath);
		await credentialStore.load();
		credentialsHelper = new TemporalCredentialsHelper(credentialStore, credentialTypes);
	}, 120000); // 2 minute timeout for node loading

	afterAll(async () => {
		await testEnv?.teardown();
	});

	beforeEach(() => {
		// Initialize worker context before each test
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

	it('should apply API key header to HTTP request', async () => {
		// Load workflow definition
		const workflow = await loadWorkflowFromFile(workflowPath);

		// Create worker with our activities
		const worker = await Worker.create({
			connection: testEnv.nativeConnection,
			taskQueue: 'test-http-api-key',
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
					taskQueue: 'test-http-api-key',
					workflowId: `test-http-api-key-${Date.now()}`,
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
			expect(result.data).toHaveLength(1);

			// httpbin.org/headers returns all headers in the response
			const responseJson = result.data![0].json as { headers: Record<string, string> };
			expect(responseJson.headers).toBeDefined();

			// Verify our API key header was sent
			// Note: httpbin normalizes header names to title case
			expect(responseJson.headers['X-Api-Key']).toBe('test-api-key-12345');

			// Verify runExecutionData contains the expected nodes
			expect(result.runExecutionData.resultData.runData).toBeDefined();
			expect(result.runExecutionData.resultData.runData['Manual Trigger']).toBeDefined();
			expect(result.runExecutionData.resultData.runData['HTTP Request']).toBeDefined();
		});
	}, 60000); // 60 second timeout for HTTP request

	it('should validate credential resolution from JSON file', async () => {
		// This test verifies that credentials are correctly loaded from the JSON file
		// and available for authentication

		// Verify the credential store loaded the API key credential
		const credentialStore = new JsonFileCredentialStore(credentialsPath);
		await credentialStore.load();

		const storedCred = credentialStore.get('test-api-key-cred');
		expect(storedCred).toBeDefined();
		expect(storedCred?.name).toBe('Test API Key');
		expect(storedCred?.type).toBe('httpHeaderAuth');
		expect(storedCred?.data.name).toBe('X-API-Key');
		expect(storedCred?.data.value).toBe('test-api-key-12345');
	});
});
