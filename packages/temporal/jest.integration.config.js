/**
 * Jest configuration for integration tests
 *
 * Integration tests require:
 * 1. Temporal test environment (@temporalio/testing)
 * 2. ESM module transformation for certain node_modules
 * 3. Longer timeouts for node loading and workflow execution
 *
 * Run with: pnpm test:integration
 *
 * Note: These tests may take 1-2 minutes due to node type loading.
 */

/** @type {import('jest').Config} */
module.exports = {
	testEnvironment: 'node',
	testMatch: ['**/test/integration/**/*.test.ts'],
	transform: {
		'^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.json' }],
	},
	// Transform ESM modules that Jest doesn't handle by default
	transformIgnorePatterns: ['node_modules/(?!(p-retry|is-network-error|@langchain|langchain)/)'],
	moduleFileExtensions: ['ts', 'js', 'json'],
	moduleNameMapper: {
		'^@/(.*)$': '<rootDir>/src/$1',
		'^@test/(.*)$': '<rootDir>/test/$1',
	},
	// Longer timeout for integration tests (2 minutes)
	testTimeout: 120000,
	collectCoverage: false,
	verbose: true,
};
