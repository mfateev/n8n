/**
 * Structured Logger
 *
 * Provides consistent logging throughout the temporal-n8n package.
 * Supports multiple log levels and structured output.
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

export interface LoggerOptions {
	/** Log level threshold */
	level: LogLevel;
	/** Prefix for log messages (e.g., 'Worker', 'Activity') */
	prefix?: string;
	/** Whether to output in JSON format */
	json?: boolean;
}

const LOG_LEVELS: Record<LogLevel, number> = {
	debug: 0,
	info: 1,
	warn: 2,
	error: 3,
};

export class Logger {
	private levelValue: number;
	private options: LoggerOptions;

	constructor(options: LoggerOptions) {
		this.options = options;
		this.levelValue = LOG_LEVELS[options.level];
	}

	/**
	 * Check if a message at the given level should be logged
	 */
	private shouldLog(level: LogLevel): boolean {
		return LOG_LEVELS[level] >= this.levelValue;
	}

	/**
	 * Format a log message with timestamp and optional context
	 */
	private formatMessage(
		level: LogLevel,
		message: string,
		context?: Record<string, unknown>,
	): string {
		const timestamp = new Date().toISOString();
		const prefix = this.options.prefix ? `[${this.options.prefix}]` : '';

		if (this.options.json) {
			return JSON.stringify({
				timestamp,
				level,
				prefix: this.options.prefix ?? undefined,
				message,
				...context,
			});
		}

		const levelStr = level.toUpperCase().padEnd(5);
		const contextStr =
			context && Object.keys(context).length > 0 ? ` ${JSON.stringify(context)}` : '';
		return `${timestamp} ${levelStr} ${prefix} ${message}${contextStr}`;
	}

	/**
	 * Log a debug message (lowest priority)
	 */
	debug(message: string, context?: Record<string, unknown>): void {
		if (this.shouldLog('debug')) {
			console.log(this.formatMessage('debug', message, context));
		}
	}

	/**
	 * Log an info message
	 */
	info(message: string, context?: Record<string, unknown>): void {
		if (this.shouldLog('info')) {
			console.log(this.formatMessage('info', message, context));
		}
	}

	/**
	 * Log a warning message
	 */
	warn(message: string, context?: Record<string, unknown>): void {
		if (this.shouldLog('warn')) {
			console.warn(this.formatMessage('warn', message, context));
		}
	}

	/**
	 * Log an error message (highest priority)
	 */
	error(message: string, context?: Record<string, unknown>): void {
		if (this.shouldLog('error')) {
			console.error(this.formatMessage('error', message, context));
		}
	}

	/**
	 * Create a child logger with a nested prefix
	 */
	child(prefix: string): Logger {
		return new Logger({
			...this.options,
			prefix: this.options.prefix ? `${this.options.prefix}:${prefix}` : prefix,
		});
	}

	/**
	 * Get the current log level
	 */
	getLevel(): LogLevel {
		return this.options.level;
	}

	/**
	 * Check if the logger uses JSON format
	 */
	isJsonFormat(): boolean {
		return this.options.json ?? false;
	}
}

// Default logger instance (singleton)
let defaultLogger: Logger | undefined;

/**
 * Get the default logger instance.
 * Creates a new logger if one doesn't exist, using environment variables for configuration.
 */
export function getLogger(): Logger {
	if (!defaultLogger) {
		const level = (process.env.LOG_LEVEL as LogLevel) ?? 'info';
		const json = process.env.LOG_FORMAT === 'json';

		defaultLogger = new Logger({
			level,
			json,
		});
	}
	return defaultLogger;
}

/**
 * Initialize the logger with specific options.
 * This should be called once at startup to configure the default logger.
 */
export function initializeLogger(options: LoggerOptions): Logger {
	defaultLogger = new Logger(options);
	return defaultLogger;
}

/**
 * Set the log level of the default logger.
 * If no logger exists, creates one with the specified level.
 */
export function setLogLevel(level: LogLevel): void {
	if (defaultLogger) {
		// Create a new logger with the updated level
		defaultLogger = new Logger({
			level,
			prefix: defaultLogger['options'].prefix,
			json: defaultLogger['options'].json,
		});
	} else {
		initializeLogger({ level });
	}
}

/**
 * Reset the default logger (useful for testing)
 */
export function resetLogger(): void {
	defaultLogger = undefined;
}
