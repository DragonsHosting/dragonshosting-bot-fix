import React from 'react'

interface GlassCardProps {
  children: React.ReactNode
  className?: string
  hover?: boolean
  glow?: boolean
  gradient?: boolean
  onClick?: () => void
}

export function GlassCard({ 
  children, 
  className = '', 
  hover = false, 
  glow = false,
  gradient = false,
  onClick
}: GlassCardProps) {
  const baseClasses = gradient ? 'glass-card gradient-border' : 'glass-card'
  const hoverClasses = hover ? 'glass-card-hover cursor-pointer' : ''
  const glowClasses = glow ? 'glow' : ''
  
  return (
    <div 
      className={`${baseClasses} ${hoverClasses} ${glowClasses} ${className}`}
      onClick={onClick}
    >
      {children}
    </div>
  )
}

interface GlassCardHeaderProps {
  children: React.ReactNode
  className?: string
}

export function GlassCardHeader({ children, className = '' }: GlassCardHeaderProps) {
  return (
    <div className={`px-5 py-4 border-b border-border/50 ${className}`}>
      {children}
    </div>
  )
}

interface GlassCardContentProps {
  children: React.ReactNode
  className?: string
}

export function GlassCardContent({ children, className = '' }: GlassCardContentProps) {
  return (
    <div className={`p-5 ${className}`}>
      {children}
    </div>
  )
}

interface GlassCardFooterProps {
  children: React.ReactNode
  className?: string
}

export function GlassCardFooter({ children, className = '' }: GlassCardFooterProps) {
  return (
    <div className={`px-5 py-4 border-t border-border/50 ${className}`}>
      {children}
    </div>
  )
}

export default GlassCard

