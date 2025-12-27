import type { IConnections, INode, IWorkflowSettings, IDataObject, IPinData } from 'n8n-workflow';
export interface WorkflowFileDefinition {
	name?: string;
	nodes: INode[];
	connections: IConnections;
	settings?: IWorkflowSettings;
	staticData?: IDataObject;
	pinData?: IPinData;
}
export interface LoadedWorkflow {
	id: string;
	name: string;
	nodes: INode[];
	connections: IConnections;
	settings?: IWorkflowSettings;
	staticData?: IDataObject;
	pinData?: IPinData;
	filePath: string;
}
export declare function loadWorkflowFromFile(filePath: string): Promise<LoadedWorkflow>;
export declare function findStartNode(nodes: INode[]): INode | undefined;
