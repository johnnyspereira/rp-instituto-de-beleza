import { getCurrentAccount } from '@/lib/auth/account';
import { selectRows } from '@/lib/mysql/db';
import type { RowDataPacket } from 'mysql2';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ messageId: string }> }
) {
  try {
    const { messageId } = await params;
    const context = await getCurrentAccount();
    const rows = await selectRows<
      (RowDataPacket & {
        mime_type: string;
        filename: string | null;
        data: Buffer;
      })[]
    >(
      `SELECT mime_type,filename,data FROM whatsapp_bridge_media
       WHERE message_id=? AND account_id=? LIMIT 1`,
      [messageId, context.account.id]
    );
    const media = rows[0];
    if (!media) {
      return Response.json({ error: 'Media not found.' }, { status: 404 });
    }

    const filename = media.filename
      ?.replace(/[\\\r\n"]/g, '_')
      .slice(0, 180);
    return new Response(new Uint8Array(media.data), {
      headers: {
        'Content-Type': media.mime_type || 'application/octet-stream',
        'Cache-Control': 'private, max-age=3600',
        ...(filename
          ? {
              'Content-Disposition': `inline; filename="${filename}"`,
            }
          : {}),
      },
    });
  } catch (error) {
    console.error('[whatsapp-bridge-media] failed:', error);
    return Response.json({ error: 'Could not load media.' }, { status: 500 });
  }
}
