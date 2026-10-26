import { useState, useEffect } from 'react'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faDiscord } from '@fortawesome/free-brands-svg-icons'
import { useSearchParams } from 'react-router-dom'
import { motion } from 'framer-motion'
import { auth } from '../../lib/auth/auth'
import axios from 'axios'

const ERROR_MESSAGES = {
    insufficient_permissions: 'You don\'t have permission to access the dashboard. Please contact an administrator.',
    discord_error: 'There was an error with Discord authentication. Please try again.',
    no_code: 'No authentication code received. Please try again.',
    callback_error: 'There was an error during login. Please try again.',
    unknown_error: 'You don\'t have the required roles to access this dashboard. Please contact an administrator.',
    not_allowed: 'Access denied. You need specific roles to use this dashboard. Please contact an administrator.'
};

export default function SignInPage() {
    const [searchParams] = useSearchParams()
    const error = searchParams.get('error')
    const [logoUrl, setLogoUrl] = useState('')
    const [logoError, setLogoError] = useState(false)
    const [navName, setNavName] = useState('')

    useEffect(() => {
        axios.get('/api/settings/dashboard').then(res => {
            if (res.data?.logoUrl) setLogoUrl(res.data.logoUrl)
            if (res.data?.navName) setNavName(res.data.navName)
        }).catch(() => {})
    }, [])

    const handleDiscordSignIn = () => {
        const returnUrl = searchParams.get('returnUrl')
        auth.login(returnUrl || undefined)
    }

    return (
        <div className="relative flex items-center justify-center min-h-screen bg-background overflow-hidden">
            <motion.div 
                initial={{ opacity: 0, y: 20, scale: 0.95 }}
                animate={{ opacity: 1, y: 0, scale: 1 }}
                transition={{ duration: 0.5, ease: "easeOut" }}
                className="relative z-10 max-w-md w-full mx-4"
            >
                <div className="bg-card border border-border/40 rounded-2xl p-8 md:p-10">
                    <div className="flex flex-col items-center text-center mb-8">
                        <motion.div 
                            initial={{ scale: 0 }}
                            animate={{ scale: 1 }}
                            transition={{ delay: 0.2, type: "spring", stiffness: 200 }}
                            className="mb-6"
                        >
                            {logoUrl && !logoError ? (
                                <img src={logoUrl} alt="" className="w-20 h-20 rounded-2xl object-cover" onError={() => setLogoError(true)} />
                            ) : (
                                <div className="w-20 h-20 rounded-2xl bg-secondary flex items-center justify-center">
                                    <span className="text-3xl font-bold text-foreground">{navName?.charAt(0)?.toUpperCase() || 'D'}</span>
                                </div>
                            )}
                        </motion.div>
                        
                        <motion.h2 
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.3 }}
                            className="text-2xl font-bold text-foreground mb-2"
                        >
                            Welcome Back
                        </motion.h2>
                        <motion.p 
                            initial={{ opacity: 0, y: 10 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: 0.4 }}
                            className="text-sm text-muted-foreground"
                        >
                            Sign in with Discord to access the dashboard
                        </motion.p>
                        
                        {error && ERROR_MESSAGES[error as keyof typeof ERROR_MESSAGES] && (
                            <motion.div 
                                initial={{ opacity: 0, scale: 0.95 }}
                                animate={{ opacity: 1, scale: 1 }}
                                className="mt-6 p-4 bg-destructive/5 rounded-lg border border-destructive/30 w-full"
                            >
                                <p className="text-sm text-destructive">
                                    {ERROR_MESSAGES[error as keyof typeof ERROR_MESSAGES]}
                                </p>
                            </motion.div>
                        )}
                    </div>
                    
                    <motion.div
                        initial={{ opacity: 0, y: 10 }}
                        animate={{ opacity: 1, y: 0 }}
                        transition={{ delay: 0.5 }}
                    >
                        <button
                            onClick={handleDiscordSignIn}
                            className="w-full flex items-center justify-center py-3.5 px-4 text-sm font-semibold rounded-lg text-white bg-[#5865F2] hover:bg-[#4752C4] focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-[#5865F2] focus:ring-offset-background transition-all duration-200"
                        >
                            <FontAwesomeIcon icon={faDiscord} className="h-5 w-5 mr-3" />
                            Continue with Discord
                        </button>
                    </motion.div>

                    <motion.p 
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        transition={{ delay: 0.6 }}
                        className="mt-6 text-center text-xs text-muted-foreground/60"
                    >
                        By signing in, you agree to our terms of service
                    </motion.p>
                </div>
                
                <motion.div 
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    transition={{ delay: 0.7 }}
                    className="mt-6 text-center"
                >
                    <p className="text-xs text-muted-foreground/40">
                        Powered by DragonHosting
                    </p>
                </motion.div>
            </motion.div>
        </div>
    )
}
