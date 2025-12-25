/**
 * POC 8: Temporal Worker
 *
 * This worker hosts both the Workflow and Activities.
 * Key test: Can the workflow bundle succeed with n8n dependencies?
 */

import { Worker, NativeConnection } from '@temporalio/worker';
import * as activities from './activities/index.js';

async function run() {
	console.log('Starting Temporal Worker for POC 8...');

	// Connect to Temporal server
	const connection = await NativeConnection.connect({
		address: process.env.TEMPORAL_ADDRESS ?? 'localhost:7233',
	});

	// Create worker
	const worker = await Worker.create({
		connection,
		namespace: 'default',
		taskQueue: 'n8n-poc-8',
		workflowsPath: new URL('./workflows/n8n-workflow.js', import.meta.url).pathname,
		activities,
		// Bundle options - we'll see what needs to be ignored
		bundlerOptions: {
			// Ignore Node.js modules that may be imported but not used in workflow
			ignoreModules: [
				// Node.js built-ins
				'fs',
				'path',
				'os',
				'crypto',
				'http',
				'https',
				'net',
				'tls',
				'dns',
				'stream',
				'zlib',
				'child_process',
				'worker_threads',
				'cluster',
				'dgram',
				'readline',
				'repl',
				'vm',
				'v8',
				'perf_hooks',
				'async_hooks',
				'trace_events',
				'inspector',
				// Might be transitively imported
				'better-sqlite3',
				'pg',
				'mysql2',
				'ioredis',
			],
		},
	});

	console.log('Worker created, starting...');

	// Run worker until stopped
	await worker.run();
}

run().catch((err) => {
	console.error('Worker failed:', err);
	process.exit(1);
});
