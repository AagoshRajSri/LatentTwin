import React from 'react';

export default function SettingsPage() {
  return (
    <main className="min-h-screen bg-gray-950 p-6 text-white">
      <section className="mx-auto max-w-2xl rounded-lg border border-gray-800 bg-gray-900 p-6">
        <h1 className="text-xl font-semibold">Settings</h1>
        <p className="mt-2 text-sm text-gray-400">Connection settings are controlled by the Vite environment variables.</p>
        <dl className="mt-6 space-y-3 text-sm">
          <div className="flex justify-between border-b border-gray-800 pb-3"><dt className="text-gray-400">Application API</dt><dd>{import.meta.env.VITE_API_URL || 'Same origin'}</dd></div>
          <div className="flex justify-between border-b border-gray-800 pb-3"><dt className="text-gray-400">Analysis API</dt><dd>{import.meta.env.VITE_ANALYSIS_API_URL || 'Same origin'}</dd></div>
        </dl>
      </section>
    </main>
  );
}
