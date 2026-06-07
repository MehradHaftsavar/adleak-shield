'use client';

import { useState } from 'react';

interface FAQItem {
  q: string;
  a: string;
}

export function FAQAccordion({ faqs }: { faqs: FAQItem[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null);

  return (
    <div className="space-y-3">
      {faqs.map((faq, i) => (
        <div key={i} className="bg-white border border-slate-200 rounded-xl overflow-hidden">
          <button
            onClick={() => setOpenIndex(openIndex === i ? null : i)}
            className="w-full text-left px-6 py-5 flex items-start justify-between gap-4 hover:bg-slate-50 transition-colors"
            aria-expanded={openIndex === i}
          >
            <span className="font-semibold text-slate-900 text-sm leading-relaxed">{faq.q}</span>
            <span
              className={`flex-shrink-0 w-5 h-5 rounded-full border-2 border-slate-300 flex items-center justify-center text-slate-400 transition-transform ${
                openIndex === i ? 'rotate-45' : ''
              }`}
            >
              +
            </span>
          </button>
          {openIndex === i && (
            <div className="px-6 pb-5 text-sm text-slate-600 leading-relaxed border-t border-slate-100 pt-4">
              {faq.a}
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
