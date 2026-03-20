import { NextResponse } from 'next/server';
import sql from '@/lib/db';

export async function GET() {
  try {
    const rows = await sql`SELECT email, updated_at FROM yt_tokens WHERE email = 'music@nathanielschool.com' LIMIT 1`;
    return NextResponse.json({ connected: rows.length > 0, updatedAt: rows[0]?.updated_at || null });
  } catch {
    return NextResponse.json({ connected: false });
  }
}
