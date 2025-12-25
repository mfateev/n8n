# Temporal Integration for n8n Workflows

## Design Document

**Status:** Updated based on POC results
**Date:** 2025-12-25
**Author:** Generated from research session

> **Note:** This design has been validated through 8 POCs. See `temporal-poc-results.md` for detailed findings.

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
| **Orchestration** | **WorkflowExecute in V8 sandbox** | Reuse ~2640 LOC of battle-tested orchestration logic (POC 8 validated) |
| Node execution | Delegated to Activities | Node I/O happens outside sandbox via Activity calls |
| Bundle size | ~17-25 MB (optimization deferred) | Acceptable for workers; lean approach lacks critical features |
| Database dependency | None | Workflow from file, credentials from JSON |
| Credential management | Worker-local JSON file | Simplicity for MVP, secrets never in Temporal history |
| Node support | All ~400 nodes | Generic integration, no per-node work |
| Binary data | S3/Object Store | Distributed access, existing n8n support |
| Sub-workflows | Inline execution | Simpler state management for MVP |
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

---

## 3. Architecture Overview

The key insight from POC 8 is that **WorkflowExecute can run inside Temporal's deterministic V8 sandbox**. This enables reusing n8n's battle-tested orchestration logic while delegating actual node execution (I/O) to Activities.

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
│      Temporal V8 Sandbox          │ │           Activity Workers             │
│    (Deterministic Workflow)       │ │                                        │
├───────────────────────────────────┤ ├───────────────────────────────────────┤
│                                   │ │  Worker Initialization:                │
│  WorkflowExecute (bundled)        │ │  • Load credentials.json               │
│  ├── Graph traversal (~410 LOC)   │ │  • Load all node types                 │
│  ├── Execution stack management   │ │  • Initialize BinaryDataService (S3)   │
│  ├── Merge node handling          │ │  • Setup DI container                  │
│  ├── Wait node state              │ │                                        │
│  └── Error handling/routing       │ │  executeNode Activity:                 │
│                                   │ │  • Create ExecuteContext               │
│  ProxyNodeTypes:                  │ │  • Resolve credentials                 │
│  └── execute() → Activity call ───┼─┼──► Run actual node (HTTP, DB, etc.)   │
│                                   │ │  • Return output data                  │
│  Bundle: ~17-25 MB                │ │                                        │
│  (n8n-core + n8n-workflow)        │ │  External Resources:                   │
│                                   │ │  • credentials.json ◄──► CredentialStore
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

1. **WorkflowExecute runs in V8 sandbox**: The entire orchestration engine (~2640 LOC) is bundled and runs deterministically inside Temporal's workflow sandbox.

2. **ProxyNodeTypes delegates to Activities**: Instead of executing nodes directly, `ProxyNodeTypes.execute()` calls a Temporal Activity that runs on the Activity worker with full I/O capabilities.

3. **State is checkpointed per node**: Each Activity completion is a checkpoint. If a worker crashes, Temporal replays from the last completed node.

4. **Bundling required**: WorkflowExecute and n8n-workflow are bundled into a ~17-25 MB JavaScript bundle that runs in the V8 isolate.

---

## 4. Component Design

### 4.1 Temporal Workflow: `executeN8nWorkflow`

The Temporal workflow runs **WorkflowExecute inside the V8 sandbox** with a ProxyNodeTypes that delegates node execution to Activities.

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
import { proxyActivities } from '@temporalio/workflow';
import { WorkflowExecute } from 'n8n-core';  // Bundled into V8 sandbox
import { Workflow, type INodeType, type INodeTypes } from 'n8n-workflow';

const activities = proxyActivities<typeof import('./activities')>({
  startToCloseTimeout: '5 minutes',
});

/**
 * ProxyNodeTypes - delegates execute() to Activities
 * Runs inside V8 sandbox, calls out to Activity workers for actual I/O
 */
