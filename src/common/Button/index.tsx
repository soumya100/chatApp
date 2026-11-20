import { cn } from '@/lib/utils'
import { VariantProps, cva } from 'class-variance-authority'
import { Loader2 } from 'lucide-react'
import { ButtonHTMLAttributes, FC } from 'react'


export const buttonVariants = cva(
  'active:scale-[0.98] inline-flex items-center justify-center gap-2 rounded-xl text-sm font-semibold transition-all duration-150 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-500 focus-visible:ring-offset-2 focus-visible:ring-offset-white dark:focus-visible:ring-offset-slate-950 disabled:opacity-50 disabled:pointer-events-none select-none',
  {
    variants: {
      variant: {
        default:
          'bg-indigo-600 text-white shadow-sm shadow-indigo-600/15 hover:bg-indigo-500 dark:bg-indigo-600 dark:hover:bg-indigo-500',
        ghost:
          'bg-transparent text-slate-700 dark:text-slate-300 hover:text-slate-950 dark:hover:text-white hover:bg-slate-100 dark:hover:bg-white/[0.06]',
      },
      size: {
        default: 'h-10 py-2 px-4',
        sm: 'h-9 px-2.5',
        lg: 'h-11 px-8',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  }
)

interface ButtonProps
  extends ButtonHTMLAttributes<HTMLButtonElement>,
    VariantProps<typeof buttonVariants> {
  isLoading?: boolean
}

const Button: FC<ButtonProps> = ({
  className,
  children,
  variant,
  isLoading,
  size,
  disabled,
  ...props
}) => {
  return (
    <button
      className={cn(buttonVariants({ variant, size, className }))}
      disabled={isLoading || disabled}
      aria-busy={isLoading}
      {...props}
    >
      {isLoading ? (
        <>
          <Loader2 className='mr-2 h-4 w-4 animate-spin' aria-hidden='true' />
          <span className='sr-only'>Loading...</span>
        </>
      ) : null}
      {children}
    </button>
  )
}

export default Button