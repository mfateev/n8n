import WorkerStart from './worker/start';
import WorkflowResult from './workflow/result';
import WorkflowRun from './workflow/run';
import WorkflowStart from './workflow/start';
import WorkflowStatus from './workflow/status';
export declare const commands: {
	'worker:start': typeof WorkerStart;
	'workflow:run': typeof WorkflowRun;
	'workflow:start': typeof WorkflowStart;
	'workflow:status': typeof WorkflowStatus;
	'workflow:result': typeof WorkflowResult;
};
