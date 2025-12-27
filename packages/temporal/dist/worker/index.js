'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.clearWorkerContext =
	exports.isWorkerContextInitialized =
	exports.initializeWorkerContext =
	exports.getWorkerContext =
	exports.createWorkerInstance =
	exports.runWorker =
		void 0;
var worker_1 = require('./worker');
Object.defineProperty(exports, 'runWorker', {
	enumerable: true,
	get: function () {
		return worker_1.runWorker;
	},
});
Object.defineProperty(exports, 'createWorkerInstance', {
	enumerable: true,
	get: function () {
		return worker_1.createWorkerInstance;
	},
});
var context_1 = require('./context');
Object.defineProperty(exports, 'getWorkerContext', {
	enumerable: true,
	get: function () {
		return context_1.getWorkerContext;
	},
});
Object.defineProperty(exports, 'initializeWorkerContext', {
	enumerable: true,
	get: function () {
		return context_1.initializeWorkerContext;
	},
});
Object.defineProperty(exports, 'isWorkerContextInitialized', {
	enumerable: true,
	get: function () {
		return context_1.isWorkerContextInitialized;
	},
});
Object.defineProperty(exports, 'clearWorkerContext', {
	enumerable: true,
	get: function () {
		return context_1.clearWorkerContext;
	},
});
//# sourceMappingURL=index.js.map
