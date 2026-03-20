import { NextRequest, NextResponse } from 'next/server';
import { generateReply } from '@/lib/claude';

export async function POST(req: NextRequest) {
  const { comment, extraInstructions } = await req.json();
  try {
    const reply = await generateReply(comment, extraInstructions);
    return NextResponse.json({ ok: true, reply });
  } catch(e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
