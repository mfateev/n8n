'use strict';
var __createBinding =
	(this && this.__createBinding) ||
	(Object.create
		? function (o, m, k, k2) {
				if (k2 === undefined) k2 = k;
				var desc = Object.getOwnPropertyDescriptor(m, k);
				if (!desc || ('get' in desc ? !m.__esModule : desc.writable || desc.configurable)) {
					desc = {
						enumerable: true,
						get: function () {
							return m[k];
						},
					};
				}
				Object.defineProperty(o, k2, desc);
			}
		: function (o, m, k, k2) {
				if (k2 === undefined) k2 = k;
				o[k2] = m[k];
			});
var __setModuleDefault =
	(this && this.__setModuleDefault) ||
	(Object.create
		? function (o, v) {
				Object.defineProperty(o, 'default', { enumerable: true, value: v });
			}
		: function (o, v) {
				o['default'] = v;
			});
var __importStar =
	(this && this.__importStar) ||
	(function () {
		var ownKeys = function (o) {
			ownKeys =
				Object.getOwnPropertyNames ||
				function (o) {
					var ar = [];
					for (var k in o) if (Object.prototype.hasOwnProperty.call(o, k)) ar[ar.length] = k;
					return ar;
				};
			return ownKeys(o);
		};
		return function (mod) {
			if (mod && mod.__esModule) return mod;
			var result = {};
			if (mod != null)
				for (var k = ownKeys(mod), i = 0; i < k.length; i++)
					if (k[i] !== 'default') __createBinding(result, mod, k[i]);
			__setModuleDefault(result, mod);
			return result;
		};
	})();
Object.defineProperty(exports, '__esModule', { value: true });
exports.BaseCommand = void 0;
const core_1 = require('@oclif/core');
const fs = __importStar(require('fs/promises'));
const path = __importStar(require('path'));
class BaseCommand extends core_1.Command {
	async loadConfig(configPath) {
		const absolutePath = path.resolve(configPath);
		try {
			const content = await fs.readFile(absolutePath, 'utf-8');
			return JSON.parse(content);
		} catch (error) {
			if (error.code === 'ENOENT') {
				this.error(`Configuration file not found: ${absolutePath}`);
			}
			if (error instanceof SyntaxError) {
				this.error(`Invalid JSON in configuration file: ${absolutePath}`);
			}
			this.error(`Failed to load configuration: ${error.message}`);
		}
	}
	logMessage(message) {
		this.log(message);
	}
	logVerbose(message) {
		if (this.flags?.verbose) {
			this.log(`[DEBUG] ${message}`);
		}
	}
	logError(message) {
		this.error(message);
	}
}
exports.BaseCommand = BaseCommand;
BaseCommand.baseFlags = {
	config: core_1.Flags.string({
		char: 'c',
		description: 'Path to configuration file',
		default: './temporal-n8n.config.json',
	}),
	verbose: core_1.Flags.boolean({
		char: 'v',
		description: 'Enable verbose logging',
		default: false,
	}),
};
//# sourceMappingURL=base.js.map
