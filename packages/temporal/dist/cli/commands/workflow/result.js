'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
const core_1 = require('@oclif/core');
const client_1 = require('../../../connection/client');
const base_1 = require('../base');
class WorkflowResult extends base_1.BaseCommand {
	async run() {
		const { flags } = await this.parse(WorkflowResult);
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
			this.logVerbose('Fetching workflow result...');
			const result = await handle.result();
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
				console.log(JSON.stringify({ error: error.message }, null, 2));
				process.exit(1);
			}
			this.logError(`Failed to get workflow result: ${error.message}`);
		} finally {
			await client.connection.close();
		}
	}
}
WorkflowResult.description = 'Get workflow execution result';
WorkflowResult.examples = [
	'<%= config.bin %> workflow result --workflow-id workflow-abc-123',
	'<%= config.bin %> workflow result --workflow-id abc-123 --wait',
];
WorkflowResult.flags = {
	...base_1.BaseCommand.baseFlags,
	'workflow-id': core_1.Flags.string({
		description: 'Workflow execution ID',
		required: true,
	}),
	wait: core_1.Flags.boolean({
		description: 'Wait for workflow to complete if still running',
		default: false,
	}),
	json: core_1.Flags.boolean({
		description: 'Output as JSON only',
		default: false,
	}),
};
exports.default = WorkflowResult;
//# sourceMappingURL=result.js.map
