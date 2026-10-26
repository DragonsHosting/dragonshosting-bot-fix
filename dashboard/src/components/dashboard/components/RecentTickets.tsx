import { Link } from 'react-router-dom'
import { useState, useEffect } from 'react'
import { userDataService } from '../../../utils/userDataService'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faFileAlt, faTicket, faArrowRight, faInbox } from '@fortawesome/free-solid-svg-icons'
import { motion } from 'framer-motion'
import moment from 'moment-timezone'

interface UserDisplayData {
    avatar: string
    displayName: string
}

interface RecentTicketsProps {
    tickets: Array<{
        id: string | number
        typeName?: string
        type: string
        status: string
        priority: string
        date: string
        creator: string
        createdAt?: string
    }>
}

const formatDateTime = (timestamp: string | undefined | null): string => {
    if (!timestamp) return 'Unknown';
    
    const isoDate = moment(timestamp);
    if (isoDate.isValid()) {
        return isoDate.tz(window.DASHBOARD_CONFIG?.TIMEZONE || 'UTC').format('MMM D, h:mm A');
    }
    
    const date = moment(timestamp, ['MMM D, YYYY, hh:mm A z', 'MMM D, YYYY, HH:mm z']);
    if (date.isValid()) {
        return date.tz(window.DASHBOARD_CONFIG?.TIMEZONE || 'UTC').format('MMM D, h:mm A');
    }
    
    return timestamp;
};

