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

  // Auto-refresh if expired or within 2 mins of expiry
  if (Date.now() > Number(rows[0].expiry_date) - 120000) {
    try {
      const { credentials } = await oauth2Client.refreshAccessToken();
      await sql`
        UPDATE yt_tokens SET
          access_token = ${credentials.access_token},
          expiry_date = ${credentials.expiry_date},
          updated_at = NOW()
        WHERE email = 'music@nathanielschool.com'
      `;
      oauth2Client.setCredentials(credentials);
    } catch(e) { /* use existing token */ }
  }
  return oauth2Client;
}

export function extractFirstName(displayName: string): string {
  const cleaned = (displayName || '').replace(/^@/, '');
  const first = cleaned.split(/[\s._\-0-9]/)[0] || '';
  return /^[A-Za-z\u00C0-\u024F\u0900-\u097F]{2,15}$/.test(first) ? first : '';
}

export async function fetchUnrespondedComments(maxResults = 50): Promise<any[]> {
  const auth = await getAuthenticatedClient();
  const youtube = google.youtube({ version: 'v3', auth });

  // Get comment IDs we've already replied to from our DB
  const alreadyPosted = await sql`SELECT comment_id FROM posted_replies`;
  const postedSet = new Set(alreadyPosted.map((r: any) => r.comment_id));

  const results: any[] = [];

  // ── 1. Get recent video IDs ───────────────────────────────────────────────
  let videoIds: string[] = [];
  try {
    const searchRes = await youtube.search.list({
      part: ['id'],
      channelId: CHANNEL_ID,
      type: ['video'],
      order: 'date',
      maxResults: 50,
    });
    videoIds = (searchRes.data.items || [])
      .map((i: any) => i.id?.videoId)
      .filter(Boolean) as string[];
  } catch(e: any) {
    throw new Error(`Failed to fetch videos: ${e.message}`);
  }

  if (!videoIds.length) return [];

  // ── 2. Fetch comment threads per batch of videos ───────────────────────────
  for (let i = 0; i < Math.min(videoIds.length, 30) && results.length < maxResults * 2; i += 5) {
    const batch = videoIds.slice(i, i + 5).join(',');
    try {
      const res = await youtube.commentThreads.list({
        part: ['snippet', 'replies'],
        videoId: batch,
        maxResults: 100,
        order: 'time',
        moderationStatus: 'published',
      });

      for (const thread of (res.data.items || [])) {
        const top = thread.snippet?.topLevelComment;
        if (!top) continue;
        const s = top.snippet;
        const threadId = thread.id!;
        const commentId = top.id!;

        // Skip if already in our posted DB
        if (postedSet.has(commentId)) continue;

        // Skip if it's our own comment
        if (s?.authorChannelId?.value === CHANNEL_ID) continue;

        // Check if channel has replied in this thread
        const replies = thread.replies?.comments || [];
        const weReplied = replies.some((r: any) =>
          r.snippet?.authorChannelId?.value === CHANNEL_ID
        );

        if (!weReplied) {
          results.push({
            id: commentId,
            threadId,
            type: 'video_comment',
            typeLabel: 'Video Comment',
            videoId: s?.videoId,
            videoTitle: s?.videoId, // resolved below
            author: s?.authorDisplayName || '',
            firstName: extractFirstName(s?.authorDisplayName || ''),
            text: s?.textDisplay || '',
            likes: s?.likeCount || 0,
            publishedAt: s?.publishedAt,
            parentAuthor: null,
            parentText: null,
          });
        }

        // ── Also add unanswered replies from others in the thread ──────────
        for (const reply of replies) {
          const rs = reply.snippet;
          if (!rs) continue;
          if (rs.authorChannelId?.value === CHANNEL_ID) continue; // skip our own
          if (postedSet.has(reply.id!)) continue;

          // Only add reply if we haven't replied to the thread after this reply was posted
          const ourRepliesAfter = replies.filter((r: any) =>
            r.snippet?.authorChannelId?.value === CHANNEL_ID &&
            new Date(r.snippet?.publishedAt) > new Date(rs.publishedAt)
          );
          if (ourRepliesAfter.length === 0) {
            results.push({
              id: reply.id!,
              threadId,
              type: 'reply',
              typeLabel: 'Reply to Comment',
              videoId: s?.videoId,
              videoTitle: s?.videoId,
              author: rs.authorDisplayName || '',
              firstName: extractFirstName(rs.authorDisplayName || ''),
              text: rs.textDisplay || '',
              likes: rs.likeCount || 0,
              publishedAt: rs.publishedAt,
              parentAuthor: s?.authorDisplayName,
              parentText: s?.textDisplay?.substring(0, 100),
            });
          }
        }
      }
    } catch(e: any) {
      // Log but don't crash — continue with next batch
      console.error(`Batch ${i} failed:`, e.message);
      continue;
    }
  }

  // ── 3. Resolve video titles in one batch call ─────────────────────────────
  const uniqueVids = [...new Set(results.map(r => r.videoId).filter(Boolean))];
  if (uniqueVids.length) {
    try {
      const titlesRes = await youtube.videos.list({
        part: ['snippet'],
        id: uniqueVids as string[],
        maxResults: 50,
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

  // ── 4. Community post comments ─────────────────────────────────────────────
  try {
    const commRes = await youtube.commentThreads.list({
      part: ['snippet', 'replies'],
      allThreadsRelatedToChannelId: CHANNEL_ID,
      maxResults: 50,
    });
    for (const thread of (commRes.data.items || [])) {
      const top = thread.snippet?.topLevelComment;
      if (!top) continue;
      const s = top.snippet;
      if (s?.videoId) continue; // skip video comments, only want channel/community
      if (postedSet.has(top.id!)) continue;
      if (s?.authorChannelId?.value === CHANNEL_ID) continue;

      const replies = thread.replies?.comments || [];
      const weReplied = replies.some((r: any) => r.snippet?.authorChannelId?.value === CHANNEL_ID);
      if (!weReplied) {
        results.push({
          id: top.id!,
          threadId: thread.id!,
          type: 'community_post',
          typeLabel: 'Community Post',
          videoId: null,
          videoTitle: 'Community Post',
          author: s?.authorDisplayName || '',
          firstName: extractFirstName(s?.authorDisplayName || ''),
          text: s?.textDisplay || '',
          likes: s?.likeCount || 0,
          publishedAt: s?.publishedAt,
          parentAuthor: null,
          parentText: null,
        });
      }
    }
  } catch { /* community posts optional */ }

  // Sort by newest first, deduplicate, limit
  const seen = new Set<string>();
  return results
    .filter(r => { if (seen.has(r.id)) return false; seen.add(r.id); return true; })
    .sort((a, b) => new Date(b.publishedAt).getTime() - new Date(a.publishedAt).getTime())
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
