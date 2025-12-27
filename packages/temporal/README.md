# @n8n/temporal

Temporal integration for n8n workflows. Run n8n workflows as durable, fault-tolerant Temporal workflows.

## Features

- **Durable Execution**: Workflows survive worker crashes and restarts
- **Full Node Support**: All ~400 n8n nodes work without modification
- **Binary Data**: S3-backed binary data storage for distributed workers
- **Wait Node Support**: Durable sleep via Temporal timers
- **CLI Tools**: Easy-to-use command line interface
- **Credentials**: JSON file-based credential storage with OAuth support

## Installation

```bash
pnpm add @n8n/temporal
```

## Quick Start

### 1. Create Configuration File

Create `temporal-n8n.config.json`:

```json
{
  "temporal": {
    "address": "localhost:7233",
    "namespace": "default",
    "taskQueue": "n8n-workflows"
  },
  "credentials": {
    "path": "./credentials.json"
  }
}
```

### 2. Create Credentials File

Create `credentials.json` with your credentials:

```json
{
  "slack-api-1": {
    "accessToken": "xoxb-your-token"
  },
  "github-api-1": {
    "accessToken": "ghp_your_token"
  }
}
```

### 3. Start a Worker

```bash
temporal-n8n worker start --config ./temporal-n8n.config.json
```

### 4. Run a Workflow

```bash
temporal-n8n workflow run --workflow ./my-workflow.json --config ./temporal-n8n.config.json
```

## CLI Commands

### Worker Commands

```bash
# Start a worker
temporal-n8n worker start --config ./config.json

# Start with custom task queue
temporal-n8n worker start --config ./config.json --task-queue my-queue

# Start with verbose logging
temporal-n8n worker start --config ./config.json -v

# Start with concurrency limit
temporal-n8n worker start --config ./config.json --concurrency 10
```

### Workflow Commands

```bash
# Run workflow (blocking - waits for completion)
temporal-n8n workflow run --workflow ./workflow.json

# Run with input data
temporal-n8n workflow run --workflow ./workflow.json --input ./input.json

# Run with custom timeout
temporal-n8n workflow run --workflow ./workflow.json --timeout 5m

# Run with JSON output for scripting
temporal-n8n workflow run --workflow ./workflow.json --json

# Start workflow (async - returns immediately)
temporal-n8n workflow start --workflow ./workflow.json

# Start with custom workflow ID
temporal-n8n workflow start --workflow ./workflow.json --workflow-id my-custom-id

# Check workflow status
temporal-n8n workflow status --workflow-id <id>

# Get workflow result
temporal-n8n workflow result --workflow-id <id>

# Wait for result if workflow still running
temporal-n8n workflow result --workflow-id <id> --wait
```

### Common Flags

| Flag | Short | Description |
|------|-------|-------------|
| `--config` | `-c` | Path to configuration file (default: ./temporal-n8n.config.json) |
| `--verbose` | `-v` | Enable verbose/debug logging |
| `--json` | | Output result as JSON only |

## Configuration

### Configuration File Structure

```typescript
interface TemporalN8nConfig {
  temporal: {
    address: string;           // Temporal server address
    namespace?: string;        // Namespace (default: "default")
    taskQueue: string;         // Task queue name
    identity?: string;         // Worker identity
    maxConcurrentActivityTaskExecutions?: number;
    maxConcurrentWorkflowTaskExecutions?: number;
    tls?: {                    // TLS configuration
      clientCert?: string;
      clientKey?: string;
      serverRootCACert?: string;
      serverNameOverride?: string;
    };
  };
  credentials: {
    path: string;              // Path to credentials JSON file
  };
  binaryData?: {
    mode: 'filesystem' | 's3';
    s3?: {
      bucket: string;
      region: string;
      host?: string;           // For S3-compatible services
      protocol?: 'http' | 'https';
      accessKeyId?: string;
      secretAccessKey?: string;
      authAutoDetect?: boolean;
    };
    filesystem?: {
      basePath: string;
    };
  };
  execution?: {
    activityTimeout?: number;
    retryPolicy?: {
      maximumAttempts?: number;
      initialInterval?: string;
      maximumInterval?: string;
      backoffCoefficient?: number;
    };
  };
  logging?: {
    level?: 'debug' | 'info' | 'warn' | 'error';
    format?: 'text' | 'json';
  };
}
```

