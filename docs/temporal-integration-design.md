# Temporal Integration for n8n Workflows

## Design Document

**Status:** Implemented - Activity-based orchestration (MVP Complete)
**Date:** 2025-12-27
**Author:** Generated from research session

> **Note:** This design has been validated through 10 POCs. POC 9 proved that n8n packages cannot execute in Temporal's V8 sandbox, leading to the Activity-based architecture. POC 10 validated that Local Activity inputs are NOT stored in Temporal history, enabling full state passing without history bloat.

### Implementation Status

**Phase 1 Complete (2025-12-27):**
- ✅ Full package structure implemented in `packages/temporal/`
- ✅ executeN8nWorkflow Temporal workflow with diff-based state management
- ✅ executeWorkflowStep Activity using WorkflowExecute
- ✅ Credential store, helper, and types loading
- ✅ CLI with worker and workflow commands
- ✅ Exit-on-complete mode using Temporal Sinks for testing
- ✅ ExecutionLifecycleHooks integration (required by WorkflowExecute)

**Key Implementation Finding:** WorkflowExecute requires `ExecutionLifecycleHooks` in additionalData. Without it, workflow execution fails silently. This was resolved by creating hooks in `buildAdditionalData()` using the workflow definition.

### Key Constraints

- **No n8n code modifications**: This integration lives in a separate repository and cannot modify n8n-core, n8n-workflow, or other n8n packages. We consume them as dependencies.
- **POC 8 scope**: POC 8 validated that WorkflowExecute **bundles** into Temporal's V8 sandbox (~25MB).
- **POC 9 finding (CRITICAL)**: WorkflowExecute **cannot execute** in Temporal's sandbox due to extensive Node.js dependencies:
  - `reflect-metadata` - cannot extend frozen `Reflect` global in sandbox
  - `xml2js/sax` - requires Node.js `Stream` class
  - `@n8n/tournament/recast` - requires Node.js `assert` module
  - Many other transitive dependencies assume Node.js APIs are available

### Selected Architecture: Activity-Based Orchestration

Given POC 9 findings, we use **Option C: Activity-based orchestration**:
- WorkflowExecute runs inside a Temporal Activity (not in the V8 sandbox)
- Temporal Workflow is a minimal loop that calls the orchestration Activity
- Full execution state (`IRunExecutionData`) is passed to/from the Activity on each invocation
- **Trade-off**: Loses deterministic replay for orchestration logic, but gains full n8n compatibility
- **Future optimization**: Large state can be offloaded to external store (claim-check pattern)

---

## Table of Contents

