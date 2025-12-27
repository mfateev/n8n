/**
 * Workflow Start Command
 *
 * Starts a workflow asynchronously and returns immediately with the workflow ID.
 *
 * Usage:
 *   temporal-n8n workflow start --workflow ./workflow.json
 *   temporal-n8n workflow start -w ./workflow.json --input ./input.json
 */

import { Flags } from '@oclif/core';

import { BaseCommand } from '../base';

// eslint-disable-next-line import-x/no-default-export -- oclif requires default exports for commands
export default class WorkflowStart extends BaseCommand {
	static override description = 'Start a workflow asynchronously';

	static override examples = [
		'<%= config.bin %> workflow start --workflow ./my-workflow.json',
		'<%= config.bin %> workflow start -w ./workflow.json --input ./data.json',
	];

	static override flags = {
		...BaseCommand.baseFlags,
		workflow: Flags.string({
			char: 'w',
			description: 'Path to workflow JSON file',
			required: true,
		}),
		input: Flags.string({
			char: 'i',
			description: 'Path to input data JSON file',
		}),
		// eslint-disable-next-line @typescript-eslint/naming-convention -- CLI flag uses kebab-case
		'task-queue': Flags.string({
			char: 'q',
			description: 'Task queue name (overrides config)',
		}),
		// eslint-disable-next-line @typescript-eslint/naming-convention -- CLI flag uses kebab-case
		'workflow-id': Flags.string({
			description: 'Custom workflow execution ID',
		}),
		json: Flags.boolean({
			description: 'Output as JSON only',
			default: false,
		}),
	};

	async run(): Promise<void> {
		const { flags } = await this.parse(WorkflowStart);
		this.flags = flags;

		this.logVerbose(`Loading config from ${flags.config}`);

		// Implementation will be added in Commit 6.7
		this.logMessage('Workflow start command - implementation pending (Commit 6.7)');
		this.logMessage(`Workflow path: ${flags.workflow}`);
		if (flags.input) {
			this.logMessage(`Input data path: ${flags.input}`);
		}
	}
}
