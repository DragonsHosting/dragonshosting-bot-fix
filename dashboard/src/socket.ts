import { io } from 'socket.io-client';

declare global {
    interface Window {
        DASHBOARD_CONFIG: {
            API_URL: string;
            CLIENT_URL: string;
            TIMEZONE: string;
            DISCORD: {
                CLIENT_ID: string;
                REDIRECT_URI: string;
                GUILD_ID: string;
            };
            TICKETS: {
                TYPES: Record<string, any>;
            };
            PERMISSIONS: {
                Dashboard: {
                    Login: string[];
                    Settings: string[];
                };
            };
        }
    }
}

const getSocketUrl = () => {
    if (window.DASHBOARD_CONFIG?.CLIENT_URL) {
        return window.DASHBOARD_CONFIG.CLIENT_URL;
    }
    
    const protocol = window.location.protocol;
    const hostname = window.location.hostname;
    const port = window.location.port;
    return `${protocol}//${hostname}${port ? `:${port}` : ''}`;
};

const API_URL = getSocketUrl();

const isFirefox = navigator.userAgent.includes('Firefox');

const socket = io(API_URL, {
    autoConnect: true,
    reconnection: true,
    reconnectionAttempts: isFirefox ? 10 : 5,
    reconnectionDelay: isFirefox ? 2000 : 1000,
    reconnectionDelayMax: isFirefox ? 10000 : 5000,
    withCredentials: true,
    transports: isFirefox ? ['polling'] : ['polling', 'websocket'],
    upgrade: !isFirefox,
    path: '/socket.io/',
    forceNew: false,
    timeout: isFirefox ? 60000 : 20000,
    rememberUpgrade: false,
    randomizationFactor: 0.5
});

let currentRoom: string | null = null;

socket.on('connect', () => {
    if (currentRoom) {
        socket.emit('join_ticket', currentRoom);
    }
});

socket.on('disconnect', (reason) => {
    if (reason === 'io server disconnect' || reason === 'transport close') {
        socket.connect();
    }
});

socket.on('connect_error', (error) => {
  //  console.error('[SOCKET] Connection error:', error);
    
    if (isFirefox) {
        setTimeout(() => {
            if (!socket.connected) {
                socket.connect();
            }
        }, 3000);
    } else {
        setTimeout(() => {
            socket.connect();
        }, 1000);
    }
});

socket.onAny((event, ...args) => {
});

socket.onAnyOutgoing((event, ...args) => {
});

const joinTicketRoom = (ticketId: string) => {
    if (currentRoom === ticketId) {
        return;
    }
    
    if (currentRoom) {
        socket.emit('leave_ticket', currentRoom);
    }
    
    socket.emit('join_ticket', ticketId);
    currentRoom = ticketId;
    
    socket.emit('get_ticket_messages', ticketId);
};

socket.on('ticketMessage', (data) => {
    socket.emit('message_received', { messageId: data?.message?.id });
});

socket.on('ticket_message', (data) => {
    socket.emit('message_received', { messageId: data?.message?.id });
});

socket.on('message', (data) => {
    socket.emit('message_received', { messageId: data?.message?.id });
});

socket.on('discord_message', (data) => {
    socket.emit('message_received', { messageId: data?.message?.id });
});

socket.on('discordMessage', (data) => {
    socket.emit('message_received', { messageId: data?.message?.id });
});

socket.on('discord', (data) => {
    socket.emit('message_received', { messageId: data?.message?.id });
});

socket.on('joined_room', (room) => {
});

socket.on('left_room', (room) => {
    if (currentRoom === room) {
        currentRoom = null;
    }
});

export { socket, joinTicketRoom }; 