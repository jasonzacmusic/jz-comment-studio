import { NextRequest, NextResponse } from 'next/server';
import { getOAuthClient } from '@/lib/youtube';
import sql from '@/lib/db';

export async function GET(req: NextRequest) {
  const code = req.nextUrl.searchParams.get('code');
  const error = req.nextUrl.searchParams.get('error');

  if (error === 'access_denied') {
    return NextResponse.redirect(new URL('/?error=access_denied', req.url));
  }

  if (!code) return NextResponse.json({ error: 'No code' }, { status: 400 });

  try {
    const oauth2Client = getOAuthClient();
    const { tokens } = await oauth2Client.getToken(code);
    await sql`
      INSERT INTO yt_tokens (email, access_token, refresh_token, expiry_date)
      VALUES ('music@nathanielschool.com', ${tokens.access_token}, ${tokens.refresh_token!}, ${tokens.expiry_date})
      ON CONFLICT (email) DO UPDATE SET
        access_token = EXCLUDED.access_token,
        refresh_token = COALESCE(EXCLUDED.refresh_token, yt_tokens.refresh_token),
        expiry_date = EXCLUDED.expiry_date,
        updated_at = NOW()
    `;
    return NextResponse.redirect(new URL('/?connected=true', req.url));
  } catch(e: any) {
    return NextResponse.redirect(new URL('/?error=' + encodeURIComponent(e.message), req.url));
  }
}
