# Temporal POC Results

This document tracks the results of each POC for the Temporal integration.

## POC 1: Node Type Loading Outside n8n CLI ✅

**Status:** Complete

**Test File:** `packages/core/src/__poc__/node-loading.test.ts`

**Run Command:**
```bash
cd packages/core && pnpm test src/__poc__/node-loading.test.ts
```

### Success Criteria Results:
- ✅ Nodes load without errors
- ✅ Can retrieve node type by name
- ✅ Node has execute method
- ✅ No missing dependencies (only Logger stub needed)

### Key Findings:

1. **Minimal DI Setup**: Only `Logger` from `@n8n/backend-common` needs to be registered in the DI container for node loading.

2. **Individual Loading Works**: Loading nodes one-by-one via `loadNodeFromFile()` works reliably.

3. **Bulk `loadAll()` Caution**: May fail due to peer dependency conflicts in some nodes (e.g., `ts-ics` with `date-fns`). For Temporal workers, load nodes on-demand rather than all at once.

4. **Node Names**: Nodes register under their description name (`set`, `if`, `code`) not the full qualified type (`n8n-nodes-base.set`). The package prefix is added elsewhere.

5. **Versioned Nodes**: Many nodes are versioned. Access the actual implementation via `nodeVersions[currentVersion]`:
   ```typescript
   if ('nodeVersions' in nodeType) {
     const currentNode = nodeType.nodeVersions[nodeType.currentVersion];
     // currentNode.execute() is the actual method
   }
   ```

6. **Execution Types**: Nodes can have different execution methods:
   - `execute()` - Standard programmatic execution
   - `trigger()` - Trigger nodes
   - `webhook()` - Webhook nodes
   - `poll()` - Polling nodes
   - Declarative nodes use `requestDefaults` routing

---

## POC 5: DI Container Setup ✅

**Status:** Complete

**Test File:** `packages/core/src/__poc__/di-container.test.ts`

**Run Command:**
```bash
cd packages/core && pnpm test src/__poc__/di-container.test.ts
```

### Success Criteria Results:
- ✅ Identified all required services
- ✅ Created minimal stub implementations
- ✅ Node loading works with stubs
- ✅ Documented what needs real implementation

### Services Accessed via Container.get():

| Service | Access Count | Required For |
|---------|--------------|--------------|
| Logger | 1 | All logging |
| InstanceSettings | 1 | Execution context |

### Minimal Required Stubs:

#### 1. Logger (from `@n8n/backend-common`)

```typescript
class MinimalLogger {
  error(message: string, metadata?: LogMetadata): void {
    console.error('[ERROR]', message);
  }
  warn(message: string, metadata?: LogMetadata): void {
    console.warn('[WARN]', message);
  }
  info(message: string, metadata?: LogMetadata): void {
    console.info('[INFO]', message);
  }
  debug(message: string, metadata?: LogMetadata): void {
    // Suppress or log based on config
  }
  scoped(scopes: string | string[]): Logger {
    return this;
  }
}
```

#### 2. InstanceSettings (from `n8n-core`)

```typescript
const minimalInstanceSettings = {
  n8nFolder: '/tmp/n8n-temporal',
  staticCacheDir: '/tmp/n8n-temporal/cache',
  customExtensionDir: '/tmp/n8n-temporal/custom',
  nodesDownloadDir: '/tmp/n8n-temporal/nodes',
  hostId: 'temporal-worker-1',
  instanceId: 'instance-id-hash',
  hmacSignatureSecret: 'secret-for-url-signing',
  instanceType: 'main',
  instanceRole: 'leader',
  isLeader: true,
  isFollower: false,
  isWorker: false,
  isMultiMain: false,
  isSingleMain: true,
  encryptionKey: 'encryption-key-for-credentials',
};
```

### Services NOT Needed for Basic Node Loading:

| Service | When Needed |
|---------|-------------|
| GlobalConfig | Specific features (sentry, endpoints) |
| SecurityConfig | File access restrictions |
| AiConfig | AI/LangChain nodes only |
| BinaryDataService | Binary data operations |
| ErrorReporter | Can be stubbed as no-op |

