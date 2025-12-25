/**
 * POC 8: Optimized Bundling Test
 *
 * Uses webpack plugins to stub out modules and enable better tree-shaking.
 */

import { bundleWorkflowCode } from '@temporalio/worker';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';
import webpack from 'webpack';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Node.js built-in module names
const NODE_BUILTINS = [
	'fs', 'fs/promises', 'path', 'os', 'crypto', 'http', 'https', 'http2',
	'net', 'tls', 'dns', 'stream', 'stream/web', 'stream/promises', 'zlib',
	'child_process', 'worker_threads', 'cluster', 'dgram', 'readline',
	'readline/promises', 'repl', 'vm', 'v8', 'perf_hooks', 'async_hooks',
	'trace_events', 'inspector', 'inspector/promises', 'buffer', 'util',
	'util/types', 'events', 'string_decoder', 'querystring', 'url',
	'assert', 'assert/strict', 'timers', 'timers/promises', 'console',
	'constants', 'process', 'module', 'diagnostics_channel', 'wasi',
	'punycode', 'tty', 'sys', 'domain',
];

// Modules to completely ignore (external)
const IGNORE_MODULES = [
	...NODE_BUILTINS,
	...NODE_BUILTINS.map((m) => `node:${m}`),
	// Database
	'better-sqlite3', 'pg', 'pg-native', 'mysql2', 'ioredis', 'redis',
	'mongodb', 'typeorm', 'sqlite3', 'oracledb', 'tedious', 'mssql',
	// Network
	'ssh2', 'nodemailer', 'imap', 'axios', 'node-fetch', 'got', 'request',
	'form-data', 'formidable', 'busboy', 'undici',
	// Sentry
	'@sentry/node', '@sentry/node-native', '@sentry-internal/node-native-stacktrace',
	// n8n packages
	'@n8n/tournament', 'n8n', 'n8n-nodes-base', '@n8n/n8n-nodes-langchain',
];

// Modules to replace with empty stubs (allows tree-shaking)
const STUB_MODULES = [
	// Expression evaluation - not needed in workflow sandbox
	'luxon',
	'lodash', 'lodash-es',
	'jmespath', 'jsonpath', 'jsonpath-plus',
	'moment', 'moment-timezone',
	'date-fns', 'date-fns-tz',
	// XML/HTML
	'xml2js', 'fast-xml-parser', 'xmlbuilder', 'xmlbuilder2', 'sax',
	'cheerio', 'htmlparser2', 'domhandler', 'domutils', 'dom-serializer',
	'jsdom', 'parse5',
	// Data manipulation
	'papaparse', 'xlsx', 'exceljs',
	'csv-parse', 'csv-stringify',
	// Crypto
	'crypto-js', 'bcrypt', 'bcryptjs', 'jsonwebtoken',
	// File handling
	'chokidar', 'glob', 'fast-glob', 'rimraf', 'mkdirp', 'graceful-fs', 'fs-extra',
	// Misc heavy libs
	'pino', 'winston', 'bunyan',
	'ajv', 'ajv-formats', 'zod',
	'uuid', 'nanoid',
	'numeral', 'validator',
	// n8n internals we don't need
	'@n8n/backend-common',
];

async function testOptimizedBundling() {
	console.log('=== POC 8: Optimized Bundling Test ===\n');

	console.log('Using webpack plugins for aggressive optimization...\n');
	console.log(`External modules: ${IGNORE_MODULES.length}`);
	console.log(`Stubbed modules: ${STUB_MODULES.length}\n`);

	try {
		const workflowsPath = join(__dirname, 'workflows', 'n8n-workflow-minimal.ts');

		console.log(`Bundling workflow from: ${workflowsPath}\n`);

		const startTime = Date.now();

		const { code } = await bundleWorkflowCode({
			workflowsPath,
			ignoreModules: IGNORE_MODULES,
			webpackConfigHook: (config) => {
				// Handle node: prefixed imports as externals
				const nodeExternals: Record<string, string> = {};
				for (const builtin of NODE_BUILTINS) {
					nodeExternals[`node:${builtin}`] = `commonjs node:${builtin}`;
				}

				config.externals = {
					...(typeof config.externals === 'object' ? config.externals : {}),
					...nodeExternals,
				};

				// Create regex pattern for stub modules
				const stubPattern = new RegExp(
					`^(${STUB_MODULES.map((m) => m.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|')})(/.*)?$`
				);

				// Add plugins
				config.plugins = config.plugins || [];

				// Replace stub modules with empty module
				config.plugins.push(
					new webpack.NormalModuleReplacementPlugin(stubPattern, (resource: { request: string }) => {
						// Replace with a module that exports empty object
						resource.request = require.resolve('./empty-module.js');
					})
				);

				// Also use IgnorePlugin for certain patterns
				config.plugins.push(
					new webpack.IgnorePlugin({
						resourceRegExp: /^(prettier|eslint|typescript)$/,
					})
				);

				// Optimize settings
				config.optimization = {
					...config.optimization,
					usedExports: true,
					sideEffects: true,
					minimize: false, // Keep readable for debugging
				};

				return config;
			},
		});

		const elapsed = Date.now() - startTime;
		const sizeMB = code.length / 1024 / 1024;

		console.log(`✅ Bundling SUCCEEDED in ${elapsed}ms!\n`);
		console.log(`Bundle size: ${sizeMB.toFixed(2)} MB`);

		// Check what's in the bundle
		const checks = [
			{ name: 'WorkflowExecute', pattern: 'WorkflowExecute' },
			{ name: 'Workflow class', pattern: 'class Workflow' },
			{ name: 'NodeHelpers', pattern: 'NodeHelpers' },
			{ name: 'addNodeToBeExecuted', pattern: 'addNodeToBeExecuted' },
			{ name: 'processRunExecutionData', pattern: 'processRunExecutionData' },
		];

		console.log('\nBundle contents check:');
		for (const check of checks) {
			if (code.includes(check.pattern)) {
				console.log(`  ✅ ${check.name} found`);
			} else {
				console.log(`  ❌ ${check.name} NOT found`);
			}
		}

		console.log('\n=== POC 8 Optimized Bundling Test PASSED ===');

		return true;
	} catch (error) {
		console.error('\n❌ Bundling FAILED!\n');

		if (error instanceof Error) {
			console.error('Error:', error.message);
			console.error('\nStack:', error.stack);
		} else {
			console.error('Error:', error);
		}

		return false;
	}
}

testOptimizedBundling()
	.then((success) => {
		process.exit(success ? 0 : 1);
	})
	.catch((err) => {
		console.error('Test runner error:', err);
		process.exit(1);
	});
