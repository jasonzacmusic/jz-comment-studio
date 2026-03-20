import { neon } from '@neondatabase/serverless';

const sql = neon(process.env.DATABASE_URL!);
export default sql;

export async function initDB() {
  await sql`
    CREATE TABLE IF NOT EXISTS yt_tokens (
      id SERIAL PRIMARY KEY,
      email TEXT NOT NULL UNIQUE,
      access_token TEXT,
      refresh_token TEXT NOT NULL,
      expiry_date BIGINT,
      updated_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS posted_replies (
      id SERIAL PRIMARY KEY,
      comment_id TEXT NOT NULL UNIQUE,
      thread_id TEXT NOT NULL,
      video_id TEXT,
      comment_type TEXT DEFAULT 'video_comment',
      commenter TEXT,
      comment_text TEXT,
      reply_text TEXT,
      posted_at TIMESTAMPTZ DEFAULT NOW()
    )
  `;
  await sql`
    CREATE TABLE IF NOT EXISTS cron_log (
      id SERIAL PRIMARY KEY,
      fetched_at TIMESTAMPTZ DEFAULT NOW(),
      comment_count INTEGER DEFAULT 0
    )
  `;
  return 'DB initialized';
}
