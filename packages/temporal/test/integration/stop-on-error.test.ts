/**
 * Integration Test: Error Handling without continueOnFail
 *
 * Validates:
 * 1. Node failure stops workflow execution
 * 2. Error is serialized correctly in result
 * 3. Temporal Activity handles the error appropriately
 * 4. Subsequent nodes do NOT execute
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

describe('Integration: Error Handling without continueOnFail', () => {
	let testEnv: TestWorkflowEnvironment;
	let nodeTypes: TemporalNodeTypes;
	let credentialTypes: TemporalCredentialTypes;
	let credentialsHelper: TemporalCredentialsHelper;

	const fixturesDir = path.join(__dirname, '../fixtures');
	const workflowPath = path.join(fixturesDir, 'workflows/stop-on-error.json');
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

	it('should stop execution and return error when node fails', async () => {
		const workflow = await loadWorkflowFromFile(workflowPath);

		const worker = await Worker.create({
			connection: testEnv.nativeConnection,
			taskQueue: 'test-stop-on-error',
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
				inputData: [{ json: { testData: 'value' } }],
			};

			const handle: WorkflowHandle<typeof executeN8nWorkflow> = await client.workflow.start(
				executeN8nWorkflow,
				{
					taskQueue: 'test-stop-on-error',
					workflowId: `test-stop-on-error-${Date.now()}`,
					args: [input],
				},
			);

			const result: ExecuteN8nWorkflowOutput = await handle.result();

			// Workflow should complete with error status
			expect(result.success).toBe(false);
			expect(result.status).toBe('error');

			// Error should be serialized in result
			expect(result.error).toBeDefined();
			expect(result.error!.message).toContain('Intentional error');
		});
	}, 30000);

	it('should NOT execute nodes after the failed node', async () => {
		const workflow = await loadWorkflowFromFile(workflowPath);

		const worker = await Worker.create({
			connection: testEnv.nativeConnection,
			taskQueue: 'test-no-continuation',
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
				taskQueue: 'test-no-continuation',
				workflowId: `test-no-continuation-${Date.now()}`,
				args: [input],
			});

			const result = await handle.result();

			// Verify nodes before error executed
			const runData = result.runExecutionData.resultData.runData;
			expect(runData['Manual Trigger']).toBeDefined();
			expect(runData['Before Error']).toBeDefined();
			expect(runData['Throw Error']).toBeDefined();

			// Verify node AFTER error did NOT execute
			expect(runData['Should Not Execute']).toBeUndefined();

			// No output data since workflow errored
			expect(result.data).toBeUndefined();
		});
	}, 30000);

	it('should record error in failed node execution data', async () => {
		const workflow = await loadWorkflowFromFile(workflowPath);

		const worker = await Worker.create({
			connection: testEnv.nativeConnection,
			taskQueue: 'test-error-recorded',
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
				taskQueue: 'test-error-recorded',
				workflowId: `test-error-recorded-${Date.now()}`,
				args: [input],
			});

			const result = await handle.result();

			// Check the "Throw Error" node's execution data
			const throwErrorData = result.runExecutionData.resultData.runData['Throw Error'];
			expect(throwErrorData).toBeDefined();
			expect(throwErrorData).toHaveLength(1);

			// Node should have error status
			const nodeExecution = throwErrorData[0];
			expect(nodeExecution.executionStatus).toBe('error');
			expect(nodeExecution.error).toBeDefined();
			expect(nodeExecution.error!.message).toContain('Intentional error');

			// Last node executed should be the error node
			expect(result.runExecutionData.resultData.lastNodeExecuted).toBe('Throw Error');

			// Result-level error should also be set
			expect(result.runExecutionData.resultData.error).toBeDefined();
		});
	}, 30000);
});
