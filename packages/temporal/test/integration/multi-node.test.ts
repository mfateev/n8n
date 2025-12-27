/**
 * Integration Test: Multi-Node Sequential Workflow
 *
 * This test validates:
 * 1. Sequential node execution through multiple Set nodes
 * 2. Data flow between nodes
 * 3. Expression evaluation using $json references
 * 4. Proper state accumulation in runExecutionData
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

describe('Integration: Multi-Node Sequential Workflow', () => {
	let testEnv: TestWorkflowEnvironment;
	let nodeTypes: TemporalNodeTypes;
	let credentialTypes: TemporalCredentialTypes;
	let credentialsHelper: TemporalCredentialsHelper;

	const fixturesDir = path.join(__dirname, '../fixtures');
	const workflowPath = path.join(fixturesDir, 'workflows/multi-node.json');
	const credentialsPath = path.join(fixturesDir, 'credentials/empty.json');

	beforeAll(async () => {
		testEnv = await TestWorkflowEnvironment.createTimeSkipping();

		nodeTypes = new TemporalNodeTypes();
		await nodeTypes.loadAll();

		credentialTypes = new TemporalCredentialTypes(nodeTypes);
		credentialTypes.loadAll();

		const credentialStore = new JsonFileCredentialStore(credentialsPath);
		await credentialStore.load();
		credentialsHelper = new TemporalCredentialsHelper(credentialStore, credentialTypes);
	}, 120000);

	afterAll(async () => {
		await testEnv?.teardown();
	});

	beforeEach(() => {
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

	it('should execute multi-node workflow with data flow', async () => {
		const workflow = await loadWorkflowFromFile(workflowPath);

		const worker = await Worker.create({
			connection: testEnv.nativeConnection,
			taskQueue: 'test-multi-node',
			workflowsPath: require.resolve('../../src/workflows'),
			activities,
		});

		await worker.runUntil(async () => {
			const client = testEnv.client;

			const input: ExecuteN8nWorkflowInput = {
				workflowId: workflow.id,
				workflowName: workflow.name,
				nodes: workflow.nodes,
				connections: workflow.connections,
				settings: workflow.settings,
			};

			const handle: WorkflowHandle<typeof executeN8nWorkflow> = await client.workflow.start(
				executeN8nWorkflow,
				{
					taskQueue: 'test-multi-node',
					workflowId: `test-multi-node-${Date.now()}`,
					args: [input],
				},
			);

			const result: ExecuteN8nWorkflowOutput = await handle.result();

			// Basic success checks
			expect(result.success).toBe(true);
			expect(result.status).toBe('success');
			expect(result.error).toBeUndefined();

			// Verify output data
			expect(result.data).toBeDefined();
			expect(result.data).toHaveLength(1);

			const finalOutput = result.data![0].json;

			// Check final step marker
			expect(finalOutput.step).toBe('3');

			// Check that counter from step 1 was preserved
			expect(finalOutput.counter).toBe(10);

			// Check that doubled value from step 2 is correct (10 * 2 = 20)
			expect(finalOutput.doubled).toBe(20);

			// Check that previousStep captured step 1's value before step 2 changed it
			expect(finalOutput.previousStep).toBe('1');

			// Check summary string
			expect(finalOutput.summary).toBe('Counter was 10, doubled to 20');

			// Check allSteps (note: step 2 changed step to "2", so we see "1 -> 2 -> 3")
			expect(finalOutput.allSteps).toBe('1 -> 2 -> 3');
		});
	}, 30000);

	it('should record execution data for all nodes', async () => {
		const workflow = await loadWorkflowFromFile(workflowPath);

		const worker = await Worker.create({
			connection: testEnv.nativeConnection,
			taskQueue: 'test-multi-node-data',
			workflowsPath: require.resolve('../../src/workflows'),
			activities,
		});

		await worker.runUntil(async () => {
			const client = testEnv.client;

			const input: ExecuteN8nWorkflowInput = {
				workflowId: workflow.id,
				workflowName: workflow.name,
				nodes: workflow.nodes,
				connections: workflow.connections,
				settings: workflow.settings,
			};

			const handle = await client.workflow.start(executeN8nWorkflow, {
				taskQueue: 'test-multi-node-data',
				workflowId: `test-multi-node-data-${Date.now()}`,
				args: [input],
			});

			const result = await handle.result();

			// Verify all nodes have execution data
			const runData = result.runExecutionData.resultData.runData;

			expect(runData['Manual Trigger']).toBeDefined();
			expect(runData['Manual Trigger']).toHaveLength(1);

			expect(runData['Set Initial Data']).toBeDefined();
			expect(runData['Set Initial Data']).toHaveLength(1);

			expect(runData['Transform Data']).toBeDefined();
			expect(runData['Transform Data']).toHaveLength(1);

			expect(runData['Final Output']).toBeDefined();
			expect(runData['Final Output']).toHaveLength(1);

			// Verify last node executed
			expect(result.runExecutionData.resultData.lastNodeExecuted).toBe('Final Output');
		});
	}, 30000);

	it('should preserve input data through the workflow', async () => {
		const workflow = await loadWorkflowFromFile(workflowPath);

		const worker = await Worker.create({
			connection: testEnv.nativeConnection,
			taskQueue: 'test-multi-node-input',
			workflowsPath: require.resolve('../../src/workflows'),
			activities,
		});

		await worker.runUntil(async () => {
			const client = testEnv.client;

			// Provide initial input data
			const inputData = [{ json: { originalInput: 'should-be-preserved', existingField: 123 } }];

			const input: ExecuteN8nWorkflowInput = {
				workflowId: workflow.id,
				workflowName: workflow.name,
				nodes: workflow.nodes,
				connections: workflow.connections,
				settings: workflow.settings,
				inputData,
			};

			const handle = await client.workflow.start(executeN8nWorkflow, {
				taskQueue: 'test-multi-node-input',
				workflowId: `test-multi-node-input-${Date.now()}`,
				args: [input],
			});

			const result = await handle.result();

			expect(result.success).toBe(true);

			// Since all Set nodes have includeOtherFields: true, original data should be preserved
			const finalOutput = result.data![0].json;
			expect(finalOutput.originalInput).toBe('should-be-preserved');
			expect(finalOutput.existingField).toBe(123);
		});
	}, 30000);
});
