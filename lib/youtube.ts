import { google } from 'googleapis';
import sql from './db';

const CHANNEL_ID = 'UCCI37YB3l21oq_sLoc92YfA';
const CHANNEL_HANDLE = 'nathanielmusicschool';

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

  if (Date.now() > Number(rows[0].expiry_date) - 600000) {
    try {
      const { credentials } = await oauth2Client.refreshAccessToken();
      if (credentials.access_token) {
        await sql`
          UPDATE yt_tokens SET
            access_token = ${credentials.access_token},
            expiry_date = ${credentials.expiry_date ?? (Date.now() + 3600000)},
            updated_at = NOW()
          WHERE email = 'music@nathanielschool.com'
        `;
        oauth2Client.setCredentials(credentials);
      }
    } catch(e: any) {
      if (e.message?.includes('invalid_grant')) throw new Error('RECONNECT_REQUIRED');
    }
  }
  return oauth2Client;
}

// Check if a comment is from the channel owner (by ID or handle)
function isOurComment(snippet: any): boolean {
  if (!snippet) return false;
  if (snippet.authorChannelId?.value === CHANNEL_ID) return true;
  const url = (snippet.authorChannelUrl || '').toLowerCase();
  const name = (snippet.authorDisplayName || '').toLowerCase().replace(/^@/, '');
  if (url.includes(CHANNEL_HANDLE)) return true;
  if (url.includes(CHANNEL_ID)) return true;
  if (name === CHANNEL_HANDLE) return true;
  if (name === 'jason zac' || name === 'jason zac - nathaniel school of music') return true;
  return false;
}

export function extractFirstName(displayName: string): string {
  const cleaned = (displayName || '').replace(/^@/, '');
  const first = cleaned.split(/[\s._\-0-9]/)[0] || '';
  return /^[A-Za-z\u00C0-\u024F\u0900-\u097F]{2,15}$/.test(first) ? first : '';
}

export async function fetchUnrespondedComments(maxResults = 50): Promise<any[]> {
  const auth = await getAuthenticatedClient();
  const youtube = google.youtube({ version: 'v3', auth });

  const alreadyPosted = await sql`SELECT comment_id FROM posted_replies`;
  const postedSet = new Set(alreadyPosted.map((r: any) => r.comment_id));

  const results: any[] = [];
  let nextPageToken: string | undefined;
  let pages = 0;

  do {
    try {
      const res: any = await youtube.commentThreads.list({
        part: ['snippet', 'replies'],
        allThreadsRelatedToChannelId: CHANNEL_ID,
        maxResults: 100,
        order: 'time',
        ...(nextPageToken ? { pageToken: nextPageToken } : {}),
      });

      nextPageToken = res.data.nextPageToken ?? undefined;
      pages++;

      for (const thread of (res.data.items || [])) {
        const top = thread.snippet?.topLevelComment;
        if (!top?.snippet) continue;
        const s = top.snippet;
        const threadId = thread.id!;
        const commentId = top.id!;

        // Skip our own comments, already-replied, already-posted
        if (isOurComment(s)) continue;
        if (postedSet.has(commentId)) continue;

        const replies = thread.replies?.comments || [];

        // Check if we've already replied in this thread
        const weReplied = replies.some((r: any) => isOurComment(r.snippet));

        if (!weReplied) {
          results.push({
            id: commentId,
            threadId,
            type: s.videoId ? 'video_comment' : 'community_post',
            typeLabel: s.videoId ? 'Video Comment' : 'Community Post',
            videoId: s.videoId || null,
            videoTitle: s.videoId || 'Community Post',
            author: s.authorDisplayName || '',
            firstName: extractFirstName(s.authorDisplayName || ''),
            text: s.textDisplay || '',
            likes: s.likeCount || 0,
            publishedAt: s.publishedAt,
            parentAuthor: null,
            parentText: null,
          });
        }

        // Unanswered replies from others
        for (const reply of replies) {
          const rs = reply.snippet;
          if (!rs) continue;
          if (isOurComment(rs)) continue;
          if (postedSet.has(reply.id!)) continue;

          // Only add if we haven't replied after this reply was posted
          const weRepliedAfter = replies.some((r: any) =>
            isOurComment(r.snippet) &&
            new Date(r.snippet?.publishedAt ?? 0) > new Date(rs.publishedAt ?? 0)
          );
          if (!weRepliedAfter) {
            results.push({
              id: reply.id!,
              threadId,
              type: 'reply',
              typeLabel: 'Reply to Comment',
              videoId: s.videoId || null,
              videoTitle: s.videoId || 'Community Post',
              author: rs.authorDisplayName || '',
              firstName: extractFirstName(rs.authorDisplayName || ''),
              text: rs.textDisplay || '',
              likes: rs.likeCount || 0,
              publishedAt: rs.publishedAt,
              parentAuthor: s.authorDisplayName,
              parentText: s.textDisplay?.substring(0, 100),
            });
          }
        }

        if (results.length >= maxResults * 3) break;
      }
    } catch(e: any) {
      throw new Error(`Comment fetch failed: ${e.message}`);
    }
  } while (nextPageToken && results.length < maxResults * 3 && pages < 10);

  // Resolve video titles
  const uniqueVids = [...new Set(
    results.filter(r => r.videoId).map(r => r.videoId)
  )] as string[];

  if (uniqueVids.length) {
    try {
      const titlesRes = await youtube.videos.list({
        part: ['snippet'], id: uniqueVids.slice(0, 50), maxResults: 50,
      });
      const titleMap: Record<string, string> = {};
      (titlesRes.data.items || []).forEach((v: any) => {
        titleMap[v.id] = v.snippet?.title || v.id;
      });
      results.forEach(r => {
        if (r.videoId && titleMap[r.videoId]) r.videoTitle = titleMap[r.videoId];
      });
    } catch { /* titles stay as IDs */ }
  }

  // Dedupe, sort newest first, limit
  const seen = new Set<string>();
  return results
    .filter(r => { if (seen.has(r.id)) return false; seen.add(r.id); return true; })
    .sort((a, b) => new Date(b.publishedAt ?? 0).getTime() - new Date(a.publishedAt ?? 0).getTime())
    .slice(0, maxResults);
}

export async function postReply(threadId: string, replyText: string): Promise<any> {
  const auth = await getAuthenticatedClient();
  const youtube = google.youtube({ version: 'v3', auth });
  const res = await youtube.comments.insert({
    part: ['snippet'],
    requestBody: { snippet: { parentId: threadId, textOriginal: replyText } },
  });
  return res.data;
}
