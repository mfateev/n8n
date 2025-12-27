import type { INodeTypes, ICredentialsHelper } from 'n8n-workflow';
import type { TemporalBinaryDataHelper } from '../binary-data/temporal-binary-data-helper';
import type { BinaryDataConfig } from '../config/types';
import type { TemporalCredentialTypes } from '../credentials/credential-types';
export interface WorkerContext {
	nodeTypes: INodeTypes;
	credentialsHelper: ICredentialsHelper;
	credentialTypes: TemporalCredentialTypes;
	binaryDataConfig?: BinaryDataConfig;
	binaryDataHelper?: TemporalBinaryDataHelper;
	identity: string;
}
export declare function getWorkerContext(): WorkerContext;
export declare function initializeWorkerContext(context: WorkerContext): void;
export declare function isWorkerContextInitialized(): boolean;
export declare function clearWorkerContext(): void;
