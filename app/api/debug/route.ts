import { NextResponse } from 'next/server';
import { getAuthenticatedClient } from '@/lib/youtube';
import { google } from 'googleapis';
import sql from '@/lib/db';

export async function GET() {
  const results: any = {};

  // 1. Check token in DB
  try {
    const rows = await sql`SELECT email, expiry_date, updated_at FROM yt_tokens LIMIT 1`;
    results.token = rows.length ? {
      found: true,
      email: rows[0].email,
      expires: new Date(Number(rows[0].expiry_date)).toISOString(),
      updated: rows[0].updated_at,
    } : { found: false };
  } catch(e: any) { results.token = { error: e.message }; }

  // 2. Try auth
  try {
    const auth = await getAuthenticatedClient();
    results.auth = 'ok';

    const youtube = google.youtube({ version: 'v3', auth });

    // 3. Test channel info
    try {
      const ch = await youtube.channels.list({ part: ['snippet','statistics'], id: ['UCCI37YB3l21oq_sLoc92YfA'] });
      const ch0 = ch.data.items?.[0];
      results.channel = {
        name: ch0?.snippet?.title,
        subscribers: ch0?.statistics?.subscriberCount,
        videoCount: ch0?.statistics?.videoCount,
      };
    } catch(e: any) { results.channel = { error: e.message }; }

    // 4. Test video search
    try {
      const s = await youtube.search.list({
        part: ['id'], channelId: 'UCCI37YB3l21oq_sLoc92YfA',
        type: ['video'], order: 'date', maxResults: 5,
      });
      const ids = (s.data.items||[]).map((i:any) => i.id?.videoId).filter(Boolean);
      results.recentVideos = ids;
    } catch(e: any) { results.recentVideos = { error: e.message }; }

    // 5. Test comment threads on first video
    if (Array.isArray(results.recentVideos) && results.recentVideos.length) {
      try {
        const ct = await youtube.commentThreads.list({
          part: ['snippet'], videoId: results.recentVideos[0], maxResults: 5,
        });
        results.sampleComments = (ct.data.items||[]).map((t:any) => ({
          id: t.snippet.topLevelComment.id,
          author: t.snippet.topLevelComment.snippet.authorDisplayName,
          text: t.snippet.topLevelComment.snippet.textDisplay?.substring(0,80),
          replyCount: t.snippet.totalReplyCount,
        }));
      } catch(e: any) { results.sampleComments = { error: e.message }; }
    }

    // 6. Test commentThreads with allThreadsRelatedToChannelId
    try {
      const all = await youtube.commentThreads.list({
        part: ['snippet'], allThreadsRelatedToChannelId: 'UCCI37YB3l21oq_sLoc92YfA', maxResults: 5,
      });
      results.allThreadsTest = {
        count: all.data.items?.length,
        sample: all.data.items?.[0]?.snippet?.topLevelComment?.snippet?.textDisplay?.substring(0,60),
      };
    } catch(e: any) { results.allThreadsTest = { error: e.message }; }

    // 7. Check posted_replies count
    try {
      const posted = await sql`SELECT COUNT(*) as n FROM posted_replies`;
      results.postedRepliesInDB = posted[0]?.n;
    } catch(e: any) { results.postedRepliesInDB = { error: e.message }; }

  } catch(e: any) { results.auth = { error: e.message }; }

  return NextResponse.json(results, { status: 200 });
}
