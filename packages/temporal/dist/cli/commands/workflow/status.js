'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
const core_1 = require('@oclif/core');
const client_1 = require('../../../connection/client');
const base_1 = require('../base');
class WorkflowStatus extends base_1.BaseCommand {
	async run() {
		const { flags } = await this.parse(WorkflowStatus);
		this.flags = flags;
		this.logVerbose(`Loading config from ${flags.config}`);
		const config = await this.loadConfig(flags.config);
		this.logVerbose(`Connecting to Temporal at ${config.temporal.address}`);
		const client = await (0, client_1.createTemporalClient)({
			address: config.temporal.address,
			namespace: config.temporal.namespace,
			tls: config.temporal.tls,
		});
		try {
			this.logVerbose(`Getting handle for workflow: ${flags['workflow-id']}`);
			const handle = client.workflow.getHandle(flags['workflow-id']);
			const description = await handle.describe();
			const status = {
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
				console.log(JSON.stringify({ error: error.message }, null, 2));
				process.exit(1);
			}
			this.logError(`Failed to get workflow status: ${error.message}`);
		} finally {
			await client.connection.close();
		}
	}
}
WorkflowStatus.description = 'Get workflow execution status';
WorkflowStatus.examples = ['<%= config.bin %> workflow status --workflow-id workflow-abc-123'];
WorkflowStatus.flags = {
	...base_1.BaseCommand.baseFlags,
	'workflow-id': core_1.Flags.string({
		description: 'Workflow execution ID',
		required: true,
	}),
	json: core_1.Flags.boolean({
		description: 'Output as JSON only',
		default: false,
	}),
};
exports.default = WorkflowStatus;
//# sourceMappingURL=status.js.map
