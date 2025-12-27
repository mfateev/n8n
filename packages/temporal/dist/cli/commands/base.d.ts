import { Command, type Interfaces } from '@oclif/core';
import type { TemporalN8nConfig } from '../../config/types';
export type BaseFlags<T extends typeof Command> = Interfaces.InferredFlags<
	(typeof BaseCommand)['baseFlags'] & T['flags']
>;
export declare abstract class BaseCommand<
	T extends typeof Command = typeof Command,
> extends Command {
	static baseFlags: {
		config: Interfaces.OptionFlag<string, Interfaces.CustomOptions>;
		verbose: Interfaces.BooleanFlag<boolean>;
	};
	protected flags: BaseFlags<T>;
	protected loadConfig(configPath: string): Promise<TemporalN8nConfig>;
	protected logMessage(message: string): void;
	protected logVerbose(message: string): void;
	protected logError(message: string): never;
}
