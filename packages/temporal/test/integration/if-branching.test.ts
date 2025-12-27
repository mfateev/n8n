/**
 * Integration Test: IF Node Branching
 *
 * Validates:
 * 1. IF node correctly evaluates conditions
 * 2. True branch executes when condition is met
 * 3. False branch executes when condition is not met
 * 4. Only the appropriate branch nodes execute
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

describe('Integration: IF Node Branching', () => {
	let testEnv: TestWorkflowEnvironment;
	let nodeTypes: TemporalNodeTypes;
	let credentialTypes: TemporalCredentialTypes;
	let credentialsHelper: TemporalCredentialsHelper;

	const fixturesDir = path.join(__dirname, '../fixtures');
	const workflowPath = path.join(fixturesDir, 'workflows/if-branching.json');
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

	it('should execute true branch when condition is met', async () => {
		const workflow = await loadWorkflowFromFile(workflowPath);

		const worker = await Worker.create({
			connection: testEnv.nativeConnection,
			taskQueue: 'test-if-true',
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
				inputData: [{ json: { shouldPass: true, originalData: 'test' } }],
			};

			const handle: WorkflowHandle<typeof executeN8nWorkflow> = await client.workflow.start(
				executeN8nWorkflow,
				{
					taskQueue: 'test-if-true',
					workflowId: `test-if-true-${Date.now()}`,
					args: [input],
				},
			);

			const result: ExecuteN8nWorkflowOutput = await handle.result();

			expect(result.success).toBe(true);
			expect(result.status).toBe('success');

			// Verify true branch executed
			const runData = result.runExecutionData.resultData.runData;
			expect(runData['True Branch']).toBeDefined();
			expect(runData['True Branch']).toHaveLength(1);

			// Verify false branch did NOT execute
			expect(runData['False Branch']).toBeUndefined();

			// Verify output data
			expect(result.data).toBeDefined();
			expect(result.data![0].json.branch).toBe('true');
			expect(result.data![0].json.message).toBe('Condition was true');
			expect(result.data![0].json.originalData).toBe('test');
		});
	}, 30000);

	it('should execute false branch when condition is not met', async () => {
		const workflow = await loadWorkflowFromFile(workflowPath);

		const worker = await Worker.create({
			connection: testEnv.nativeConnection,
			taskQueue: 'test-if-false',
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
				inputData: [{ json: { shouldPass: false, originalData: 'test' } }],
			};

			const handle = await client.workflow.start(executeN8nWorkflow, {
				taskQueue: 'test-if-false',
				workflowId: `test-if-false-${Date.now()}`,
				args: [input],
			});

			const result = await handle.result();

			expect(result.success).toBe(true);

			// Verify false branch executed
			const runData = result.runExecutionData.resultData.runData;
			expect(runData['False Branch']).toBeDefined();
			expect(runData['False Branch']).toHaveLength(1);

			// Verify true branch did NOT execute
			expect(runData['True Branch']).toBeUndefined();

			// Verify output data
			expect(result.data![0].json.branch).toBe('false');
			expect(result.data![0].json.message).toBe('Condition was false');
		});
	}, 30000);

	it('should handle multiple items with mixed conditions', async () => {
		const workflow = await loadWorkflowFromFile(workflowPath);

		const worker = await Worker.create({
			connection: testEnv.nativeConnection,
			taskQueue: 'test-if-mixed',
			workflowsPath: require.resolve('../../src/workflows'),
			activities,
		});

		await worker.runUntil(async () => {
			const client = testEnv.client;

			// Multiple items - some true, some false
			const input: ExecuteN8nWorkflowInput = {
				workflowId: workflow.id,
				workflowName: workflow.name,
				nodes: workflow.nodes,
				connections: workflow.connections,
				settings: workflow.settings,
				inputData: [
					{ json: { shouldPass: true, item: 1 } },
					{ json: { shouldPass: false, item: 2 } },
					{ json: { shouldPass: true, item: 3 } },
				],
			};

			const handle = await client.workflow.start(executeN8nWorkflow, {
				taskQueue: 'test-if-mixed',
				workflowId: `test-if-mixed-${Date.now()}`,
				args: [input],
			});

			const result = await handle.result();

			expect(result.success).toBe(true);

			// Both branches should have executed
			const runData = result.runExecutionData.resultData.runData;
			expect(runData['True Branch']).toBeDefined();
			expect(runData['False Branch']).toBeDefined();

			// Check IF node output - should have routed items correctly
			const ifNodeData = runData['Check Value'][0].data?.main;
			expect(ifNodeData).toBeDefined();

			// True output (index 0) should have 2 items
			expect(ifNodeData![0]).toHaveLength(2);

			// False output (index 1) should have 1 item
			expect(ifNodeData![1]).toHaveLength(1);
		});
	}, 30000);
});
