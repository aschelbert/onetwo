import type { ButtonHTMLAttributes, AnchorHTMLAttributes, ReactNode } from 'react';
import { Link } from 'react-router-dom';
import { cn } from '@/lib/formatters';

type Variant = 'primary' | 'ghost' | 'danger';
type Size = 'md' | 'sm';

const BASE = 'inline-flex items-center justify-center gap-2 rounded-full font-semibold font-body transition-colors disabled:opacity-55 disabled:cursor-not-allowed';
const VARIANTS: Record<Variant, string> = {
  primary: 'bg-ux2-navy text-white hover:bg-navy-800',
  ghost: 'bg-white text-ux2-ink border border-ux2-line-strong hover:bg-ux2-surface',
  danger: 'bg-white text-ux2-red-ink border border-[#F3C9CF] hover:bg-ux2-red-tint',
};
const SIZES: Record<Size, string> = {
  md: 'h-11 px-[18px] text-sm',
  sm: 'h-9 px-3.5 text-xs',
};

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: Variant;
  size?: Size;
  children: ReactNode;
}

export function Button({ variant = 'primary', size = 'md', className, type = 'button', children, ...rest }: ButtonProps) {
  return (
    <button type={type} className={cn(BASE, VARIANTS[variant], SIZES[size], className)} {...rest}>
      {children}
    </button>
  );
}

export interface LinkButtonProps extends Omit<AnchorHTMLAttributes<HTMLAnchorElement>, 'href'> {
  to: string;
  variant?: Variant;
  size?: Size;
  children: ReactNode;
}

/** Same look as Button, routed with react-router. */
export function LinkButton({ to, variant = 'ghost', size = 'md', className, children, ...rest }: LinkButtonProps) {
  return (
    <Link to={to} className={cn(BASE, VARIANTS[variant], SIZES[size], className)} {...rest}>
      {children}
    </Link>
  );
}

export default Button;