### Example Configuration Files

#### Local Development

```json
{
  "temporal": {
    "address": "localhost:7233",
    "taskQueue": "dev-workflows"
  },
  "credentials": {
    "path": "./dev-credentials.json"
  },
  "binaryData": {
    "mode": "filesystem",
    "filesystem": {
      "basePath": "./tmp/binary-data"
    }
  },
  "logging": {
    "level": "debug"
  }
}
```

#### Production (AWS)

```json
{
  "temporal": {
    "address": "temporal.internal:7233",
    "namespace": "production",
    "taskQueue": "prod-n8n-workflows",
    "maxConcurrentActivityTaskExecutions": 50
  },
  "credentials": {
    "path": "/etc/n8n/credentials.json"
  },
  "binaryData": {
    "mode": "s3",
    "s3": {
      "bucket": "prod-n8n-binary-data",
      "region": "us-east-1",
      "authAutoDetect": true
    }
  },
  "logging": {
    "level": "info",
    "format": "json"
  }
}
```

#### With TLS (Temporal Cloud)

```json
{
  "temporal": {
    "address": "your-namespace.tmprl.cloud:7233",
    "namespace": "your-namespace",
    "taskQueue": "n8n-workflows",
    "tls": {
      "clientCert": "-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----",
      "clientKey": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----"
    }
  },
  "credentials": {
    "path": "./credentials.json"
  }
}
```

## Binary Data

For distributed workers, configure S3 storage so binary data can be shared across workers:

```json
{
  "binaryData": {
    "mode": "s3",
    "s3": {
      "bucket": "my-n8n-binary-data",
      "region": "us-east-1"
    }
  }
}
```

AWS credentials can be provided via:
- Configuration file (`accessKeyId`, `secretAccessKey`)
- Environment variables (`AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`)
- IAM roles (set `authAutoDetect: true`)

### S3-Compatible Storage (MinIO)

```json
{
  "binaryData": {
    "mode": "s3",
    "s3": {
      "bucket": "n8n-binary-data",
      "region": "us-east-1",
      "host": "minio.local:9000",
      "protocol": "http",
      "accessKeyId": "minioadmin",
      "secretAccessKey": "minioadmin"
    }
  }
}
```

## Credentials

Credentials are stored in a JSON file with credential IDs as keys:

```json
{
  "api-key-cred-1": {
    "apiKey": "secret-api-key"
  },
  "oauth-cred-1": {
    "clientId": "your-client-id",
    "clientSecret": "your-client-secret",
    "accessTokenUrl": "https://api.example.com/oauth/token",
    "grantType": "clientCredentials",
    "oauthTokenData": {
      "access_token": "current-token",
      "token_type": "Bearer",
      "expires_in": 3600
    }
  },
  "http-header-cred-1": {
    "name": "X-API-Key",
    "value": "header-api-key-value"
  }
}
```

The credential ID in the file must match the credential ID referenced in your workflow JSON.

## Supported Nodes

All n8n nodes are supported with these exceptions:

| Node Type | Support | Notes |
|-----------|---------|-------|
| All standard nodes | Supported | ~400 nodes work without modification |
| Code Node (JavaScript) | Supported | Runs in-process via vm2 sandbox |
| Code Node (Python) | Not Supported | Requires task runner infrastructure |
| Execute Workflow Node | Not Supported | Sub-workflow execution not supported in MVP |
| Wait Node | Supported | Uses Temporal's durable sleep |
| Webhook Trigger | Not Supported | Requires HTTP server infrastructure |

## Architecture

The integration uses an Activity-based orchestration pattern:

```mermaid
sequenceDiagram
    participant CLI as temporal-n8n CLI
    participant Client as Temporal Client
    participant Server as Temporal Server
    participant Worker as Temporal Worker
    participant Activity as executeWorkflowStep
    participant WE as WorkflowExecute

    CLI->>Client: workflow run --workflow ./workflow.json
    Client->>Server: StartWorkflowExecution
    Server-->>Client: WorkflowId, RunId

    Server->>Worker: WorkflowTask
    Worker->>Activity: executeWorkflowStep(input)
    Activity->>WE: processRunExecutionData()
    WE->>WE: Execute nodes
    WE-->>Activity: Result with runData
    Activity-->>Worker: ExecuteWorkflowStepOutput (diff)

    Worker->>Server: CompleteWorkflowTask

    Note over Worker: If Wait node encountered
    Worker->>Server: StartTimer
    Server-->>Worker: TimerFired

    Worker->>Server: CompleteWorkflowExecution
    Server-->>Client: WorkflowResult
    Client-->>CLI: Output result
```

