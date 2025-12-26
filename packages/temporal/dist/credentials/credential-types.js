'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.TemporalCredentialTypes = void 0;
class TemporalCredentialTypes {
	constructor(nodeTypes) {
		this.nodeTypes = nodeTypes;
		this.credentialTypes = new Map();
		this.knownCredentials = {};
		this.loaded = false;
	}
	loadAll() {
		if (this.loaded) {
			return;
		}
		this.knownCredentials = this.nodeTypes.getKnownCredentials();
		this.loaded = true;
	}
	recognizes(credentialType) {
		this.ensureLoaded();
		return credentialType in this.knownCredentials || this.credentialTypes.has(credentialType);
	}
	getByName(credentialType) {
		this.ensureLoaded();
		const loaded = this.credentialTypes.get(credentialType);
		if (loaded) {
			return loaded.type;
		}
		const knownInfo = this.knownCredentials[credentialType];
		if (!knownInfo) {
			throw new Error(`Unknown credential type: ${credentialType}`);
		}
		const loaderPackages = ['n8n-nodes-base', '@n8n/n8n-nodes-langchain'];
		for (const packageName of loaderPackages) {
			const loader = this.nodeTypes.getLoader(packageName);
			if (loader && credentialType in loader.known.credentials) {
				try {
					const loadedCred = loader.getCredential(credentialType);
					this.credentialTypes.set(credentialType, loadedCred);
					return loadedCred.type;
				} catch {
					continue;
				}
			}
		}
		throw new Error(`Could not load credential type: ${credentialType}`);
	}
	getSupportedNodes(type) {
		this.ensureLoaded();
		return this.knownCredentials[type]?.supportedNodes ?? [];
	}
	getParentTypes(typeName) {
		this.ensureLoaded();
		const extendsArr = this.knownCredentials[typeName]?.extends ?? [];
		if (extendsArr.length === 0) {
			return [];
		}
		const allParents = [...extendsArr];
		for (const parentType of extendsArr) {
			allParents.push(...this.getParentTypes(parentType));
		}
		return allParents;
	}
	getKnownTypes() {
		this.ensureLoaded();
		return Object.keys(this.knownCredentials);
	}
	ensureLoaded() {
		if (!this.loaded) {
			throw new Error('Credential types not loaded. Call loadAll() first.');
		}
	}
}
exports.TemporalCredentialTypes = TemporalCredentialTypes;
//# sourceMappingURL=credential-types.js.map
