/**
 * N8n Payload Converter
 *
 * Custom Temporal payload converter that handles n8n-specific types,
 * particularly Error subclasses that need special serialization.
 *
 * This converter:
 * 1. Detects n8n error types during serialization (via duck typing)
 * 2. Converts them to tagged JSON objects
 * 3. Reconstructs as generic Error objects during deserialization
 *
 * NOTE: We do NOT import from n8n-workflow here because this code
 * runs in Temporal's V8 sandbox which cannot handle dynamic require().
 * Instead we use duck typing to detect n8n error types.
 */

import {
	BinaryPayloadConverter,
	CompositePayloadConverter,
	JsonPayloadConverter,
	UndefinedPayloadConverter,
	type Payload,
	type PayloadConverterWithEncoding,
} from '@temporalio/common';

import type { SerializedError } from '../types/serialized-error';
import { isSerializedError } from '../types/serialized-error';

/**
 * Duck-type check for NodeApiError
 * Checks for properties specific to NodeApiError
 */
function isNodeApiError(value: unknown): boolean {
	if (!(value instanceof Error)) return false;
	const error = value as Error & Record<string, unknown>;
	return (
		error.name === 'NodeApiError' ||
		(typeof error.httpCode !== 'undefined' &&
			typeof error.node !== 'undefined' &&
			typeof error.timestamp !== 'undefined')
	);
}

/**
 * Duck-type check for NodeOperationError
 * Checks for properties specific to NodeOperationError
 */
function isNodeOperationError(value: unknown): boolean {
	if (!(value instanceof Error)) return false;
	const error = value as Error & Record<string, unknown>;
	return (
		error.name === 'NodeOperationError' ||
		(typeof error.node !== 'undefined' &&
			typeof error.timestamp !== 'undefined' &&
			typeof error.httpCode === 'undefined') // NodeApiError has httpCode, NodeOperationError doesn't
	);
}

/**
 * Normalize level to match our constrained type
 */
function normalizeLevel(level: unknown): 'warning' | 'error' | undefined {
	if (level === 'warning' || level === 'error') {
		return level;
	}
	return undefined;
}

/**
 * Normalize functionality to match our constrained type
 */
function normalizeFunctionality(
	functionality: unknown,
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
		// Handle n8n error types via duck typing
		if (isNodeApiError(value)) {
			const error = value as Error & Record<string, unknown>;
			const serialized: SerializedError = {
				__type: 'NodeApiError',
				message: error.message,
				stack: error.stack,
				description: (error.description as string) ?? undefined,
				context: error.context as Record<string, unknown>,
				timestamp: error.timestamp as number,
				lineNumber: error.lineNumber as number,
				node: error.node as Record<string, unknown>,
				httpCode: error.httpCode as string,
				level: normalizeLevel(error.level),
				functionality: normalizeFunctionality(error.functionality),
			};
			return this.jsonConverter.toPayload(serialized);
		}

		if (isNodeOperationError(value)) {
			const error = value as Error & Record<string, unknown>;
			const serialized: SerializedError = {
				__type: 'NodeOperationError',
				message: error.message,
				stack: error.stack,
				description: (error.description as string) ?? undefined,
				context: error.context as Record<string, unknown>,
				timestamp: error.timestamp as number,
				lineNumber: error.lineNumber as number,
				node: error.node as Record<string, unknown>,
				level: normalizeLevel(error.level),
				functionality: normalizeFunctionality(error.functionality),
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
		const errorRecord = error as Error & Record<string, unknown>;

		if (isNodeApiError(error)) {
			return {
				__type: 'NodeApiError',
				message: error.message,
				stack: error.stack,
				description: (errorRecord.description as string) ?? undefined,
				context: errorRecord.context as Record<string, unknown>,
				timestamp: errorRecord.timestamp as number,
				lineNumber: errorRecord.lineNumber as number,
				node: errorRecord.node as Record<string, unknown>,
				httpCode: errorRecord.httpCode as string,
				level: normalizeLevel(errorRecord.level),
				functionality: normalizeFunctionality(errorRecord.functionality),
			};
		}

		if (isNodeOperationError(error)) {
			return {
				__type: 'NodeOperationError',
				message: error.message,
				stack: error.stack,
				description: (errorRecord.description as string) ?? undefined,
				context: errorRecord.context as Record<string, unknown>,
				timestamp: errorRecord.timestamp as number,
				lineNumber: errorRecord.lineNumber as number,
				node: errorRecord.node as Record<string, unknown>,
				level: normalizeLevel(errorRecord.level),
				functionality: normalizeFunctionality(errorRecord.functionality),
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
	 *
	 * NOTE: In the workflow sandbox, we cannot reconstruct actual n8n error
	 * classes because we can't import n8n-workflow. Instead, we create
	 * generic Error objects with all the properties preserved. The actual
	 * n8n error classes will be reconstructed when needed outside the sandbox.
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
	 *
	 * In the workflow sandbox, we create generic Error objects with the
	 * original properties preserved. The error can be identified by checking
	 * the 'name' property or the extra properties we add.
	 */
	private deserializeError(serialized: SerializedError): Error {
		const error = new Error(serialized.message);
		error.stack = serialized.stack;

		// Preserve all n8n error properties on the error object
		const errorRecord = error as Error & Record<string, unknown>;
		errorRecord.__type = serialized.__type;

		// Copy base properties that exist on all serialized errors
		if (serialized.description !== undefined) {
			errorRecord.description = serialized.description;
		}
		if (serialized.context !== undefined) {
			errorRecord.context = serialized.context;
		}
		if (serialized.timestamp !== undefined) {
			errorRecord.timestamp = serialized.timestamp;
		}
		if (serialized.lineNumber !== undefined) {
			errorRecord.lineNumber = serialized.lineNumber;
		}

		// Handle type-specific properties using discriminated union
		switch (serialized.__type) {
			case 'NodeApiError':
				error.name = 'NodeApiError';
				if (serialized.node !== undefined) {
					errorRecord.node = serialized.node;
				}
				if (serialized.httpCode !== undefined) {
					errorRecord.httpCode = serialized.httpCode;
				}
				if (serialized.level !== undefined) {
					errorRecord.level = serialized.level;
				}
				if (serialized.functionality !== undefined) {
					errorRecord.functionality = serialized.functionality;
				}
				break;

			case 'NodeOperationError':
				error.name = 'NodeOperationError';
				if (serialized.node !== undefined) {
					errorRecord.node = serialized.node;
				}
				if (serialized.level !== undefined) {
					errorRecord.level = serialized.level;
				}
				if (serialized.functionality !== undefined) {
					errorRecord.functionality = serialized.functionality;
				}
				break;

			case 'Error':
			default:
				error.name = serialized.name ?? 'Error';
				break;
		}

		return error;
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
