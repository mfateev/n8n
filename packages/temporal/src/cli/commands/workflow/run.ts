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
import * as fs from 'fs/promises';
import type { INodeExecutionData } from 'n8n-workflow';
import * as path from 'path';

import { createTemporalClient } from '../../../connection/client';
import type { ExecuteN8nWorkflowOutput } from '../../../types/workflow-types';
import { loadWorkflowFromFile } from '../../../utils/workflow-loader';
import { BaseCommand } from '../base';

/**
 * Parse timeout string to milliseconds
 * Supports formats: "5m", "1h", "30s", "500ms"
 */
function parseTimeoutToMs(timeout: string): number {
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

		// Load config
		this.logVerbose(`Loading config from ${flags.config}`);
		const config = await this.loadConfig(flags.config);

		// Load workflow definition
		this.logVerbose(`Loading workflow from ${flags.workflow}`);
		const workflowDef = await loadWorkflowFromFile(flags.workflow);

		// Load input data if provided
		let inputData: INodeExecutionData[] | undefined;
		if (flags.input) {
			this.logVerbose(`Loading input data from ${flags.input}`);
			inputData = await this.loadInputFile(flags.input);
		}

		// Create Temporal client
		this.logVerbose(`Connecting to Temporal at ${config.temporal.address}`);
		const client = await createTemporalClient({
			address: config.temporal.address,
			namespace: config.temporal.namespace,
			tls: config.temporal.tls,
		});

		const taskQueue = flags['task-queue'] ?? config.temporal.taskQueue;
		const workflowId = flags['workflow-id'] ?? `${workflowDef.id}-${Date.now()}`;

		// Parse timeout to milliseconds (Temporal accepts number as milliseconds)
		const workflowExecutionTimeout = parseTimeoutToMs(flags.timeout);

		if (!flags.json) {
			this.logMessage(`Executing workflow: ${workflowDef.name}`);
			this.logMessage(`Task queue: ${taskQueue}`);
			this.logMessage(`Workflow ID: ${workflowId}`);
		}

		try {
			// Start workflow and wait for result
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

			const result = (await handle.result()) as ExecuteN8nWorkflowOutput;

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
				console.log(JSON.stringify({ error: (error as Error).message }, null, 2));
				process.exit(1);
			}
			this.logError(`Workflow execution failed: ${(error as Error).message}`);
		} finally {
			await client.connection.close();
		}
	}

	/**
	 * Load and parse input data from a JSON file.
	 * Converts input to INodeExecutionData[] format.
	 */
	private async loadInputFile(inputPath: string): Promise<INodeExecutionData[]> {
		const absolutePath = path.resolve(inputPath);

		let content: string;
		try {
			content = await fs.readFile(absolutePath, 'utf-8');
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
				throw new Error(`Input file not found: ${absolutePath}`);
			}
			throw new Error(`Failed to load input file: ${(error as Error).message}`);
		}

		let parsed: unknown;
		try {
			parsed = JSON.parse(content);
		} catch {
			throw new Error(`Invalid JSON in input file: ${absolutePath}`);
		}

		// Convert to INodeExecutionData[] format
		if (Array.isArray(parsed)) {
			// Check if already in INodeExecutionData format (has 'json' property)
			if (
				parsed.length > 0 &&
				typeof parsed[0] === 'object' &&
				parsed[0] !== null &&
				'json' in parsed[0]
			) {
				return parsed as INodeExecutionData[];
			}
			// Array of plain objects - wrap each in { json: ... }
			return (parsed as unknown[]).map((item) => ({ json: item })) as INodeExecutionData[];
		}

		// Single object - wrap in array with { json: ... }
		return [{ json: parsed }] as INodeExecutionData[];
	}
}
