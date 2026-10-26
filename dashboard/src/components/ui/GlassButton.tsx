import React from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core'

type ButtonVariant = 'default' | 'primary' | 'ghost' | 'destructive'
type ButtonSize = 'sm' | 'md' | 'lg'

interface GlassButtonProps extends React.ButtonHTMLAttributes<HTMLButtonElement> {
  variant?: ButtonVariant
  size?: ButtonSize
  icon?: IconDefinition
  iconPosition?: 'left' | 'right'
  loading?: boolean
  glow?: boolean
  children?: React.ReactNode
}

const variantClasses: Record<ButtonVariant, string> = {
  default: 'glass-button text-foreground hover:text-foreground',
  primary: 'glass-button-primary text-primary-foreground',
  ghost: 'bg-transparent hover:bg-secondary/50 text-muted-foreground hover:text-foreground border border-transparent hover:border-border/50 transition-all duration-200',
  destructive: 'glass-button bg-destructive/20 text-destructive border-destructive/30 hover:bg-destructive/30',
}

const sizeClasses: Record<ButtonSize, string> = {
  sm: 'px-3 py-1.5 text-xs gap-1.5',
  md: 'px-4 py-2 text-sm gap-2',
  lg: 'px-6 py-3 text-base gap-2.5',
}

export function GlassButton({
  variant = 'default',
  size = 'md',
  icon,
  iconPosition = 'left',
  loading = false,
  glow = false,
  children,
  className = '',
  disabled,
  ...props
}: GlassButtonProps) {
  const glowClass = glow && variant === 'primary' ? 'animate-glow-pulse' : ''
  
  return (
    <button
      className={`
        inline-flex items-center justify-center font-medium rounded-lg
        ${variantClasses[variant]}
        ${sizeClasses[size]}
        ${glowClass}
        ${disabled || loading ? 'opacity-50 cursor-not-allowed' : ''}
        ${className}
      `}
      disabled={disabled || loading}
      {...props}
    >
      {loading ? (
        <div className="w-4 h-4 border-2 border-current border-t-transparent rounded-full animate-spin" />
      ) : (
        <>
          {icon && iconPosition === 'left' && (
            <FontAwesomeIcon icon={icon} className="w-4 h-4" />
          )}
          {children}
          {icon && iconPosition === 'right' && (
            <FontAwesomeIcon icon={icon} className="w-4 h-4" />
          )}
        </>
      )}
    </button>
  )
}

export default GlassButton

