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
      expired: Date.now() > Number(rows[0].expiry_date),
      updated: rows[0].updated_at,
    } : { found: false };
  } catch(e: any) { results.token = { error: e.message }; }

  // 2. Auth + force refresh
  try {
    const auth = await getAuthenticatedClient();
    results.auth = 'ok';

    const youtube = google.youtube({ version: 'v3', auth });

    // 3. Channel
    try {
      const ch = await youtube.channels.list({ part: ['snippet','statistics'], id: ['UCCI37YB3l21oq_sLoc92YfA'] });
      results.channel = { name: ch.data.items?.[0]?.snippet?.title, subs: ch.data.items?.[0]?.statistics?.subscriberCount };
    } catch(e: any) { results.channel = { error: e.message }; }

    // 4. Recent videos
    try {
      const s = await youtube.search.list({ part: ['id'], channelId: 'UCCI37YB3l21oq_sLoc92YfA', type: ['video'], order: 'date', maxResults: 3 });
      results.videoIds = (s.data.items||[]).map((i:any) => i.id?.videoId).filter(Boolean);
    } catch(e: any) { results.videoIds = { error: e.message }; }

    // 5. Comments on first video - with ALL parts
    if (Array.isArray(results.videoIds) && results.videoIds.length) {
      try {
        const ct = await youtube.commentThreads.list({
          part: ['snippet', 'replies'],
          videoId: results.videoIds[0],
          maxResults: 10,
          order: 'time',
          moderationStatus: 'published',
        });
        results.commentsOnFirstVideo = {
          totalItems: ct.data.pageInfo?.totalResults,
          returned: ct.data.items?.length,
          sample: (ct.data.items||[]).slice(0,3).map((t:any) => ({
            id: t.snippet?.topLevelComment?.id,
            author: t.snippet?.topLevelComment?.snippet?.authorDisplayName,
            authorChannelId: t.snippet?.topLevelComment?.snippet?.authorChannelId?.value,
            text: t.snippet?.topLevelComment?.snippet?.textDisplay?.substring(0,60),
            hasSnippet: !!t.snippet?.topLevelComment?.snippet,
          }))
        };
      } catch(e: any) { results.commentsOnFirstVideo = { error: e.message }; }
    }

    // 6. Check posted_replies
    try {
      const p = await sql`SELECT COUNT(*) as n FROM posted_replies`;
      results.postedRepliesInDB = Number(p[0]?.n);
    } catch(e: any) { results.postedRepliesInDB = { error: e.message }; }

    // 7. Check token expiry AFTER refresh
    try {
      const rows = await sql`SELECT expiry_date FROM yt_tokens WHERE email = 'music@nathanielschool.com'`;
      results.tokenAfterRefresh = {
        expires: new Date(Number(rows[0]?.expiry_date)).toISOString(),
        valid: Date.now() < Number(rows[0]?.expiry_date),
      };
    } catch(e: any) { results.tokenAfterRefresh = { error: e.message }; }

  } catch(e: any) { results.auth = { error: e.message }; }

  return NextResponse.json(results, { status: 200 });
}
