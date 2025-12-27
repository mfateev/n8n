import type { INode, INodeExecutionData, IRunExecutionData } from 'n8n-workflow';
export declare function createEmptyExecutionData(): IRunExecutionData;
export declare function createExecutionDataWithStartNode(
	startNode: INode,
	inputData?: INodeExecutionData[],
): IRunExecutionData;
export declare function isFirstExecution(runExecutionData: IRunExecutionData): boolean;
export declare function isExecutionComplete(runExecutionData: IRunExecutionData): boolean;
export declare function isExecutionWaiting(runExecutionData: IRunExecutionData): boolean;
