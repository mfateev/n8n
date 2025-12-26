import { Client, Connection } from '@temporalio/client';
import type { TemporalConnectionConfig } from '../config/types';
export type CreateClientOptions = TemporalConnectionConfig;
export declare function createTemporalClient(options: CreateClientOptions): Promise<Client>;
export declare function createTemporalConnection(options: CreateClientOptions): Promise<Connection>;