class ProxyNodeTypes implements INodeTypes {
  getByNameAndVersion(nodeType: string, version?: number): INodeType {
    return {
      description: { /* minimal description */ },
      // This execute function runs in sandbox but calls Activity
      execute: async function(this: IExecuteFunctions) {
        const result = await activities.executeNode({
          node: this.getNode(),
          inputData: this.getInputData(),
          // ... other context
        });
        return result.outputData;
      },
    } as INodeType;
  }
}

export async function executeN8nWorkflow(
  input: ExecuteN8nWorkflowInput
): Promise<ExecuteN8nWorkflowOutput> {
  // 1. Create Workflow instance with ProxyNodeTypes
  const nodeTypes = new ProxyNodeTypes();
  const workflow = new Workflow({
    id: input.workflowId,
    name: input.workflowName,
    nodes: input.nodes,
    connections: input.connections,
    nodeTypes,
    active: false,
  });

  // 2. Create WorkflowExecute - reusing n8n's ~2640 LOC orchestration
  const workflowExecute = new WorkflowExecute(additionalData, 'integrated');

  // 3. Run workflow - WorkflowExecute handles:
  //    - Graph traversal
  //    - Merge node data accumulation
  //    - Wait node state
  //    - Error handling/routing
  //    - Execution order
  const result = await workflowExecute.run(workflow, undefined, undefined, input.inputData);

  return {
    success: !result.error,
    data: getLastNodeOutput(result),
    runExecutionData: result,
  };
}
```

**Key Insight**: WorkflowExecute's orchestration logic runs deterministically in the sandbox. When it calls `nodeType.execute()`, the ProxyNodeTypes redirects to a Temporal Activity for actual I/O.

### 4.2 Temporal Activity: `executeNode`

Executes a single n8n node. This is where the actual work happens.

```typescript
interface ExecuteNodeInput {
  workflowDefinition: IWorkflowBase;
  node: INode;
  inputData: ITaskDataConnections;
  runExecutionData: IRunExecutionData;
  runIndex: number;
  connectionInputData: INodeExecutionData[];
  executeData: IExecuteData;
}

interface ExecuteNodeOutput {
  outputData: ITaskDataConnections | null;
  updatedRunExecutionData: IRunExecutionData;
  waitTill?: Date;
  error?: SerializedError;
  hints?: NodeExecutionHint[];
}
```

**Activity Implementation:**

```typescript
async function executeNode(input: ExecuteNodeInput): Promise<ExecuteNodeOutput> {
  const { workflowDefinition, node, inputData, runExecutionData, runIndex } = input;

  // 1. Create Workflow instance with our NodeTypes
  const workflow = new Workflow({
    id: workflowDefinition.id,
    name: workflowDefinition.name,
    nodes: workflowDefinition.nodes,
    connections: workflowDefinition.connections,
    nodeTypes: workerContext.nodeTypes,  // Pre-loaded at worker startup
    settings: workflowDefinition.settings,
  });

  // 2. Build additional data (credentials helper, etc.)
  const additionalData = buildAdditionalData({
    credentialsHelper: workerContext.credentialsHelper,
    executeWorkflow: inlineExecuteWorkflow,  // For sub-workflows
    // ... other required fields
  });

  // 3. Get node type and execute
  const nodeType = workflow.nodeTypes.getByNameAndVersion(node.type, node.typeVersion);

  // 4. Create execution context
  const executionContext = new ExecuteContext(
    workflow,
    node,
    additionalData,
    'integrated',
    runExecutionData,
    runIndex,
    input.connectionInputData,
    inputData,
    input.executeData,
    [],  // closeFunctions
  );

  // 5. Execute the node
  try {
    const outputData = await nodeType.execute.call(executionContext);

    return {
      outputData,
      updatedRunExecutionData: updateRunData(runExecutionData, node.name, outputData),
      waitTill: runExecutionData.waitTill,
      hints: executionContext.hints,
    };
  } catch (error) {
    return {
      outputData: null,
      updatedRunExecutionData: runExecutionData,
      error: serializeError(error),
    };
  }
}
```

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

### 4.7 Webpack Bundling Configuration

The workflow code must be bundled for Temporal's V8 sandbox. POC 8 validated this configuration:

```typescript
// bundle-config.ts
import { bundleWorkflowCode } from '@temporalio/worker';

