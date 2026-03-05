'use client';

import { useState, ReactNode } from 'react';

interface CollapsibleSectionProps {
  title: string;
  defaultOpen?: boolean;
  children: ReactNode;
  icon?: ReactNode;
  badge?: string | number;
  className?: string;
}

export function CollapsibleSection({
  title,
  defaultOpen = true,
  children,
  icon,
  badge,
  className = '',
}: CollapsibleSectionProps) {
  const [isOpen, setIsOpen] = useState(defaultOpen);

  return (
    <div className={`border border-neutral-800 ${className}`}>
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="w-full px-4 py-3 flex items-center justify-between hover:bg-neutral-900/50 transition-colors"
      >
        <div className="flex items-center gap-3">
          <svg
            className={`w-4 h-4 transition-transform duration-200 ${isOpen ? 'rotate-90' : ''}`}
            fill="none"
            viewBox="0 0 24 24"
            stroke="currentColor"
          >
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M9 5l7 7-7 7" />
          </svg>
          {icon && <span className="text-neutral-400">{icon}</span>}
          <span className="font-medium">{title}</span>
        </div>
        {badge !== undefined && (
          <span className="text-sm text-neutral-500">{badge}</span>
        )}
      </button>
      
      <div
        className={`overflow-hidden transition-all duration-200 ${
          isOpen ? 'max-h-[2000px] opacity-100' : 'max-h-0 opacity-0'
        }`}
      >
        <div className="px-4 py-4 border-t border-neutral-800">
          {children}
        </div>
      </div>
    </div>
  );
}
