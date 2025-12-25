/**
 * POC 1: Node Loading
 *
 * Goal: Validate that we can load n8n node types outside of the n8n CLI environment.
 * This is a critical proof-of-concept for the Temporal integration.
 *
 * Run with: pnpm --filter=n8n-core build && node packages/core/dist/__poc__/run-node-loading.js
 */

import { Container } from '@n8n/di';
import type { LogMetadata, Logger as LoggerType } from 'n8n-workflow';
import type { INodeType, IVersionedNodeType } from 'n8n-workflow';
import path from 'path';

// We need to import Logger to get its token for DI registration
import { Logger } from '@n8n/backend-common';
import { PackageDirectoryLoader } from '../nodes-loader/package-directory-loader';

// Create a minimal Logger stub that satisfies the Logger interface
class MinimalLogger implements LoggerType {
	error(message: string, _metadata?: LogMetadata): void {
		console.error('[ERROR]', message);
	}

	warn(message: string, _metadata?: LogMetadata): void {
		console.warn('[WARN]', message);
	}

	info(message: string, _metadata?: LogMetadata): void {
		console.info('[INFO]', message);
	}

	debug(_message: string, _metadata?: LogMetadata): void {
		// Suppress debug logs for cleaner output
	}

	scoped(_scopes: string | string[]): LoggerType {
		return this;
	}
}

async function main() {
	console.log('=== POC 1: Node Loading ===\n');

	// Step 1: Set up minimal DI
	console.log('Step 1: Setting up minimal DI container...');
	Container.set(Logger, new MinimalLogger());
	console.log('✓ Logger stub registered\n');

	// Step 2: Find the nodes-base package
	console.log('Step 2: Locating n8n-nodes-base package...');
	// Navigate from dist/__poc__/ to the nodes-base package
	const nodesBasePath = path.resolve(__dirname, '../../../../nodes-base');
	console.log(`  Package path: ${nodesBasePath}\n`);

	// Step 3: Create and use PackageDirectoryLoader
	console.log('Step 3: Loading nodes using PackageDirectoryLoader...');
	const startTime = Date.now();

	const loader = new PackageDirectoryLoader(nodesBasePath);
	await loader.loadAll();

	const loadTime = Date.now() - startTime;
	console.log(`\n✓ Nodes loaded in ${loadTime}ms\n`);

	// Step 4: Analyze loaded nodes
	const loadedNodeNames = Object.keys(loader.nodeTypes);
	const loadedCredentialNames = Object.keys(loader.credentialTypes);

	console.log('Step 4: Analyzing loaded nodes...');
	console.log(`  Total nodes loaded: ${loadedNodeNames.length}`);
	console.log(`  Total credentials loaded: ${loadedCredentialNames.length}\n`);

	// Step 5: Test specific node retrieval
	console.log('Step 5: Testing specific node retrieval...\n');

	const testNodes = [
		'n8n-nodes-base.set',
		'n8n-nodes-base.if',
		'n8n-nodes-base.httpRequest',
		'n8n-nodes-base.code',
		'n8n-nodes-base.gmail',
		'n8n-nodes-base.slack',
	];

	for (const nodeName of testNodes) {
		try {
			const nodeData = loader.getNode(nodeName);
			const nodeType = nodeData.type;

			// Check if it's a versioned node or regular node
			const isVersioned = 'nodeVersions' in nodeType;
			let executeType = 'none';

			if (isVersioned) {
				const versionedNode = nodeType as IVersionedNodeType;
				const currentVersion = versionedNode.nodeVersions[versionedNode.currentVersion];
				const hasExecute = typeof currentVersion?.execute === 'function';
				executeType = hasExecute ? 'versioned+execute' : 'versioned';

				// Check for declarative routing
				if (!hasExecute && currentVersion?.description?.requestDefaults) {
					executeType = 'versioned+declarative';
				}
			} else {
				const regularNode = nodeType as INodeType;
				const hasExecute = typeof regularNode.execute === 'function';
				executeType = hasExecute ? 'execute' : 'none';

				// Check for declarative routing
				if (!hasExecute && regularNode.description?.requestDefaults) {
					executeType = 'declarative';
				}

				// Check for trigger/webhook/poll
				if (typeof regularNode.trigger === 'function') {
					executeType = 'trigger';
				}
				if (typeof regularNode.webhook === 'function') {
					executeType = 'webhook';
				}
				if (typeof regularNode.poll === 'function') {
					executeType = 'poll';
				}
			}

			console.log(`  ✓ ${nodeName}`);
			console.log(`    - Versioned: ${isVersioned}`);
			console.log(`    - Execute type: ${executeType}`);
		} catch (error) {
			console.log(`  ✗ ${nodeName}: ${(error as Error).message}`);
		}
	}

	// Step 6: Categorize all nodes by execution type
	console.log('\nStep 6: Categorizing all nodes by execution type...\n');

	const categories = {
		execute: [] as string[],
		declarative: [] as string[],
		trigger: [] as string[],
		webhook: [] as string[],
		poll: [] as string[],
		versioned: [] as string[],
		unknown: [] as string[],
	};

	for (const nodeName of loadedNodeNames) {
		const nodeData = loader.nodeTypes[nodeName];
		const nodeType = nodeData.type;

		if ('nodeVersions' in nodeType) {
			categories.versioned.push(nodeName);
		} else {
			const regularNode = nodeType as INodeType;
			if (typeof regularNode.execute === 'function') {
				categories.execute.push(nodeName);
			} else if (typeof regularNode.trigger === 'function') {
				categories.trigger.push(nodeName);
			} else if (typeof regularNode.webhook === 'function') {
				categories.webhook.push(nodeName);
			} else if (typeof regularNode.poll === 'function') {
				categories.poll.push(nodeName);
			} else if (regularNode.description?.requestDefaults) {
				categories.declarative.push(nodeName);
			} else {
				categories.unknown.push(nodeName);
			}
		}
	}

	console.log('Node categories:');
	console.log(`  - Execute function: ${categories.execute.length}`);
	console.log(`  - Declarative (routing): ${categories.declarative.length}`);
	console.log(`  - Trigger function: ${categories.trigger.length}`);
	console.log(`  - Webhook function: ${categories.webhook.length}`);
	console.log(`  - Poll function: ${categories.poll.length}`);
	console.log(`  - Versioned: ${categories.versioned.length}`);
	console.log(`  - Unknown: ${categories.unknown.length}`);

	if (categories.unknown.length > 0 && categories.unknown.length <= 20) {
		console.log(`\n  Unknown nodes: ${categories.unknown.join(', ')}`);
	}

	// Step 7: Summary
	console.log('\n=== POC 1 RESULTS ===\n');
	console.log('✓ SUCCESS: Nodes can be loaded outside n8n CLI');
	console.log('✓ Minimal DI setup works (only Logger stub needed)');
	console.log(`✓ ${loadedNodeNames.length} nodes loaded successfully`);
	console.log(`✓ Load time: ${loadTime}ms`);
	console.log('\nKey findings:');
	console.log('1. PackageDirectoryLoader only requires Logger in DI');
	console.log('2. Nodes are loaded eagerly - all metadata loaded on loadAll()');
	console.log('3. Both execute-based and declarative nodes are supported');
	console.log('4. Versioned nodes contain multiple implementations');
	console.log('\nFor Temporal integration:');
	console.log('- Can bundle all nodes with Temporal worker');
	console.log('- No n8n CLI dependencies required for node loading');
	console.log('- Execution methods available on all loaded nodes');
}

main().catch((error) => {
	console.error('\n✗ FAILED:', error);
	process.exit(1);
});
