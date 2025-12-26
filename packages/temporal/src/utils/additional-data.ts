/**
 * Additional Data Builder
 *
 * Builds the IWorkflowExecuteAdditionalData object required by WorkflowExecute.
 * This object provides all the context and helpers needed during execution.
 */

import type { IWorkflowExecuteAdditionalData, ICredentialsHelper, INodeTypes } from 'n8n-workflow';

import type { TemporalCredentialTypes } from '../credentials/credential-types';

export interface BuildAdditionalDataOptions {
	credentialsHelper: ICredentialsHelper;
	credentialTypes: TemporalCredentialTypes;
	nodeTypes: INodeTypes;
	executionId?: string;
	userId?: string;
}

/**
 * Build IWorkflowExecuteAdditionalData for WorkflowExecute
 */
export function buildAdditionalData(
	options: BuildAdditionalDataOptions,
): IWorkflowExecuteAdditionalData {
	const {
		credentialsHelper,
		executionId = generateExecutionId(),
		userId = 'temporal-worker',
	} = options;

	// We need to cast to unknown first because IWorkflowExecuteAdditionalData
	// has many required properties that we don't need for Temporal execution
	return {
		credentialsHelper,
		executionId,
		restApiUrl: '', // Not used in Temporal context
		instanceBaseUrl: '', // Not used in Temporal context
		webhookBaseUrl: '', // Not used in Temporal context
		webhookTestBaseUrl: '', // Not used in Temporal context
		webhookWaitingBaseUrl: '', // Not used in Temporal context
		formWaitingBaseUrl: '', // Not used in Temporal context
		currentNodeExecutionIndex: 0,
		userId,
		variables: {},
		// Sub-workflow execution - deferred for MVP
		// eslint-disable-next-line @typescript-eslint/require-await
		executeWorkflow: async () => {
			throw new Error(
				'Sub-workflow execution (Execute Workflow node) is not supported in Temporal MVP. ' +
					'Please restructure your workflow to avoid using the Execute Workflow node.',
			);
		},
		// Secrets helper - minimal implementation for MVP
		secretsHelpers: {
			// eslint-disable-next-line @typescript-eslint/require-await
			getSecret: async () => undefined,
			hasSecret: () => false,
			hasProvider: () => false,
		},
		// Hooks are set up by WorkflowExecute internally
	} as unknown as IWorkflowExecuteAdditionalData;
}

/**
 * Generate a unique execution ID
 */
function generateExecutionId(): string {
	return `temporal-${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
}
