import type {
	IConnections,
	INode,
	INodeExecutionData,
	IRunExecutionData,
	IWorkflowSettings,
} from 'n8n-workflow';
import type { SerializedError } from './serialized-error';
export interface ExecuteN8nWorkflowInput {
	workflowId: string;
	workflowName: string;
	nodes: INode[];
	connections: IConnections;
	settings?: IWorkflowSettings;
	inputData?: INodeExecutionData[];
	staticData?: Record<string, unknown>;
}
export interface ExecuteN8nWorkflowOutput {
	success: boolean;
	data?: INodeExecutionData[];
	error?: SerializedError;
	runExecutionData: IRunExecutionData;
	status: 'success' | 'error' | 'waiting' | 'canceled';
}
