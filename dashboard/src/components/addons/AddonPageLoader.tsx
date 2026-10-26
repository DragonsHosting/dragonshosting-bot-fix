import React, { useState, useEffect, Suspense } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { motion } from 'framer-motion';
import { addonService, AddonPage as AddonPageConfig } from '../../services/addonService';
import { auth } from '../../lib/auth/auth';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faLock, faArrowLeft } from '@fortawesome/free-solid-svg-icons';

interface AddonPageLoaderProps {
    addonName: string;
    pageName: string;
}

function LoadingSpinner() {
    return (
        <div className="flex items-center justify-center min-h-[400px]">
            <div className="flex flex-col items-center gap-4">
                <div className="w-10 h-10 rounded-2xl border-2 border-primary border-t-transparent animate-spin" />
                <p className="text-muted-foreground text-sm">Loading addon page...</p>
            </div>
        </div>
    );
}

function ErrorDisplay({ error, addonName }: { error: string; addonName: string }) {
    return (
        <div className="flex items-center justify-center min-h-[400px]">
            <div className="glass-card p-8 text-center max-w-md">
                <div className="w-16 h-16 rounded-2xl bg-red-500/10 flex items-center justify-center mx-auto mb-4">
                    <span className="text-3xl">⚠️</span>
                </div>
                <h2 className="text-lg font-semibold text-foreground mb-2">
                    Failed to load addon page
                </h2>
                <p className="text-muted-foreground text-sm mb-4">
                    The page from addon "{addonName}" could not be loaded.
                </p>
                <code className="block p-3 rounded-lg bg-secondary/50 text-xs text-red-400 overflow-auto">
                    {error}
                </code>
            </div>
        </div>
    );
}

export function AddonPageLoader({ addonName, pageName }: AddonPageLoaderProps) {
    const [Component, setComponent] = useState<React.ComponentType | null>(null);
    const [error, setError] = useState<string | null>(null);
    const [loading, setLoading] = useState(true);

    useEffect(() => {
        const loadComponent = async () => {
            setLoading(true);
            setError(null);

            try {
                const pageFile = pageName || 'index';
                
                const resolveResponse = await fetch(`/api/addons/resolve/${addonName}/${pageFile}`);
                if (!resolveResponse.ok) {
                    const errorData = await resolveResponse.json().catch(() => ({}));
                    throw new Error(errorData.error || `Failed to resolve addon page: ${resolveResponse.status}`);
                }
                
                const { modulePath } = await resolveResponse.json();

                if (!modulePath) {
                    throw new Error('No module path returned from server');
                }

                const module = await import(/* @vite-ignore */ modulePath);
                
                if (module) {
                    console.log(`[AddonPageLoader] Loaded from: ${modulePath}`);
                    setComponent(() => module.default || module);
                } else {
                    throw new Error('Module loaded but was empty');
                }
            } catch (err) {
                console.error(`[AddonPageLoader] Failed to load ${addonName}/${pageName}:`, err);
                setError(err instanceof Error ? err.message : 'Unknown error');
            } finally {
                setLoading(false);
            }
        };

        loadComponent();
    }, [addonName, pageName]);

    if (loading) {
        return <LoadingSpinner />;
    }

    if (error) {
        return <ErrorDisplay error={error} addonName={addonName} />;
    }

    if (!Component) {
        return <ErrorDisplay error="Component not found" addonName={addonName} />;
    }

    return (
        <motion.div
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ duration: 0.2 }}
        >
            <Suspense fallback={<LoadingSpinner />}>
                <Component />
            </Suspense>
        </motion.div>
    );
}

function AccessDenied() {
    const navigate = useNavigate();
    
    return (
        <div className="flex items-center justify-center min-h-[400px]">
            <div className="w-full max-w-md px-4">
                <div className="text-center space-y-6 glass-card p-6 lg:p-8">
                    <div className="bg-red-500/10 w-16 h-16 rounded-full flex items-center justify-center mx-auto">
                        <FontAwesomeIcon icon={faLock} className="w-8 h-8 text-red-500" />
                    </div>
                    <div className="space-y-2">
                        <h1 className="text-2xl font-bold text-foreground">Access Denied</h1>
                        <p className="text-muted-foreground">
                            You don't have permission to access this addon page. 
                            Please contact an administrator if you believe this is a mistake.
                        </p>
                    </div>
                    <button
                        onClick={() => navigate(-1)}
                        className="flex items-center justify-center gap-2 w-full glass-subtle hover:bg-secondary/50 text-foreground rounded-xl px-4 py-3 transition-colors"
                    >
                        <FontAwesomeIcon icon={faArrowLeft} className="w-4 h-4" />
                        <span>Go Back</span>
                    </button>
                </div>
            </div>
        </div>
    );
}

export function AddonPage() {
    const { addonName, '*': pagePath } = useParams();
    const pageName = pagePath || 'index';
    const [hasPermission, setHasPermission] = useState<boolean | null>(null);
    const [pageConfig, setPageConfig] = useState<AddonPageConfig | null>(null);

    useEffect(() => {
        const checkPermissions = async () => {
            if (!addonName) return;
            
            try {
                const config = await addonService.getConfig();
                const fullPath = `/addon/${addonName}${pagePath ? `/${pagePath}` : ''}`;
                
                // Find the page config
                const page = config.pages.find(p => 
                    p.path === fullPath || 
                    p.path === `/addon/${addonName}` && !pagePath
                );
                
                setPageConfig(page || null);
                
                // If no requiredRoles, allow access
                if (!page?.requiredRoles || page.requiredRoles.length === 0) {
                    setHasPermission(true);
                    return;
                }
                
                // Check user roles
                const user = await auth.getUser();
                if (!user || !user.roles) {
                    setHasPermission(false);
                    return;
                }
                
                const hasRole = user.roles.some(role => page.requiredRoles!.includes(role));
                setHasPermission(hasRole);
            } catch (error) {
                console.error('[AddonPage] Error checking permissions:', error);
                setHasPermission(true); // Allow on error to not block legitimate access
            }
        };
        
        checkPermissions();
    }, [addonName, pagePath]);

    if (!addonName) {
        return <ErrorDisplay error="Addon name not specified" addonName="unknown" />;
    }

    // Still checking permissions
    if (hasPermission === null) {
        return <LoadingSpinner />;
    }

    // Access denied
    if (!hasPermission) {
        return <AccessDenied />;
    }

    return <AddonPageLoader addonName={addonName} pageName={pageName} />;
}

export default AddonPage;

