/**
 * Integration Test: Error Handling with continueOnFail
 *
 * Validates:
 * 1. Node failure with continueOnFail=true continues execution
 * 2. Error data is available in subsequent nodes
 * 3. Workflow completes successfully despite node error
 * 4. Error is recorded in the failed node's execution data
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

describe('Integration: Error Handling with continueOnFail', () => {
	let testEnv: TestWorkflowEnvironment;
	let nodeTypes: TemporalNodeTypes;
	let credentialTypes: TemporalCredentialTypes;
	let credentialsHelper: TemporalCredentialsHelper;

	const fixturesDir = path.join(__dirname, '../fixtures');
	const workflowPath = path.join(fixturesDir, 'workflows/continue-on-fail.json');
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

	it('should continue execution after node error with continueOnFail', async () => {
		const workflow = await loadWorkflowFromFile(workflowPath);

		const worker = await Worker.create({
			connection: testEnv.nativeConnection,
			taskQueue: 'test-continue-on-fail',
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
					taskQueue: 'test-continue-on-fail',
					workflowId: `test-continue-on-fail-${Date.now()}`,
					args: [input],
				},
			);

			const result: ExecuteN8nWorkflowOutput = await handle.result();

			// Workflow should complete successfully (continueOnFail)
			expect(result.success).toBe(true);
			expect(result.status).toBe('success');

			// All nodes should have executed
			const runData = result.runExecutionData.resultData.runData;
			expect(runData['Manual Trigger']).toBeDefined();
			expect(runData['Before Error']).toBeDefined();
			expect(runData['Throw Error']).toBeDefined();
			expect(runData['After Error']).toBeDefined();

			// Verify "After Error" node executed (continuation happened)
			expect(result.data).toBeDefined();
			const output = result.data![0].json;
			expect(output.afterError).toBe(true);
			expect(output.continuedAfterFail).toBe(true);
		});
	}, 30000);

	it('should have error data in failed node execution', async () => {
		const workflow = await loadWorkflowFromFile(workflowPath);

		const worker = await Worker.create({
			connection: testEnv.nativeConnection,
			taskQueue: 'test-error-data',
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
				taskQueue: 'test-error-data',
				workflowId: `test-error-data-${Date.now()}`,
				args: [input],
			});

			const result = await handle.result();

			// Check the "Throw Error" node's execution data
			const throwErrorData = result.runExecutionData.resultData.runData['Throw Error'];
			expect(throwErrorData).toBeDefined();
			expect(throwErrorData).toHaveLength(1);

			// The node should have error status
			const nodeExecution = throwErrorData[0];
			expect(nodeExecution.executionStatus).toBe('error');
			expect(nodeExecution.error).toBeDefined();
		});
	}, 30000);

	it('should pass error info to subsequent nodes', async () => {
		const workflow = await loadWorkflowFromFile(workflowPath);

		const worker = await Worker.create({
			connection: testEnv.nativeConnection,
			taskQueue: 'test-error-pass',
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
				taskQueue: 'test-error-pass',
				workflowId: `test-error-pass-${Date.now()}`,
				args: [input],
			});

			const result = await handle.result();

			// The output from the error node should be available
			// When continueOnFail is true, the input data is passed through
			const throwErrorOutput =
				result.runExecutionData.resultData.runData['Throw Error'][0].data?.main?.[0];
			expect(throwErrorOutput).toBeDefined();
		});
	}, 30000);
});
