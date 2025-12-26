'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.createWorkerConnection = createWorkerConnection;
const worker_1 = require('@temporalio/worker');
async function createWorkerConnection(options) {
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
	return await worker_1.NativeConnection.connect({
		address,
		tls: tlsConfig,
	});
}
//# sourceMappingURL=worker-connection.js.map
