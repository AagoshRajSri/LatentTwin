import React, { useEffect, useState } from 'react';
import { Database, Server } from 'lucide-react';
import { Handle, Position } from '@xyflow/react';
import CrossSectionNode from './CrossSectionNode.jsx';

export function HighlightText({ text, search }) {
  if (!text || typeof text !== 'string') return text || null;
  if (!search || !search.trim()) return text;
  const query = search.trim();
  const escapedQuery = query.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  return text.split(new RegExp(`(${escapedQuery})`, 'gi')).map((part, index) => (
    part.toLowerCase() === query.toLowerCase() ? <mark key={index} className="rounded bg-yellow-400 px-0.5 font-bold text-zinc-950">{part}</mark> : part
  ));
}

export function LoadingStatus({ messages = ['Reading the architecture map', 'Tracing service boundaries', 'Preparing the dependency view'] }) {
  const [index, setIndex] = useState(0);
  useEffect(() => {
    const timer = setInterval(() => setIndex((current) => (current + 1) % messages.length), 1800);
    return () => clearInterval(timer);
  }, [messages.length]);
  return <div className="absolute bottom-6 left-0 right-0 z-10 flex justify-center pointer-events-none"><div className="rounded-full border border-gray-800/80 bg-gray-950/80 px-4 py-2 text-[10px] font-mono uppercase tracking-[0.16em] text-gray-500 shadow-lg backdrop-blur-sm"><span className="mr-2 inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-sky-400" />{messages[index]}</div></div>;
}

function ServiceNode({ data, selected, infrastructure = false }) {
  const isImpacted = data.isImpacted;
  const isTarget = data.isTarget;
  const borderColor = isTarget ? 'border-amber-500 shadow-md shadow-amber-900/20' : isImpacted ? 'border-red-500 shadow-md shadow-red-900/20' : selected ? (infrastructure ? 'border-purple-500' : 'border-blue-500') : 'border-gray-700';
  const bgColor = isTarget ? 'bg-amber-950/80' : isImpacted ? 'bg-red-950/80' : 'bg-gray-900';
  const badgeColor = isTarget ? 'bg-amber-500/20 text-amber-500' : isImpacted ? 'bg-red-500/20 text-red-500' : infrastructure ? 'bg-purple-500/20 text-purple-400' : 'bg-blue-500/10 text-blue-500';
  const Icon = infrastructure ? Database : Server;
  const kind = isTarget ? (infrastructure ? 'Target Infrastructure' : 'Target Service') : isImpacted ? (infrastructure ? 'Impacted Infrastructure' : 'Impacted Service') : infrastructure ? 'Infrastructure' : 'Service';
  return <>
    <Handle type="target" position={Position.Left} id="target" className="w-2 h-2 !bg-gray-500 border-none opacity-0" />
    <div className={`flex min-w-[180px] items-center gap-4 rounded border px-5 py-4 text-white shadow-lg transition-all ${bgColor} ${borderColor}`}>
      <div className={`rounded p-2 ${badgeColor}`}><Icon size={18} /></div>
      <div className="flex flex-col"><span className="flex items-center gap-2 text-sm font-semibold tracking-wide"><HighlightText text={data.label} search={data.searchTerm} />{isImpacted && !isTarget && <span className="h-1.5 w-1.5 animate-pulse rounded-full bg-red-500" />}</span><span className="mt-0.5 text-[10px] font-bold uppercase tracking-widest text-gray-500">{kind}</span></div>
    </div>
    <Handle type="source" position={Position.Right} id="source" className="w-2 h-2 !bg-gray-500 border-none opacity-0" />
  </>;
}

export const CustomServiceNode = (props) => <ServiceNode {...props} />;
export const CustomInfraNode = (props) => <ServiceNode {...props} infrastructure />;
export const nodeTypes = { service: CustomServiceNode, infrastructure: CustomInfraNode, queue: CustomInfraNode, crossSection: CrossSectionNode };
