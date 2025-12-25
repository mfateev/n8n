/**
 * POC 8: Temporal Activities
 *
 * Activities are where I/O happens. The Workflow calls these
 * and Temporal handles retries, timeouts, etc.
 */

export { executeNode, type ExecuteNodeInput, type ExecuteNodeOutput } from './execute-node.js';
