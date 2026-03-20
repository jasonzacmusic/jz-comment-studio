import { NextRequest, NextResponse } from 'next/server';
import { fetchUnrespondedComments } from '@/lib/youtube';
import sql from '@/lib/db';

export async function GET(req: NextRequest) {
  // Allow Vercel's internal cron (no auth header) OR secret header
  const isVercelCron = req.headers.get('x-vercel-cron') === '1';
  const authHeader = req.headers.get('authorization');
  const secret = process.env.CRON_SECRET || 'OebzkukOLP8N+90adiv/YFqioDm7JPstOht8T4aiDGw=';
  const isAuthorized = isVercelCron || authHeader === `Bearer ${secret}`;

  if (!isAuthorized) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const comments = await fetchUnrespondedComments(100);
    await sql`
      INSERT INTO cron_log (fetched_at, comment_count)
      VALUES (NOW(), ${comments.length})
    `;
    return NextResponse.json({
      ok: true,
      fetched: comments.length,
      timestamp: new Date().toISOString(),
    });
  } catch (e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
