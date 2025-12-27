/**
 * Integration Test: Code Node Support
 *
 * Verifies that JavaScript Code nodes execute correctly within
 * Temporal Activity context. The Code node runs in-process using
 * JavaScriptSandbox (vm2).
 *
 * This test validates:
 * 1. JavaScript code execution and data transformation
 * 2. Access to input data via $input.all() and $input.item
 * 3. Both runOnceForAllItems and runOnceForEachItem modes
 * 4. Error handling for syntax/runtime errors
 *
 * Note on Python: Python code execution is NOT supported in the MVP
 * (requires task runner infrastructure).
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

describe('Integration: Code Node E2E', () => {
	let testEnv: TestWorkflowEnvironment;
	let nodeTypes: TemporalNodeTypes;
	let credentialTypes: TemporalCredentialTypes;
	let credentialsHelper: TemporalCredentialsHelper;

	const fixturesDir = path.join(__dirname, '../fixtures');
	const workflowPath = path.join(fixturesDir, 'workflows/code-node.json');
	const eachItemWorkflowPath = path.join(fixturesDir, 'workflows/code-node-each-item.json');
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
			identity: 'test-worker-code',
		});
	});

	afterEach(() => {
		clearWorkerContext();
	});

	it('should execute JavaScript code and transform data', async () => {
		const workflow = await loadWorkflowFromFile(workflowPath);

		const worker = await Worker.create({
			connection: testEnv.nativeConnection,
			taskQueue: 'test-code-node',
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
				inputData: [{ json: { a: 10, b: 5 } }],
			};

			const handle: WorkflowHandle<typeof executeN8nWorkflow> = await client.workflow.start(
				executeN8nWorkflow,
				{
					taskQueue: 'test-code-node',
					workflowId: `test-code-node-${Date.now()}`,
					args: [input],
				},
			);

			const result: ExecuteN8nWorkflowOutput = await handle.result();

			// Workflow should complete successfully
			expect(result.success).toBe(true);
			expect(result.status).toBe('success');

			// Output should have transformed data
			expect(result.data).toBeDefined();
			expect(result.data).toHaveLength(1);

			const output = result.data![0].json;
			expect(output.transformed).toBe(true);
			expect(output.processed).toBe(true);
			expect(output.sum).toBe(15); // a + b = 10 + 5 = 15

			// Original data should be preserved
			expect(output.original).toEqual({ a: 10, b: 5 });

			// All nodes should have executed
			const runData = result.runExecutionData.resultData.runData;
			expect(runData['Manual Trigger']).toBeDefined();
			expect(runData['Transform Data']).toBeDefined();
		});
	}, 30000);

	it('should access input data in Code node', async () => {
		const workflow = await loadWorkflowFromFile(workflowPath);

		const worker = await Worker.create({
			connection: testEnv.nativeConnection,
			taskQueue: 'test-code-input',
			workflowsPath: require.resolve('../../src/workflows'),
			activities,
		});

		await worker.runUntil(async () => {
			const client = testEnv.client;

			// Provide rich input data
			const input: ExecuteN8nWorkflowInput = {
				workflowId: workflow.id,
				workflowName: workflow.name,
				nodes: workflow.nodes,
				connections: workflow.connections,
				settings: workflow.settings,
				inputData: [
					{ json: { a: 100, b: 200, name: 'test1' } },
					{ json: { a: 50, b: 25, name: 'test2' } },
				],
			};

			const handle = await client.workflow.start(executeN8nWorkflow, {
				taskQueue: 'test-code-input',
				workflowId: `test-code-input-${Date.now()}`,
				args: [input],
			});

			const result = await handle.result();

			// Workflow should complete successfully
			expect(result.success).toBe(true);

			// Should have two output items (one for each input)
			expect(result.data).toHaveLength(2);

			// First item
			expect(result.data![0].json.sum).toBe(300); // 100 + 200
			const firstOriginal = result.data![0].json.original as { name: string };
			expect(firstOriginal.name).toBe('test1');

			// Second item
			expect(result.data![1].json.sum).toBe(75); // 50 + 25
			const secondOriginal = result.data![1].json.original as { name: string };
			expect(secondOriginal.name).toBe('test2');
		});
	}, 30000);

	it('should support runOnceForEachItem mode', async () => {
		const workflow = await loadWorkflowFromFile(eachItemWorkflowPath);

		const worker = await Worker.create({
			connection: testEnv.nativeConnection,
			taskQueue: 'test-code-each',
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
				inputData: [{ json: { value: 5 } }, { json: { value: 10 } }, { json: { value: 15 } }],
			};

			const handle = await client.workflow.start(executeN8nWorkflow, {
				taskQueue: 'test-code-each',
				workflowId: `test-code-each-${Date.now()}`,
				args: [input],
			});

			const result = await handle.result();

			// Workflow should complete successfully
			expect(result.success).toBe(true);

			// Should have three output items
			expect(result.data).toHaveLength(3);

			// Each item should be doubled
			expect(result.data![0].json.doubled).toBe(10); // 5 * 2
			expect(result.data![0].json.originalValue).toBe(5);
			expect(result.data![0].json.itemProcessed).toBe(true);

			expect(result.data![1].json.doubled).toBe(20); // 10 * 2
			expect(result.data![1].json.originalValue).toBe(10);

			expect(result.data![2].json.doubled).toBe(30); // 15 * 2
			expect(result.data![2].json.originalValue).toBe(15);
		});
	}, 30000);

	it('should handle Code node runtime errors gracefully', async () => {
		// Use an inline workflow with code that throws a runtime error
		const worker = await Worker.create({
			connection: testEnv.nativeConnection,
			taskQueue: 'test-code-error',
			workflowsPath: require.resolve('../../src/workflows'),
			activities,
		});

		await worker.runUntil(async () => {
			const client = testEnv.client;

			const input: ExecuteN8nWorkflowInput = {
				workflowId: 'error-workflow',
				workflowName: 'Error Test Workflow',
				nodes: [
					{
						id: 'trigger-1',
						name: 'Manual Trigger',
						type: 'n8n-nodes-base.manualTrigger',
						typeVersion: 1,
						position: [0, 0],
						parameters: {},
					},
					{
						id: 'code-error',
						name: 'Error Code',
						type: 'n8n-nodes-base.code',
						typeVersion: 2,
						position: [200, 0],
						parameters: {
							mode: 'runOnceForAllItems',
							// This will cause a runtime error (accessing undefined)
							jsCode: 'const result = undefinedVariable.property;\nreturn [{ json: { result } }];',
						},
					},
				],
				connections: {
					// eslint-disable-next-line @typescript-eslint/naming-convention -- connections keys are node names
					'Manual Trigger': { main: [[{ node: 'Error Code', type: 'main', index: 0 }]] },
				},
				settings: { executionOrder: 'v1' },
				inputData: [{ json: {} }],
			};

			const handle = await client.workflow.start(executeN8nWorkflow, {
				taskQueue: 'test-code-error',
				workflowId: `test-code-error-${Date.now()}`,
				args: [input],
			});

			const result = await handle.result();

			// Workflow should fail
			expect(result.success).toBe(false);
			expect(result.status).toBe('error');

			// Error should be captured
			expect(result.error).toBeDefined();
			// Error should mention the undefined variable
			expect(result.error?.message).toMatch(/undefinedVariable/i);

			// The code node should have error status
			const codeNodeData = result.runExecutionData.resultData.runData['Error Code'];
			expect(codeNodeData).toBeDefined();
			expect(codeNodeData[0].executionStatus).toBe('error');
		});
	}, 30000);

	it('should handle Code node syntax errors gracefully', async () => {
		const worker = await Worker.create({
			connection: testEnv.nativeConnection,
			taskQueue: 'test-code-syntax',
			workflowsPath: require.resolve('../../src/workflows'),
			activities,
		});

		await worker.runUntil(async () => {
			const client = testEnv.client;

			const input: ExecuteN8nWorkflowInput = {
				workflowId: 'syntax-error-workflow',
				workflowName: 'Syntax Error Test Workflow',
				nodes: [
					{
						id: 'trigger-1',
						name: 'Manual Trigger',
						type: 'n8n-nodes-base.manualTrigger',
						typeVersion: 1,
						position: [0, 0],
						parameters: {},
					},
					{
						id: 'code-syntax',
						name: 'Syntax Error Code',
						type: 'n8n-nodes-base.code',
						typeVersion: 2,
						position: [200, 0],
						parameters: {
							mode: 'runOnceForAllItems',
							// Invalid JavaScript syntax
							jsCode: 'return [{ json: { this is invalid syntax } }];',
						},
					},
				],
				connections: {
					// eslint-disable-next-line @typescript-eslint/naming-convention -- connections keys are node names
					'Manual Trigger': { main: [[{ node: 'Syntax Error Code', type: 'main', index: 0 }]] },
				},
				settings: { executionOrder: 'v1' },
				inputData: [{ json: {} }],
			};

			const handle = await client.workflow.start(executeN8nWorkflow, {
				taskQueue: 'test-code-syntax',
				workflowId: `test-code-syntax-${Date.now()}`,
				args: [input],
			});

			const result = await handle.result();

			// Workflow should fail
			expect(result.success).toBe(false);
			expect(result.status).toBe('error');

			// Error should be captured
			expect(result.error).toBeDefined();
		});
	}, 30000);
});
