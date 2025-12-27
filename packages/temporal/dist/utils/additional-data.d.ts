import type {
	ICredentialsHelper,
	IDataObject,
	INodeTypes,
	IWorkflowExecuteAdditionalData,
} from 'n8n-workflow';
import type { TemporalCredentialTypes } from '../credentials/credential-types';
export interface BuildAdditionalDataOptions {
	credentialsHelper: ICredentialsHelper;
	credentialTypes: TemporalCredentialTypes;
	nodeTypes: INodeTypes;
	executionId?: string;
	userId?: string;
	variables?: IDataObject;
}
export declare function buildAdditionalData(
	options: BuildAdditionalDataOptions,
): IWorkflowExecuteAdditionalData;
