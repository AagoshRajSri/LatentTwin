import React, { useState } from 'react';
import { CheckCircle, Loader, Wrench } from 'lucide-react';
import { applyRepair, generateRepair } from '../lib/repairClient.js';

export default function RepairFlow({ target = 'auth-service', change = 'rename user_id to userId' }) {
  const [status, setStatus] = useState('idle');
  const [repair, setRepair] = useState(null);
  const [message, setMessage] = useState('');

  const createRepair = async () => {
    setStatus('generating');
    setMessage('');
    try {
      setRepair(await generateRepair(target, change));
      setStatus('ready');
    } catch (error) {
      setStatus('error');
      setMessage(error.message);
    }
  };

  const apply = async () => {
    if (!repair) return;
    setStatus('applying');
    try {
      const result = await applyRepair(repair);
      setStatus(result.status === 'SYSTEM HEALED' ? 'complete' : 'error');
      setMessage(result.message || 'Repair completed');
    } catch (error) {
      setStatus('error');
      setMessage(error.message);
    }
  };

  return (
    <section className="rounded-lg border border-slate-700 bg-slate-800 p-4">
      <div className="flex items-center justify-between gap-3">
        <div><h4 className="font-semibold text-white">Repair workflow</h4><p className="text-xs text-slate-400">{change}</p></div>
        {status === 'complete' ? <CheckCircle className="text-emerald-400" size={18} /> : <Wrench className="text-amber-400" size={18} />}
      </div>
      {repair?.diff && <pre className="mt-3 max-h-40 overflow-auto rounded bg-slate-950 p-3 text-xs text-slate-300">{repair.diff}</pre>}
      {message && <p className={`mt-3 text-sm ${status === 'error' ? 'text-red-300' : 'text-emerald-300'}`}>{message}</p>}
      <div className="mt-4 flex gap-2">
        <button type="button" onClick={createRepair} disabled={status === 'generating' || status === 'applying'} className="rounded bg-amber-600 px-3 py-2 text-sm text-white disabled:opacity-50">{status === 'generating' ? <Loader className="animate-spin" size={15} /> : 'Generate repair'}</button>
        {repair && <button type="button" onClick={apply} disabled={status === 'applying' || status === 'complete'} className="rounded bg-emerald-700 px-3 py-2 text-sm text-white disabled:opacity-50">{status === 'applying' ? <Loader className="animate-spin" size={15} /> : 'Apply patch'}</button>}
      </div>
    </section>
  );
}
