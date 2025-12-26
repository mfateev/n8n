/**
 * Error Serializer
 *
 * Utilities for serializing n8n error types for transmission through Temporal.
 */

import { NodeApiError, NodeOperationError } from 'n8n-workflow';

import type { SerializedError } from '../types/serialized-error';

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

	if (error instanceof NodeOperationError) {
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

	// Generic Error
	return {
		__type: 'Error',
		name: error.name,
		message: error.message,
		stack: error.stack,
	};
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
			const error = new NodeApiError(
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
			const error = new NodeOperationError(serialized.node, serialized.message, {
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
