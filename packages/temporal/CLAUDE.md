# Temporal Package

This package provides Temporal integration for n8n workflow execution.

## Prerequisites

A Temporal server must be running. For local development, start the dev server:

```bash
temporal server start-dev --port 7233 --namespace default
```

## Building

```bash
cd packages/temporal
pnpm build
```

## Testing Temporal Workflows

### Running the Worker

Start a worker to process workflows:

```bash
node dist/cli/index.js worker start --config test/fixtures/config/simple.json --verbose
```

For testing, use `--exit-on-complete N` to automatically exit after N workflow completions:

```bash
node dist/cli/index.js worker start --config test/fixtures/config/simple.json --verbose --exit-on-complete 1
```

### Starting a Workflow

```bash
node dist/cli/index.js workflow start --config test/fixtures/config/simple.json --workflow test/fixtures/workflows/simple-set.json
```

### Inspecting Workflow State

Use the Temporal CLI to inspect workflow state. For local dev server, use `--tls=false`:

```bash
# Describe workflow metadata, status, and result
temporal workflow describe --workflow-id <WORKFLOW_ID> --namespace default --tls=false

# Show workflow event history
temporal workflow show --workflow-id <WORKFLOW_ID> --namespace default --tls=false
```

Example output from `temporal workflow describe`:
- **Status**: COMPLETED, RUNNING, FAILED, etc.
- **HistoryLength**: Number of events in the workflow history
- **Result**: The workflow output (for completed workflows)

Example output from `temporal workflow show`:
- Event history showing: WorkflowExecutionStarted → WorkflowTaskScheduled → WorkflowTaskStarted → WorkflowTaskCompleted → WorkflowExecutionCompleted

### Quick Test Script

Run a complete test cycle (requires Temporal server running):

```bash
cd packages/temporal

# Build first
pnpm build

# Start workflow
WORKFLOW_ID="test-$(date +%s)"
node -e "
const { createTemporalClient } = require('./dist/connection/client.js');
const { loadWorkflowFromFile } = require('./dist/utils/workflow-loader.js');

async function main() {
  const workflowDef = await loadWorkflowFromFile('./test/fixtures/workflows/simple-set.json');
  const client = await createTemporalClient({ address: 'localhost:7233', namespace: 'default' });
  const handle = await client.workflow.start('executeN8nWorkflow', {
    taskQueue: 'n8n-test',
    workflowId: '$WORKFLOW_ID',
    args: [{
      workflowId: workflowDef.id,
      workflowName: workflowDef.name,
      nodes: workflowDef.nodes,
      connections: workflowDef.connections,
    }],
  });
  console.log('Workflow ID:', handle.workflowId);
  await client.connection.close();
}
main();
"

# Run worker with exit-on-complete
node -e "
const { runWorker } = require('./dist/worker/worker.js');
runWorker({
  temporal: { address: 'localhost:7233', namespace: 'default', taskQueue: 'n8n-test' },
  credentials: { path: './test/fixtures/credentials/empty.json' },
  exitOnComplete: 1,
}).then(({ runPromise }) => runPromise);
"

# Check result
temporal workflow describe --workflow-id $WORKFLOW_ID --namespace default --tls=false
```

## Architecture Notes

- **Workflows** run in Temporal's deterministic V8 sandbox - cannot import n8n packages
- **Activities** execute outside the sandbox - all n8n node execution happens here
- **Local Activities** are used to avoid storing large workflow state in Temporal history
- **Sinks** are used for the exit-on-complete feature to track workflow completions
