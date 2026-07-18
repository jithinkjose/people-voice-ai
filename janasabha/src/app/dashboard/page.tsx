'use client';

import { useEffect, useState } from 'react';
import Link from 'next/link';

type Petition = {
  id: number;
  citizen_name: string;
  transcript: string;
  final_text: string;
  category: string;
  member_name: string;
  status: string;
  created_at: string;
};

const STATUS_OPTIONS = ['New', 'Acknowledged', 'In Progress', 'Resolved', 'Rejected'];

const STATUS_COLORS: Record<string, string> = {
  New: 'bg-blue-100 text-blue-800',
  Acknowledged: 'bg-yellow-100 text-yellow-800',
  'In Progress': 'bg-orange-100 text-orange-800',
  Resolved: 'bg-green-100 text-green-800',
  Rejected: 'bg-red-100 text-red-800',
};

const CATEGORY_COLORS: Record<string, string> = {
  Roads: 'bg-orange-50 text-orange-700 border-orange-200',
  Water: 'bg-blue-50 text-blue-700 border-blue-200',
  Electricity: 'bg-yellow-50 text-yellow-700 border-yellow-200',
  Health: 'bg-red-50 text-red-700 border-red-200',
  Education: 'bg-purple-50 text-purple-700 border-purple-200',
  Sanitation: 'bg-green-50 text-green-700 border-green-200',
  Housing: 'bg-indigo-50 text-indigo-700 border-indigo-200',
  Agriculture: 'bg-lime-50 text-lime-700 border-lime-200',
  Employment: 'bg-teal-50 text-teal-700 border-teal-200',
  General: 'bg-gray-50 text-gray-700 border-gray-200',
};

