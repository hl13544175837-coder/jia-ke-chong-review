import type { ReactNode } from 'react';
import type { SemanticStatusTone } from './recruitmentPresentation';

interface SemanticStatusBadgeProps {
  tone: SemanticStatusTone;
  children: ReactNode;
  className?: string;
}

const toneClasses: Record<SemanticStatusTone, string> = {
  neutral: 'border-background-300 bg-background-100 text-foreground-600',
  pending: 'border-amber-200 bg-amber-50 text-amber-700',
  info: 'border-blue-200 bg-blue-50 text-blue-700',
  success: 'border-emerald-200 bg-emerald-50 text-emerald-700',
  danger: 'border-red-200 bg-red-50 text-red-700',
};

export default function SemanticStatusBadge({ tone, children, className = '' }: SemanticStatusBadgeProps) {
  return (
    <span
      data-ui="semantic-status-badge"
      data-tone={tone}
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${toneClasses[tone]} ${className}`.trim()}
    >
      {children}
    </span>
  );
}
