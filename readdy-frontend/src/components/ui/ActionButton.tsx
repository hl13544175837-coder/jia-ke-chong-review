import type { ButtonHTMLAttributes, ReactNode } from 'react';

export type ActionButtonTone = 'primary' | 'secondary' | 'danger';

interface ActionButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  tone?: ActionButtonTone;
  size?: 'sm' | 'md';
  icon?: ReactNode;
}

const toneClasses: Record<ActionButtonTone, string> = {
  primary: 'border-primary-500 bg-primary-500 text-white hover:border-primary-600 hover:bg-primary-600',
  secondary: 'border-background-300 bg-white text-foreground-700 hover:border-primary-200 hover:bg-primary-50 hover:text-primary-700',
  danger: 'border-red-300 bg-white text-red-700 hover:bg-red-50',
};

const sizeClasses = {
  sm: 'h-8 rounded-lg px-3 text-xs',
  md: 'min-h-10 rounded-lg px-4 py-2 text-sm',
};

export default function ActionButton({
  tone = 'secondary',
  size = 'md',
  icon,
  className = '',
  children,
  type = 'button',
  ...props
}: ActionButtonProps) {
  return (
    <button
      type={type}
      data-ui="action-button"
      data-tone={tone}
      className={`inline-flex items-center justify-center gap-1.5 whitespace-nowrap border font-medium transition focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary-300 disabled:cursor-not-allowed disabled:border-background-200 disabled:bg-background-100 disabled:text-foreground-400 disabled:opacity-70 ${toneClasses[tone]} ${sizeClasses[size]} ${className}`.trim()}
      {...props}
    >
      {icon}{children}
    </button>
  );
}
