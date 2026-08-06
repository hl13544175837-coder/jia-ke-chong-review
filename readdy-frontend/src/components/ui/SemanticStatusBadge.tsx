import type { ReactNode } from 'react';
import type { SemanticStatusTone } from './recruitmentPresentation';
import { statusToneClasses } from './recruitmentPresentation';

interface SemanticStatusBadgeProps {
  tone: SemanticStatusTone;
  children: ReactNode;
  className?: string;
}

export default function SemanticStatusBadge({ tone, children, className = '' }: SemanticStatusBadgeProps) {
  return (
    <span
      data-ui="semantic-status-badge"
      data-tone={tone}
      className={`inline-flex items-center rounded-full border px-2.5 py-1 text-xs font-medium ${statusToneClasses[tone]} ${className}`.trim()}
    >
      {children}
    </span>
  );
}
