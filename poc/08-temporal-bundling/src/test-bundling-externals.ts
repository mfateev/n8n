/**
 * POC 8: Externals-based Bundling Test
 *
 * Uses webpack externals function for aggressive module exclusion.
 */

import { bundleWorkflowCode } from '@temporalio/worker';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

// Node.js built-in module names
const NODE_BUILTINS = new Set([
	'fs', 'fs/promises', 'path', 'os', 'crypto', 'http', 'https', 'http2',
	'net', 'tls', 'dns', 'stream', 'stream/web', 'stream/promises', 'zlib',
	'child_process', 'worker_threads', 'cluster', 'dgram', 'readline',
	'readline/promises', 'repl', 'vm', 'v8', 'perf_hooks', 'async_hooks',
	'trace_events', 'inspector', 'inspector/promises', 'buffer', 'util',
	'util/types', 'events', 'string_decoder', 'querystring', 'url',
	'assert', 'assert/strict', 'timers', 'timers/promises', 'console',
	'constants', 'process', 'module', 'diagnostics_channel', 'wasi',
	'punycode', 'tty', 'sys', 'domain',
]);

// Module prefixes to externalize (match any import starting with these)
const EXTERNAL_PREFIXES = [
	// Database
	'better-sqlite3', 'pg', 'mysql2', 'ioredis', 'redis', 'mongodb', 'typeorm',
	'sqlite3', 'oracledb', 'tedious', 'mssql', 'knex', 'sequelize', 'prisma',
	// Network
	'ssh2', 'nodemailer', 'imap', 'axios', 'node-fetch', 'got', 'request',
	'form-data', 'formidable', 'busboy', 'undici', 'superagent',
	// Sentry
	'@sentry/',
	// n8n packages we don't need
	'@n8n/tournament', 'n8n-nodes-base', '@n8n/n8n-nodes-langchain',
	// Expression libs
	'luxon', 'moment', 'date-fns', 'dayjs',
	'lodash', 'underscore', 'ramda',
	'jmespath', 'jsonpath',
	// XML/HTML
	'xml2js', 'fast-xml-parser', 'xmlbuilder', 'sax', 'xml-js',
	'cheerio', 'htmlparser2', 'jsdom', 'parse5', 'domhandler', 'domutils',
	// Data manipulation
	'papaparse', 'xlsx', 'exceljs', 'csv-parse', 'csv-stringify',
	// Crypto
	'crypto-js', 'bcrypt', 'jsonwebtoken', 'node-forge',
	// File handling
	'chokidar', 'glob', 'fast-glob', 'rimraf', 'mkdirp', 'graceful-fs', 'fs-extra',
	'tmp', 'tmp-promise',
	// Logging
	'pino', 'winston', 'bunyan', 'log4js',
	// Validation
	'ajv', 'zod', 'yup', 'joi', 'validator',
	// Misc heavy libs
	'sharp', 'canvas', 'jimp', 'image-size',
	'puppeteer', 'playwright',
	'handlebars', 'ejs', 'pug', 'mustache',
	'uuid', 'nanoid', 'shortid',
	'numeral', 'bignumber.js', 'decimal.js',
	// Web frameworks (shouldn't be needed)
	'express', 'koa', 'fastify', 'hapi',
	'body-parser', 'cookie-parser', 'cors', 'helmet',
	// Testing
	'jest', 'mocha', 'chai', 'vitest', 'sinon',
	// Dev tools
	'typescript', 'prettier', 'eslint',
	'source-map', 'source-map-support',
	// n8n backend-common (loads many deps)
	'@n8n/backend-common',
	'@n8n/config',
	'convict',
];

// Exact module names to externalize
const EXTERNAL_EXACT = new Set([
	'n8n',
	'dotenv',
	'cross-spawn', 'execa',
	'eventemitter2', 'eventemitter3',
	'ws', 'socket.io', 'socket.io-client',
	'qs', 'query-string',
	'mime-types', 'file-type', 'mime',
	'iconv-lite', 'encoding',
	'semver',
	'callsites',
]);

async function testExternalsBundling() {
	console.log('=== POC 8: Externals-based Bundling Test ===\n');

	console.log('Using externals function for aggressive pattern matching...\n');

	try {
		const workflowsPath = join(__dirname, 'workflows', 'n8n-workflow-minimal.ts');

		console.log(`Bundling workflow from: ${workflowsPath}\n`);

		const startTime = Date.now();
		let externalizedCount = 0;

		const { code } = await bundleWorkflowCode({
			workflowsPath,
			webpackConfigHook: (config) => {
				// Use externals as a function for flexible matching
				const originalExternals = config.externals;

				// Build externals array, filtering out undefined
			const externalsArray = Array.isArray(originalExternals)
				? originalExternals.filter((e): e is NonNullable<typeof e> => e != null)
				: originalExternals ? [originalExternals] : [];

			config.externals = [
					// Keep original externals
					...externalsArray,
					// Add our custom externals function
					({ request }: { request?: string }, callback: (err?: null, result?: string) => void) => {
						if (!request) {
							return callback();
						}

						// Handle node: prefixed imports
						if (request.startsWith('node:')) {
							const moduleName = request.slice(5);
							if (NODE_BUILTINS.has(moduleName) || NODE_BUILTINS.has(moduleName.split('/')[0])) {
								externalizedCount++;
								return callback(null, `commonjs ${request}`);
							}
						}

						// Handle regular Node.js builtins
						const baseName = request.split('/')[0];
						if (NODE_BUILTINS.has(baseName)) {
							externalizedCount++;
							return callback(null, `commonjs ${request}`);
						}

						// Handle exact matches
						if (EXTERNAL_EXACT.has(request) || EXTERNAL_EXACT.has(baseName)) {
							externalizedCount++;
							return callback(null, `commonjs ${request}`);
						}

						// Handle prefix matches
						for (const prefix of EXTERNAL_PREFIXES) {
							if (request === prefix || request.startsWith(prefix + '/') || request.startsWith(prefix)) {
								externalizedCount++;
								return callback(null, `commonjs ${request}`);
							}
						}

						// Not externalized
						callback();
					},
				];

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

		console.log(`✅ Bundling SUCCEEDED in ${elapsed}ms!`);
		console.log(`   Externalized ~${externalizedCount} module requests\n`);
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

		if (allFound) {
			console.log('\n=== POC 8 Externals Bundling Test PASSED ===');
		} else {
			console.log('\n=== POC 8 Externals Bundling Test PARTIAL - some classes missing ===');
		}

		return true;
	} catch (error) {
		console.error('\n❌ Bundling FAILED!\n');

		if (error instanceof Error) {
			console.error('Error:', error.message);
		} else {
			console.error('Error:', error);
		}

		return false;
	}
}

testExternalsBundling()
	.then((success) => {
		process.exit(success ? 0 : 1);
	})
	.catch((err) => {
		console.error('Test runner error:', err);
		process.exit(1);
	});
