import { NextResponse } from 'next/server';
import { getOAuthClient } from '@/lib/youtube';

export async function GET() {
  const oauth2Client = getOAuthClient();
  const url = oauth2Client.generateAuthUrl({
    access_type: 'offline',
    prompt: 'consent',
    scope: ['https://www.googleapis.com/auth/youtube.force-ssl'],
  });
  return NextResponse.redirect(url);
}
