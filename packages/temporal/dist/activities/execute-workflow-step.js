'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.executeWorkflowStep = executeWorkflowStep;
const n8n_core_1 = require('n8n-core');
const n8n_workflow_1 = require('n8n-workflow');
const additional_data_1 = require('../utils/additional-data');
const error_serializer_1 = require('../utils/error-serializer');
const logger_1 = require('../utils/logger');
const context_1 = require('../worker/context');
async function executeWorkflowStep(input) {
	const { workflowDefinition, runExecutionData, inputData, previouslyExecutedNodes } = input;
	const context = (0, context_1.getWorkerContext)();
	const logger = (0, logger_1.getLogger)().child('Activity');
	logger.debug('Executing workflow step', {
		workflowId: workflowDefinition.id,
		workflowName: workflowDefinition.name,
		previousNodesCount: previouslyExecutedNodes.length,
	});
	const previousNodeNames = new Set(previouslyExecutedNodes);
	try {
		const workflow = new n8n_workflow_1.Workflow({
			id: workflowDefinition.id,
			name: workflowDefinition.name,
			nodes: workflowDefinition.nodes,
			connections: workflowDefinition.connections,
			nodeTypes: context.nodeTypes,
			settings: workflowDefinition.settings,
			staticData: workflowDefinition.staticData,
			active: false,
		});
		const additionalData = (0, additional_data_1.buildAdditionalData)({
			credentialsHelper: context.credentialsHelper,
			credentialTypes: context.credentialTypes,
			nodeTypes: context.nodeTypes,
		});
		let executionData;
		if (isFirstExecution(runExecutionData)) {
			executionData = initializeFirstExecution(workflow, inputData);
		} else {
			executionData = runExecutionData;
		}
		const workflowExecute = new n8n_core_1.WorkflowExecute(
			additionalData,
			'integrated',
			executionData,
		);
		const result = await workflowExecute.processRunExecutionData(workflow);
		const newRunData = computeRunDataDiff(previousNodeNames, result.data.resultData.runData);
		const executionBookkeeping = extractExecutionBookkeeping(result.data);
		if (result.waitTill) {
			logger.info('Workflow step waiting', {
				workflowId: workflowDefinition.id,
				lastNodeExecuted: result.data.resultData.lastNodeExecuted,
				waitTill: result.waitTill.toISOString(),
				newNodesExecuted: Object.keys(newRunData).length,
			});
			return {
				complete: false,
				newRunData,
				executionData: executionBookkeeping,
				lastNodeExecuted: result.data.resultData.lastNodeExecuted,
				waitTill: result.waitTill.getTime(),
			};
		}
		if (result.data.resultData.error) {
			logger.warn('Workflow step failed', {
				workflowId: workflowDefinition.id,
				lastNodeExecuted: result.data.resultData.lastNodeExecuted,
				error: result.data.resultData.error.message,
				newNodesExecuted: Object.keys(newRunData).length,
			});
			return {
				complete: true,
				newRunData,
				executionData: executionBookkeeping,
				lastNodeExecuted: result.data.resultData.lastNodeExecuted,
				error: (0, error_serializer_1.serializeError)(result.data.resultData.error),
			};
		}
		logger.info('Workflow step completed', {
			workflowId: workflowDefinition.id,
			lastNodeExecuted: result.data.resultData.lastNodeExecuted,
			newNodesExecuted: Object.keys(newRunData).length,
		});
		return {
			complete: true,
			newRunData,
			executionData: executionBookkeeping,
			lastNodeExecuted: result.data.resultData.lastNodeExecuted,
			finalOutput: extractFinalOutput(result.data, workflow),
		};
	} catch (error) {
		logger.error('Workflow step unexpected error', {
			workflowId: workflowDefinition.id,
			error: error.message,
		});
		return {
			complete: true,
			newRunData: {},
			executionData: createEmptyBookkeeping(),
			error: (0, error_serializer_1.serializeError)(error),
		};
	}
}
function isFirstExecution(runExecutionData) {
	return (
		Object.keys(runExecutionData.resultData.runData).length === 0 &&
		(!runExecutionData.executionData ||
			runExecutionData.executionData.nodeExecutionStack.length === 0)
	);
}
function initializeFirstExecution(workflow, inputData) {
	const startNode = findStartNode(workflow);
	if (!startNode) {
		throw new Error('No start node found in workflow');
	}
	const executionData = (0, n8n_workflow_1.createRunExecutionData)({});
	const existingExecutionData = executionData.executionData;
	executionData.executionData = {
		contextData: existingExecutionData.contextData,
		runtimeData: existingExecutionData.runtimeData,
		metadata: existingExecutionData.metadata,
		nodeExecutionStack: [
			{
				node: startNode,
				data: {
					main: [inputData ?? [{ json: {} }]],
				},
				source: null,
			},
		],
		waitingExecution: {},
		waitingExecutionSource: null,
	};
	return executionData;
}
function findStartNode(workflow) {
	const startNode = workflow.getStartNode();
	if (startNode) {
		return startNode;
	}
	const nodes = Object.values(workflow.nodes);
	return nodes.find(
		(node) =>
			node.type.includes('Trigger') ||
			node.type === 'n8n-nodes-base.start' ||
			node.type === 'n8n-nodes-base.manualTrigger',
	);
}
function computeRunDataDiff(previousNodeNames, currentRunData) {
	const diff = {};
	for (const [nodeName, taskDataArray] of Object.entries(currentRunData)) {
		if (!previousNodeNames.has(nodeName)) {
			diff[nodeName] = taskDataArray;
		}
	}
	return diff;
}
function extractExecutionBookkeeping(runExecutionData) {
	return {
		nodeExecutionStack: runExecutionData.executionData?.nodeExecutionStack ?? [],
		waitingExecution: runExecutionData.executionData?.waitingExecution ?? {},
		waitingExecutionSource: runExecutionData.executionData?.waitingExecutionSource ?? null,
	};
}
function createEmptyBookkeeping() {
	return {
		nodeExecutionStack: [],
		waitingExecution: {},
		waitingExecutionSource: null,
	};
}
function extractFinalOutput(runExecutionData, _workflow) {
	const lastNodeName = runExecutionData.resultData.lastNodeExecuted;
	if (!lastNodeName) {
		return undefined;
	}
	const lastNodeRunData = runExecutionData.resultData.runData[lastNodeName];
	if (!lastNodeRunData || lastNodeRunData.length === 0) {
		return undefined;
	}
	const lastRun = lastNodeRunData[lastNodeRunData.length - 1];
	return lastRun.data?.main?.[0] ?? undefined;
}
//# sourceMappingURL=execute-workflow-step.js.map
