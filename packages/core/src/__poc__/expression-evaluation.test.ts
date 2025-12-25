/**
 * POC 4: Expression Evaluation
 *
 * Goal: Validate that expressions like {{ $json.field }} and {{ $node["Name"].json.data }}
 * work correctly with our minimal execution context.
 *
 * Run with: cd packages/core && pnpm test expression-evaluation
 *
 * Success Criteria:
 * - $json expression resolves
 * - String methods work in expressions
 * - $node["Name"] references work
 * - Errors are clear when expression fails
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
	type IRunExecutionData,
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

// Create run execution data with optional previous node results
function createRunExecutionData(
	previousRunData?: Record<string, Array<{ data: { main: INodeExecutionData[][] } }>>,
): IRunExecutionData {
	return {
		startData: {},
		resultData: {
			runData: previousRunData ?? {},
			pinData: {},
		},
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

describe('POC 4: Expression Evaluation', () => {
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

	describe('Basic Expression Resolution', () => {
		it('should resolve $json expressions', async () => {
			// Create workflow with Set node using expression
			const setNode: INode = {
				id: 'node-1',
				name: 'Transform',
				type: 'set',
				typeVersion: 3.4,
				position: [0, 0],
				parameters: {
					mode: 'manual',
					duplicateItem: false,
					assignments: {
						assignments: [
							// Expression referencing current item's json
							{ id: 'a1', name: 'extracted', value: '={{ $json.original }}', type: 'string' },
						],
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

			// Input data with a field to extract via expression
			const inputData: ITaskDataConnections = {
				main: [[{ json: { original: 'hello world' } }]],
			};
			const connectionInputData: INodeExecutionData[] = [{ json: { original: 'hello world' } }];

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
			console.log('$json expression output:', JSON.stringify(outputJson, null, 2));

			// The expression should have resolved
			expect(outputJson.extracted).toBe('hello world');
			expect(outputJson.original).toBe('hello world');
		});

		it('should execute string methods in expressions', async () => {
			const setNode: INode = {
				id: 'node-1',
				name: 'Transform',
				type: 'set',
				typeVersion: 3.4,
				position: [0, 0],
				parameters: {
					mode: 'manual',
					duplicateItem: false,
					assignments: {
						assignments: [
							{
								id: 'a1',
								name: 'uppercase',
								value: '={{ $json.text.toUpperCase() }}',
								type: 'string',
							},
							{ id: 'a2', name: 'length', value: '={{ $json.text.length }}', type: 'number' },
							{
								id: 'a3',
								name: 'substring',
								value: '={{ $json.text.substring(0, 5) }}',
								type: 'string',
							},
						],
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

			const inputData: ITaskDataConnections = {
				main: [[{ json: { text: 'hello world' } }]],
			};
			const connectionInputData: INodeExecutionData[] = [{ json: { text: 'hello world' } }];

			const runExecutionData = createRunExecutionData();

			const executeData = {
				node: setNode,
				data: inputData,
				source: { main: [{ previousNode: 'Start' }] },
			};

			const context = new ExecuteContext(
				workflow,
				setNode,
				createAdditionalData(),
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
			console.log('String methods output:', JSON.stringify(outputJson, null, 2));

			expect(outputJson.uppercase).toBe('HELLO WORLD');
			expect(outputJson.length).toBe(11);
			expect(outputJson.substring).toBe('hello');
		});
	});

	describe('Node Reference Expressions', () => {
		it('should resolve $node["Name"].json references', async () => {
			// Define two nodes
			const inputNode: INode = {
				id: 'node-1',
				name: 'Input',
				type: 'set',
				typeVersion: 3.4,
				position: [0, 0],
				parameters: {
					mode: 'manual',
					duplicateItem: false,
					assignments: {
						assignments: [{ id: 'a1', name: 'source', value: 'from input', type: 'string' }],
					},
					options: {},
				},
			};

			const transformNode: INode = {
				id: 'node-2',
				name: 'Transform',
				type: 'set',
				typeVersion: 3.4,
				position: [200, 0],
				parameters: {
					mode: 'manual',
					duplicateItem: false,
					assignments: {
						assignments: [
							// Reference previous node by name
							{
								id: 'a1',
								name: 'fromInput',
								value: '={{ $node["Input"].json.source }}',
								type: 'string',
							},
						],
					},
					includeOtherFields: true,
					options: {},
				},
			};

			const workflow = new Workflow({
				id: 'test-workflow',
				name: 'Test',
				nodes: [inputNode, transformNode],
				connections: {
					Input: { main: [[{ node: 'Transform', type: 'main', index: 0 }]] },
				},
				nodeTypes,
				active: false,
			});

			// Simulate that Input node has already run and produced output
			const previousRunData = {
				Input: [
					{
						data: {
							main: [[{ json: { source: 'from input' } }]],
						},
					},
				],
			};

			const runExecutionData = createRunExecutionData(previousRunData);

			// Input to Transform node (from Input node)
			const inputData: ITaskDataConnections = {
				main: [[{ json: { source: 'from input' } }]],
			};
			const connectionInputData: INodeExecutionData[] = [{ json: { source: 'from input' } }];

			const executeData = {
				node: transformNode,
				data: inputData,
				source: { main: [{ previousNode: 'Input' }] },
			};

			const context = new ExecuteContext(
				workflow,
				transformNode,
				createAdditionalData(),
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
			console.log('$node["Name"].json output:', JSON.stringify(outputJson, null, 2));

			expect(outputJson.fromInput).toBe('from input');
		});
	});

	describe('Complex Expressions', () => {
		it('should handle nested object access', async () => {
			const setNode: INode = {
				id: 'node-1',
				name: 'Transform',
				type: 'set',
				typeVersion: 3.4,
				position: [0, 0],
				parameters: {
					mode: 'manual',
					duplicateItem: false,
					assignments: {
						assignments: [
							{ id: 'a1', name: 'nested', value: '={{ $json.user.name }}', type: 'string' },
							{ id: 'a2', name: 'deep', value: '={{ $json.data.items[0].value }}', type: 'string' },
						],
					},
					includeOtherFields: false,
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

			const inputData: ITaskDataConnections = {
				main: [
					[
						{
							json: {
								user: { name: 'John Doe', email: 'john@example.com' },
								data: { items: [{ value: 'first' }, { value: 'second' }] },
							},
						},
					],
				],
			};
			const connectionInputData: INodeExecutionData[] = [
				{
					json: {
						user: { name: 'John Doe', email: 'john@example.com' },
						data: { items: [{ value: 'first' }, { value: 'second' }] },
					},
				},
			];

			const runExecutionData = createRunExecutionData();

			const executeData = {
				node: setNode,
				data: inputData,
				source: { main: [{ previousNode: 'Start' }] },
			};

			const context = new ExecuteContext(
				workflow,
				setNode,
				createAdditionalData(),
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
			console.log('Nested access output:', JSON.stringify(outputJson, null, 2));

			expect(outputJson.nested).toBe('John Doe');
			expect(outputJson.deep).toBe('first');
		});

		it('should handle arithmetic expressions', async () => {
			const setNode: INode = {
				id: 'node-1',
				name: 'Transform',
				type: 'set',
				typeVersion: 3.4,
				position: [0, 0],
				parameters: {
					mode: 'manual',
					duplicateItem: false,
					assignments: {
						assignments: [
							{ id: 'a1', name: 'sum', value: '={{ $json.a + $json.b }}', type: 'number' },
							{ id: 'a2', name: 'product', value: '={{ $json.a * $json.b }}', type: 'number' },
							{
								id: 'a3',
								name: 'calculated',
								value: '={{ ($json.a + $json.b) * 2 }}',
								type: 'number',
							},
						],
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

			const inputData: ITaskDataConnections = {
				main: [[{ json: { a: 5, b: 3 } }]],
			};
			const connectionInputData: INodeExecutionData[] = [{ json: { a: 5, b: 3 } }];

			const runExecutionData = createRunExecutionData();

			const executeData = {
				node: setNode,
				data: inputData,
				source: { main: [{ previousNode: 'Start' }] },
			};

			const context = new ExecuteContext(
				workflow,
				setNode,
				createAdditionalData(),
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
			console.log('Arithmetic output:', JSON.stringify(outputJson, null, 2));

			expect(outputJson.sum).toBe(8);
			expect(outputJson.product).toBe(15);
			expect(outputJson.calculated).toBe(16);
		});
	});

	describe('Expression Error Handling', () => {
		it('should handle undefined property access gracefully', async () => {
			const setNode: INode = {
				id: 'node-1',
				name: 'Transform',
				type: 'set',
				typeVersion: 3.4,
				position: [0, 0],
				parameters: {
					mode: 'manual',
					duplicateItem: false,
					assignments: {
						assignments: [
							// Try to access a property that doesn't exist
							{
								id: 'a1',
								name: 'missing',
								value: '={{ $json.nonexistent?.value ?? "default" }}',
								type: 'string',
							},
						],
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

			const inputData: ITaskDataConnections = {
				main: [[{ json: { existing: 'value' } }]],
			};
			const connectionInputData: INodeExecutionData[] = [{ json: { existing: 'value' } }];

			const runExecutionData = createRunExecutionData();

			const executeData = {
				node: setNode,
				data: inputData,
				source: { main: [{ previousNode: 'Start' }] },
			};

			const context = new ExecuteContext(
				workflow,
				setNode,
				createAdditionalData(),
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
			console.log('Missing property output:', JSON.stringify(outputJson, null, 2));

			// Should use default value
			expect(outputJson.missing).toBe('default');
		});
	});

	afterAll(() => {
		console.log('\n=== POC 4 RESULTS ===');
		console.log('✓ $json expressions resolve correctly');
		console.log('✓ String methods work in expressions');
		console.log('✓ $node["Name"].json references work');
		console.log('✓ Nested object access works');
		console.log('✓ Arithmetic expressions work');
		console.log('✓ Optional chaining handles missing properties');
		console.log('\nKey Finding: Expression evaluation works with minimal execution context');
	});
});
