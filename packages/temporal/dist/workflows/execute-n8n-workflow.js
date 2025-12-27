'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.executeN8nWorkflow = executeN8nWorkflow;
const workflow_1 = require('@temporalio/workflow');
const activities = (0, workflow_1.proxyLocalActivities)({
	startToCloseTimeout: '10 minutes',
	localRetryThreshold: '1 minute',
	retry: {
		maximumAttempts: 3,
		initialInterval: '1s',
		maximumInterval: '1m',
		backoffCoefficient: 2,
	},
});
async function executeN8nWorkflow(input) {
	let runExecutionData = createEmptyRunExecutionData();
	let previouslyExecutedNodes = [];
	while (true) {
		const result = await activities.executeWorkflowStep({
			workflowDefinition: {
				id: input.workflowId,
				name: input.workflowName,
				nodes: input.nodes,
				connections: input.connections,
				settings: input.settings,
				staticData: input.staticData,
			},
			runExecutionData: runExecutionData,
			inputData: input.inputData,
			previouslyExecutedNodes,
		});
		runExecutionData = mergeWorkflowStepResult(runExecutionData, result);
		previouslyExecutedNodes = getExecutedNodeNames(runExecutionData);
		if (result.complete) {
			return {
				success: !result.error,
				data: result.finalOutput,
				error: result.error,
				runExecutionData: runExecutionData,
				status: result.error ? 'error' : 'success',
			};
		}
		if (result.waitTill) {
			const waitMs = result.waitTill - Date.now();
			if (waitMs > 0) {
				await (0, workflow_1.sleep)(waitMs);
			}
			runExecutionData.waitTill = undefined;
		}
	}
}
function createEmptyRunExecutionData() {
	return {
		version: 1,
		resultData: {
			runData: {},
		},
		executionData: {
			contextData: {},
			nodeExecutionStack: [],
			waitingExecution: {},
			waitingExecutionSource: null,
		},
	};
}
function mergeWorkflowStepResult(currentState, stepResult) {
	const mergedRunData = { ...currentState.resultData.runData };
	for (const [nodeName, taskDataArray] of Object.entries(stepResult.newRunData)) {
		if (mergedRunData[nodeName]) {
			mergedRunData[nodeName] = [...mergedRunData[nodeName], ...taskDataArray];
		} else {
			mergedRunData[nodeName] = taskDataArray;
		}
	}
	return {
		...currentState,
		resultData: {
			...currentState.resultData,
			runData: mergedRunData,
			lastNodeExecuted: stepResult.lastNodeExecuted ?? currentState.resultData.lastNodeExecuted,
			error: stepResult.error ?? currentState.resultData.error,
		},
		executionData: {
			contextData: currentState.executionData?.contextData ?? {},
			nodeExecutionStack: stepResult.executionData.nodeExecutionStack,
			waitingExecution: stepResult.executionData.waitingExecution,
			waitingExecutionSource: stepResult.executionData.waitingExecutionSource,
		},
		...(stepResult.waitTill && { waitTill: new Date(stepResult.waitTill) }),
	};
}
function getExecutedNodeNames(state) {
	return Object.keys(state.resultData.runData);
}
//# sourceMappingURL=execute-n8n-workflow.js.map
