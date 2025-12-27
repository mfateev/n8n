'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.mergeWorkflowStepResult = mergeWorkflowStepResult;
exports.getExecutedNodeNames = getExecutedNodeNames;
function mergeWorkflowStepResult(currentState, stepResult) {
	const mergedRunData = mergeRunData(currentState.resultData.runData, stepResult.newRunData);
	const merged = {
		...currentState,
		resultData: {
			...currentState.resultData,
			runData: mergedRunData,
			lastNodeExecuted: stepResult.lastNodeExecuted ?? currentState.resultData.lastNodeExecuted,
		},
		executionData: currentState.executionData
			? {
					...currentState.executionData,
					nodeExecutionStack: stepResult.executionData.nodeExecutionStack,
					waitingExecution: stepResult.executionData.waitingExecution,
					waitingExecutionSource: stepResult.executionData.waitingExecutionSource,
				}
			: undefined,
	};
	if (stepResult.waitTill) {
		merged.waitTill = new Date(stepResult.waitTill);
	}
	return merged;
}
function mergeRunData(existing, newData) {
	const result = { ...existing };
	for (const [nodeName, taskDataArray] of Object.entries(newData)) {
		if (result[nodeName]) {
			result[nodeName] = [...result[nodeName], ...taskDataArray];
		} else {
			result[nodeName] = taskDataArray;
		}
	}
	return result;
}
function getExecutedNodeNames(state) {
	return Object.keys(state.resultData.runData);
}
//# sourceMappingURL=state-merge.js.map
