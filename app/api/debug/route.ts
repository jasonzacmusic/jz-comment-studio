import { NextResponse } from 'next/server';
import { getAuthenticatedClient } from '@/lib/youtube';
import { google } from 'googleapis';
import sql from '@/lib/db';

export async function GET() {
  const results: any = {};

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

  try {
    const auth = await getAuthenticatedClient();
    results.auth = 'ok';
    const youtube = google.youtube({ version: 'v3', auth });

    // Check token info - what scopes does it have?
    try {
      const oauth2 = google.oauth2({ version: 'v2', auth });
      const info = await oauth2.tokeninfo({});
      results.tokenScopes = info.data.scope;
      results.tokenEmail = info.data.email;
    } catch(e: any) { results.tokenScopes = { error: e.message }; }

    // Try fetching comments WITHOUT moderationStatus filter
    try {
      const ct = await youtube.commentThreads.list({
        part: ['snippet', 'replies'],
        videoId: 'GMHVb7xhRZM',
        maxResults: 5,
      });
      results.video1_noFilter = {
        total: ct.data.pageInfo?.totalResults,
        returned: ct.data.items?.length,
        sample: ct.data.items?.slice(0,2).map((t:any) => ({
          text: t.snippet?.topLevelComment?.snippet?.textDisplay?.substring(0,50),
          author: t.snippet?.topLevelComment?.snippet?.authorDisplayName,
        }))
      };
    } catch(e: any) { results.video1_noFilter = { error: e.message }; }

    // Try a known older popular video
    try {
      const ct2 = await youtube.commentThreads.list({
        part: ['snippet'],
        videoId: '5N7ZDWh2u7A',
        maxResults: 5,
      });
      results.video3_comments = {
        total: ct2.data.pageInfo?.totalResults,
        returned: ct2.data.items?.length,
      };
    } catch(e: any) { results.video3_comments = { error: e.message }; }

    // Try allThreadsRelatedToChannelId - this is the most permissive
    try {
      const all = await youtube.commentThreads.list({
        part: ['snippet', 'replies'],
        allThreadsRelatedToChannelId: 'UCCI37YB3l21oq_sLoc92YfA',
        maxResults: 10,
      });
      results.allThreads = {
        total: all.data.pageInfo?.totalResults,
        returned: all.data.items?.length,
        sample: all.data.items?.slice(0,3).map((t:any) => ({
          text: t.snippet?.topLevelComment?.snippet?.textDisplay?.substring(0,60),
          author: t.snippet?.topLevelComment?.snippet?.authorDisplayName,
          videoId: t.snippet?.topLevelComment?.snippet?.videoId,
          hasVideoId: !!t.snippet?.topLevelComment?.snippet?.videoId,
        }))
      };
    } catch(e: any) { results.allThreads = { error: e.message }; }

  } catch(e: any) { results.auth = { error: e.message }; }

  return NextResponse.json(results, { status: 200 });
}
