'use strict';
var __importDefault =
	(this && this.__importDefault) ||
	function (mod) {
		return mod && mod.__esModule ? mod : { default: mod };
	};
Object.defineProperty(exports, '__esModule', { value: true });
exports.commands = void 0;
const start_1 = __importDefault(require('./worker/start'));
const result_1 = __importDefault(require('./workflow/result'));
const run_1 = __importDefault(require('./workflow/run'));
const start_2 = __importDefault(require('./workflow/start'));
const status_1 = __importDefault(require('./workflow/status'));
exports.commands = {
	'worker:start': start_1.default,
	'workflow:run': run_1.default,
	'workflow:start': start_2.default,
	'workflow:status': status_1.default,
	'workflow:result': result_1.default,
};
//# sourceMappingURL=index.js.map
