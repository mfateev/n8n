/**
 * Integration Test: Simple Set Node Workflow
 *
 * This test validates the complete execution flow through Temporal:
 * 1. Worker initialization with node types and credentials
 * 2. Workflow start via Temporal client
 * 3. Activity execution (WorkflowExecute.processRunExecutionData)
 * 4. Result retrieval
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
 * Note: This test requires the Temporal test environment (time-skipping mode).
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

describe('Integration: Simple Set Node Workflow', () => {
	let testEnv: TestWorkflowEnvironment;
	let nodeTypes: TemporalNodeTypes;
	let credentialTypes: TemporalCredentialTypes;
	let credentialsHelper: TemporalCredentialsHelper;

	// Paths to test fixtures
	const fixturesDir = path.join(__dirname, '../fixtures');
	const workflowPath = path.join(fixturesDir, 'workflows/simple-set.json');
	const credentialsPath = path.join(fixturesDir, 'credentials/empty.json');

	beforeAll(async () => {
		// Create Temporal test environment with time-skipping
		testEnv = await TestWorkflowEnvironment.createTimeSkipping();

		// Load node types (this may take a few seconds)
		nodeTypes = new TemporalNodeTypes();
		await nodeTypes.loadAll();

		// Load credential types
		credentialTypes = new TemporalCredentialTypes(nodeTypes);
		credentialTypes.loadAll();

		// Create credential store and helper
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

	it('should execute a simple Set node workflow', async () => {
		// Load workflow definition
		const workflow = await loadWorkflowFromFile(workflowPath);

		// Create worker with our activities
		const worker = await Worker.create({
			connection: testEnv.nativeConnection,
			taskQueue: 'test-simple-set',
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
				staticData: workflow.staticData,
				inputData: [{ json: { inputValue: 'test' } }],
			};

			// Start workflow
			const handle: WorkflowHandle<typeof executeN8nWorkflow> = await client.workflow.start(
				executeN8nWorkflow,
				{
					taskQueue: 'test-simple-set',
					workflowId: `test-simple-set-${Date.now()}`,
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

			// Check the Set node output
			const outputItem = result.data![0];
			expect(outputItem.json.greeting).toBe('Hello from Temporal!');
			expect(outputItem.json.timestamp).toBeDefined();
			expect(typeof outputItem.json.timestamp).toBe('number');

			// Check that original input was preserved (includeOtherFields: true)
			expect(outputItem.json.inputValue).toBe('test');

			// Verify runExecutionData contains the expected nodes
			expect(result.runExecutionData.resultData.runData).toBeDefined();
			expect(result.runExecutionData.resultData.runData['Manual Trigger']).toBeDefined();
			expect(result.runExecutionData.resultData.runData['Set Data']).toBeDefined();
		});
	}, 30000);

	it('should handle workflow with expression in Set node', async () => {
		// Load workflow definition
		const workflow = await loadWorkflowFromFile(workflowPath);

		// Create worker
		const worker = await Worker.create({
			connection: testEnv.nativeConnection,
			taskQueue: 'test-expression',
			workflowsPath: require.resolve('../../src/workflows'),
			activities,
		});

		await worker.runUntil(async () => {
			const client = testEnv.client;

			// Input with a value that should be preserved
			const inputData = [{ json: { originalData: 'preserved' } }];

			const input: ExecuteN8nWorkflowInput = {
				workflowId: workflow.id,
				workflowName: workflow.name,
				nodes: workflow.nodes,
				connections: workflow.connections,
				settings: workflow.settings,
				inputData,
			};

			const handle = await client.workflow.start(executeN8nWorkflow, {
				taskQueue: 'test-expression',
				workflowId: `test-expression-${Date.now()}`,
				args: [input],
			});

			const result = await handle.result();

			expect(result.success).toBe(true);

			// The expression {{ Date.now() }} should have been evaluated
			const timestamp = result.data?.[0]?.json?.timestamp;
			expect(timestamp).toBeDefined();
			expect(typeof timestamp).toBe('number');
			expect(timestamp).toBeGreaterThan(0);
		});
	}, 30000);
});
