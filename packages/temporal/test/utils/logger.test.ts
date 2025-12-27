/**
 * Logger Utility Tests
 *
 * Tests for the structured logging utility.
 */

import { jsonParse } from 'n8n-workflow';

import {
	Logger,
	getLogger,
	initializeLogger,
	setLogLevel,
	resetLogger,
} from '../../src/utils/logger';

/**
 * Helper to safely extract the first argument from a mock call as a string
 */
function getFirstCallArg(spy: jest.SpyInstance): string {
	const firstCall = spy.mock.calls[0] as unknown[] | undefined;
	const firstArg = firstCall?.[0];
	if (typeof firstArg === 'string') {
		return firstArg;
	}
	return '';
}

describe('Logger', () => {
	let consoleLogSpy: jest.SpyInstance;
	let consoleWarnSpy: jest.SpyInstance;
	let consoleErrorSpy: jest.SpyInstance;

	beforeEach(() => {
		consoleLogSpy = jest.spyOn(console, 'log').mockImplementation();
		consoleWarnSpy = jest.spyOn(console, 'warn').mockImplementation();
		consoleErrorSpy = jest.spyOn(console, 'error').mockImplementation();
		resetLogger();
	});

	afterEach(() => {
		jest.restoreAllMocks();
		resetLogger();
	});

	describe('Logger class', () => {
		it('should log messages at info level by default', () => {
			const logger = new Logger({ level: 'info' });

			logger.info('Test message');

			expect(consoleLogSpy).toHaveBeenCalledTimes(1);
			const output = getFirstCallArg(consoleLogSpy);
			expect(output).toContain('INFO');
			expect(output).toContain('Test message');
		});

		it('should include timestamp in log messages', () => {
			const logger = new Logger({ level: 'info' });

			logger.info('Test message');

			expect(consoleLogSpy).toHaveBeenCalledTimes(1);
			const output = getFirstCallArg(consoleLogSpy);
			// ISO timestamp format: YYYY-MM-DDTHH:mm:ss.sssZ
			expect(output).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}/);
		});

		it('should include prefix in log messages', () => {
			const logger = new Logger({ level: 'info', prefix: 'Worker' });

			logger.info('Test message');

			expect(consoleLogSpy).toHaveBeenCalledTimes(1);
			const output = getFirstCallArg(consoleLogSpy);
			expect(output).toContain('[Worker]');
		});

		it('should include context in log messages', () => {
			const logger = new Logger({ level: 'info' });

			logger.info('Test message', { key: 'value', count: 42 });

			expect(consoleLogSpy).toHaveBeenCalledTimes(1);
			const output = getFirstCallArg(consoleLogSpy);
			expect(output).toContain('{"key":"value","count":42}');
		});

		it('should not include empty context in log messages', () => {
			const logger = new Logger({ level: 'info' });

			logger.info('Test message', {});

			expect(consoleLogSpy).toHaveBeenCalledTimes(1);
			const output = getFirstCallArg(consoleLogSpy);
			expect(output).not.toContain('{}');
		});

		it('should respect log level threshold - debug suppressed at info level', () => {
			const logger = new Logger({ level: 'info' });

			logger.debug('Debug message');

			expect(consoleLogSpy).not.toHaveBeenCalled();
		});

		it('should respect log level threshold - info visible at info level', () => {
			const logger = new Logger({ level: 'info' });

			logger.info('Info message');

			expect(consoleLogSpy).toHaveBeenCalledTimes(1);
		});

		it('should respect log level threshold - warn visible at info level', () => {
			const logger = new Logger({ level: 'info' });

			logger.warn('Warn message');

			expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
		});

		it('should respect log level threshold - error visible at info level', () => {
			const logger = new Logger({ level: 'info' });

			logger.error('Error message');

			expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
		});

		it('should log debug messages when level is debug', () => {
			const logger = new Logger({ level: 'debug' });

			logger.debug('Debug message');

			expect(consoleLogSpy).toHaveBeenCalledTimes(1);
			const output = getFirstCallArg(consoleLogSpy);
			expect(output).toContain('DEBUG');
		});

		it('should only log errors when level is error', () => {
			const logger = new Logger({ level: 'error' });

			logger.debug('Debug message');
			logger.info('Info message');
			logger.warn('Warn message');
			logger.error('Error message');

			expect(consoleLogSpy).not.toHaveBeenCalled();
			expect(consoleWarnSpy).not.toHaveBeenCalled();
			expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
		});

		it('should use warn console for warn level', () => {
			const logger = new Logger({ level: 'warn' });

			logger.warn('Warning message');

			expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
			const output = getFirstCallArg(consoleWarnSpy);
			expect(output).toContain('WARN');
		});

		it('should use error console for error level', () => {
			const logger = new Logger({ level: 'error' });

			logger.error('Error message');

			expect(consoleErrorSpy).toHaveBeenCalledTimes(1);
			const output = getFirstCallArg(consoleErrorSpy);
			expect(output).toContain('ERROR');
		});
	});

	describe('JSON format', () => {
		it('should output JSON when json option is true', () => {
			const logger = new Logger({ level: 'info', json: true });

			logger.info('Test message');

			expect(consoleLogSpy).toHaveBeenCalledTimes(1);
			const output = getFirstCallArg(consoleLogSpy);
			const parsed = jsonParse<Record<string, unknown>>(output);
			expect(parsed).toHaveProperty('timestamp');
			expect(parsed).toHaveProperty('level', 'info');
			expect(parsed).toHaveProperty('message', 'Test message');
		});

		it('should include prefix in JSON output', () => {
			const logger = new Logger({ level: 'info', json: true, prefix: 'Worker' });

			logger.info('Test message');

			const output = getFirstCallArg(consoleLogSpy);
			const parsed = jsonParse<Record<string, unknown>>(output);
			expect(parsed).toHaveProperty('prefix', 'Worker');
		});

		it('should include context in JSON output', () => {
			const logger = new Logger({ level: 'info', json: true });

			logger.info('Test message', { key: 'value', count: 42 });

			const output = getFirstCallArg(consoleLogSpy);
			const parsed = jsonParse<Record<string, unknown>>(output);
			expect(parsed).toHaveProperty('key', 'value');
			expect(parsed).toHaveProperty('count', 42);
		});
	});

	describe('child logger', () => {
		it('should create child logger with nested prefix', () => {
			const logger = new Logger({ level: 'info', prefix: 'Worker' });
			const childLogger = logger.child('Activity');

			childLogger.info('Test message');

			expect(consoleLogSpy).toHaveBeenCalledTimes(1);
			const output = getFirstCallArg(consoleLogSpy);
			expect(output).toContain('[Worker:Activity]');
		});

		it('should create child logger with prefix when parent has no prefix', () => {
			const logger = new Logger({ level: 'info' });
			const childLogger = logger.child('Activity');

			childLogger.info('Test message');

			expect(consoleLogSpy).toHaveBeenCalledTimes(1);
			const output = getFirstCallArg(consoleLogSpy);
			expect(output).toContain('[Activity]');
		});

		it('should inherit log level from parent', () => {
			const logger = new Logger({ level: 'warn' });
			const childLogger = logger.child('Activity');

			childLogger.info('Info message');
			childLogger.warn('Warn message');

			expect(consoleLogSpy).not.toHaveBeenCalled();
			expect(consoleWarnSpy).toHaveBeenCalledTimes(1);
		});

		it('should inherit json format from parent', () => {
			const logger = new Logger({ level: 'info', json: true });
			const childLogger = logger.child('Activity');

			childLogger.info('Test message');

			const output = getFirstCallArg(consoleLogSpy);
			const parsed = jsonParse<Record<string, unknown>>(output);
			expect(parsed).toHaveProperty('prefix', 'Activity');
		});
	});

	describe('getLevel and isJsonFormat', () => {
		it('should return current log level', () => {
			const logger = new Logger({ level: 'warn' });

			expect(logger.getLevel()).toBe('warn');
		});

		it('should return json format status', () => {
			const logger = new Logger({ level: 'info', json: true });

			expect(logger.isJsonFormat()).toBe(true);
		});

		it('should return false for json format when not set', () => {
			const logger = new Logger({ level: 'info' });

			expect(logger.isJsonFormat()).toBe(false);
		});
	});

	describe('getLogger singleton', () => {
		it('should return default logger with info level', () => {
			const logger = getLogger();

			expect(logger.getLevel()).toBe('info');
		});

		it('should return same instance on multiple calls', () => {
			const logger1 = getLogger();
			const logger2 = getLogger();

			expect(logger1).toBe(logger2);
		});
	});

	describe('initializeLogger', () => {
		it('should create logger with specified options', () => {
			const logger = initializeLogger({ level: 'debug', json: true, prefix: 'Test' });

			expect(logger.getLevel()).toBe('debug');
			expect(logger.isJsonFormat()).toBe(true);
		});

		it('should replace default logger', () => {
			initializeLogger({ level: 'debug' });
			const logger = getLogger();

			expect(logger.getLevel()).toBe('debug');
		});
	});

	describe('setLogLevel', () => {
		it('should update log level of existing logger', () => {
			initializeLogger({ level: 'info' });
			setLogLevel('debug');
			const logger = getLogger();

			expect(logger.getLevel()).toBe('debug');
		});

		it('should create logger if none exists', () => {
			setLogLevel('warn');
			const logger = getLogger();

			expect(logger.getLevel()).toBe('warn');
		});
	});

	describe('environment variables', () => {
		const originalEnv = process.env;

		beforeEach(() => {
			process.env = { ...originalEnv };
		});

		afterEach(() => {
			process.env = originalEnv;
		});

		it('should use LOG_LEVEL environment variable', () => {
			process.env.LOG_LEVEL = 'debug';
			resetLogger();

			const logger = getLogger();

			expect(logger.getLevel()).toBe('debug');
		});

		it('should use LOG_FORMAT environment variable for JSON', () => {
			process.env.LOG_FORMAT = 'json';
			resetLogger();

			const logger = getLogger();

			expect(logger.isJsonFormat()).toBe(true);
		});
	});
});
