/**
 * POC 8: Alias-based Bundling Test
 *
 * Uses resolve.alias to stub out n8n-core submodules we don't need.
 */

import { bundleWorkflowCode } from '@temporalio/worker';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';

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

// Standard ignoreModules
const IGNORE_MODULES = [
	...NODE_BUILTINS,
	...NODE_BUILTINS.map((m) => `node:${m}`),
	'better-sqlite3', 'pg', 'pg-native', 'mysql2', 'ioredis', 'redis',
	'mongodb', 'typeorm', 'sqlite3',
	'ssh2', 'nodemailer', 'imap', 'axios', 'node-fetch', 'got', 'request',
	'form-data', 'formidable', 'busboy', 'undici',
	'@sentry/node', '@sentry/node-native', '@sentry-internal/node-native-stacktrace',
	'@n8n/tournament', 'n8n', 'n8n-nodes-base',
	'luxon', 'moment', 'date-fns',
	'lodash', 'lodash-es',
	'jmespath', 'jsonpath',
	'xml2js', 'fast-xml-parser', 'cheerio', 'htmlparser2', 'jsdom',
	'papaparse', 'xlsx', 'exceljs',
	'crypto-js', 'bcrypt', 'jsonwebtoken',
	'chokidar', 'glob', 'fast-glob', 'rimraf', 'fs-extra',
	'pino', 'winston',
	'ajv', 'zod', 'validator',
	'uuid', 'nanoid',
	'sharp', 'canvas',
	'express', 'body-parser', 'cors',
	'dotenv', 'cross-spawn', 'execa',
	'ws', 'socket.io',
	'source-map', 'source-map-support',
	'@n8n/backend-common',
	'@n8n/config',
	'convict',
];

const emptyModulePath = resolve(__dirname, 'empty-module.js');

async function testAliasBundling() {
	console.log('=== POC 8: Alias-based Bundling Test ===\n');

	console.log('Using resolve.alias to stub n8n-core submodules...\n');

	try {
		const workflowsPath = join(__dirname, 'workflows', 'n8n-workflow-minimal.ts');

		console.log(`Bundling workflow from: ${workflowsPath}\n`);

		const startTime = Date.now();

		const { code } = await bundleWorkflowCode({
			workflowsPath,
			ignoreModules: IGNORE_MODULES,
			webpackConfigHook: (config) => {
				// Handle node: prefixed imports
				const nodeExternals: Record<string, string> = {};
				for (const builtin of NODE_BUILTINS) {
					nodeExternals[`node:${builtin}`] = `commonjs node:${builtin}`;
				}

				config.externals = {
					...(typeof config.externals === 'object' ? config.externals : {}),
					...nodeExternals,
				};

				// Use resolve.alias to stub out n8n-core submodules we don't need
				config.resolve = config.resolve || {};
				config.resolve.alias = {
					...config.resolve.alias,
					// Stub out n8n-core modules not needed for orchestration
					'n8n-core/dist/binary-data': emptyModulePath,
					'n8n-core/dist/credentials': emptyModulePath,
					'n8n-core/dist/encryption': emptyModulePath,
					'n8n-core/dist/nodes-loader': emptyModulePath,
					'n8n-core/dist/data-deduplication-service': emptyModulePath,
					'n8n-core/dist/http-proxy': emptyModulePath,
					// Stub n8n-workflow modules not needed
					'n8n-workflow/dist/cjs/expression-sandboxing': emptyModulePath,
					'n8n-workflow/dist/esm/expression-sandboxing': emptyModulePath,
				};

				// Enable tree shaking
				config.optimization = {
					...config.optimization,
					usedExports: true,
					sideEffects: true,
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
		let allFound = true;
		for (const check of checks) {
			if (code.includes(check.pattern)) {
				console.log(`  ✅ ${check.name} found`);
			} else {
				console.log(`  ❌ ${check.name} NOT found`);
				allFound = false;
			}
		}

		// Check what's NOT in the bundle
		const shouldNotInclude = [
			{ name: 'BinaryDataService', pattern: 'BinaryDataService' },
			{ name: 'DirectoryLoader', pattern: 'DirectoryLoader' },
			{ name: 'Credentials encryption', pattern: 'CredentialsEncryption' },
		];

		console.log('\nVerifying stubbed modules:');
		for (const check of shouldNotInclude) {
			if (!code.includes(check.pattern)) {
				console.log(`  ✅ ${check.name} NOT included`);
			} else {
				console.log(`  ⚠️  ${check.name} still included`);
			}
		}

		if (allFound) {
			console.log('\n=== POC 8 Alias Bundling Test PASSED ===');
		} else {
			console.log('\n=== POC 8 Alias Bundling Test PARTIAL ===');
		}

		return true;
	} catch (error) {
		console.error('\n❌ Bundling FAILED!\n');

		if (error instanceof Error) {
			console.error('Error:', error.message);
		}

		return false;
	}
}

testAliasBundling()
	.then((success) => {
		process.exit(success ? 0 : 1);
	})
	.catch((err) => {
		console.error('Test runner error:', err);
		process.exit(1);
	});
