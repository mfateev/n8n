/**
 * Workflow Completion Tracker
 *
 * Tracks workflow completions using Temporal Sinks.
 * Used for exit-on-complete mode in testing.
 *
 * Sinks execute at the end of each workflow activation, right before
 * returning a completion response to the Core SDK. This makes them
 * ideal for tracking workflow completions and failures.
 */

import type { InjectedSinks } from '@temporalio/worker';
import type { WorkflowInfo } from '@temporalio/workflow';

/**
 * Sink function type for completion tracking
 */
export type CompletionStatus = 'success' | 'failure' | 'error';

/**
 * Options for the completion tracker
 */
export interface CompletionTrackerOptions {
	/** Number of completions to wait for before resolving */
	targetCompletions: number;
	/** Callback when target is reached */
	onTargetReached: () => void;
	/** Optional logger */
	logger?: {
		debug: (message: string, context?: Record<string, unknown>) => void;
		info: (message: string, context?: Record<string, unknown>) => void;
	};
}

/**
 * Create completion tracker sinks for the worker
 *
 * @param options - Tracker configuration
 * @returns InjectedSinks to pass to Worker.create()
 */
export function createCompletionTrackerSinks(
	options: CompletionTrackerOptions,
): InjectedSinks<never> {
	let completionCount = 0;
	const { targetCompletions, onTargetReached, logger } = options;

	return {
		completionTracker: {
			trackCompletion: {
				fn: (workflowInfo: WorkflowInfo, status: CompletionStatus) => {
					completionCount++;
					logger?.debug('Workflow task completed', {
						workflowId: workflowInfo.workflowId,
						runId: workflowInfo.runId,
						status,
						completionCount,
						targetCompletions,
					});

					if (completionCount >= targetCompletions) {
						logger?.info('Target completions reached', {
							completionCount,
							targetCompletions,
						});
						onTargetReached();
					}
				},
			},
		},
	} as InjectedSinks<never>;
}

/**
 * Sink function names for use in workflow code
 */
export const COMPLETION_TRACKER_SINK = 'completionTracker';
