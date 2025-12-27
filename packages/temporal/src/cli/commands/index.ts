/**
 * CLI Commands Index
 *
 * Exports all commands for the temporal-n8n CLI.
 * Used by oclif with the "explicit" command strategy.
 */

import WorkerStart from './worker/start';
import WorkflowResult from './workflow/result';
import WorkflowRun from './workflow/run';
import WorkflowStart from './workflow/start';
import WorkflowStatus from './workflow/status';

/* eslint-disable @typescript-eslint/naming-convention -- oclif command names use colon-separated format */
export const commands = {
	// Worker commands
	'worker:start': WorkerStart,

	// Workflow commands
	'workflow:run': WorkflowRun,
	'workflow:start': WorkflowStart,
	'workflow:status': WorkflowStatus,
	'workflow:result': WorkflowResult,
};
/* eslint-enable @typescript-eslint/naming-convention */
