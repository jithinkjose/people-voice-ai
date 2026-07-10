import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';
import { writeFile, unlink } from 'fs/promises';
import path from 'path';
import os from 'os';

const openai = new OpenAI({ apiKey: process.env.OPENAI_API_KEY });

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const audioFile = formData.get('audio') as File;

    if (!audioFile) {
      return NextResponse.json({ error: 'No audio file provided' }, { status: 400 });
    }

    // Write audio to a temp file so OpenAI SDK can read it
    const buffer = Buffer.from(await audioFile.arrayBuffer());
    const tempPath = path.join(os.tmpdir(), `audio_${Date.now()}.webm`);
    await writeFile(tempPath, buffer);

    const { createReadStream } = await import('fs');
    const transcription = await openai.audio.transcriptions.create({
      file: createReadStream(tempPath) as unknown as File,
      model: 'whisper-1',
      language: 'ml', // Malayalam; Whisper auto-detects English too
    });

    await unlink(tempPath).catch(() => {});

    return NextResponse.json({ transcript: transcription.text });
  } catch (err: unknown) {
    console.error('Transcription error:', err);
    const message = err instanceof Error ? err.message : 'Transcription failed';
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