---

## POC 2: Simple Node Execution ✅

**Status:** Complete

**Test File:** `packages/core/src/__poc__/simple-execution.test.ts`

**Run Command:**
```bash
cd packages/core && pnpm test src/__poc__/simple-execution.test.ts
```

### Success Criteria Results:
- ✅ Set node executes without errors
- ✅ Output contains new fields
- ✅ Input data preserved
- ✅ Multiple assignments work
- ✅ Batch processing (multiple input items) works

### Key Findings:

1. **ExecuteContext Required**: Creating an `ExecuteContext` is essential for node execution. It requires:
   - `Workflow` instance with `INodeTypes`
   - `INode` definition
   - `IWorkflowExecuteAdditionalData` (can be stubbed)
   - Run execution data
   - Input data connections

2. **INodeTypes Implementation**: Need a minimal `INodeTypes` implementation:
   ```typescript
   function createNodeTypes(loader: PackageDirectoryLoader): INodeTypes {
       return {
           getByName(nodeType: string) {
               return loader.nodeTypes[nodeType].type;
           },
           getByNameAndVersion(nodeType: string, version?: number) {
               const type = loader.nodeTypes[nodeType].type;
               if ('nodeVersions' in type) {
                   const nodeVersion = version ?? type.currentVersion;
                   return type.nodeVersions[nodeVersion];
               }
               return type as INodeType;
           },
           getKnownTypes() { return { nodes: {}, credentials: {} }; },
       };
   }
   ```

3. **AdditionalData Stubbing**: `IWorkflowExecuteAdditionalData` can be largely stubbed for basic execution:
   ```typescript
   const additionalData = {
       credentialsHelper: { getDecrypted: async () => ({}) },
       executeWorkflow: async () => ({ data: [[]], executionId: 'test' }),
       restApiUrl: 'http://localhost:5678/rest',
       // ... other URLs and handlers stubbed
   };
   ```

4. **Node Execution Call**: Nodes are executed by calling their `execute` method with `this` bound to the context:
   ```typescript
   const result = await nodeType.execute!.call(context);
   ```

5. **Node Parameters Matter**: Node-specific parameters affect behavior (e.g., `includeOtherFields: true` for Set node)

---

---

## POC 3: HTTP Request with Credentials ✅

**Status:** Complete

**Test File:** `packages/core/src/__poc__/http-credentials.test.ts`

**Run Command:**
```bash
cd packages/core && pnpm test src/__poc__/http-credentials.test.ts
```

### Success Criteria Results:
- ✅ HTTP request executes
- ✅ Response received correctly
- ✅ Custom headers sent via parameters
- ⚠️ Full credential auth requires credential type registration in INodeTypes

### Key Findings:

1. **HTTP Request Node Works**: The HTTP Request node executes correctly with minimal setup:
   - GET requests work
   - POST with JSON body works
   - Custom headers via parameters work

2. **Credential Authentication Complexity**: Using `genericCredentialType` authentication (like httpHeaderAuth) requires:
   - The credential type must be registered in `INodeTypes`
   - The node checks its credential definitions against the type
   - For Temporal workers, there are alternatives:
     - Pass credentials as parameters (simpler)
     - Implement full credential type registration
     - Use CredentialsHelper.authenticate() for request modification

3. **CredentialsHelper Interface**: The helper needs to implement:
   ```typescript
   getDecrypted(additionalData, nodeCredentials, type): Promise<ICredentialDataDecryptedObject>
   authenticate(credentials, typeName, requestOptions): Promise<IHttpRequestOptions>
   getCredentialsProperties(): never[]
   getParentTypes(): string[]
   ```

4. **Network Requests**: External HTTP requests work correctly with expressions in parameters (e.g., `JSON.stringify()` in body)

---

---

## POC 4: Expression Evaluation ✅

**Status:** Complete

