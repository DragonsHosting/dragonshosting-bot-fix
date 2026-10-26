import React from 'react';
import { motion } from 'framer-motion';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faLock, faHome, faArrowLeft } from '@fortawesome/free-solid-svg-icons';
import { Link } from 'react-router-dom';

function FloatingOrb({ className, delay = 0 }: { className: string; delay?: number }) {
    return (
        <motion.div
            className={`absolute rounded-full blur-3xl opacity-20 ${className}`}
            animate={{
                y: [0, -20, 0],
                x: [0, 15, 0],
                scale: [1, 1.05, 1],
            }}
            transition={{
                duration: 6,
                delay,
                repeat: Infinity,
                ease: "easeInOut"
            }}
        />
    )
}

export default function AccessDeniedPage() {
    return (
        <div className="relative flex items-center justify-center min-h-screen bg-background overflow-hidden">
            <div className="mesh-gradient-animated" />
            <div className="noise-overlay" />
            
            <FloatingOrb 
                className="w-80 h-80 bg-destructive/40 -top-40 -left-40" 
                delay={0} 
            />
            <FloatingOrb 
                className="w-64 h-64 bg-orange-500/30 -bottom-32 -right-32" 
                delay={2} 
            />

            <motion.div
                initial={{ opacity: 0, y: 20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.5, ease: "easeOut" }}
                className="relative z-10 max-w-md w-full mx-4"
            >
                <div className="glass-card p-8 md:p-10 text-center">
                    <motion.div 
                        initial={{ scale: 0 }}
                        animate={{ scale: 1 }}
                        transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
                        className="w-20 h-20 mx-auto rounded-2xl bg-gradient-to-br from-destructive to-destructive/60 flex items-center justify-center mb-6 shadow-[0_0_30px_-5px_rgba(239,68,68,0.5)]"
                    >
                        <FontAwesomeIcon icon={faLock} className="w-8 h-8 text-white" />
                    </motion.div>
                    
                    <motion.h1 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.3 }}
                        className="text-2xl font-bold mb-3 text-foreground"
                    >
                        Access Denied
                    </motion.h1>
                    
                    <motion.p 
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.4 }}
                        className="text-muted-foreground mb-8 leading-relaxed"
                    >
                        You don't have permission to access this page. Please contact an administrator if you believe this is a mistake.
                    </motion.p>

                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.5 }}
                        className="flex flex-col sm:flex-row gap-3 justify-center"
                    >
                        <Link 
                            to="/"
                            className="group inline-flex items-center justify-center gap-2 glass-button-primary rounded-xl px-6 py-3 text-sm font-semibold"
                        >
                            <FontAwesomeIcon icon={faHome} className="w-4 h-4" />
                            Return Home
                        </Link>
                        <button 
                            onClick={() => window.history.back()}
                            className="inline-flex items-center justify-center gap-2 glass-button rounded-xl px-6 py-3 text-sm font-medium text-foreground"
                        >
                            <FontAwesomeIcon icon={faArrowLeft} className="w-4 h-4" />
                            Go Back
                        </button>
                    </motion.div>
                </div>
            </motion.div>
        </div>
    );
}
