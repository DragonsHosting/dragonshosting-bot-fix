import { useState, useEffect, useRef } from 'react';
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome";
import { faUser, faSignOut, faChevronDown, faCog } from "@fortawesome/free-solid-svg-icons";
import { auth } from '../../lib/auth/auth';
import { useNavigate, useLocation } from 'react-router-dom';
import type { User } from '../../lib/auth/auth';
import { socket } from '../../socket';

interface UserStatus {
    status: 'online' | 'idle' | 'dnd' | 'offline';
}

interface ProfileButtonProps {
    className?: string;
    minimal?: boolean;
}

export function ProfileButton({ className = '', minimal = false }: ProfileButtonProps) {
    const [user, setUser] = useState<User | null>(null);
    const [userStatus, setUserStatus] = useState<UserStatus>({ status: 'offline' });
    const [isOpen, setIsOpen] = useState(false);
    const [isLoading, setIsLoading] = useState(true);
    const navigate = useNavigate();
    const location = useLocation();
    const [showDropdown, setShowDropdown] = useState(false);
    const dropdownRef = useRef<HTMLDivElement>(null);

    useEffect(() => {
        const loadUser = async () => {
            try {
                const userData = await auth.getUser();
                setUser(userData);

                if (userData) {
                    await fetchUserStatus();
                }
            } catch (error) {
                console.error('Failed to load user:', error);
            } finally {
                setIsLoading(false);
            }
        };
        loadUser();

        socket.on('presenceUpdate', (data: { userId: string; status: string }) => {
            if (user && data.userId === user.id) {
                setUserStatus({ status: data.status as UserStatus['status'] });
            }
        });

        const statusInterval = setInterval(fetchUserStatus, 30000);

        return () => {
            clearInterval(statusInterval);
            socket.off('presenceUpdate');
        };
    }, [user]);

    const fetchUserStatus = async () => {
        if (!user) return;
        
        try {
            const response = await fetch(`${window.DASHBOARD_CONFIG?.API_URL}/auth/status`, {
                credentials: 'include'
            });
            if (response.ok) {
                const status = await response.json();
                setUserStatus(status);
            }
        } catch (error) {
            console.error('Failed to fetch user status:', error);
        }
    };

    const handleLogout = async () => {
        await auth.logout();
        navigate('/auth/signin');
    };

    const getInitials = (displayName: string): string => {
        if (!displayName) return '?';
        return displayName.split(' ').map(n => n[0]).join('').toUpperCase().slice(0, 2);
    };

    useEffect(() => {
        const handleClickOutside = (event: MouseEvent) => {
            if (dropdownRef.current && !dropdownRef.current.contains(event.target as Node)) {
                setShowDropdown(false);
            }
        };

        document.addEventListener('mousedown', handleClickOutside);
        return () => {
            document.removeEventListener('mousedown', handleClickOutside);
        };
    }, []);

    if (isLoading) {
        return minimal ? (
            <div className={`flex items-center space-x-3 animate-pulse ${className}`}>
                <div className="w-8 h-8 rounded-full bg-secondary" />
                <div className="h-4 w-24 bg-secondary rounded" />
            </div>
        ) : (
            <div className={`flex items-center space-x-3 p-2 rounded-lg bg-secondary border border-border animate-pulse ${className}`}>
                <div className="w-8 h-8 rounded-full bg-muted" />
                <div>
                    <div className="h-4 w-24 bg-muted rounded" />
                    <div className="h-3 w-16 bg-muted rounded mt-1" />
                </div>
            </div>
        );
    }

    if (!user) {
        return (
            <button
                onClick={() => auth.login()}
                className="flex items-center space-x-2 px-4 py-2 bg-[#5865F2] text-white rounded-lg hover:bg-[#4752C4] transition-colors duration-150"
            >
                <FontAwesomeIcon icon={faUser} className="h-4 w-4" />
                <span className="font-medium text-sm">Sign In with Discord</span>
            </button>
        );
    }

    const avatarUrl = user.avatar
        ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.png?size=128`
        : `https://cdn.discordapp.com/embed/avatars/${parseInt(user.discriminator) % 5}.png`;

    const displayName = user.global_name || user.username;

    const getStatusColor = (status: string) => {
        switch (status) {
            case 'online':
                return 'bg-green-500';
            case 'idle':
                return 'bg-yellow-500';
            case 'dnd':
                return 'bg-red-500';
            default:
                return 'bg-muted-foreground';
        }
    };

    const goToUserSettings = () => {
        navigate('/user-settings');
        setIsOpen(false);
    };

    if (minimal) {
        return (
            <div className={`group transition-colors duration-150 ${className}`}>
                <div className="flex items-center space-x-3">
                    <div className="relative">
                        <img
                            src={avatarUrl}
                            alt={displayName}
                            className="w-8 h-8 rounded-full border border-border"
                            onError={(e) => {
                                (e.target as HTMLImageElement).onerror = null;
                                (e.target as HTMLImageElement).src = `https://cdn.discordapp.com/embed/avatars/0.png`;
                            }}
                        />
                        <div
                            className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 ${getStatusColor(userStatus.status)} rounded-full border-2 border-background`}
                        />
                    </div>
                    <div className="flex-1 text-left min-w-0">
                        <div className="text-sm font-medium text-foreground truncate">
                            {displayName}
                        </div>
                    </div>
                </div>
            </div>
        );
    }

    return (
        <div className="relative">
            <button 
                onClick={() => setIsOpen(!isOpen)}
                className="flex items-center space-x-3 px-3 py-2 bg-secondary rounded-lg border border-border transition-colors duration-150 hover:bg-muted"
            >
                <div className="relative">
                    <div
                        className={`absolute -bottom-0.5 -right-0.5 w-3 h-3 ${getStatusColor(userStatus.status)} rounded-full border-2 border-background z-10`}
                    />
                    <img 
                        src={avatarUrl} 
                        alt="Profile"
                        className="w-8 h-8 rounded-lg border border-border"
                        onError={(e) => {
                            (e.target as HTMLImageElement).onerror = null;
                            (e.target as HTMLImageElement).src = `https://cdn.discordapp.com/embed/avatars/0.png`;
                        }}
                    />
                </div>
                
                <div className="flex items-center space-x-3">
                    <div className="flex flex-col items-start">
                        <span className="text-foreground font-medium text-sm">
                            {displayName}
                        </span>
                        <span className="text-muted-foreground text-xs">
                            @{user.username}
                        </span>
                    </div>
                    <FontAwesomeIcon 
                        icon={faChevronDown} 
                        className={`w-3 h-3 text-muted-foreground transition-transform duration-150 ${isOpen ? 'rotate-180' : ''}`}
                    />
                </div>
            </button>

            {isOpen && (
                <>
                    <div 
                        className="fixed inset-0 z-40"
                        onClick={() => setIsOpen(false)}
                    />
                    <div className="absolute right-0 mt-2 w-48 rounded-lg bg-card border border-border shadow-lg z-50 overflow-hidden">
                        <div className="p-1.5">
                            <button
                                onClick={goToUserSettings}
                                className="w-full flex items-center space-x-2 px-3 py-2 text-sm text-foreground hover:bg-secondary rounded-md transition-colors duration-150"
                            >
                                <FontAwesomeIcon icon={faCog} className="w-4 h-4" />
                                <span>User Settings</span>
                            </button>
                            <button
                                onClick={handleLogout}
                                className="w-full flex items-center space-x-2 px-3 py-2 text-sm text-red-500 hover:bg-red-500/10 rounded-md transition-colors duration-150"
                            >
                                <FontAwesomeIcon icon={faSignOut} className="w-4 h-4" />
                                <span>Sign Out</span>
                            </button>
                        </div>
                    </div>
                </>
            )}
        </div>
    );
}