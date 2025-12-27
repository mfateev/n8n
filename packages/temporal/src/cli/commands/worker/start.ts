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

		// Implementation will be added in Commit 6.5
		this.logMessage('Worker start command - implementation pending (Commit 6.5)');
		this.logMessage(`Config path: ${flags.config}`);
		if (flags['task-queue']) {
			this.logMessage(`Task queue override: ${flags['task-queue']}`);
		}
		if (flags.concurrency) {
			this.logMessage(`Concurrency override: ${flags.concurrency}`);
		}
	}
}
