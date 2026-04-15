'use client';

export function PrintButton() {
  return (
    <button
      onClick={() => window.print()}
      className="print:hidden inline-flex items-center gap-2 px-4 py-2 bg-slate-800/80 hover:bg-slate-700 border border-slate-700/60 rounded-lg text-sm font-medium text-slate-300 hover:text-white transition"
      title="Print or save as PDF"
    >
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M17 17h2a2 2 0 002-2v-4a2 2 0 00-2-2H5a2 2 0 00-2 2v4a2 2 0 002 2h2m2 4h6a2 2 0 002-2v-4a2 2 0 00-2-2H9a2 2 0 00-2 2v4a2 2 0 002 2zm8-12V5a2 2 0 00-2-2H9a2 2 0 00-2 2v4h10z" />
      </svg>
      Download PDF
    </button>
  );
}