1. [Executive Summary](#1-executive-summary)
2. [Goals and Non-Goals](#2-goals-and-non-goals)
3. [Architecture Overview](#3-architecture-overview)
4. [Component Design](#4-component-design)
5. [Data Structures](#5-data-structures)
6. [Execution Flow](#6-execution-flow)
7. [Reused vs New Components](#7-reused-vs-new-components)
8. [Implementation Phases](#8-implementation-phases)
9. [Risks and Mitigations](#9-risks-and-mitigations)
10. [Future Work](#10-future-work)
11. [POC Validation Summary](#11-poc-validation-summary)

---

## 1. Executive Summary

This document describes the design for running n8n workflows as Temporal workflows, providing durability and fault tolerance that the native n8n execution engine lacks.

### Key Design Decisions

| Decision | Choice | Rationale |
|----------|--------|-----------|
| **Orchestration** | **WorkflowExecute in Local Activity** | Reuse ~2640 LOC of battle-tested orchestration logic; runs in Activity (not V8 sandbox) |
| **Workflow pattern** | **Orchestration loop** | Temporal Workflow calls orchestration Activity repeatedly until completion |
| **State passing** | **Full input, diff output** | Local Activity inputs NOT in history; output is diff only for minimal history |
| **Activity type** | **Local Activity** | Inputs not stored in history - validated in TypeScript SDK |
| Node execution | Within orchestration Activity | WorkflowExecute calls nodes directly; no per-node Activity boundary |
| Database dependency | None | Workflow from file, credentials from JSON |
| Credential management | Worker-local JSON file | Simplicity for MVP, secrets never in Temporal history |
| Node support | All ~400 nodes | Generic integration, no per-node work |
| Binary data | S3/Object Store | Distributed access, existing n8n support |
| Sub-workflows | **Deferred** | Out of scope for MVP (TODO) |
| Code execution | In-process | Security trade-off for MVP simplicity |
| Retries | Temporal native | Leverage Temporal's retry policies |

---

## 2. Goals and Non-Goals

### Goals

1. **Durable workflow execution** - Workflows survive worker crashes and restarts
2. **Independent execution** - No n8n database required
3. **Full node compatibility** - Support all existing n8n nodes without modification
4. **Credential security** - Secrets managed in worker, never in workflow state
5. **Observable execution** - Leverage Temporal's visibility and history features

### Non-Goals (MVP)

1. Trigger node support (webhooks, polling) - workflows started externally
2. n8n UI integration - CLI/API only
3. Multi-tenant credential isolation - single credential store per worker
4. Large payload optimization (claim check pattern) - future work
5. External task runner for Code node - in-process for MVP
6. **Sub-workflow execution** - Execute Workflow node not supported in MVP

---

## 3. Architecture Overview

### Activity-Based Orchestration

POC 9 proved that n8n packages cannot execute in Temporal's V8 sandbox due to Node.js dependencies. The revised architecture runs WorkflowExecute inside a Temporal Activity:

```
┌─────────────────────────────────────────────────────────────────────────────┐
│                              Temporal Cluster                                │
│  ┌─────────────┐  ┌─────────────┐  ┌─────────────┐                         │
│  │   Server    │  │   Server    │  │   Server    │                         │
│  └─────────────┘  └─────────────┘  └─────────────┘                         │
└─────────────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    │                               │
                    ▼                               ▼
┌───────────────────────────────────┐ ┌───────────────────────────────────────┐
│      Temporal Workflow            │ │           Activity Worker              │
│    (Minimal orchestration loop)   │ │                                        │
├───────────────────────────────────┤ ├───────────────────────────────────────┤
│                                   │ │  Worker Initialization:                │
│  while (!complete) {              │ │  • Load credentials.json               │
│    result = await activities      │ │  • Load all node types                 │
│      .executeWorkflowStep({   ────┼─┼──► Execute one or more nodes          │
│        workflow,                  │ │  • Initialize BinaryDataService (S3)   │
│        runExecutionData,          │ │  • Setup DI container                  │
│      });                          │ │                                        │
│                                   │ │  executeWorkflowStep Activity:         │
│    runExecutionData = result.state│ │  ├── WorkflowExecute.runPartial()     │
│                                   │ │  │   • Process execution stack         │
│    if (result.waitTill) {         │ │  │   • Execute nodes (with I/O)        │
│      await sleep(result.waitTill) │ │  │   • Update runExecutionData         │
│    }                              │ │  │   • Stop at checkpoint               │
│  }                                │ │  └── Return updated state              │
│                                   │ │                                        │
│  return result.finalOutput        │ │  External Resources:                   │
│                                   │ │  • credentials.json ◄──► CredentialStore│
└───────────────────────────────────┘ │  • S3 Bucket ◄──► BinaryDataService    │
                                      └───────────────────────────────────────┘

┌─────────────────────────────────────────────────────────────────────────────┐
│                            Workflow Clients                                  │
│                                                                             │
│  CLI:  temporal-n8n run --workflow ./my-workflow.json --input ./data.json  │
│  API:  POST /workflows/execute { workflowPath, inputData }                  │
└─────────────────────────────────────────────────────────────────────────────┘
```

### Key Architecture Points

1. **Temporal Workflow is a minimal loop**: The workflow code is simple - it calls the orchestration Activity in a loop until the workflow completes. This code CAN run in the V8 sandbox because it has no n8n dependencies.

2. **WorkflowExecute runs in Activity**: The full n8n orchestration engine (~2640 LOC) runs inside the Activity with full Node.js capabilities. This reuses all battle-tested logic: graph traversal, merge nodes, wait handling, error routing.

3. **State passing with Local Activities**:
   - **Local Activity inputs are NOT stored in Temporal history** (validated in TypeScript SDK)
   - **Input (Workflow → Activity)**: Full `IRunExecutionData` - no history size concern
   - **Output (Activity → Workflow)**: **Diff only** - just the newly executed nodes' data
   - Workflow merges diff into accumulated state
   - This design avoids history bloat while maintaining full expression evaluation capability

4. **Checkpoints at Activity boundaries**: Each Activity completion creates a checkpoint. If a worker crashes mid-Activity, the Activity retries from the beginning. Temporal handles retries automatically.

5. **Future optimization - claim-check pattern**: For large workflows, input state can be offloaded to external storage (S3/Redis). Only references flow through Temporal history.

### Trade-offs vs V8 Sandbox Approach

| Aspect | V8 Sandbox (not viable) | Activity-Based (selected) |
|--------|------------------------|---------------------------|
| Deterministic replay | ✅ Full determinism | ❌ Activity retries from start |
| n8n compatibility | ❌ Node.js deps fail | ✅ Full compatibility |
| History size | Grows with each node | ✅ Minimal - Local Activity inputs not in history |
| Code complexity | Complex bundling | Simple loop + merge |
| Checkpoint granularity | Per-node | Per-Activity call |

**Local Activity benefits (validated):**
- **Local Activity inputs are NOT stored in Temporal history** - only outputs are recorded
- Activity **input** can be full `IRunExecutionData` without history bloat
- Activity **output** is diff only - keeps history small
- No 2MB payload concern for inputs when using Local Activities
- Claim-check pattern only needed if **output** exceeds limits (unlikely with diff approach)

---

## 4. Component Design

### 4.1 Temporal Workflow: `executeN8nWorkflow`

The Temporal workflow is a **minimal orchestration loop** that calls an Activity to execute workflow steps. It has no n8n dependencies and runs in the V8 sandbox.

```typescript
interface ExecuteN8nWorkflowInput {
  workflowId: string;
  workflowName: string;
  nodes: INode[];
  connections: IConnections;
  settings?: IWorkflowSettings;
  inputData?: INodeExecutionData[];
}

interface ExecuteN8nWorkflowOutput {
  success: boolean;
  data?: INodeExecutionData[];
  error?: SerializedError;
  runExecutionData: IRunExecutionData;
}
```

**Workflow Logic:**

```typescript
import { proxyLocalActivities, sleep } from '@temporalio/workflow';

// Local Activity - inputs NOT stored in history (only outputs)
// This allows passing full runExecutionData without history bloat
const activities = proxyLocalActivities<typeof import('./activities')>({
  startToCloseTimeout: '10 minutes',
  localRetryThreshold: '1 minute',  // Retry locally before scheduling on server
  retry: {
    maximumAttempts: 3,
    initialInterval: '1s',
    maximumInterval: '1m',
    backoffCoefficient: 2,
  },
});

/**
 * Activity returns a DIFF, not full state.
 * This reduces Temporal history size since output is smaller.
 * Input still requires full state for expression evaluation.
 */
interface WorkflowStepResult {
  complete: boolean;
  // Diff output - only changes from this step:
  newRunData: { [nodeName: string]: ITaskData[] };  // Only newly executed nodes
  executionData: {
    nodeExecutionStack: IExecuteData[];
    waitingExecution: IWaitingForExecution;
    waitingExecutionSource: IWaitingForExecutionSource | null;
  };
  lastNodeExecuted?: string;
  waitTill?: number;               // Unix timestamp if Wait node triggered
  error?: SerializedError;
  finalOutput?: INodeExecutionData[];
}

export async function executeN8nWorkflow(
  input: ExecuteN8nWorkflowInput
): Promise<ExecuteN8nWorkflowOutput> {
  // Initialize execution state (empty on first call)
  let runExecutionData: IRunExecutionData = createEmptyRunExecutionData();

  // Orchestration loop - calls Activity until workflow completes
  while (true) {
    const result: WorkflowStepResult = await activities.executeWorkflowStep({
      workflowDefinition: {
        id: input.workflowId,
        name: input.workflowName,
        nodes: input.nodes,
        connections: input.connections,
        settings: input.settings,
      },
      runExecutionData,  // Full state needed for expression evaluation
      inputData: input.inputData,
    });

    // Merge diff into accumulated state
    runExecutionData = mergeWorkflowStepResult(runExecutionData, result);

    // Check for completion
    if (result.complete) {
      return {
        success: !result.error,
        data: result.finalOutput,
        error: result.error,
        runExecutionData,
      };
    }

    // Handle Wait node - use Temporal's durable sleep
    if (result.waitTill) {
      const waitMs = result.waitTill - Date.now();
      if (waitMs > 0) {
        await sleep(waitMs);  // Durable - survives worker restarts
      }
    }

    // Continue to next step
  }
}

/**
 * Merge Activity diff result into accumulated state
 */
function mergeWorkflowStepResult(
  state: IRunExecutionData,
  result: WorkflowStepResult
): IRunExecutionData {
  return {
    ...state,
    resultData: {
      ...state.resultData,
      runData: {
        ...state.resultData.runData,
        ...result.newRunData,  // Merge new node outputs
      },
      lastNodeExecuted: result.lastNodeExecuted ?? state.resultData.lastNodeExecuted,
      error: result.error ? deserializeError(result.error) : state.resultData.error,
    },
    executionData: result.executionData,
  };
}
```

**Key Insight**: The workflow code is simple and has no n8n dependencies. All the complex orchestration logic (WorkflowExecute) runs in the Activity.

### 4.2 Temporal Activity: `executeWorkflowStep`

Executes one or more n8n nodes using WorkflowExecute. Returns a **diff** (only changes) to reduce Temporal history size.

```typescript
interface ExecuteWorkflowStepInput {
  workflowDefinition: IWorkflowBase;
  runExecutionData: IRunExecutionData;   // Full state (needed for expression evaluation)
  inputData?: INodeExecutionData[];      // Initial input (first call only)
}

/**
 * Returns DIFF only - not full state.
 * Workflow merges this into accumulated state.
 */
interface ExecuteWorkflowStepOutput {
  complete: boolean;
  // Diff - only newly executed nodes in this step:
  newRunData: { [nodeName: string]: ITaskData[] };
  // Full execution bookkeeping (small, always needed):
  executionData: {
    nodeExecutionStack: IExecuteData[];
    waitingExecution: IWaitingForExecution;
    waitingExecutionSource: IWaitingForExecutionSource | null;
  };
  lastNodeExecuted?: string;
  waitTill?: number;
  error?: SerializedError;
  finalOutput?: INodeExecutionData[];
}
```

**Activity Implementation:**

```typescript
import { WorkflowExecute } from 'n8n-core';
import { Workflow, createRunExecutionData } from 'n8n-workflow';

async function executeWorkflowStep(
  input: ExecuteWorkflowStepInput
): Promise<ExecuteWorkflowStepOutput> {
  const { workflowDefinition, runExecutionData, inputData } = input;

  // Track which nodes existed before this step (to compute diff)
  const previousNodeNames = new Set(Object.keys(runExecutionData.resultData.runData));

  // 1. Create Workflow instance with pre-loaded node types
  const workflow = new Workflow({
    id: workflowDefinition.id,
    name: workflowDefinition.name,
    nodes: workflowDefinition.nodes,
    connections: workflowDefinition.connections,
    nodeTypes: workerContext.nodeTypes,  // Pre-loaded at worker startup
    settings: workflowDefinition.settings,
  });

  // 2. Build additional data (credentials helper, hooks, etc.)
  // NOTE: ExecutionLifecycleHooks is REQUIRED by WorkflowExecute
  const additionalData = buildAdditionalData({
    credentialsHelper: workerContext.credentialsHelper,
    credentialTypes: workerContext.credentialTypes,
    nodeTypes: workerContext.nodeTypes,
    workflowData: workflowDefinition,  // Required for ExecutionLifecycleHooks
  });

  // 3. Create WorkflowExecute with existing state
  // NOTE: Pass runExecutionData to constructor, then call processRunExecutionData()
  // This is how n8n resumes execution after Wait nodes (see WorkflowRunner.runMainProcess)
  const workflowExecute = new WorkflowExecute(additionalData, 'integrated', runExecutionData);

  try {
    // Resume workflow execution from provided state
    const result = await workflowExecute.processRunExecutionData(workflow);

    // Compute diff: only nodes that were added/updated in this step
    const newRunData: { [nodeName: string]: ITaskData[] } = {};
    for (const [nodeName, taskData] of Object.entries(result.data.resultData.runData)) {
      if (!previousNodeNames.has(nodeName)) {
        // New node executed in this step
        newRunData[nodeName] = taskData;
      } else {
        // Check if existing node has new run data (e.g., loop iteration)
        const prevLength = runExecutionData.resultData.runData[nodeName]?.length ?? 0;
        const newLength = taskData.length;
        if (newLength > prevLength) {
          // Only include new entries
          newRunData[nodeName] = taskData.slice(prevLength);
        }
      }
    }

    // Check if workflow is waiting (Wait node)
    if (result.waitTill) {
      return {
        complete: false,
        newRunData,
        executionData: result.data.executionData!,
        lastNodeExecuted: result.data.resultData.lastNodeExecuted,
        waitTill: result.waitTill.getTime(),
      };
    }

    // Workflow completed (success or error)
    return {
      complete: true,
      newRunData,
      executionData: result.data.executionData!,
      lastNodeExecuted: result.data.resultData.lastNodeExecuted,
      error: result.data.resultData.error ? serializeError(result.data.resultData.error) : undefined,
      finalOutput: getLastNodeOutput(result),
    };
  } catch (error) {
    return {
      complete: true,
      newRunData: {},
      executionData: runExecutionData.executionData ?? createEmptyExecutionData(),
      error: serializeError(error),
    };
  }
}
```

**Note on Execution Pattern:**

For MVP, the Activity executes the **entire workflow** in a single call (unless a Wait node is encountered). This means:
- Simple workflows complete in one Activity call
- Workflows with Wait nodes return early, then continue after sleep
- If Activity fails mid-execution, the entire Activity retries from the beginning

Future optimization could add more granular checkpointing by having the Activity yield after N nodes.

### 4.3 CredentialStore

Simple JSON-file based credential store for MVP.

```typescript
interface CredentialStore {
  get(credentialId: string): Promise<ICredentialDataDecryptedObject | undefined>;
  getAll(): Promise<Map<string, ICredentialDataDecryptedObject>>;
  update(credentialId: string, data: ICredentialDataDecryptedObject): Promise<void>;
}

class JsonFileCredentialStore implements CredentialStore {
  private credentials: Map<string, ICredentialDataDecryptedObject>;

  constructor(private filePath: string) {}

  async load(): Promise<void> {
    const content = await fs.readFile(this.filePath, 'utf-8');
    const parsed = JSON.parse(content) as Record<string, ICredentialDataDecryptedObject>;
    this.credentials = new Map(Object.entries(parsed));
  }

  async get(credentialId: string): Promise<ICredentialDataDecryptedObject | undefined> {
    return this.credentials.get(credentialId);
  }

  async update(credentialId: string, data: ICredentialDataDecryptedObject): Promise<void> {
    this.credentials.set(credentialId, data);
    await this.persist();
  }

  private async persist(): Promise<void> {
    const obj = Object.fromEntries(this.credentials);
    await fs.writeFile(this.filePath, JSON.stringify(obj, null, 2));
  }
}
```

**Credential File Format:**

```json
{
  "cred-123": {
    "clientId": "xxx",
    "clientSecret": "yyy",
    "accessToken": "zzz",
    "refreshToken": "www",
    "oauthTokenData": { ... }
  },
  "cred-456": {
    "apiKey": "abc123"
  }
}
```

### 4.4 TemporalCredentialsHelper

Implements `ICredentialsHelper` using the worker's credential store.

```typescript
class TemporalCredentialsHelper extends ICredentialsHelper {
  constructor(
    private store: CredentialStore,
    private credentialTypes: CredentialTypes,
  ) {
    super();
  }

  getParentTypes(name: string): string[] {
    return this.credentialTypes.getParentTypes(name);
  }

  async authenticate(
    credentials: ICredentialDataDecryptedObject,
    typeName: string,
    requestOptions: IHttpRequestOptions,
    workflow: Workflow,
    node: INode,
  ): Promise<IHttpRequestOptions> {
    // Delegate to credential type's authenticate method
    const credentialType = this.credentialTypes.getByName(typeName);
    if (credentialType.authenticate) {
      if (typeof credentialType.authenticate === 'function') {
        return credentialType.authenticate(credentials, requestOptions);
      }
      // Handle generic authentication config
      // ... (same logic as original CredentialsHelper)
    }
    return requestOptions;
  }

  async preAuthentication(
    helpers: IHttpRequestHelper,
    credentials: ICredentialDataDecryptedObject,
    typeName: string,
    node: INode,
    credentialsExpired: boolean,
  ): Promise<ICredentialDataDecryptedObject | undefined> {
    const credentialType = this.credentialTypes.getByName(typeName);
    if (credentialType.preAuthentication) {
      return credentialType.preAuthentication.call(helpers, credentials);
    }
    return undefined;
  }

  async getCredentials(
    nodeCredentials: INodeCredentialsDetails,
    type: string,
  ): Promise<ICredentials> {
    const data = await this.store.get(nodeCredentials.id);
    return new Credentials(nodeCredentials, type, data);
  }

  async getDecrypted(
    additionalData: IWorkflowExecuteAdditionalData,
    nodeCredentials: INodeCredentialsDetails,
    type: string,
    mode: WorkflowExecuteMode,
    executeData?: IExecuteData,
    raw?: boolean,
    expressionResolveValues?: ICredentialsExpressionResolveValues,
  ): Promise<ICredentialDataDecryptedObject> {
    const data = await this.store.get(nodeCredentials.id);
    if (!data) {
      throw new Error(`Credential not found: ${nodeCredentials.id}`);
    }

    // Handle expression resolution if needed
    if (!raw && expressionResolveValues) {
      return this.resolveExpressions(data, expressionResolveValues);
    }

    return data;
  }

  async updateCredentials(
    nodeCredentials: INodeCredentialsDetails,
    type: string,
    data: ICredentialDataDecryptedObject,
  ): Promise<void> {
    // OAuth token refresh - update the store
    await this.store.update(nodeCredentials.id, data);
  }

  async updateCredentialsOauthTokenData(
    nodeCredentials: INodeCredentialsDetails,
    type: string,
    data: ICredentialDataDecryptedObject,
    additionalData: IWorkflowExecuteAdditionalData,
  ): Promise<void> {
    await this.updateCredentials(nodeCredentials, type, data);
  }

  getCredentialsProperties(type: string): INodeProperties[] {
    return this.credentialTypes.getByName(type).properties;
  }
}
```

### 4.5 TemporalNodeTypes

Pre-loaded node type registry.

```typescript
class TemporalNodeTypes implements INodeTypes {
  private nodes: Map<string, LoadedClass<INodeType | IVersionedNodeType>>;

  constructor() {
    this.nodes = new Map();
  }

  async loadAll(): Promise<void> {
    // Load from bundled packages
    const nodesBaseDir = require.resolve('n8n-nodes-base');
    const langchainDir = require.resolve('@n8n/n8n-nodes-langchain');

    // Use n8n's existing loader infrastructure
    const loader = new PackageDirectoryLoader(nodesBaseDir);
    await loader.loadAll();

    for (const [name, node] of loader.nodeTypes) {
      this.nodes.set(name, node);
    }
  }

  getByName(nodeType: string): INodeType | IVersionedNodeType {
    const node = this.nodes.get(nodeType);
    if (!node) {
      throw new Error(`Unknown node type: ${nodeType}`);
    }
    return node.type;
  }

  getByNameAndVersion(nodeType: string, version?: number): INodeType {
    const node = this.getByName(nodeType);
    return NodeHelpers.getVersionedNodeType(node, version);
  }

  getKnownTypes(): IDataObject {
    const types: IDataObject = {};
    for (const name of this.nodes.keys()) {
      types[name] = { name };
    }
    return types;
  }
}
```

### 4.6 Custom Temporal Data Converter

Handles serialization of n8n-specific types, especially Error objects.

```typescript
import { DefaultPayloadConverter, PayloadConverterWithEncoding } from '@temporalio/common';

interface SerializedError {
  __type: 'NodeApiError' | 'NodeOperationError' | 'Error';
  message: string;
  description?: string;
  httpCode?: string;
  stack?: string;
  node?: INode;
  // ... other error properties
}

class N8nPayloadConverter extends DefaultPayloadConverter {
  constructor() {
    super();
  }

  toPayload(value: unknown): Payload | undefined {
    // Handle Error types
    if (value instanceof NodeApiError) {
      return super.toPayload({
        __type: 'NodeApiError',
        message: value.message,
        description: value.description,
        httpCode: value.httpCode,
        stack: value.stack,
        context: value.context,
      } as SerializedError);
    }

    if (value instanceof NodeOperationError) {
      return super.toPayload({
        __type: 'NodeOperationError',
        message: value.message,
        description: value.description,
        stack: value.stack,
        node: value.node,
      } as SerializedError);
    }

    if (value instanceof Error) {
      return super.toPayload({
        __type: 'Error',
        message: value.message,
        stack: value.stack,
      } as SerializedError);
    }

    return super.toPayload(value);
  }

  fromPayload<T>(payload: Payload): T {
    const value = super.fromPayload(payload);

    // Reconstruct Error types
    if (isSerializedError(value)) {
      switch (value.__type) {
        case 'NodeApiError':
          return new NodeApiError(value.node, value) as unknown as T;
        case 'NodeOperationError':
          return new NodeOperationError(value.node, value.message, value) as unknown as T;
        case 'Error':
          const error = new Error(value.message);
          error.stack = value.stack;
          return error as unknown as T;
      }
    }

    return value as T;
  }
}

function isSerializedError(value: unknown): value is SerializedError {
  return typeof value === 'object' && value !== null && '__type' in value;
}
```

### 4.7 Bundling (Not Required)

> **Note:** With the Activity-based architecture, **no webpack bundling is required**. The Temporal workflow code is minimal (~50 LOC) and has no n8n dependencies. All n8n code runs in the Activity with full Node.js capabilities.

The workflow code simply imports `@temporalio/workflow` and defines the orchestration loop. Temporal's SDK handles bundling this minimal code automatically.

```typescript
// workflows/execute-n8n-workflow.ts
// This file has NO n8n imports - just Temporal workflow SDK
import { proxyActivities, sleep } from '@temporalio/workflow';

const activities = proxyActivities<typeof import('../activities')>({
  startToCloseTimeout: '10 minutes',
});

export async function executeN8nWorkflow(input) {
  // ... minimal loop calling activities.executeWorkflowStep()
}
```

**Comparison with V8 Sandbox Approach (POC 8):**

| Aspect | V8 Sandbox (abandoned) | Activity-Based (selected) |
|--------|------------------------|---------------------------|
| Bundling | Complex webpack config, ~25MB | Automatic, ~few KB |
| Module stubbing | Required for Node.js deps | Not needed |
| n8n code location | In sandbox (problematic) | In Activity (works) |

### 4.8 Worker Bootstrap

```typescript
// src/worker/worker.ts
import { Worker } from '@temporalio/worker';
import type { WorkerOptions } from '@temporalio/worker';
import { createCompletionTrackerSinks } from './completion-tracker';
import { initializeWorkerContext } from './context';
import * as activities from '../activities';

export interface WorkerBootstrapConfig {
  temporal: TemporalWorkerConfig;
  credentials: CredentialStoreConfig;
  binaryData?: BinaryDataConfig;
  logging?: LoggingConfig;
  exitOnComplete?: number;  // Exit after N workflow completions (for testing)
}

export interface WorkerRunResult {
  shutdown: () => Promise<void>;
  runPromise: Promise<void>;
}

export async function runWorker(config: WorkerBootstrapConfig): Promise<WorkerRunResult> {
  // 1. Initialize credential store
  const credentialStore = new JsonFileCredentialStore(config.credentials.path);
  await credentialStore.load();

  // 2. Load node types (all ~400 n8n nodes)
  const nodeTypes = new TemporalNodeTypes();
  await nodeTypes.loadAll();

  // 3. Load credential types
  const credentialTypes = new TemporalCredentialTypes(nodeTypes);
  credentialTypes.loadAll();

  // 4. Create credentials helper
  const credentialsHelper = new TemporalCredentialsHelper(credentialStore, credentialTypes);

  // 5. Initialize binary data helper (optional)
  let binaryDataHelper;
  if (config.binaryData) {
    const result = await initializeBinaryDataHelper(config.binaryData);
    binaryDataHelper = result.helper;
  }

  // 6. Initialize worker context singleton (accessed by activities)
  const identity = config.temporal.identity ?? `n8n-worker-${process.pid}`;
  initializeWorkerContext({
    nodeTypes,
    credentialsHelper,
    credentialTypes,
    binaryDataHelper,
    identity,
  });

  // 7. Create Temporal connection
  const connection = await createWorkerConnection(config.temporal);

  // 8. Build worker options
  const workerOptions: WorkerOptions = {
    connection,
    namespace: config.temporal.namespace ?? 'default',
    taskQueue: config.temporal.taskQueue,
    workflowsPath: require.resolve('../workflows'),
    activities,
    identity,
    dataConverter: {
      payloadConverterPath: require.resolve('../data-converter'),
    },
  };

  // 9. Set up exit-on-complete mode using Temporal Sinks
  let completionPromise: Promise<void> | undefined;
  if (config.exitOnComplete && config.exitOnComplete > 0) {
    let resolveCompletion: () => void;
    completionPromise = new Promise<void>((resolve) => {
      resolveCompletion = resolve;
    });

    workerOptions.sinks = createCompletionTrackerSinks({
      targetCompletions: config.exitOnComplete,
      onTargetReached: () => resolveCompletion(),
    });
  }

  const worker = await Worker.create(workerOptions);

  // 10. Run worker
  const runPromise = completionPromise
    ? worker.runUntil(completionPromise)  // Exit when target completions reached
    : worker.run();                        // Run indefinitely

  return {
    shutdown: async () => {
      worker.shutdown();
      await runPromise;
      await connection.close();
    },
    runPromise,
  };
}
```

**Key Points:**
- Node types and credentials are loaded once at worker startup
- Worker context singleton is accessed by Activities via `getWorkerContext()`
- Exit-on-complete mode uses Temporal Sinks to track workflow completions
- `worker.runUntil(promise)` enables automatic shutdown after target completions
- No complex webpack bundling - Temporal bundles the minimal workflow code automatically

---

## 5. Data Structures

### 5.1 Workflow Definition (Input)

```typescript
// Same as n8n's IWorkflowBase - fully JSON serializable
interface IWorkflowBase {
  id: string;
  name: string;
  nodes: INode[];
  connections: IConnections;
  active: boolean;
  settings?: IWorkflowSettings;
  staticData?: IDataObject;
}
```

### 5.2 Node Definition

```typescript
// Credentials are references only - no secrets
interface INode {
  id: string;
  name: string;
  type: string;            // "n8n-nodes-base.slack"
  typeVersion: number;
  position: [number, number];
  parameters: INodeParameters;
  credentials?: {
    [type: string]: {
      id: string;          // "cred-123" - looked up in worker
      name: string;        // "My Slack API"
    };
  };
  // ...
}
```

### 5.3 Execution State

```typescript
// Flows through workflow, updated after each node
interface IRunExecutionData {
  startData?: {
    destinationNode?: string;
    runNodeFilter?: string[];
  };
  resultData: {
    runData: {
      [nodeName: string]: ITaskData[];  // Output of each executed node
    };
    pinData?: IPinData;
    error?: ExecutionError;
  };
  executionData?: {
    nodeExecutionStack: IExecuteData[];      // Nodes waiting to execute
    waitingExecution: IWaitingForExecution;  // Nodes waiting for other branches
    waitingExecutionSource: IWaitingForExecutionSource | null;
  };
  waitTill?: Date;  // For Wait node
}
```

### 5.4 Node Execution Data

```typescript
// Data passed between nodes
interface INodeExecutionData {
  json: IDataObject;              // Main data - any JSON-serializable object
  binary?: {
    [key: string]: IBinaryData;   // Binary references
  };
  pairedItem?: IPairedItemData;   // Item lineage tracking
  error?: NodeApiError;           // Per-item errors (continueOnFail)
}

interface IBinaryData {
  data: string;          // Base64 or storage mode identifier ("s3")
  mimeType: string;
  fileName?: string;
  fileExtension?: string;
  fileSize?: string;
  id?: string;           // "s3:bucket/path/to/file"
}
```

---

## 6. Execution Flow

### 6.1 Happy Path

```
┌─────────────────────────────────────────────────────────────────────┐
│ 1. Client starts workflow                                           │
│    temporal workflow start --task-queue n8n                         │
│      --type executeN8nWorkflow                                      │
│      --input '{"workflowPath": "./workflow.json"}'                 │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 2. Workflow loads definition, initializes stack                     │
│    nodeExecutionStack = [{ node: "Start", data: inputData }]       │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 3. Loop: Execute next node                                          │
│    ┌─────────────────────────────────────────────────────────────┐ │
│    │ Activity: executeNode("HTTP Request")                        │ │
│    │   • Create execution context                                 │ │
│    │   • Resolve credentials from store                          │ │
│    │   • Call node.execute()                                     │ │
│    │   • Return output data                                      │ │
│    └─────────────────────────────────────────────────────────────┘ │
│                              │                                      │
│                              ▼                                      │
│    Update runExecutionData.resultData.runData["HTTP Request"]      │
│    Add connected nodes to stack                                     │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│ 4. Stack empty - workflow complete                                  │
│    Return final output from last node                               │
└─────────────────────────────────────────────────────────────────────┘
```

### 6.2 Wait Node

The Wait node sets `waitTill` on the execution data. After each Activity completes, the Workflow checks for `waitTill` and calls Temporal's sleep if present.

```
┌─────────────────────────────────────────────────────────────────────┐
│ Activity: executeNode("Wait")                                       │
│   • Node sets runExecutionData.waitTill = futureDate               │
│   • Returns { waitTill: futureDate, outputData: ... }              │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Workflow: Check Activity result for waitTill                        │
│   if (result.waitTill) {                                           │
│     await workflow.sleep(waitTill - Date.now())                    │
│   }                                                                 │
│   // Workflow hibernates, no worker resources used                  │
│   // Survives worker restarts                                       │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Continue execution with next nodes                                  │
└─────────────────────────────────────────────────────────────────────┘
```

### 6.3 Sub-workflow (Deferred - Not in MVP)

> **TODO (Post-MVP):** Sub-workflow execution via Execute Workflow node is deferred. Options to explore:
> - Inline execution within same Activity
> - Child Temporal workflows for isolation
> - Sub-workflow definitions loaded from file system or registry
>
> For MVP, workflows containing Execute Workflow nodes will fail with an explicit error message.

### 6.4 Error Handling

```
┌─────────────────────────────────────────────────────────────────────┐
│ Activity: executeNode("HTTP Request")                               │
│   • API returns 500 error                                          │
│   • Node throws NodeApiError                                       │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                    ┌───────────────┴───────────────┐
                    │                               │
        continueOnFail: false           continueOnFail: true
                    │                               │
                    ▼                               ▼
┌─────────────────────────────┐   ┌─────────────────────────────────┐
│ Activity fails              │   │ Activity returns error in data   │
│ Temporal retries per policy │   │ { outputData: [{ error: ... }] } │
│ If exhausted, workflow fails│   │ Workflow continues to next node  │
└─────────────────────────────┘   └─────────────────────────────────┘
```

---

## 7. Reused vs New Components

### 7.1 Reused from n8n (in Activity Worker)

These components run inside the Activity with full Node.js capabilities:

| Component | Package | Usage | POC Validated |
|-----------|---------|-------|---------------|
| **`WorkflowExecute`** | `n8n-core` | **Full orchestration engine (~2640 LOC)** | POC 2 ✅ |
| `Workflow` class | `n8n-workflow` | Workflow graph traversal, node lookup | POC 2 ✅ |
| `WorkflowDataProxy` | `n8n-workflow` | Expression resolution (`$json`, `$node`, etc.) | POC 3 ✅ |
| `Expression` class | `n8n-workflow` | Expression evaluation | POC 3 ✅ |
| `NodeHelpers` | `n8n-workflow` | Node utility functions | POC 2 ✅ |
| All node implementations | `n8n-nodes-base` | Actual node logic | POC 2, 4 ✅ |
| `ExecuteContext` | `n8n-core` | Execution context for nodes | POC 2 ✅ |
| Type definitions | `n8n-workflow` | All interfaces | All POCs ✅ |

### 7.2 Reused with Adaptation

| Component | Original | Temporal Version | Changes |
|-----------|----------|------------------|---------|
| Credentials | `CredentialsHelper` | `TemporalCredentialsHelper` | Use file store instead of DB |
| Binary data | `BinaryDataService` | Same | Configure for S3 mode |

### 7.3 New Components

| Component | Purpose | Complexity |
|-----------|---------|------------|
| `executeN8nWorkflow` | Temporal workflow - minimal orchestration loop | ~50 LOC |
| `executeWorkflowStep` activity | Runs WorkflowExecute in Activity | ~100 LOC |
| `JsonFileCredentialStore` | File-based credential storage | ~50 LOC |
| `TemporalCredentialsHelper` | ICredentialsHelper implementation | ~150 LOC |
| `N8nPayloadConverter` | Error serialization for Temporal | ~100 LOC |
| Worker bootstrap | Initialization and configuration | ~100 LOC |

**Note:** The Activity-based approach significantly reduces complexity compared to the V8 sandbox approach. No webpack bundling or module stubbing required.

---

## 8. Implementation Phases

### Phase 1: Foundation (Activity-Based MVP) ✅ COMPLETE

**Goal:** Execute simple workflows with WorkflowExecute in Activity

**Tasks:** All completed
1. ✅ Create `packages/temporal` package structure
2. ✅ Implement `executeN8nWorkflow` Temporal workflow (minimal loop)
3. ✅ Implement `executeWorkflowStep` Activity (calls WorkflowExecute)
4. ✅ Implement `JsonFileCredentialStore`
5. ✅ Implement `TemporalCredentialsHelper`
6. ✅ Worker bootstrap with node type loading
7. ✅ Add ExecutionLifecycleHooks to buildAdditionalData (required by WorkflowExecute)
8. ✅ Implement exit-on-complete mode using Temporal Sinks

**Test Workflow:**
```json
{
  "nodes": [
    { "type": "n8n-nodes-base.manualTrigger", "name": "Start" },
    { "type": "n8n-nodes-base.set", "name": "Set Data" }
  ]
}
```

**Success Criteria:** All met
- ✅ Worker starts and loads all node types (~400 nodes)
- ✅ Simple Set node workflow executes successfully
- ✅ Output data returned correctly
- ✅ State correctly passed through Activity
- ✅ Exit-on-complete mode works for testing

### Phase 2: HTTP & Credentials

**Goal:** Execute nodes that make HTTP requests with authentication

**Tasks:**
1. Implement credential resolution in Activity
2. Test OAuth token refresh flow
3. Add HTTP Request node support
4. Implement request helper functions

**Test Workflow:**
```json
{
  "nodes": [
    { "type": "n8n-nodes-base.manualTrigger" },
    {
      "type": "n8n-nodes-base.slack",
      "credentials": { "slackApi": { "id": "cred-123" } }
    }
  ]
}
```

**Success Criteria:**
- Credentials loaded from JSON file
- HTTP requests with authentication work
- OAuth token refresh updates credential file

### Phase 3: Control Flow & Wait Nodes

**Goal:** Support branching, merging, and waiting

**Tasks:**
1. Test IF node branching (handled by WorkflowExecute)
2. Test Merge node data accumulation
3. Implement Wait node → Temporal sleep integration
4. Verify state correctly restored after wait

**Test Workflow:**
- IF node with two branches
- Merge node combining branches
- Wait node with 1-minute delay

**Success Criteria:**
- Branching workflows execute correctly
- Wait node triggers Temporal sleep (durable - survives restart)
- State correctly passed back to Activity after wait
- Merge node waits for all inputs

### Phase 4: Binary Data & Code Node

**Goal:** Support binary data and code execution

**Tasks:**
1. Integrate S3 binary data service
2. Handle binary data in node inputs/outputs
3. Add Code node support (in-process)

**Test Workflow:**
- Workflow with file download/upload (HTTP Request → binary processing)
- Workflow with Code node executing JavaScript

**Success Criteria:**
- Binary data flows through S3
- Code node executes JavaScript

> **Note:** Sub-workflow execution (Execute Workflow node) is deferred to post-MVP.

### Phase 5: Production Readiness

**Goal:** Error handling, observability, CLI

**Tasks:**
1. Implement custom data converter for errors (POC 5 pattern)
2. Verify error handling and continueOnFail work
3. Create CLI tool for worker and workflow execution
4. Add logging and metrics
5. Write documentation

**Deliverables:**
- `temporal-n8n worker start --config ./config.json`
- `temporal-n8n workflow run --file ./workflow.json`
- Error recovery and retry policies
- Observability integration

### Future: State Size Optimization

**Goal:** Handle large workflows that exceed Temporal's 2MB payload limit

**Tasks:**
1. Implement claim-check pattern for `runExecutionData`
2. Store state in external storage (S3/Redis)
3. Pass only references through Temporal history
4. Add state compression

**This is out of scope for MVP but documented for future reference.**

---

## 9. Risks and Mitigations

### 9.1 Technical Risks

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| **Output exceeds 2MB limit** | Medium | Low | Using diff output keeps size small; claim-check if needed (Local Activity inputs not in history) |
| Activity fails mid-execution | Medium | Medium | Entire Activity retries; acceptable for MVP |
| Some nodes have hidden DB dependencies | Medium | Low | Test all node categories early |
| Expression evaluation context issues | Medium | Low | WorkflowExecute handles this (proven in n8n) |
| Binary data exceeds Temporal limits | Medium | Medium | Use S3 references, not inline data |
| OAuth refresh race conditions | Low | Low | File locking or single-worker for MVP |
| Long-running nodes timeout | Medium | Medium | Configure appropriate Activity timeouts |

### 9.2 Scope Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Node compatibility issues discovered late | High | Early testing with diverse node types |
| Sub-workflow complexity underestimated | Medium | Start with inline, add child workflows later |
| Performance issues with large workflows | Medium | Benchmark with realistic workflows |
| State size grows unexpectedly | Medium | Add metrics; plan claim-check pattern for future |

### 9.3 Activity-Based Architecture Specific Risks

| Risk | Description | Mitigation |
|------|-------------|------------|
| No per-node checkpointing | If Activity fails after executing 10 nodes, all 10 re-execute | Acceptable for MVP; most workflows are small |
| State serialization overhead | Full state serialized on each Activity call | JSON is fast; optimize later if needed |
| History size growth | Each Activity call adds output to history | ✅ Mitigated: Local Activity inputs NOT in history; diff output keeps history small |

---

## 10. Future Work

### 10.1 Near-term (Post-MVP)

- **Claim-check pattern for state** - Store `runExecutionData` in S3/Redis, pass only references through Temporal. Critical for workflows with large data payloads.
- **Per-node checkpointing** - Activity yields after each node; enables finer-grained recovery
- **External task runner** for Code node sandboxing
- **Child Temporal workflows** for sub-workflows (better isolation)
- **Encrypted credential store** (Vault integration)

### 10.2 Medium-term

- **Trigger support** via separate trigger service
- **n8n UI integration** for Temporal execution
- **Multi-tenant credentials** with namespace isolation
- **Workflow continue-as-new** for very long workflows
- **Activity heartbeating** for long-running nodes
- **Workflow versioning** support

### 10.3 Long-term

- **Distributed tracing** integration
- **Cost attribution** per workflow/tenant
- **Workflow replay** for debugging
- **A/B testing** of workflow versions
- **Automatic scaling** based on queue depth
- **Custom minimal orchestrator** - Option A from architecture options, if Activity-based approach proves limiting

---

## 11. POC Validation Summary

The following POCs validated key architectural decisions:

| POC | Validated | Key Finding |
|-----|-----------|-------------|
| POC 1 | Node loading | All ~400 n8n nodes load successfully outside n8n server |
| POC 2 | Node execution | Nodes execute via Activities with proper context |
| POC 3 | Expression evaluation | Full expression support including `$json`, `$node` references |
| POC 4 | HTTP + Credentials | HTTP nodes work; credentials passed as parameters |
| POC 5 | Serialization | JSON works for all n8n types; custom converter needed for Errors |
| POC 6 | ExecutionLifecycleHooks | Hooks provide natural Activity boundaries |
| POC 7 | Sub-workflow execution | Sub-workflows work with inline execution |
| POC 8 | WorkflowExecute bundling | Classes bundle into V8 sandbox (~17-25 MB) |
| **POC 9** | **❌ WorkflowExecute execution** | **n8n packages cannot execute in Temporal sandbox due to Node.js dependencies** |
| **POC 10** | **✅ Local Activity history** | **Local Activity inputs NOT stored in Temporal history - enables full state passing** |

### POC 10: Local Activity History Behavior

POC 10 validated that **Local Activity inputs are NOT stored in Temporal workflow history** in the TypeScript SDK. This is a critical finding that enables our architecture:

- Full `IRunExecutionData` can be passed to Local Activities without history bloat
- Only Activity **outputs** (our diff) are recorded in history
- This eliminates the primary concern about state size growing with workflow progress
- No need for claim-check pattern for inputs (only for outputs if they exceed 2MB)

This finding makes the Activity-based orchestration approach significantly more viable for production use.

### POC 9: Critical Finding

POC 9 attempted to run WorkflowExecute inside Temporal's V8 sandbox with Activity delegation. **This approach failed** due to the following dependency chain:

1. **reflect-metadata** (via @n8n/di): Cannot extend frozen `Reflect` global object
2. **xml2js/sax** (via n8n-workflow): Requires Node.js `Stream` class
3. **recast** (via @n8n/tournament): Requires Node.js `assert` module
4. Many other transitive dependencies assume Node.js APIs

**Attempts to stub dependencies failed** because they're used at module initialization time, not just at runtime.

### Revised Architecture Options

Given POC 9 findings, the original "Option B" is not viable:

**Option A: Custom minimal orchestrator**
- Write new orchestration code (~500-1000 LOC) without n8n dependencies
- Runs in Temporal sandbox (deterministic)
- Delegates ALL n8n code (including expressions) to Activities
- Trade-off: Must reimplement merge nodes, wait logic, error routing
- Status: Not selected for MVP due to implementation complexity

**Option B: ~~Bundle WorkflowExecute~~** — ❌ INVALIDATED
- ~~Reuses battle-tested orchestration logic~~
- Cannot execute due to Node.js dependencies (reflect-metadata, xml2js, recast)

**Option C: Activity-based orchestration** — ✅ SELECTED
- All orchestration (WorkflowExecute) runs in Activities
- Temporal Workflow is minimal loop calling Activity repeatedly
- Full state passed to/from Activity on each invocation
- Trade-off: Loses deterministic replay for orchestration; Activity retries from start on failure
- Benefit: Reuses all n8n code without modification; simplest implementation
- Future optimization: Claim-check pattern for large state (out of MVP scope)

---

## Appendix A: Package Structure

```
packages/temporal/
├── package.json
├── tsconfig.json
├── CLAUDE.md                        # Development and testing guide
├── README.md
├── src/
│   ├── index.ts                     # Public exports
│   │
│   ├── workflows/
│   │   ├── index.ts                 # Workflow exports
│   │   └── execute-n8n-workflow.ts  # Temporal workflow (minimal loop)
│   │
│   ├── activities/
│   │   ├── index.ts                 # Activity exports
│   │   └── execute-workflow-step.ts # WorkflowExecute-based activity
│   │
│   ├── worker/
│   │   ├── index.ts                 # Worker exports
│   │   ├── worker.ts                # Worker bootstrap & runWorker()
│   │   ├── context.ts               # Worker context singleton
│   │   └── completion-tracker.ts    # Sinks for exit-on-complete mode
│   │
│   ├── credentials/
│   │   ├── credential-store.ts      # Store interface
│   │   ├── json-file-store.ts       # JSON file implementation
│   │   ├── credential-types.ts      # CredentialTypes loader
│   │   └── credentials-helper.ts    # ICredentialsHelper implementation
│   │
│   ├── nodes/
│   │   ├── node-types.ts            # INodeTypes implementation
│   │   └── loader.ts                # Node package loader
│   │
│   ├── binary-data/
│   │   ├── index.ts
│   │   └── temporal-binary-data-helper.ts  # S3/filesystem support
│   │
│   ├── connection/
│   │   ├── client.ts                # Temporal client factory
│   │   └── worker-connection.ts     # Worker connection factory
│   │
│   ├── data-converter/
│   │   ├── index.ts                 # Data converter exports
│   │   └── n8n-payload-converter.ts # Error serialization
│   │
│   ├── config/
│   │   └── types.ts                 # Configuration type definitions
│   │
│   ├── types/
│   │   ├── index.ts                 # Type exports
│   │   ├── activity-types.ts        # Activity input/output types
│   │   ├── workflow-types.ts        # Workflow input/output types
│   │   └── serialized-error.ts      # Error serialization types
│   │
│   ├── utils/
│   │   ├── additional-data.ts       # Build IWorkflowExecuteAdditionalData
│   │   ├── error-serializer.ts      # Error serialization utilities
│   │   ├── execution-data.ts        # Execution data helpers
│   │   ├── state-merge.ts           # State merge utilities
│   │   ├── workflow-loader.ts       # Load workflow from JSON file
│   │   └── logger.ts                # Logging utilities
│   │
│   └── cli/
│       ├── index.ts                 # CLI entry point (oclif)
│       └── commands/
│           ├── base.ts              # Base command class
│           ├── index.ts             # Command index
│           ├── worker/
│           │   └── start.ts         # Worker start command
│           └── workflow/
│               ├── start.ts         # Start workflow (async)
│               ├── run.ts           # Run workflow (blocking)
│               ├── status.ts        # Check workflow status
│               └── result.ts        # Get workflow result
│
├── test/
│   ├── fixtures/
│   │   ├── workflows/               # Test workflow JSON files
│   │   ├── credentials/             # Test credential files
│   │   └── config/                  # Test config files
│   ├── activities/                  # Activity tests
│   └── utils/                       # Utility tests
│
└── dist/                            # Compiled output
```

---

## Appendix B: Configuration

```typescript
// From src/config/types.ts
interface TemporalN8nConfig {
  temporal: {
    address: string;                    // "localhost:7233"
    namespace?: string;                 // "default"
    taskQueue: string;                  // "n8n-workflows"
    identity?: string;                  // Worker identity
    tls?: {                             // Optional TLS config
      clientCert?: string;
      clientKey?: string;
      serverRootCACert?: string;
      serverNameOverride?: string;
    };
    maxConcurrentActivityTaskExecutions?: number;
    maxConcurrentWorkflowTaskExecutions?: number;
    maxCachedWorkflows?: number;
  };
  credentials: {
    path: string;                       // "./credentials.json"
  };
  binaryData?: {
    mode: 'filesystem' | 's3';
    s3?: {
      bucket: string;
      region: string;
      host?: string;                    // For S3-compatible services
      protocol?: 'http' | 'https';
      accessKeyId?: string;
      secretAccessKey?: string;
      authAutoDetect?: boolean;         // Use IAM roles
    };
    filesystem?: {
      basePath: string;
    };
  };
  execution?: {
    activityTimeout?: number;           // Default activity timeout (ms)
    retryPolicy?: {
      maximumAttempts?: number;
      initialInterval?: string;         // "1s"
      maximumInterval?: string;         // "1m"
      backoffCoefficient?: number;
    };
  };
  logging?: {
    level?: 'debug' | 'info' | 'warn' | 'error';
    format?: 'text' | 'json';
  };
}
```

**Example config.json:**

```json
{
  "temporal": {
    "address": "localhost:7233",
    "namespace": "default",
    "taskQueue": "n8n-workflows"
  },
  "credentials": {
    "path": "./credentials.json"
  },
  "binaryData": {
    "mode": "s3",
    "s3": {
      "bucket": "n8n-binary-data",
      "region": "us-east-1"
    }
  },
  "logging": {
    "level": "info"
  }
}
```

**Minimal test config:**

```json
{
  "temporal": {
    "address": "localhost:7233",
    "taskQueue": "n8n-test"
  },
  "credentials": {
    "path": "./credentials/empty.json"
  }
}
```

---

## Appendix C: CLI Usage

### temporal-n8n CLI

```bash
# Start worker
node dist/cli/index.js worker start --config ./config.json

# Start worker with verbose logging
node dist/cli/index.js worker start --config ./config.json --verbose

# Start worker with exit-on-complete mode (for testing)
# Worker exits after N workflow completions
node dist/cli/index.js worker start --config ./config.json --exit-on-complete 1

# Run workflow (blocking - waits for result)
node dist/cli/index.js workflow run \
  --workflow ./my-workflow.json \
  --input ./input-data.json \
  --config ./config.json

# Start workflow (async - returns immediately)
node dist/cli/index.js workflow start \
  --workflow ./my-workflow.json \
  --config ./config.json
# Returns workflow ID and run ID

# Check workflow status
node dist/cli/index.js workflow status --workflow-id <id> --config ./config.json

# Get workflow result
node dist/cli/index.js workflow result --workflow-id <id> --config ./config.json
```

### Temporal CLI for Workflow Inspection

Use the standard Temporal CLI to inspect workflow state. For local dev server without TLS:

```bash
# Describe workflow metadata, status, and result
temporal workflow describe \
  --workflow-id <WORKFLOW_ID> \
  --namespace default \
  --tls=false

# Show workflow event history
temporal workflow show \
  --workflow-id <WORKFLOW_ID> \
  --namespace default \
  --tls=false
```

**Example `temporal workflow describe` output:**
```
Execution Info:
  WorkflowId            test-1234567890
  RunId                 019b60ce-9307-7f1f-8097-a055b5c696a4
  Type                  executeN8nWorkflow
  Status                COMPLETED
  HistoryLength         6

Results:
  Status          COMPLETED
  Result          {"success":true,"data":[...],"status":"success"}
```

**Example `temporal workflow show` output:**
```
Progress:
  ID           Time                     Type
    1  2025-12-27T17:15:09Z  WorkflowExecutionStarted
    2  2025-12-27T17:15:09Z  WorkflowTaskScheduled
    3  2025-12-27T17:16:32Z  WorkflowTaskStarted
    4  2025-12-27T17:16:32Z  WorkflowTaskCompleted
    5  2025-12-27T17:16:32Z  MarkerRecorded
    6  2025-12-27T17:16:32Z  WorkflowExecutionCompleted
```

---

## Appendix D: Testing

### Prerequisites

Start a local Temporal dev server:

```bash
temporal server start-dev --port 7233 --namespace default
```

### Quick Test

```bash
cd packages/temporal
pnpm build

# Start a workflow
node dist/cli/index.js workflow start \
  --config test/fixtures/config/simple.json \
  --workflow test/fixtures/workflows/simple-set.json

# Run worker to process it (exits after 1 completion)
node dist/cli/index.js worker start \
  --config test/fixtures/config/simple.json \
  --exit-on-complete 1

# Check result with Temporal CLI
temporal workflow describe --workflow-id <ID> --namespace default --tls=false
```

### Exit-on-Complete Mode

The `--exit-on-complete N` flag uses Temporal Sinks to track workflow completions.
When the target count is reached, the worker gracefully shuts down.

This is implemented via:
- `src/worker/completion-tracker.ts` - Sink that tracks completions
- `src/workflows/execute-n8n-workflow.ts` - Calls `completionTracker.trackCompletion(status)` on workflow completion
- `src/worker/worker.ts` - Uses `worker.runUntil(completionPromise)` to exit when target reached
