/**
 * Workflow Status Command
 *
 * Gets the current status of a workflow execution.
 *
 * Usage:
 *   temporal-n8n workflow status --workflow-id <id>
 */

import { Flags } from '@oclif/core';

import { BaseCommand } from '../base';

// eslint-disable-next-line import-x/no-default-export -- oclif requires default exports for commands
export default class WorkflowStatus extends BaseCommand {
	static override description = 'Get workflow execution status';

	static override examples = ['<%= config.bin %> workflow status --workflow-id workflow-abc-123'];

	static override flags = {
		...BaseCommand.baseFlags,
		// eslint-disable-next-line @typescript-eslint/naming-convention -- CLI flag uses kebab-case
		'workflow-id': Flags.string({
			description: 'Workflow execution ID',
			required: true,
		}),
		json: Flags.boolean({
			description: 'Output as JSON only',
			default: false,
		}),
	};

	async run(): Promise<void> {
		const { flags } = await this.parse(WorkflowStatus);
		this.flags = flags;

		this.logVerbose(`Loading config from ${flags.config}`);

		// Implementation will be added in Commit 6.8
		this.logMessage('Workflow status command - implementation pending (Commit 6.8)');
		this.logMessage(`Workflow ID: ${flags['workflow-id']}`);
	}
}