export default function DashboardPage() {
  const [petitions, setPetitions] = useState<Petition[]>([]);
  const [loading, setLoading] = useState(true);
  const [filterCategory, setFilterCategory] = useState('All');
  const [filterStatus, setFilterStatus] = useState('All');
  const [expanded, setExpanded] = useState<number | null>(null);

  const fetchPetitions = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/petitions');
      const data = await res.json();
      setPetitions(data.petitions ?? []);
    } catch {
      setPetitions([]);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchPetitions();
  }, []);

  const updateStatus = async (id: number, status: string) => {
    await fetch(`/api/petitions/${id}`, {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status }),
    });
    setPetitions((prev) => prev.map((p) => (p.id === id ? { ...p, status } : p)));
  };

  const categories = ['All', ...Array.from(new Set(petitions.map((p) => p.category)))];
  const statuses = ['All', ...STATUS_OPTIONS];

  const filtered = petitions.filter(
    (p) =>
      (filterCategory === 'All' || p.category === filterCategory) &&
      (filterStatus === 'All' || p.status === filterStatus)
  );

  // Summary counts
  const counts = STATUS_OPTIONS.reduce<Record<string, number>>((acc, s) => {
    acc[s] = petitions.filter((p) => p.status === s).length;
    return acc;
  }, {});

  return (
    <main className="min-h-screen bg-gray-50">
      <header className="bg-white shadow-sm">
        <div className="max-w-5xl mx-auto px-4 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold text-green-800">JanaSabha Dashboard</h1>
            <p className="text-sm text-gray-500">Ward Councillor (Demo) — Petition Inbox</p>
          </div>
          <Link
            href="/"
            className="text-sm bg-green-700 text-white px-4 py-2 rounded-lg hover:bg-green-800 transition"
          >
            + New Petition
          </Link>
        </div>
      </header>

      <div className="max-w-5xl mx-auto px-4 py-8 space-y-6">

        {/* Summary cards */}
        <div className="grid grid-cols-2 sm:grid-cols-5 gap-3">
          {STATUS_OPTIONS.map((s) => (
            <div key={s} className="bg-white rounded-xl shadow-sm p-4 text-center">
              <div className="text-2xl font-bold text-gray-800">{counts[s] ?? 0}</div>
              <div className={`text-xs font-medium mt-1 px-2 py-0.5 rounded-full inline-block ${STATUS_COLORS[s]}`}>{s}</div>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <select
            value={filterCategory}
            onChange={(e) => setFilterCategory(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            {categories.map((c) => (
              <option key={c}>{c}</option>
            ))}
          </select>
          <select
            value={filterStatus}
            onChange={(e) => setFilterStatus(e.target.value)}
            className="border border-gray-300 rounded-lg px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
          >
            {statuses.map((s) => (
              <option key={s}>{s}</option>
            ))}
          </select>
          <button
            onClick={fetchPetitions}
            className="text-sm border border-gray-300 rounded-lg px-3 py-2 hover:bg-gray-50 transition"
          >
            ↻ Refresh
          </button>
          <span className="text-sm text-gray-500 self-center">
            {filtered.length} petition{filtered.length !== 1 ? 's' : ''}
          </span>
        </div>

        {/* Petition list */}
        {loading ? (
          <div className="text-center py-16 text-gray-400">Loading petitions...</div>
        ) : filtered.length === 0 ? (
          <div className="text-center py-16 bg-white rounded-2xl shadow-sm">
            <div className="text-5xl mb-4">📭</div>
            <p className="text-gray-500">No petitions found.</p>
            <Link href="/" className="text-green-700 text-sm mt-2 inline-block hover:underline">
              Submit the first petition →
            </Link>
          </div>
        ) : (
          <div className="space-y-3">
            {filtered.map((p) => (
              <div key={p.id} className="bg-white rounded-2xl shadow-sm border border-gray-100 overflow-hidden">
                <div
                  className="p-4 cursor-pointer hover:bg-gray-50 transition"
                  onClick={() => setExpanded(expanded === p.id ? null : p.id)}
                >
                  <div className="flex items-start justify-between gap-4">
                    <div className="flex-1 min-w-0">
                      <div className="flex items-center gap-2 flex-wrap mb-1">
                        <span className="text-xs font-mono text-gray-400">#{p.id}</span>
                        <span className={`text-xs font-medium px-2 py-0.5 rounded-full border ${CATEGORY_COLORS[p.category] ?? CATEGORY_COLORS.General}`}>
                          {p.category}
                        </span>
                        <span className="text-xs text-gray-400">
                          {new Date(p.created_at).toLocaleDateString('en-IN', {
                            day: 'numeric', month: 'short', year: 'numeric',
                          })}
                        </span>
                      </div>
                      <p className="text-gray-800 font-medium text-sm truncate">{p.citizen_name}</p>
                      <p className="text-gray-500 text-sm line-clamp-2 mt-0.5">{p.final_text}</p>
                    </div>
                    <div className="flex flex-col items-end gap-2 shrink-0">
                      <span className={`text-xs font-medium px-2 py-1 rounded-full ${STATUS_COLORS[p.status] ?? STATUS_COLORS.New}`}>
                        {p.status}
                      </span>
                      <span className="text-gray-400 text-xs">{expanded === p.id ? '▲' : '▼'}</span>
                    </div>
                  </div>
                </div>

                {expanded === p.id && (
                  <div className="border-t border-gray-100 p-4 space-y-4 bg-gray-50">
                    <div>
                      <h4 className="text-xs font-semibold text-gray-500 uppercase mb-1">Original Speech (Transcript)</h4>
                      <p className="text-sm text-gray-600 bg-white rounded-lg p-3 border border-gray-200">{p.transcript}</p>
                    </div>
                    <div>
                      <h4 className="text-xs font-semibold text-gray-500 uppercase mb-1">Formal Petition</h4>
                      <pre className="text-sm text-gray-700 bg-white rounded-lg p-3 border border-gray-200 whitespace-pre-wrap font-sans leading-relaxed">{p.final_text}</pre>
                    </div>
                    <div className="flex items-center gap-3">
                      <label className="text-sm font-medium text-gray-700">Update Status:</label>
                      <select
                        value={p.status}
                        onChange={(e) => updateStatus(p.id, e.target.value)}
                        className="border border-gray-300 rounded-lg px-3 py-1.5 text-sm focus:outline-none focus:ring-2 focus:ring-green-500"
                      >
                        {STATUS_OPTIONS.map((s) => (
                          <option key={s}>{s}</option>
                        ))}
                      </select>
                    </div>
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </main>
  );
}
