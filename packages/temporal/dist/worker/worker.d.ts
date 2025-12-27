import { Worker } from '@temporalio/worker';
import type { NativeConnection } from '@temporalio/worker';
import type {
	TemporalWorkerConfig,
	CredentialStoreConfig,
	BinaryDataConfig,
	LoggingConfig,
} from '../config/types';
export interface WorkerBootstrapConfig {
	temporal: TemporalWorkerConfig;
	credentials: CredentialStoreConfig;
	binaryData?: BinaryDataConfig;
	logging?: LoggingConfig;
}
export interface WorkerRunResult {
	shutdown: () => Promise<void>;
}
export declare function runWorker(config: WorkerBootstrapConfig): Promise<WorkerRunResult>;
export declare function createWorkerInstance(config: WorkerBootstrapConfig): Promise<{
	worker: Worker;
	connection: NativeConnection;
}>;
