import { Dispatch, SetStateAction, useEffect, useState } from 'react'
import type { TicketFilters as ITicketFilters } from '../../../types/ticket'
import { ticketService } from '../../../services/ticketService'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faFilter } from '@fortawesome/free-solid-svg-icons'
import { motion } from 'framer-motion'

interface TicketFiltersProps {
    filters: ITicketFilters
    setFilters: Dispatch<SetStateAction<ITicketFilters>>
}

interface FilterOptions {
    types: Array<{ id: string, name: string }>
    priorities: string[]
    statuses: string[]
}

export default function TicketFilters({ filters, setFilters }: TicketFiltersProps) {
    const [options, setOptions] = useState<FilterOptions | null>(null)

    useEffect(() => {
        async function fetchFilterOptions() {
            try {
                const filterOptions = await ticketService.getFilterOptions()
                setOptions(filterOptions)
            } catch (error) {
                console.error('Failed to fetch filter options:', error)
            }
        }

        fetchFilterOptions()
    }, [])

    if (!options) return null

    return (
        <motion.div 
            initial={{ opacity: 0, y: -10 }}
            animate={{ opacity: 1, y: 0 }}
            className="mb-5"
        >
            <div className="flex items-center gap-2 mb-3">
                <div className="p-1.5 rounded-lg bg-primary/10">
                    <FontAwesomeIcon icon={faFilter} className="w-3 h-3 text-primary" />
                </div>
                <span className="text-xs font-medium text-muted-foreground uppercase tracking-wider">Filters</span>
            </div>
            
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
                <div className="relative">
                    <select
                        value={filters.status}
                        onChange={(e) => setFilters(prev => ({ ...prev, status: e.target.value }))}
                        className="w-full h-10 rounded-xl text-sm glass-input appearance-none pl-4 pr-10 cursor-pointer"
                    >
                        <option value="all">All Status</option>
                        {options.statuses.map(status => (
                            <option key={status} value={status}>
                                {status.charAt(0).toUpperCase() + status.slice(1)}
                            </option>
                        ))}
                    </select>
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                        <svg className="w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                    </div>
                </div>

                <div className="relative">
                    <select
                        value={filters.priority}
                        onChange={(e) => setFilters(prev => ({ ...prev, priority: e.target.value }))}
                        className="w-full h-10 rounded-xl text-sm glass-input appearance-none pl-4 pr-10 cursor-pointer"
                    >
                        <option value="all">All Priorities</option>
                        {options.priorities.map(priority => (
                            <option key={priority} value={priority}>{priority}</option>
                        ))}
                    </select>
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                        <svg className="w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                    </div>
                </div>

                <div className="relative">
                    <select
                        value={filters.type}
                        onChange={(e) => setFilters(prev => ({ ...prev, type: e.target.value }))}
                        className="w-full h-10 rounded-xl text-sm glass-input appearance-none pl-4 pr-10 cursor-pointer"
                    >
                        <option value="all">All Types</option>
                        {options.types.map(type => (
                            <option key={type.id} value={type.id}>{type.name}</option>
                        ))}
                    </select>
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                        <svg className="w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                    </div>
                </div>

                <div className="relative">
                    <select
                        value={filters.sortBy}
                        onChange={(e) => setFilters(prev => ({ ...prev, sortBy: e.target.value }))}
                        className="w-full h-10 rounded-xl text-sm glass-input appearance-none pl-4 pr-10 cursor-pointer"
                    >
                        <option value="newest">Newest First</option>
                        <option value="oldest">Oldest First</option>
                        <option value="priority">Priority</option>
                    </select>
                    <div className="absolute right-3 top-1/2 -translate-y-1/2 pointer-events-none">
                        <svg className="w-4 h-4 text-muted-foreground" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
                        </svg>
                    </div>
                </div>
            </div>
        </motion.div>
    )
}
