import OpenAI from 'openai';
import { NextResponse } from 'next/server';

export const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

/**
 * Converts an OpenAI SDK error into a NextResponse with an appropriate HTTP
 * status code and a user-friendly message.
 *
 * - 429  →  quota exceeded / rate limited
 * - 401  →  invalid API key
 * - 5xx  →  OpenAI service error
 * - else →  generic 500
 */
export function openAIErrorResponse(err: unknown, fallback: string): NextResponse {
  if (err instanceof OpenAI.APIError) {
    if (err.status === 429) {
      return NextResponse.json(
        {
          error:
            'OpenAI quota exceeded. Please check your API plan and billing details at https://platform.openai.com/account/billing.',
          code: 'quota_exceeded',
        },
        { status: 429 },
      );
    }

    if (err.status === 401) {
      return NextResponse.json(
        { error: 'Invalid OpenAI API key. Please check your OPENAI_API_KEY configuration.', code: 'invalid_api_key' },
        { status: 401 },
      );
    }

    if (err.status != null && err.status >= 500) {
      return NextResponse.json(
        { error: 'OpenAI service is temporarily unavailable. Please try again later.', code: 'openai_unavailable' },
        { status: 502 },
      );
    }

    return NextResponse.json({ error: err.message || fallback }, { status: err.status ?? 500 });
  }

  const message = err instanceof Error ? err.message : fallback;
  return NextResponse.json({ error: message }, { status: 500 });
}
