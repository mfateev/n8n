/**
 * POC 7: WorkflowExecute Integration
 *
 * Goal: Validate that WorkflowExecute can run workflows and that we can
 * hook into node execution boundaries for Temporal activity interception.
 *
 * Run with: cd packages/core && pnpm test workflow-execute
 *
 * Success Criteria:
 * - WorkflowExecute runs a simple workflow
 * - nodeExecuteBefore hook fires before each node
 * - nodeExecuteAfter hook fires after each node with results
 * - workflowExecuteAfter hook fires with full results
 * - Execution state can be intercepted at node boundaries
 *
 * Note: This POC demonstrates how Temporal workers could intercept
 * node execution to create activities at node boundaries.
 */

import { mock } from 'jest-mock-extended';
import type {
	INode,
	INodeExecutionData,
	INodeTypeData,
	IRunExecutionData,
	ITaskData,
	ITaskStartedData,
	IRun,
	IWorkflowBase,
	IWorkflowExecuteAdditionalData,
} from 'n8n-workflow';
import { createDeferredPromise, NodeConnectionTypes, NodeHelpers, Workflow } from 'n8n-workflow';

import { ExecutionLifecycleHooks } from '../execution-engine/execution-lifecycle-hooks';
import { WorkflowExecute } from '../execution-engine/workflow-execute';

// Import actual node implementations from nodes-base
import { ManualTrigger } from '../../../nodes-base/dist/nodes/ManualTrigger/ManualTrigger.node';
import { NoOp } from '../../../nodes-base/dist/nodes/NoOp/NoOp.node';
import { Set } from '../../../nodes-base/dist/nodes/Set/Set.node';

// Define node types for our test workflow
const nodeTypes: INodeTypeData = {
	'n8n-nodes-base.manualTrigger': {
		type: new ManualTrigger(),
		sourcePath: '',
	},
	'n8n-nodes-base.set': {
		type: new Set(),
		sourcePath: '',
	},
	'n8n-nodes-base.noOp': {
		type: new NoOp(),
		sourcePath: '',
	},
};

// Simple INodeTypes implementation using NodeHelpers
class SimpleNodeTypes {
	getByName(nodeType: string) {
		const data = nodeTypes[nodeType];
		if (!data) throw new Error(`Unknown node type: ${nodeType}`);
		return data.type;
	}

	getByNameAndVersion(nodeType: string, version?: number) {
		const data = nodeTypes[nodeType];
		if (!data) throw new Error(`Unknown node type: ${nodeType}`);
		return NodeHelpers.getVersionedNodeType(data.type, version);
	}

	getKnownTypes() {
		return { nodes: {}, credentials: {} };
	}
}

// Create a minimal IWorkflowBase for hooks
function createWorkflowBase(id: string, name: string): IWorkflowBase {
	return {
		id,
		name,
		active: false,
		isArchived: false,
		createdAt: new Date(),
		updatedAt: new Date(),
		nodes: [],
		connections: {},
		activeVersionId: null,
	};
}

