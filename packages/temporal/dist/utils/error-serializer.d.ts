import type { SerializedError } from '../types/serialized-error';
export declare function serializeError(error: Error): SerializedError;
export declare function deserializeError(serialized: SerializedError): Error;
