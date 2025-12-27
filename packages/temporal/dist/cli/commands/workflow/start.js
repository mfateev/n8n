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
class WorkflowStart extends base_1.BaseCommand {
	async run() {
		const { flags } = await this.parse(WorkflowStart);
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
			});
			if (flags.json) {
				console.log(
					JSON.stringify(
						{
							workflowId: handle.workflowId,
							runId: handle.firstExecutionRunId,
						},
						null,
						2,
					),
				);
			} else {
				this.logMessage('Workflow started successfully');
				this.logMessage(`Workflow ID: ${handle.workflowId}`);
				this.logMessage(`Run ID: ${handle.firstExecutionRunId}`);
				this.logMessage('');
				this.logMessage('Check status with:');
				this.logMessage(`  temporal-n8n workflow status --workflow-id ${handle.workflowId}`);
			}
		} catch (error) {
			if (flags.json) {
				console.log(JSON.stringify({ error: error.message }, null, 2));
				process.exit(1);
			}
			this.logError(`Failed to start workflow: ${error.message}`);
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
WorkflowStart.description = 'Start a workflow asynchronously';
WorkflowStart.examples = [
	'<%= config.bin %> workflow start --workflow ./my-workflow.json',
	'<%= config.bin %> workflow start -w ./workflow.json --input ./data.json',
];
WorkflowStart.flags = {
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
	'task-queue': core_1.Flags.string({
		char: 'q',
		description: 'Task queue name (overrides config)',
	}),
	'workflow-id': core_1.Flags.string({
		description: 'Custom workflow execution ID',
	}),
	json: core_1.Flags.boolean({
		description: 'Output as JSON only',
		default: false,
	}),
};
exports.default = WorkflowStart;
//# sourceMappingURL=start.js.map
