import { NextRequest, NextResponse } from 'next/server';
import { postReply } from '@/lib/youtube';
import sql from '@/lib/db';

export async function POST(req: NextRequest) {
  const { comment, replyText } = await req.json();
  try {
    await postReply(comment.threadId, replyText);
    await sql`
      INSERT INTO posted_replies (comment_id, thread_id, video_id, comment_type, commenter, comment_text, reply_text)
      VALUES (${comment.id}, ${comment.threadId}, ${comment.videoId || null}, ${comment.type}, ${comment.author}, ${comment.text}, ${replyText})
      ON CONFLICT (comment_id) DO NOTHING
    `;
    return NextResponse.json({ ok: true });
  } catch(e: any) {
    return NextResponse.json({ ok: false, error: e.message }, { status: 500 });
  }
}
