import { NextRequest, NextResponse } from 'next/server';
import { fetchUnrespondedComments } from '@/lib/youtube';

export async function GET(req: NextRequest) {
  const max = parseInt(req.nextUrl.searchParams.get('max') || '50');
  try {
    const comments = await fetchUnrespondedComments(max);
    return NextResponse.json({ ok: true, comments, count: comments.length });
  } catch(e: any) {
    const status = e.message === 'NOT_CONNECTED' ? 401
                 : e.message === 'RECONNECT_REQUIRED' ? 401
                 : 500;
    return NextResponse.json({ ok: false, error: e.message }, { status });
  }
}
