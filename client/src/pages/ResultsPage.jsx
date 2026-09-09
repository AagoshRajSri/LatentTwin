import React from 'react';
import GraphViewer from '../components/GraphViewer.jsx';
import ResultsPanel from '../components/ResultsPanel.jsx';

export default function ResultsPage() {
  return (
    <main className="min-h-screen bg-gray-950 p-6">
      <div className="mx-auto grid h-[85vh] min-h-[550px] max-w-7xl gap-6 lg:grid-cols-[minmax(0,1fr)_22rem]">
        <GraphViewer />
        <ResultsPanel />
      </div>
    </main>
  );
}
