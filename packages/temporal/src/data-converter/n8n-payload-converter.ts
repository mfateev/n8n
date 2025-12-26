/**
 * N8n Payload Converter
 *
 * Custom Temporal payload converter that handles n8n-specific types,
 * particularly Error subclasses that need special serialization.
 *
 * This converter:
 * 1. Detects n8n error types during serialization
 * 2. Converts them to tagged JSON objects
 * 3. Reconstructs the original error classes during deserialization
 */

import {
	BinaryPayloadConverter,
	CompositePayloadConverter,
	JsonPayloadConverter,
	UndefinedPayloadConverter,
	type Payload,
	type PayloadConverterWithEncoding,
} from '@temporalio/common';
import { NodeApiError, NodeOperationError } from 'n8n-workflow';

import type { SerializedError } from '../types/serialized-error';
import { isSerializedError } from '../types/serialized-error';

/**
 * Normalize level to match our constrained type
 */
function normalizeLevel(level: string | undefined): 'warning' | 'error' | undefined {
	if (level === 'warning' || level === 'error') {
		return level;
	}
	return undefined;
}

/**
 * Normalize functionality to match our constrained type
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
 * Custom JSON payload converter that handles n8n error types
 *
 * Implements PayloadConverterWithEncoding to be compatible with CompositePayloadConverter
 */
class N8nJsonPayloadConverter implements PayloadConverterWithEncoding {
	private readonly jsonConverter = new JsonPayloadConverter();

	/**
	 * Encoding type for this converter - uses JSON encoding
	 */
	readonly encodingType = 'json/plain';

	toPayload<T>(value: T): Payload | undefined {
		// Handle n8n error types
		if (value instanceof NodeApiError) {
			const serialized: SerializedError = {
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

		if (value instanceof NodeOperationError) {
			const serialized: SerializedError = {
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

		// Handle generic Error instances
		if (value instanceof Error) {
			const serialized: SerializedError = {
				__type: 'Error',
				name: value.name,
				message: value.message,
				stack: value.stack,
			};
			return this.jsonConverter.toPayload(serialized);
		}

		// Recursively check for Error objects in arrays and objects
		if (Array.isArray(value)) {
			const processed = value.map((item) => this.processValue(item));
			return this.jsonConverter.toPayload(processed);
		}

		if (value && typeof value === 'object' && !(value instanceof Date)) {
			const processed = this.processObject(value as Record<string, unknown>);
			return this.jsonConverter.toPayload(processed);
		}

		// Default to standard JSON conversion
		return this.jsonConverter.toPayload(value);
	}

	fromPayload<T>(payload: Payload): T {
		const value = this.jsonConverter.fromPayload(payload);
		return this.deserializeValue(value) as T;
	}

	/**
	 * Process a value, converting any Error instances
	 */
	private processValue(value: unknown): unknown {
		if (value instanceof Error) {
			return this.serializeError(value);
		}
		if (Array.isArray(value)) {
			return value.map((item) => this.processValue(item));
		}
		if (value && typeof value === 'object' && !(value instanceof Date)) {
			return this.processObject(value as Record<string, unknown>);
		}
		return value;
	}

	/**
	 * Process an object, converting any nested Error instances
	 */
	private processObject(obj: Record<string, unknown>): Record<string, unknown> {
		const result: Record<string, unknown> = {};
		for (const [key, value] of Object.entries(obj)) {
			result[key] = this.processValue(value);
		}
		return result;
	}

	/**
	 * Serialize an Error to our tagged format
	 */
	private serializeError(error: Error): SerializedError {
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

		return {
			__type: 'Error',
			name: error.name,
			message: error.message,
			stack: error.stack,
		};
	}

	/**
	 * Recursively deserialize values, reconstructing Error instances
	 */
	private deserializeValue(value: unknown): unknown {
		if (isSerializedError(value)) {
			return this.deserializeError(value);
		}

		if (Array.isArray(value)) {
			return value.map((item) => this.deserializeValue(item));
		}

		if (value && typeof value === 'object' && !(value instanceof Date)) {
			const result: Record<string, unknown> = {};
			for (const [key, val] of Object.entries(value as Record<string, unknown>)) {
				result[key] = this.deserializeValue(val);
			}
			return result;
		}

		return value;
	}

	/**
	 * Reconstruct an Error from our serialized format
	 */
	private deserializeError(serialized: SerializedError): Error {
		switch (serialized.__type) {
			case 'NodeApiError': {
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
				if (serialized.timestamp) {
					error.timestamp = serialized.timestamp;
				}
				if (serialized.lineNumber) {
					error.lineNumber = serialized.lineNumber;
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

/**
 * Create the n8n-aware payload converter
 *
 * This composites our custom JSON converter with the standard converters.
 * The order matters: converters are tried in sequence until one handles the value.
 */
export const n8nPayloadConverter = new CompositePayloadConverter(
	new UndefinedPayloadConverter(),
	new BinaryPayloadConverter(),
	new N8nJsonPayloadConverter(),
);

/**
 * Export for use in worker configuration
 */
export const payloadConverter = n8nPayloadConverter;
