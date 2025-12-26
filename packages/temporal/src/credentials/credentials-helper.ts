/**
 * Temporal Credentials Helper
 *
 * Implements ICredentialsHelper using the JSON credential store.
 * Provides credential resolution for n8n node execution in Temporal activities.
 */

import type {
	ICredentialDataDecryptedObject,
	ICredentials,
	ICredentialsExpressionResolveValues,
	IDataObject,
	IExecuteData,
	IHttpRequestHelper,
	IHttpRequestOptions,
	INode,
	INodeCredentialsDetails,
	INodeParameters,
	INodeProperties,
	IRequestOptionsSimplified,
	IWorkflowExecuteAdditionalData,
	Workflow,
	WorkflowExecuteMode,
} from 'n8n-workflow';
import { ICredentialsHelper, NodeHelpers, isExpression } from 'n8n-workflow';

import type { CredentialStore } from './credential-store';
import type { TemporalCredentialTypes } from './credential-types';

/**
 * Simple Credentials class for Temporal
 *
 * Unlike n8n's Credentials class which handles encryption/decryption,
 * this class works with already-decrypted data from the credential store.
 */
class TemporalCredentials implements ICredentials {
	id?: string;

	name: string;

	type: string;

	data: string | undefined;

	private decryptedData: ICredentialDataDecryptedObject;

	constructor(
		nodeCredentials: INodeCredentialsDetails,
		type: string,
		decryptedData: ICredentialDataDecryptedObject,
	) {
		this.id = nodeCredentials.id ?? undefined;
		this.name = nodeCredentials.name;
		this.type = type;
		this.decryptedData = decryptedData;
		// data field is not used since we work with decrypted data directly
		this.data = undefined;
	}

	getData(): ICredentialDataDecryptedObject {
		return this.decryptedData;
	}

	getDataToSave() {
		return {
			id: this.id,
			name: this.name,
			type: this.type,
			data: '', // Not used in Temporal context
		};
	}

	setData(_data: ICredentialDataDecryptedObject): void {
		// Not implemented - credentials are read-only from the store perspective
		throw new Error('setData is not supported in Temporal credentials');
	}
}

/**
 * ICredentialsHelper implementation for Temporal
 */
export class TemporalCredentialsHelper extends ICredentialsHelper {
	constructor(
		private readonly store: CredentialStore,
		private readonly credentialTypes: TemporalCredentialTypes,
	) {
		super();
	}

	/**
	 * Returns all parent types of the given credential type
	 */
	getParentTypes(name: string): string[] {
		return this.credentialTypes.getParentTypes(name);
	}

	/**
	 * Add authentication to a request
	 */
	async authenticate(
		credentials: ICredentialDataDecryptedObject,
		typeName: string,
		incomingRequestOptions: IHttpRequestOptions | IRequestOptionsSimplified,
		workflow: Workflow,
		node: INode,
	): Promise<IHttpRequestOptions> {
		const requestOptions = incomingRequestOptions;
		const credentialType = this.credentialTypes.getByName(typeName);

		if (credentialType.authenticate) {
			if (typeof credentialType.authenticate === 'function') {
				// Custom authentication function
				return await credentialType.authenticate(
					credentials,
					requestOptions as IHttpRequestOptions,
				);
			}

			if (typeof credentialType.authenticate === 'object') {
				// Generic authentication configuration
				const { authenticate } = credentialType;

				requestOptions.headers ??= {};

				if (authenticate.type === 'generic') {
					Object.entries(authenticate.properties).forEach(([outerKey, outerValue]) => {
						Object.entries(outerValue as Record<string, string>).forEach(([key, value]) => {
							const keyResolved = this.resolveValue(
								key,
								{ $credentials: credentials },
								workflow,
								node,
							);
							const valueResolved = this.resolveValue(
								value,
								{ $credentials: credentials },
								workflow,
								node,
							);

							const options = requestOptions as unknown as Record<string, Record<string, string>>;
							options[outerKey] ??= {};
							options[outerKey][keyResolved] = valueResolved;
						});
					});
				}
			}
		}

		return requestOptions as IHttpRequestOptions;
	}

	/**
	 * Handle pre-authentication (e.g., OAuth token refresh)
	 */
	async preAuthentication(
		helpers: IHttpRequestHelper,
		credentials: ICredentialDataDecryptedObject,
		typeName: string,
		node: INode,
		credentialsExpired: boolean,
	): Promise<ICredentialDataDecryptedObject | undefined> {
		const credentialType = this.credentialTypes.getByName(typeName);

		const expirableProperty = credentialType.properties?.find(
			(property) => property.type === 'hidden' && property.typeOptions?.expirable === true,
		);

		if (expirableProperty?.name === undefined) {
			return undefined;
		}

		if (credentialType.preAuthentication) {
			if (typeof credentialType.preAuthentication === 'function') {
				// Check if token needs refresh
				if (credentials[expirableProperty.name] === '' || credentialsExpired) {
					const output = await credentialType.preAuthentication.call(helpers, credentials);

					if (output[expirableProperty.name] === undefined) {
						return undefined;
					}

					// Update credentials in store
					if (node.credentials) {
						const nodeCredDetails = node.credentials[credentialType.name];
						if (nodeCredDetails?.id) {
							const updatedCredentials: ICredentialDataDecryptedObject = {
								...credentials,
							};
							// Copy over the output properties
							for (const [k, v] of Object.entries(output)) {
								if (v !== undefined && v !== null) {
									updatedCredentials[k] = v as ICredentialDataDecryptedObject[string];
								}
							}
							await this.updateCredentials(
								nodeCredDetails,
								credentialType.name,
								updatedCredentials,
							);
						}
					}

					const result: ICredentialDataDecryptedObject = { ...credentials };
					for (const [k, v] of Object.entries(output)) {
						if (v !== undefined && v !== null) {
							result[k] = v as ICredentialDataDecryptedObject[string];
						}
					}
					return result;
				}
			}
		}

		return undefined;
	}