const NODE_BUILTINS = [
  'fs', 'fs/promises', 'path', 'os', 'crypto', 'http', 'https', /* ... */
];

// Modules to externalize (not bundled, resolved at runtime on Activity worker)
const IGNORE_MODULES = [
  ...NODE_BUILTINS,
  ...NODE_BUILTINS.map((m) => `node:${m}`),
  // Database, network, expression libs handled in Activities
  'luxon', 'lodash', 'jmespath', '@n8n/tournament',
  '@sentry/node', 'better-sqlite3', 'pg', 'mysql2',
  // ... see POC 8 for full list
];

export async function bundleWorkflows() {
  const { code } = await bundleWorkflowCode({
    workflowsPath: require.resolve('./workflows'),
    ignoreModules: IGNORE_MODULES,
    webpackConfigHook: (config) => {
      // Handle node: prefixed imports
      const nodeExternals: Record<string, string> = {};
      for (const builtin of NODE_BUILTINS) {
        nodeExternals[`node:${builtin}`] = `commonjs node:${builtin}`;
      }
      config.externals = { ...config.externals, ...nodeExternals };
      return config;
    },
  });
  return code;  // ~17-25 MB bundle
}
```

**Bundle Contents:**
- WorkflowExecute class (~2640 LOC orchestration)
- Workflow class (graph traversal)
- NodeHelpers, Expression evaluation
- n8n-workflow types and utilities

**Not Bundled (handled in Activities):**
- Actual node implementations (n8n-nodes-base)
- Credential decryption
- Binary data handling
- HTTP requests

### 4.8 Worker Bootstrap

```typescript
// worker.ts
import { Worker, NativeConnection, bundleWorkflowCode } from '@temporalio/worker';
import { N8nPayloadConverter } from './data-converter';
import { TemporalNodeTypes } from './node-types';
import { TemporalCredentialsHelper } from './credentials-helper';
import { JsonFileCredentialStore } from './credential-store';
import * as activities from './activities';

interface WorkerConfig {
  temporalAddress: string;
  taskQueue: string;
  credentialsPath: string;
  s3Config: {
    bucket: string;
    region: string;
  };
}

export async function runWorker(config: WorkerConfig): Promise<void> {
  // 1. Initialize credential store
  const credentialStore = new JsonFileCredentialStore(config.credentialsPath);
  await credentialStore.load();

  // 2. Load node types
  const nodeTypes = new TemporalNodeTypes();
  await nodeTypes.loadAll();

  // 3. Load credential types
  const credentialTypes = new CredentialTypes();
  await credentialTypes.loadAll();

  // 4. Create credentials helper
  const credentialsHelper = new TemporalCredentialsHelper(credentialStore, credentialTypes);

  // 5. Initialize binary data service
  const binaryDataService = new BinaryDataService({
    mode: 's3',
    ...config.s3Config,
  });
  await binaryDataService.init();

  // 6. Set worker context (available to activities)
  setWorkerContext({
    nodeTypes,
    credentialsHelper,
    credentialTypes,
    binaryDataService,
  });

  // 7. Create Temporal connection
  const connection = await NativeConnection.connect({
    address: config.temporalAddress,
  });

  // 8. Create and run worker
  const worker = await Worker.create({
    connection,
    taskQueue: config.taskQueue,
    workflowsPath: require.resolve('./workflows'),
    activities,
    dataConverter: {
      payloadConverterPath: require.resolve('./data-converter'),
    },
  });

  console.log('Worker started');
  await worker.run();
}
```

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

```
┌─────────────────────────────────────────────────────────────────────┐
│ Activity: executeNode("Wait")                                       │
│   • Node sets runExecutionData.waitTill = futureDate               │
│   • Returns { waitTill: futureDate }                               │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Workflow: Temporal sleep                                            │
│   await workflow.sleep(waitTill - now)                             │
│   // Workflow hibernates, no worker resources used                  │
│   // Survives worker restarts                                       │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Continue execution with next nodes                                  │
└─────────────────────────────────────────────────────────────────────┘
```

### 6.3 Sub-workflow (Inline)

```
┌─────────────────────────────────────────────────────────────────────┐
│ Activity: executeNode("Execute Workflow")                           │
│   • Node calls this.executeWorkflow({ id: "sub-workflow-id" })     │
│   • additionalData.executeWorkflow is our inline implementation    │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│ inlineExecuteWorkflow():                                            │
│   • Load sub-workflow definition                                    │
│   • Create new WorkflowExecute instance                            │
│   • Run to completion (recursive)                                  │
│   • Return output data                                             │
│   Note: All within same activity - not a child Temporal workflow   │
└─────────────────────────────────────────────────────────────────────┘
                                    │
                                    ▼
