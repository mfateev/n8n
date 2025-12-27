/**
 * Configuration types for Temporal n8n integration
 */

/**
 * TLS configuration for Temporal connections
 */
export interface TemporalTlsConfig {
	/** Client certificate (PEM format) */
	clientCert?: string;
	/** Client private key (PEM format) */
	clientKey?: string;
	/** CA certificate for server verification (PEM format) */
	serverRootCACert?: string;
	/** Server name override for TLS verification */
	serverNameOverride?: string;
}

/**
 * Temporal server connection configuration
 */
export interface TemporalConnectionConfig {
	/** Temporal server address (e.g., 'localhost:7233') */
	address: string;
	/** Namespace to use (defaults to 'default') */
	namespace?: string;
	/** TLS configuration (optional) */
	tls?: TemporalTlsConfig;
	/** Identity for this client/worker */
	identity?: string;
}

/**
 * Worker-specific configuration
 */
export interface TemporalWorkerConfig extends TemporalConnectionConfig {
	/** Task queue name */
	taskQueue: string;
	/** Maximum concurrent activity task executions */
	maxConcurrentActivityTaskExecutions?: number;
	/** Maximum concurrent workflow task executions */
	maxConcurrentWorkflowTaskExecutions?: number;
	/** Maximum cached workflows */
	maxCachedWorkflows?: number;
	/** Shutdown grace time (e.g., '30s') */
	shutdownGraceTime?: string;
}

/**
 * Credential store configuration
 */
export interface CredentialStoreConfig {
	/** Path to credentials JSON file */
	path: string;
}

/**
 * Binary data storage configuration
 */
export interface BinaryDataConfig {
	/** Storage mode */
	mode: 'filesystem' | 's3';

	/** S3 configuration (when mode is 's3') */
	s3?: {
		/** S3 bucket name */
		bucket: string;
		/** AWS region */
		region: string;
		/** S3 endpoint (for S3-compatible services like MinIO) */
		host?: string;
		/** Protocol (http or https) */
		protocol?: 'http' | 'https';
		/** AWS access key ID (optional if using IAM roles) */
		accessKeyId?: string;
		/** AWS secret access key (optional if using IAM roles) */
		secretAccessKey?: string;
		/** Use automatic credential detection (IAM roles, etc.) */
		authAutoDetect?: boolean;
	};

	/** Filesystem configuration (when mode is 'filesystem') */
	filesystem?: {
		/** Base path for binary data storage */
		basePath: string;
	};
}

/**
 * Logging configuration
 */
export interface LoggingConfig {
	/** Log level: debug, info, warn, error */
	level?: 'debug' | 'info' | 'warn' | 'error';
	/** Output format: text or json */
	format?: 'text' | 'json';
}

/**
 * Execution configuration
 */
export interface ExecutionConfig {
	/** Default activity timeout in milliseconds */
	activityTimeout?: number;
	/** Retry policy */
	retryPolicy?: {
		maximumAttempts?: number;
		initialInterval?: string;
		maximumInterval?: string;
		backoffCoefficient?: number;
	};
}

/**
 * Complete configuration for temporal-n8n
 */
export interface TemporalN8nConfig {
	temporal: TemporalWorkerConfig;
	credentials: CredentialStoreConfig;
	binaryData?: BinaryDataConfig;
	execution?: ExecutionConfig;
	/** Logging configuration */
	logging?: LoggingConfig;
}
