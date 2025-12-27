'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.BaseCommand = exports.commands = void 0;
var commands_1 = require('./commands');
Object.defineProperty(exports, 'commands', {
	enumerable: true,
	get: function () {
		return commands_1.commands;
	},
});
var base_1 = require('./commands/base');
Object.defineProperty(exports, 'BaseCommand', {
	enumerable: true,
	get: function () {
		return base_1.BaseCommand;
	},
});
//# sourceMappingURL=index.js.map
