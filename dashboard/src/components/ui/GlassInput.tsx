import React, { forwardRef } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core'

interface GlassInputProps extends React.InputHTMLAttributes<HTMLInputElement> {
  icon?: IconDefinition
  error?: string
  label?: string
}

export const GlassInput = forwardRef<HTMLInputElement, GlassInputProps>(
  ({ icon, error, label, className = '', ...props }, ref) => {
    return (
      <div className="space-y-1.5">
        {label && (
          <label className="text-sm font-medium text-foreground">
            {label}
          </label>
        )}
        <div className="relative">
          {icon && (
            <FontAwesomeIcon
              icon={icon}
              className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground pointer-events-none"
            />
          )}
          <input
            ref={ref}
            className={`
              w-full h-10 rounded-lg text-foreground placeholder:text-muted-foreground/60
              glass-input
              ${icon ? 'pl-10 pr-4' : 'px-4'}
              ${error ? 'border-destructive focus:border-destructive focus:ring-destructive/20' : ''}
              ${className}
            `}
            {...props}
          />
        </div>
        {error && (
          <p className="text-xs text-destructive">{error}</p>
        )}
      </div>
    )
  }
)

GlassInput.displayName = 'GlassInput'

interface GlassTextareaProps extends React.TextareaHTMLAttributes<HTMLTextAreaElement> {
  error?: string
  label?: string
}

export const GlassTextarea = forwardRef<HTMLTextAreaElement, GlassTextareaProps>(
  ({ error, label, className = '', ...props }, ref) => {
    return (
      <div className="space-y-1.5">
        {label && (
          <label className="text-sm font-medium text-foreground">
            {label}
          </label>
        )}
        <textarea
          ref={ref}
          className={`
            w-full rounded-lg text-foreground placeholder:text-muted-foreground/60
            glass-input p-3 resize-none
            ${error ? 'border-destructive focus:border-destructive focus:ring-destructive/20' : ''}
            ${className}
          `}
          {...props}
        />
        {error && (
          <p className="text-xs text-destructive">{error}</p>
        )}
      </div>
    )
  }
)

GlassTextarea.displayName = 'GlassTextarea'

export default GlassInput

