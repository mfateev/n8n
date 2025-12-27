/**
 * Workflow Status Command
 *
 * Gets the current status of a workflow execution.
 *
 * Usage:
 *   temporal-n8n workflow status --workflow-id <id>
 */

import { Flags } from '@oclif/core';

import { createTemporalClient } from '../../../connection/client';
import { BaseCommand } from '../base';

/**
 * Status information returned from Temporal workflow describe
 */
interface WorkflowStatusInfo {
	workflowId: string;
	runId: string;
	status: string;
	taskQueue: string;
	startTime: Date | undefined;
	closeTime: Date | undefined;
	historyLength: number | undefined;
}

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
			// Get workflow handle and describe it
			this.logVerbose(`Getting handle for workflow: ${flags['workflow-id']}`);
			const handle = client.workflow.getHandle(flags['workflow-id']);
			const description = await handle.describe();

			const status: WorkflowStatusInfo = {
				workflowId: description.workflowId,
				runId: description.runId,
				status: description.status.name,
				taskQueue: description.taskQueue,
				startTime: description.startTime,
				closeTime: description.closeTime,
				historyLength: description.historyLength,
			};

			if (flags.json) {
				console.log(JSON.stringify(status, null, 2));
			} else {
				this.logMessage(`Workflow ID: ${status.workflowId}`);
				this.logMessage(`Run ID: ${status.runId}`);
				this.logMessage(`Status: ${status.status}`);
				this.logMessage(`Task Queue: ${status.taskQueue}`);
				if (status.startTime) {
					this.logMessage(`Started: ${status.startTime.toISOString()}`);
				}
				if (status.closeTime) {
					this.logMessage(`Completed: ${status.closeTime.toISOString()}`);
				}
				if (status.historyLength !== undefined) {
					this.logMessage(`History Length: ${status.historyLength}`);
				}
			}
		} catch (error) {
			if (flags.json) {
				console.log(JSON.stringify({ error: (error as Error).message }, null, 2));
				process.exit(1);
			}
			this.logError(`Failed to get workflow status: ${(error as Error).message}`);
		} finally {
			await client.connection.close();
		}
	}
}
