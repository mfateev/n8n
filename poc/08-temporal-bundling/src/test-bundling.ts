/**
 * POC 8: Bundling Test
 *
 * This test verifies that the Temporal workflow can be bundled
 * without actually connecting to a Temporal server.
 *
 * Run: cd poc/08-temporal-bundling && pnpm test
 */

import { bundleWorkflowCode } from '@temporalio/worker';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

async function testBundling() {
	console.log('=== POC 8: Temporal Bundling Test ===\n');

	console.log('Testing if n8n workflow code can be bundled for Temporal...\n');

	try {
		const workflowsPath = join(__dirname, 'workflows', 'n8n-workflow.ts');

		console.log(`Bundling workflow from: ${workflowsPath}`);

		const { code } = await bundleWorkflowCode({
			workflowsPath,
			// Bundle options - ignore Node.js modules
			ignoreModules: [
				// Node.js built-ins
				'fs',
				'path',
				'os',
				'crypto',
				'http',
				'https',
				'net',
				'tls',
				'dns',
				'stream',
				'zlib',
				'child_process',
				'worker_threads',
				'cluster',
				'dgram',
				'readline',
				'repl',
				'vm',
				'v8',
				'perf_hooks',
				'async_hooks',
				'trace_events',
				'inspector',
				'buffer',
				'util',
				'events',
				'string_decoder',
				'querystring',
				'url',
				'assert',
				// Database drivers
				'better-sqlite3',
				'pg',
				'mysql2',
				'ioredis',
				// n8n specific that may have Node.js deps
				'ssh2',
				'nodemailer',
				'imap',
			],
		});

		console.log('\n✅ Bundling SUCCEEDED!\n');
		console.log(`Bundle size: ${(code.length / 1024).toFixed(2)} KB`);
		console.log(`Bundle preview (first 500 chars):\n`);
		console.log(code.substring(0, 500));
		console.log('...\n');

		// Check if the workflow function is in the bundle
		if (code.includes('executeN8nWorkflow')) {
			console.log('✅ executeN8nWorkflow function found in bundle');
		} else {
			console.log('❌ executeN8nWorkflow function NOT found in bundle');
		}

		if (code.includes('proxyActivities')) {
			console.log('✅ proxyActivities call found in bundle');
		} else {
			console.log('❌ proxyActivities call NOT found in bundle');
		}

		console.log('\n=== POC 8 Bundling Test PASSED ===');

		return true;
	} catch (error) {
		console.error('\n❌ Bundling FAILED!\n');
		console.error('Error:', error);

		if (error instanceof Error) {
			console.error('\nStack:', error.stack);

			// Try to extract useful info about what module failed
			const moduleMatch = error.message.match(/Cannot find module '([^']+)'/);
			if (moduleMatch) {
				console.log(`\nSuggestion: Add '${moduleMatch[1]}' to ignoreModules`);
			}
		}

		console.log('\n=== POC 8 Bundling Test FAILED ===');

		return false;
	}
}

// Run test
testBundling()
	.then((success) => {
		process.exit(success ? 0 : 1);
	})
	.catch((err) => {
		console.error('Test runner error:', err);
		process.exit(1);
	});