### Key Components

| Component | Location | Purpose |
|-----------|----------|---------|
| Worker Bootstrap | `src/worker/worker.ts` | Initialize and run the Temporal worker |
| Worker Context | `src/worker/context.ts` | Singleton holding pre-loaded resources |
| Temporal Workflow | `src/workflows/execute-n8n-workflow.ts` | Orchestration loop with sleep handling |
| Activity | `src/activities/execute-workflow-step.ts` | Execute workflow nodes via WorkflowExecute |
| Credential Helper | `src/credentials/credentials-helper.ts` | ICredentialsHelper implementation |
| Node Types Registry | `src/nodes/node-types.ts` | INodeTypes implementation |
| Binary Data Helper | `src/binary-data/temporal-binary-data-helper.ts` | S3/filesystem binary data storage |
| CLI Commands | `src/cli/commands/` | oclif-based CLI |

### Design Principles

1. **Full State Passing**: Complete workflow state is passed to activities (not stored in history)
2. **Diff Returns**: Only changed data (new runData) is returned from activities
3. **Wait Node = Temporal Sleep**: Wait nodes trigger Temporal's durable `sleep()` function
4. **Pre-loaded Resources**: Node types and credentials loaded once at worker startup
5. **No n8n DI**: Standalone implementation without n8n's dependency injection container

## Development

```bash
# Build
pnpm build

# Run unit tests
pnpm test

# Run integration tests (requires Temporal server)
pnpm test:integration

# Type check
pnpm typecheck

# Lint
pnpm lint

# Watch mode for development
pnpm watch
```

### Running Integration Tests

Integration tests require a running Temporal server:

```bash
# Start Temporal dev server
temporal server start-dev

# Run integration tests with ESM support
NODE_OPTIONS='--experimental-vm-modules' pnpm test:integration
```

### Testing with LocalStack (S3)

For binary data S3 tests:

```bash
# Start LocalStack
docker run -d -p 4566:4566 localstack/localstack

# Configure binary data for LocalStack
{
  "binaryData": {
    "mode": "s3",
    "s3": {
      "bucket": "test-binary-data",
      "region": "us-east-1",
      "host": "localhost:4566",
      "protocol": "http"
    }
  }
}
```

## Current Limitations (MVP Scope)

This is an MVP implementation with the following limitations:

1. **No Sub-Workflow Execution**: Execute Workflow node is not supported
2. **No Python Code Node**: Only JavaScript is supported (Python requires task runner)
3. **No Webhook/Form Wait**: Wait node only supports time-based waiting
4. **No Error Workflow**: Workflow error triggers are not implemented
5. **No Workflow Timeout**: Individual workflow timeouts not configurable per workflow
6. **No Multi-Main Mode**: Single worker mode only
7. **Credential Store**: JSON file only (no database integration)
8. **No UI Integration**: CLI-only, no n8n UI connection

## Environment Variables

| Variable | Description |
|----------|-------------|
| `LOG_LEVEL` | Override logging level (debug, info, warn, error) |
| `LOG_FORMAT` | Override logging format (text, json) |
| `AWS_ACCESS_KEY_ID` | AWS credentials for S3 binary data |
| `AWS_SECRET_ACCESS_KEY` | AWS credentials for S3 binary data |
| `AWS_REGION` | AWS region for S3 binary data |

## Troubleshooting

### Worker won't start

1. Check Temporal server is running: `temporal server start-dev`
2. Verify configuration file syntax: `cat ./temporal-n8n.config.json | jq .`
3. Check credentials file path is correct and readable
4. Enable verbose logging: `temporal-n8n worker start -v`

### Workflow execution fails

1. Check workflow JSON syntax
2. Verify all credential references exist in credentials file
3. Check worker is running on the correct task queue
4. Review Temporal UI for workflow history: `http://localhost:8233`

### Binary data not working

1. For S3: Verify bucket exists and is accessible
2. For filesystem: Check basePath directory exists and is writable
3. Verify AWS credentials if using S3

## License

MIT
