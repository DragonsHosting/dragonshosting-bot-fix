import React, { useState, useEffect, Fragment } from 'react'
import { useSearchParams } from 'react-router-dom'
import { motion, AnimatePresence } from 'framer-motion'
import LoadingSpinner from '../../../components/ui/LoadingSpinner'
import TicketList from './TicketList'
import TicketStats from './TicketStats'
import TicketFilters from './TicketFilters'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faSearch, faSpinner, faChevronLeft, faChevronRight } from '@fortawesome/free-solid-svg-icons'
import { Ticket, TicketStats as ITicketStats, TicketFilters as ITicketFilters, TicketPagination } from '../../../types/ticket'
import { ticketService } from '../../../services/ticketService'

export default function TicketsContent() {
    const [searchParams] = useSearchParams();
    const [loading, setLoading] = useState(true)
    const [pageLoading, setPageLoading] = useState(false)
    const [tickets, setTickets] = useState<Ticket[]>([])
    const [stats, setStats] = useState<ITicketStats>({
        totalTickets: 0,
        openTickets: 0,
        avgResponseTime: 0,
        satisfactionRate: 0,
        weeklyChanges: {
            totalTickets: 0,
            openTickets: 0,
            avgResponseTime: 0,
            satisfactionRate: 0
        }
    })
    const [pagination, setPagination] = useState<TicketPagination>({
        currentPage: 1,
        totalPages: 1,
        totalItems: 0
    })
    const [filters, setFilters] = useState<ITicketFilters>({
        status: searchParams.get('status') || 'all',
        priority: searchParams.get('priority') || 'all',
        type: searchParams.get('type') || 'all',
        search: searchParams.get('search') || '',
        sortBy: searchParams.get('sortBy') || 'newest'
    })

    useEffect(() => {
        setFilters({
            status: searchParams.get('status') || 'all',
            priority: searchParams.get('priority') || 'all',
            type: searchParams.get('type') || 'all',
            search: searchParams.get('search') || '',
            sortBy: searchParams.get('sortBy') || 'newest'
        });
    }, [searchParams]);

    useEffect(() => {
        fetchTickets(1)
    }, [filters])

    async function fetchTickets(page: number) {
        if (pageLoading) return;

        try {
            setPageLoading(true)
            setPagination(prev => ({ ...prev, currentPage: page }))

            const data = await ticketService.getTickets(filters, page)
            if (data.tickets) {
                setTickets(data.tickets)
                setPagination({
                    currentPage: data.pagination.page,
                    totalPages: data.pagination.pages,
                    totalItems: data.pagination.total
                })

                const totalTickets = data.stats?.totalTickets ?? data.pagination.total ?? 0
                const openTickets = data.stats?.openTickets ?? data.tickets.filter(t => t.status === 'open').length ?? 0

                setStats({
                    totalTickets: Number(totalTickets),
                    openTickets: Number(openTickets),
                    avgResponseTime: Number(data.stats?.avgResponseTime ?? 0),
                    satisfactionRate: data.stats?.satisfactionRate ?? 0,
                    weeklyChanges: data.stats?.weeklyChanges || {
                        totalTickets: 0,
                        openTickets: 0,
                        avgResponseTime: 0,
                        satisfactionRate: 0
                    }
                })
            }
        } catch (error) {
            console.error('Failed to fetch tickets:', error)
        } finally {
            setPageLoading(false)
            setLoading(false)
        }
    }

    if (loading) {
        return <LoadingSpinner />
    }

    return (
        <div className="space-y-6 min-w-0 px-4 lg:px-6">
            <TicketStats
                tickets={tickets}
                totalTickets={stats.totalTickets}
                openTickets={stats.openTickets}
                avgResponseTime={stats.avgResponseTime}
                satisfactionRate={stats.satisfactionRate}
                weeklyChanges={stats.weeklyChanges}
            />

            <motion.div 
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="glass-card p-6"
            >
                <TicketFilters filters={filters} setFilters={setFilters} />

                <div className="relative">
                    <AnimatePresence>
                        {pageLoading && (
                            <motion.div 
                                initial={{ opacity: 0 }}
                                animate={{ opacity: 1 }}
                                exit={{ opacity: 0 }}
                                className="absolute inset-0 glass-subtle flex items-center justify-center rounded-xl z-10"
                            >
                                <div className="flex items-center gap-3">
                                    <FontAwesomeIcon icon={faSpinner} className="w-5 h-5 text-primary animate-spin" />
                                    <span className="text-sm text-muted-foreground">Loading...</span>
                                </div>
                            </motion.div>
                        )}
                    </AnimatePresence>
                    
                    <div className="w-full">
                        <div className="mb-5 relative">
                            <div className="absolute inset-y-0 left-4 flex items-center pointer-events-none">
                                <FontAwesomeIcon icon={faSearch} className="h-4 w-4 text-muted-foreground/50" />
                            </div>
                            <input
                                type="text"
                                placeholder="Search by display name, Discord username, ticket content, or channel..."
                                value={filters.search}
                                onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
                                className="w-full h-11 rounded-xl text-sm glass-input pl-11 pr-4"
                            />
                        </div>
                        <TicketList tickets={tickets} />
                        <div className="mt-3 text-center md:hidden">
                            <span className="text-xs text-muted-foreground/60">Swipe sideways to see more →</span>
                        </div>
                    </div>
                </div>

                <div className="mt-6 pt-5 border-t border-border/30 flex flex-col sm:flex-row justify-between items-center gap-4">
                    <div className="text-sm text-muted-foreground w-full sm:w-auto text-center sm:text-left font-medium">
                        Showing <span className="text-foreground">{tickets.length}</span> of <span className="text-foreground">{pagination.totalItems}</span> tickets
                    </div>
                    <div className="flex flex-wrap justify-center sm:justify-end gap-2">
                        <button
                            onClick={() => !pageLoading && fetchTickets(pagination.currentPage - 1)}
                            disabled={pagination.currentPage === 1 || pageLoading}
                            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 
                                ${pagination.currentPage === 1 || pageLoading
                                    ? 'glass-subtle text-muted-foreground/50 cursor-not-allowed'
                                    : 'glass-button text-foreground'}`}
                        >
                            <FontAwesomeIcon icon={faChevronLeft} className="w-3 h-3" />
                            Previous
                        </button>
                        <div className="flex flex-wrap justify-center gap-1.5">
                            {Array.from({ length: pagination.totalPages }, (_, i) => i + 1)
                                .filter(page => {
                                    const current = pagination.currentPage;
                                    return page === 1 ||
                                        page === pagination.totalPages ||
                                        (page >= current - 1 && page <= current + 1);
                                })
                                .map((page, index, array) => (
                                    <Fragment key={page}>
                                        {index > 0 && array[index - 1] !== page - 1 && (
                                            <span className="text-muted-foreground/50 px-1 flex items-center">...</span>
                                        )}
                                        <button
                                            onClick={() => !pageLoading && fetchTickets(page)}
                                            disabled={pageLoading}
                                            className={`w-10 h-10 rounded-xl text-sm font-medium transition-all duration-200 
                                                ${pagination.currentPage === page
                                                    ? 'glass-button-primary shadow-glow-sm'
                                                    : pageLoading
                                                        ? 'glass-subtle text-muted-foreground/50 cursor-not-allowed'
                                                        : 'glass-button text-foreground'}`}
                                        >
                                            {page}
                                        </button>
                                    </Fragment>
                                ))}
                        </div>
                        <button
                            onClick={() => !pageLoading && fetchTickets(pagination.currentPage + 1)}
                            disabled={pagination.currentPage === pagination.totalPages || pageLoading}
                            className={`flex items-center gap-2 px-4 py-2 rounded-xl text-sm font-medium transition-all duration-200 
                                ${pagination.currentPage === pagination.totalPages || pageLoading
                                    ? 'glass-subtle text-muted-foreground/50 cursor-not-allowed'
                                    : 'glass-button text-foreground'}`}
                        >
                            Next
                            <FontAwesomeIcon icon={faChevronRight} className="w-3 h-3" />
                        </button>
                    </div>
                </div>
            </motion.div>
        </div>
    )
}
