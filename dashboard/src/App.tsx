import React, { Suspense, useEffect, useState } from 'react';
import { BrowserRouter as Router, Routes, Route, useLocation, useNavigate } from 'react-router-dom';
import { AnimatePresence } from 'framer-motion';
import * as FontAwesomeIcons from '@fortawesome/free-solid-svg-icons';
import { AuthGuard } from './components/auth/AuthGuard';
import { PermissionGuard } from './components/auth/PermissionGuard';
import Layout from './components/layout/Layout';
import IndexPage from './pages';
import TicketsPage from './pages/tickets';
import SettingsPage from './pages/settings';
import UserSettingsPage from './pages/user-settings';
import LoginPage from './pages/auth/login';
import SignInPage from './pages/auth/signin';
import CallbackPage from './pages/auth/callback';
import AccessDeniedPage from './pages/auth/access-denied';
import TranscriptPage from './pages/tickets/TranscriptPage';
import EmbedBuilderPage from './pages/embed-builder';
import SuggestionsPage from './pages/suggestions';
import CustomCommandsPage from './pages/custom-commands';
import ReviewsPage from './pages/reviews';
import { CommandPalette, useCommandPalette } from './components/ui/CommandPalette';
import { ToastProvider, useToast, setToastInstance } from './components/ui/Toast';
import { auth } from './lib/auth/auth';
import axios from 'axios';
import { AddonPage } from './components/addons/AddonPageLoader';
import { addonService, AddonConfig } from './services/addonService';
import { GuildProvider } from './contexts/GuildContext';

interface DashboardConfig {
    clientId: ""
    redirectUri: string;
    permissions: {
        Dashboard: {
            Login: string[];
            Settings: string[];
            Embed: string[];
            Suggestions: string[];
        }
    };
}

function AppRoutes() {
    const location = useLocation();
    const navigate = useNavigate();
    const [isReady, setIsReady] = useState(false);
    const [config, setConfig] = useState<DashboardConfig | null>(null);
    const [addonConfig, setAddonConfig] = useState<AddonConfig>({ pages: [], navItems: [] });
    const commandPalette = useCommandPalette();

    useEffect(() => {
        async function init() {
            try {
                const [authResponse, addonsResponse] = await Promise.all([
                    axios.get('/api/auth/config'),
                    addonService.getConfig().catch(() => ({ pages: [], navItems: [] }))
                ]);
                setConfig(authResponse.data);
                setAddonConfig(addonsResponse);
            } catch (error) {
                console.error('[App] Failed to load config:', error);
            }
        }
        init();
    }, []);

    useEffect(() => {
        async function checkAuth() {
            const isAuth = await auth.isAuthenticated();
            const isPublicRoute = location.pathname.includes('/auth/') || location.pathname === '/login';

            if (!isAuth && !isPublicRoute) {
                const returnUrl = location.pathname + location.search;
                navigate('/auth/signin', {
                    replace: true,
                    state: { returnUrl }
                });
            }
            setIsReady(true);
        }
        checkAuth();
    }, [navigate, location]);

    if (!isReady || !config) {
        return (
            <div className="min-h-screen bg-background flex items-center justify-center relative overflow-hidden">
                <div className="mesh-gradient-animated" />
                <div className="noise-overlay" />
                <div className="flex flex-col items-center gap-4 relative z-10">
                    <div className="w-12 h-12 rounded-2xl border-2 border-primary border-t-transparent animate-spin shadow-glow" />
                    <p className="text-muted-foreground text-sm font-medium">Loading...</p>
                </div>
            </div>
        );
    }

    return (
        <>
            <CommandPalette isOpen={commandPalette.isOpen} onClose={commandPalette.close} />
            <AnimatePresence mode="wait">
                <Routes location={location} key={location.pathname}>
                    <Route path="/login" element={<LoginPage />} />
                    <Route path="/auth/signin" element={<SignInPage />} />
                    <Route path="/auth/callback" element={<CallbackPage />} />
                    <Route path="/auth/access-denied" element={<AccessDeniedPage />} />
                    <Route
                        path="*"
                        element={
                            <AuthGuard>
                                <GuildProvider>
                                <Layout>
                                    <Routes>
                                        <Route path="/" element={<IndexPage />} />
                                        <Route path="/tickets" element={<TicketsPage />} />
                                        <Route path="/tickets/:id/transcript" element={<TranscriptPage />} />
                                        <Route path="/reviews" element={<ReviewsPage />} />
                                        <Route path="/user-settings" element={<UserSettingsPage />} />
                                        <Route 
                                            path="/settings" 
                                            element={
                                                <PermissionGuard requiredRoles={config.permissions.Dashboard.Settings}>
                                                    <SettingsPage />
                                                </PermissionGuard>
                                            } 
                                        />
                                        <Route 
                                            path="/embed-builder" 
                                            element={
                                                <PermissionGuard requiredRoles={config.permissions.Dashboard.Embed || config.permissions.Dashboard.Settings}>
                                                    <EmbedBuilderPage />
                                                </PermissionGuard>
                                            } 
                                        />
                                        <Route 
                                            path="/suggestions" 
                                            element={
                                                <PermissionGuard requiredRoles={config.permissions.Dashboard.Suggestions}>
                                                    <SuggestionsPage />
                                                </PermissionGuard>
                                            } 
                                        />
                                        <Route 
                                            path="/custom-commands" 
                                            element={
                                                <PermissionGuard requiredRoles={config.permissions.Dashboard.Settings}>
                                                    <CustomCommandsPage />
                                                </PermissionGuard>
                                            } 
                                        />
                                        <Route path="/addon/:addonName/*" element={<AddonPage />} />
                                    </Routes>
                                </Layout>
                                </GuildProvider>
                            </AuthGuard>
                        }
                    />
                </Routes>
            </AnimatePresence>
        </>
    );
}

function ToastInitializer() {
    const toast = useToast();
    useEffect(() => {
        setToastInstance(toast);
    }, [toast]);
    return null;
}

export default function App() {
    return (
        <ToastProvider>
            <ToastInitializer />
            <Router>
                <AppRoutes />
            </Router>
        </ToastProvider>
    );
}
