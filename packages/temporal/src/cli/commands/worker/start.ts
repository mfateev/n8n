/**
 * Worker Start Command
 *
 * Starts a Temporal worker for executing n8n workflows.
 *
 * Usage:
 *   temporal-n8n worker start --config ./config.json
 *   temporal-n8n worker start -c ./config.json -v
 */

import { Flags } from '@oclif/core';

import { runWorker } from '../../../worker';
import { BaseCommand } from '../base';

// eslint-disable-next-line import-x/no-default-export -- oclif requires default exports for commands
export default class WorkerStart extends BaseCommand {
	static override description = 'Start a Temporal worker for n8n workflows';

	static override examples = [
		'<%= config.bin %> worker start --config ./config.json',
		'<%= config.bin %> worker start -c ./temporal-n8n.config.json -v',
	];

	static override flags = {
		...BaseCommand.baseFlags,
		// eslint-disable-next-line @typescript-eslint/naming-convention -- CLI flag uses kebab-case
		'task-queue': Flags.string({
			char: 'q',
			description: 'Override task queue name from config',
		}),
		concurrency: Flags.integer({
			description: 'Maximum concurrent activity executions',
		}),
	};

	async run(): Promise<void> {
		const { flags } = await this.parse(WorkerStart);
		this.flags = flags;

		this.logVerbose(`Loading config from ${flags.config}`);
		const config = await this.loadConfig(flags.config);

		// Apply flag overrides
		if (flags['task-queue']) {
			this.logVerbose(`Overriding task queue from config to: ${flags['task-queue']}`);
			config.temporal.taskQueue = flags['task-queue'];
		}
		if (flags.concurrency) {
			this.logVerbose(`Overriding concurrency to: ${flags.concurrency}`);
			config.temporal.maxConcurrentActivityTaskExecutions = flags.concurrency;
		}

		this.logMessage(`Starting worker on task queue: ${config.temporal.taskQueue}`);
		this.logMessage(`Temporal server: ${config.temporal.address}`);
		if (config.temporal.namespace && config.temporal.namespace !== 'default') {
			this.logMessage(`Namespace: ${config.temporal.namespace}`);
		}

		try {
			const { shutdown } = await runWorker({
				temporal: config.temporal,
				credentials: config.credentials,
				binaryData: config.binaryData,
			});

			// Handle shutdown signals
			const handleShutdown = async (signal: string) => {
				this.logMessage(`\nReceived ${signal}, shutting down gracefully...`);
				try {
					await shutdown();
					this.logMessage('Worker shutdown complete');
					process.exit(0);
				} catch (error) {
					this.logMessage(`Error during shutdown: ${(error as Error).message}`);
					process.exit(1);
				}
			};

			process.on('SIGINT', () => {
				handleShutdown('SIGINT').catch(() => process.exit(1));
			});
			process.on('SIGTERM', () => {
				handleShutdown('SIGTERM').catch(() => process.exit(1));
			});

			this.logMessage('Worker started successfully. Press Ctrl+C to stop.');

			// Keep process running until shutdown signal
			// The worker.run() in runWorker() is already blocking, but we wait here
			// to handle the promise that never resolves (until shutdown)
			await new Promise<void>(() => {
				// This promise never resolves - we wait for shutdown signal
			});
		} catch (error) {
			this.error(`Failed to start worker: ${(error as Error).message}`);
		}
	}
}
