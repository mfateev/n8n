import { defineConfig, globalIgnores } from 'eslint/config';
import { nodeConfig } from '@n8n/eslint-config/node';

export default defineConfig(
	nodeConfig,
	globalIgnores(['dist/*', 'coverage/*', 'jest.integration.config.js']),
	{
		rules: {
			'unicorn/filename-case': ['error', { case: 'kebabCase' }],
		},
	},
	{
		files: ['**/*.test.ts', '**/test/**/*.ts', '**/__test__/**/*.ts', '**/__tests__/**/*.ts'],
		rules: {
			'@typescript-eslint/no-unsafe-assignment': 'warn',
			'@typescript-eslint/no-unsafe-argument': 'warn',
			'@typescript-eslint/no-unsafe-call': 'warn',
			'@typescript-eslint/no-unsafe-return': 'warn',
		},
	},
);
