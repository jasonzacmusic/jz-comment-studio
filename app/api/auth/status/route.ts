import { NextResponse } from 'next/server';
import sql from '@/lib/db';

export async function GET() {
  try {
    const rows = await sql`SELECT email, updated_at FROM yt_tokens WHERE email = 'music@nathanielschool.com' LIMIT 1`;
    let lastFetch = null;
    try {
      const cron = await sql`SELECT fetched_at FROM cron_log ORDER BY fetched_at DESC LIMIT 1`;
      if (cron.length) lastFetch = cron[0].fetched_at;
    } catch {}
    return NextResponse.json({ connected: rows.length > 0, updatedAt: rows[0]?.updated_at || null, lastFetch });
  } catch {
    return NextResponse.json({ connected: false });
  }
}
