/**
 * Base Command
 *
 * Common functionality for all temporal-n8n CLI commands.
 */

import { Command, Flags, type Interfaces } from '@oclif/core';
import * as fs from 'fs/promises';
import * as path from 'path';

import type { TemporalN8nConfig } from '../../config/types';

export type BaseFlags<T extends typeof Command> = Interfaces.InferredFlags<
	(typeof BaseCommand)['baseFlags'] & T['flags']
>;

export abstract class BaseCommand<T extends typeof Command = typeof Command> extends Command {
	static baseFlags = {
		config: Flags.string({
			char: 'c',
			description: 'Path to configuration file',
			default: './temporal-n8n.config.json',
		}),
		verbose: Flags.boolean({
			char: 'v',
			description: 'Enable verbose logging',
			default: false,
		}),
	};

	protected flags!: BaseFlags<T>;

	/**
	 * Load and parse the configuration file
	 */
	protected async loadConfig(configPath: string): Promise<TemporalN8nConfig> {
		const absolutePath = path.resolve(configPath);

		try {
			const content = await fs.readFile(absolutePath, 'utf-8');
			return JSON.parse(content) as TemporalN8nConfig;
		} catch (error) {
			if ((error as NodeJS.ErrnoException).code === 'ENOENT') {
				this.error(`Configuration file not found: ${absolutePath}`);
			}
			if (error instanceof SyntaxError) {
				this.error(`Invalid JSON in configuration file: ${absolutePath}`);
			}
			this.error(`Failed to load configuration: ${(error as Error).message}`);
		}
	}

	/**
	 * Log a message to stdout
	 */
	protected logMessage(message: string): void {
		this.log(message);
	}

	/**
	 * Log a verbose/debug message (only if --verbose flag is set)
	 */
	protected logVerbose(message: string): void {
		if (this.flags?.verbose) {
			this.log(`[DEBUG] ${message}`);
		}
	}

	/**
	 * Log an error message and exit
	 */
	protected logError(message: string): never {
		this.error(message);
	}
}
