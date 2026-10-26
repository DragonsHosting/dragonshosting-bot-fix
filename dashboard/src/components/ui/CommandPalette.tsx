import React, { useState, useEffect, useCallback, useRef } from 'react'
import { useNavigate } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
    faSearch,
    faHome,
    faTicket,
    faCode,
    faCog,
    faComments,
    faTerminal,
    faArrowRight,
    faKeyboard,
} from '@fortawesome/free-solid-svg-icons'
import type { IconDefinition } from '@fortawesome/fontawesome-svg-core'

interface CommandItem {
    id: string
    name: string
    description: string
    icon: IconDefinition
    href: string
    keywords: string[]
}

const commands: CommandItem[] = [
    { id: 'home', name: 'Overview', description: 'Go to dashboard overview', icon: faHome, href: '/', keywords: ['home', 'dashboard', 'overview', 'main'] },
    { id: 'tickets', name: 'Support Tickets', description: 'View and manage tickets', icon: faTicket, href: '/tickets', keywords: ['tickets', 'support', 'help'] },
    { id: 'embed', name: 'Embed Builder', description: 'Create Discord embeds', icon: faCode, href: '/embed-builder', keywords: ['embed', 'builder', 'discord', 'message'] },
    { id: 'commands', name: 'Custom Commands', description: 'Manage bot commands', icon: faTerminal, href: '/custom-commands', keywords: ['commands', 'custom', 'bot'] },
    { id: 'suggestions', name: 'Suggestions', description: 'View user suggestions', icon: faComments, href: '/suggestions', keywords: ['suggestions', 'feedback', 'ideas'] },
    { id: 'settings', name: 'Settings', description: 'Configure dashboard settings', icon: faCog, href: '/settings', keywords: ['settings', 'config', 'preferences'] },
    { id: 'user-settings', name: 'User Settings', description: 'Your personal settings', icon: faCog, href: '/user-settings', keywords: ['user', 'profile', 'account'] },
]

interface CommandPaletteProps {
    isOpen: boolean
    onClose: () => void
}

