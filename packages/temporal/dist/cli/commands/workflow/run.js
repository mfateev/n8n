'use strict';
var __createBinding =
	(this && this.__createBinding) ||
	(Object.create
		? function (o, m, k, k2) {
				if (k2 === undefined) k2 = k;
				var desc = Object.getOwnPropertyDescriptor(m, k);
				if (!desc || ('get' in desc ? !m.__esModule : desc.writable || desc.configurable)) {
					desc = {
						enumerable: true,
						get: function () {
							return m[k];
						},
					};
				}
				Object.defineProperty(o, k2, desc);
			}
		: function (o, m, k, k2) {
				if (k2 === undefined) k2 = k;
				o[k2] = m[k];
			});
var __setModuleDefault =
	(this && this.__setModuleDefault) ||
	(Object.create
		? function (o, v) {
				Object.defineProperty(o, 'default', { enumerable: true, value: v });
			}
		: function (o, v) {
				o['default'] = v;
			});
var __importStar =
	(this && this.__importStar) ||
	(function () {
		var ownKeys = function (o) {
			ownKeys =
				Object.getOwnPropertyNames ||
				function (o) {
					var ar = [];
					for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
					return ar;
				};
			return ownKeys(o);
		};
		return function (mod) {
			if (mod && mod.__esModule) return mod;
			var result = {};
			if (mod != null)
				for (var k = ownKeys(mod), i = 0; i < k.length; i++)
					if (k[i] !== 'default') __createBinding(result, mod, k[i]);
			__setModuleDefault(result, mod);
			return result;
		};
	})();
Object.defineProperty(exports, '__esModule', { value: true });
const core_1 = require('@oclif/core');
const fs = __importStar(require('fs/promises'));
const path = __importStar(require('path'));
const client_1 = require('../../../connection/client');
const workflow_loader_1 = require('../../../utils/workflow-loader');
const base_1 = require('../base');
function parseTimeoutToMs(timeout) {
	const match = timeout.match(/^(\d+)(ms|s|m|h)$/);
	if (!match) {
		throw new Error(
			`Invalid timeout format: ${timeout}. Use format like "5m", "1h", "30s", "500ms"`,
		);
	}
	const value = parseInt(match[1], 10);
	const unit = match[2];
	switch (unit) {
		case 'ms':
			return value;
		case 's':
			return value * 1000;
		case 'm':
			return value * 60 * 1000;
		case 'h':
			return value * 60 * 60 * 1000;
		default:
			throw new Error(`Unknown time unit: ${unit}`);
	}
}
class WorkflowRun extends base_1.BaseCommand {
	async run() {
		const { flags } = await this.parse(WorkflowRun);
		this.flags = flags;
		this.logVerbose(`Loading config from ${flags.config}`);
		const config = await this.loadConfig(flags.config);
		this.logVerbose(`Loading workflow from ${flags.workflow}`);
		const workflowDef = await (0, workflow_loader_1.loadWorkflowFromFile)(flags.workflow);
		let inputData;
		if (flags.input) {
			this.logVerbose(`Loading input data from ${flags.input}`);
			inputData = await this.loadInputFile(flags.input);
		}
		this.logVerbose(`Connecting to Temporal at ${config.temporal.address}`);
		const client = await (0, client_1.createTemporalClient)({
			address: config.temporal.address,
			namespace: config.temporal.namespace,
			tls: config.temporal.tls,
		});
		const taskQueue = flags['task-queue'] ?? config.temporal.taskQueue;
		const workflowId = flags['workflow-id'] ?? `${workflowDef.id}-${Date.now()}`;
		const workflowExecutionTimeout = parseTimeoutToMs(flags.timeout);
		if (!flags.json) {
			this.logMessage(`Executing workflow: ${workflowDef.name}`);
			this.logMessage(`Task queue: ${taskQueue}`);
			this.logMessage(`Workflow ID: ${workflowId}`);
		}
		try {
			this.logVerbose('Starting workflow execution...');
			const handle = await client.workflow.start('executeN8nWorkflow', {
				taskQueue,
				workflowId,
				args: [
					{
						workflowId: workflowDef.id,
						workflowName: workflowDef.name,
						nodes: workflowDef.nodes,
						connections: workflowDef.connections,
						settings: workflowDef.settings,
						staticData: workflowDef.staticData,
						inputData,
					},
				],
				workflowExecutionTimeout,
			});
			this.logVerbose(`Workflow started with run ID: ${handle.firstExecutionRunId}`);
			this.logVerbose('Waiting for workflow to complete...');
			const result = await handle.result();
			if (flags.json) {
				console.log(JSON.stringify(result, null, 2));
			} else {
				this.logMessage('');
				this.logMessage('=== Execution Complete ===');
				this.logMessage(`Status: ${result.success ? 'SUCCESS' : 'FAILED'}`);
				if (result.error) {
					this.logMessage(`Error: ${result.error.message}`);
					if (result.error.description) {
						this.logMessage(`Description: ${result.error.description}`);
					}
				}
				if (result.data) {
					this.logMessage('');
					this.logMessage('Output:');
					console.log(JSON.stringify(result.data, null, 2));
				}
			}
		} catch (error) {
			if (flags.json) {
				console.log(JSON.stringify({ error: error.message }, null, 2));
				process.exit(1);
			}
			this.logError(`Workflow execution failed: ${error.message}`);
		} finally {
			await client.connection.close();
		}
	}
	async loadInputFile(inputPath) {
		const absolutePath = path.resolve(inputPath);
		let content;
		try {
			content = await fs.readFile(absolutePath, 'utf-8');
		} catch (error) {
			if (error.code === 'ENOENT') {
				throw new Error(`Input file not found: ${absolutePath}`);
			}
			throw new Error(`Failed to load input file: ${error.message}`);
		}
		let parsed;
		try {
			parsed = JSON.parse(content);
		} catch {
			throw new Error(`Invalid JSON in input file: ${absolutePath}`);
		}
		if (Array.isArray(parsed)) {
			if (
				parsed.length > 0 &&
				typeof parsed[0] === 'object' &&
				parsed[0] !== null &&
				'json' in parsed[0]
			) {
				return parsed;
			}
			return parsed.map((item) => ({ json: item }));
		}
		return [{ json: parsed }];
	}
}
WorkflowRun.description = 'Execute a workflow and wait for completion';
WorkflowRun.examples = [
	'<%= config.bin %> workflow run --workflow ./my-workflow.json',
	'<%= config.bin %> workflow run -w ./workflow.json --input ./data.json',
	'<%= config.bin %> workflow run -w ./workflow.json --timeout 5m',
];
WorkflowRun.flags = {
	...base_1.BaseCommand.baseFlags,
	workflow: core_1.Flags.string({
		char: 'w',
		description: 'Path to workflow JSON file',
		required: true,
	}),
	input: core_1.Flags.string({
		char: 'i',
		description: 'Path to input data JSON file',
	}),
	timeout: core_1.Flags.string({
		char: 't',
		description: 'Execution timeout (e.g., "5m", "1h")',
		default: '10m',
	}),
	'task-queue': core_1.Flags.string({
		char: 'q',
		description: 'Task queue name (overrides config)',
	}),
	'workflow-id': core_1.Flags.string({
		description: 'Custom workflow execution ID',
	}),
	json: core_1.Flags.boolean({
		description: 'Output result as JSON only',
		default: false,
	}),
};
exports.default = WorkflowRun;
//# sourceMappingURL=run.js.map
