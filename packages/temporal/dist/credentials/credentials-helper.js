'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.TemporalCredentialsHelper = void 0;
const n8n_workflow_1 = require('n8n-workflow');
class TemporalCredentials {
	constructor(nodeCredentials, type, decryptedData) {
		this.id = nodeCredentials.id ?? undefined;
		this.name = nodeCredentials.name;
		this.type = type;
		this.decryptedData = decryptedData;
		this.data = undefined;
	}
	getData() {
		return this.decryptedData;
	}
	getDataToSave() {
		return {
			id: this.id,
			name: this.name,
			type: this.type,
			data: '',
		};
	}
	setData(_data) {
		throw new Error('setData is not supported in Temporal credentials');
	}
}
class TemporalCredentialsHelper extends n8n_workflow_1.ICredentialsHelper {
	constructor(store, credentialTypes) {
		super();
		this.store = store;
		this.credentialTypes = credentialTypes;
	}
	getParentTypes(name) {
		return this.credentialTypes.getParentTypes(name);
	}
	async authenticate(credentials, typeName, incomingRequestOptions, workflow, node) {
		const requestOptions = incomingRequestOptions;
		const credentialType = this.credentialTypes.getByName(typeName);
		if (credentialType.authenticate) {
			if (typeof credentialType.authenticate === 'function') {
				return await credentialType.authenticate(credentials, requestOptions);
			}
			if (typeof credentialType.authenticate === 'object') {
				const { authenticate } = credentialType;
				requestOptions.headers ??= {};
				if (authenticate.type === 'generic') {
					Object.entries(authenticate.properties).forEach(([outerKey, outerValue]) => {
						Object.entries(outerValue).forEach(([key, value]) => {
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
							const options = requestOptions;
							options[outerKey] ??= {};
							options[outerKey][keyResolved] = valueResolved;
						});
					});
				}
			}
		}
		return requestOptions;
	}
	async preAuthentication(helpers, credentials, typeName, node, credentialsExpired) {
		const credentialType = this.credentialTypes.getByName(typeName);
		const expirableProperty = credentialType.properties?.find(
			(property) => property.type === 'hidden' && property.typeOptions?.expirable === true,
		);
		if (expirableProperty?.name === undefined) {
			return undefined;
		}
		if (credentialType.preAuthentication) {
			if (typeof credentialType.preAuthentication === 'function') {
				if (credentials[expirableProperty.name] === '' || credentialsExpired) {
					const output = await credentialType.preAuthentication.call(helpers, credentials);
					if (output[expirableProperty.name] === undefined) {
						return undefined;
					}
					if (node.credentials) {
						const nodeCredDetails = node.credentials[credentialType.name];
						if (nodeCredDetails?.id) {
							const updatedCredentials = {
								...credentials,
							};
							for (const [k, v] of Object.entries(output)) {
								if (v !== undefined && v !== null) {
									updatedCredentials[k] = v;
								}
							}
							await this.updateCredentials(
								nodeCredDetails,
								credentialType.name,
								updatedCredentials,
							);
						}
					}
					const result = { ...credentials };
					for (const [k, v] of Object.entries(output)) {
						if (v !== undefined && v !== null) {
							result[k] = v;
						}
					}
					return result;
				}
			}
		}
		return undefined;
	}
	async getCredentials(nodeCredentials, type) {
		if (!nodeCredentials.id) {
			throw new Error('Credential ID is required');
		}
		const stored = await this.store.getByIdAndType(nodeCredentials.id, type);
		if (!stored) {
			throw new Error(`Credential not found: ${nodeCredentials.id} (type: ${type})`);
		}
		return new TemporalCredentials(nodeCredentials, type, stored.data);
	}
	async getDecrypted(
		_additionalData,
		nodeCredentials,
		type,
		mode,
		executeData,
		raw,
		expressionResolveValues,
	) {
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
		const credentialProperties = this.getCredentialsProperties(type);
		const nodeParameters = n8n_workflow_1.NodeHelpers.getNodeParameters(
			credentialProperties,
			decryptedData,
			true,
			false,
			null,
			null,
		);
		decryptedData = nodeParameters;
		if (stored.data.oauthTokenData !== undefined) {
			decryptedData.oauthTokenData = stored.data.oauthTokenData;
		}
		if (expressionResolveValues) {
			try {
				const resolved = expressionResolveValues.workflow.expression.getParameterValue(
					decryptedData,
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
				decryptedData = resolved;
			} catch (e) {
				e.message += ' [Error resolving credentials]';
				throw e;
			}
		}
		return decryptedData;
	}
	async updateCredentials(nodeCredentials, _type, data) {
		if (!nodeCredentials.id) {
			throw new Error('Credential ID is required for update');
		}
		await this.store.update(nodeCredentials.id, data);
	}
	async updateCredentialsOauthTokenData(nodeCredentials, _type, data, _additionalData) {
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
	getCredentialsProperties(type) {
		const credentialType = this.credentialTypes.getByName(type);
		if (credentialType.extends === undefined) {
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
		const combineProperties = [];
		for (const parentTypeName of credentialType.extends) {
			const parentProperties = this.getCredentialsProperties(parentTypeName);
			n8n_workflow_1.NodeHelpers.mergeNodeProperties(combineProperties, parentProperties);
		}
		n8n_workflow_1.NodeHelpers.mergeNodeProperties(combineProperties, credentialType.properties);
		return combineProperties;
	}
	resolveValue(parameterValue, additionalKeys, workflow, node) {
		if (!(0, n8n_workflow_1.isExpression)(parameterValue)) {
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
exports.TemporalCredentialsHelper = TemporalCredentialsHelper;
//# sourceMappingURL=credentials-helper.js.map
