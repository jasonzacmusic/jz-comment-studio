import { NextResponse } from 'next/server';
import { initDB } from '@/lib/db';

export async function GET() {
  try {
    const result = await initDB();
    return NextResponse.json({ ok: true, result });
  } catch(e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
