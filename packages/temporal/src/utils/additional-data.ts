/**
 * Additional Data Builder
 *
 * Builds the IWorkflowExecuteAdditionalData object required by WorkflowExecute.
 * This object provides all the context and helpers needed during execution.
 */

import type {
	AiEvent,
	ExecutionStatus,
	ICredentialsHelper,
	IDataObject,
	INodeTypes,
	IRunExecutionData,
	IWorkflowExecuteAdditionalData,
} from 'n8n-workflow';

import type { TemporalCredentialTypes } from '../credentials/credential-types';

export interface BuildAdditionalDataOptions {
	credentialsHelper: ICredentialsHelper;
	credentialTypes: TemporalCredentialTypes;
	nodeTypes: INodeTypes;
	executionId?: string;
	userId?: string;
	/** Optional variables to inject into workflow expressions */
	variables?: IDataObject;
}

/**
 * Build IWorkflowExecuteAdditionalData for WorkflowExecute
 *
 * Note: Many fields are not used in Temporal context (webhooks, UI communication, etc.)
 * but are required by the interface. We provide no-op implementations for these.
 */
export function buildAdditionalData(
	options: BuildAdditionalDataOptions,
): IWorkflowExecuteAdditionalData {
	const {
		credentialsHelper,
		executionId = generateExecutionId(),
		userId = 'temporal-worker',
		variables = {},
	} = options;

	return {
		// === Required helpers ===
		credentialsHelper,

		// === Execution identifiers ===
		executionId,
		restartExecutionId: undefined,
		currentNodeExecutionIndex: 0,
		userId,
		variables,

		// === URLs (not used in Temporal context) ===
		restApiUrl: '',
		instanceBaseUrl: '',
		webhookBaseUrl: '',
		webhookTestBaseUrl: '',
		webhookWaitingBaseUrl: '',
		formWaitingBaseUrl: '',

		// === HTTP context (not used in Temporal) ===
		httpResponse: undefined,
		httpRequest: undefined,
		streamingEnabled: false,

		// === UI communication (not used in Temporal) ===
		setExecutionStatus: (_status: ExecutionStatus) => {
			// No-op: Temporal tracks status through workflow state
		},
		sendDataToUI: (_type: string, _data: IDataObject | IDataObject[]) => {
			// No-op: No UI connection in Temporal context
		},

		// === Sub-workflow execution (deferred for MVP) ===
		// eslint-disable-next-line @typescript-eslint/require-await
		executeWorkflow: async () => {
			throw new Error(
				'Sub-workflow execution (Execute Workflow node) is not supported in Temporal MVP. ' +
					'Please restructure your workflow to avoid using the Execute Workflow node.',
			);
		},

		// === Execution data retrieval (for resuming) ===
		// eslint-disable-next-line @typescript-eslint/require-await
		getRunExecutionData: async (_executionId: string): Promise<IRunExecutionData | undefined> => {
			// Not needed for Temporal - state is passed directly to activities
			return undefined;
		},

		// === Secrets helper (minimal implementation for MVP) ===
		secretsHelpers: {
			// eslint-disable-next-line @typescript-eslint/require-await
			getSecret: async (_provider: string, _name: string) => undefined,
			hasSecret: (_provider: string, _name: string) => false,
			hasProvider: (_provider: string) => false,
		},

		// === AI event logging (no-op for MVP) ===
		logAiEvent: (_eventName: AiEvent, _payload: unknown) => {
			// No-op: AI event logging not implemented in Temporal MVP
		},

		// === Task runner (no external runner in MVP) ===
		// eslint-disable-next-line @typescript-eslint/require-await
		startRunnerTask: async <T>(): Promise<{ ok: true; result: T }> => {
			throw new Error(
				'External task runner is not supported in Temporal MVP. ' +
					'Code nodes run in-process within the activity.',
			);
		},
		getRunnerStatus: (_taskType: string) => ({
			available: false as const,
			reason: 'Task runner not available in Temporal context',
		}),

		// === Callback manager (for AI nodes - optional) ===
		parentCallbackManager: undefined,

		// === Node parameters (set during execution) ===
		currentNodeParameters: undefined,
		executionTimeoutTimestamp: undefined,
	} as unknown as IWorkflowExecuteAdditionalData;
}

/**
 * Generate a unique execution ID for Temporal workflows
 */
function generateExecutionId(): string {
	return `temporal-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}
