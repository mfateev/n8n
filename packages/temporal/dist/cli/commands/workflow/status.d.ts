import { BaseCommand } from '../base';
export default class WorkflowStatus extends BaseCommand {
	static description: string;
	static examples: string[];
	static flags: {
		'workflow-id': import('@oclif/core/lib/interfaces').OptionFlag<
			string,
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
}