export default function RecentTickets({ tickets = [] }: RecentTicketsProps) {
    const [userDisplayData, setUserDisplayData] = useState<Record<string, UserDisplayData>>({})
    const [isLoading, setIsLoading] = useState(true)

    useEffect(() => {
        const loadUserData = async () => {
            if (!tickets.length) {
                setIsLoading(false)
                return
            }

            setIsLoading(true)
            const uniqueCreators = Array.from(new Set(tickets.map(ticket => ticket.creator)))

            const initialData: Record<string, UserDisplayData> = {}
            for (const creator of uniqueCreators) {
                const data = await userDataService.getUserData(creator)
                initialData[creator] = {
                    avatar: data.avatar,
                    displayName: data.displayName
                }
            }
            setUserDisplayData(initialData)
            setIsLoading(false)

            userDataService.prefetchUsers(uniqueCreators)
        }

        loadUserData()

        const handleUserUpdate = (event: CustomEvent<{ userId: string; userData: { avatar: string; displayName: string } }>) => {
            const { userId, userData } = event.detail
            setUserDisplayData(prev => ({
                ...prev,
                [userId]: {
                    avatar: userData.avatar,
                    displayName: userData.displayName
                }
            }))
        }

        window.addEventListener('userDataUpdated', handleUserUpdate as EventListener)
        return () => {
            window.removeEventListener('userDataUpdated', handleUserUpdate as EventListener)
        }
    }, [tickets])

    const getNumericId = (id: string | number) => {
        if (typeof id === 'number') return id;
        if (typeof id === 'string') {
            const match = id.match(/\d+/);
            if (match) return match[0];
        }
        return id;
    };

    const statusConfig: Record<string, { bg: string; text: string; glow: string }> = {
        open: { bg: 'bg-emerald-500/15', text: 'text-emerald-400', glow: 'shadow-[0_0_8px_-2px_rgba(16,185,129,0.5)]' },
        closed: { bg: 'bg-zinc-500/15', text: 'text-zinc-400', glow: '' },
        pending: { bg: 'bg-amber-500/15', text: 'text-amber-400', glow: 'shadow-[0_0_8px_-2px_rgba(245,158,11,0.5)]' }
    };

    const priorityConfig: Record<string, { bg: string; text: string }> = {
        high: { bg: 'bg-red-500/15', text: 'text-red-400' },
        medium: { bg: 'bg-amber-500/15', text: 'text-amber-400' },
        low: { bg: 'bg-sky-500/15', text: 'text-sky-400' }
    };

    return (
        <motion.div 
            initial={{ opacity: 0, y: 20 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.3 }}
            className="glass-card overflow-hidden"
        >
            <div className="flex items-center justify-between px-5 py-4 border-b border-border/30">
                <div className="flex items-center gap-3">
                    <div className="p-2.5 rounded-xl bg-gradient-to-br from-primary to-primary/60 shadow-glow-sm">
                        <FontAwesomeIcon icon={faTicket} className="w-4 h-4 text-white" />
                    </div>
                    <h3 className="text-sm font-semibold text-foreground">Recent Tickets</h3>
                </div>
                <Link
                    to="/tickets"
                    className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium text-muted-foreground hover:text-foreground glass-button rounded-lg transition-all duration-200"
                >
                    View All
                    <FontAwesomeIcon icon={faArrowRight} className="w-3 h-3" />
                </Link>
            </div>

            {isLoading ? (
                <div className="flex flex-col items-center justify-center py-16">
                    <div className="w-8 h-8 rounded-full border-2 border-primary border-t-transparent animate-spin shadow-glow"></div>
                </div>
            ) : tickets.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-16 px-6">
                    <div className="w-14 h-14 rounded-2xl glass-subtle flex items-center justify-center mb-4">
                        <FontAwesomeIcon icon={faInbox} className="w-6 h-6 text-muted-foreground" />
                    </div>
                    <p className="text-sm font-medium text-foreground mb-1">No recent tickets</p>
                    <p className="text-xs text-muted-foreground">Tickets will appear here once created</p>
                </div>
            ) : (
                <div className="overflow-x-auto">
                    <table className="w-full">
                        <thead>
                            <tr className="border-b border-border/30">
                                <th className="px-5 py-3 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">ID</th>
                                <th className="px-5 py-3 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Type</th>
                                <th className="px-5 py-3 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Created By</th>
                                <th className="px-5 py-3 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Status</th>
                                <th className="px-5 py-3 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Priority</th>
                                <th className="px-5 py-3 text-left text-[11px] font-semibold text-muted-foreground uppercase tracking-wider">Created</th>
                                <th className="px-5 py-3"></th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border/20">
                            {tickets.map((ticket, index) => {
                                const numericId = getNumericId(ticket.id);
                                const userData = userDisplayData[ticket.creator] || userDataService.getDefaultUserData(ticket.creator);
                                const status = statusConfig[ticket.status] || statusConfig.pending;
                                const priority = priorityConfig[ticket.priority] || priorityConfig.low;
                                
                                return (
                                    <motion.tr 
                                        key={ticket.id} 
                                        initial={{ opacity: 0, x: -10 }}
                                        animate={{ opacity: 1, x: 0 }}
                                        transition={{ delay: index * 0.05 }}
                                        className="hover:bg-secondary/20 transition-all duration-200 group"
                                    >
                                        <td className="px-5 py-4">
                                            <Link
                                                to={`/tickets/${numericId}/transcript`}
                                                className="text-sm font-semibold text-primary hover:text-primary/80 transition-colors font-mono"
                                            >
                                                #{numericId}
                                            </Link>
                                        </td>
                                        <td className="px-5 py-4">
                                            <span className="text-sm text-foreground">
                                                {ticket.typeName || ticket.type}
                                            </span>
                                        </td>
                                        <td className="px-5 py-4">
                                            <div className="flex items-center gap-3">
                                                <img
                                                    src={userData.avatar}
                                                    alt=""
                                                    className="w-7 h-7 rounded-lg object-cover ring-2 ring-border/30"
                                                />
                                                <span className="text-sm text-foreground">
                                                    {userData.displayName}
                                                </span>
                                            </div>
                                        </td>
                                        <td className="px-5 py-4">
                                            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-medium ${status.bg} ${status.text} ${status.glow}`}>
                                                {ticket.status.charAt(0).toUpperCase() + ticket.status.slice(1)}
                                            </span>
                                        </td>
                                        <td className="px-5 py-4">
                                            <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-[11px] font-medium ${priority.bg} ${priority.text}`}>
                                                {ticket.priority.charAt(0).toUpperCase() + ticket.priority.slice(1)}
                                            </span>
                                        </td>
                                        <td className="px-5 py-4">
                                            <span className="text-sm text-muted-foreground font-mono">
                                                {ticket.createdAt ? formatDateTime(ticket.createdAt) : ticket.date}
                                            </span>
                                        </td>
                                        <td className="px-5 py-4">
                                            <Link
                                                to={`/tickets/${numericId}/transcript`}
                                                className="inline-flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg glass-button text-foreground opacity-0 group-hover:opacity-100 transition-all duration-200"
                                            >
                                                <FontAwesomeIcon icon={faFileAlt} className="w-3 h-3" />
                                                View
                                            </Link>
                                        </td>
                                    </motion.tr>
                                );
                            })}
                        </tbody>
                    </table>
                </div>
            )}
        </motion.div>
    )
}
