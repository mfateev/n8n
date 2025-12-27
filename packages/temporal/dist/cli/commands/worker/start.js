'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
const core_1 = require('@oclif/core');
const worker_1 = require('../../../worker');
const base_1 = require('../base');
class WorkerStart extends base_1.BaseCommand {
	async run() {
		const { flags } = await this.parse(WorkerStart);
		this.flags = flags;
		this.logVerbose(`Loading config from ${flags.config}`);
		const config = await this.loadConfig(flags.config);
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
			const loggingConfig = config.logging ?? (flags.verbose ? { level: 'debug' } : undefined);
			const { shutdown } = await (0, worker_1.runWorker)({
				temporal: config.temporal,
				credentials: config.credentials,
				binaryData: config.binaryData,
				logging: loggingConfig,
			});
			const handleShutdown = async (signal) => {
				this.logMessage(`\nReceived ${signal}, shutting down gracefully...`);
				try {
					await shutdown();
					this.logMessage('Worker shutdown complete');
					process.exit(0);
				} catch (error) {
					this.logMessage(`Error during shutdown: ${error.message}`);
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
			await new Promise(() => {});
		} catch (error) {
			this.error(`Failed to start worker: ${error.message}`);
		}
	}
}
WorkerStart.description = 'Start a Temporal worker for n8n workflows';
WorkerStart.examples = [
	'<%= config.bin %> worker start --config ./config.json',
	'<%= config.bin %> worker start -c ./temporal-n8n.config.json -v',
];
WorkerStart.flags = {
	...base_1.BaseCommand.baseFlags,
	'task-queue': core_1.Flags.string({
		char: 'q',
		description: 'Override task queue name from config',
	}),
	concurrency: core_1.Flags.integer({
		description: 'Maximum concurrent activity executions',
	}),
};
exports.default = WorkerStart;
//# sourceMappingURL=start.js.map