describe('POC 7: WorkflowExecute Integration', () => {
	describe('Basic Workflow Execution', () => {
		it('should execute a simple workflow with ManualTrigger → Set → NoOp', async () => {
			// Define workflow nodes
			const nodes: INode[] = [
				{
					id: 'trigger-1',
					name: 'Manual Trigger',
					type: 'n8n-nodes-base.manualTrigger',
					typeVersion: 1,
					position: [0, 0],
					parameters: {},
				},
				{
					id: 'set-1',
					name: 'Set Data',
					type: 'n8n-nodes-base.set',
					typeVersion: 3.4,
					position: [200, 0],
					parameters: {
						mode: 'manual',
						duplicateItem: false,
						assignments: {
							assignments: [
								{ id: 'a1', name: 'message', value: 'Hello from POC 7', type: 'string' },
								{ id: 'a2', name: 'timestamp', value: '={{ Date.now() }}', type: 'number' },
							],
						},
						includeOtherFields: false,
						options: {},
					},
				},
				{
					id: 'noop-1',
					name: 'End',
					type: 'n8n-nodes-base.noOp',
					typeVersion: 1,
					position: [400, 0],
					parameters: {},
				},
			];

			// Define connections
			const connections = {
				'Manual Trigger': {
					main: [[{ node: 'Set Data', type: NodeConnectionTypes.Main, index: 0 }]],
				},
				'Set Data': {
					main: [[{ node: 'End', type: NodeConnectionTypes.Main, index: 0 }]],
				},
			};

			// Create workflow
			const workflow = new Workflow({
				id: 'poc-7-workflow',
				name: 'POC 7 Test Workflow',
				nodes,
				connections,
				nodeTypes: new SimpleNodeTypes(),
				active: false,
				settings: {
					executionOrder: 'v1',
				},
			});

			// Create deferred promise for workflow completion
			const waitPromise = createDeferredPromise<IRun>();

			// Create hooks
			const workflowData = createWorkflowBase('poc-7-workflow', 'POC 7 Test');
			const hooks = new ExecutionLifecycleHooks('manual', 'poc-7-execution-1', workflowData);

			// Add workflowExecuteAfter hook to resolve promise
			hooks.addHandler('workflowExecuteAfter', (fullRunData) => {
				waitPromise.resolve(fullRunData);
			});

			// Create additionalData with hooks
			const additionalData = mock<IWorkflowExecuteAdditionalData>({
				hooks,
				currentNodeExecutionIndex: 0,
				restartExecutionId: undefined,
			});

			// Create and run WorkflowExecute
			const workflowExecute = new WorkflowExecute(additionalData, 'manual');
			await workflowExecute.run(workflow);

			// Wait for completion
			const result = await waitPromise.promise;

			// Verify execution completed
			expect(result).toBeDefined();
			expect(result.finished).toBe(true);
			expect(result.data.resultData.runData).toBeDefined();

			// Verify all nodes executed
			const runData = result.data.resultData.runData;
			expect(runData['Manual Trigger']).toBeDefined();
			expect(runData['Set Data']).toBeDefined();
			expect(runData['End']).toBeDefined();

			// Verify Set node output
			const setNodeOutput = runData['Set Data'][0].data?.main[0];
			expect(setNodeOutput).toBeDefined();
			expect(setNodeOutput![0].json.message).toBe('Hello from POC 7');
			expect(setNodeOutput![0].json.timestamp).toBeDefined();

			console.log('  ✓ Workflow executed successfully');
			console.log('  ✓ All 3 nodes ran:', Object.keys(runData).join(', '));
			console.log('  ✓ Set node output:', JSON.stringify(setNodeOutput![0].json, null, 2));
		});
	});

	describe('Execution Hooks for Node Boundaries', () => {
		it('should fire nodeExecuteBefore and nodeExecuteAfter hooks', async () => {
			// Track hook calls
			const hookCalls: Array<{ event: string; nodeName: string; data?: unknown }> = [];

			// Define simple workflow
			const nodes: INode[] = [
				{
					id: 'trigger-1',
					name: 'Start',
					type: 'n8n-nodes-base.manualTrigger',
					typeVersion: 1,
					position: [0, 0],
					parameters: {},
				},
				{
					id: 'set-1',
					name: 'Process',
					type: 'n8n-nodes-base.set',
					typeVersion: 3.4,
					position: [200, 0],
					parameters: {
						mode: 'manual',
						duplicateItem: false,
						assignments: {
							assignments: [{ id: 'a1', name: 'processed', value: 'true', type: 'boolean' }],
						},
						includeOtherFields: false,
						options: {},
					},
				},
			];

			const connections = {
				Start: {
					main: [[{ node: 'Process', type: NodeConnectionTypes.Main, index: 0 }]],
				},
			};

			const workflow = new Workflow({
				id: 'poc-7-hooks',
				name: 'POC 7 Hooks Test',
				nodes,
				connections,
				nodeTypes: new SimpleNodeTypes(),
				active: false,
				settings: { executionOrder: 'v1' },
			});

			const waitPromise = createDeferredPromise<IRun>();

			// Create hooks with tracking
			const workflowData = createWorkflowBase('poc-7-hooks', 'Hooks Test');
			const hooks = new ExecutionLifecycleHooks('manual', 'poc-7-hooks-exec', workflowData);

			// Track nodeExecuteBefore
			hooks.addHandler(
				'nodeExecuteBefore',
				(nodeName: string, taskStartedData: ITaskStartedData) => {
					hookCalls.push({
						event: 'nodeExecuteBefore',
						nodeName,
						data: { executionIndex: taskStartedData.executionIndex },
					});
					console.log(
						`  → nodeExecuteBefore: ${nodeName} (index: ${taskStartedData.executionIndex})`,
					);
				},
			);

			// Track nodeExecuteAfter
			hooks.addHandler(
				'nodeExecuteAfter',
				(nodeName: string, taskData: ITaskData, _executionData: IRunExecutionData) => {
					const outputItemCount = taskData.data?.main?.[0]?.length ?? 0;
					hookCalls.push({
						event: 'nodeExecuteAfter',
						nodeName,
						data: {
							executionIndex: taskData.executionIndex,
							outputItemCount,
							executionStatus: taskData.executionStatus,
						},
					});
					console.log(
						`  ← nodeExecuteAfter: ${nodeName} (index: ${taskData.executionIndex}, items: ${outputItemCount})`,
					);
				},
			);

			// Track workflowExecuteAfter
			hooks.addHandler('workflowExecuteAfter', (fullRunData) => {
				hookCalls.push({
					event: 'workflowExecuteAfter',
					nodeName: 'workflow',
					data: { finished: fullRunData.finished },
				});
				waitPromise.resolve(fullRunData);
			});

			const additionalData = mock<IWorkflowExecuteAdditionalData>({
				hooks,
				currentNodeExecutionIndex: 0,
				restartExecutionId: undefined,
			});

			const workflowExecute = new WorkflowExecute(additionalData, 'manual');
			await workflowExecute.run(workflow);
			await waitPromise.promise;

			// Verify hooks fired in correct order
			console.log('\n  Hook call sequence:');
			hookCalls.forEach((call, i) => {
				console.log(`    ${i + 1}. ${call.event}: ${call.nodeName}`);
			});

			// Should have: 2 nodeExecuteBefore + 2 nodeExecuteAfter + 1 workflowExecuteAfter
			expect(hookCalls.length).toBe(5);

			// Verify nodeExecuteBefore fired for both nodes
			const beforeCalls = hookCalls.filter((c) => c.event === 'nodeExecuteBefore');
			expect(beforeCalls.length).toBe(2);
			expect(beforeCalls.map((c) => c.nodeName)).toContain('Start');
			expect(beforeCalls.map((c) => c.nodeName)).toContain('Process');

			// Verify nodeExecuteAfter fired for both nodes
			const afterCalls = hookCalls.filter((c) => c.event === 'nodeExecuteAfter');
			expect(afterCalls.length).toBe(2);
			expect(afterCalls.map((c) => c.nodeName)).toContain('Start');
			expect(afterCalls.map((c) => c.nodeName)).toContain('Process');

			// Verify workflowExecuteAfter fired
			const workflowAfterCalls = hookCalls.filter((c) => c.event === 'workflowExecuteAfter');
			expect(workflowAfterCalls.length).toBe(1);

			console.log('\n  ✓ All hooks fired correctly');
		});

		it('should provide execution state in nodeExecuteAfter hook', async () => {
			// This test demonstrates how Temporal could capture execution state
			// at each node boundary
			const capturedStates: Array<{
				nodeName: string;
				runData: Record<string, unknown>;
				outputData: INodeExecutionData[] | null | undefined;
			}> = [];

			const nodes: INode[] = [
				{
					id: 'trigger-1',
					name: 'Trigger',
					type: 'n8n-nodes-base.manualTrigger',
					typeVersion: 1,
					position: [0, 0],
					parameters: {},
				},
				{
					id: 'set-1',
					name: 'Step1',
					type: 'n8n-nodes-base.set',
					typeVersion: 3.4,
					position: [200, 0],
					parameters: {
						mode: 'manual',
						duplicateItem: false,
						assignments: {
							assignments: [{ id: 'a1', name: 'step', value: '1', type: 'number' }],
						},
						includeOtherFields: false,
						options: {},
					},
				},
				{
					id: 'set-2',
					name: 'Step2',
					type: 'n8n-nodes-base.set',
					typeVersion: 3.4,
					position: [400, 0],
					parameters: {
						mode: 'manual',
						duplicateItem: false,
						assignments: {
							assignments: [{ id: 'a1', name: 'step', value: '2', type: 'number' }],
						},
						includeOtherFields: true,
						options: {},
					},
				},
			];

			const connections = {
				Trigger: {
					main: [[{ node: 'Step1', type: NodeConnectionTypes.Main, index: 0 }]],
				},
				Step1: {
					main: [[{ node: 'Step2', type: NodeConnectionTypes.Main, index: 0 }]],
				},
			};

			const workflow = new Workflow({
				id: 'poc-7-state',
				name: 'POC 7 State Capture',
				nodes,
				connections,
				nodeTypes: new SimpleNodeTypes(),
				active: false,
				settings: { executionOrder: 'v1' },
			});

			const waitPromise = createDeferredPromise<IRun>();

			const workflowData = createWorkflowBase('poc-7-state', 'State Test');
			const hooks = new ExecutionLifecycleHooks('manual', 'poc-7-state-exec', workflowData);

			// Capture state after each node
			hooks.addHandler(
				'nodeExecuteAfter',
				(nodeName: string, taskData: ITaskData, executionData: IRunExecutionData) => {
					// Capture the run data up to this point
					const runDataSnapshot = { ...executionData.resultData.runData };
					capturedStates.push({
						nodeName,
						runData: runDataSnapshot,
						outputData: taskData.data?.main?.[0],
					});
				},
			);

			hooks.addHandler('workflowExecuteAfter', (fullRunData) => {
				waitPromise.resolve(fullRunData);
			});

			const additionalData = mock<IWorkflowExecuteAdditionalData>({
				hooks,
				currentNodeExecutionIndex: 0,
				restartExecutionId: undefined,
			});

			const workflowExecute = new WorkflowExecute(additionalData, 'manual');
			await workflowExecute.run(workflow);
			await waitPromise.promise;

			// Verify state capture
			expect(capturedStates.length).toBe(3); // Trigger, Step1, Step2

			// After Trigger: only Trigger in runData
			const afterTrigger = capturedStates.find((s) => s.nodeName === 'Trigger');
			expect(afterTrigger).toBeDefined();
			expect(Object.keys(afterTrigger!.runData)).toContain('Trigger');

			// After Step1: Trigger + Step1 in runData
			const afterStep1 = capturedStates.find((s) => s.nodeName === 'Step1');
			expect(afterStep1).toBeDefined();
			expect(Object.keys(afterStep1!.runData)).toContain('Trigger');
			expect(Object.keys(afterStep1!.runData)).toContain('Step1');
			expect(afterStep1!.outputData?.[0].json.step).toBe(1);

			// After Step2: all nodes in runData
			const afterStep2 = capturedStates.find((s) => s.nodeName === 'Step2');
			expect(afterStep2).toBeDefined();
			expect(Object.keys(afterStep2!.runData).length).toBe(3);
			expect(afterStep2!.outputData?.[0].json.step).toBe(2);

			console.log('\n  Captured states at node boundaries:');
			capturedStates.forEach((state) => {
				console.log(
					`    ${state.nodeName}: runData has ${Object.keys(state.runData).length} nodes`,
				);
				if (state.outputData) {
					console.log(`      Output: ${JSON.stringify(state.outputData[0]?.json)}`);
				}
			});

			console.log('\n  ✓ Execution state captured at each node boundary');
			console.log('  ✓ This enables Temporal to checkpoint between nodes');
		});
	});

	describe('Simulated Temporal Integration Pattern', () => {
		it('should demonstrate how hooks enable Temporal activity boundaries', async () => {
			/**
			 * This test demonstrates the pattern for Temporal integration:
			 * 1. nodeExecuteBefore could signal "activity started"
			 * 2. nodeExecuteAfter could signal "activity completed" with result
			 * 3. The state at each boundary is serializable (POC 6 proved this)
			 *
			 * In a real Temporal worker:
			 * - Each node execution would be an Activity
			 * - nodeExecuteBefore: Record activity start in Temporal
			 * - nodeExecuteAfter: Complete activity with output data
			 * - If worker crashes, Temporal replays from last completed activity
			 */

			// Simulated Temporal activity log
			const temporalActivityLog: Array<{
				type: 'activity_started' | 'activity_completed';
				activityId: string;
				nodeName: string;
				timestamp: number;
				result?: INodeExecutionData[] | null;
			}> = [];

			const nodes: INode[] = [
				{
					id: 'trigger-1',
					name: 'Trigger',
					type: 'n8n-nodes-base.manualTrigger',
					typeVersion: 1,
					position: [0, 0],
					parameters: {},
				},
				{
					id: 'set-1',
					name: 'ProcessData',
					type: 'n8n-nodes-base.set',
					typeVersion: 3.4,
					position: [200, 0],
					parameters: {
						mode: 'manual',
						duplicateItem: false,
						assignments: {
							assignments: [{ id: 'a1', name: 'status', value: 'processed', type: 'string' }],
						},
						includeOtherFields: false,
						options: {},
					},
				},
			];

			const connections = {
				Trigger: {
					main: [[{ node: 'ProcessData', type: NodeConnectionTypes.Main, index: 0 }]],
				},
			};

			const workflow = new Workflow({
				id: 'temporal-pattern',
				name: 'Temporal Pattern Demo',
				nodes,
				connections,
				nodeTypes: new SimpleNodeTypes(),
				active: false,
				settings: { executionOrder: 'v1' },
			});

			const waitPromise = createDeferredPromise<IRun>();

			const workflowData = createWorkflowBase('temporal-pattern', 'Temporal Demo');
			const hooks = new ExecutionLifecycleHooks('manual', 'temporal-exec', workflowData);

			let activityCounter = 0;

			// Simulate Temporal activity start
			hooks.addHandler(
				'nodeExecuteBefore',
				(nodeName: string, _taskStartedData: ITaskStartedData) => {
					const activityId = `activity-${++activityCounter}`;
					temporalActivityLog.push({
						type: 'activity_started',
						activityId,
						nodeName,
						timestamp: Date.now(),
					});
					console.log(`  [Temporal] Activity started: ${activityId} (${nodeName})`);
				},
			);

			// Simulate Temporal activity completion
			hooks.addHandler('nodeExecuteAfter', (nodeName: string, taskData: ITaskData) => {
				const activityId = `activity-${activityCounter}`;
				temporalActivityLog.push({
					type: 'activity_completed',
					activityId,
					nodeName,
					timestamp: Date.now(),
					result: taskData.data?.main?.[0],
				});
				console.log(`  [Temporal] Activity completed: ${activityId} (${nodeName})`);
			});

			hooks.addHandler('workflowExecuteAfter', (fullRunData) => {
				waitPromise.resolve(fullRunData);
			});

			const additionalData = mock<IWorkflowExecuteAdditionalData>({
				hooks,
				currentNodeExecutionIndex: 0,
				restartExecutionId: undefined,
			});

			const workflowExecute = new WorkflowExecute(additionalData, 'manual');
			await workflowExecute.run(workflow);
			await waitPromise.promise;

			// Verify activity log
			expect(temporalActivityLog.length).toBe(4); // 2 starts + 2 completions

			const starts = temporalActivityLog.filter((l) => l.type === 'activity_started');
			const completions = temporalActivityLog.filter((l) => l.type === 'activity_completed');

			expect(starts.length).toBe(2);
			expect(completions.length).toBe(2);

			// Each start should have a matching completion
			for (const start of starts) {
				const completion = completions.find((c) => c.activityId === start.activityId);
				expect(completion).toBeDefined();
				expect(completion!.nodeName).toBe(start.nodeName);
			}

			console.log('\n  Temporal Activity Log:');
			temporalActivityLog.forEach((entry) => {
				const resultStr = entry.result ? ` -> ${JSON.stringify(entry.result[0]?.json)}` : '';
				console.log(`    ${entry.type}: ${entry.activityId} (${entry.nodeName})${resultStr}`);
			});

			console.log('\n  ✓ Demonstrated Temporal activity boundary pattern');
			console.log('  ✓ Each node execution maps to a Temporal activity');
			console.log('  ✓ Activity results are captured for checkpointing');
		});
	});

	afterAll(() => {
		console.log('\n=== POC 7 RESULTS ===');
		console.log('✓ WorkflowExecute runs workflows successfully');
		console.log('✓ nodeExecuteBefore hook fires before each node');
		console.log('✓ nodeExecuteAfter hook fires after each node with results');
		console.log('✓ workflowExecuteAfter hook fires with full execution data');
		console.log('✓ Execution state can be captured at node boundaries');
		console.log('\nKey Finding: ExecutionLifecycleHooks provide natural boundaries');
		console.log('for Temporal activities - each node execution can be an activity');
		console.log('that checkpoints state and enables recovery from failures.');
	});
});
