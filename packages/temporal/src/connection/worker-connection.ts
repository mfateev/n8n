/**
 * Temporal Worker Connection Factory
 *
 * Creates native connections for Temporal workers.
 * Workers use a different connection type than clients.
 */

import { NativeConnection } from '@temporalio/worker';

import type { TemporalConnectionConfig } from '../config/types';

/**
 * Options for creating a worker connection
 */
export type CreateWorkerConnectionOptions = TemporalConnectionConfig;

/**
 * Creates a native connection for Temporal workers
 *
 * @param options - Connection configuration
 * @returns NativeConnection for worker use
 *
 * @example
 * ```typescript
 * const connection = await createWorkerConnection({
 *   address: 'localhost:7233',
 * });
 *
 * const worker = await Worker.create({
 *   connection,
 *   taskQueue: 'n8n-workflows',
 *   // ...
 * });
 * ```
 */
export async function createWorkerConnection(
	options: CreateWorkerConnectionOptions,
): Promise<NativeConnection> {
	const { address, tls } = options;

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

	return await NativeConnection.connect({
		address,
		tls: tlsConfig,
	});
}
