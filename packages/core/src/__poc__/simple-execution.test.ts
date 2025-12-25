/**
 * POC 2: Simple Node Execution
 *
 * Goal: Execute a simple Set node with minimal DI setup.
 * Validate that we can run node.execute() outside the n8n CLI.
 *
 * Run with: cd packages/core && pnpm test simple-execution
 *
 * Success Criteria:
 * - Set node executes without errors
 * - Output contains new field
 * - Input data preserved
 * - No unexpected DI errors
 */

import { Logger } from '@n8n/backend-common';
import { Container } from '@n8n/di';
import type { LogMetadata, Logger as LoggerType } from 'n8n-workflow';
import {
	Workflow,
	type INode,
	type INodeExecutionData,
	type ITaskDataConnections,
	type IWorkflowExecuteAdditionalData,
	type INodeTypes,
	type INodeType,
	type IVersionedNodeType,
} from 'n8n-workflow';
import path from 'path';

import { ExecuteContext } from '../execution-engine/node-execution-context/execute-context';
import { InstanceSettings } from '../instance-settings';
import { PackageDirectoryLoader } from '../nodes-loader/package-directory-loader';

// Minimal Logger stub
class MinimalLogger implements LoggerType {
	error(message: string, _metadata?: LogMetadata): void {
		console.error('[ERROR]', message);
	}
	warn(message: string, _metadata?: LogMetadata): void {
		console.warn('[WARN]', message);
	}
	info(message: string, _metadata?: LogMetadata): void {
		console.info('[INFO]', message);
	}
	debug(_message: string, _metadata?: LogMetadata): void {}
	scoped(_scopes: string | string[]): LoggerType {
		return this;
	}
}

// Minimal InstanceSettings stub
const minimalInstanceSettings = {
	n8nFolder: '/tmp/n8n-temporal-poc',
	staticCacheDir: '/tmp/n8n-temporal-poc/cache',
	customExtensionDir: '/tmp/n8n-temporal-poc/custom',
	nodesDownloadDir: '/tmp/n8n-temporal-poc/nodes',
	hostId: 'temporal-worker-poc-1',
	instanceId: 'poc-instance-id',
	hmacSignatureSecret: 'poc-secret-key-for-testing',
	instanceType: 'main' as const,
	instanceRole: 'leader' as const,
	isLeader: true,
	isFollower: false,
	isWorker: false,
	isMultiMain: false,
	isSingleMain: true,
	encryptionKey: 'test-encryption-key-for-poc',
};

// Create a minimal INodeTypes implementation from loader
function createNodeTypes(loader: PackageDirectoryLoader): INodeTypes {
	return {
		getByName(nodeType: string) {
			const nodeData = loader.nodeTypes[nodeType];
			if (!nodeData) {
				throw new Error(`Unknown node type: ${nodeType}`);
			}
			return nodeData.type;
		},
		getByNameAndVersion(nodeType: string, version?: number) {
			const nodeData = loader.nodeTypes[nodeType];
			if (!nodeData) {
				throw new Error(`Unknown node type: ${nodeType}`);
			}
			const type = nodeData.type;
			if ('nodeVersions' in type) {
				const versionedType = type as IVersionedNodeType;
				const nodeVersion = version ?? versionedType.currentVersion;
				return versionedType.nodeVersions[nodeVersion];
			}
			return type as INodeType;
		},
		getKnownTypes() {
			return { nodes: {}, credentials: {} };
		},
	};
}

// Create minimal additionalData
function createAdditionalData(): IWorkflowExecuteAdditionalData {
	return {
		credentialsHelper: {
			getDecrypted: async () => ({}),
			getCredentialsProperties: () => [],
			getParentTypes: () => [],
			authenticate: async (_creds: unknown, _type: string, opts: unknown) => opts,
		} as unknown as IWorkflowExecuteAdditionalData['credentialsHelper'],
		executeWorkflow: async () => ({ data: [[]], executionId: 'test' }),
		restApiUrl: 'http://localhost:5678/rest',
		instanceBaseUrl: 'http://localhost:5678',
		webhookBaseUrl: 'http://localhost:5678/webhook',
		webhookWaitingBaseUrl: 'http://localhost:5678/webhook-waiting',
		webhookTestBaseUrl: 'http://localhost:5678/webhook-test',
		formWaitingBaseUrl: 'http://localhost:5678/form-waiting',
		currentNodeExecutionIndex: 0,
		executionId: 'test-execution-1',
		variables: {},
		setExecutionStatus: () => {},
		getRunExecutionData: async () => undefined,
		logAiEvent: () => {},
		startRunnerTask: async () => ({ ok: true, result: null }),
	} as unknown as IWorkflowExecuteAdditionalData;
}

