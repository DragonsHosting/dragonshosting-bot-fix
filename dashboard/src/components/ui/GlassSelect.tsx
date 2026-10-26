import React, { forwardRef } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faChevronDown } from '@fortawesome/free-solid-svg-icons'

interface Option {
  value: string
  label: string
}

interface GlassSelectProps extends Omit<React.SelectHTMLAttributes<HTMLSelectElement>, 'children'> {
  options: Option[]
  label?: string
  error?: string
  placeholder?: string
}

export const GlassSelect = forwardRef<HTMLSelectElement, GlassSelectProps>(
  ({ options, label, error, placeholder, className = '', ...props }, ref) => {
    return (
      <div className="space-y-1.5">
        {label && (
          <label className="text-sm font-medium text-foreground">
            {label}
          </label>
        )}
        <div className="relative">
          <select
            ref={ref}
            className={`
              w-full h-10 rounded-lg text-foreground
              glass-input appearance-none pl-4 pr-10
              cursor-pointer
              ${error ? 'border-destructive focus:border-destructive focus:ring-destructive/20' : ''}
              ${className}
            `}
            {...props}
          >
            {placeholder && (
              <option value="" disabled>
                {placeholder}
              </option>
            )}
            {options.map((option) => (
              <option key={option.value} value={option.value}>
                {option.label}
              </option>
            ))}
          </select>
          <FontAwesomeIcon
            icon={faChevronDown}
            className="absolute right-3 top-1/2 -translate-y-1/2 w-3 h-3 text-muted-foreground pointer-events-none"
          />
        </div>
        {error && (
          <p className="text-xs text-destructive">{error}</p>
        )}
      </div>
    )
  }
)

GlassSelect.displayName = 'GlassSelect'

export default GlassSelect

