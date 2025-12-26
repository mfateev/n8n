'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.createTemporalClient = createTemporalClient;
exports.createTemporalConnection = createTemporalConnection;
const client_1 = require('@temporalio/client');
async function createTemporalClient(options) {
	const { address, namespace = 'default', tls, identity } = options;
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
	const connection = await client_1.Connection.connect({
		address,
		tls: tlsConfig,
	});
	return new client_1.Client({
		connection,
		namespace,
		identity: identity ?? `temporal-n8n-client-${process.pid}`,
	});
}
async function createTemporalConnection(options) {
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
	return await client_1.Connection.connect({
		address,
		tls: tlsConfig,
	});
}
//# sourceMappingURL=client.js.map
