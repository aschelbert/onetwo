import { cn } from '@/lib/utils'

export function Input({ className, ...props }: React.InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input className={cn(
      'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white text-gray-900 transition-colors',
      'focus:outline-none focus:border-gray-900 focus:ring-2 focus:ring-gray-900/10',
      className
    )} {...props} />
  )
}

export function Select({ className, children, ...props }: React.SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select className={cn(
      'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white text-gray-900 transition-colors',
      'focus:outline-none focus:border-gray-900 focus:ring-2 focus:ring-gray-900/10',
      className
    )} {...props}>
      {children}
    </select>
  )
}

export function Textarea({ className, ...props }: React.TextareaHTMLAttributes<HTMLTextAreaElement>) {
  return (
    <textarea className={cn(
      'w-full px-3 py-2 border border-gray-300 rounded-lg text-sm bg-white text-gray-900 transition-colors resize-y min-h-[80px]',
      'focus:outline-none focus:border-gray-900 focus:ring-2 focus:ring-gray-900/10',
      className
    )} {...props} />
  )
}

export function FormGroup({ label, children, className }: { label: string; children: React.ReactNode; className?: string }) {
  return (
    <div className={cn('mb-4', className)}>
      <label className="block text-[0.78rem] font-semibold text-gray-700 mb-1.5">{label}</label>
      {children}
    </div>
  )
}
