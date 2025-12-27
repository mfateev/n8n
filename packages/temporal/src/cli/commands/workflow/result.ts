/**
 * Workflow Result Command
 *
 * Gets the result of a completed workflow execution.
 *
 * Usage:
 *   temporal-n8n workflow result --workflow-id <id>
 */

import { Flags } from '@oclif/core';

import { BaseCommand } from '../base';

// eslint-disable-next-line import-x/no-default-export -- oclif requires default exports for commands
export default class WorkflowResult extends BaseCommand {
	static override description = 'Get workflow execution result';

	static override examples = [
		'<%= config.bin %> workflow result --workflow-id workflow-abc-123',
		'<%= config.bin %> workflow result --workflow-id abc-123 --wait',
	];

	static override flags = {
		...BaseCommand.baseFlags,
		// eslint-disable-next-line @typescript-eslint/naming-convention -- CLI flag uses kebab-case
		'workflow-id': Flags.string({
			description: 'Workflow execution ID',
			required: true,
		}),
		wait: Flags.boolean({
			description: 'Wait for workflow to complete if still running',
			default: false,
		}),
		json: Flags.boolean({
			description: 'Output as JSON only',
			default: false,
		}),
	};

	async run(): Promise<void> {
		const { flags } = await this.parse(WorkflowResult);
		this.flags = flags;

		this.logVerbose(`Loading config from ${flags.config}`);

		// Implementation will be added in Commit 6.8
		this.logMessage('Workflow result command - implementation pending (Commit 6.8)');
		this.logMessage(`Workflow ID: ${flags['workflow-id']}`);
		if (flags.wait) {
			this.logMessage('Will wait for workflow to complete');
		}
	}
}
