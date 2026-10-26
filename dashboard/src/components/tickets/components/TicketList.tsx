import { motion } from 'framer-motion'
import { Link } from 'react-router-dom'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { faFileAlt, faLock, faHandHolding, faSort, faInbox } from '@fortawesome/free-solid-svg-icons'
import { userDataService } from '../../../utils/userDataService'
import { useEffect, useState } from 'react'
import moment from 'moment-timezone'
import TicketSortModal from './TicketSortModal'

const getCsrfToken = (): string | null => {
    const match = document.cookie.match(/XSRF-TOKEN=([^;]+)/);
    return match ? decodeURIComponent(match[1]) : null;
};

declare global {
    interface Window {
        USER_DATA?: {
            id: string;
        };
    }
}

interface Ticket {
    id: string | number;
    typeName?: string;
    type: string;
    status: string;
    priority: string;
    creator: string;
    assignee: string | null;
    createdAt: string;
    claimed?: boolean;
    claimedBy?: string | null;
}

const formatDateTime = (timestamp: string | undefined | null): string => {
    if (!timestamp) return 'Unknown Date';
    
    const formats = [
        moment.ISO_8601,
        'MMM D, YYYY, hh:mm A z',
        'MMM D, YYYY, HH:mm z',
        'MMM D, YYYY, h:mm A z',
        'YYYY-MM-DDTHH:mm:ss.SSSZ',
        'YYYY-MM-DD HH:mm:ss'
    ];
    
    const date = moment(timestamp, formats, true);
    if (date.isValid()) {
        return date.tz(window.DASHBOARD_CONFIG.TIMEZONE).format('MMM D, YYYY [at] h:mm A z');
    }
    
    return timestamp;
};

interface CachedUserData {
    avatar: string;
    displayName: string;
}

interface UserDisplayData {
    avatar: string;
    displayName: string;
    isLoading?: boolean;
}

interface TicketListProps {
    tickets: Ticket[]
}

interface SortField {
    status: string;
    order: number;
}

