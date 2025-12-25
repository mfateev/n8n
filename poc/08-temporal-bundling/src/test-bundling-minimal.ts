/**
 * POC 8: Minimal Bundling Test
 *
 * Test bundling with aggressive module ignoring to reduce bundle size.
 * Many libraries (luxon, lodash, xml parsers) are only needed for expression
 * evaluation and node execution, which happen in Activities, not the Workflow.
 */

import { bundleWorkflowCode } from '@temporalio/worker';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

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

// Modules to ignore - aggressive list
const IGNORE_MODULES = [
	// Node.js built-ins (both forms)
	...NODE_BUILTINS,
	...NODE_BUILTINS.map((m) => `node:${m}`),

	// ===== Database drivers =====
	'better-sqlite3', 'pg', 'pg-native', 'mysql2', 'ioredis', 'redis',
	'mongodb', 'typeorm', 'sqlite3', 'oracledb', 'tedious', 'mssql',

	// ===== Network/HTTP =====
	'ssh2', 'nodemailer', 'imap', 'axios', 'node-fetch', 'got', 'request',
	'form-data', 'formidable', 'busboy', 'undici', 'https-proxy-agent',
	'http-proxy-agent', 'socks-proxy-agent', 'proxy-agent',

	// ===== File system =====
	'chokidar', 'glob', 'fast-glob', 'rimraf', 'mkdirp', 'graceful-fs',
	'fs-extra', 'tmp', 'tmp-promise',

	// ===== Process =====
	'cross-spawn', 'execa', 'shelljs',

	// ===== Crypto =====
	'bcrypt', 'bcryptjs', 'jsonwebtoken', 'crypto-js',

	// ===== Native modules =====
	'canvas', 'sharp', 'node-gyp', 'prebuild-install',

	// ===== Sentry/Monitoring =====
	'@sentry/node', '@sentry/node-native', '@sentry-internal/node-native-stacktrace',
	'pino', 'winston', 'bunyan',

	// ===== Express/Web =====
	'express', 'body-parser', 'cookie-parser', 'cors', 'helmet',
	'compression', 'serve-static',

	// ===== n8n packages not needed for orchestration =====
	'@n8n/tournament',        // Expression sandbox - handled in activities
	'n8n',                    // CLI reference
	'n8n-nodes-base',         // Node implementations - loaded in activities
	'@n8n/n8n-nodes-langchain', // AI nodes - loaded in activities

	// ===== Expression evaluation libs (used in activities) =====
	'luxon',                  // DateTime handling
	'moment', 'moment-timezone',
	'lodash', 'lodash-es',    // Utility functions
	'jmespath',               // JSON path queries
	'jsonpath', 'jsonpath-plus',

	// ===== XML/HTML parsing (used in activities) =====
	'xml2js', 'fast-xml-parser', 'xmlbuilder', 'xmlbuilder2',
	'cheerio', 'htmlparser2', 'domhandler', 'domutils', 'dom-serializer',
	'css-select', 'css-what', 'nth-check',

	// ===== Data transformation (used in activities) =====
	'papaparse', 'xlsx', 'exceljs',
	'flat', 'deep-equal', 'deep-diff',
	'object-hash', 'md5', 'uuid',

	// ===== Misc =====
	'dotenv', 'node-cron', 'cron-parser',
	'ws', 'socket.io', 'socket.io-client',
	'qs', 'query-string',
	'mime-types', 'file-type',
	'iconv-lite', 'encoding',
	'natural-orderby', 'natural-compare',
	'pretty-bytes', 'bytes',
	'semver',
	'eventemitter2',

	// ===== Backend-common deps not needed =====
	'@n8n/config',            // Server config - not needed in workflow
	'convict',                // Config parsing
	'callsites',

	// ===== Testing libs that might get pulled in =====
	'jest', 'jest-mock', 'jest-mock-extended',
	'vitest', 'mocha', 'chai',

	// ===== Individual lodash imports =====
	'lodash/get', 'lodash/set', 'lodash/merge', 'lodash/cloneDeep',
	'lodash/isEqual', 'lodash/isEmpty', 'lodash/isObject', 'lodash/isArray',
	'lodash/pick', 'lodash/omit', 'lodash/mapValues', 'lodash/groupBy',
	'lodash/sortBy', 'lodash/uniq', 'lodash/flatten', 'lodash/compact',
	'lodash/intersection', 'lodash/difference', 'lodash/union',
	'lodash/debounce', 'lodash/throttle', 'lodash/memoize',

	// ===== More n8n-core internals we don't need =====
	// Binary data handling - done in activities
	'@n8n/backend-common',
	// Node loaders - done in activities
	'n8n-core/dist/nodes-loader',
	// Credentials - done in activities
	'n8n-core/dist/credentials',
	// Encryption - done in activities
	'n8n-core/dist/encryption',
	// Binary data - done in activities
	'n8n-core/dist/binary-data',

	// ===== More expression libs =====
	'date-fns', 'date-fns-tz',
	'numeral',
	'validator',
	'zod',

	// ===== Source maps =====
	'source-map', 'source-map-support',

	// ===== Date/Time libraries (used in activities for expressions) =====
	'luxon',
	'@js-joda/core', '@js-joda/timezone',

	// ===== XML/HTML (used in activities) =====
	'xml2js', 'sax',
	'htmlparser2', 'domhandler', 'domutils', 'dom-serializer',
	'parse5', 'parse5-htmlparser2-tree-adapter',

	// ===== JSON manipulation (used in activities) =====
	'jsdom', 'nwsapi', 'tough-cookie',
	'ajv', 'ajv-formats',

	// ===== n8n internal modules not needed =====
	'@n8n/di',  // DI container - orchestration doesn't need it
	'@n8n/constants',  // Constants can be inlined
	'@n8n/errors',  // Error handling done in activities
];

