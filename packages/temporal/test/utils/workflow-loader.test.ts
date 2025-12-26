import { describe, it, expect, beforeAll, afterAll } from '@jest/globals';
import * as fs from 'fs/promises';
import * as path from 'path';
import * as os from 'os';

import { loadWorkflowFromFile, findStartNode } from '../../src/utils/workflow-loader';

describe('Workflow Loader', () => {
	let tempDir: string;

	beforeAll(async () => {
		tempDir = await fs.mkdtemp(path.join(os.tmpdir(), 'temporal-test-'));
	});

	afterAll(async () => {
		await fs.rm(tempDir, { recursive: true, force: true });
	});

	describe('loadWorkflowFromFile', () => {
		it('should load a valid workflow file', async () => {
			const workflowJson = {
				name: 'Test Workflow',
				nodes: [
					{
						id: 'node-1',
						name: 'Start',
						type: 'n8n-nodes-base.manualTrigger',
						typeVersion: 1,
						position: [0, 0],
						parameters: {},
					},
				],
				connections: {},
			};

			const filePath = path.join(tempDir, 'valid-workflow.json');
			await fs.writeFile(filePath, JSON.stringify(workflowJson));

			const loaded = await loadWorkflowFromFile(filePath);

			expect(loaded.name).toBe('Test Workflow');
			expect(loaded.nodes).toHaveLength(1);
			expect(loaded.nodes[0].name).toBe('Start');
			expect(loaded.connections).toEqual({});
			expect(loaded.id).toMatch(/^workflow-valid-workflow-/);
			expect(loaded.filePath).toBe(filePath);
		});

		it('should use filename as name when name is missing', async () => {
			const workflowJson = {
				nodes: [
					{
						id: 'node-1',
						name: 'Start',
						type: 'n8n-nodes-base.manualTrigger',
						typeVersion: 1,
						position: [0, 0],
						parameters: {},
					},
				],
				connections: {},
			};

			const filePath = path.join(tempDir, 'my-unnamed-workflow.json');
			await fs.writeFile(filePath, JSON.stringify(workflowJson));

			const loaded = await loadWorkflowFromFile(filePath);

			expect(loaded.name).toBe('my-unnamed-workflow');
		});

		it('should throw error for non-existent file', async () => {
			const filePath = path.join(tempDir, 'does-not-exist.json');

			await expect(loadWorkflowFromFile(filePath)).rejects.toThrow('not found');
		});

		it('should throw error for invalid JSON', async () => {
			const filePath = path.join(tempDir, 'invalid.json');
			await fs.writeFile(filePath, 'not valid json {');

			await expect(loadWorkflowFromFile(filePath)).rejects.toThrow('Invalid JSON');
		});

		it('should throw error when nodes array is missing', async () => {
			const filePath = path.join(tempDir, 'no-nodes.json');
			await fs.writeFile(filePath, JSON.stringify({ connections: {} }));

			await expect(loadWorkflowFromFile(filePath)).rejects.toThrow('"nodes" array');
		});

		it('should throw error when connections object is missing', async () => {
			const filePath = path.join(tempDir, 'no-connections.json');
			await fs.writeFile(
				filePath,
				JSON.stringify({
					nodes: [{ name: 'Test', type: 'test' }],
				}),
			);

			await expect(loadWorkflowFromFile(filePath)).rejects.toThrow('"connections" object');
		});

		it('should throw error when node is missing type', async () => {
			const filePath = path.join(tempDir, 'node-no-type.json');
			await fs.writeFile(
				filePath,
				JSON.stringify({
					nodes: [{ name: 'Test' }],
					connections: {},
				}),
			);

			await expect(loadWorkflowFromFile(filePath)).rejects.toThrow('"type" string');
		});

		it('should throw error when node is missing name', async () => {
			const filePath = path.join(tempDir, 'node-no-name.json');
			await fs.writeFile(
				filePath,
				JSON.stringify({
					nodes: [{ type: 'n8n-nodes-base.set' }],
					connections: {},
				}),
			);

			await expect(loadWorkflowFromFile(filePath)).rejects.toThrow('"name" string');
		});

		it('should include optional fields when present', async () => {
			const workflowJson = {
				name: 'Full Workflow',
				nodes: [
					{
						id: '1',
						name: 'Start',
						type: 'n8n-nodes-base.manualTrigger',
						typeVersion: 1,
						position: [0, 0],
						parameters: {},
					},
				],
				connections: {},
				settings: { executionOrder: 'v1' },
				staticData: { lastRun: '2025-01-01' },
				pinData: { Start: [{ json: { test: true } }] },
			};

			const filePath = path.join(tempDir, 'full-workflow.json');
			await fs.writeFile(filePath, JSON.stringify(workflowJson));

			const loaded = await loadWorkflowFromFile(filePath);

			expect(loaded.settings).toEqual({ executionOrder: 'v1' });
			expect(loaded.staticData).toEqual({ lastRun: '2025-01-01' });
			expect(loaded.pinData).toBeDefined();
		});
	});

	describe('findStartNode', () => {
		it('should find manualTrigger node', () => {
			const nodes = [
				{
					id: '1',
					name: 'Set',
					type: 'n8n-nodes-base.set',
					typeVersion: 1,
					position: [100, 0] as [number, number],
					parameters: {},
				},
				{
					id: '2',
					name: 'Start',
					type: 'n8n-nodes-base.manualTrigger',
					typeVersion: 1,
					position: [0, 0] as [number, number],
					parameters: {},
				},
			];

			const startNode = findStartNode(nodes);

			expect(startNode?.name).toBe('Start');
			expect(startNode?.type).toBe('n8n-nodes-base.manualTrigger');
		});

		it('should find webhook trigger node', () => {
			const nodes = [
				{
					id: '1',
					name: 'Set',
					type: 'n8n-nodes-base.set',
					typeVersion: 1,
					position: [100, 0] as [number, number],
					parameters: {},
				},
				{
					id: '2',
					name: 'Webhook',
					type: 'n8n-nodes-base.webhookTrigger',
					typeVersion: 1,
					position: [0, 0] as [number, number],
					parameters: {},
				},
			];

			const startNode = findStartNode(nodes);

			expect(startNode?.name).toBe('Webhook');
		});

		it('should find start node type', () => {
			const nodes = [
				{
					id: '1',
					name: 'Set',
					type: 'n8n-nodes-base.set',
					typeVersion: 1,
					position: [100, 0] as [number, number],
					parameters: {},
				},
				{
					id: '2',
					name: 'Start',
					type: 'n8n-nodes-base.start',
					typeVersion: 1,
					position: [0, 0] as [number, number],
					parameters: {},
				},
			];

			const startNode = findStartNode(nodes);

			expect(startNode?.type).toBe('n8n-nodes-base.start');
		});

		it('should return first node as fallback', () => {
			const nodes = [
				{
					id: '1',
					name: 'Set 1',
					type: 'n8n-nodes-base.set',
					typeVersion: 1,
					position: [0, 0] as [number, number],
					parameters: {},
				},
				{
					id: '2',
					name: 'Set 2',
					type: 'n8n-nodes-base.set',
					typeVersion: 1,
					position: [100, 0] as [number, number],
					parameters: {},
				},
			];

			const startNode = findStartNode(nodes);

			expect(startNode?.name).toBe('Set 1');
		});

		it('should return undefined for empty nodes array', () => {
			const startNode = findStartNode([]);

			expect(startNode).toBeUndefined();
		});
	});
});
