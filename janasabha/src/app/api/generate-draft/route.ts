import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const { transcript, correction, originalDraft } = await req.json();

    if (!transcript && !correction) {
      return NextResponse.json({ error: 'No input provided' }, { status: 400 });
    }

    let prompt: string;

    if (correction && originalDraft) {
      // Iteration 4: apply a spoken correction to an existing draft
      prompt = `You are a petition editor. The user has an existing petition draft and wants to make a correction.

Original draft:
${originalDraft}

User's correction instruction (spoken, may be in Malayalam or English):
${correction}

Apply the correction and return the complete updated petition. Keep the formal tone. Return only the updated petition text, nothing else.`;
    } else {
      // Iteration 2: generate first draft from raw transcript
      prompt = `You are a petition writer helping citizens of Kerala, India.
Convert the following raw spoken input (in Malayalam or English) into a well-structured formal petition addressed to an elected local representative.

Raw spoken input:
${transcript}

Write the petition in the same language as the input (Malayalam if input is in Malayalam, English if input is in English).
Structure it with:
- Subject line
- Respectful salutation
- Clear description of the problem or request
- Any suggested solution mentioned by the user
- Polite closing

Return only the petition text, nothing else.`;
    }

    const completion = await openai.chat.completions.create({
      model: 'gpt-4o',
      messages: [{ role: 'user', content: prompt }],
      temperature: 0.4,
    });

    const draft = completion.choices[0].message.content ?? '';

    // Auto-categorize in the same call would cost an extra round trip;
    // do it with a cheap secondary call
    let category = 'General';
    try {
      const catCompletion = await openai.chat.completions.create({
        model: 'gpt-4o-mini',
        messages: [
          {
            role: 'user',
            content: `Classify this petition into exactly one category from this list:
Roads, Water, Electricity, Health, Education, Sanitation, Housing, Agriculture, Employment, General

Petition:
${draft}

Reply with only the category name, nothing else.`,
          },
        ],
        temperature: 0,
      });
      category = catCompletion.choices[0].message.content?.trim() ?? 'General';
    } catch {
      // categorization is best-effort
    }

    return NextResponse.json({ draft, category });
  } catch (err: unknown) {
    console.error('Draft generation error:', err);
    const message = err instanceof Error ? err.message : 'Draft generation failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
