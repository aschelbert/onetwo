import { cn } from '@/lib/utils'

const variants: Record<string, string> = {
  primary: 'bg-gray-900 text-white hover:bg-gray-800',
  secondary: 'bg-gray-100 text-gray-700 hover:bg-gray-200',
  accent: 'bg-[#c42030] text-white hover:bg-[#991b1b]',
  sage: 'bg-green-600 text-white hover:bg-green-700',
  ghost: 'bg-transparent text-gray-500 hover:text-gray-700',
  danger: 'bg-red-600 text-white hover:bg-red-700',
}

const sizes: Record<string, string> = {
  sm: 'px-3 py-1.5 text-xs',
  md: 'px-4 py-2 text-[0.82rem]',
  lg: 'px-5 py-2.5 text-sm',
  xs: 'px-2 py-1 text-[0.7rem]',
}

export function Button({ children, variant = 'primary', size = 'md', className, ...props }: {
  children: React.ReactNode
  variant?: keyof typeof variants
  size?: keyof typeof sizes
  className?: string
} & React.ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button className={cn(
      'rounded-lg font-semibold cursor-pointer border-none transition-all inline-flex items-center gap-1.5',
      variants[variant] || variants.primary,
      sizes[size] || sizes.md,
      className
    )} {...props}>
      {children}
    </button>
  )
}