// Create minimal run execution data
function createRunExecutionData() {
	return {
		startData: {},
		resultData: { runData: {}, pinData: {} },
		executionData: {
			contextData: {},
			nodeExecutionStack: [],
			metadata: {},
			waitingExecution: {},
			waitingExecutionSource: {},
		},
		// eslint-disable-next-line @typescript-eslint/no-explicit-any
	} as any;
}

describe('POC 2: Simple Node Execution', () => {
	let loader: PackageDirectoryLoader;
	let nodeTypes: INodeTypes;

	beforeAll(() => {
		// Setup DI
		Container.set(Logger, new MinimalLogger());
		Container.set(InstanceSettings, minimalInstanceSettings as unknown as InstanceSettings);

		// Load nodes
		const nodesBasePath = path.resolve(__dirname, '../../../nodes-base');
		loader = new PackageDirectoryLoader(nodesBasePath);
		loader.loadNodeFromFile('dist/nodes/Set/Set.node.js');
		loader.loadNodeFromFile('dist/nodes/NoOp/NoOp.node.js');

		nodeTypes = createNodeTypes(loader);
	});

	describe('Set Node Execution', () => {
		it('should execute Set node and add a new field', async () => {
			// Create workflow with Set node
			const setNode: INode = {
				id: 'node-1',
				name: 'Set',
				type: 'set',
				typeVersion: 3.4,
				position: [0, 0],
				parameters: {
					mode: 'manual',
					duplicateItem: false,
					assignments: {
						assignments: [{ id: 'a1', name: 'newField', value: 'hello world', type: 'string' }],
					},
					includeOtherFields: true,
					options: {},
				},
			};

			const workflow = new Workflow({
				id: 'test-workflow',
				name: 'Test',
				nodes: [setNode],
				connections: {},
				nodeTypes,
				active: false,
			});

			// Input data
			const inputData: ITaskDataConnections = {
				main: [[{ json: { existingField: 'existing value' } }]],
			};
			const connectionInputData: INodeExecutionData[] = [
				{ json: { existingField: 'existing value' } },
			];

			const runExecutionData = createRunExecutionData();

			// Execute data
			const executeData = {
				node: setNode,
				data: inputData,
				source: { main: [{ previousNode: 'Start' }] },
			};

			const additionalData = createAdditionalData();

			// Create execution context
			const context = new ExecuteContext(
				workflow,
				setNode,
				additionalData,
				'manual',
				runExecutionData,
				0, // runIndex
				connectionInputData,
				inputData,
				executeData,
				[], // closeFunctions
			);

			// Get the Set node type
			const setNodeType = nodeTypes.getByNameAndVersion('set', 3.4);
			expect(setNodeType).toBeDefined();
			expect(typeof setNodeType.execute).toBe('function');

			// Execute the node
			const result = await setNodeType.execute!.call(context);

			// Verify results
			expect(result).toBeDefined();
			expect(Array.isArray(result)).toBe(true);

			const resultArray = result as INodeExecutionData[][];
			expect(resultArray.length).toBeGreaterThan(0);

			const outputItems = resultArray[0];
			expect(Array.isArray(outputItems)).toBe(true);
			expect(outputItems.length).toBe(1);

			const outputJson = outputItems[0].json;
			console.log('Output:', JSON.stringify(outputJson, null, 2));

			// Check new field was added
			expect(outputJson.newField).toBe('hello world');

			// Check existing field preserved
			expect(outputJson.existingField).toBe('existing value');
		});

		it('should execute Set node with multiple assignments', async () => {
			const setNode: INode = {
				id: 'node-2',
				name: 'Set Multiple',
				type: 'set',
				typeVersion: 3.4,
				position: [0, 0],
				parameters: {
					mode: 'manual',
					duplicateItem: false,
					assignments: {
						assignments: [
							{ id: 'a1', name: 'field1', value: 'value1', type: 'string' },
							{ id: 'a2', name: 'field2', value: '42', type: 'number' },
							{ id: 'a3', name: 'field3', value: 'true', type: 'boolean' },
						],
					},
					includeOtherFields: true,
					options: {},
				},
			};

			const workflow = new Workflow({
				id: 'test-workflow-2',
				name: 'Test Multiple',
				nodes: [setNode],
				connections: {},
				nodeTypes,
				active: false,
			});

			const inputData: ITaskDataConnections = {
				main: [[{ json: { original: 'data' } }]],
			};
			const connectionInputData: INodeExecutionData[] = [{ json: { original: 'data' } }];

			const runExecutionData = createRunExecutionData();

			const executeData = {
				node: setNode,
				data: inputData,
				source: { main: [{ previousNode: 'Start' }] },
			};

			const additionalData = createAdditionalData();

			const context = new ExecuteContext(
				workflow,
				setNode,
				additionalData,
				'manual',
				runExecutionData,
				0,
				connectionInputData,
				inputData,
				executeData,
				[],
			);

			const setNodeType = nodeTypes.getByNameAndVersion('set', 3.4);
			const result = await setNodeType.execute!.call(context);

			const resultArray = result as INodeExecutionData[][];
			const outputJson = resultArray[0][0].json;
			console.log('Multiple assignments output:', JSON.stringify(outputJson, null, 2));

			expect(outputJson.field1).toBe('value1');
			expect(outputJson.field2).toBe(42);
			expect(outputJson.field3).toBe(true);
			expect(outputJson.original).toBe('data');
		});

		it('should handle multiple input items', async () => {
			const setNode: INode = {
				id: 'node-3',
				name: 'Set Batch',
				type: 'set',
				typeVersion: 3.4,
				position: [0, 0],
				parameters: {
					mode: 'manual',
					duplicateItem: false,
					assignments: {
						assignments: [{ id: 'a1', name: 'processed', value: 'true', type: 'boolean' }],
					},
					includeOtherFields: true,
					options: {},
				},
			};

			const workflow = new Workflow({
				id: 'test-workflow-3',
				name: 'Test Batch',
				nodes: [setNode],
				connections: {},
				nodeTypes,
				active: false,
			});

			// Multiple input items
			const inputItems: INodeExecutionData[] = [
				{ json: { id: 1, name: 'Item 1' } },
				{ json: { id: 2, name: 'Item 2' } },
				{ json: { id: 3, name: 'Item 3' } },
			];

			const inputData: ITaskDataConnections = { main: [inputItems] };

			const runExecutionData = createRunExecutionData();

			const executeData = {
				node: setNode,
				data: inputData,
				source: { main: [{ previousNode: 'Start' }] },
			};

			const additionalData = createAdditionalData();

			const context = new ExecuteContext(
				workflow,
				setNode,
				additionalData,
				'manual',
				runExecutionData,
				0,
				inputItems,
				inputData,
				executeData,
				[],
			);

			const setNodeType = nodeTypes.getByNameAndVersion('set', 3.4);
			const result = await setNodeType.execute!.call(context);

			const resultArray = result as INodeExecutionData[][];
			console.log('Batch output:', JSON.stringify(resultArray[0], null, 2));

			// Should have same number of output items
			expect(resultArray[0].length).toBe(3);

			// Each item should have processed field and preserve original data
			for (let i = 0; i < 3; i++) {
				expect(resultArray[0][i].json.processed).toBe(true);
				expect(resultArray[0][i].json.id).toBe(i + 1);
				expect(resultArray[0][i].json.name).toBe(`Item ${i + 1}`);
			}
		});
	});

	afterAll(() => {
		console.log('\n=== POC 2 RESULTS ===');
		console.log('✓ Set node executes without errors');
		console.log('✓ Output contains new fields');
		console.log('✓ Input data preserved');
		console.log('✓ Multiple assignments work');
		console.log('✓ Batch processing works');
		console.log('\nKey Finding: Node execution works with minimal DI setup');
	});
});