**Test File:** `packages/core/src/__poc__/expression-evaluation.test.ts`

**Run Command:**
```bash
cd packages/core && pnpm test src/__poc__/expression-evaluation.test.ts
```

### Success Criteria Results:
- ✅ `$json` expression resolves
- ✅ String methods work in expressions
- ✅ `$node["Name"]` references work
- ✅ Errors handled gracefully (optional chaining with defaults)

### Key Findings:

1. **Expression Evaluation Works**: All standard n8n expressions work with minimal execution context:
   - `{{ $json.field }}` - Direct access
   - `{{ $json.field.toUpperCase() }}` - Method calls
   - `{{ $json.nested.property }}` - Nested access
   - `{{ $json.items[0].value }}` - Array access
   - `{{ $json.a + $json.b }}` - Arithmetic

2. **Node References Work**: `$node["Name"].json.field` resolves correctly when previous node output is in `runExecutionData.resultData.runData`.

3. **Error Handling**: Optional chaining (`?.`) and nullish coalescing (`??`) work in expressions for graceful error handling.

4. **Run Data Structure**: For node references to work, previous node output must be structured:
   ```typescript
   const runExecutionData = {
       resultData: {
           runData: {
               'PreviousNodeName': [{
                   data: { main: [[{ json: { field: 'value' } }]] }
               }]
           }
       }
   };
   ```

---

---

## POC 6: Temporal Data Serialization ✅

**Status:** Complete

**Test File:** `packages/core/src/__poc__/serialization.test.ts`

**Run Command:**
```bash
cd packages/core && pnpm test src/__poc__/serialization.test.ts
```

### Success Criteria Results:
- ✅ Simple JSON data round-trips correctly
- ✅ Binary data references preserved
- ✅ Full IRunExecutionData round-trips
- ✅ Large payloads work (tested up to 1MB)
- ⚠️ Error objects need custom serialization

### Key Findings:

1. **JSON Serialization Works**: Standard JSON serialization (what Temporal uses by default) works for most n8n data structures:
   - Node output (`INodeExecutionData[]`)
   - Binary data references (S3 mode)
   - Full execution state (`IRunExecutionData`)
   - Arrays, nested objects, primitive types

2. **Error Handling**: Error objects need special handling:
   - Standard `Error` objects lose `message` and `stack` (only `name` survives if explicitly set)
   - `NodeApiError` has better serialization but still needs conversion to plain objects
   - **Recommendation**: Convert errors to plain objects before Temporal serialization

3. **Payload Size**:
   - 1MB payloads serialize/deserialize quickly (~2ms)
   - 1000 items handle well (~1ms)
   - Temporal's default limit is 2MB per payload
   - For larger data, use external storage (S3) and pass references

4. **Special Value Handling**:
   - `undefined` is stripped (as expected with JSON)
   - `Infinity` and `NaN` become `null`
   - `Date` objects become ISO strings
   - `null` is preserved

5. **Binary Data Strategy**: Use reference mode (S3) for binary data rather than embedding base64:
   ```typescript
   const binaryData: IBinaryData = {
       data: 's3',
       id: 's3:bucket/path/to/file',
       mimeType: 'image/png',
       fileName: 'image.png',
       fileSize: '1024',
   };
   ```

---

---

## POC 7: WorkflowExecute Integration ✅

**Status:** Complete

**Test File:** `packages/core/src/__poc__/workflow-execute.test.ts`

**Run Command:**
```bash
cd packages/core && pnpm test src/__poc__/workflow-execute.test.ts
```

### Success Criteria Results:
- ✅ WorkflowExecute runs a simple workflow
- ✅ nodeExecuteBefore hook fires before each node
- ✅ nodeExecuteAfter hook fires after each node with results
- ✅ workflowExecuteAfter hook fires with full results
- ✅ Execution state can be intercepted at node boundaries

### Key Findings:

