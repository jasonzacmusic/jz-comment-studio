import { NextRequest, NextResponse } from 'next/server';
import { fetchUnrespondedComments } from '@/lib/youtube';
import sql from '@/lib/db';

// Vercel cron - runs daily at 8am UTC
// Add to vercel.json: { "crons": [{ "path": "/api/cron", "schedule": "0 8 * * *" }] }
export async function GET(req: NextRequest) {
  // Protect endpoint with CRON_SECRET
  const authHeader = req.headers.get('authorization');
  if (process.env.NODE_ENV === 'production' && authHeader !== `Bearer ${process.env.CRON_SECRET}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  try {
    const comments = await fetchUnrespondedComments(100);

    // Store last fetch time and count
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
