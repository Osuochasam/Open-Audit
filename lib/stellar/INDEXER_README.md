# Stellar Event Indexer - Rate Limit Handling Implementation

## Overview

This implementation adds robust rate limit handling to the Open-Audit backend event indexer. The indexer continuously polls the Stellar RPC `getEvents` endpoint to listen for new Soroban smart contract interactions, with built-in protection against HTTP 429 (Too Many Requests) errors.

## Problem Solved

During times of high network congestion or rapid block generation, the indexer occasionally hit RPC rate limits (HTTP 429). When this happened, the indexer would drop the current batch of events, leading to missing logs on the dashboard.

## Solution

The implementation includes three key components:

### 1. **Exponential Backoff Retry Mechanism**

When an HTTP 429 error is detected, the indexer automatically retries the request with increasing delays:

- **1st retry**: 1 second delay
- **2nd retry**: 2 seconds delay
- **3rd retry**: 4 seconds delay
- **4th retry**: 8 seconds delay
- **5th retry**: 16 seconds delay
- **6th+ retry**: 32 seconds delay (capped)

This approach ensures we don't overwhelm the RPC server while still maintaining persistent data collection.

### 2. **Cursor-Based State Management**

The indexer maintains a cursor that tracks the last successfully indexed ledger:

```typescript
interface IndexerCursor {
  lastLedger: number;
  paginationCursor?: string;
}
```

**Critical feature**: The cursor is **only updated after a successful fetch**, preventing any events from being skipped when retries occur.

### 3. **Graceful Error Handling**

- Rate limit errors (429) trigger automatic retry with backoff
- Non-rate-limit errors are reported but don't trigger exponential backoff
- All errors are logged and can be handled via callbacks
- The indexer continues running even after transient failures

## Usage

### Basic Usage

```typescript
import { startEventIndexer } from "@/lib/stellar/indexer";
import { TESTNET_CONFIG } from "@/lib/stellar/client";

const indexer = startEventIndexer({
  networkConfig: TESTNET_CONFIG,
  contractIds: ["CABC...XYZ"], // Contract IDs to monitor
  startLedger: 1000, // Starting ledger number
  pollIntervalMs: 5000, // Poll every 5 seconds
  onEvents: async function (events, cursor) {
    console.log(`Received ${events.length} events`);
    console.log(`Current cursor: ${cursor.lastLedger}`);
    
    // Process events here...
    // Save to database, update UI, etc.
  },
  onError: function (error, willRetry) {
    console.error(`Indexer error: ${error.message}`);
    if (willRetry) {
      console.log("Will retry with exponential backoff...");
    }
  },
});

// Later, to stop the indexer:
indexer.stop();

// Check current cursor position:
const cursor = indexer.getCursor();
console.log(`Last indexed ledger: ${cursor.lastLedger}`);
```

### Custom Retry Configuration

```typescript
import { startEventIndexer } from "@/lib/stellar/indexer";

const indexer = startEventIndexer({
  networkConfig: TESTNET_CONFIG,
  contractIds: ["CABC...XYZ"],
  startLedger: 1000,
  pollIntervalMs: 5000,
  retryConfig: {
    initialDelayMs: 2000, // Start with 2 seconds
    maxDelayMs: 60000, // Cap at 60 seconds
    maxRetries: 15, // Try up to 15 times
    backoffMultiplier: 2, // Double each time
  },
  onEvents: async function (events, cursor) {
    // Process events...
  },
});
```

### One-Time Fetch with Retry

For situations where you need a single fetch with retry logic (not continuous polling):

```typescript
import { fetchEventsWithRetry, DEFAULT_RETRY_CONFIG } from "@/lib/stellar/indexer";
import { SorobanRpc } from "stellar-sdk";

const server = new SorobanRpc.Server("https://soroban-testnet.stellar.org");

try {
  const response = await fetchEventsWithRetry(
    server,
    ["CABC...XYZ"], // Contract IDs
    1000, // Start ledger
    DEFAULT_RETRY_CONFIG
  );
  
  console.log(`Fetched ${response.events.length} events`);
} catch (error) {
  console.error("Failed to fetch events:", error);
}
```

