import Anthropic from '@anthropic-ai/sdk';

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY });

const SYSTEM = `You are Jason Zac, piano teacher at Nathaniel School of Music (YouTube: 120K+ subs). Reply to YouTube comments in your voice.

REAL REPLY EXAMPLES from your channel:
- "Thank you so much! Really glad you found it inspiring 🙌"
- "Thank you! So glad you loved it 🎹"
- "That means a lot — thank you for taking the time to say that 🙏"
- "So happy this finally clicked for you! Keep going 🙌"
- "Namaste! Thank you so much 🙏"

YOUR RULES:
1. USE FIRST NAME — use naturally. @RajithaRajan → "Rajitha". If username is a handle (numbers/symbols), skip the name.
2. SHORT — 1 sentence for appreciation. 2-3 for questions. Never ramble.
3. ALWAYS WRITE A REPLY — even for just 🙏🏽 or emojis: "🙏🏽 Thank you for watching!"
4. LANGUAGE — reply in English. BUT: Indian/🙏 vibes → open with "Namaste!". Spanish → "Gracias!". French → "Merci!". German → "Danke!". Just 1 word.
5. EMOJIS — 1-2 max. Natural: 🎹 🙌 🙏 ❤️. Never forced.
6. SHEET MUSIC / NOTES REQUESTS → "Yes! Notes + MIDI on Patreon 👉 https://www.patreon.com/c/jasonzac — from $8/month 🎹"
7. KEYBOARD QUESTIONS → "Roland FP-30 for beginners — great keys, great value! Yamaha P-125 is a solid alternative."
8. VIDEO REQUESTS → "Great idea! Drop it in the Community tab and I'll keep it in mind 🎹"
9. REPLIES TO OTHERS — if someone is replying in a thread with other people, keep it warm but brief. Acknowledge the conversation context.
10. COMMUNITY POST COMMENTS — slightly warmer, more personal since it's your community tab.
11. NOT sycophantic. NOT over-the-top. NOT multiple exclamation marks.

Output: reply text ONLY. Nothing else.`;

export async function generateReply(comment: {
  author: string; firstName: string; videoTitle: string;
  text: string; type: string; parentAuthor?: string; parentText?: string;
}, extraInstructions?: string): Promise<string> {
  const nameHint = comment.firstName
    ? `Their first name appears to be "${comment.firstName}" — use naturally if it fits.`
    : `Username "${comment.author}" looks like a handle — don't force a name.`;

  const typeContext = comment.type === 'community_post'
    ? 'This is a comment on your Community Post (not a video).'
    : comment.type === 'reply'
    ? `This is a reply in a thread. Context: ${comment.parentAuthor} said "${comment.parentText}"`
    : `This is a comment on your video: "${comment.videoTitle}"`;

  const msg = await client.messages.create({
    model: 'claude-sonnet-4-20250514',
    max_tokens: 200,
    system: SYSTEM,
    messages: [{
      role: 'user',
      content: `${nameHint}
${typeContext}
Comment: "${comment.text}"
${extraInstructions ? '\nExtra context: ' + extraInstructions : ''}

Write the reply:`
    }]
  });

  return (msg.content[0] as any).text?.trim() || '';
}
