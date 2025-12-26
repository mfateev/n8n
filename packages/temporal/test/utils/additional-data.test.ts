import { describe, it, expect, jest } from '@jest/globals';

import { buildAdditionalData } from '../../src/utils/additional-data';

describe('buildAdditionalData', () => {
	const mockCredentialsHelper = {
		getCredentials: jest.fn(),
		getDecrypted: jest.fn(),
		updateCredentials: jest.fn(),
	};

	const mockCredentialTypes = {
		getByName: jest.fn(),
		recognizes: jest.fn(),
	};

	const mockNodeTypes = {
		getByName: jest.fn(),
		getByNameAndVersion: jest.fn(),
		getKnownTypes: jest.fn().mockReturnValue({}),
	};

	it('should build additional data with all required properties', () => {
		const additionalData = buildAdditionalData({
			credentialsHelper: mockCredentialsHelper as never,
			credentialTypes: mockCredentialTypes as never,
			nodeTypes: mockNodeTypes as never,
			executionId: 'test-execution-123',
			userId: 'test-user',
		});

		expect(additionalData.credentialsHelper).toBe(mockCredentialsHelper);
		expect(additionalData.executionId).toBe('test-execution-123');
		expect(additionalData.userId).toBe('test-user');
		expect(additionalData.currentNodeExecutionIndex).toBe(0);
	});

	it('should generate execution ID if not provided', () => {
		const additionalData = buildAdditionalData({
			credentialsHelper: mockCredentialsHelper as never,
			credentialTypes: mockCredentialTypes as never,
			nodeTypes: mockNodeTypes as never,
		});

		expect(additionalData.executionId).toBeDefined();
		expect(additionalData.executionId).toMatch(/^temporal-\d+-[a-z0-9]+$/);
	});

	it('should throw error when executeWorkflow is called', async () => {
		const additionalData = buildAdditionalData({
			credentialsHelper: mockCredentialsHelper as never,
			credentialTypes: mockCredentialTypes as never,
			nodeTypes: mockNodeTypes as never,
		});

		await expect(
			additionalData.executeWorkflow({} as never, {} as never, {} as never),
		).rejects.toThrow('Sub-workflow execution');
	});

	it('should provide no-op setExecutionStatus', () => {
		const additionalData = buildAdditionalData({
			credentialsHelper: mockCredentialsHelper as never,
			credentialTypes: mockCredentialTypes as never,
			nodeTypes: mockNodeTypes as never,
		});

		// Should not throw
		expect(() => additionalData.setExecutionStatus?.('running')).not.toThrow();
	});

	it('should provide no-op sendDataToUI', () => {
		const additionalData = buildAdditionalData({
			credentialsHelper: mockCredentialsHelper as never,
			credentialTypes: mockCredentialTypes as never,
			nodeTypes: mockNodeTypes as never,
		});

		// Should not throw
		expect(() => additionalData.sendDataToUI?.('test', {})).not.toThrow();
	});

	it('should return undefined from getRunExecutionData', async () => {
		const additionalData = buildAdditionalData({
			credentialsHelper: mockCredentialsHelper as never,
			credentialTypes: mockCredentialTypes as never,
			nodeTypes: mockNodeTypes as never,
		});

		const result = await additionalData.getRunExecutionData?.('some-id');
		expect(result).toBeUndefined();
	});

	it('should include variables when provided', () => {
		const variables = { MY_VAR: 'test-value' };
		const additionalData = buildAdditionalData({
			credentialsHelper: mockCredentialsHelper as never,
			credentialTypes: mockCredentialTypes as never,
			nodeTypes: mockNodeTypes as never,
			variables,
		});

		expect(additionalData.variables).toEqual(variables);
	});

	it('should default variables to empty object when not provided', () => {
		const additionalData = buildAdditionalData({
			credentialsHelper: mockCredentialsHelper as never,
			credentialTypes: mockCredentialTypes as never,
			nodeTypes: mockNodeTypes as never,
		});

		expect(additionalData.variables).toEqual({});
	});

	it('should report task runner as unavailable', () => {
		const additionalData = buildAdditionalData({
			credentialsHelper: mockCredentialsHelper as never,
			credentialTypes: mockCredentialTypes as never,
			nodeTypes: mockNodeTypes as never,
		});

		const status = additionalData.getRunnerStatus?.('javascript');
		expect(status).toEqual({
			available: false,
			reason: expect.stringContaining('not available'),
		});
	});

	it('should throw error when startRunnerTask is called', async () => {
		const additionalData = buildAdditionalData({
			credentialsHelper: mockCredentialsHelper as never,
			credentialTypes: mockCredentialTypes as never,
			nodeTypes: mockNodeTypes as never,
		});

		await expect(
			additionalData.startRunnerTask(
				{} as never,
				'javascript',
				{} as never,
				{} as never,
				{} as never,
				{} as never,
				{} as never,
				{} as never,
				0,
				0,
				'TestNode',
				[],
				{} as never,
				'cli' as never,
				{} as never,
			),
		).rejects.toThrow('External task runner is not supported');
	});

	it('should provide no-op logAiEvent', () => {
		const additionalData = buildAdditionalData({
			credentialsHelper: mockCredentialsHelper as never,
			credentialTypes: mockCredentialTypes as never,
			nodeTypes: mockNodeTypes as never,
		});

		// Should not throw
		expect(() =>
			additionalData.logAiEvent('ai-messages-retrieved-from-memory', {
				msg: 'test',
				workflowName: 'Test',
				executionId: '123',
				nodeName: 'Node',
			}),
		).not.toThrow();
	});

	it('should have URL fields as empty strings', () => {
		const additionalData = buildAdditionalData({
			credentialsHelper: mockCredentialsHelper as never,
			credentialTypes: mockCredentialTypes as never,
			nodeTypes: mockNodeTypes as never,
		});

		expect(additionalData.restApiUrl).toBe('');
		expect(additionalData.instanceBaseUrl).toBe('');
		expect(additionalData.webhookBaseUrl).toBe('');
		expect(additionalData.webhookTestBaseUrl).toBe('');
		expect(additionalData.webhookWaitingBaseUrl).toBe('');
		expect(additionalData.formWaitingBaseUrl).toBe('');
	});

	it('should have secretsHelpers that return undefined/false', async () => {
		const additionalData = buildAdditionalData({
			credentialsHelper: mockCredentialsHelper as never,
			credentialTypes: mockCredentialTypes as never,
			nodeTypes: mockNodeTypes as never,
		});

		const secretsHelpers = (additionalData as unknown as { secretsHelpers: unknown })
			.secretsHelpers as {
			getSecret: (provider: string, name: string) => Promise<string | undefined>;
			hasSecret: (provider: string, name: string) => boolean;
			hasProvider: (provider: string) => boolean;
		};

		expect(await secretsHelpers.getSecret('provider', 'name')).toBeUndefined();
		expect(secretsHelpers.hasSecret('provider', 'name')).toBe(false);
		expect(secretsHelpers.hasProvider('provider')).toBe(false);
	});

	it('should use default userId when not provided', () => {
		const additionalData = buildAdditionalData({
			credentialsHelper: mockCredentialsHelper as never,
			credentialTypes: mockCredentialTypes as never,
			nodeTypes: mockNodeTypes as never,
		});

		expect(additionalData.userId).toBe('temporal-worker');
	});
});
