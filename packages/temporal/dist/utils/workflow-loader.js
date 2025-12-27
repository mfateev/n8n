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
exports.loadWorkflowFromFile = loadWorkflowFromFile;
exports.findStartNode = findStartNode;
const fs = __importStar(require('fs/promises'));
const path = __importStar(require('path'));
async function loadWorkflowFromFile(filePath) {
	const absolutePath = path.resolve(filePath);
	let content;
	try {
		content = await fs.readFile(absolutePath, 'utf-8');
	} catch (error) {
		if (error.code === 'ENOENT') {
			throw new Error(`Workflow file not found: ${absolutePath}`);
		}
		throw new Error(`Failed to read workflow file: ${error.message}`);
	}
	let parsed;
	try {
		parsed = JSON.parse(content);
	} catch (error) {
		throw new Error(`Invalid JSON in workflow file: ${error.message}`);
	}
	const workflow = validateWorkflowDefinition(parsed, absolutePath);
	const id = generateWorkflowId(absolutePath);
	const name = workflow.name ?? path.basename(filePath, '.json');
	return {
		id,
		name,
		nodes: workflow.nodes,
		connections: workflow.connections,
		settings: workflow.settings,
		staticData: workflow.staticData,
		pinData: workflow.pinData,
		filePath: absolutePath,
	};
}
function validateWorkflowDefinition(parsed, filePath) {
	if (typeof parsed !== 'object' || parsed === null) {
		throw new Error(`Workflow file must contain a JSON object: ${filePath}`);
	}
	const obj = parsed;
	if (!Array.isArray(obj.nodes)) {
		throw new Error(`Workflow must have a "nodes" array: ${filePath}`);
	}
	for (let i = 0; i < obj.nodes.length; i++) {
		const node = obj.nodes[i];
		if (!node.type || typeof node.type !== 'string') {
			throw new Error(`Node at index ${i} must have a "type" string: ${filePath}`);
		}
		if (!node.name || typeof node.name !== 'string') {
			throw new Error(`Node at index ${i} must have a "name" string: ${filePath}`);
		}
	}
	if (typeof obj.connections !== 'object' || obj.connections === null) {
		throw new Error(`Workflow must have a "connections" object: ${filePath}`);
	}
	return {
		name: typeof obj.name === 'string' ? obj.name : undefined,
		nodes: obj.nodes,
		connections: obj.connections,
		settings: obj.settings,
		staticData: obj.staticData,
		pinData: obj.pinData,
	};
}
function generateWorkflowId(filePath) {
	const basename = path.basename(filePath, '.json');
	const hash = simpleHash(filePath);
	return `workflow-${basename}-${hash}`;
}
function simpleHash(str) {
	let hash = 0;
	for (let i = 0; i < str.length; i++) {
		const char = str.charCodeAt(i);
		hash = (hash << 5) - hash + char;
		hash = hash & hash;
	}
	return Math.abs(hash).toString(36).substring(0, 8);
}
function findStartNode(nodes) {
	const triggerNode = nodes.find(
		(node) =>
			node.type.includes('Trigger') ||
			node.type.includes('trigger') ||
			node.type === 'n8n-nodes-base.start',
	);
	if (triggerNode) {
		return triggerNode;
	}
	return nodes[0];
}
//# sourceMappingURL=workflow-loader.js.map
