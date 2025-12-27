'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.createEmptyExecutionData = createEmptyExecutionData;
exports.createExecutionDataWithStartNode = createExecutionDataWithStartNode;
exports.isFirstExecution = isFirstExecution;
exports.isExecutionComplete = isExecutionComplete;
exports.isExecutionWaiting = isExecutionWaiting;
const n8n_workflow_1 = require('n8n-workflow');
function createEmptyExecutionData() {
	return (0, n8n_workflow_1.createRunExecutionData)({});
}
function createExecutionDataWithStartNode(startNode, inputData) {
	const defaultInputData = [{ json: {} }];
	return (0, n8n_workflow_1.createRunExecutionData)({
		executionData: {
			nodeExecutionStack: [
				{
					node: startNode,
					data: {
						main: [inputData ?? defaultInputData],
					},
					source: null,
				},
			],
			waitingExecution: {},
			waitingExecutionSource: null,
			contextData: {},
			metadata: {},
		},
	});
}
function isFirstExecution(runExecutionData) {
	const hasNoRunData = Object.keys(runExecutionData.resultData.runData).length === 0;
	const hasNoExecutionStack =
		!runExecutionData.executionData ||
		runExecutionData.executionData.nodeExecutionStack.length === 0;
	return hasNoRunData && hasNoExecutionStack;
}
function isExecutionComplete(runExecutionData) {
	if (!runExecutionData.executionData) {
		return true;
	}
	const hasNoStack = runExecutionData.executionData.nodeExecutionStack.length === 0;
	const hasNoWaiting = Object.keys(runExecutionData.executionData.waitingExecution).length === 0;
	return hasNoStack && hasNoWaiting;
}
function isExecutionWaiting(runExecutionData) {
	return runExecutionData.waitTill !== undefined;
}
//# sourceMappingURL=execution-data.js.map
