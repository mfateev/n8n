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
exports.JsonFileCredentialStore = void 0;
const fs = __importStar(require('fs/promises'));
const path = __importStar(require('path'));
class JsonFileCredentialStore {
	constructor(filePath) {
		this.filePath = filePath;
		this.credentials = new Map();
		this.loaded = false;
	}
	async load() {
		try {
			const absolutePath = path.resolve(this.filePath);
			const content = await fs.readFile(absolutePath, 'utf-8');
			const parsed = JSON.parse(content);
			this.credentials.clear();
			for (const [id, credential] of Object.entries(parsed)) {
				this.credentials.set(id, {
					id,
					name: credential.name,
					type: credential.type,
					data: credential.data,
				});
			}
			this.loaded = true;
		} catch (error) {
			if (error.code === 'ENOENT') {
				this.credentials.clear();
				this.loaded = true;
				return;
			}
			throw new Error(`Failed to load credentials from ${this.filePath}: ${error.message}`);
		}
	}
	ensureLoaded() {
		if (!this.loaded) {
			throw new Error('Credential store not loaded. Call load() first.');
		}
	}
	get(credentialId) {
		this.ensureLoaded();
		return this.credentials.get(credentialId);
	}
	getByIdAndType(credentialId, type) {
		this.ensureLoaded();
		const credential = this.credentials.get(credentialId);
		if (credential && credential.type === type) {
			return credential;
		}
		return undefined;
	}
	getAll() {
		this.ensureLoaded();
		return new Map(this.credentials);
	}
	async update(credentialId, data) {
		this.ensureLoaded();
		const existing = this.credentials.get(credentialId);
		if (!existing) {
			throw new Error(`Credential not found: ${credentialId}`);
		}
		this.credentials.set(credentialId, {
			...existing,
			data,
		});
		await this.persist();
	}
	has(credentialId) {
		this.ensureLoaded();
		return this.credentials.has(credentialId);
	}
	async persist() {
		const obj = {};
		for (const [id, credential] of this.credentials) {
			obj[id] = {
				name: credential.name,
				type: credential.type,
				data: credential.data,
			};
		}
		const absolutePath = path.resolve(this.filePath);
		await fs.mkdir(path.dirname(absolutePath), { recursive: true });
		await fs.writeFile(absolutePath, JSON.stringify(obj, null, 2), 'utf-8');
	}
	getFilePath() {
		return this.filePath;
	}
}
exports.JsonFileCredentialStore = JsonFileCredentialStore;
//# sourceMappingURL=json-file-store.js.map
