/**
 * Worker Bootstrap
 *
 * Initializes and runs a Temporal worker for n8n workflow execution.
 *
 * Initialization Steps:
 * 1. Load credential store from JSON file
 * 2. Load all node types (~400 nodes)
 * 3. Load credential type definitions
 * 4. Initialize worker context (singleton)
 * 5. Connect to Temporal server
 * 6. Start worker
 */

import { Worker } from '@temporalio/worker';
import type { NativeConnection, WorkerOptions } from '@temporalio/worker';

import { initializeWorkerContext } from './context';
import * as activities from '../activities';
import type { TemporalBinaryDataHelper } from '../binary-data/temporal-binary-data-helper';
import { initializeBinaryDataHelper } from '../binary-data/temporal-binary-data-helper';
import type {
	TemporalWorkerConfig,
	CredentialStoreConfig,
	BinaryDataConfig,
} from '../config/types';
import { createWorkerConnection } from '../connection/worker-connection';
import { TemporalCredentialTypes } from '../credentials/credential-types';
import { TemporalCredentialsHelper } from '../credentials/credentials-helper';
import { JsonFileCredentialStore } from '../credentials/json-file-store';
import { TemporalNodeTypes } from '../nodes/node-types';

/**
 * Complete worker configuration
 */
export interface WorkerBootstrapConfig {
	temporal: TemporalWorkerConfig;
	credentials: CredentialStoreConfig;
	binaryData?: BinaryDataConfig;
}

/**
 * Run result from the worker
 */
export interface WorkerRunResult {
	shutdown: () => Promise<void>;
}

/**
 * Bootstrap and run a Temporal worker
 *
 * @param config - Worker configuration
 * @returns Object with shutdown function
 *
 * @example
 * ```typescript
 * const config = {
 *   temporal: {
 *     address: 'localhost:7233',
 *     taskQueue: 'n8n-workflows',
 *   },
 *   credentials: {
 *     path: './credentials.json',
 *   },
 * };
 *
 * const { shutdown } = await runWorker(config);
 *
 * // Handle shutdown signal
 * process.on('SIGINT', shutdown);
 * ```
 */
export async function runWorker(config: WorkerBootstrapConfig): Promise<WorkerRunResult> {
	console.log('[Worker] Starting initialization...');

	// 1. Load credential store
	console.log(`[Worker] Loading credentials from ${config.credentials.path}`);
	const credentialStore = new JsonFileCredentialStore(config.credentials.path);
	await credentialStore.load();

	// 2. Load node types
	console.log('[Worker] Loading node types...');
	const nodeTypes = new TemporalNodeTypes();
	await nodeTypes.loadAll();
	console.log('[Worker] Node types loaded');

	// 3. Load credential types (synchronous)
	console.log('[Worker] Loading credential types...');
	const credentialTypes = new TemporalCredentialTypes(nodeTypes);
	credentialTypes.loadAll();
	console.log('[Worker] Credential types loaded');

	// 4. Create credentials helper
	const credentialsHelper = new TemporalCredentialsHelper(credentialStore, credentialTypes);

	// 5. Initialize binary data helper (optional)
	let binaryDataHelper: TemporalBinaryDataHelper | undefined;
	if (config.binaryData) {
		console.log(`[Worker] Initializing binary data helper (mode: ${config.binaryData.mode})`);
		const result = await initializeBinaryDataHelper(config.binaryData);
		binaryDataHelper = result.helper;
		console.log('[Worker] Binary data helper initialized');
	}

	// 6. Initialize worker context
	const identity = config.temporal.identity ?? `n8n-worker-${process.pid}`;
	initializeWorkerContext({
		nodeTypes,
		credentialsHelper,
		credentialTypes,
		binaryDataConfig: config.binaryData,
		binaryDataHelper,
		identity,
	});
	console.log('[Worker] Worker context initialized');

	// 7. Create Temporal connection
	console.log(`[Worker] Connecting to Temporal at ${config.temporal.address}`);
	const connection = await createWorkerConnection(config.temporal);

	// 8. Create worker
	const workerOptions: WorkerOptions = {
		connection,
		namespace: config.temporal.namespace ?? 'default',
		taskQueue: config.temporal.taskQueue,
		workflowsPath: require.resolve('../workflows'),
		activities,
		identity,
		dataConverter: {
			payloadConverterPath: require.resolve('../data-converter'),
		},
	};

	// Apply optional configuration
	if (config.temporal.maxConcurrentActivityTaskExecutions) {
		workerOptions.maxConcurrentActivityTaskExecutions =
			config.temporal.maxConcurrentActivityTaskExecutions;
	}
	if (config.temporal.maxConcurrentWorkflowTaskExecutions) {
		workerOptions.maxConcurrentWorkflowTaskExecutions =
			config.temporal.maxConcurrentWorkflowTaskExecutions;
	}
	if (config.temporal.maxCachedWorkflows) {
		workerOptions.maxCachedWorkflows = config.temporal.maxCachedWorkflows;
	}

	const worker = await Worker.create(workerOptions);

	console.log(`[Worker] Worker started on task queue: ${config.temporal.taskQueue}`);

	// 9. Run the worker (this blocks until shutdown)
	const runPromise = worker.run();

	// Return shutdown function
	return {
		shutdown: async () => {
			console.log('[Worker] Shutting down...');
			worker.shutdown();
			await runPromise;
			await connection.close();
			console.log('[Worker] Shutdown complete');
		},
	};
}

/**
 * Create a worker but don't run it (for testing)
 */
export async function createWorkerInstance(
	config: WorkerBootstrapConfig,
): Promise<{ worker: Worker; connection: NativeConnection }> {
	// Same initialization as runWorker, but return the worker instead of running

	const credentialStore = new JsonFileCredentialStore(config.credentials.path);
	await credentialStore.load();

	const nodeTypes = new TemporalNodeTypes();
	await nodeTypes.loadAll();

	const credentialTypes = new TemporalCredentialTypes(nodeTypes);
	credentialTypes.loadAll();

	const credentialsHelper = new TemporalCredentialsHelper(credentialStore, credentialTypes);

	// Initialize binary data helper (optional)
	let binaryDataHelper: TemporalBinaryDataHelper | undefined;
	if (config.binaryData) {
		const result = await initializeBinaryDataHelper(config.binaryData);
		binaryDataHelper = result.helper;
	}

	const identity = config.temporal.identity ?? `n8n-worker-${process.pid}`;
	initializeWorkerContext({
		nodeTypes,
		credentialsHelper,
		credentialTypes,
		binaryDataConfig: config.binaryData,
		binaryDataHelper,
		identity,
	});

	const connection = await createWorkerConnection(config.temporal);

	const worker = await Worker.create({
		connection,
		namespace: config.temporal.namespace ?? 'default',
		taskQueue: config.temporal.taskQueue,
		workflowsPath: require.resolve('../workflows'),
		activities,
		identity,
		dataConverter: {
			payloadConverterPath: require.resolve('../data-converter'),
		},
	});

	return { worker, connection };
}
