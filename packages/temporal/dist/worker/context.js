'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.getWorkerContext = getWorkerContext;
exports.initializeWorkerContext = initializeWorkerContext;
exports.isWorkerContextInitialized = isWorkerContextInitialized;
exports.clearWorkerContext = clearWorkerContext;
let workerContext;
function getWorkerContext() {
	if (!workerContext) {
		throw new Error(
			'Worker context not initialized. ' +
				'Call initializeWorkerContext() during worker startup before executing activities.',
		);
	}
	return workerContext;
}
function initializeWorkerContext(context) {
	if (workerContext) {
		console.warn(
			'Worker context already initialized. ' +
				'Re-initialization may indicate a bug - context should only be set once.',
		);
	}
	workerContext = context;
}
function isWorkerContextInitialized() {
	return workerContext !== undefined;
}
function clearWorkerContext() {
	workerContext = undefined;
}
//# sourceMappingURL=context.js.map
