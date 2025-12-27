export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export interface LoggerOptions {
	level: LogLevel;
	prefix?: string;
	json?: boolean;
}
export declare class Logger {
	private levelValue;
	private options;
	constructor(options: LoggerOptions);
	private shouldLog;
	private formatMessage;
	debug(message: string, context?: Record<string, unknown>): void;
	info(message: string, context?: Record<string, unknown>): void;
	warn(message: string, context?: Record<string, unknown>): void;
	error(message: string, context?: Record<string, unknown>): void;
	child(prefix: string): Logger;
	getLevel(): LogLevel;
	isJsonFormat(): boolean;
}
export declare function getLogger(): Logger;
export declare function initializeLogger(options: LoggerOptions): Logger;
export declare function setLogLevel(level: LogLevel): void;
export declare function resetLogger(): void;
