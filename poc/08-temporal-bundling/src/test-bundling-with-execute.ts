/**
 * POC 8: Bundling Test with WorkflowExecute
 *
 * This test attempts to bundle a workflow that imports WorkflowExecute
 * from n8n-core. This is the key test to see if we can reuse n8n's
 * orchestration logic inside Temporal.
 *
 * Run: cd poc/08-temporal-bundling && pnpm tsx src/test-bundling-with-execute.ts
 */

import { bundleWorkflowCode } from '@temporalio/worker';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Node.js built-in module names
const NODE_BUILTINS = [
	'fs',
	'fs/promises',
	'path',
	'os',
	'crypto',
	'http',
	'https',
	'http2',
	'net',
	'tls',
	'dns',
	'stream',
	'stream/web',
	'stream/promises',
	'zlib',
	'child_process',
	'worker_threads',
	'cluster',
	'dgram',
	'readline',
	'readline/promises',
	'repl',
	'vm',
	'v8',
	'perf_hooks',
	'async_hooks',
	'trace_events',
	'inspector',
	'inspector/promises',
	'buffer',
	'util',
	'util/types',
	'events',
	'string_decoder',
	'querystring',
	'url',
	'assert',
	'assert/strict',
	'timers',
	'timers/promises',
	'console',
	'constants',
	'process',
	'module',
	'diagnostics_channel',
	'wasi',
	'punycode',
	'tty',
	'sys',
	'domain',
];

// Generate both regular and node: prefixed versions
const IGNORE_MODULES = [
	// Regular imports
	...NODE_BUILTINS,
	// node: prefixed imports
	...NODE_BUILTINS.map((m) => `node:${m}`),

	// Database drivers
	'better-sqlite3',
	'pg',
	'pg-native',
	'mysql2',
	'ioredis',
	'redis',
	'mongodb',
	'typeorm',

	// Network/HTTP related
	'ssh2',
	'nodemailer',
	'imap',
	'axios',
	'node-fetch',
	'got',
	'request',
	'form-data',
	'formidable',
	'busboy',

	// File system related
	'chokidar',
	'glob',
	'fast-glob',
	'rimraf',
	'mkdirp',

	// Process related
	'cross-spawn',
	'execa',

	// Crypto related
	'bcrypt',
	'bcryptjs',
	'jsonwebtoken',

	// Native modules
	'canvas',
	'sharp',

	// n8n specific - Sentry and native modules that pull in node: imports
	'@sentry/node',
	'@sentry/node-native',
	'@sentry-internal/node-native-stacktrace',
	'pino',
	'winston',

	// Express and web
	'express',
	'body-parser',
	'cookie-parser',
	'cors',

	// Misc
	'dotenv',
	'node-cron',

	// n8n packages with TypeScript sources that webpack can't parse
	'@n8n/tournament',

	// n8n CLI reference (not available in workflow context)
	'n8n',
];

async function testBundlingWithExecute() {
	console.log('=== POC 8: Bundling Test with WorkflowExecute ===\n');

	console.log('Testing if WorkflowExecute can be bundled into Temporal workflow...\n');
	console.log(`Ignoring ${IGNORE_MODULES.length} modules\n`);

	try {
		const workflowsPath = join(__dirname, 'workflows', 'n8n-workflow-with-execute.ts');

		console.log(`Bundling workflow from: ${workflowsPath}`);
		console.log('This may take a while as it includes n8n-core and n8n-workflow...\n');

		const startTime = Date.now();

		const { code } = await bundleWorkflowCode({
			workflowsPath,
			ignoreModules: IGNORE_MODULES,
			// Hook to handle node: prefixed imports
			webpackConfigHook: (config) => {
				// Add externals for node: prefixed modules
				const nodeExternals: Record<string, string> = {};
				for (const builtin of NODE_BUILTINS) {
					nodeExternals[`node:${builtin}`] = `commonjs node:${builtin}`;
				}

				config.externals = {
					...(typeof config.externals === 'object' ? config.externals : {}),
					...nodeExternals,
				};

				return config;
			},
		});

		const elapsed = Date.now() - startTime;

		console.log(`\n✅ Bundling SUCCEEDED in ${elapsed}ms!\n`);
		console.log(`Bundle size: ${(code.length / 1024 / 1024).toFixed(2)} MB`);

		// Check what's in the bundle
		const checks = [
			{ name: 'WorkflowExecute', pattern: 'WorkflowExecute' },
			{ name: 'Workflow class', pattern: 'class Workflow' },
			{ name: 'NodeHelpers', pattern: 'NodeHelpers' },
			{ name: 'executeN8nWorkflowWithExecute', pattern: 'executeN8nWorkflowWithExecute' },
			{ name: 'proxyActivities', pattern: 'proxyActivities' },
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

		console.log('\n=== POC 8 Bundling with WorkflowExecute PASSED ===');

		return true;
	} catch (error) {
		console.error('\n❌ Bundling FAILED!\n');

		if (error instanceof Error) {
			console.error('Error:', error.message);

			// Try to extract useful info about what module failed
			const moduleMatch = error.message.match(/Cannot find module '([^']+)'/);
			if (moduleMatch) {
				console.log(`\n💡 Suggestion: Add '${moduleMatch[1]}' to ignoreModules`);
			}

			// Check for other common patterns
			if (error.message.includes('is not a function')) {
				console.log('\n💡 This might be a Node.js API being called in the bundle');
			}

			console.error('\nStack:', error.stack);
		} else {
			console.error('Error:', error);
		}

		console.log('\n=== POC 8 Bundling with WorkflowExecute FAILED ===');

		return false;
	}
}

// Run test
testBundlingWithExecute()
	.then((success) => {
		process.exit(success ? 0 : 1);
	})
	.catch((err) => {
		console.error('Test runner error:', err);
		process.exit(1);
	});
