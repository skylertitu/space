/** Cloud Functions region — Salt Lake City (closest to Roosevelt HQ). */
export const FUNCTIONS_REGION = 'us-west3' as const;

/** Primary Next.js API (Vercel). Webhooks and bot engine run here. */
export const ROOSEVELT_API_BASE =
    process.env.ROOSEVELT_API_BASE || 'https://www.itsroosevelt.com';
