/**
 * Error Serializer
 *
 * Utilities for serializing n8n error types for transmission through Temporal.
 * This file runs OUTSIDE the V8 sandbox, so it can import from n8n-workflow.
 */

import type { IDataObject, INode } from 'n8n-workflow';
import { NodeApiError, NodeOperationError } from 'n8n-workflow';

import type {
	SerializedError,
	SerializedNodeApiError,
	SerializedNodeOperationError,
	SerializedGenericError,
} from '../types/serialized-error';

/**
 * Convert level to our constrained type
 */
function normalizeLevel(level: string | undefined): 'warning' | 'error' | undefined {
	if (level === 'warning' || level === 'error') {
		return level;
	}
	return undefined;
}

/**
 * Convert functionality to our constrained type
 */
function normalizeFunctionality(
	functionality: string | undefined,
): 'regular' | 'configuration-node' | undefined {
	if (functionality === 'regular' || functionality === 'configuration-node') {
		return functionality;
	}
	return undefined;
}

/**
 * Serialize an error to a JSON-serializable format
 */
export function serializeError(error: Error): SerializedError {
	if (error instanceof NodeApiError) {
		const serialized: SerializedNodeApiError = {
			__type: 'NodeApiError',
			message: error.message,
			stack: error.stack,
			description: error.description ?? undefined,
			context: error.context as Record<string, unknown> | undefined,
			timestamp: error.timestamp,
			lineNumber: error.lineNumber,
			node: error.node as unknown as Record<string, unknown>,
			httpCode: error.httpCode,
			level: normalizeLevel(error.level),
			functionality: normalizeFunctionality(error.functionality),
		};
		return serialized;
	}

	if (error instanceof NodeOperationError) {
		const serialized: SerializedNodeOperationError = {
			__type: 'NodeOperationError',
			message: error.message,
			stack: error.stack,
			description: error.description ?? undefined,
			context: error.context as Record<string, unknown> | undefined,
			timestamp: error.timestamp,
			lineNumber: error.lineNumber,
			node: error.node as unknown as Record<string, unknown>,
			level: normalizeLevel(error.level),
			functionality: normalizeFunctionality(error.functionality),
		};
		return serialized;
	}

	// Generic Error
	const serialized: SerializedGenericError = {
		__type: 'Error',
		name: error.name,
		message: error.message,
		stack: error.stack,
	};
	return serialized;
}

/**
 * Deserialize a SerializedError back to an Error instance
 * Note: This recreates the error class with available data
 */
export function deserializeError(serialized: SerializedError): Error {
	switch (serialized.__type) {
		case 'NodeApiError': {
			// NodeApiError expects (node, errorResponse, options)
			// We pass the message in errorResponse and other options separately
			const node = (serialized.node ?? { name: 'Unknown' }) as unknown as INode;
			const error = new NodeApiError(
				node,
				{ message: serialized.message },
				{
					message: serialized.message,
					description: serialized.description ?? undefined,
					httpCode: serialized.httpCode ?? undefined,
				},
			);
			error.stack = serialized.stack;
			if (serialized.context) {
				error.context = serialized.context as IDataObject;
			}
			return error;
		}

		case 'NodeOperationError': {
			const node = (serialized.node ?? { name: 'Unknown' }) as unknown as INode;
			const error = new NodeOperationError(node, serialized.message, {
				description: serialized.description ?? undefined,
			});
			error.stack = serialized.stack;
			if (serialized.context) {
				error.context = serialized.context as IDataObject;
			}
			return error;
		}

		case 'Error':
		default: {
			const error = new Error(serialized.message);
			if (serialized.__type === 'Error' && serialized.name) {
				error.name = serialized.name;
			}
			error.stack = serialized.stack;
			return error;
		}
	}
}
