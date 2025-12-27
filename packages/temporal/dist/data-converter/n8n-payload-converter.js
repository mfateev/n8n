'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.payloadConverter = exports.n8nPayloadConverter = void 0;
const common_1 = require('@temporalio/common');
const n8n_workflow_1 = require('n8n-workflow');
const serialized_error_1 = require('../types/serialized-error');
function normalizeLevel(level) {
	if (level === 'warning' || level === 'error') {
		return level;
	}
	return undefined;
}
function normalizeFunctionality(functionality) {
	if (functionality === 'regular' || functionality === 'configuration-node') {
		return functionality;
	}
	return undefined;
}
class N8nJsonPayloadConverter {
	constructor() {
		this.jsonConverter = new common_1.JsonPayloadConverter();
		this.encodingType = 'json/plain';
	}
	toPayload(value) {
		if (value instanceof n8n_workflow_1.NodeApiError) {
			const serialized = {
				__type: 'NodeApiError',
				message: value.message,
				stack: value.stack,
				description: value.description ?? undefined,
				context: value.context,
				timestamp: value.timestamp,
				lineNumber: value.lineNumber,
				node: value.node,
				httpCode: value.httpCode,
				level: normalizeLevel(value.level),
				functionality: normalizeFunctionality(value.functionality),
			};
			return this.jsonConverter.toPayload(serialized);
		}
		if (value instanceof n8n_workflow_1.NodeOperationError) {
			const serialized = {
				__type: 'NodeOperationError',
				message: value.message,
				stack: value.stack,
				description: value.description ?? undefined,
				context: value.context,
				timestamp: value.timestamp,
				lineNumber: value.lineNumber,
				node: value.node,
				level: normalizeLevel(value.level),
				functionality: normalizeFunctionality(value.functionality),
			};
			return this.jsonConverter.toPayload(serialized);
		}
		if (value instanceof Error) {
			const serialized = {
				__type: 'Error',
				name: value.name,
				message: value.message,
				stack: value.stack,
			};
			return this.jsonConverter.toPayload(serialized);
		}
		if (Array.isArray(value)) {
			const processed = value.map((item) => this.processValue(item));
			return this.jsonConverter.toPayload(processed);
		}
		if (value && typeof value === 'object' && !(value instanceof Date)) {
			const processed = this.processObject(value);
			return this.jsonConverter.toPayload(processed);
		}
		return this.jsonConverter.toPayload(value);
	}
	fromPayload(payload) {
		const value = this.jsonConverter.fromPayload(payload);
		return this.deserializeValue(value);
	}
	processValue(value) {
		if (value instanceof Error) {
			return this.serializeError(value);
		}
		if (Array.isArray(value)) {
			return value.map((item) => this.processValue(item));
		}
		if (value && typeof value === 'object' && !(value instanceof Date)) {
			return this.processObject(value);
		}
		return value;
	}
	processObject(obj) {
		const result = {};
		for (const [key, value] of Object.entries(obj)) {
			result[key] = this.processValue(value);
		}
		return result;
	}
	serializeError(error) {
		if (error instanceof n8n_workflow_1.NodeApiError) {
			return {
				__type: 'NodeApiError',
				message: error.message,
				stack: error.stack,
				description: error.description ?? undefined,
				context: error.context,
				timestamp: error.timestamp,
				lineNumber: error.lineNumber,
				node: error.node,
				httpCode: error.httpCode,
				level: normalizeLevel(error.level),
				functionality: normalizeFunctionality(error.functionality),
			};
		}
		if (error instanceof n8n_workflow_1.NodeOperationError) {
			return {
				__type: 'NodeOperationError',
				message: error.message,
				stack: error.stack,
				description: error.description ?? undefined,
				context: error.context,
				timestamp: error.timestamp,
				lineNumber: error.lineNumber,
				node: error.node,
				level: normalizeLevel(error.level),
				functionality: normalizeFunctionality(error.functionality),
			};
		}
		return {
			__type: 'Error',
			name: error.name,
			message: error.message,
			stack: error.stack,
		};
	}
	deserializeValue(value) {
		if ((0, serialized_error_1.isSerializedError)(value)) {
			return this.deserializeError(value);
		}
		if (Array.isArray(value)) {
			return value.map((item) => this.deserializeValue(item));
		}
		if (value && typeof value === 'object' && !(value instanceof Date)) {
			const result = {};
			for (const [key, val] of Object.entries(value)) {
				result[key] = this.deserializeValue(val);
			}
			return result;
		}
		return value;
	}
	deserializeError(serialized) {
		switch (serialized.__type) {
			case 'NodeApiError': {
				const error = new n8n_workflow_1.NodeApiError(
					serialized.node,
					{ message: serialized.message },
					{
						message: serialized.message,
						description: serialized.description ?? undefined,
						httpCode: serialized.httpCode ?? undefined,
					},
				);
				error.stack = serialized.stack;
				if (serialized.context) {
					error.context = serialized.context;
				}
				if (serialized.timestamp) {
					error.timestamp = serialized.timestamp;
				}
				if (serialized.lineNumber) {
					error.lineNumber = serialized.lineNumber;
				}
				return error;
			}
			case 'NodeOperationError': {
				const error = new n8n_workflow_1.NodeOperationError(serialized.node, serialized.message, {
					description: serialized.description ?? undefined,
				});
				error.stack = serialized.stack;
				if (serialized.context) {
					error.context = serialized.context;
				}
				if (serialized.timestamp) {
					error.timestamp = serialized.timestamp;
				}
				if (serialized.lineNumber) {
					error.lineNumber = serialized.lineNumber;
				}
				return error;
			}
			case 'Error':
			default: {
				const error = new Error(serialized.message);
				error.name = serialized.name;
				error.stack = serialized.stack;
				return error;
			}
		}
	}
}
exports.n8nPayloadConverter = new common_1.CompositePayloadConverter(
	new common_1.UndefinedPayloadConverter(),
	new common_1.BinaryPayloadConverter(),
	new N8nJsonPayloadConverter(),
);
exports.payloadConverter = exports.n8nPayloadConverter;
//# sourceMappingURL=n8n-payload-converter.js.map
