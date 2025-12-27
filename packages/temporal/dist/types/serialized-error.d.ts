import type { INode, IDataObject } from 'n8n-workflow';
interface BaseSerializedError {
	message: string;
	stack?: string;
	description?: string | null;
	context?: IDataObject;
	timestamp?: number;
	lineNumber?: number;
}
export interface SerializedNodeApiError extends BaseSerializedError {
	__type: 'NodeApiError';
	node: INode;
	httpCode?: string | null;
	level?: 'warning' | 'error';
	functionality?: 'regular' | 'configuration-node';
}
export interface SerializedNodeOperationError extends BaseSerializedError {
	__type: 'NodeOperationError';
	node: INode;
	level?: 'warning' | 'error';
	functionality?: 'regular' | 'configuration-node';
}
export interface SerializedGenericError extends BaseSerializedError {
	__type: 'Error';
	name: string;
}
export type SerializedError =
	| SerializedNodeApiError
	| SerializedNodeOperationError
	| SerializedGenericError;
export declare function isSerializedError(value: unknown): value is SerializedError;
export {};
