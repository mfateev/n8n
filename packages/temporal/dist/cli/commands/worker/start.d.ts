import { BaseCommand } from '../base';
export default class WorkerStart extends BaseCommand {
	static description: string;
	static examples: string[];
	static flags: {
		'task-queue': import('@oclif/core/lib/interfaces').OptionFlag<
			string | undefined,
			import('@oclif/core/lib/interfaces').CustomOptions
		>;
		concurrency: import('@oclif/core/lib/interfaces').OptionFlag<
			number | undefined,
			import('@oclif/core/lib/interfaces').CustomOptions
		>;
		config: import('@oclif/core/lib/interfaces').OptionFlag<
			string,
			import('@oclif/core/lib/interfaces').CustomOptions
		>;
		verbose: import('@oclif/core/lib/interfaces').BooleanFlag<boolean>;
	};
	run(): Promise<void>;
}
