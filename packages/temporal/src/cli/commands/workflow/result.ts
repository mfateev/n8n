/**
 * Workflow Result Command
 *
 * Gets the result of a completed workflow execution.
 *
 * Usage:
 *   temporal-n8n workflow result --workflow-id <id>
 */

import { Flags } from '@oclif/core';

import { createTemporalClient } from '../../../connection/client';
import type { ExecuteN8nWorkflowOutput } from '../../../types/workflow-types';
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

		// Load config
		this.logVerbose(`Loading config from ${flags.config}`);
		const config = await this.loadConfig(flags.config);

		// Create Temporal client
		this.logVerbose(`Connecting to Temporal at ${config.temporal.address}`);
		const client = await createTemporalClient({
			address: config.temporal.address,
			namespace: config.temporal.namespace,
			tls: config.temporal.tls,
		});

		try {
			// Get workflow handle
			this.logVerbose(`Getting handle for workflow: ${flags['workflow-id']}`);
			const handle = client.workflow.getHandle(flags['workflow-id']);

			// Check workflow status first if not waiting
			if (!flags.wait) {
				const description = await handle.describe();
				if (description.status.name === 'RUNNING') {
					if (flags.json) {
						console.log(
							JSON.stringify(
								{
									error: 'Workflow is still running. Use --wait flag to wait for completion.',
									status: description.status.name,
									workflowId: description.workflowId,
									runId: description.runId,
								},
								null,
								2,
							),
						);
						process.exit(1);
					}
					this.logError(
						'Workflow is still running. Use --wait flag to wait for completion.\n' +
							'Status: ' +
							description.status.name +
							'\n' +
							'Workflow ID: ' +
							description.workflowId,
					);
				}
			} else {
				if (!flags.json) {
					this.logMessage('Waiting for workflow to complete...');
				}
			}

			// Get the result (this will wait if workflow is still running and --wait is used)
			this.logVerbose('Fetching workflow result...');
			const result = (await handle.result()) as ExecuteN8nWorkflowOutput;

			if (flags.json) {
				console.log(JSON.stringify(result, null, 2));
			} else {
				this.logMessage('');
				this.logMessage('=== Workflow Result ===');
				this.logMessage(`Status: ${result.success ? 'SUCCESS' : 'FAILED'}`);
				this.logMessage(`Execution Status: ${result.status}`);

				if (result.error) {
					this.logMessage(`Error: ${result.error.message}`);
					if (result.error.description) {
						this.logMessage(`Description: ${result.error.description}`);
					}
				}

				if (result.data) {
					this.logMessage('');
					this.logMessage('Output Data:');
					console.log(JSON.stringify(result.data, null, 2));
				}
			}
		} catch (error) {
			if (flags.json) {
				console.log(JSON.stringify({ error: (error as Error).message }, null, 2));
				process.exit(1);
			}
			this.logError(`Failed to get workflow result: ${(error as Error).message}`);
		} finally {
			await client.connection.close();
		}
	}
}
