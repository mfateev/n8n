# Configuration Guide

This document provides detailed configuration options for the @n8n/temporal package.

## Configuration File

The `temporal-n8n.config.json` file configures all aspects of the Temporal integration.

## Temporal Connection

### Basic Configuration

```json
{
  "temporal": {
    "address": "localhost:7233",
    "namespace": "default",
    "taskQueue": "n8n-workflows"
  }
}
```

### Full Configuration

```json
{
  "temporal": {
    "address": "localhost:7233",
    "namespace": "default",
    "taskQueue": "n8n-workflows",
    "identity": "worker-1",
    "maxConcurrentActivityTaskExecutions": 100,
    "maxConcurrentWorkflowTaskExecutions": 100,
    "maxCachedWorkflows": 1000,
    "shutdownGraceTime": "30s"
  }
}
```

### Configuration Fields

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| address | string | Yes | - | Temporal server address (e.g., "localhost:7233") |
| namespace | string | No | "default" | Temporal namespace |
| taskQueue | string | Yes | - | Task queue name for this worker |
| identity | string | No | auto | Worker identity (defaults to hostname + PID) |
| maxConcurrentActivityTaskExecutions | number | No | 100 | Max concurrent activity executions |
| maxConcurrentWorkflowTaskExecutions | number | No | 100 | Max concurrent workflow task executions |
| maxCachedWorkflows | number | No | 1000 | Max workflows to cache in memory |
| shutdownGraceTime | string | No | "30s" | Grace period for shutdown |

## TLS Configuration

For secure connections to Temporal (including Temporal Cloud):

```json
{
  "temporal": {
    "address": "my-namespace.tmprl.cloud:7233",
    "namespace": "my-namespace",
    "taskQueue": "n8n-workflows",
    "tls": {
      "clientCert": "-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----",
      "clientKey": "-----BEGIN PRIVATE KEY-----\n...\n-----END PRIVATE KEY-----",
      "serverRootCACert": "-----BEGIN CERTIFICATE-----\n...\n-----END CERTIFICATE-----",
      "serverNameOverride": "my-server"
    }
  }
}
```

### TLS Fields

| Field | Type | Required | Description |
|-------|------|----------|-------------|
| clientCert | string | No | Client certificate in PEM format |
| clientKey | string | No | Client private key in PEM format |
| serverRootCACert | string | No | CA certificate for server verification |
| serverNameOverride | string | No | Override server name for TLS verification |

**Note**: For Temporal Cloud, you typically need `clientCert` and `clientKey`. The CA certificate is usually not required as Temporal Cloud uses a publicly trusted CA.

## Credentials Configuration

### Basic Configuration

```json
{
  "credentials": {
    "path": "./credentials.json"
  }
}
```

### Credentials File Format

The credentials file contains decrypted credential data keyed by credential ID:

```json
{
  "credential-id-1": {
    "apiKey": "secret-key"
  },
  "credential-id-2": {
    "accessToken": "oauth-token",
    "refreshToken": "refresh-token"
  }
}
```

### Supported Credential Types

#### API Key (Generic)

```json
{
  "my-api-key": {
    "apiKey": "your-api-key-here"
  }
}
```

#### HTTP Header Authentication

```json
{
  "http-header-auth": {
    "name": "X-API-Key",
    "value": "your-header-value"
  }
}
```

#### HTTP Query Authentication

```json
{
  "http-query-auth": {
    "name": "api_key",
    "value": "your-query-value"
  }
}
```

#### OAuth2 API

```json
{
  "oauth2-cred": {
    "clientId": "your-client-id",
    "clientSecret": "your-client-secret",
    "accessTokenUrl": "https://api.example.com/oauth/token",
    "grantType": "clientCredentials",
    "authentication": "header",
    "oauthTokenData": {
      "access_token": "current-access-token",
      "token_type": "Bearer",
      "expires_in": 3600,
      "refresh_token": "current-refresh-token"
    }
  }
}
```

**Note**: The `oauthTokenData` object stores the current token state. When tokens are refreshed, this data is automatically updated in the credentials file.

#### Basic Auth

```json
{
  "basic-auth-cred": {
    "user": "username",
    "password": "password"
  }
}
```

### Credential ID Matching

The credential ID in the credentials file must match the credential ID referenced in your workflow JSON:

```json
{
  "nodes": [
    {
      "name": "HTTP Request",
      "type": "n8n-nodes-base.httpRequest",
      "credentials": {
        "httpHeaderAuth": {
          "id": "http-header-auth",
          "name": "My API Key"
        }
      }
    }
  ]
}
```

## Binary Data Configuration

### Filesystem Mode (Local Development)

```json
{
  "binaryData": {
    "mode": "filesystem",
    "filesystem": {
      "basePath": "./tmp/binary-data"
    }
  }
}
```

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| basePath | string | No | "./binary-data" | Directory for binary data storage |

### S3 Mode (Production)

```json
{
  "binaryData": {
    "mode": "s3",
    "s3": {
      "bucket": "my-bucket",
      "region": "us-east-1",
      "host": "s3.amazonaws.com",
      "protocol": "https",
      "accessKeyId": "AKIA...",
      "secretAccessKey": "...",
      "authAutoDetect": false
    }
  }
}
```

