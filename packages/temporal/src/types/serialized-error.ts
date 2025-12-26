/**
 * Serialized Error Types
 *
 * Type definitions for serializing n8n error types through Temporal.
 * Temporal's default serialization doesn't preserve Error subclass information,
 * so we use a tagged union pattern.
 */

import type { INode, IDataObject } from 'n8n-workflow';

/**
 * Base serialized error structure
 */
interface BaseSerializedError {
	message: string;
	stack?: string;
	description?: string | null;
	context?: IDataObject;
	timestamp?: number;
	lineNumber?: number;
}

/**
 * Serialized NodeApiError
 * Represents errors from external API calls
 */
export interface SerializedNodeApiError extends BaseSerializedError {
	__type: 'NodeApiError';
	node: INode;
	httpCode?: string;
	level?: 'warning' | 'error';
	functionality?: 'regular' | 'configuration-node';
}

/**
 * Serialized NodeOperationError
 * Represents errors in node operation/configuration
 */
export interface SerializedNodeOperationError extends BaseSerializedError {
	__type: 'NodeOperationError';
	node: INode;
	level?: 'warning' | 'error';
	functionality?: 'regular' | 'configuration-node';
}

/**
 * Serialized generic Error
 */
export interface SerializedGenericError extends BaseSerializedError {
	__type: 'Error';
	name: string;
}

/**
 * Union type for all serialized errors
 */
export type SerializedError =
	| SerializedNodeApiError
	| SerializedNodeOperationError
	| SerializedGenericError;

/**
 * Type guard to check if a value is a serialized error
 */
export function isSerializedError(value: unknown): value is SerializedError {
	return (
		typeof value === 'object' &&
		value !== null &&
		'__type' in value &&
		typeof (value as SerializedError).__type === 'string'
	);
}
