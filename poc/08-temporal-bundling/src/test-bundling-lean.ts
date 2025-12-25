/**
 * POC 8: Lean Bundling Test
 *
 * Tests bundling a workflow that only imports from n8n-workflow (not n8n-core).
 * This should give us a much smaller bundle.
 */

import { bundleWorkflowCode } from '@temporalio/worker';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Node.js built-ins
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

// Modules to ignore - focused on what n8n-workflow might pull in
const IGNORE_MODULES = [
	...NODE_BUILTINS,
	...NODE_BUILTINS.map((m) => `node:${m}`),
	// n8n-core is NOT needed for lean workflow - all node execution happens in activities
	'n8n-core',
	// Expression evaluation libs (handled in activities)
	'@n8n/tournament',
	'luxon', 'moment', 'date-fns',
	'lodash', 'lodash-es',
	'jmespath', 'jsonpath',
	// XML/HTML
	'xml2js', 'fast-xml-parser', 'cheerio', 'htmlparser2',
	// Misc
	'ajv', 'zod',
	'uuid',
	// Sentry
	'@sentry/node', '@sentry/node-native',
];

async function testLeanBundling() {
	console.log('=== POC 8: Lean Bundling Test ===\n');

	console.log('Testing bundle with only n8n-workflow imports (no n8n-core)...\n');

	try {
		const workflowsPath = join(__dirname, 'workflows', 'n8n-workflow-lean.ts');

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

				return config;
			},
		});

		const elapsed = Date.now() - startTime;
		const sizeMB = code.length / 1024 / 1024;

		console.log(`✅ Bundling SUCCEEDED in ${elapsed}ms!\n`);
		console.log(`Bundle size: ${sizeMB.toFixed(2)} MB`);

		// Check what's in the bundle
		const checks = [
			{ name: 'Workflow class', pattern: 'class Workflow' },
			{ name: 'NodeHelpers', pattern: 'NodeHelpers' },
			{ name: 'executeN8nWorkflowLean', pattern: 'executeN8nWorkflowLean' },
			{ name: 'proxyActivities', pattern: 'proxyActivities' },
			{ name: 'NodeConnectionTypes', pattern: 'NodeConnectionTypes' },
		];

		console.log('\nBundle contents check:');
		for (const check of checks) {
			if (code.includes(check.pattern)) {
				console.log(`  ✅ ${check.name} found`);
			} else {
				console.log(`  ❌ ${check.name} NOT found`);
			}
		}

		// Verify n8n-core is NOT included
		const shouldNotInclude = [
			{ name: 'WorkflowExecute', pattern: 'WorkflowExecute' },
			{ name: 'BinaryDataService', pattern: 'BinaryDataService' },
			{ name: 'DirectoryLoader', pattern: 'DirectoryLoader' },
			{ name: 'n8n-core imports', pattern: 'n8n-core' },
		];

		console.log('\nVerifying n8n-core NOT included:');
		for (const check of shouldNotInclude) {
			if (!code.includes(check.pattern)) {
				console.log(`  ✅ ${check.name} NOT included`);
			} else {
				console.log(`  ⚠️  ${check.name} still included`);
			}
		}

		console.log('\n=== POC 8 Lean Bundling Test PASSED ===');

		return true;
	} catch (error) {
		console.error('\n❌ Bundling FAILED!\n');

		if (error instanceof Error) {
			console.error('Error:', error.message);

			const moduleMatch = error.message.match(/Cannot find module '([^']+)'/);
			if (moduleMatch) {
				console.log(`\n💡 Add '${moduleMatch[1]}' to ignoreModules`);
			}
		}

		return false;
	}
}

testLeanBundling()
	.then((success) => {
		process.exit(success ? 0 : 1);
	})
	.catch((err) => {
		console.error('Test runner error:', err);
		process.exit(1);
	});