┌─────────────────────────────────────────────────────────────────────┐
│ Activity returns sub-workflow output as node output                 │
└─────────────────────────────────────────────────────────────────────┘
```

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

### 7.1 Reused from n8n (Bundled into V8 Sandbox)

These components are bundled and run inside Temporal's deterministic V8 sandbox:

| Component | Package | Usage | POC Validated |
|-----------|---------|-------|---------------|
| **`WorkflowExecute`** | `n8n-core` | **Full orchestration engine (~2640 LOC)** | POC 8 ✅ |
| `Workflow` class | `n8n-workflow` | Workflow graph traversal, node lookup | POC 8 ✅ |
| `WorkflowDataProxy` | `n8n-workflow` | Expression resolution (`$json`, `$node`, etc.) | POC 3 ✅ |
| `Expression` class | `n8n-workflow` | Expression evaluation | POC 3 ✅ |
| `NodeHelpers` | `n8n-workflow` | Node utility functions | POC 8 ✅ |
| Type definitions | `n8n-workflow` | All interfaces | All POCs ✅ |

### 7.2 Reused in Activity Workers (Not Bundled)

These components run on Activity workers with full I/O capabilities:

| Component | Package | Usage | POC Validated |
|-----------|---------|-------|---------------|
| All node implementations | `n8n-nodes-base` | Actual node logic | POC 2, 4 ✅ |
| `ExecuteContext` | `n8n-core` | Execution context for nodes | POC 2 ✅ |
| `BinaryDataService` | `n8n-core` | S3 binary data handling | - |

### 7.3 Reused with Adaptation

| Component | Original | Temporal Version | Changes |
|-----------|----------|------------------|---------|
| Node types | `INodeTypes` | `ProxyNodeTypes` | Delegates execute() to Activity |
| Credentials | `CredentialsHelper` | `TemporalCredentialsHelper` | Use file store instead of DB |

### 7.4 New Components

| Component | Purpose | POC Validated |
|-----------|---------|---------------|
| `executeN8nWorkflow` | Temporal workflow with bundled WorkflowExecute | POC 8 ✅ |
| `executeNode` activity | Single node execution on Activity worker | POC 2 ✅ |
| `ProxyNodeTypes` | Delegates node execute() to Activities | POC 8 ✅ |
| `JsonFileCredentialStore` | File-based credential storage | - |
| `N8nPayloadConverter` | Error serialization for Temporal | POC 5 ✅ |
| Worker bootstrap | Initialization and configuration | POC 1 ✅ |
| Webpack bundling config | Bundle WorkflowExecute for V8 sandbox | POC 8 ✅ |

---

## 8. Implementation Phases

### Phase 1: Foundation

**Goal:** Execute simple workflows with WorkflowExecute bundled in V8 sandbox

**Tasks:**
1. Create `packages/temporal` package structure
2. **Setup webpack bundling for WorkflowExecute** (POC 8 config)
3. Implement `ProxyNodeTypes` that delegates to Activities
4. Implement `JsonFileCredentialStore`
5. Implement `TemporalCredentialsHelper`
6. Create Temporal workflow with bundled WorkflowExecute
7. Worker bootstrap with DI setup

**Test Workflow:**
```json
{
  "nodes": [
    { "type": "n8n-nodes-base.manualTrigger", "name": "Start" },
    { "type": "n8n-nodes-base.set", "name": "Set Data" }
  ]
}
```

**Success Criteria:**
- Worker starts and loads all node types
- Simple Set node workflow executes successfully
- Output data returned correctly

### Phase 2: HTTP & Credentials

**Goal:** Execute nodes that make HTTP requests with authentication

**Tasks:**
1. Implement credential resolution in activity
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

### Phase 3: Control Flow

**Goal:** Support branching, merging, and waiting (handled by bundled WorkflowExecute)

**Tasks:**
1. Verify WorkflowExecute handles execution stack correctly in sandbox
2. Test IF node branching
3. Test Merge node data accumulation
4. Implement Wait node → Temporal sleep integration

**Test Workflow:**
- IF node with two branches
- Merge node combining branches
- Wait node with 1-minute delay

**Success Criteria:**
- Branching workflows execute correctly
- Wait node uses Temporal sleep (survives restart)
- Merge node waits for all inputs

### Phase 4: Sub-workflows & Binary Data

**Goal:** Complete workflow capabilities

**Tasks:**
1. Implement inline sub-workflow execution
2. Integrate S3 binary data service
3. Handle binary data in node inputs/outputs
4. Add Code node support (in-process)

**Test Workflow:**
- Parent workflow calling child workflow
- Workflow with file download/upload

**Success Criteria:**
- Sub-workflows execute inline
- Binary data flows through S3
- Code node executes JavaScript

### Phase 5: Production Readiness

**Goal:** Error handling, observability, CLI

**Tasks:**
1. Implement custom data converter for errors (POC 5 pattern)
2. Verify error handling and continueOnFail work via WorkflowExecute
3. Create CLI tool for worker and workflow execution
4. Add logging and metrics
5. Write documentation

**Deliverables:**
- `temporal-n8n worker start --config ./config.json`
- `temporal-n8n workflow run --file ./workflow.json`
- Error recovery and retry policies
- Observability integration

---

## 9. Risks and Mitigations

### 9.1 Technical Risks

| Risk | Impact | Likelihood | Mitigation |
|------|--------|------------|------------|
| Some nodes have hidden DB dependencies | Medium | Low | Test all node categories early |
| Expression evaluation context issues | High | Medium | Comprehensive testing with complex expressions |
| Binary data exceeds Temporal limits | Medium | Medium | TODO: Implement claim check pattern |
| OAuth refresh race conditions | Low | Low | File locking or single-worker for MVP |
| DI container conflicts | Medium | Low | Isolated container per activity |

### 9.2 Scope Risks

| Risk | Impact | Mitigation |
|------|--------|------------|
| Node compatibility issues discovered late | High | Early testing with diverse node types |
| Sub-workflow complexity underestimated | Medium | Start with inline, add child workflows later |
| Performance issues with large workflows | Medium | Benchmark with realistic workflows |

---

## 10. Future Work

### 10.1 Near-term (Post-MVP)

- **Claim check pattern** for large payloads (S3 offload)
- **External task runner** for Code node sandboxing
- **Child Temporal workflows** for sub-workflows (better isolation)
- **Encrypted credential store** (Vault integration)
- **Workflow versioning** support

### 10.2 Medium-term

- **Trigger support** via separate trigger service
- **n8n UI integration** for Temporal execution
- **Multi-tenant credentials** with namespace isolation
- **Workflow continue-as-new** for very long workflows
- **Activity heartbeating** for long-running nodes

### 10.3 Long-term

- **Distributed tracing** integration
- **Cost attribution** per workflow/tenant
- **Workflow replay** for debugging
- **A/B testing** of workflow versions
- **Automatic scaling** based on queue depth

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
| **POC 8** | **WorkflowExecute bundling** | **Full orchestration engine runs in V8 sandbox (~17-25 MB)** |

### Why WorkflowExecute in V8 Sandbox?

We evaluated two approaches for orchestration:

**Option A: Lean orchestration (~200 LOC, 7 MB bundle)** — Not chosen
- Would require reimplementing: merge nodes, wait nodes, multiple outputs, error handling
- Missing ~700+ LOC of edge case handling
- Risk of subtle bugs in complex workflow execution

**Option B: Bundle WorkflowExecute (~2640 LOC, 17-25 MB bundle)** — Chosen ✅
- Reuses battle-tested orchestration logic
- Full feature parity with n8n
- Handles all edge cases (merge data accumulation, wait states, error routing)
- Bundle size acceptable for Temporal workers (loaded once, reused)

---

## Appendix A: Package Structure

```
packages/temporal/
├── package.json
├── tsconfig.json
├── src/
│   ├── index.ts
│   ├── worker.ts                    # Worker bootstrap
│   ├── workflows/
│   │   └── execute-n8n-workflow.ts  # Temporal workflow
│   ├── activities/
│   │   ├── index.ts
│   │   ├── execute-node.ts          # Node execution activity
│   │   └── load-workflow.ts         # Workflow loading activity
│   ├── credentials/
│   │   ├── credential-store.ts      # Store interface
│   │   ├── json-file-store.ts       # JSON file implementation
│   │   └── credentials-helper.ts    # ICredentialsHelper impl
│   ├── nodes/
│   │   └── node-types.ts            # INodeTypes implementation
│   ├── data-converter/
│   │   └── n8n-payload-converter.ts # Error serialization
│   ├── utils/
│   │   ├── additional-data.ts       # Build IWorkflowExecuteAdditionalData
│   │   └── execution-helpers.ts     # Stack management, etc.
│   └── cli/
│       ├── index.ts                 # CLI entry point
│       ├── commands/
│       │   ├── worker.ts            # Start worker command
│       │   └── run.ts               # Run workflow command
│       └── config.ts                # Configuration handling
├── test/
│   ├── workflows/                   # Test workflow JSON files
│   ├── credentials/                 # Test credential files
│   └── *.test.ts                    # Test files
└── README.md
```

---

## Appendix B: Configuration

```typescript
interface TemporalN8nConfig {
  temporal: {
    address: string;           // "localhost:7233"
    namespace: string;         // "default"
    taskQueue: string;         // "n8n-workflows"
  };
  credentials: {
    path: string;              // "./credentials.json"
  };
  binaryData: {
    mode: 's3';
    s3: {
      bucket: string;
      region: string;
      accessKeyId?: string;    // Or use IAM role
      secretAccessKey?: string;
    };
  };
  execution: {
    timeout: number;           // Default activity timeout (ms)
    retryPolicy: {
      maximumAttempts: number;
      initialInterval: string; // "1s"
      maximumInterval: string; // "1m"
      backoffCoefficient: number;
    };
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
  "execution": {
    "timeout": 300000,
    "retryPolicy": {
      "maximumAttempts": 3,
      "initialInterval": "1s",
      "maximumInterval": "1m",
      "backoffCoefficient": 2
    }
  }
}
```

---

## Appendix C: CLI Usage

```bash
# Start worker
temporal-n8n worker start --config ./config.json

# Run workflow (blocking)
temporal-n8n workflow run \
  --workflow ./my-workflow.json \
  --input ./input-data.json \
  --config ./config.json

# Run workflow (async)
temporal-n8n workflow start \
  --workflow ./my-workflow.json \
  --input ./input-data.json \
  --config ./config.json
# Returns workflow ID

# Check workflow status
temporal-n8n workflow status --workflow-id <id>

# Get workflow result
temporal-n8n workflow result --workflow-id <id>
```
