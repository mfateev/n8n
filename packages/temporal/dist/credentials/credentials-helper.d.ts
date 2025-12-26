import type {
	ICredentialDataDecryptedObject,
	ICredentials,
	ICredentialsExpressionResolveValues,
	IExecuteData,
	IHttpRequestHelper,
	IHttpRequestOptions,
	INode,
	INodeCredentialsDetails,
	INodeProperties,
	IRequestOptionsSimplified,
	IWorkflowExecuteAdditionalData,
	Workflow,
	WorkflowExecuteMode,
} from 'n8n-workflow';
import { ICredentialsHelper } from 'n8n-workflow';
import type { CredentialStore } from './credential-store';
import type { TemporalCredentialTypes } from './credential-types';
export declare class TemporalCredentialsHelper extends ICredentialsHelper {
	private readonly store;
	private readonly credentialTypes;
	constructor(store: CredentialStore, credentialTypes: TemporalCredentialTypes);
	getParentTypes(name: string): string[];
	authenticate(
		credentials: ICredentialDataDecryptedObject,
		typeName: string,
		incomingRequestOptions: IHttpRequestOptions | IRequestOptionsSimplified,
		workflow: Workflow,
		node: INode,
	): Promise<IHttpRequestOptions>;
	preAuthentication(
		helpers: IHttpRequestHelper,
		credentials: ICredentialDataDecryptedObject,
		typeName: string,
		node: INode,
		credentialsExpired: boolean,
	): Promise<ICredentialDataDecryptedObject | undefined>;
	getCredentials(nodeCredentials: INodeCredentialsDetails, type: string): Promise<ICredentials>;
	getDecrypted(
		_additionalData: IWorkflowExecuteAdditionalData,
		nodeCredentials: INodeCredentialsDetails,
		type: string,
		mode: WorkflowExecuteMode,
		executeData?: IExecuteData,
		raw?: boolean,
		expressionResolveValues?: ICredentialsExpressionResolveValues,
	): Promise<ICredentialDataDecryptedObject>;
	updateCredentials(
		nodeCredentials: INodeCredentialsDetails,
		_type: string,
		data: ICredentialDataDecryptedObject,
	): Promise<void>;
	updateCredentialsOauthTokenData(
		nodeCredentials: INodeCredentialsDetails,
		_type: string,
		data: ICredentialDataDecryptedObject,
		_additionalData: IWorkflowExecuteAdditionalData,
	): Promise<void>;
	getCredentialsProperties(type: string): INodeProperties[];
	private resolveValue;
}
