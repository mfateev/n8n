/**
 * Worker Context Singleton
 *
 * Holds pre-loaded resources that are shared across all Activity executions.
 * Initialized once at worker startup, then accessed by Activities.
 *
 * Why a singleton?
 * - Node types take time to load (~400 nodes)
 * - Credentials should be loaded once and cached
 * - Activities need access to these without re-initialization
 */

import type { INodeTypes, ICredentialsHelper } from 'n8n-workflow';

import type { BinaryDataConfig } from '../config/types';
import type { TemporalCredentialTypes } from '../credentials/credential-types';

/**
 * Worker context containing pre-loaded resources
 */
export interface WorkerContext {
	/** Pre-loaded node type registry */
	nodeTypes: INodeTypes;

	/** Credentials helper for resolving credentials */
	credentialsHelper: ICredentialsHelper;

	/** Credential type definitions */
	credentialTypes: TemporalCredentialTypes;

	/** Optional binary data configuration */
	binaryDataConfig?: BinaryDataConfig;

	/** Worker identity (for logging) */
	identity: string;
}

/**
 * Global worker context instance
 * Set during worker initialization, accessed by Activities
 */
let workerContext: WorkerContext | undefined;

/**
 * Get the initialized worker context
 *
 * @throws Error if context has not been initialized
 */
export function getWorkerContext(): WorkerContext {
	if (!workerContext) {
		throw new Error(
			'Worker context not initialized. ' +
				'Call initializeWorkerContext() during worker startup before executing activities.',
		);
	}
	return workerContext;
}

/**
 * Initialize the worker context with pre-loaded resources
 *
 * This should be called once during worker startup, before any Activities execute.
 *
 * @param context - The initialized context with all required resources
 */
export function initializeWorkerContext(context: WorkerContext): void {
	if (workerContext) {
		console.warn(
			'Worker context already initialized. ' +
				'Re-initialization may indicate a bug - context should only be set once.',
		);
	}
	workerContext = context;
}

/**
 * Check if the worker context has been initialized
 */
export function isWorkerContextInitialized(): boolean {
	return workerContext !== undefined;
}

/**
 * Clear the worker context (for testing purposes only)
 */
export function clearWorkerContext(): void {
	workerContext = undefined;
}