export default function TicketList({ tickets: initialTickets = [] }: TicketListProps) {
    const [tickets, setTickets] = useState<Ticket[]>(initialTickets);
    const [userDisplayData, setUserDisplayData] = useState<Record<string, UserDisplayData>>({});
    const [loading, setLoading] = useState<Record<string, boolean>>({});
    const [supportPermissions, setSupportPermissions] = useState<Record<string, boolean>>({});
    const [isLoadingPermissions, setIsLoadingPermissions] = useState(true);
    const [isSortModalOpen, setIsSortModalOpen] = useState(false);
    const [statusOrder, setStatusOrder] = useState<SortField[]>([
        { status: 'open', order: 1 },
        { status: 'closed', order: 2 },
        { status: 'deleted', order: 3 }
    ]);

    useEffect(() => {
        setTickets(initialTickets);
        
        const loadPermissions = async () => {
            setIsLoadingPermissions(true);
            const uniqueTypes = Array.from(new Set(initialTickets.map(ticket => ticket.type)));
            const permissions: Record<string, boolean> = {};

            try {
                const permissionPromises = uniqueTypes.map(async (type) => {
                    try {
                        const response = await fetch(`/api/tickets/permissions/${type}`);
                        if (response.ok) {
                            const { hasSupport } = await response.json();
                            permissions[type] = hasSupport;
                        }
                    } catch (error) {
                        console.error(`Error checking permissions for type ${type}:`, error);
                        permissions[type] = false;
                    }
                });

                await Promise.all(permissionPromises);
                setSupportPermissions(permissions);
            } catch (error) {
                console.error('Error checking support permissions:', error);
            } finally {
                setIsLoadingPermissions(false);
            }
        };

        loadPermissions();
    }, [initialTickets]);

    useEffect(() => {
        const loadUserData = async () => {
            if (!tickets.length) return;

            const uniqueUsers = Array.from(new Set([
                ...tickets.map(ticket => ticket.creator),
                ...tickets.map(ticket => ticket.assignee).filter((assignee): assignee is string => assignee !== null)
            ]));

            const userDataPromises = uniqueUsers.map(async (userId) => {
                const data = await userDataService.getUserData(userId);
                return [userId, data] as const;
            });

            const userData = await Promise.all(userDataPromises);
            const initialData: Record<string, UserDisplayData> = Object.fromEntries(
                userData.map(([userId, data]) => [
                    userId,
                    {
                        avatar: data.avatar,
                        displayName: data.displayName
                    }
                ])
            );

            setUserDisplayData(initialData);
            userDataService.prefetchUsers(uniqueUsers);
        };

        loadUserData();

        const handleUserUpdate = (event: CustomEvent<{ userId: string; userData: CachedUserData }>) => {
            const { userId, userData } = event.detail;
            setUserDisplayData(prev => ({
                ...prev,
                [userId]: {
                    avatar: userData.avatar,
                    displayName: userData.displayName
                }
            }));
        };

        window.addEventListener('userDataUpdated', handleUserUpdate as EventListener);
        return () => {
            window.removeEventListener('userDataUpdated', handleUserUpdate as EventListener);
        };
    }, [tickets]);

    useEffect(() => {
        loadUserSortPreferences();
    }, []);

    const loadUserSortPreferences = async () => {
        try {
            const response = await fetch('/api/user/settings');
            if (response.ok) {
                const { ticketPreferences } = await response.json();
                if (ticketPreferences?.statusOrder) {
                    setStatusOrder(ticketPreferences.statusOrder);
                    applySort(initialTickets, ticketPreferences.statusOrder);
                }
            }
        } catch (error) {
            console.error('Error loading user preferences:', error);
        }
    };

    const saveUserSortPreferences = async (newStatusOrder: SortField[]) => {
        try {
            await fetch('/api/user/settings', {
                method: 'PATCH',
                headers: {
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    ticketPreferences: {
                        statusOrder: newStatusOrder
                    }
                })
            });
        } catch (error) {
            console.error('Error saving user preferences:', error);
        }
    };

    const applySort = (ticketsToSort: Ticket[], order: SortField[]) => {
        const statusOrderMap = new Map(order.map(item => [item.status, item.order]));
        
        const sortedTickets = [...ticketsToSort].sort((a, b) => {
            const orderA = statusOrderMap.get(a.status) || 999;
            const orderB = statusOrderMap.get(b.status) || 999;
            return orderA - orderB;
        });

        setTickets(sortedTickets);
    };

    const handleSortSave = async (newStatusOrder: SortField[]) => {
        setStatusOrder(newStatusOrder);
        applySort(tickets, newStatusOrder);
        await saveUserSortPreferences(newStatusOrder);
    };

    const handleClaimTicket = async (ticketId: string | number) => {
        try {
            setLoading(prev => ({ ...prev, [`claim-${ticketId}`]: true }));
            const csrfToken = getCsrfToken();
            const response = await fetch(`/api/tickets/claim/${ticketId}`, {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                    ...(csrfToken && { 'X-XSRF-TOKEN': csrfToken }),
                }
            });

            if (!response.ok) {
                const error = await response.json();
                throw new Error(error.error || 'Failed to claim ticket');
            }

            const result = await response.json();

            setTickets(prevTickets => 
                prevTickets.map(ticket => 
                    ticket.id === ticketId
                        ? {
                            ...ticket,
                            claimed: result.ticket.claimed,
                            claimedBy: result.ticket.claimedBy,
                            assignee: result.ticket.assignee
                        }
                        : ticket
                )
            );

            if (result.ticket.claimedBy && !userDisplayData[result.ticket.claimedBy]) {
                const userData = await userDataService.getUserData(result.ticket.claimedBy);
                setUserDisplayData(prev => ({
                    ...prev,
                    [result.ticket.claimedBy]: {
                        avatar: userData.avatar,
                        displayName: userData.displayName
                    }
                }));
            }
        } catch (error) {
            console.error('Error claiming ticket:', error);
            alert(error instanceof Error ? error.message : 'Failed to claim ticket');
        } finally {
            setLoading(prev => ({ ...prev, [`claim-${ticketId}`]: false }));
        }
    };

    const handleCloseTicket = async (ticketId: string | number) => {
        try {
            const reason = prompt('Enter a reason for closing the ticket (optional):');
            if (reason !== null) {
                setLoading(prev => ({ ...prev, [`close-${ticketId}`]: true }));

                alert('The ticket will now be closed.');

                setTickets(prevTickets => 
                    prevTickets.map(ticket => 
                        ticket.id === ticketId
                            ? { ...ticket, status: 'closing' }
                            : ticket
                    )
                );

                const csrfToken = getCsrfToken();
                const response = await fetch(`/api/tickets/close/${ticketId}`, {
                    method: 'POST',
                    credentials: 'include',
                    headers: {
                        'Content-Type': 'application/json',
                        ...(csrfToken && { 'X-XSRF-TOKEN': csrfToken }),
                    },
                    body: JSON.stringify({ reason })
                });

                if (!response.ok) {
                    const error = await response.json();
                    throw new Error(error.error || 'Failed to close ticket');
                }

                setTickets(prevTickets => 
                    prevTickets.map(ticket => 
                        ticket.id === ticketId
                            ? { 
                                ...ticket, 
                                status: 'closed',
                                statusStyle: 'bg-red-500/15 text-red-300 border border-red-500/30'
                            }
                            : ticket
                    )
                );
            }
        } catch (error) {
            console.error('Error closing ticket:', error);
            alert(error instanceof Error ? error.message : 'Failed to close ticket');
            
            setTickets(prevTickets => 
                prevTickets.map(ticket => 
                    ticket.id === ticketId
                        ? { 
                            ...ticket, 
                            status: 'open',
                            statusStyle: 'bg-green-500/15 text-green-300 border border-green-500/30'
                        }
                        : ticket
                )
            );
        } finally {
            setLoading(prev => ({ ...prev, [`close-${ticketId}`]: false }));
        }
    };

    if (!tickets?.length) {
        return (
            <div className="flex flex-col items-center justify-center py-16 px-6">
                <div className="w-14 h-14 rounded-2xl glass-subtle flex items-center justify-center mb-4">
                    <FontAwesomeIcon icon={faInbox} className="w-6 h-6 text-muted-foreground" />
                </div>
                <p className="text-sm font-medium text-foreground mb-1">No tickets found</p>
                <p className="text-xs text-muted-foreground">Try adjusting your filters</p>
            </div>
        );
    }

    const getNumericId = (id: string | number) => {
        if (typeof id === 'number') return id;
        return id.toString().replace('#', '');
    };

    if (isLoadingPermissions) {
        return (
            <div className="overflow-x-auto glass-subtle rounded-xl">
                <div className="min-w-[800px]">
                    <table className="w-full divide-y divide-border/30 table-fixed lg:table-auto">
                        <thead>
                            <tr className="glass-subtle">
                                <th scope="col" className="px-2 sm:px-4 lg:px-6 py-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider w-[8%]">ID</th>
                                <th scope="col" className="px-2 sm:px-4 lg:px-6 py-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider w-[12%]">Type</th>
                                <th scope="col" className="px-2 sm:px-4 lg:px-6 py-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider w-[15%]">Created By</th>
                                <th scope="col" className="px-2 sm:px-4 lg:px-6 py-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider w-[10%]">Status</th>
                                <th scope="col" className="px-2 sm:px-4 lg:px-6 py-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider w-[10%]">Priority</th>
                                <th scope="col" className="hidden md:table-cell px-2 sm:px-4 lg:px-6 py-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider w-[12%]">Created</th>
                                <th scope="col" className="hidden md:table-cell px-2 sm:px-4 lg:px-6 py-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider w-[15%]">Claimed By</th>
                                <th scope="col" className="px-2 sm:px-4 lg:px-6 py-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider w-[23%] sm:w-[20%]">
                                    <span className="sr-only">Actions</span>
                                </th>
                            </tr>
                        </thead>
                        <tbody className="divide-y divide-border/20">
                            {[...Array(5)].map((_, i) => (
                                <tr key={i} className="animate-pulse">
                                    <td className="px-2 sm:px-4 lg:px-6 py-4 whitespace-nowrap">
                                        <div className="h-4 w-10 bg-secondary/50 rounded-lg"></div>
                                    </td>
                                    <td className="px-2 sm:px-4 lg:px-6 py-4 whitespace-nowrap">
                                        <div className="h-6 w-16 sm:w-24 bg-secondary/50 rounded-lg"></div>
                                    </td>
                                    <td className="px-2 sm:px-4 lg:px-6 py-4 whitespace-nowrap">
                                        <div className="flex items-center gap-2 sm:gap-3">
                                            <div className="w-7 h-7 rounded-lg bg-secondary/50"></div>
                                            <div className="h-4 w-16 sm:w-24 bg-secondary/50 rounded-lg"></div>
                                        </div>
                                    </td>
                                    <td className="px-2 sm:px-4 lg:px-6 py-4 whitespace-nowrap">
                                        <div className="h-6 w-12 sm:w-16 bg-secondary/50 rounded-full"></div>
                                    </td>
                                    <td className="px-2 sm:px-4 lg:px-6 py-4 whitespace-nowrap">
                                        <div className="h-6 w-12 sm:w-16 bg-secondary/50 rounded-full"></div>
                                    </td>
                                    <td className="hidden md:table-cell px-2 sm:px-4 lg:px-6 py-4 whitespace-nowrap">
                                        <div className="h-4 w-16 sm:w-32 bg-secondary/50 rounded-lg"></div>
                                    </td>
                                    <td className="hidden md:table-cell px-2 sm:px-4 lg:px-6 py-4 whitespace-nowrap">
                                        <div className="flex items-center gap-2 sm:gap-3">
                                            <div className="w-7 h-7 rounded-lg bg-secondary/50"></div>
                                            <div className="h-4 w-16 sm:w-24 bg-secondary/50 rounded-lg"></div>
                                        </div>
                                    </td>
                                    <td className="px-2 sm:px-4 lg:px-6 py-4">
                                        <div className="flex flex-wrap items-center justify-end sm:justify-start gap-2">
                                            <div className="h-8 w-16 rounded-lg bg-primary/10"></div>
                                        </div>
                                    </td>
                                </tr>
                            ))}
                        </tbody>
                    </table>
                </div>
            </div>
        );
    }

    return (
        <div className="overflow-x-auto glass-subtle rounded-xl">
            <div className="min-w-[800px]">
                <table className="w-full divide-y divide-border/30 table-fixed lg:table-auto">
                    <thead>
                        <tr className="glass-subtle">
                            <th scope="col" className="px-2 sm:px-4 lg:px-6 py-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider w-[8%]">ID</th>
                            <th scope="col" className="px-2 sm:px-4 lg:px-6 py-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider w-[12%]">Type</th>
                            <th scope="col" className="px-2 sm:px-4 lg:px-6 py-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider w-[15%]">Created By</th>
                            <th 
                                scope="col" 
                                className="px-2 sm:px-4 lg:px-6 py-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider cursor-pointer hover:text-foreground transition-colors duration-200 select-none group w-[10%]"
                                onClick={() => setIsSortModalOpen(true)}
                            >
                                <div className="flex items-center gap-2">
                                    <span>Status</span>
                                    <FontAwesomeIcon 
                                        icon={faSort} 
                                        className="w-3 h-3 opacity-50 group-hover:opacity-100 transition-opacity" 
                                    />
                                </div>
                            </th>
                            <th scope="col" className="px-2 sm:px-4 lg:px-6 py-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider w-[10%]">Priority</th>
                            <th scope="col" className="hidden md:table-cell px-2 sm:px-4 lg:px-6 py-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider w-[12%]">Created</th>
                            <th scope="col" className="hidden md:table-cell px-2 sm:px-4 lg:px-6 py-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider w-[15%]">Claimed By</th>
                            <th scope="col" className="px-2 sm:px-4 lg:px-6 py-4 text-left text-xs font-semibold text-muted-foreground uppercase tracking-wider w-[23%] sm:w-[20%]">
                                <span className="sr-only">Actions</span>
                            </th>
                        </tr>
                    </thead>
                    <tbody className="divide-y divide-border/20">
                        {tickets.map((ticket, index) => {
                            const numericId = getNumericId(ticket.id);
                            const userData = userDisplayData[ticket.creator] || userDataService.getDefaultUserData(ticket.creator);
                            return (
                                <motion.tr
                                    key={numericId}
                                    initial={{ opacity: 0, y: 10 }}
                                    animate={{ opacity: 1, y: 0 }}
                                    transition={{ delay: index * 0.03 }}
                                    className="group hover:bg-secondary/30 transition-all duration-200"
                                >
                                    <td className="px-2 sm:px-4 lg:px-6 py-4 whitespace-nowrap">
                                        <Link
                                            to={`/tickets/${numericId}/transcript`}
                                            className="text-primary hover:text-primary/80 transition-all duration-200 font-semibold font-mono"
                                        >
                                            #{numericId}
                                        </Link>
                                    </td>
                                    <td className="px-2 sm:px-4 lg:px-6 py-4 text-sm text-foreground whitespace-nowrap">
                                        <span className="inline-flex items-center px-2.5 py-1 rounded-lg glass-subtle text-foreground text-xs sm:text-sm font-medium">
                                            {ticket.typeName || ticket.type}
                                        </span>
                                    </td>
                                    <td className="px-2 sm:px-4 lg:px-6 py-4 whitespace-nowrap">
                                        <div className="flex items-center gap-2 sm:gap-3">
                                            <img
                                                src={userData.avatar}
                                                alt={userData.displayName}
                                                className="w-7 h-7 rounded-lg ring-2 ring-border/30 group-hover:ring-primary/30 transition-all duration-200 object-cover"
                                            />
                                            <span className="text-xs sm:text-sm font-medium text-foreground truncate">
                                                {userData.displayName}
                                            </span>
                                        </div>
                                    </td>
                                    <td className="px-2 sm:px-4 lg:px-6 py-4 whitespace-nowrap">
                                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium transition-all duration-200 ${
                                            ticket.status === 'open' 
                                                ? 'bg-emerald-500/15 text-emerald-400 shadow-[0_0_10px_-3px_rgba(16,185,129,0.5)]' 
                                                : ticket.status === 'closed' 
                                                    ? 'bg-zinc-500/15 text-zinc-400' 
                                                    : 'bg-amber-500/15 text-amber-400 shadow-[0_0_10px_-3px_rgba(245,158,11,0.5)]'
                                        }`}>
                                            {ticket.status.charAt(0).toUpperCase() + ticket.status.slice(1)}
                                        </span>
                                    </td>
                                    <td className="px-2 sm:px-4 lg:px-6 py-4 whitespace-nowrap">
                                        <span className={`inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium ${
                                            ticket.priority === 'high' 
                                                ? 'bg-rose-500/15 text-rose-400' 
                                                : ticket.priority === 'medium' 
                                                    ? 'bg-amber-500/15 text-amber-400' 
                                                    : 'bg-sky-500/15 text-sky-400'
                                        }`}>
                                            {ticket.priority.charAt(0).toUpperCase() + ticket.priority.slice(1)}
                                        </span>
                                    </td>
                                    <td className="hidden md:table-cell px-2 sm:px-4 lg:px-6 py-4 text-sm text-muted-foreground whitespace-nowrap font-mono">
                                        {formatDateTime(ticket.createdAt)}
                                    </td>
                                    <td className="hidden md:table-cell px-2 sm:px-4 lg:px-6 py-4 whitespace-nowrap">
                                        {ticket.assignee ? (
                                            <div className="flex items-center gap-2 sm:gap-3">
                                                <img
                                                    src={userDisplayData[ticket.assignee]?.avatar || userDataService.getDefaultUserData(ticket.assignee).avatar}
                                                    alt={userDisplayData[ticket.assignee]?.displayName || 'Unknown User'}
                                                    className="w-7 h-7 rounded-lg ring-2 ring-border/30 object-cover"
                                                />
                                                <span className="text-xs sm:text-sm font-medium text-foreground truncate">
                                                    {userDisplayData[ticket.assignee]?.displayName || 'Unknown User'}
                                                </span>
                                            </div>
                                        ) : (
                                            <span className="inline-flex items-center px-2.5 py-1 rounded-full text-xs font-medium bg-muted/50 text-muted-foreground">
                                                Unclaimed
                                            </span>
                                        )}
                                    </td>
                                    <td className="px-2 sm:px-4 lg:px-6 py-4">
                                        <div className="flex flex-wrap items-center justify-end sm:justify-start gap-2">
                                            <Link
                                                to={`/tickets/${numericId}/transcript`}
                                                className="inline-flex items-center px-3 py-2 text-xs font-medium rounded-lg glass-button text-primary"
                                                title="View Transcript"
                                            >
                                                <FontAwesomeIcon icon={faFileAlt} className="w-3.5 h-3.5 mr-1.5" />
                                                <span className="hidden xs:inline">View</span>
                                            </Link>
                                            {ticket.status === 'open' && supportPermissions[ticket.type] && (
                                                <>
                                                    <button
                                                        onClick={() => handleClaimTicket(numericId)}
                                                        disabled={loading[`claim-${numericId}`]}
                                                        className={`inline-flex items-center px-3 py-2 text-xs font-medium rounded-lg transition-all duration-200 ${
                                                            ticket.claimed
                                                                ? 'glass-button text-amber-400'
                                                                : 'glass-button text-primary'
                                                        }`}
                                                        title={ticket.claimed ? 'Unclaim this ticket' : 'Claim this ticket'}
                                                    >
                                                        <FontAwesomeIcon 
                                                            icon={faHandHolding} 
                                                            className={`w-3.5 h-3.5 mr-1.5 ${loading[`claim-${numericId}`] ? 'animate-pulse' : ''}`} 
                                                        />
                                                        <span className="hidden xs:inline">{ticket.claimed ? 'Unclaim' : 'Claim'}</span>
                                                    </button>
                                                    <button
                                                        onClick={() => handleCloseTicket(numericId)}
                                                        disabled={loading[`close-${numericId}`]}
                                                        className="inline-flex items-center px-3 py-2 text-xs font-medium rounded-lg glass-button text-destructive hover:bg-destructive/20"
                                                        title="Close Ticket"
                                                    >
                                                        <FontAwesomeIcon 
                                                            icon={faLock} 
                                                            className={`w-3.5 h-3.5 mr-1.5 ${loading[`close-${numericId}`] ? 'animate-pulse' : ''}`} 
                                                        />
                                                        <span className="hidden xs:inline">Close</span>
                                                    </button>
                                                </>
                                            )}
                                        </div>
                                    </td>
                                </motion.tr>
                            );
                        })}
                    </tbody>
                </table>
            </div>

            <TicketSortModal
                isOpen={isSortModalOpen}
                onClose={() => setIsSortModalOpen(false)}
                onSave={handleSortSave}
                initialSortOrder={statusOrder}
            />
        </div>
    );
}
