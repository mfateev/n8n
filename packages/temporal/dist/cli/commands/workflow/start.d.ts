import { BaseCommand } from '../base';
export default class WorkflowStart extends BaseCommand {
	static description: string;
	static examples: string[];
	static flags: {
		workflow: import('@oclif/core/lib/interfaces').OptionFlag<
			string,
			import('@oclif/core/lib/interfaces').CustomOptions
		>;
		input: import('@oclif/core/lib/interfaces').OptionFlag<
			string | undefined,
			import('@oclif/core/lib/interfaces').CustomOptions
		>;
		'task-queue': import('@oclif/core/lib/interfaces').OptionFlag<
			string | undefined,
			import('@oclif/core/lib/interfaces').CustomOptions
		>;
		'workflow-id': import('@oclif/core/lib/interfaces').OptionFlag<
			string | undefined,
			import('@oclif/core/lib/interfaces').CustomOptions
		>;
		json: import('@oclif/core/lib/interfaces').BooleanFlag<boolean>;
		config: import('@oclif/core/lib/interfaces').OptionFlag<
			string,
			import('@oclif/core/lib/interfaces').CustomOptions
		>;
		verbose: import('@oclif/core/lib/interfaces').BooleanFlag<boolean>;
	};
	run(): Promise<void>;
	private loadInputFile;
}
