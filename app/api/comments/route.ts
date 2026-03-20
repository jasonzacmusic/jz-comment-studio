import { NextRequest, NextResponse } from 'next/server';
import { fetchUnrespondedComments } from '@/lib/youtube';

export async function GET(req: NextRequest) {
  const max = parseInt(req.nextUrl.searchParams.get('max') || '50');
  try {
    const comments = await fetchUnrespondedComments(max);
    return NextResponse.json({ ok: true, comments });
  } catch(e: any) {
    if (e.message === 'NOT_CONNECTED') {
      return NextResponse.json({ ok: false, error: 'NOT_CONNECTED' }, { status: 401 });
    }
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
