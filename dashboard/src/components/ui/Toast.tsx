import React, { createContext, useContext, useState, useCallback, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome';
import { faCheck, faXmark, faExclamationTriangle, faInfoCircle } from '@fortawesome/free-solid-svg-icons';

type ToastType = 'success' | 'error' | 'warning' | 'info';

interface Toast {
    id: number;
    message: string;
    type: ToastType;
    duration: number;
}

interface ToastContextType {
    success: (message: string, options?: { duration?: number }) => void;
    error: (message: string, options?: { duration?: number }) => void;
    warning: (message: string, options?: { duration?: number }) => void;
    info: (message: string, options?: { duration?: number }) => void;
}

const ToastContext = createContext<ToastContextType | null>(null);

let toastId = 0;

const icons = {
    success: faCheck,
    error: faXmark,
    warning: faExclamationTriangle,
    info: faInfoCircle,
};

const colors = {
    success: 'bg-green-500/90 border-green-400',
    error: 'bg-red-500/90 border-red-400',
    warning: 'bg-yellow-500/90 border-yellow-400',
    info: 'bg-blue-500/90 border-blue-400',
};

export function ToastProvider({ children }: { children: React.ReactNode }) {
    const [toasts, setToasts] = useState<Toast[]>([]);

    const addToast = useCallback((message: string, type: ToastType, duration: number = 3000) => {
        const id = ++toastId;
        setToasts((prev) => [...prev.slice(-4), { id, message, type, duration }]);
    }, []);

    const removeToast = useCallback((id: number) => {
        setToasts((prev) => prev.filter((t) => t.id !== id));
    }, []);

    const toast = {
        success: (message: string, options?: { duration?: number }) => 
            addToast(message, 'success', options?.duration ?? 3000),
        error: (message: string, options?: { duration?: number }) => 
            addToast(message, 'error', options?.duration ?? 4000),
        warning: (message: string, options?: { duration?: number }) => 
            addToast(message, 'warning', options?.duration ?? 3500),
        info: (message: string, options?: { duration?: number }) => 
            addToast(message, 'info', options?.duration ?? 3000),
    };

    return (
        <ToastContext.Provider value={toast}>
            {children}
            <div className="fixed top-4 right-4 z-[9999] flex flex-col gap-2 pointer-events-none">
                <AnimatePresence mode="sync">
                    {toasts.map((t) => (
                        <ToastItem key={t.id} toast={t} onRemove={removeToast} />
                    ))}
                </AnimatePresence>
            </div>
        </ToastContext.Provider>
    );
}

function ToastItem({ toast, onRemove }: { toast: Toast; onRemove: (id: number) => void }) {
    useEffect(() => {
        const timer = setTimeout(() => onRemove(toast.id), toast.duration);
        return () => clearTimeout(timer);
    }, [toast.id, toast.duration, onRemove]);

    return (
        <motion.div
            initial={{ opacity: 0, x: 100, scale: 0.9 }}
            animate={{ opacity: 1, x: 0, scale: 1 }}
            exit={{ opacity: 0, x: 100, scale: 0.9 }}
            transition={{ duration: 0.2 }}
            className={`pointer-events-auto flex items-center gap-3 px-4 py-3 rounded-lg border backdrop-blur-sm shadow-lg min-w-[280px] max-w-[400px] ${colors[toast.type]}`}
        >
            <FontAwesomeIcon icon={icons[toast.type]} className="text-white text-sm flex-shrink-0" />
            <span className="text-white text-sm font-medium flex-1">{toast.message}</span>
            <button
                onClick={() => onRemove(toast.id)}
                className="text-white/70 hover:text-white transition-colors"
            >
                <FontAwesomeIcon icon={faXmark} className="text-xs" />
            </button>
        </motion.div>
    );
}

export function useToast(): ToastContextType {
    const context = useContext(ToastContext);
    if (!context) {
        throw new Error('useToast must be used within a ToastProvider');
    }
    return context;
}

let toastInstance: ToastContextType | null = null;

export function setToastInstance(instance: ToastContextType) {
    toastInstance = instance;
}

export const toast = {
    success: (message: string, options?: { duration?: number }) => {
        if (toastInstance) toastInstance.success(message, options);
    },
    error: (message: string, options?: { duration?: number }) => {
        if (toastInstance) toastInstance.error(message, options);
    },
    warning: (message: string, options?: { duration?: number }) => {
        if (toastInstance) toastInstance.warning(message, options);
    },
    info: (message: string, options?: { duration?: number }) => {
        if (toastInstance) toastInstance.info(message, options);
    },
};

