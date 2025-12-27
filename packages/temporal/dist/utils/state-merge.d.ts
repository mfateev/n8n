import type { IRunExecutionData } from 'n8n-workflow';
import type { ExecuteWorkflowStepOutput } from '../types/activity-types';
export declare function mergeWorkflowStepResult(
	currentState: IRunExecutionData,
	stepResult: ExecuteWorkflowStepOutput,
): IRunExecutionData;
export declare function getExecutedNodeNames(state: IRunExecutionData): string[];
