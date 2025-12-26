/** @type {import('jest').Config} */
module.exports = {
	testEnvironment: 'node',
	testMatch: ['**/test/**/*.test.ts'],
	transform: {
		'^.+\\.ts$': ['ts-jest', { tsconfig: 'tsconfig.json' }],
	},
	moduleFileExtensions: ['ts', 'js', 'json'],
	moduleNameMapper: {
		'^@/(.*)$': '<rootDir>/src/$1',
		'^@test/(.*)$': '<rootDir>/test/$1',
	},
	collectCoverage: false,
	coverageDirectory: 'coverage',
	coverageReporters: ['text', 'lcov'],
	verbose: true,
};
