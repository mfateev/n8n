'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.serializeError = serializeError;
exports.deserializeError = deserializeError;
const n8n_workflow_1 = require('n8n-workflow');
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
function serializeError(error) {
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
function deserializeError(serialized) {
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
//# sourceMappingURL=error-serializer.js.map
