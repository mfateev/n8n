'use strict';
var __createBinding =
	(this && this.__createBinding) ||
	(Object.create
		? function (o, m, k, k2) {
				if (k2 === undefined) k2 = k;
				var desc = Object.getOwnPropertyDescriptor(m, k);
				if (!desc || ('get' in desc ? !m.__esModule : desc.writable || desc.configurable)) {
					desc = {
						enumerable: true,
						get: function () {
							return m[k];
						},
					};
				}
				Object.defineProperty(o, k2, desc);
			}
		: function (o, m, k, k2) {
				if (k2 === undefined) k2 = k;
				o[k2] = m[k];
			});
var __setModuleDefault =
	(this && this.__setModuleDefault) ||
	(Object.create
		? function (o, v) {
				Object.defineProperty(o, 'default', { enumerable: true, value: v });
			}
		: function (o, v) {
				o['default'] = v;
			});
var __importStar =
	(this && this.__importStar) ||
	(function () {
		var ownKeys = function (o) {
			ownKeys =
				Object.getOwnPropertyNames ||
				function (o) {
					var ar = [];
					for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
					return ar;
				};
			return ownKeys(o);
		};
		return function (mod) {
			if (mod && mod.__esModule) return mod;
			var result = {};
			if (mod != null)
				for (var k = ownKeys(mod), i = 0; i < k.length; i++)
					if (k[i] !== 'default') __createBinding(result, mod, k[i]);
			__setModuleDefault(result, mod);
			return result;
		};
	})();
Object.defineProperty(exports, '__esModule', { value: true });
exports.runWorker = runWorker;
exports.createWorkerInstance = createWorkerInstance;
const worker_1 = require('@temporalio/worker');
const context_1 = require('./context');
const activities = __importStar(require('../activities'));
const temporal_binary_data_helper_1 = require('../binary-data/temporal-binary-data-helper');
const worker_connection_1 = require('../connection/worker-connection');
const credential_types_1 = require('../credentials/credential-types');
const credentials_helper_1 = require('../credentials/credentials-helper');
const json_file_store_1 = require('../credentials/json-file-store');
const node_types_1 = require('../nodes/node-types');
const logger_1 = require('../utils/logger');
async function runWorker(config) {
	const logger = config.logging
		? (0, logger_1.initializeLogger)({
				level: config.logging.level ?? 'info',
				json: config.logging.format === 'json',
				prefix: 'Worker',
			})
		: (0, logger_1.getLogger)().child('Worker');
	logger.info('Starting initialization');
	logger.info('Loading credentials', { path: config.credentials.path });
	const credentialStore = new json_file_store_1.JsonFileCredentialStore(config.credentials.path);
	await credentialStore.load();
	logger.debug('Credentials loaded');
	logger.info('Loading node types');
	const nodeTypes = new node_types_1.TemporalNodeTypes();
	await nodeTypes.loadAll();
	logger.debug('Node types loaded');
	logger.info('Loading credential types');
	const credentialTypes = new credential_types_1.TemporalCredentialTypes(nodeTypes);
	credentialTypes.loadAll();
	logger.debug('Credential types loaded');
	const credentialsHelper = new credentials_helper_1.TemporalCredentialsHelper(
		credentialStore,
		credentialTypes,
	);
	let binaryDataHelper;
	if (config.binaryData) {
		logger.info('Initializing binary data helper', { mode: config.binaryData.mode });
		const result = await (0, temporal_binary_data_helper_1.initializeBinaryDataHelper)(
			config.binaryData,
		);
		binaryDataHelper = result.helper;
		logger.debug('Binary data helper initialized');
	}
	const identity = config.temporal.identity ?? `n8n-worker-${process.pid}`;
	(0, context_1.initializeWorkerContext)({
		nodeTypes,
		credentialsHelper,
		credentialTypes,
		binaryDataConfig: config.binaryData,
		binaryDataHelper,
		identity,
	});
	logger.debug('Worker context initialized', { identity });
	logger.info('Connecting to Temporal', {
		address: config.temporal.address,
		namespace: config.temporal.namespace ?? 'default',
	});
	const connection = await (0, worker_connection_1.createWorkerConnection)(config.temporal);
	logger.debug('Temporal connection established');
	const workerOptions = {
		connection,
		namespace: config.temporal.namespace ?? 'default',
		taskQueue: config.temporal.taskQueue,
		workflowsPath: require.resolve('../workflows'),
		activities,
		identity,
		dataConverter: {
			payloadConverterPath: require.resolve('../data-converter'),
		},
	};
	if (config.temporal.maxConcurrentActivityTaskExecutions) {
		workerOptions.maxConcurrentActivityTaskExecutions =
			config.temporal.maxConcurrentActivityTaskExecutions;
	}
	if (config.temporal.maxConcurrentWorkflowTaskExecutions) {
		workerOptions.maxConcurrentWorkflowTaskExecutions =
			config.temporal.maxConcurrentWorkflowTaskExecutions;
	}
	if (config.temporal.maxCachedWorkflows) {
		workerOptions.maxCachedWorkflows = config.temporal.maxCachedWorkflows;
	}
	const worker = await worker_1.Worker.create(workerOptions);
	logger.info('Worker started', {
		taskQueue: config.temporal.taskQueue,
		identity,
	});
	const runPromise = worker.run();
	return {
		shutdown: async () => {
			logger.info('Shutting down');
			worker.shutdown();
			await runPromise;
			await connection.close();
			logger.info('Shutdown complete');
		},
	};
}
async function createWorkerInstance(config) {
	const credentialStore = new json_file_store_1.JsonFileCredentialStore(config.credentials.path);
	await credentialStore.load();
	const nodeTypes = new node_types_1.TemporalNodeTypes();
	await nodeTypes.loadAll();
	const credentialTypes = new credential_types_1.TemporalCredentialTypes(nodeTypes);
	credentialTypes.loadAll();
	const credentialsHelper = new credentials_helper_1.TemporalCredentialsHelper(
		credentialStore,
		credentialTypes,
	);
	let binaryDataHelper;
	if (config.binaryData) {
		const result = await (0, temporal_binary_data_helper_1.initializeBinaryDataHelper)(
			config.binaryData,
		);
		binaryDataHelper = result.helper;
	}
	const identity = config.temporal.identity ?? `n8n-worker-${process.pid}`;
	(0, context_1.initializeWorkerContext)({
		nodeTypes,
		credentialsHelper,
		credentialTypes,
		binaryDataConfig: config.binaryData,
		binaryDataHelper,
		identity,
	});
	const connection = await (0, worker_connection_1.createWorkerConnection)(config.temporal);
	const worker = await worker_1.Worker.create({
		connection,
		namespace: config.temporal.namespace ?? 'default',
		taskQueue: config.temporal.taskQueue,
		workflowsPath: require.resolve('../workflows'),
		activities,
		identity,
		dataConverter: {
			payloadConverterPath: require.resolve('../data-converter'),
		},
	});
	return { worker, connection };
}
//# sourceMappingURL=worker.js.map
