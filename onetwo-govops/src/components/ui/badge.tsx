import { cn } from '@/lib/utils'

const variants: Record<string, string> = {
  green: 'bg-green-100 text-green-800',
  red: 'bg-red-50 text-red-800',
  blue: 'bg-blue-100 text-blue-800',
  amber: 'bg-amber-100 text-amber-800',
  purple: 'bg-purple-100 text-purple-800',
  gray: 'bg-gray-100 text-gray-600',
  stripe: 'bg-[#635bff] text-white',
}

export function Badge({ children, variant = 'gray', className }: {
  children: React.ReactNode
  variant?: keyof typeof variants
  className?: string
}) {
  return (
    <span className={cn(
      'inline-flex items-center px-2 py-0.5 rounded-full text-[0.7rem] font-semibold',
      variants[variant] || variants.gray,
      className
    )}>
      {children}
    </span>
  )
}
