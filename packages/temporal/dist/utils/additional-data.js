'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.buildAdditionalData = buildAdditionalData;
function buildAdditionalData(options) {
	const {
		credentialsHelper,
		executionId = generateExecutionId(),
		userId = 'temporal-worker',
		variables = {},
	} = options;
	return {
		credentialsHelper,
		executionId,
		restartExecutionId: undefined,
		currentNodeExecutionIndex: 0,
		userId,
		variables,
		restApiUrl: '',
		instanceBaseUrl: '',
		webhookBaseUrl: '',
		webhookTestBaseUrl: '',
		webhookWaitingBaseUrl: '',
		formWaitingBaseUrl: '',
		httpResponse: undefined,
		httpRequest: undefined,
		streamingEnabled: false,
		setExecutionStatus: (_status) => {},
		sendDataToUI: (_type, _data) => {},
		executeWorkflow: async () => {
			throw new Error(
				'Sub-workflow execution (Execute Workflow node) is not supported in Temporal MVP. ' +
					'Please restructure your workflow to avoid using the Execute Workflow node.',
			);
		},
		getRunExecutionData: async (_executionId) => {
			return undefined;
		},
		secretsHelpers: {
			getSecret: async (_provider, _name) => undefined,
			hasSecret: (_provider, _name) => false,
			hasProvider: (_provider) => false,
		},
		logAiEvent: (_eventName, _payload) => {},
		startRunnerTask: async () => {
			throw new Error(
				'External task runner is not supported in Temporal MVP. ' +
					'Code nodes run in-process within the activity.',
			);
		},
		getRunnerStatus: (_taskType) => ({
			available: false,
			reason: 'Task runner not available in Temporal context',
		}),
		parentCallbackManager: undefined,
		currentNodeParameters: undefined,
		executionTimeoutTimestamp: undefined,
	};
}
function generateExecutionId() {
	return `temporal-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}
//# sourceMappingURL=additional-data.js.map
