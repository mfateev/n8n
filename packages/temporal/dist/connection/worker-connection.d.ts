import { NativeConnection } from '@temporalio/worker';
import type { TemporalConnectionConfig } from '../config/types';
export type CreateWorkerConnectionOptions = TemporalConnectionConfig;
export declare function createWorkerConnection(
	options: CreateWorkerConnectionOptions,
): Promise<NativeConnection>;
