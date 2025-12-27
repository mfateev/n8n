/**
 * Workflow Start Command
 *
 * Starts a workflow asynchronously and returns immediately with the workflow ID.
 * Does not wait for the workflow to complete.
 *
 * Usage:
 *   temporal-n8n workflow start --workflow ./workflow.json
 *   temporal-n8n workflow start -w ./workflow.json --input ./input.json
 */

import { Flags } from '@oclif/core';
import * as fs from 'fs/promises';
import type { INodeExecutionData } from 'n8n-workflow';
import * as path from 'path';

import { createTemporalClient } from '../../../connection/client';
import { loadWorkflowFromFile } from '../../../utils/workflow-loader';
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

		try {
			// Start workflow (don't wait for result)
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
				console.log(JSON.stringify({ error: (error as Error).message }, null, 2));
				process.exit(1);
			}
			this.logError(`Failed to start workflow: ${(error as Error).message}`);
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
