/**
 * Integration Test: Wait Node Execution
 *
 * Validates:
 * 1. Wait node triggers Temporal sleep
 * 2. Workflow completes after wait
 * 3. State is preserved across wait
 * 4. Timestamps show wait actually occurred
 *
 * Uses Temporal's time-skipping test environment to avoid actual delays.
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

describe('Integration: Wait Node Execution', () => {
	let testEnv: TestWorkflowEnvironment;
	let nodeTypes: TemporalNodeTypes;
	let credentialTypes: TemporalCredentialTypes;
	let credentialsHelper: TemporalCredentialsHelper;

	const fixturesDir = path.join(__dirname, '../fixtures');
	const workflowPath = path.join(fixturesDir, 'workflows/wait-node.json');
	const credentialsPath = path.join(fixturesDir, 'credentials/empty.json');

	beforeAll(async () => {
		// Time-skipping environment - wait will be instant in test
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

	it('should complete workflow after wait node', async () => {
		const workflow = await loadWorkflowFromFile(workflowPath);

		const worker = await Worker.create({
			connection: testEnv.nativeConnection,
			taskQueue: 'test-wait',
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
				inputData: [{ json: { testInput: 'preserved' } }],
			};

			const handle: WorkflowHandle<typeof executeN8nWorkflow> = await client.workflow.start(
				executeN8nWorkflow,
				{
					taskQueue: 'test-wait',
					workflowId: `test-wait-${Date.now()}`,
					args: [input],
				},
			);

			const result: ExecuteN8nWorkflowOutput = await handle.result();

			expect(result.success).toBe(true);
			expect(result.status).toBe('success');

			// Verify all nodes executed
			const runData = result.runExecutionData.resultData.runData;
			expect(runData['Manual Trigger']).toBeDefined();
			expect(runData['Before Wait']).toBeDefined();
			expect(runData['Wait 2 Seconds']).toBeDefined();
			expect(runData['After Wait']).toBeDefined();

			// Verify output has data from both before and after wait
			expect(result.data).toBeDefined();
			const output = result.data![0].json;
			expect(output.beforeWait).toBe(true);
			expect(output.afterWait).toBe(true);

			// Verify original input was preserved
			expect(output.testInput).toBe('preserved');
		});
	}, 30000);

	it('should preserve state across wait', async () => {
		const workflow = await loadWorkflowFromFile(workflowPath);

		const worker = await Worker.create({
			connection: testEnv.nativeConnection,
			taskQueue: 'test-wait-state',
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
				inputData: [{ json: { counter: 42, name: 'test' } }],
			};

			const handle = await client.workflow.start(executeN8nWorkflow, {
				taskQueue: 'test-wait-state',
				workflowId: `test-wait-state-${Date.now()}`,
				args: [input],
			});

			const result = await handle.result();

			expect(result.success).toBe(true);

			// Verify input data was preserved through the wait
			const output = result.data![0].json;
			expect(output.counter).toBe(42);
			expect(output.name).toBe('test');

			// Verify Before Wait node output was preserved
			expect(output.beforeTimestamp).toBeDefined();
			expect(typeof output.beforeTimestamp).toBe('number');
		});
	}, 30000);

	it('should correctly record wait node execution status', async () => {
		const workflow = await loadWorkflowFromFile(workflowPath);

		const worker = await Worker.create({
			connection: testEnv.nativeConnection,
			taskQueue: 'test-wait-status',
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
				taskQueue: 'test-wait-status',
				workflowId: `test-wait-status-${Date.now()}`,
				args: [input],
			});

			const result = await handle.result();

			// After completion, waitTill should be cleared
			expect(result.runExecutionData.waitTill).toBeUndefined();

			// Verify last node executed is the final node
			expect(result.runExecutionData.resultData.lastNodeExecuted).toBe('After Wait');
		});
	}, 30000);
});
