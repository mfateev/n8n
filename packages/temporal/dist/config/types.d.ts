export interface TemporalTlsConfig {
	clientCert?: string;
	clientKey?: string;
	serverRootCACert?: string;
	serverNameOverride?: string;
}
export interface TemporalConnectionConfig {
	address: string;
	namespace?: string;
	tls?: TemporalTlsConfig;
	identity?: string;
}
export interface TemporalWorkerConfig extends TemporalConnectionConfig {
	taskQueue: string;
	maxConcurrentActivityTaskExecutions?: number;
	maxConcurrentWorkflowTaskExecutions?: number;
	maxCachedWorkflows?: number;
	shutdownGraceTime?: string;
}
export interface CredentialStoreConfig {
	path: string;
}
export interface BinaryDataConfig {
	mode: 'filesystem' | 's3';
	s3?: {
		bucket: string;
		region: string;
		host?: string;
		protocol?: 'http' | 'https';
		accessKeyId?: string;
		secretAccessKey?: string;
		authAutoDetect?: boolean;
	};
	filesystem?: {
		basePath: string;
	};
}
export interface LoggingConfig {
	level?: 'debug' | 'info' | 'warn' | 'error';
	format?: 'text' | 'json';
}
export interface ExecutionConfig {
	activityTimeout?: number;
	retryPolicy?: {
		maximumAttempts?: number;
		initialInterval?: string;
		maximumInterval?: string;
		backoffCoefficient?: number;
	};
}
export interface TemporalN8nConfig {
	temporal: TemporalWorkerConfig;
	credentials: CredentialStoreConfig;
	binaryData?: BinaryDataConfig;
	execution?: ExecutionConfig;
	logging?: LoggingConfig;
}