export function CommandPalette({ isOpen, onClose }: CommandPaletteProps) {
    const [query, setQuery] = useState('')
    const [selectedIndex, setSelectedIndex] = useState(0)
    const inputRef = useRef<HTMLInputElement>(null)
    const navigate = useNavigate()

    const filteredCommands = query === ''
        ? commands
        : commands.filter((command) => {
            const searchTerms = [command.name, command.description, ...command.keywords]
            return searchTerms.some(term => 
                term.toLowerCase().includes(query.toLowerCase())
            )
        })

    const handleSelect = useCallback((command: CommandItem) => {
        navigate(command.href)
        onClose()
        setQuery('')
        setSelectedIndex(0)
    }, [navigate, onClose])

    useEffect(() => {
        if (isOpen) {
            inputRef.current?.focus()
            setQuery('')
            setSelectedIndex(0)
        }
    }, [isOpen])

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if (!isOpen) return

            switch (e.key) {
                case 'ArrowDown':
                    e.preventDefault()
                    setSelectedIndex(prev => 
                        prev < filteredCommands.length - 1 ? prev + 1 : 0
                    )
                    break
                case 'ArrowUp':
                    e.preventDefault()
                    setSelectedIndex(prev => 
                        prev > 0 ? prev - 1 : filteredCommands.length - 1
                    )
                    break
                case 'Enter':
                    e.preventDefault()
                    if (filteredCommands[selectedIndex]) {
                        handleSelect(filteredCommands[selectedIndex])
                    }
                    break
                case 'Escape':
                    e.preventDefault()
                    onClose()
                    break
            }
        }

        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [isOpen, filteredCommands, selectedIndex, handleSelect, onClose])

    useEffect(() => {
        setSelectedIndex(0)
    }, [query])

    return (
        <AnimatePresence>
            {isOpen && (
                <>
                    <motion.div
                        initial={{ opacity: 0 }}
                        animate={{ opacity: 1 }}
                        exit={{ opacity: 0 }}
                        transition={{ duration: 0.15 }}
                        className="fixed inset-0 bg-background/60 backdrop-blur-sm z-50"
                        onClick={onClose}
                    />
                    <div className="fixed inset-0 z-50 flex items-start justify-center pt-[20vh] px-4">
                        <motion.div
                            initial={{ opacity: 0, scale: 0.95, y: -20 }}
                            animate={{ opacity: 1, scale: 1, y: 0 }}
                            exit={{ opacity: 0, scale: 0.95, y: -20 }}
                            transition={{ duration: 0.15 }}
                            className="w-full max-w-lg glass-card overflow-hidden"
                        >
                            <div className="flex items-center gap-3 px-4 border-b border-border/30">
                                <FontAwesomeIcon icon={faSearch} className="w-4 h-4 text-muted-foreground" />
                                <input
                                    ref={inputRef}
                                    type="text"
                                    value={query}
                                    onChange={(e) => setQuery(e.target.value)}
                                    placeholder="Search for pages..."
                                    className="flex-1 h-14 bg-transparent text-foreground placeholder:text-muted-foreground/50 text-sm focus:outline-none"
                                />
                                <div className="flex items-center gap-1 text-[10px] text-muted-foreground/50 font-mono">
                                    <kbd className="px-1.5 py-0.5 rounded bg-secondary/50 border border-border/30">esc</kbd>
                                </div>
                            </div>

                            <div className="max-h-[300px] overflow-y-auto p-2">
                                {filteredCommands.length === 0 ? (
                                    <div className="py-8 text-center">
                                        <p className="text-sm text-muted-foreground">No results found</p>
                                    </div>
                                ) : (
                                    <div className="space-y-1">
                                        {filteredCommands.map((command, index) => (
                                            <button
                                                key={command.id}
                                                onClick={() => handleSelect(command)}
                                                className={`w-full flex items-center gap-3 px-3 py-3 rounded-xl text-left transition-all duration-150 ${
                                                    index === selectedIndex
                                                        ? 'bg-primary/10 text-foreground'
                                                        : 'hover:bg-secondary/50 text-muted-foreground hover:text-foreground'
                                                }`}
                                            >
                                                <div className={`p-2 rounded-lg transition-colors ${
                                                    index === selectedIndex
                                                        ? 'bg-primary/20 text-primary'
                                                        : 'bg-secondary/50 text-muted-foreground'
                                                }`}>
                                                    <FontAwesomeIcon icon={command.icon} className="w-4 h-4" />
                                                </div>
                                                <div className="flex-1 min-w-0">
                                                    <p className="text-sm font-medium truncate">{command.name}</p>
                                                    <p className="text-xs text-muted-foreground truncate">{command.description}</p>
                                                </div>
                                                {index === selectedIndex && (
                                                    <FontAwesomeIcon icon={faArrowRight} className="w-3 h-3 text-primary" />
                                                )}
                                            </button>
                                        ))}
                                    </div>
                                )}
                            </div>

                            <div className="px-4 py-3 border-t border-border/30 flex items-center justify-between text-[11px] text-muted-foreground/50">
                                <div className="flex items-center gap-3">
                                    <span className="flex items-center gap-1">
                                        <kbd className="px-1.5 py-0.5 rounded bg-secondary/50 border border-border/30 font-mono">↑</kbd>
                                        <kbd className="px-1.5 py-0.5 rounded bg-secondary/50 border border-border/30 font-mono">↓</kbd>
                                        to navigate
                                    </span>
                                    <span className="flex items-center gap-1">
                                        <kbd className="px-1.5 py-0.5 rounded bg-secondary/50 border border-border/30 font-mono">↵</kbd>
                                        to select
                                    </span>
                                </div>
                                <span className="flex items-center gap-1">
                                    <FontAwesomeIcon icon={faKeyboard} className="w-3 h-3" />
                                    Quick navigation
                                </span>
                            </div>
                        </motion.div>
                    </div>
                </>
            )}
        </AnimatePresence>
    )
}

export function useCommandPalette() {
    const [isOpen, setIsOpen] = useState(false)

    useEffect(() => {
        const handleKeyDown = (e: KeyboardEvent) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
                e.preventDefault()
                setIsOpen(prev => !prev)
            }
        }

        window.addEventListener('keydown', handleKeyDown)
        return () => window.removeEventListener('keydown', handleKeyDown)
    }, [])

    return {
        isOpen,
        open: () => setIsOpen(true),
        close: () => setIsOpen(false),
        toggle: () => setIsOpen(prev => !prev),
    }
}

export default CommandPalette

