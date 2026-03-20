import { google } from 'googleapis';
import sql from './db';

const CHANNEL_ID = 'UCCI37YB3l21oq_sLoc92YfA';

export function getOAuthClient() {
  return new google.auth.OAuth2(
    process.env.GOOGLE_CLIENT_ID,
    process.env.GOOGLE_CLIENT_SECRET,
    `${process.env.NEXTAUTH_URL}/api/auth/callback`
  );
}

export async function getAuthenticatedClient() {
  const rows = await sql`SELECT * FROM yt_tokens WHERE email = 'music@nathanielschool.com' LIMIT 1`;
  if (!rows.length) throw new Error('NOT_CONNECTED');

  const oauth2Client = getOAuthClient();
  oauth2Client.setCredentials({
    access_token: rows[0].access_token,
    refresh_token: rows[0].refresh_token,
    expiry_date: Number(rows[0].expiry_date),
  });

  // Auto-refresh if expired
  if (Date.now() > Number(rows[0].expiry_date) - 60000) {
    const { credentials } = await oauth2Client.refreshAccessToken();
    await sql`
      UPDATE yt_tokens SET 
        access_token = ${credentials.access_token},
        expiry_date = ${credentials.expiry_date},
        updated_at = NOW()
      WHERE email = 'music@nathanielschool.com'
    `;
    oauth2Client.setCredentials(credentials);
  }

  return oauth2Client;
}

export async function fetchUnrespondedComments(maxResults = 50) {
  const auth = await getAuthenticatedClient();
  const youtube = google.youtube({ version: 'v3', auth });

  // Get recent video IDs
  const searchRes = await youtube.search.list({
    part: ['id'],
    channelId: CHANNEL_ID,
    type: ['video'],
    order: 'date',
    maxResults: 30,
  });
  const videoIds = (searchRes.data.items || []).map(i => i.id?.videoId).filter(Boolean) as string[];
  if (!videoIds.length) return [];

  // Fetch comments in batches
  let allThreads: any[] = [];
  for (let i = 0; i < videoIds.length && allThreads.length < maxResults * 2; i += 5) {
    const batch = videoIds.slice(i, i + 5).join(',');
    try {
      const res = await youtube.commentThreads.list({
        part: ['snippet', 'replies'],
        videoId: batch,
        maxResults: 50,
        order: 'time',
      });
      allThreads = [...allThreads, ...(res.data.items || [])];
    } catch {}
  }

  // Filter: no reply from channel owner
  const unresponded = allThreads.filter(thread => {
    const replies = thread.replies?.comments || [];
    return !replies.some((r: any) => r.snippet?.authorChannelId?.value === CHANNEL_ID);
  });

  // Get video titles
  const uniqueVids = [...new Set(unresponded.map((t: any) => t.snippet.topLevelComment.snippet.videoId))];
  const titlesRes = await youtube.videos.list({ part: ['snippet'], id: uniqueVids as string[], maxResults: 50 });
  const titleMap: Record<string, string> = {};
  (titlesRes.data.items || []).forEach(v => { titleMap[v.id!] = v.snippet?.title || ''; });

  // Check already-replied in our DB
  const alreadyPosted = await sql`SELECT comment_id FROM posted_replies`;
  const postedSet = new Set(alreadyPosted.map((r: any) => r.comment_id));

  return unresponded
    .filter((t: any) => !postedSet.has(t.snippet.topLevelComment.id))
    .slice(0, maxResults)
    .map((t: any) => {
      const s = t.snippet.topLevelComment.snippet;
      const raw = s.authorDisplayName || '';
      const cleaned = raw.replace(/^@/, '');
      const fn = cleaned.split(/[\s._\-0-9]/)[0] || '';
      const isRealName = /^[A-Za-z\u00C0-\u024F\u0900-\u097F]{2,15}$/.test(fn);
      return {
        id: t.snippet.topLevelComment.id,
        threadId: t.id,
        videoId: s.videoId,
        videoTitle: titleMap[s.videoId] || s.videoId,
        author: raw,
        firstName: isRealName ? fn : '',
        text: s.textDisplay,
        likes: s.likeCount || 0,
        publishedAt: s.publishedAt,
      };
    });
}

export async function postReply(threadId: string, replyText: string) {
  const auth = await getAuthenticatedClient();
  const youtube = google.youtube({ version: 'v3', auth });
  const res = await youtube.comments.insert({
    part: ['snippet'],
    requestBody: { snippet: { parentId: threadId, textOriginal: replyText } },
  });
  return res.data;
}
