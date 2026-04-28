// =============================================================================
// AdLeak Shield — Queue Client
// functions/src/lib/queue.ts
//
// WHAT THIS DOES:
// Sends messages to Azure Queue Storage. The HTTP ingestion function uses
// this to drop validated, IP-masked payloads onto the queue. The Queue Worker
// reads from the same queue (but receives messages via Azure Functions
// bindings, not this client).
//
// AUTHENTICATION:
// We use DefaultAzureCredential which automatically picks up:
//   - In production: the Function App's Managed Identity
//   - In local dev: your `az login` credentials
// No connection strings, no passwords stored anywhere.
// =============================================================================

import { QueueClient } from "@azure/storage-queue";
import { DefaultAzureCredential } from "@azure/identity";
import type { QueueMessage } from "./schemas.js";

let cachedClient: QueueClient | null = null;

function getClient(): QueueClient {
  if (cachedClient) return cachedClient;

  const account = process.env.QUEUE_STORAGE_ACCOUNT;
  const queueName = process.env.QUEUE_NAME;

  if (!account || !queueName) {
    throw new Error(
      "QUEUE_STORAGE_ACCOUNT and QUEUE_NAME must be set in environment."
    );
  }

  const queueUrl = `https://${account}.queue.core.windows.net/${queueName}`;
  const credential = new DefaultAzureCredential();

  cachedClient = new QueueClient(queueUrl, credential);
  return cachedClient;
}

/**
 * Send a message to the click ingestion queue.
 *
 * Azure Queue Storage messages must be base64-encoded by default
 * (configured in host.json: messageEncoding=base64). The SDK handles encoding
 * automatically for us.
 *
 * Failure mode: if the queue is unreachable, this throws. The HTTP function
 * catches the throw and returns 503 — the tracker will not retry, so we
 * accept rare losses during Azure outages. Beacon API doesn't retry either.
 */
export async function enqueueMessage(message: QueueMessage): Promise<void> {
  const client = getClient();
  const body = JSON.stringify(message);

  // Azure Queue messages must be under 64KB. Our payloads are ~2KB max.
  if (body.length > 60_000) {
    throw new Error(`Queue message too large: ${body.length} bytes`);
  }

  await client.sendMessage(body);
}
