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

  // Auto-refresh if expired or within 1 min of expiry
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

// ── Extract first name from display name ──────────────────────────────────────
export function extractFirstName(displayName: string): string {
  const cleaned = displayName.replace(/^@/, '');
  const first = cleaned.split(/[\s._\-0-9]/)[0] || '';
  return /^[A-Za-z\u00C0-\u024F\u0900-\u097F]{2,15}$/.test(first) ? first : '';
}

// ── Fetch unresponded VIDEO comments ─────────────────────────────────────────
async function fetchVideoComments(youtube: any, maxResults: number): Promise<any[]> {
  // Get recent video IDs
  const searchRes = await youtube.search.list({
    part: ['id'],
    channelId: CHANNEL_ID,
    type: ['video'],
    order: 'date',
    maxResults: 50,
  });
  const videoIds = (searchRes.data.items || []).map((i: any) => i.id?.videoId).filter(Boolean);
  if (!videoIds.length) return [];

  // Fetch comment threads in batches of 5
  let allThreads: any[] = [];
  for (let i = 0; i < videoIds.length && allThreads.length < maxResults * 3; i += 5) {
    const batch = videoIds.slice(i, i + 5).join(',');
    try {
      const res = await youtube.commentThreads.list({
        part: ['snippet', 'replies'],
        videoId: batch,
        maxResults: 100,
        order: 'time',
      });
      allThreads = [...allThreads, ...(res.data.items || [])];
    } catch { continue; }
  }

  // Get video titles
  const uniqueVids = [...new Set(allThreads.map((t: any) => t.snippet.topLevelComment.snippet.videoId))];
  const titlesRes = await youtube.videos.list({ part: ['snippet'], id: uniqueVids as string[], maxResults: 50 });
  const titleMap: Record<string, string> = {};
  (titlesRes.data.items || []).forEach((v: any) => { titleMap[v.id!] = v.snippet?.title || ''; });

  const results: any[] = [];

  for (const thread of allThreads) {
    const s = thread.snippet.topLevelComment.snippet;

    // Add top-level comment if channel hasn't replied
    const replies = thread.replies?.comments || [];
    const channelReplied = replies.some((r: any) => r.snippet?.authorChannelId?.value === CHANNEL_ID);

    if (!channelReplied) {
      results.push({
        id: thread.snippet.topLevelComment.id,
        threadId: thread.id,
        type: 'video_comment',
        typeLabel: 'Video Comment',
        videoId: s.videoId,
        videoTitle: titleMap[s.videoId] || s.videoId,
        author: s.authorDisplayName || '',
        firstName: extractFirstName(s.authorDisplayName || ''),
        text: s.textDisplay,
        likes: s.likeCount || 0,
        publishedAt: s.publishedAt,
        parentAuthor: null,
        parentText: null,
      });
    }

    // Add replies from OTHER people that channel hasn't responded to
    for (const reply of replies) {
      const rs = reply.snippet;
      if (rs?.authorChannelId?.value === CHANNEL_ID) continue; // skip our own replies
      // Check if channel has replied to this specific reply
      const channelRepliedToThis = replies.some(
        (r: any) => r.snippet?.authorChannelId?.value === CHANNEL_ID &&
          r.snippet?.publishedAt > rs?.publishedAt
      );
      if (!channelRepliedToThis) {
        results.push({
          id: reply.id,
          threadId: thread.id,
          type: 'reply',
          typeLabel: 'Reply to Comment',
          videoId: s.videoId,
          videoTitle: titleMap[s.videoId] || s.videoId,
          author: rs?.authorDisplayName || '',
          firstName: extractFirstName(rs?.authorDisplayName || ''),
          text: rs?.textDisplay || '',
          likes: rs?.likeCount || 0,
          publishedAt: rs?.publishedAt,
          parentAuthor: s.authorDisplayName,
          parentText: s.textDisplay?.substring(0, 80),
        });
      }
    }
  }

  return results;
}

// ── Fetch unresponded COMMUNITY POST comments ─────────────────────────────────
async function fetchCommunityComments(youtube: any): Promise<any[]> {
  try {
    // Get community posts (activities)
    const actRes = await youtube.activities.list({
      part: ['id', 'snippet', 'contentDetails'],
      channelId: CHANNEL_ID,
      maxResults: 20,
    });

    const posts = (actRes.data.items || []).filter(
      (a: any) => a.snippet?.type === 'bulletin'
    );

    if (!posts.length) return [];

    const results: any[] = [];
    for (const post of posts.slice(0, 5)) {
      // Community post comments use commentThreads with allThreadsRelatedToChannelId
      try {
        const commRes = await youtube.commentThreads.list({
          part: ['snippet', 'replies'],
          allThreadsRelatedToChannelId: CHANNEL_ID,
          maxResults: 50,
        });

        for (const thread of (commRes.data.items || [])) {
          const s = thread.snippet.topLevelComment.snippet;
          if (s.videoId) continue; // skip video comments, only want community

          const replies = thread.replies?.comments || [];
          const channelReplied = replies.some((r: any) => r.snippet?.authorChannelId?.value === CHANNEL_ID);

          if (!channelReplied) {
            results.push({
              id: thread.snippet.topLevelComment.id,
              threadId: thread.id,
              type: 'community_post',
              typeLabel: 'Community Post',
              videoId: null,
              videoTitle: 'Community Post',
              author: s.authorDisplayName || '',
              firstName: extractFirstName(s.authorDisplayName || ''),
              text: s.textDisplay,
              likes: s.likeCount || 0,
              publishedAt: s.publishedAt,
              parentAuthor: null,
              parentText: null,
            });
          }
        }
      } catch { continue; }
    }
    return results;
  } catch {
    return [];
  }
}

// ── Main fetch function ───────────────────────────────────────────────────────
export async function fetchUnrespondedComments(maxResults = 50): Promise<any[]> {
  const auth = await getAuthenticatedClient();
  const youtube = google.youtube({ version: 'v3', auth });

  // Get already-posted replies from DB
  const alreadyPosted = await sql`SELECT comment_id FROM posted_replies`;
  const postedSet = new Set(alreadyPosted.map((r: any) => r.comment_id));

  // Fetch all types in parallel
  const [videoComments, communityComments] = await Promise.all([
    fetchVideoComments(youtube, maxResults),
    fetchCommunityComments(youtube),
  ]);

  const all = [...videoComments, ...communityComments]
    .filter(c => !postedSet.has(c.id))
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
    .slice(0, maxResults);

  return all;
}

// ── Post a reply ──────────────────────────────────────────────────────────────
export async function postReply(threadId: string, replyText: string): Promise<any> {
  const auth = await getAuthenticatedClient();
  const youtube = google.youtube({ version: 'v3', auth });
  const res = await youtube.comments.insert({
    part: ['snippet'],
    requestBody: { snippet: { parentId: threadId, textOriginal: replyText } },
  });
  return res.data;
}
