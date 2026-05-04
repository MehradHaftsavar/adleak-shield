// =============================================================================
// AdLeak Shield — Queue Client
// functions/src/lib/queue.ts
// =============================================================================

import { QueueClient } from "@azure/storage-queue";
import type { QueueMessage } from "./schemas.js";

let cachedClient: QueueClient | null = null;

function getClient(): QueueClient {
  if (cachedClient) return cachedClient;

  const connectionString = process.env.QUEUE_CONNECTION || process.env.QUEUE_STORAGE_ACCOUNT;
  const queueName = process.env.QUEUE_NAME;

  if (!connectionString || !queueName) {
    throw new Error(
      "QUEUE_CONNECTION and QUEUE_NAME must be set in environment."
    );
  }

  cachedClient = new QueueClient(connectionString, queueName);
  return cachedClient;
}

/**
 * Send a message to the click ingestion queue.
 */
export async function enqueueMessage(message: QueueMessage): Promise<void> {
  const client = getClient();
  const body = JSON.stringify(message);

  if (body.length > 60_000) {
    throw new Error(`Queue message too large: ${body.length} bytes`);
  }

  await client.sendMessage(body);
}