## Implementation Details

### Rate Limit Detection

The indexer detects rate limit errors by checking for:
- HTTP status code 429
- Error messages containing "too many requests"
- Error messages containing "rate limit"

This works with various RPC implementations and error formats.

### Thread Safety

The indexer uses a simple `isRunning` flag to control the polling loop. Calling `stop()` sets this flag to false, causing the loop to exit gracefully after the current operation completes.

### Cursor Persistence

The current implementation keeps the cursor in memory. For production deployments, you should persist the cursor to:
- A database (PostgreSQL, MongoDB, etc.)
- A cache (Redis)
- Local storage (file system)

This ensures the indexer can resume from the correct position after restarts.

## Testing

Comprehensive tests are provided in `__tests__/indexer.test.ts`:

```bash
npm test lib/stellar/__tests__/indexer.test.ts
```

Tests cover:
- ✅ Exponential backoff calculation
- ✅ Successful event fetching
- ✅ Retry on HTTP 429 errors
- ✅ Immediate failure on non-rate-limit errors
- ✅ Retry exhaustion handling
- ✅ Cursor update only on success
- ✅ Cursor preservation on failure
- ✅ Continuous polling behavior

## Configuration Options

| Option | Type | Description | Default |
|--------|------|-------------|---------|
| `networkConfig` | `StellarNetworkConfig` | Network endpoints and passphrase | Required |
| `contractIds` | `string[]` | Contracts to monitor | Required |
| `startLedger` | `number` | Starting ledger number | Required |
| `pollIntervalMs` | `number` | Time between polls | Required |
| `retryConfig.initialDelayMs` | `number` | Initial retry delay | 1000 |
| `retryConfig.maxDelayMs` | `number` | Maximum retry delay | 32000 |
| `retryConfig.maxRetries` | `number` | Maximum retry attempts | 10 |
| `retryConfig.backoffMultiplier` | `number` | Backoff multiplier | 2 |
| `onEvents` | `EventBatchHandler` | Success callback | Required |
| `onError` | `ErrorHandler` | Error callback | Optional |

## Production Recommendations

1. **Persist the cursor** to a database or cache for crash recovery
2. **Monitor retry rates** to detect persistent rate limiting
3. **Adjust poll interval** based on network conditions
4. **Use multiple indexers** for different contract sets to distribute load
5. **Implement circuit breaker** patterns for prolonged failures
6. **Add metrics and alerting** for indexer health monitoring

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                     Event Indexer                            │
│                                                               │
│  ┌─────────────┐       ┌──────────────┐                     │
│  │   Polling   │──────▶│ Fetch Events │                     │
│  │    Loop     │       │  with Retry  │                     │
│  └─────────────┘       └──────────────┘                     │
│         │                      │                             │
│         │                      │ HTTP 429?                   │
│         │                      ├────Yes────▶ Exponential     │
│         │                      │             Backoff         │
│         │                      │                │            │
│         │                      │◀───────────────┘            │
│         │                      │                             │
│         │                      │ Success                     │
│         │                      ▼                             │
│         │              ┌──────────────┐                      │
│         │              │ Update Cursor│                      │
│         │              └──────────────┘                      │
│         │                      │                             │
│         │                      ▼                             │
│         │              ┌──────────────┐                      │
│         └──────────────│  onEvents()  │                      │
│                        └──────────────┘                      │
└─────────────────────────────────────────────────────────────┘
```

## Related Files

- `lib/stellar/indexer.ts` - Main indexer implementation
- `lib/stellar/client.ts` - Network configuration and simple fetch wrapper
- `lib/stellar/__tests__/indexer.test.ts` - Comprehensive test suite

## Future Enhancements

1. **Adaptive polling**: Automatically adjust poll interval based on event volume
2. **Multi-contract batching**: Fetch events for multiple contracts in one request
3. **Parallel fetching**: Use multiple indexers with ledger range sharding
4. **Event deduplication**: Handle cases where events appear in multiple fetches
5. **Checkpoint system**: Save periodic snapshots of indexer state
6. **Metrics endpoint**: Expose indexer health and performance metrics