| Field | Type | Required | Default | Description |
|-------|------|----------|---------|-------------|
| bucket | string | Yes | - | S3 bucket name |
| region | string | Yes | - | AWS region |
| host | string | No | auto | S3 endpoint (for S3-compatible services) |
| protocol | string | No | "https" | Protocol (http or https) |
| accessKeyId | string | No | - | AWS access key ID |
| secretAccessKey | string | No | - | AWS secret access key |
| authAutoDetect | boolean | No | false | Use IAM role/automatic credential detection |

### IAM Role Authentication (EKS, EC2)

When running on AWS infrastructure with IAM roles:

```json
{
  "binaryData": {
    "mode": "s3",
    "s3": {
      "bucket": "my-bucket",
      "region": "us-east-1",
      "authAutoDetect": true
    }
  }
}
```

### S3-Compatible Services (MinIO, LocalStack)

```json
{
  "binaryData": {
    "mode": "s3",
    "s3": {
      "bucket": "my-bucket",
      "region": "us-east-1",
      "host": "minio.local:9000",
      "protocol": "http",
      "accessKeyId": "minioadmin",
      "secretAccessKey": "minioadmin"
    }
  }
}
```

### Binary Data ID Format

Binary data is stored with IDs in the format:

```
{mode}:workflows/{workflowId}/executions/{executionId}/binary_data/{uuid}
```

Examples:
- `filesystem-v2:workflows/wf-123/executions/exec-456/binary_data/abc123`
- `s3:workflows/wf-123/executions/exec-456/binary_data/abc123`

## Execution Configuration

```json
{
  "execution": {
    "activityTimeout": 300000,
    "retryPolicy": {
      "maximumAttempts": 3,
      "initialInterval": "1s",
      "maximumInterval": "5m",
      "backoffCoefficient": 2
    }
  }
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| activityTimeout | number | 300000 | Activity timeout in milliseconds |
| retryPolicy.maximumAttempts | number | 3 | Maximum retry attempts |
| retryPolicy.initialInterval | string | "1s" | Initial retry interval |
| retryPolicy.maximumInterval | string | "5m" | Maximum retry interval |
| retryPolicy.backoffCoefficient | number | 2 | Backoff multiplier |

## Logging Configuration

```json
{
  "logging": {
    "level": "info",
    "format": "text"
  }
}
```

| Field | Type | Default | Description |
|-------|------|---------|-------------|
| level | string | "info" | Log level: debug, info, warn, error |
| format | string | "text" | Output format: text or json |

### Log Levels

| Level | Description |
|-------|-------------|
| debug | All messages including debug info |
| info | Info, warnings, and errors |
| warn | Warnings and errors only |
| error | Errors only |

### Log Output Examples

#### Text Format (default)

```
2025-12-26T12:00:00.000Z INFO  [Worker] Starting initialization
2025-12-26T12:00:00.100Z INFO  [Worker] Loading credentials {"path":"./credentials.json"}
2025-12-26T12:00:00.200Z DEBUG [Worker] Credentials loaded
2025-12-26T12:00:01.000Z INFO  [Worker] Worker started {"taskQueue":"n8n-workflows"}
```

#### JSON Format

```json
{"timestamp":"2025-12-26T12:00:00.000Z","level":"info","prefix":"Worker","message":"Starting initialization"}
{"timestamp":"2025-12-26T12:00:00.100Z","level":"info","prefix":"Worker","message":"Loading credentials","path":"./credentials.json"}
```

## Environment Variables

Configuration can be overridden via environment variables:

| Variable | Description |
|----------|-------------|
| LOG_LEVEL | Override logging level |
| LOG_FORMAT | Override logging format (text/json) |
| AWS_ACCESS_KEY_ID | AWS credentials for S3 |
| AWS_SECRET_ACCESS_KEY | AWS credentials for S3 |
| AWS_REGION | AWS region for S3 |

## Complete Example Configurations

### Local Development

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

### Production (AWS)

```json
{
  "temporal": {
    "address": "temporal.internal:7233",
    "namespace": "production",
    "taskQueue": "prod-n8n-workflows",
    "maxConcurrentActivityTaskExecutions": 50,
    "maxConcurrentWorkflowTaskExecutions": 50
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
  "execution": {
    "activityTimeout": 600000,
    "retryPolicy": {
      "maximumAttempts": 5
    }
  },
  "logging": {
    "level": "info",
    "format": "json"
  }
}
```

### Temporal Cloud

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
  },
  "binaryData": {
    "mode": "s3",
    "s3": {
      "bucket": "my-n8n-binary-data",
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

### Testing with LocalStack

```json
{
  "temporal": {
    "address": "localhost:7233",
    "taskQueue": "test-workflows"
  },
  "credentials": {
    "path": "./test-credentials.json"
  },
  "binaryData": {
    "mode": "s3",
    "s3": {
      "bucket": "test-binary-data",
      "region": "us-east-1",
      "host": "localhost:4566",
      "protocol": "http",
      "accessKeyId": "test",
      "secretAccessKey": "test"
    }
  },
  "logging": {
    "level": "debug"
  }
}
```
