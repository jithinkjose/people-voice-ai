'use client';

import { useState, useRef, useCallback } from 'react';
import Link from 'next/link';

type Step = 'idle' | 'recording' | 'transcribing' | 'transcript' | 'generating' | 'draft' | 'recording-correction' | 'applying-correction' | 'submitting' | 'submitted';

const CATEGORY_COLORS: Record<string, string> = {
  Roads: 'bg-orange-100 text-orange-800',
  Water: 'bg-blue-100 text-blue-800',
  Electricity: 'bg-yellow-100 text-yellow-800',
  Health: 'bg-red-100 text-red-800',
  Education: 'bg-purple-100 text-purple-800',
  Sanitation: 'bg-green-100 text-green-800',
  Housing: 'bg-indigo-100 text-indigo-800',
  Agriculture: 'bg-lime-100 text-lime-800',
  Employment: 'bg-teal-100 text-teal-800',
  General: 'bg-gray-100 text-gray-800',
};

export default function CitizenPage() {
  const [step, setStep] = useState<Step>('idle');
  const [citizenName, setCitizenName] = useState('');
  const [transcript, setTranscript] = useState('');
  const [draft, setDraft] = useState('');
  const [category, setCategory] = useState('General');
  const [error, setError] = useState('');
  const [audioUrl, setAudioUrl] = useState('');
  const [petitionId, setPetitionId] = useState<number | null>(null);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);

  const clearError = () => setError('');

  // ── Iteration 1: Record audio ──────────────────────────────────────────────

  const startRecording = useCallback(async (forCorrection = false) => {
    clearError();
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      const recorder = new MediaRecorder(stream, { mimeType: 'audio/webm' });
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: 'audio/webm' });
        if (forCorrection) {
          await transcribeCorrection(blob);
        } else {
          await transcribeAudio(blob);
        }
      };

      mediaRecorderRef.current = recorder;
      recorder.start();
      setStep(forCorrection ? 'recording-correction' : 'recording');
    } catch {
      setError('Microphone access denied. Please allow microphone permission and try again.');
    }
  }, []);

  const stopRecording = useCallback(() => {
    mediaRecorderRef.current?.stop();
    setStep('transcribing');
  }, []);

  // ── Iteration 1: Transcribe audio ─────────────────────────────────────────

  const transcribeAudio = async (blob: Blob) => {
    clearError();
    setStep('transcribing');
    try {
      const formData = new FormData();
      formData.append('audio', blob, 'recording.webm');

      const res = await fetch('/api/transcribe', { method: 'POST', body: formData });
      const data = await res.json();

      if (!res.ok) throw new Error(data.error);
      setTranscript(data.transcript);
      setStep('transcript');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Transcription failed');
      setStep('idle');
    }
  };

  // ── Iteration 2: Generate draft ───────────────────────────────────────────

  const generateDraft = async () => {
    clearError();
    setStep('generating');
    try {
      const res = await fetch('/api/generate-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setDraft(data.draft);
      setCategory(data.category);
      setStep('draft');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Draft generation failed');
      setStep('transcript');
    }
  };

  // ── Iteration 3: Read draft aloud ─────────────────────────────────────────

  const readDraftAloud = async () => {
    clearError();
    try {
      const res = await fetch('/api/tts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ text: draft }),
      });
      if (!res.ok) throw new Error('TTS failed');
      const blob = await res.blob();
      const url = URL.createObjectURL(blob);
      setAudioUrl(url);
      if (audioRef.current) {
        audioRef.current.src = url;
        audioRef.current.play();
      }
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Could not read draft aloud');
    }
  };

  // ── Iteration 4: Voice correction ─────────────────────────────────────────

  const transcribeCorrection = async (blob: Blob) => {
    setStep('applying-correction');
    try {
      const formData = new FormData();
      formData.append('audio', blob, 'correction.webm');

      const transcribeRes = await fetch('/api/transcribe', { method: 'POST', body: formData });
      const transcribeData = await transcribeRes.json();
      if (!transcribeRes.ok) throw new Error(transcribeData.error);

      const correctionText = transcribeData.transcript;

      const draftRes = await fetch('/api/generate-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ correction: correctionText, originalDraft: draft, transcript }),
      });
      const draftData = await draftRes.json();
      if (!draftRes.ok) throw new Error(draftData.error);

      setDraft(draftData.draft);
      if (draftData.category) setCategory(draftData.category);
      setStep('draft');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Correction failed');
      setStep('draft');
    }
  };

  // ── Iteration 5: Submit petition ──────────────────────────────────────────

  const submitPetition = async () => {
    clearError();
    setStep('submitting');
    try {
      const res = await fetch('/api/petitions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          citizen_name: citizenName || 'Anonymous',
          transcript,
          draft_text: draft,
          final_text: draft,
          category,
          member_name: 'Ward Councillor (Demo)',
        }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setPetitionId(data.id);
      setStep('submitted');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Submission failed');
      setStep('draft');
    }
  };

  const resetFlow = () => {
    setStep('idle');
    setTranscript('');
    setDraft('');
    setCategory('General');
    setError('');
    setAudioUrl('');
    setPetitionId(null);
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <main className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50">
      {/* Header */}
      <header className="bg-white shadow-sm">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-green-800">JanaSabha</h1>
            <p className="text-sm text-gray-500">ജനസഭ — Your Voice to Your Representative</p>
          </div>
          <Link
            href="/dashboard"
            className="text-sm bg-green-700 text-white px-4 py-2 rounded-lg hover:bg-green-800 transition"
          >
            Member Dashboard
          </Link>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">

        {/* Progress indicator */}
        <div className="flex items-center gap-2 text-sm text-gray-500">
          {[
            { label: 'Record', active: step === 'recording' || step === 'transcribing' || step === 'transcript' },
            { label: 'Draft', active: step === 'generating' || step === 'draft' || step === 'recording-correction' || step === 'applying-correction' },
            { label: 'Submit', active: step === 'submitting' || step === 'submitted' },
          ].map((s, i) => (
            <span key={s.label} className="flex items-center gap-2">
              {i > 0 && <span>→</span>}
              <span className={`px-3 py-1 rounded-full ${s.active ? 'bg-green-700 text-white font-medium' : 'bg-gray-200'}`}>
                {s.label}
              </span>
            </span>
          ))}
        </div>

        {/* Error banner */}
        {error && (
          <div className="bg-red-50 border border-red-200 text-red-700 rounded-lg p-4 flex justify-between">
            <span>{error}</span>
            <button onClick={clearError} className="text-red-400 hover:text-red-600 font-bold">✕</button>
          </div>
        )}

        {/* ── STEP: IDLE ── */}
        {step === 'idle' && (
          <div className="bg-white rounded-2xl shadow p-8 text-center space-y-6">
            <div className="text-6xl">🎤</div>
            <div>
              <h2 className="text-xl font-semibold text-gray-800">Submit a Petition</h2>
              <p className="text-gray-500 mt-1">Speak your problem or request in Malayalam or English</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1 text-left">
                Your Name (optional)
              </label>
              <input
                type="text"
                value={citizenName}
                onChange={(e) => setCitizenName(e.target.value)}
                placeholder="E.g. Rajan K."
                className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
              />
            </div>
            <button
              onClick={() => startRecording(false)}
              className="w-full bg-green-700 text-white py-4 rounded-xl text-lg font-semibold hover:bg-green-800 transition"
            >
              Start Recording
            </button>
          </div>
        )}

        {/* ── STEP: RECORDING ── */}
        {step === 'recording' && (
          <div className="bg-white rounded-2xl shadow p-8 text-center space-y-6">
            <div className="text-6xl animate-pulse">🔴</div>
            <h2 className="text-xl font-semibold text-gray-800">Recording...</h2>
            <p className="text-gray-500">Speak your problem clearly. Press Stop when done.</p>
            <button
              onClick={stopRecording}
              className="w-full bg-red-600 text-white py-4 rounded-xl text-lg font-semibold hover:bg-red-700 transition"
            >
              Stop Recording
            </button>
          </div>
        )}

        {/* ── STEP: TRANSCRIBING ── */}
        {(step === 'transcribing' || step === 'generating' || step === 'applying-correction' || step === 'submitting') && (
          <div className="bg-white rounded-2xl shadow p-8 text-center space-y-4">
            <div className="text-5xl animate-spin">⚙️</div>
            <h2 className="text-xl font-semibold text-gray-800">
              {step === 'transcribing' && 'Converting speech to text...'}
              {step === 'generating' && 'Generating your petition draft...'}
              {step === 'applying-correction' && 'Applying your correction...'}
              {step === 'submitting' && 'Submitting your petition...'}
            </h2>
            <p className="text-gray-500">Please wait a moment.</p>
          </div>
        )}

        {/* ── STEP: TRANSCRIPT ── */}
        {step === 'transcript' && (
          <div className="bg-white rounded-2xl shadow p-6 space-y-4">
            <h2 className="text-lg font-semibold text-gray-800">📝 What we heard</h2>
            <div className="bg-gray-50 rounded-lg p-4 border border-gray-200">
              <p className="text-gray-700 leading-relaxed">{transcript}</p>
            </div>
            <p className="text-sm text-gray-500">Does this sound right? We will now turn this into a formal petition.</p>
            <div className="flex gap-3">
              <button
                onClick={generateDraft}
                className="flex-1 bg-green-700 text-white py-3 rounded-xl font-semibold hover:bg-green-800 transition"
              >
                Generate Petition Draft →
              </button>
              <button
                onClick={resetFlow}
                className="px-4 py-3 border border-gray-300 rounded-xl text-gray-600 hover:bg-gray-50 transition"
              >
                Start Over
              </button>
            </div>
          </div>
        )}

        {/* ── STEP: DRAFT ── */}
        {step === 'draft' && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl shadow p-6 space-y-4">
              <div className="flex items-center justify-between">
                <h2 className="text-lg font-semibold text-gray-800">📄 Your Petition Draft</h2>
                <span className={`text-xs font-medium px-3 py-1 rounded-full ${CATEGORY_COLORS[category] ?? CATEGORY_COLORS.General}`}>
                  {category}
                </span>
              </div>

              <textarea
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={12}
                className="w-full border border-gray-200 rounded-lg p-4 text-gray-700 leading-relaxed focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
              />

              <div className="flex flex-wrap gap-3">
                <button
                  onClick={readDraftAloud}
                  className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition text-sm font-medium"
                >
                  🔊 Listen to Draft
                </button>
                <button
                  onClick={() => startRecording(true)}
                  className="flex items-center gap-2 border border-orange-400 text-orange-600 px-4 py-2 rounded-lg hover:bg-orange-50 transition text-sm font-medium"
                >
                  🎤 Speak a Correction
                </button>
              </div>

              {audioUrl && (
                <audio ref={audioRef} controls className="w-full mt-2">
                  <source src={audioUrl} type="audio/mpeg" />
                </audio>
              )}
            </div>

            <div className="bg-white rounded-2xl shadow p-6 space-y-3">
              <h3 className="font-medium text-gray-800">Ready to submit?</h3>
              <p className="text-sm text-gray-500">
                This petition will be sent to <strong>Ward Councillor (Demo)</strong>.
              </p>
              <div className="flex gap-3">
                <button
                  onClick={submitPetition}
                  className="flex-1 bg-green-700 text-white py-3 rounded-xl font-semibold hover:bg-green-800 transition"
                >
                  Submit Petition ✓
                </button>
                <button
                  onClick={resetFlow}
                  className="px-4 py-3 border border-gray-300 rounded-xl text-gray-600 hover:bg-gray-50 transition"
                >
                  Start Over
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── STEP: RECORDING CORRECTION ── */}
        {step === 'recording-correction' && (
          <div className="bg-white rounded-2xl shadow p-8 text-center space-y-6">
            <div className="text-6xl animate-pulse">🔴</div>
            <h2 className="text-xl font-semibold text-gray-800">Recording correction...</h2>
            <p className="text-gray-500">Say what you want to change in the draft. Press Stop when done.</p>
            <button
              onClick={stopRecording}
              className="w-full bg-red-600 text-white py-4 rounded-xl text-lg font-semibold hover:bg-red-700 transition"
            >
              Stop Recording
            </button>
          </div>
        )}

        {/* ── STEP: SUBMITTED ── */}
        {step === 'submitted' && (
          <div className="bg-white rounded-2xl shadow p-8 text-center space-y-6">
            <div className="text-6xl">✅</div>
            <h2 className="text-2xl font-bold text-green-700">Petition Submitted!</h2>
            <p className="text-gray-500">
              Your petition #{petitionId} has been received by <strong>Ward Councillor (Demo)</strong>.
              You will be notified when they respond.
            </p>
            <div className="flex gap-3 justify-center">
              <button
                onClick={resetFlow}
                className="bg-green-700 text-white px-6 py-3 rounded-xl font-semibold hover:bg-green-800 transition"
              >
                Submit Another
              </button>
              <Link
                href="/dashboard"
                className="border border-green-700 text-green-700 px-6 py-3 rounded-xl font-semibold hover:bg-green-50 transition"
              >
                View Dashboard
              </Link>
            </div>
          </div>
        )}
      </div>
    </main>
  );
}
