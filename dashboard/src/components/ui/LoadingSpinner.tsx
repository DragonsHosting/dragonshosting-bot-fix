import React from 'react'
import { motion } from 'framer-motion'

interface LoadingSpinnerProps {
    size?: 'sm' | 'md' | 'lg'
    text?: string
}

export default function LoadingSpinner({ size = 'md', text }: LoadingSpinnerProps) {
    const sizeClasses = {
        sm: 'w-6 h-6 border-2',
        md: 'w-10 h-10 border-2',
        lg: 'w-14 h-14 border-3',
    }

    return (
        <motion.div 
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex flex-col items-center justify-center min-h-[200px] gap-4"
        >
            <div className="relative">
                <div className={`${sizeClasses[size]} rounded-2xl border-primary border-t-transparent animate-spin shadow-glow`} />
                <div className={`absolute inset-0 ${sizeClasses[size]} rounded-2xl border-primary/20 border-t-transparent animate-spin`} style={{ animationDirection: 'reverse', animationDuration: '1.5s' }} />
            </div>
            {text && (
                <p className="text-muted-foreground text-sm font-medium">{text}</p>
            )}
        </motion.div>
    )
}
