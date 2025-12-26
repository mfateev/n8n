/**
 * @n8n/temporal - Temporal integration for n8n workflows
 *
 * This package provides the ability to run n8n workflows as Temporal workflows,
 * enabling durable execution with fault tolerance and observability.
 */

// Configuration types
export type * from './config/types';

// Connection utilities
export * from './connection/client';
export * from './connection/worker-connection';

// Credentials
export type * from './credentials/credential-store';
export * from './credentials/json-file-store';
export * from './credentials/credentials-helper';
export * from './credentials/credential-types';

// Node types
export * from './nodes/node-types';
export * from './nodes/loader';

// Types
export type * from './types';

// Activities
export * from './activities';

// Worker utilities
export * from './worker/context';

// Utility functions
export { buildAdditionalData } from './utils/additional-data';
export { serializeError, deserializeError } from './utils/error-serializer';
export { mergeWorkflowStepResult, getExecutedNodeNames } from './utils/state-merge';
