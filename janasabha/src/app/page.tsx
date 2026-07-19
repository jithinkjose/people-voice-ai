'use client';

import { useState, useRef, useCallback, useMemo } from 'react';
import Link from 'next/link';
import {
  BODY_TYPES,
  INDIAN_STATES,
  REPRESENTATIVES,
  filterRepresentatives,
  findRepresentative,
  formatMemberLabel,
} from '@/lib/representatives';
import type { PetitionLanguage } from '@/lib/mock-openai';

type Step =
  | 'idle'
  | 'recording'
  | 'transcribing'
  | 'transcript'
  | 'notes'
  | 'ready'
  | 'generating'
  | 'draft'
  | 'recording-correction'
  | 'applying-correction'
  | 'submitting'
  | 'submitted';

type FlowAction = 'voice' | 'notes' | 'ready';

type ChangeRequest = {
  id: string;
  markedText: string;
  note: string;
};

const LANGUAGE_OPTIONS: { code: PetitionLanguage; label: string; native: string }[] = [
  { code: 'ml', label: 'Malayalam', native: 'മലയാളം' },
  { code: 'en', label: 'English', native: 'English' },
  { code: 'hi', label: 'Hindi', native: 'हिन्दी' },
];

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
  const [phoneNumber, setPhoneNumber] = useState('');
  const [stateName, setStateName] = useState<string>('Kerala');
  const [bodyType, setBodyType] = useState<string>('Gram Panchayat');
  const [memberId, setMemberId] = useState<string>('kl-gp-ward12');
  const [language, setLanguage] = useState<PetitionLanguage>('en');
  const [pendingAction, setPendingAction] = useState<FlowAction | null>(null);
  const [showLanguageModal, setShowLanguageModal] = useState(false);
  const [modalLanguage, setModalLanguage] = useState<PetitionLanguage>('en');
  const [transcript, setTranscript] = useState('');
  const [draft, setDraft] = useState('');
  const [category, setCategory] = useState('General');
  const [error, setError] = useState('');
  const [audioUrl, setAudioUrl] = useState('');
  const [petitionId, setPetitionId] = useState<number | null>(null);
  const [markedText, setMarkedText] = useState('');
  const [changeNote, setChangeNote] = useState('');
  const [pendingChanges, setPendingChanges] = useState<ChangeRequest[]>([]);

  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const draftTextareaRef = useRef<HTMLTextAreaElement | null>(null);
  const languageRef = useRef<PetitionLanguage>(language);
  languageRef.current = language;

  const clearError = () => setError('');

  const availableMembers = useMemo(
    () => filterRepresentatives(stateName, bodyType),
    [stateName, bodyType]
  );

  const selectedMember = findRepresentative(memberId) ?? availableMembers[0];
  const memberDisplayName = selectedMember
    ? formatMemberLabel(selectedMember)
    : 'Selected member';

  const ensureRecipient = (): boolean => {
    if (!stateName || !bodyType || !memberId || !selectedMember) {
      setError('Please choose state, local body type, and member before continuing.');
      return false;
    }
    if (!phoneNumber.trim()) {
      setError('Please enter your WhatsApp mobile number so we can send status updates.');
      return false;
    }
    clearError();
    return true;
  };

  const onStateChange = (next: string) => {
    setStateName(next);
    const nextMembers = filterRepresentatives(next, bodyType);
    const bodyTypesForState = BODY_TYPES.filter((bt) =>
      REPRESENTATIVES.some((r) => r.state === next && r.bodyType === bt)
    );
    const nextBody = bodyTypesForState.includes(bodyType as (typeof BODY_TYPES)[number])
      ? bodyType
      : bodyTypesForState[0] ?? BODY_TYPES[0];
    if (nextBody !== bodyType) setBodyType(nextBody);
    const members = filterRepresentatives(next, nextBody);
    setMemberId(members[0]?.id ?? '');
  };

  const onBodyTypeChange = (next: string) => {
    setBodyType(next);
    const members = filterRepresentatives(stateName, next);
    setMemberId(members[0]?.id ?? '');
  };

  const bodyTypesForState = useMemo(
    () =>
      BODY_TYPES.filter((bt) =>
        REPRESENTATIVES.some((r) => r.state === stateName && r.bodyType === bt)
      ),
    [stateName]
  );

  const openLanguagePicker = (action: FlowAction) => {
    if (!ensureRecipient()) return;
    setPendingAction(action);
    setModalLanguage(language);
    setShowLanguageModal(true);
  };

  const confirmLanguageAndContinue = () => {
    if (!pendingAction) return;
    const selected = modalLanguage;
    setLanguage(selected);
    languageRef.current = selected;
    setShowLanguageModal(false);
    const action = pendingAction;
    setPendingAction(null);

    if (action === 'voice') {
      void startRecording(false);
      return;
    }
    if (action === 'notes') {
      setTranscript('');
      setStep('notes');
      return;
    }
    setDraft('');
    setTranscript('');
    setStep('ready');
  };

  const closeLanguageModal = () => {
    setShowLanguageModal(false);
    setPendingAction(null);
  };

  // ── Iteration 1: Record audio ──────────────────────────────────────────────

  const startRecording = useCallback(async (forCorrection = false) => {
    clearError();
    if (!forCorrection && !ensureRecipient()) return;
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
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stateName, bodyType, memberId, phoneNumber, language]);

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
      formData.append('language', languageRef.current);

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

  const generateDraft = async (fromNotes = false) => {
    clearError();
    const input = fromNotes ? transcript.trim() : transcript;
    if (!input) {
      setError('Please enter some notes or details about your petition.');
      return;
    }
    setStep('generating');
    try {
      const res = await fetch('/api/generate-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ transcript: input, fromNotes, language: languageRef.current }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error);
      setDraft(data.draft);
      setCategory(data.category);
      setMarkedText('');
      setChangeNote('');
      setPendingChanges([]);
      setStep('draft');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Draft generation failed');
      setStep(fromNotes ? 'notes' : 'transcript');
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

  // ── Review: mark text + request changes ───────────────────────────────────

  const captureMarkedSelection = () => {
    const el = draftTextareaRef.current;
    if (!el) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    if (start === end) {
      setError('Select the text in the draft you want to change, then click Mark selection.');
      return;
    }
    clearError();
    setMarkedText(draft.slice(start, end));
  };

  const addChangeRequest = () => {
    const note = changeNote.trim();
    if (!note) {
      setError('Describe what should be changed.');
      return;
    }
    clearError();
    setPendingChanges((prev) => [
      ...prev,
      {
        id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        markedText: markedText.trim(),
        note,
      },
    ]);
    setChangeNote('');
    setMarkedText('');
  };

  const removeChangeRequest = (id: string) => {
    setPendingChanges((prev) => prev.filter((c) => c.id !== id));
  };

  const formatChangeRequests = (changes: ChangeRequest[]) =>
    changes
      .map((c, i) => {
        const mark = c.markedText ? `Marked text: "${c.markedText}"\n` : '';
        return `${i + 1}. ${mark}Change needed: ${c.note}`;
      })
      .join('\n\n');

  const applyChangeRequests = async (changes: ChangeRequest[]) => {
    if (changes.length === 0) {
      setError('Add at least one change request first.');
      return;
    }
    clearError();
    setStep('applying-correction');
    try {
      const draftRes = await fetch('/api/generate-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          correction: formatChangeRequests(changes),
          originalDraft: draft,
          transcript,
          language: languageRef.current,
        }),
      });
      const draftData = await draftRes.json();
      if (!draftRes.ok) throw new Error(draftData.error);

      setDraft(draftData.draft);
      if (draftData.category) setCategory(draftData.category);
      setPendingChanges([]);
      setMarkedText('');
      setChangeNote('');
      setStep('draft');
    } catch (err: unknown) {
      setError(err instanceof Error ? err.message : 'Correction failed');
      setStep('draft');
    }
  };

  // ── Iteration 4: Voice correction ─────────────────────────────────────────

  const transcribeCorrection = async (blob: Blob) => {
    setStep('applying-correction');
    try {
      const formData = new FormData();
      formData.append('audio', blob, 'correction.webm');
      formData.append('language', languageRef.current);

      const transcribeRes = await fetch('/api/transcribe', { method: 'POST', body: formData });
      const transcribeData = await transcribeRes.json();
      if (!transcribeRes.ok) throw new Error(transcribeData.error);

      const correctionText = transcribeData.transcript;

      const draftRes = await fetch('/api/generate-draft', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          correction: correctionText,
          originalDraft: draft,
          transcript,
          language: languageRef.current,
        }),
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
    if (!ensureRecipient()) {
      setStep('draft');
      return;
    }
    if (!draft.trim()) {
      setError('Petition text cannot be empty.');
      return;
    }
    setStep('submitting');
    try {
      const res = await fetch('/api/petitions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          citizen_name: citizenName || 'Anonymous',
          phone_number: phoneNumber.trim(),
          transcript: transcript || draft,
          draft_text: draft,
          final_text: draft,
          category,
          state: stateName,
          body_type: bodyType,
          member_name: memberDisplayName,
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

  const continueWithReadyPetition = () => {
    if (!ensureRecipient()) return;
    if (!draft.trim()) {
      setError('Paste or type your ready petition before continuing.');
      return;
    }
    setTranscript(draft.trim());
    setCategory('General');
    setMarkedText('');
    setChangeNote('');
    setPendingChanges([]);
    setStep('draft');
  };

  const goCitizenHome = () => {
    // Stop any in-progress recording before leaving the flow
    const recorder = mediaRecorderRef.current;
    if (recorder && recorder.state !== 'inactive') {
      try {
        recorder.stream.getTracks().forEach((t) => t.stop());
        recorder.stop();
      } catch {
        // ignore stop errors when abandoning the flow
      }
      mediaRecorderRef.current = null;
    }
    resetFlow();
  };

  const resetFlow = () => {
    setStep('idle');
    setTranscript('');
    setDraft('');
    setCategory('General');
    setError('');
    setAudioUrl('');
    setPetitionId(null);
    setMarkedText('');
    setChangeNote('');
    setPendingChanges([]);
    setShowLanguageModal(false);
    setPendingAction(null);
  };

  // ── Render ─────────────────────────────────────────────────────────────────

  return (
    <main className="min-h-screen bg-gradient-to-br from-green-50 to-blue-50">
      {/* Header — always available to return home from any step */}
      <header className="bg-white shadow-sm sticky top-0 z-20">
        <div className="max-w-3xl mx-auto px-4 py-4 flex items-center justify-between gap-3">
          <button
            type="button"
            onClick={goCitizenHome}
            className="text-left group"
            aria-label="Citizen home"
          >
            <h1 className="text-2xl font-bold text-green-800 group-hover:text-green-900">
              JanaSabha
            </h1>
            <p className="text-sm text-gray-500">ജനസഭ — Your Voice to Your Representative</p>
          </button>
          <div className="flex items-center gap-2 shrink-0">
            <button
              type="button"
              onClick={goCitizenHome}
              className="text-sm border border-green-700 text-green-800 px-3 py-2 rounded-lg hover:bg-green-50 transition"
            >
              Citizen home
            </button>
            <Link
              href="/dashboard"
              className="text-sm bg-green-700 text-white px-4 py-2 rounded-lg hover:bg-green-800 transition"
            >
              Member Dashboard
            </Link>
          </div>
        </div>
      </header>

      <div className="max-w-3xl mx-auto px-4 py-8 space-y-6">

        {/* Progress indicator */}
        <div className="flex items-center gap-2 text-sm text-gray-500">
          {[
            {
              label: 'Input',
              active:
                step === 'recording' ||
                step === 'transcribing' ||
                step === 'transcript' ||
                step === 'notes' ||
                step === 'ready',
            },
            {
              label: 'Review',
              active:
                step === 'generating' ||
                step === 'draft' ||
                step === 'recording-correction' ||
                step === 'applying-correction',
            },
            { label: 'Submit', active: step === 'submitting' || step === 'submitted' },
          ].map((s, i) => (
            <span key={s.label} className="flex items-center gap-2">
              {i > 0 && <span>→</span>}
              <span
                className={`px-3 py-1 rounded-full ${s.active ? 'bg-green-700 text-white font-medium' : 'bg-gray-200'}`}
              >
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
          <div className="bg-white rounded-2xl shadow p-8 space-y-6">
            <div className="text-center">
              <div className="text-5xl mb-3">📋</div>
              <h2 className="text-xl font-semibold text-gray-800">Submit a Petition</h2>
              <p className="text-gray-500 mt-1">
                Choose your representative, then draft with voice, jot details, or submit a ready petition.
              </p>
            </div>

            <div className="space-y-3 text-left">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Your Name (optional)</label>
                <input
                  type="text"
                  value={citizenName}
                  onChange={(e) => setCitizenName(e.target.value)}
                  placeholder="E.g. Rajan K."
                  className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">WhatsApp number</label>
                <input
                  type="tel"
                  inputMode="tel"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="E.g. 9876543210"
                  className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
                />
                <p className="text-xs text-gray-500 mt-1">
                  Status updates will be sent on WhatsApp.
                </p>
              </div>

              <div className="grid sm:grid-cols-2 gap-3">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">State</label>
                  <select
                    value={stateName}
                    onChange={(e) => onStateChange(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
                  >
                    {INDIAN_STATES.map((s) => (
                      <option key={s} value={s}>
                        {s}
                      </option>
                    ))}
                  </select>
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">
                    Legislative / Panchayat / Municipality
                  </label>
                  <select
                    value={bodyType}
                    onChange={(e) => onBodyTypeChange(e.target.value)}
                    className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
                  >
                    {(bodyTypesForState.length ? bodyTypesForState : BODY_TYPES).map((bt) => (
                      <option key={bt} value={bt}>
                        {bt}
                      </option>
                    ))}
                  </select>
                </div>
              </div>

              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Member</label>
                <select
                  value={memberId}
                  onChange={(e) => setMemberId(e.target.value)}
                  disabled={availableMembers.length === 0}
                  className="w-full border border-gray-300 rounded-lg px-3 py-2 focus:outline-none focus:ring-2 focus:ring-green-500 disabled:bg-gray-100"
                >
                  {availableMembers.length === 0 ? (
                    <option value="">No members listed for this selection</option>
                  ) : (
                    availableMembers.map((m) => (
                      <option key={m.id} value={m.id}>
                        {formatMemberLabel(m)}
                      </option>
                    ))
                  )}
                </select>
              </div>
            </div>

            <div className="grid gap-3">
              <button
                onClick={() => openLanguagePicker('voice')}
                className="w-full bg-green-700 text-white py-4 rounded-xl text-lg font-semibold hover:bg-green-800 transition text-left px-5"
              >
                <span className="block">🎤 Draft with voice</span>
                <span className="block text-sm font-normal text-green-100 mt-0.5">
                  Speak your problem — we will draft a formal petition
                </span>
              </button>
              <button
                onClick={() => openLanguagePicker('notes')}
                className="w-full border-2 border-green-700 text-green-800 py-4 rounded-xl text-lg font-semibold hover:bg-green-50 transition text-left px-5"
              >
                <span className="block">✍️ Draft with details</span>
                <span className="block text-sm font-normal text-green-700/80 mt-0.5">
                  Jot rough notes — we will turn them into a petition
                </span>
              </button>
              <button
                onClick={() => openLanguagePicker('ready')}
                className="w-full border-2 border-gray-800 text-gray-900 py-4 rounded-xl text-lg font-semibold hover:bg-gray-50 transition text-left px-5"
              >
                <span className="block">📄 Submit petition</span>
                <span className="block text-sm font-normal text-gray-600 mt-0.5">
                  Paste a ready-written petition and submit after a quick review
                </span>
              </button>
            </div>
          </div>
        )}

        {/* Language picker modal */}
        {showLanguageModal && (
          <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-black/40 p-4"
            role="dialog"
            aria-modal="true"
            aria-labelledby="language-modal-title"
            onClick={closeLanguageModal}
          >
            <div
              className="bg-white rounded-2xl shadow-xl max-w-md w-full p-6 space-y-5"
              onClick={(e) => e.stopPropagation()}
            >
              <div>
                <h2 id="language-modal-title" className="text-xl font-semibold text-gray-800">
                  Choose petition language
                </h2>
                <p className="text-sm text-gray-500 mt-1">
                  Select Malayalam, English, or Hindi for this petition.
                </p>
              </div>

              <div className="grid gap-2">
                {LANGUAGE_OPTIONS.map((opt) => (
                  <button
                    key={opt.code}
                    type="button"
                    onClick={() => setModalLanguage(opt.code)}
                    className={`w-full text-left px-4 py-3 rounded-xl border-2 transition ${
                      modalLanguage === opt.code
                        ? 'border-green-700 bg-green-50'
                        : 'border-gray-200 hover:border-gray-300'
                    }`}
                  >
                    <span className="block font-semibold text-gray-800">{opt.label}</span>
                    <span className="block text-sm text-gray-500">{opt.native}</span>
                  </button>
                ))}
              </div>

              <div className="flex gap-3">
                <button
                  type="button"
                  onClick={confirmLanguageAndContinue}
                  className="flex-1 bg-green-700 text-white py-3 rounded-xl font-semibold hover:bg-green-800 transition"
                >
                  Continue
                </button>
                <button
                  type="button"
                  onClick={closeLanguageModal}
                  className="px-4 py-3 border border-gray-300 rounded-xl text-gray-600 hover:bg-gray-50 transition"
                >
                  Cancel
                </button>
              </div>
            </div>
          </div>
        )}

        {/* ── STEP: READY PETITION ── */}
        {step === 'ready' && (
          <div className="bg-white rounded-2xl shadow p-6 space-y-4">
            <h2 className="text-lg font-semibold text-gray-800">📄 Submit your ready petition</h2>
            <p className="text-sm text-gray-500">
              Paste or type the full petition text in{' '}
              <strong>{LANGUAGE_OPTIONS.find((o) => o.code === language)?.label ?? 'English'}</strong>.
              It will go to <strong>{memberDisplayName}</strong> ({stateName} · {bodyType}).
            </p>
            <textarea
              value={draft}
              onChange={(e) => setDraft(e.target.value)}
              rows={14}
              placeholder={`Subject: ...\n\nRespected Sir/Madam,\n\n...`}
              className="w-full border border-gray-300 rounded-lg p-4 text-gray-700 leading-relaxed focus:outline-none focus:ring-2 focus:ring-green-500 resize-y min-h-[280px]"
            />
            <div className="flex gap-3">
              <button
                onClick={continueWithReadyPetition}
                disabled={!draft.trim()}
                className="flex-1 bg-green-700 text-white py-3 rounded-xl font-semibold hover:bg-green-800 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Review & continue →
              </button>
              <button
                onClick={resetFlow}
                className="px-4 py-3 border border-gray-300 rounded-xl text-gray-600 hover:bg-gray-50 transition"
              >
                Back
              </button>
            </div>
          </div>
        )}

        {/* ── STEP: NOTES (typed draft path) ── */}
        {step === 'notes' && (
          <div className="bg-white rounded-2xl shadow p-6 space-y-4">
            <h2 className="text-lg font-semibold text-gray-800">✍️ Draft from your notes</h2>
            <p className="text-sm text-gray-500">
              Jot down rough points — we will draft the petition in{' '}
              <strong>{LANGUAGE_OPTIONS.find((o) => o.code === language)?.label ?? 'English'}</strong>.
              Sending to <strong>{memberDisplayName}</strong>.
            </p>
            <textarea
              value={transcript}
              onChange={(e) => setTranscript(e.target.value)}
              rows={10}
              placeholder={`Example:
- Road near Panchayat office has big potholes since monsoon
- Hard for school children and ambulances
- Need urgent repair before Onam
- Ward 12, near bus stop`}
              className="w-full border border-gray-300 rounded-lg p-4 text-gray-700 leading-relaxed focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
            />
            <div className="flex gap-3">
              <button
                onClick={() => generateDraft(true)}
                disabled={!transcript.trim()}
                className="flex-1 bg-green-700 text-white py-3 rounded-xl font-semibold hover:bg-green-800 transition disabled:opacity-50 disabled:cursor-not-allowed"
              >
                Generate Petition Draft →
              </button>
              <button
                onClick={resetFlow}
                className="px-4 py-3 border border-gray-300 rounded-xl text-gray-600 hover:bg-gray-50 transition"
              >
                Back
              </button>
            </div>
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
              {step === 'applying-correction' && 'Applying your requested changes...'}
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
                onClick={() => generateDraft(false)}
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

        {/* ── STEP: DRAFT REVIEW ── */}
        {step === 'draft' && (
          <div className="space-y-4">
            <div className="bg-white rounded-2xl shadow p-6 space-y-4">
              <div className="flex items-center justify-between gap-3">
                <div>
                  <h2 className="text-lg font-semibold text-gray-800">📄 Review your petition draft</h2>
                  <p className="text-sm text-gray-500 mt-1">
                    Edit the text directly, or mark a passage and describe what should change.
                  </p>
                </div>
                <span className={`text-xs font-medium px-3 py-1 rounded-full shrink-0 ${CATEGORY_COLORS[category] ?? CATEGORY_COLORS.General}`}>
                  {category}
                </span>
              </div>

              <textarea
                ref={draftTextareaRef}
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                rows={14}
                className="w-full border border-gray-200 rounded-lg p-4 text-gray-700 leading-relaxed focus:outline-none focus:ring-2 focus:ring-green-500 resize-y min-h-[280px]"
              />

              <div className="flex flex-wrap gap-3">
                <button
                  onClick={readDraftAloud}
                  className="flex items-center gap-2 bg-blue-600 text-white px-4 py-2 rounded-lg hover:bg-blue-700 transition text-sm font-medium"
                >
                  🔊 Listen to Draft
                </button>
                <button
                  onClick={captureMarkedSelection}
                  className="flex items-center gap-2 border border-amber-500 text-amber-700 px-4 py-2 rounded-lg hover:bg-amber-50 transition text-sm font-medium"
                >
                  ✏️ Mark selection
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

            <div className="bg-white rounded-2xl shadow p-6 space-y-4">
              <h3 className="font-medium text-gray-800">Request changes</h3>
              <p className="text-sm text-gray-500">
                Select text above and mark it, then say what to fix. You can add several requests before applying.
              </p>

              {markedText && (
                <div className="bg-amber-50 border border-amber-200 rounded-lg p-3 text-sm">
                  <div className="flex items-start justify-between gap-2">
                    <div>
                      <p className="font-medium text-amber-800 mb-1">Marked passage</p>
                      <p className="text-amber-900 whitespace-pre-wrap">&ldquo;{markedText}&rdquo;</p>
                    </div>
                    <button
                      onClick={() => setMarkedText('')}
                      className="text-amber-500 hover:text-amber-700 font-bold shrink-0"
                      aria-label="Clear marked text"
                    >
                      ✕
                    </button>
                  </div>
                </div>
              )}

              <textarea
                value={changeNote}
                onChange={(e) => setChangeNote(e.target.value)}
                rows={3}
                placeholder="E.g. Make the tone more urgent, add Ward 12, remove the mention of Onam, fix the location name..."
                className="w-full border border-gray-300 rounded-lg p-3 text-gray-700 leading-relaxed focus:outline-none focus:ring-2 focus:ring-green-500 resize-none"
              />

              <div className="flex flex-wrap gap-3">
                <button
                  onClick={addChangeRequest}
                  disabled={!changeNote.trim()}
                  className="border border-green-700 text-green-800 px-4 py-2 rounded-lg hover:bg-green-50 transition text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  + Add change request
                </button>
                <button
                  onClick={() => applyChangeRequests(pendingChanges)}
                  disabled={pendingChanges.length === 0}
                  className="bg-green-700 text-white px-4 py-2 rounded-lg hover:bg-green-800 transition text-sm font-medium disabled:opacity-50 disabled:cursor-not-allowed"
                >
                  Apply {pendingChanges.length > 0 ? `${pendingChanges.length} ` : ''}change{pendingChanges.length === 1 ? '' : 's'} with AI
                </button>
              </div>

              {pendingChanges.length > 0 && (
                <ul className="space-y-2">
                  {pendingChanges.map((change, index) => (
                    <li
                      key={change.id}
                      className="bg-gray-50 border border-gray-200 rounded-lg p-3 text-sm flex justify-between gap-3"
                    >
                      <div className="min-w-0">
                        <p className="font-medium text-gray-800">Change {index + 1}</p>
                        {change.markedText && (
                          <p className="text-gray-500 mt-1 line-clamp-2">
                            Marked: &ldquo;{change.markedText}&rdquo;
                          </p>
                        )}
                        <p className="text-gray-700 mt-1">{change.note}</p>
                      </div>
                      <button
                        onClick={() => removeChangeRequest(change.id)}
                        className="text-gray-400 hover:text-red-600 font-bold shrink-0"
                        aria-label="Remove change request"
                      >
                        ✕
                      </button>
                    </li>
                  ))}
                </ul>
              )}
            </div>

            <div className="bg-white rounded-2xl shadow p-6 space-y-3">
              <h3 className="font-medium text-gray-800">Looks good?</h3>
              <p className="text-sm text-gray-500">
                After reviewing and editing, submit to <strong>{memberDisplayName}</strong>
                {' '}({stateName} · {bodyType}).
                You will get WhatsApp updates when the status changes.
              </p>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  WhatsApp number
                </label>
                <input
                  type="tel"
                  inputMode="tel"
                  value={phoneNumber}
                  onChange={(e) => setPhoneNumber(e.target.value)}
                  placeholder="E.g. 9876543210"
                  className="w-full border border-gray-300 rounded-lg px-4 py-2 focus:outline-none focus:ring-2 focus:ring-green-500"
                />
              </div>
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
              Your petition #{petitionId} has been received by <strong>{memberDisplayName}</strong>
              {' '}({stateName} · {bodyType}).
              {phoneNumber.trim()
                ? ' A confirmation was sent on WhatsApp — you will get more updates when the status changes.'
                : ' You will be notified when they respond.'}
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
