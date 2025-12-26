/**
 * Temporal Client Connection Factory
 *
 * Creates client connections for starting and managing workflows.
 */

import { Client, Connection } from '@temporalio/client';

import type { TemporalConnectionConfig } from '../config/types';

/**
 * Options for creating a Temporal client
 */
export type CreateClientOptions = TemporalConnectionConfig;

/**
 * Creates a Temporal client connection for workflow management
 *
 * @param options - Connection configuration
 * @returns Configured Temporal Client
 *
 * @example
 * ```typescript
 * const client = await createTemporalClient({
 *   address: 'localhost:7233',
 *   namespace: 'default',
 * });
 *
 * // Start a workflow
 * const handle = await client.workflow.start('executeN8nWorkflow', {
 *   taskQueue: 'n8n-workflows',
 *   args: [{ workflowId: '123', nodes: [...] }],
 * });
 * ```
 */
export async function createTemporalClient(options: CreateClientOptions): Promise<Client> {
	const { address, namespace = 'default', tls, identity } = options;

	// Build TLS configuration if provided
	const tlsConfig = tls
		? {
				clientCertPair:
					tls.clientCert && tls.clientKey
						? {
								crt: Buffer.from(tls.clientCert),
								key: Buffer.from(tls.clientKey),
							}
						: undefined,
				serverRootCACertificate: tls.serverRootCACert
					? Buffer.from(tls.serverRootCACert)
					: undefined,
				serverNameOverride: tls.serverNameOverride,
			}
		: undefined;

	// Create connection
	const connection = await Connection.connect({
		address,
		tls: tlsConfig,
	});

	// Create and return client
	return new Client({
		connection,
		namespace,
		identity: identity ?? `temporal-n8n-client-${process.pid}`,
	});
}

/**
 * Creates a Temporal connection (without client wrapper)
 * Useful for advanced use cases where you need the raw connection
 */
export async function createTemporalConnection(options: CreateClientOptions): Promise<Connection> {
	const { address, tls } = options;

	const tlsConfig = tls
		? {
				clientCertPair:
					tls.clientCert && tls.clientKey
						? {
								crt: Buffer.from(tls.clientCert),
								key: Buffer.from(tls.clientKey),
							}
						: undefined,
				serverRootCACertificate: tls.serverRootCACert
					? Buffer.from(tls.serverRootCACert)
					: undefined,
				serverNameOverride: tls.serverNameOverride,
			}
		: undefined;

	return await Connection.connect({
		address,
		tls: tlsConfig,
	});
}