1. **WorkflowExecute Works**: The `WorkflowExecute` class can run complete workflows with minimal setup:
   ```typescript
   const workflowExecute = new WorkflowExecute(additionalData, 'manual');
   await workflowExecute.run(workflow);
   ```

2. **ExecutionLifecycleHooks**: The hooks system provides natural boundaries for Temporal activities:
   - `nodeExecuteBefore`: Called before each node executes (activity start)
   - `nodeExecuteAfter`: Called after each node with results (activity complete)
   - `workflowExecuteBefore`: Called when workflow starts
   - `workflowExecuteAfter`: Called when workflow completes with full run data

3. **Hook Registration**:
   ```typescript
   const hooks = new ExecutionLifecycleHooks('manual', executionId, workflowData);
   hooks.addHandler('nodeExecuteBefore', (nodeName, taskStartedData) => {
       // Called before node executes
   });
   hooks.addHandler('nodeExecuteAfter', (nodeName, taskData, executionData) => {
       // Called after node executes with output data
   });
   ```

4. **State Capture at Boundaries**: The `nodeExecuteAfter` hook receives:
   - `nodeName`: The name of the executed node
   - `taskData`: Contains output data (`taskData.data.main[0]`)
   - `executionData`: Full `IRunExecutionData` with all previous node results

5. **Temporal Integration Pattern**:
   - Each node execution maps to a Temporal Activity
   - `nodeExecuteBefore` → Signal activity started
   - `nodeExecuteAfter` → Complete activity with checkpointed state
   - If worker crashes, Temporal replays from last completed activity
   - State is serializable (proven in POC 6)

6. **INodeTypes with NodeHelpers**: Use `NodeHelpers.getVersionedNodeType()` for proper version handling:
   ```typescript
   class SimpleNodeTypes {
       getByNameAndVersion(nodeType: string, version?: number) {
           return NodeHelpers.getVersionedNodeType(nodeTypes[nodeType].type, version);
       }
   }
   ```

---

## POC 8: Temporal Bundling with WorkflowExecute ✅

**Status:** Complete

**Test Files:**
- `poc/08-temporal-bundling/src/test-bundling.ts` (simple workflow)
- `poc/08-temporal-bundling/src/test-bundling-with-execute.ts` (with WorkflowExecute)

**Run Commands:**
```bash
cd poc/08-temporal-bundling && pnpm tsx src/test-bundling.ts
cd poc/08-temporal-bundling && pnpm tsx src/test-bundling-with-execute.ts
```

### Success Criteria Results:
- ✅ Simple workflow bundles (1.36 MB)
- ✅ WorkflowExecute from n8n-core bundles (25.49 MB)
- ✅ Workflow class bundles
- ✅ NodeHelpers bundles
- ✅ Core orchestration methods (addNodeToBeExecuted, processRunExecutionData) included

### Key Findings:

1. **WorkflowExecute CAN Be Bundled**: The entire WorkflowExecute class from n8n-core can be bundled into Temporal's V8 sandbox:
   ```typescript
   import { WorkflowExecute } from 'n8n-core';
   import { Workflow, NodeHelpers } from 'n8n-workflow';
   // These imports successfully bundle into Temporal workflow
   ```

2. **Bundle Configuration Required**: 143 modules must be ignored for successful bundling:
   - Node.js built-ins (fs, path, crypto, http, etc.)
   - `node:` prefixed imports (node:fs, node:url, etc.)
   - Database drivers (pg, mysql2, better-sqlite3, ioredis)
   - Sentry packages (@sentry/node, @sentry/node-native)
   - Native modules (canvas, sharp)
   - Expression sandbox (@n8n/tournament) - handled in activities
   - Network libraries (axios, nodemailer, ssh2)

3. **webpack Config Hook Required**: The `node:` prefixed imports need special handling via `webpackConfigHook`:
   ```typescript
   await bundleWorkflowCode({
       workflowsPath,
       ignoreModules: IGNORE_MODULES,
       webpackConfigHook: (config) => {
           const nodeExternals: Record<string, string> = {};
           for (const builtin of NODE_BUILTINS) {
               nodeExternals[`node:${builtin}`] = `commonjs node:${builtin}`;
           }
           config.externals = { ...config.externals, ...nodeExternals };
           return config;
       },
   });
   ```