async function testMinimalBundling() {
	console.log('=== POC 8: Minimal Bundling Test ===\n');

	console.log('Testing reduced bundle size with aggressive module ignoring...\n');
	console.log(`Ignoring ${IGNORE_MODULES.length} modules\n`);

	try {
		const workflowsPath = join(__dirname, 'workflows', 'n8n-workflow-minimal.ts');

		console.log(`Bundling workflow from: ${workflowsPath}`);
		console.log('This may take a while...\n');

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

		console.log(`\n✅ Bundling SUCCEEDED in ${elapsed}ms!\n`);
		console.log(`Bundle size: ${sizeMB.toFixed(2)} MB`);

		// Check what's in the bundle
		const checks = [
			{ name: 'WorkflowExecute', pattern: 'WorkflowExecute' },
			{ name: 'Workflow class', pattern: 'class Workflow' },
			{ name: 'NodeHelpers', pattern: 'NodeHelpers' },
			{ name: 'executeN8nWorkflowMinimal', pattern: 'executeN8nWorkflowMinimal' },
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

		// Check what's NOT in the bundle (should be ignored)
		const shouldNotInclude = [
			{ name: 'luxon', pattern: 'DateTime.fromISO' },
			{ name: 'lodash', pattern: '_.get(' },
			{ name: 'xml2js', pattern: 'xml2js' },
			{ name: 'cheerio', pattern: 'cheerio' },
		];

		console.log('\nVerifying ignored modules:');
		for (const check of shouldNotInclude) {
			if (!code.includes(check.pattern)) {
				console.log(`  ✅ ${check.name} NOT included (good)`);
			} else {
				console.log(`  ⚠️  ${check.name} might be included`);
			}
		}

		console.log('\n=== POC 8 Minimal Bundling Test PASSED ===');

		return true;
	} catch (error) {
		console.error('\n❌ Bundling FAILED!\n');

		if (error instanceof Error) {
			console.error('Error:', error.message);

			const moduleMatch = error.message.match(/Cannot find module '([^']+)'/);
			if (moduleMatch) {
				console.log(`\n💡 Suggestion: Add '${moduleMatch[1]}' to ignoreModules`);
			}

			console.error('\nStack:', error.stack);
		} else {
			console.error('Error:', error);
		}

		console.log('\n=== POC 8 Minimal Bundling Test FAILED ===');

		return false;
	}
}

// Run test
testMinimalBundling()
	.then((success) => {
		process.exit(success ? 0 : 1);
	})
	.catch((err) => {
		console.error('Test runner error:', err);
		process.exit(1);
	});
