import type {
	IConnections,
	IExecuteData,
	INode,
	INodeExecutionData,
	IRunExecutionData,
	ITaskData,
	IWaitingForExecution,
	IWaitingForExecutionSource,
	IWorkflowSettings,
} from 'n8n-workflow';
import type { SerializedError } from './serialized-error';
export interface WorkflowDefinition {
	id: string;
	name: string;
	nodes: INode[];
	connections: IConnections;
	settings?: IWorkflowSettings;
	staticData?: Record<string, unknown>;
}
export interface ExecuteWorkflowStepInput {
	workflowDefinition: WorkflowDefinition;
	runExecutionData: IRunExecutionData;
	inputData?: INodeExecutionData[];
	previouslyExecutedNodes: string[];
}
export interface ExecutionBookkeeping {
	nodeExecutionStack: IExecuteData[];
	waitingExecution: IWaitingForExecution;
	waitingExecutionSource: IWaitingForExecutionSource | null;
}
export interface ExecuteWorkflowStepOutput {
	complete: boolean;
	newRunData: Record<string, ITaskData[]>;
	executionData: ExecutionBookkeeping;
	lastNodeExecuted?: string;
	waitTill?: number;
	error?: SerializedError;
	finalOutput?: INodeExecutionData[];
}
