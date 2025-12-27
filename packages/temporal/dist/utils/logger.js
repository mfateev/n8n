'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.Logger = void 0;
exports.getLogger = getLogger;
exports.initializeLogger = initializeLogger;
exports.setLogLevel = setLogLevel;
exports.resetLogger = resetLogger;
const LOG_LEVELS = {
	debug: 0,
	info: 1,
	warn: 2,
	error: 3,
};
class Logger {
	constructor(options) {
		this.options = options;
		this.levelValue = LOG_LEVELS[options.level];
	}
	shouldLog(level) {
		return LOG_LEVELS[level] >= this.levelValue;
	}
	formatMessage(level, message, context) {
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
	debug(message, context) {
		if (this.shouldLog('debug')) {
			console.log(this.formatMessage('debug', message, context));
		}
	}
	info(message, context) {
		if (this.shouldLog('info')) {
			console.log(this.formatMessage('info', message, context));
		}
	}
	warn(message, context) {
		if (this.shouldLog('warn')) {
			console.warn(this.formatMessage('warn', message, context));
		}
	}
	error(message, context) {
		if (this.shouldLog('error')) {
			console.error(this.formatMessage('error', message, context));
		}
	}
	child(prefix) {
		return new Logger({
			...this.options,
			prefix: this.options.prefix ? `${this.options.prefix}:${prefix}` : prefix,
		});
	}
	getLevel() {
		return this.options.level;
	}
	isJsonFormat() {
		return this.options.json ?? false;
	}
}
exports.Logger = Logger;
let defaultLogger;
function getLogger() {
	if (!defaultLogger) {
		const level = process.env.LOG_LEVEL ?? 'info';
		const json = process.env.LOG_FORMAT === 'json';
		defaultLogger = new Logger({
			level,
			json,
		});
	}
	return defaultLogger;
}
function initializeLogger(options) {
	defaultLogger = new Logger(options);
	return defaultLogger;
}
function setLogLevel(level) {
	if (defaultLogger) {
		defaultLogger = new Logger({
			level,
			prefix: defaultLogger['options'].prefix,
			json: defaultLogger['options'].json,
		});
	} else {
		initializeLogger({ level });
	}
}
function resetLogger() {
	defaultLogger = undefined;
}
//# sourceMappingURL=logger.js.map