	/**
	 * Get credentials instance
	 */
	async getCredentials(
		nodeCredentials: INodeCredentialsDetails,
		type: string,
	): Promise<ICredentials> {
		if (!nodeCredentials.id) {
			throw new Error('Credential ID is required');
		}

		const stored = await this.store.getByIdAndType(nodeCredentials.id, type);
		if (!stored) {
			throw new Error(`Credential not found: ${nodeCredentials.id} (type: ${type})`);
		}

		return new TemporalCredentials(nodeCredentials, type, stored.data);
	}

	/**
	 * Get decrypted credential data
	 */
	async getDecrypted(
		_additionalData: IWorkflowExecuteAdditionalData,
		nodeCredentials: INodeCredentialsDetails,
		type: string,
		mode: WorkflowExecuteMode,
		executeData?: IExecuteData,
		raw?: boolean,
		expressionResolveValues?: ICredentialsExpressionResolveValues,
	): Promise<ICredentialDataDecryptedObject> {
		if (!nodeCredentials.id) {
			throw new Error('Credential ID is required');
		}

		const stored = await this.store.getByIdAndType(nodeCredentials.id, type);
		if (!stored) {
			throw new Error(`Credential not found: ${nodeCredentials.id} (type: ${type})`);
		}

		let decryptedData = { ...stored.data };

		if (raw === true) {
			return decryptedData;
		}

		// Apply defaults from credential type properties
		const credentialProperties = this.getCredentialsProperties(type);
		const nodeParameters = NodeHelpers.getNodeParameters(
			credentialProperties,
			decryptedData as unknown as INodeParameters,
			true,
			false,
			null,
			null,
		);
		decryptedData = nodeParameters as unknown as ICredentialDataDecryptedObject;

		// Preserve OAuth token data if present
		if (stored.data.oauthTokenData !== undefined) {
			decryptedData.oauthTokenData = stored.data.oauthTokenData;
		}

		// Resolve expressions if provided
		if (expressionResolveValues) {
			try {
				const resolved = expressionResolveValues.workflow.expression.getParameterValue(
					decryptedData as unknown as INodeParameters,
					expressionResolveValues.runExecutionData,
					expressionResolveValues.runIndex,
					expressionResolveValues.itemIndex,
					expressionResolveValues.node.name,
					expressionResolveValues.connectionInputData,
					mode,
					{},
					executeData,
					false,
					decryptedData,
				);
				decryptedData = resolved as unknown as ICredentialDataDecryptedObject;
			} catch (e) {
				(e as Error).message += ' [Error resolving credentials]';
				throw e;
			}
		}

		return decryptedData;
	}

	/**
	 * Update credentials in the store
	 */
	async updateCredentials(
		nodeCredentials: INodeCredentialsDetails,
		_type: string,
		data: ICredentialDataDecryptedObject,
	): Promise<void> {
		if (!nodeCredentials.id) {
			throw new Error('Credential ID is required for update');
		}
		await this.store.update(nodeCredentials.id, data);
	}

	/**
	 * Update OAuth token data specifically
	 */
	async updateCredentialsOauthTokenData(
		nodeCredentials: INodeCredentialsDetails,
		_type: string,
		data: ICredentialDataDecryptedObject,
		_additionalData: IWorkflowExecuteAdditionalData,
	): Promise<void> {
		if (!nodeCredentials.id) {
			throw new Error('Credential ID is required for OAuth update');
		}

		const existing = await this.store.get(nodeCredentials.id);
		if (!existing) {
			throw new Error(`Credential not found: ${nodeCredentials.id}`);
		}

		await this.store.update(nodeCredentials.id, {
			...existing.data,
			oauthTokenData: data.oauthTokenData,
		});
	}

	/**
	 * Get credential type properties
	 */
	getCredentialsProperties(type: string): INodeProperties[] {
		const credentialType = this.credentialTypes.getByName(type);

		if (credentialType.extends === undefined) {
			// Add OAuth token data property for OAuth types
			if (['oAuth1Api', 'oAuth2Api'].includes(type)) {
				return [
					...credentialType.properties,
					{
						displayName: 'oauthTokenData',
						name: 'oauthTokenData',
						type: 'json',
						required: false,
						default: {},
					},
				];
			}
			return credentialType.properties;
		}

		// Combine properties from parent types
		const combineProperties: INodeProperties[] = [];
		for (const parentTypeName of credentialType.extends) {
			const parentProperties = this.getCredentialsProperties(parentTypeName);
			NodeHelpers.mergeNodeProperties(combineProperties, parentProperties);
		}

		NodeHelpers.mergeNodeProperties(combineProperties, credentialType.properties);
		return combineProperties;
	}

	/**
	 * Resolve expression values in credential data
	 */
	private resolveValue(
		parameterValue: string,
		additionalKeys: IDataObject,
		workflow: Workflow,
		node: INode,
	): string {
		if (!isExpression(parameterValue)) {
			return parameterValue;
		}

		const returnValue = workflow.expression.getSimpleParameterValue(
			node,
			parameterValue,
			'internal',
			additionalKeys,
			undefined,
			'',
		);

		if (!returnValue) {
			return '';
		}

		return returnValue.toString();
	}
}
