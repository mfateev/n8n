'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.TemporalNodeTypes = void 0;
const n8n_workflow_1 = require('n8n-workflow');
const loader_1 = require('./loader');
class TemporalNodeTypes {
	constructor(options = {}) {
		this.loaders = new Map();
		this.known = { nodes: {}, credentials: {} };
		this.loaded = false;
		this.packages = options.packages ?? loader_1.DEFAULT_NODE_PACKAGES;
		this.excludeNodes = options.excludeNodes ?? [];
		this.includeNodes = options.includeNodes ?? [];
	}
	async loadAll() {
		if (this.loaded) {
			return;
		}
		for (const packageName of this.packages) {
			try {
				const packagePath = (0, loader_1.findPackagePath)(packageName);
				const { loader } = await (0, loader_1.loadNodesFromPackage)(
					packagePath,
					this.excludeNodes,
					this.includeNodes,
				);
				this.loaders.set(loader.packageName, loader);
				for (const [nodeType, info] of Object.entries(loader.known.nodes)) {
					const fullName = `${loader.packageName}.${nodeType}`;
					this.known.nodes[fullName] = info;
				}
				for (const [credType, info] of Object.entries(loader.known.credentials)) {
					this.known.credentials[credType] = info;
				}
			} catch (error) {
				console.warn(`Failed to load nodes from ${packageName}: ${error.message}`);
			}
		}
		this.loaded = true;
	}
	getByName(nodeType) {
		this.ensureLoaded();
		const [packageName, shortName] = this.parseNodeType(nodeType);
		const loader = this.loaders.get(packageName);
		if (!loader) {
			throw new Error(`Unknown node package: ${packageName}`);
		}
		try {
			return loader.getNode(shortName).type;
		} catch {
			throw new Error(`Unknown node type: ${nodeType}`);
		}
	}
	getByNameAndVersion(nodeType, version) {
		const node = this.getByName(nodeType);
		return n8n_workflow_1.NodeHelpers.getVersionedNodeType(node, version);
	}
	getKnownTypes() {
		this.ensureLoaded();
		return this.known.nodes;
	}
	getKnownCredentials() {
		this.ensureLoaded();
		return this.known.credentials;
	}
	hasNode(nodeType) {
		this.ensureLoaded();
		return nodeType in this.known.nodes;
	}
	getLoader(packageName) {
		return this.loaders.get(packageName);
	}
	parseNodeType(nodeType) {
		const lastDotIndex = nodeType.lastIndexOf('.');
		if (nodeType.startsWith('@')) {
			const firstDot = nodeType.indexOf('.');
			if (firstDot !== -1 && firstDot !== lastDotIndex) {
				return [nodeType.substring(0, lastDotIndex), nodeType.substring(lastDotIndex + 1)];
			}
		}
		if (lastDotIndex === -1) {
			throw new Error(`Invalid node type format: ${nodeType}`);
		}
		return [nodeType.substring(0, lastDotIndex), nodeType.substring(lastDotIndex + 1)];
	}
	ensureLoaded() {
		if (!this.loaded) {
			throw new Error('Node types not loaded. Call loadAll() first.');
		}
	}
}
exports.TemporalNodeTypes = TemporalNodeTypes;
//# sourceMappingURL=node-types.js.map
