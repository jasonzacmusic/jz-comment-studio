import { NextResponse } from 'next/server';
import { getAuthenticatedClient } from '@/lib/youtube';

export async function GET() {
  try {
    await getAuthenticatedClient();
    return NextResponse.json({ ok: true, message: 'Token refreshed successfully' });
  } catch(e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
