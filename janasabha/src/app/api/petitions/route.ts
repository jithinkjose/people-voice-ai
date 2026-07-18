import { NextRequest, NextResponse } from 'next/server';
import { getDb } from '@/lib/db';

export async function GET() {
  try {
    const db = getDb();
    const petitions = db.prepare('SELECT * FROM petitions ORDER BY created_at DESC').all();
    return NextResponse.json({ petitions });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to fetch petitions';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  try {
    const { citizen_name, transcript, draft_text, final_text, category, member_name } =
      await req.json();

    if (!transcript || !draft_text) {
      return NextResponse.json({ error: 'Missing required fields' }, { status: 400 });
    }

    const db = getDb();
    const result = db
      .prepare(
        `INSERT INTO petitions (citizen_name, transcript, draft_text, final_text, category, member_name)
         VALUES (?, ?, ?, ?, ?, ?)`
      )
      .run(
        citizen_name || 'Anonymous',
        transcript,
        draft_text,
        final_text || draft_text,
        category || 'General',
        member_name || 'Ward Councillor (Demo)'
      );

    return NextResponse.json({ id: result.lastInsertRowid }, { status: 201 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : 'Failed to save petition';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
