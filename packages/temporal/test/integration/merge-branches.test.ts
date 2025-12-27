/**
 * Integration Test: Merge Node
 *
 * Validates:
 * 1. Merge node waits for data from all inputs
 * 2. Data is correctly combined from multiple branches
 * 3. Execution continues after merge
 * 4. waitingExecution state is properly managed
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

describe('Integration: Merge Node', () => {
	let testEnv: TestWorkflowEnvironment;
	let nodeTypes: TemporalNodeTypes;
	let credentialTypes: TemporalCredentialTypes;
	let credentialsHelper: TemporalCredentialsHelper;

	const fixturesDir = path.join(__dirname, '../fixtures');
	const workflowPath = path.join(fixturesDir, 'workflows/merge-branches.json');
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

	it('should merge data from multiple branches', async () => {
		const workflow = await loadWorkflowFromFile(workflowPath);

		const worker = await Worker.create({
			connection: testEnv.nativeConnection,
			taskQueue: 'test-merge',
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
				inputData: [{ json: { originalInput: 'test' } }],
			};

			const handle: WorkflowHandle<typeof executeN8nWorkflow> = await client.workflow.start(
				executeN8nWorkflow,
				{
					taskQueue: 'test-merge',
					workflowId: `test-merge-${Date.now()}`,
					args: [input],
				},
			);

			const result: ExecuteN8nWorkflowOutput = await handle.result();

			expect(result.success).toBe(true);
			expect(result.status).toBe('success');

			// Verify all nodes executed
			const runData = result.runExecutionData.resultData.runData;
			expect(runData['Manual Trigger']).toBeDefined();
			expect(runData['Branch 1 Data']).toBeDefined();
			expect(runData['Branch 2 Data']).toBeDefined();
			expect(runData['Merge Data']).toBeDefined();
			expect(runData['Final Output']).toBeDefined();

			// Verify merge node received data from both branches
			const mergeNodeData = runData['Merge Data'][0].data?.main?.[0];
			expect(mergeNodeData).toBeDefined();

			// In append mode, should have 2 items (one from each branch)
			expect(mergeNodeData).toHaveLength(2);

			// Verify both branch data is present
			const sources = mergeNodeData!.map((item) => item.json['source']);
			expect(sources).toContain('branch1');
			expect(sources).toContain('branch2');

			// Verify final output has merged flag
			expect(result.data).toBeDefined();
			const hasItem1 = result.data!.some((d) => d.json.value1 === 100);
			const hasItem2 = result.data!.some((d) => d.json.value2 === 200);
			expect(hasItem1 || hasItem2).toBe(true);
		});
	}, 30000);

	it('should correctly handle waitingExecution state', async () => {
		const workflow = await loadWorkflowFromFile(workflowPath);

		const worker = await Worker.create({
			connection: testEnv.nativeConnection,
			taskQueue: 'test-merge-waiting',
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
				taskQueue: 'test-merge-waiting',
				workflowId: `test-merge-waiting-${Date.now()}`,
				args: [input],
			});

			const result = await handle.result();

			expect(result.success).toBe(true);

			// After completion, waitingExecution should be empty
			const executionData = result.runExecutionData.executionData;
			expect(executionData?.waitingExecution).toBeDefined();
			expect(Object.keys(executionData?.waitingExecution ?? {})).toHaveLength(0);
		});
	}, 30000);
});
