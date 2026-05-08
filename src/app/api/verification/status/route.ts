import { NextRequest, NextResponse } from 'next/server';
import { auth } from '@/lib/auth';
import { withTenantDb } from '@/lib/db/client';
import { QueueClient } from '@azure/storage-queue';

export async function GET(request: NextRequest) {
  try {
    const session = await auth();
    if (!session?.user?.tenantId) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const result = await withTenantDb(session.user.tenantId, async (req) => {
      // Get registered campaigns count
      const campaignsResult = await req.query(`
        SELECT COUNT(*) as count FROM Campaigns
      `);
      const campaignCount = campaignsResult.recordset[0].count;

      // Check Azure Queue for recent messages from this tenant
      let hasRecentData = false;
      let latestTest = null;

      try {
        const queueConnectionString = process.env.AZURE_QUEUE_CONNECTION_STRING;
        const queueName = process.env.QUEUE_NAME || 'clicklog-ingest';

        if (queueConnectionString) {
          const queueClient = new QueueClient(queueConnectionString, queueName);
          
          // Peek messages (doesn't remove them from queue)
          const peekResponse = await queueClient.peekMessages({ numberOfMessages: 32 });
          
          // Check if any messages are from this tenant and recent (last 60 seconds)
          const now = Date.now();
          const sixtySecondsAgo = now - 60000;

          for (const message of peekResponse.peekedMessageItems || []) {
            try {
              const decodedText = Buffer.from(message.messageText, 'base64').toString('utf-8');
              const queueMessage = JSON.parse(decodedText);
              
              // Check if message is recent (last 60 seconds)
              if (queueMessage.receivedAt) {
                const receivedAt = new Date(queueMessage.receivedAt).getTime();
                
                if (receivedAt >= sixtySecondsAgo) {
                  hasRecentData = true;
                  latestTest = {
                    keyword: queueMessage.envelope?.payload?.session?.keyword || 'test',
                    timestamp: queueMessage.receivedAt,
                  };
                  break;
                }
              }
            } catch (parseError) {
              // Skip malformed messages
              console.error('Failed to parse queue message:', parseError);
            }
          }
        }
      } catch (queueError) {
        console.error('Queue check error:', queueError);
        // Don't fail the entire request if queue check fails
      }

      // Fallback: Check database for sessions (in case worker is running)
      if (!hasRecentData) {
        const recentDataResult = await req.query(`
          SELECT TOP 1 
            session_id,
            keyword,
            campaign_id,
            started_at
          FROM Sessions
          WHERE started_at >= DATEADD(second, -60, GETUTCDATE())
          ORDER BY started_at DESC
        `);

        hasRecentData = recentDataResult.recordset && recentDataResult.recordset.length > 0;
        const latestSession = recentDataResult.recordset?.[0];

        if (hasRecentData && latestSession) {
          latestTest = {
            keyword: latestSession.keyword,
            timestamp: latestSession.started_at,
          };
        }
      }

      return {
        snippetInstalled: hasRecentData,
        campaignsRegistered: campaignCount > 0,
        campaignCount: campaignCount,
        latestTest: latestTest,
      };
    });

    return NextResponse.json(result);
  } catch (error) {
    console.error('Verification status error:', error);
    return NextResponse.json({ error: 'Failed to check status' }, { status: 500 });
  }
}