4. **Bundle Size Comparison**:
   | Approach | Bundle Size | Notes |
   |----------|-------------|-------|
   | Simple workflow | 1.36 MB | No WorkflowExecute |
   | Unoptimized | 25.49 MB | Default ignoreModules |
   | Aggressive ignoreModules | **16.73 MB** | ~270 modules ignored |
   | Externals function | 16.7 MB | Same as ignoreModules |
   | Resolve.alias stubs | 17.92 MB | Worse (barrel exports) |
   | **Lean (no n8n-core)** | **6.88 MB** | Best - only n8n-workflow |

5. **Bundle Size Optimization Strategies**:

   **Option A: Keep WorkflowExecute (~17-25 MB)** ⭐ **CHOSEN**
   - Use `ignoreModules` for Node.js built-ins and heavy dependencies
   - Pro: Reuse all ~2640 LOC of orchestration logic
   - Pro: Full feature parity (merge nodes, wait nodes, error handling, etc.)
   - Con: Large bundle due to n8n-core barrel exports

   **Option B: Lean Workflow (~7 MB)** — Not chosen
   - Only import from `n8n-workflow` (not `n8n-core`)
   - Implement orchestration logic in the Temporal workflow directly
   - Pro: 59% smaller bundle, faster startup
   - Con: Missing critical features (merge nodes, wait nodes, multiple outputs, error handling)
   - Con: Would require ~700+ LOC to reach feature parity

   **Decision**: Use WorkflowExecute approach. Bundle size optimization is deferred.
   The ~2640 LOC of battle-tested orchestration logic handles edge cases that would
   take significant effort to reimplement correctly (merge node data accumulation,
   wait node resume, error routing, execution order, etc.).

6. **Warnings vs Errors**: Many "critical dependency" warnings appear but these are:
   - Dynamic requires for optional features (node loader, expression sandbox)
   - Don't affect deterministic execution
   - Node loading and expression evaluation happen in Activities, not Workflow

7. **Proxy INodeTypes Pattern**: The recommended pattern for delegating node execution to Activities:
   ```typescript
   class ProxyNodeTypes implements INodeTypes {
       getByNameAndVersion(nodeType: string, _version?: number): INodeType {
           return {
               description: { /* minimal description */ },
               execute: async function() {
                   // Delegate to Activity
                   return await activities.executeNode({ nodeType, ... });
               },
           };
       }
   }
   ```

### Architecture Validation:

This POC validates that **WorkflowExecute can run inside Temporal's deterministic V8 sandbox** with node execution delegated to Activities. The orchestration logic (graph traversal, stack management, merge handling) is deterministic and doesn't need I/O.

```
┌────────────────────────────────────────────────────────────────┐
│                  Temporal V8 Sandbox                            │
├────────────────────────────────────────────────────────────────┤
│  WorkflowExecute (bundled)                                      │
│  ├── Graph traversal logic (~410 LOC)                          │
│  ├── Execution stack management                                 │
│  ├── Merge node handling                                        │
│  ├── Wait node state                                            │
│  └── ProxyNodeTypes.execute() → Activity Call                   │
│                                                                 │
│  When ProxyNodeTypes.execute() is called:                       │
│  └── activities.executeNode({node, inputData}) ──────┐         │
│                                                       │         │
└───────────────────────────────────────────────────────│─────────┘
                                                        ▼
┌────────────────────────────────────────────────────────────────┐
│                    Temporal Activity                            │
├────────────────────────────────────────────────────────────────┤
│  - Load real node type                                          │
│  - Create ExecuteContext                                        │
│  - Execute actual node (HTTP, DB, etc.)                         │
│  - Return output to Workflow                                    │
└────────────────────────────────────────────────────────────────┘
```

### Implications for Implementation:

1. **Reuse WorkflowExecute**: No need to reimplement ~2640 LOC of orchestration logic
2. **Feature Parity**: Automatically get merge nodes, wait nodes, error handling, etc.
3. **Deterministic Replay**: Temporal can replay the workflow since orchestration is deterministic
4. **Clean Separation**: I/O (node execution) isolated in Activities; logic in Workflow

---

## Summary

### Completed POCs

| POC | Status | Key Finding |
|-----|--------|-------------|
| 1. Node Loading | ✅ | Only Logger needed for node loading |
| 5. DI Container | ✅ | Logger + InstanceSettings for execution |
| 2. Simple Execution | ✅ | ExecuteContext + minimal stubs enable node execution |
| 4. Expressions | ✅ | All standard n8n expressions work |
| 3. HTTP/Credentials | ✅ | HTTP nodes work; credentials via params simplest |
| 6. Serialization | ✅ | JSON serialization works; errors need plain objects |
| 7. WorkflowExecute | ✅ | Hooks provide natural Temporal activity boundaries |
| 8. Temporal Bundling | ✅ | WorkflowExecute bundles into Temporal V8 sandbox |

### All POCs Complete ✅

All 8 POCs have been successfully completed. Key findings for Temporal integration:

1. **Minimal Dependencies**: Only Logger and InstanceSettings needed for DI setup
2. **Node Execution**: Works with ExecuteContext and stubbed IWorkflowExecuteAdditionalData
3. **Expressions**: Full expression evaluation works including node references
4. **HTTP/Credentials**: HTTP nodes work; pass credentials as parameters for simplicity
5. **Serialization**: JSON serialization works for all n8n data structures except Error objects
6. **Workflow Orchestration**: ExecutionLifecycleHooks provide natural boundaries for Temporal activities
7. **Bundling**: WorkflowExecute can be bundled into Temporal's V8 sandbox (~17-25 MB bundle, optimization deferred)

### Architecture Recommendation

**Chosen Approach: Bundle WorkflowExecute with Proxy INodeTypes**

POC 8 validates that the entire WorkflowExecute class can run inside Temporal's deterministic V8 sandbox. This enables reusing n8n's ~2640 LOC orchestration logic (graph traversal, merge nodes, wait nodes, error handling) without reimplementation.

**Why not optimize bundle size?**
- Lean approach (7 MB) lacks critical features: merge nodes, wait nodes, multiple outputs, error handling
- Reimplementing these features correctly would require ~700+ LOC and significant testing
- WorkflowExecute is battle-tested with edge cases already handled
- Bundle size (~17-25 MB) is acceptable for Temporal workers (loaded once, reused for many executions)
- Future optimization possible via n8n-core barrel export refactoring if needed

```
┌────────────────────────────────────────────────────────────────┐
│                  Temporal V8 Sandbox                            │
├────────────────────────────────────────────────────────────────┤
│  WorkflowExecute (bundled from n8n-core)                        │
│  ├── Graph traversal & stack management (deterministic)         │
│  ├── Merge node handling                                        │
│  ├── Wait node state                                            │
│  └── ProxyNodeTypes.execute() → Activity Call                   │
│                                                                 │
│  For each node execution:                                       │
│  └── activities.executeNode({node, inputData}) ──────┐         │
└───────────────────────────────────────────────────────│─────────┘
                                                        ▼
┌────────────────────────────────────────────────────────────────┐
│                    Temporal Activity                            │
├────────────────────────────────────────────────────────────────┤
│  - Load real node type (from disk)                              │
│  - Create ExecuteContext with real credentials                  │
│  - Execute actual node (HTTP, DB, file I/O)                     │
│  - Return serializable output to Workflow                       │
└────────────────────────────────────────────────────────────────┘
```

This architecture provides:
- **Automatic retries** on transient failures (per-node)
- **Recovery from worker crashes** (replay from last completed node)
- **Distributed execution** across workers
- **Visibility** into execution progress via Temporal UI
- **Feature parity** with existing n8n orchestration
