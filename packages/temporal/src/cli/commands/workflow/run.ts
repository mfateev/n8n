/**
 * Workflow Run Command
 *
 * Executes a workflow and waits for completion (blocking).
 *
 * Usage:
 *   temporal-n8n workflow run --workflow ./workflow.json
 *   temporal-n8n workflow run -w ./workflow.json --input ./input.json
 */

import { Flags } from '@oclif/core';

import { BaseCommand } from '../base';

// eslint-disable-next-line import-x/no-default-export -- oclif requires default exports for commands
export default class WorkflowRun extends BaseCommand {
	static override description = 'Execute a workflow and wait for completion';

	static override examples = [
		'<%= config.bin %> workflow run --workflow ./my-workflow.json',
		'<%= config.bin %> workflow run -w ./workflow.json --input ./data.json',
		'<%= config.bin %> workflow run -w ./workflow.json --timeout 5m',
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
		timeout: Flags.string({
			char: 't',
			description: 'Execution timeout (e.g., "5m", "1h")',
			default: '10m',
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
			description: 'Output result as JSON only',
			default: false,
		}),
	};

	async run(): Promise<void> {
		const { flags } = await this.parse(WorkflowRun);
		this.flags = flags;

		this.logVerbose(`Loading config from ${flags.config}`);

		// Implementation will be added in Commit 6.6
		this.logMessage('Workflow run command - implementation pending (Commit 6.6)');
		this.logMessage(`Workflow path: ${flags.workflow}`);
		if (flags.input) {
			this.logMessage(`Input data path: ${flags.input}`);
		}
	}
}
