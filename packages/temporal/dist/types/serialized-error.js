'use strict';
Object.defineProperty(exports, '__esModule', { value: true });
exports.isSerializedError = isSerializedError;
function isSerializedError(value) {
	return (
		typeof value === 'object' &&
		value !== null &&
		'__type' in value &&
		typeof value.__type === 'string'
	);
}
//# sourceMappingURL=serialized-error.js.map
