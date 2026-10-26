import React, { useEffect, useState, useRef, useMemo } from 'react'
import { Link } from 'react-router-dom'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import { 
    faArrowLeft, faPaperclip, faCheckCircle, 
    faPaperPlane, faTicket, faUser, faClock, 
    faCircle, faThumbsUp, faComments,
    faHandHolding, faLock, faChevronDown
} from '@fortawesome/free-solid-svg-icons'
import { userDataService } from '../../../utils/userDataService'
import { motion, AnimatePresence } from 'framer-motion'
import moment from 'moment-timezone'
import LoadingSpinner from '../../ui/LoadingSpinner'

const getCsrfToken = (): string | null => {
    const match = document.cookie.match(/XSRF-TOKEN=([^;]+)/);
    return match ? decodeURIComponent(match[1]) : null;
};

declare global {
    interface Window {
        socket: any;
    }
}

interface Message {
    author: string
    authorId: string
    content: string
    timestamp: string
    attachments?: Array<{
        url?: string;
        name: string;
        contentType: string;
        binaryData?: string;
        width?: number;
        height?: number;
    }>;
    avatarUrl: string
    displayName?: string
}

interface GroupedMessage {
    author: string
    authorId: string
    displayName: string
    messages: {
        content: string
        timestamp: string
        attachments?: any[]
    }[]
    firstTimestamp: string
    avatarUrl: string
}

interface Question {
    question: string
    answer: string
}

interface ReviewDataItem {
    value: string
    label: string
    emoji?: string
}

interface ReviewData {
    additionalFeedback?: string
    [key: string]: ReviewDataItem | string | undefined
}

interface TranscriptData {
    id: string
    type: string
    typeName?: string
    status: string
    priority: string
    creator: string
    creatorData?: {
        displayName: string
        avatar: string
    }
    claimer: string | null
    claimerData?: {
        displayName: string
        avatar: string
    }
    claimed?: boolean
    created: string
    closed: string | null
    rating: string
    feedback: string
    reviewData?: ReviewData
    questions: Question[]
    messages: Message[]
    closeReason: string
    canSendMessages: boolean;
}

interface ImageViewerProps {
    src: string;
    alt: string;
    onClose: () => void;
}

interface LoadingState {
    fetch: boolean;
    claim: boolean;
    close: boolean;
}

const ImageViewer = ({ src, alt, onClose }: ImageViewerProps) => {
    const [loading, setLoading] = useState(true);
    const [zoomed, setZoomed] = useState(false);
    
    useEffect(() => {
        const handleEsc = (e: KeyboardEvent) => {
            if (e.key === 'Escape') onClose();
        };
        window.addEventListener('keydown', handleEsc);
        document.body.style.overflow = 'hidden';
        return () => {
            window.removeEventListener('keydown', handleEsc);
            document.body.style.overflow = 'auto';
        };
    }, [onClose]);

    return (
        <div
            className="fixed inset-0 z-50 flex items-center justify-center bg-background/95 backdrop-blur-xl p-4"
            onClick={onClose}
        >
            <button
                onClick={onClose}
                className="fixed top-4 right-4 glass-card hover:bg-secondary text-muted-foreground hover:text-foreground rounded-full p-3 transition-colors z-[60]"
            >
                <svg className="w-5 h-5" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                    <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M6 18L18 6M6 6l12 12" />
                </svg>
            </button>
            
            <div className="relative max-w-[95vw] max-h-[95vh]" onClick={e => e.stopPropagation()}>
                {loading && (
                    <div className="absolute inset-0 flex items-center justify-center">
                        <div className="w-10 h-10 border-3 border-primary border-t-transparent rounded-full animate-spin"></div>
                    </div>
                )}
                
                <img
                    src={src}
                    alt={alt}
                    className={`rounded-xl max-w-full max-h-[90vh] object-contain shadow-2xl cursor-zoom-in ring-1 ring-border transition-transform ${zoomed ? 'scale-150' : ''}`}
                    onClick={() => setZoomed(!zoomed)}
                    onLoad={() => setLoading(false)}
                />
            </div>
        </div>
    );
};

function groupMessages(messages: Message[]): GroupedMessage[] {
    return messages.reduce((groups: GroupedMessage[], message) => {
        const lastGroup = groups[groups.length - 1]
        if (lastGroup && lastGroup.authorId === message.authorId) {
            lastGroup.messages.push({
                content: message.content,
                timestamp: message.timestamp,
                attachments: message.attachments
            })
            return groups
        } else {
            groups.push({
                author: message.author,
                authorId: message.authorId,
                displayName: message.displayName || message.author,
                avatarUrl: message.avatarUrl,
                messages: [{
                    content: message.content,
                    timestamp: message.timestamp,
                    attachments: message.attachments
                }],
                firstTimestamp: message.timestamp
            })
            return groups
        }
    }, [])
}

const MessageContent = ({ content }: { content: string }) => {
    const processContent = (text: string) => {
        const escapeHtml = (unsafe: string) => {
            return unsafe
                .replace(/&/g, "&amp;")
                .replace(/</g, "&lt;")
                .replace(/>/g, "&gt;")
                .replace(/"/g, "&quot;")
                .replace(/'/g, "&#039;");
        };
        
        let processedText = escapeHtml(text);
        
        processedText = processedText.replace(/&lt;@!?(\d+)&gt;/g, '<span class="text-primary bg-primary/10 px-1 rounded">@user</span>');
        processedText = processedText.replace(/&lt;#(\d+)&gt;/g, '<span class="text-primary bg-primary/10 px-1 rounded">#channel</span>');
        processedText = processedText.replace(/&lt;@&amp;(\d+)&gt;/g, '<span class="text-primary bg-primary/10 px-1 rounded">@role</span>');
        
        processedText = processedText.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
        processedText = processedText.replace(/(\*|_)(.*?)\1/g, '<em>$2</em>');
        processedText = processedText.replace(/~~(.*?)~~/g, '<del class="text-muted-foreground">$1</del>');
        processedText = processedText.replace(/```([\s\S]*?)```/g, '<pre class="bg-secondary p-2 rounded-lg my-1 overflow-x-auto text-sm"><code>$1</code></pre>');
        processedText = processedText.replace(/`([^`]+)`/g, '<code class="bg-secondary px-1 py-0.5 rounded text-sm">$1</code>');
        processedText = processedText.replace(/\n/g, '<br>');
        
        return processedText;
    };

    return (
        <div 
            className="whitespace-pre-wrap break-words text-foreground/90 leading-relaxed text-sm"
            dangerouslySetInnerHTML={{ __html: processContent(content) }}
        />
    );
};

const formatTime = (timestamp: string) => {
    if (!timestamp) return '';
    const date = moment.tz(timestamp, window.DASHBOARD_CONFIG?.TIMEZONE || 'UTC');
    return date.isValid() ? date.format('h:mm A') : '';
};

const formatDate = (timestamp: string) => {
    if (!timestamp) return '';
    const date = moment.tz(timestamp, window.DASHBOARD_CONFIG?.TIMEZONE || 'UTC');
    return date.isValid() ? date.format('MMM D, YYYY') : '';
};

const getAvatarUrl = (userId: string) => {
    return `https://cdn.discordapp.com/embed/avatars/${parseInt(userId) % 5}.png`;
}

const AttachmentDisplay = ({ attachment }: { 
    attachment: { url?: string; name: string; contentType?: string; binaryData?: string; } 
}) => {
    const [selectedImage, setSelectedImage] = useState<{ src: string; alt: string } | null>(null);

    if (attachment.contentType?.startsWith('image/')) {
        const imageSrc = attachment.binaryData 
            ? `data:${attachment.contentType};base64,${attachment.binaryData}`
            : attachment.url;

        return (
            <>
                <img
                    src={imageSrc}
                    alt={attachment.name}
                    className="max-w-xs rounded-lg border border-border cursor-pointer hover:opacity-90 transition-opacity"
                    onClick={() => setSelectedImage({ src: imageSrc!, alt: attachment.name })}
                />
                {selectedImage && (
                    <ImageViewer 
                        src={selectedImage.src} 
                        alt={selectedImage.alt} 
                        onClose={() => setSelectedImage(null)} 
                    />
                )}
            </>
        );
    }

    if (attachment.url) {
        return (
            <a
                href={attachment.url}
                target="_blank"
                rel="noopener noreferrer"
                className="inline-flex items-center gap-2 px-3 py-2 bg-secondary rounded-lg text-sm text-muted-foreground hover:text-foreground transition-colors"
            >
                <FontAwesomeIcon icon={faPaperclip} className="w-3 h-3" />
                <span className="truncate max-w-[200px]">{attachment.name}</span>
            </a>
        );
    }

    return null;
};

export default function TicketTranscript({ ticketId }: { ticketId: string }) {
    const [data, setData] = useState<TranscriptData | null>(null)
    const [loading, setLoading] = useState<LoadingState>({ fetch: true, claim: false, close: false })
    const [error, setError] = useState<string | null>(null)
    const [supportPermissions, setSupportPermissions] = useState<Record<string, boolean>>({})
    const [message, setMessage] = useState('')
    const [sending, setSending] = useState(false)
    const [sendingEnabled, setSendingEnabled] = useState(true)
    const [expandedQuestion, setExpandedQuestion] = useState<number | null>(null)
    const textareaRef = useRef<HTMLTextAreaElement>(null)
    const messagesEndRef = useRef<HTMLDivElement>(null)

    const groupedMessages = useMemo(() => data ? groupMessages(data.messages) : [], [data?.messages]);

    const hasFeedback = useMemo(() => {
        if (!data) return false;
        if (data.reviewData) {
            const hasReviewItems = Object.entries(data.reviewData)
                .filter(([key, val]) => key !== 'additionalFeedback' && val && typeof val === 'object' && 'value' in val)
                .length > 0;
            const hasAdditionalFeedback = !!data.reviewData.additionalFeedback;
            return hasReviewItems || hasAdditionalFeedback;
        }
        return (data.rating && data.rating !== 'No Rating') || !!data.feedback;
    }, [data]);

    useEffect(() => {
        let isMounted = true;

        async function fetchTranscript() {
            try {
                const response = await fetch(`/api/tickets/${ticketId}/transcript`);
                if (!response.ok) {
                    if (response.status === 403) {
                        setError("You don't have permission to view this ticket");
                        return;
                    }
                    throw new Error(`HTTP error! status: ${response.status}`);
                }
                
                const result = await response.json();
                const creatorData = await userDataService.getUserData(result.creator);
                
                let claimerData;
                if (result.claimer && result.claimer !== 'Unclaimed') {
                    claimerData = await userDataService.getUserData(result.claimer);
                }
                
                const enhancedMessages = await Promise.all(
                    result.messages.map(async (msg: Message) => {
                        const userData = await userDataService.getUserData(msg.authorId);
                        return {
                            ...msg,
                            displayName: userData?.displayName || msg.author,
                            avatarUrl: userData?.avatar || getAvatarUrl(msg.authorId)
                        };
                    })
                );

                if (isMounted) {
                    setData({
                        ...result,
                        creatorData: creatorData || undefined,
                        claimerData: claimerData || undefined,
                        claimed: Boolean(result.claimer) && result.claimer !== 'Unclaimed',
                        messages: enhancedMessages
                    });
                    setLoading(prev => ({ ...prev, fetch: false }));
                }
            } catch (error) {
                if (isMounted) {
                    setError('Failed to load transcript');
                    setLoading(prev => ({ ...prev, fetch: false }));
                }
            }
        }

        fetchTranscript();
        const pollInterval = setInterval(fetchTranscript, 5000);

        return () => {
            isMounted = false;
            clearInterval(pollInterval);
        };
    }, [ticketId]);

    useEffect(() => {
        if (textareaRef.current) {
            textareaRef.current.style.height = 'auto';
            textareaRef.current.style.height = `${Math.min(textareaRef.current.scrollHeight, 150)}px`;
        }
    }, [message]);

    useEffect(() => {
        const checkSupportPermissions = async () => {
            if (!data?.type) return;
            try {
                const response = await fetch(`/api/tickets/permissions/${data.type}`);
                if (response.ok) {
                    const { hasSupport } = await response.json();
                    setSupportPermissions(prev => ({ ...prev, [data.type]: hasSupport }));
                }
            } catch (error) {}
        };
        checkSupportPermissions();
    }, [data?.type]);

    const sendMessage = async () => {
        if (!message.trim() || !sendingEnabled) return;

        setSending(true);
        setSendingEnabled(false);
        const messageContent = message;
        
        try {
            const csrfToken = getCsrfToken();
            const response = await fetch(`/api/tickets/${ticketId}/send-message`, {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                    ...(csrfToken && { 'X-XSRF-TOKEN': csrfToken }),
                },
                body: JSON.stringify({ content: messageContent }),
            });

            if (response.ok) {
                setMessage('');
                const currentUser = await userDataService.getCurrentUser();
                const newMessage: Message = {
                    author: currentUser?.displayName || 'You',
                    authorId: currentUser?.id || 'local',
                    content: messageContent,
                    timestamp: new Date().toISOString(),
                    avatarUrl: currentUser?.avatar || '/default-avatar.png',
                    displayName: currentUser?.displayName || 'You'
                };

                setData(prev => prev ? { ...prev, messages: [...prev.messages, newMessage] } : prev);
            }
        } finally {
            setSending(false);
            setTimeout(() => setSendingEnabled(true), 500);
        }
    };

    const handleClaimTicket = async () => {
        try {
            setLoading(prev => ({ ...prev, claim: true }));
            const csrfToken = getCsrfToken();
            const response = await fetch(`/api/tickets/claim/${ticketId}`, {
                method: 'POST',
                credentials: 'include',
                headers: {
                    'Content-Type': 'application/json',
                    ...(csrfToken && { 'X-XSRF-TOKEN': csrfToken }),
                }
            });

            if (response.ok) {
                const result = await response.json();
                setData(prev => {
                    if (!prev) return prev;
                    if (result.action === 'unclaimed') {
                        return { ...prev, claimed: false, claimer: null, claimerData: undefined };
                    }
                    return { ...prev, claimed: true, claimer: result.ticket.claimedBy };
                });
            }
        } finally {
            setLoading(prev => ({ ...prev, claim: false }));
        }
    };

    const handleCloseTicket = async () => {
        const reason = prompt('Enter a reason for closing (optional):');
        if (reason === null) return;
        
        try {
            setLoading(prev => ({ ...prev, close: true }));
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

            if (response.ok) {
                setData(prev => prev ? { ...prev, status: 'closed', closed: new Date().toISOString(), closeReason: reason || '' } : prev);
            }
        } finally {
            setLoading(prev => ({ ...prev, close: false }));
        }
    };

    if (loading.fetch) return <LoadingSpinner />;

    if (error) return (
        <div className="p-6">
            <Link to="/tickets" className="inline-flex items-center gap-2 text-muted-foreground hover:text-foreground mb-4">
                <FontAwesomeIcon icon={faArrowLeft} className="w-4 h-4" />
                Back
            </Link>
            <div className="bg-destructive/10 text-destructive p-4 rounded-lg">{error}</div>
        </div>
    );

    if (!data) return null;

    const canPerformActions = data.status === 'open' && supportPermissions[data.type];
    const isClaimed = Boolean(data.claimer) && data.claimer !== 'Unclaimed';

    return (
        <div className="flex flex-col h-full">
            {/* Compact Nav Bar */}
            <div className="sticky top-0 z-20 px-4 py-3">
                <div className="flex items-center justify-between gap-4 max-w-[1600px] mx-auto glass-card rounded-xl px-4 py-2.5">
                    <div className="flex items-center gap-3">
                        <Link to="/tickets" className="text-muted-foreground hover:text-foreground transition-colors">
                            <FontAwesomeIcon icon={faArrowLeft} className="w-4 h-4" />
                        </Link>
                        <div className="flex items-center gap-2">
                            <FontAwesomeIcon icon={faTicket} className="w-4 h-4 text-primary" />
                            <span className="font-semibold text-foreground">#{data.id}</span>
                            <span className="text-muted-foreground">·</span>
                            <span className="text-sm text-muted-foreground">{data.typeName || data.type}</span>
                        </div>
                        <span className={`px-2 py-0.5 rounded-full text-xs font-medium ${
                            data.status === 'open' 
                                ? 'bg-emerald-500/10 text-emerald-400' 
                                : 'bg-rose-500/10 text-rose-400'
                        }`}>
                            {data.status}
                        </span>
                    </div>
                    
                    {canPerformActions && (
                        <div className="flex items-center gap-2">
                            <button
                                onClick={handleClaimTicket}
                                disabled={loading.claim}
                                className={`px-3 py-1.5 rounded-lg text-xs font-medium transition-colors ${
                                    isClaimed
                                        ? 'bg-amber-500/10 text-amber-400 hover:bg-amber-500/20'
                                        : 'bg-primary/10 text-primary hover:bg-primary/20'
                                }`}
                            >
                                <FontAwesomeIcon icon={faHandHolding} className="w-3 h-3 mr-1.5" />
                                {loading.claim ? '...' : isClaimed ? 'Unclaim' : 'Claim'}
                            </button>
                            <button
                                onClick={handleCloseTicket}
                                disabled={loading.close}
                                className="px-3 py-1.5 rounded-lg text-xs font-medium bg-rose-500/10 text-rose-400 hover:bg-rose-500/20 transition-colors"
                            >
                                <FontAwesomeIcon icon={faLock} className="w-3 h-3 mr-1.5" />
                                {loading.close ? '...' : 'Close'}
                            </button>
                        </div>
                    )}
                </div>
            </div>

            {/* Main Content */}
            <div className="flex-1 overflow-auto">
                <div className="max-w-[1600px] mx-auto p-4 lg:p-6">
                    <div className="grid grid-cols-12 gap-6">
                        {/* Messages Column */}
                        <div className="col-span-12 lg:col-span-8">
                            {/* Questions - Simple Accordion */}
                            {data.questions && data.questions.length > 0 && (
                                <div className="glass-card rounded-xl mb-4 overflow-hidden">
                                    <div className="px-4 py-3 border-b border-border text-sm font-medium text-foreground">
                                        Questions ({data.questions.length})
                                    </div>
                                    <div className="divide-y divide-border">
                                        {data.questions.map((q, index) => (
                                            <div key={index}>
                                                <button 
                                                    onClick={() => setExpandedQuestion(expandedQuestion === index ? null : index)}
                                                    className="w-full px-4 py-3 flex items-center justify-between text-left hover:bg-secondary/30 transition-colors"
                                                >
                                                    <span className="text-sm text-foreground">{q.question}</span>
                                                    <FontAwesomeIcon 
                                                        icon={faChevronDown} 
                                                        className={`w-3 h-3 text-muted-foreground transition-transform ${expandedQuestion === index ? 'rotate-180' : ''}`}
                                                    />
                                                </button>
                                                {expandedQuestion === index && (
                                                    <div className="px-4 pb-3">
                                                        <div className="bg-secondary/50 rounded-lg px-3 py-2 text-sm text-muted-foreground">
                                                            {q.answer}
                                                        </div>
                                                    </div>
                                                )}
                                            </div>
                                        ))}
                                    </div>
                                </div>
                            )}

                            {/* Messages */}
                            <div className="glass-card rounded-xl overflow-hidden">
                                <div className="divide-y divide-border">
                                    {groupedMessages.map((group, index) => (
                                        <div key={`${group.authorId}-${index}`} className="px-4 py-3">
                                            <div className="flex gap-3">
                                                <img
                                                    src={group.avatarUrl || getAvatarUrl(group.authorId)}
                                                    alt=""
                                                    className="w-8 h-8 rounded-full flex-shrink-0"
                                                />
                                                <div className="flex-1 min-w-0">
                                                    <div className="flex items-center gap-2 mb-1">
                                                        <span className="font-medium text-sm text-foreground">{group.displayName}</span>
                                                        <span className="text-xs text-muted-foreground">{formatTime(group.firstTimestamp)}</span>
                                                    </div>
                                                    <div className="space-y-2">
                                                        {group.messages.map((msg, msgIndex) => (
                                                            <div key={msgIndex}>
                                                                <MessageContent content={msg.content} />
                                                                {msg.attachments && msg.attachments.length > 0 && (
                                                                    <div className="mt-2 flex flex-wrap gap-2">
                                                                        {msg.attachments.map((att, attIndex) => (
                                                                            <AttachmentDisplay key={attIndex} attachment={att} />
                                                                        ))}
                                                                    </div>
                                                                )}
                                                            </div>
                                                        ))}
                                                    </div>
                                                </div>
                                            </div>
                                        </div>
                                    ))}
                                </div>
                                <div ref={messagesEndRef} />

                                {/* Message Input */}
                                {data.canSendMessages && data.status === 'open' && (
                                    <div className="p-4 border-t border-border bg-card/50">
                                        <div className="flex gap-3">
                                            <textarea
                                                ref={textareaRef}
                                                value={message}
                                                onChange={(e) => setMessage(e.target.value)}
                                                onKeyDown={(e) => {
                                                    if (e.key === 'Enter' && !e.shiftKey) {
                                                        e.preventDefault();
                                                        sendMessage();
                                                    }
                                                }}
                                                placeholder="Type a message..."
                                                className="flex-1 bg-secondary border border-border rounded-lg px-3 py-2 text-sm text-foreground placeholder-muted-foreground focus:outline-none focus:border-primary/50 resize-none"
                                                rows={1}
                                            />
                                            <button
                                                onClick={sendMessage}
                                                disabled={!message.trim() || !sendingEnabled || sending}
                                                className={`px-4 rounded-lg transition-colors ${
                                                    message.trim() && sendingEnabled && !sending
                                                        ? 'bg-primary text-primary-foreground hover:bg-primary/90'
                                                        : 'bg-secondary text-muted-foreground cursor-not-allowed'
                                                }`}
                                            >
                                                <FontAwesomeIcon icon={faPaperPlane} className={`w-4 h-4 ${sending ? 'animate-pulse' : ''}`} />
                                            </button>
                                        </div>
                                    </div>
                                )}
                            </div>
                        </div>

                        {/* Sidebar */}
                        <div className="col-span-12 lg:col-span-4 space-y-4">
                            {/* Ticket Info */}
                            <div className="glass-card rounded-xl p-4">
                                <h3 className="text-sm font-medium text-foreground mb-3">Details</h3>
                                <div className="space-y-3 text-sm">
                                    <div className="flex items-center justify-between">
                                        <span className="text-muted-foreground">Priority</span>
                                        <span className={`px-2 py-0.5 rounded text-xs font-medium ${
                                            data.priority === 'high' ? 'bg-rose-500/10 text-rose-400' :
                                            data.priority === 'medium' ? 'bg-amber-500/10 text-amber-400' :
                                            'bg-teal-500/10 text-teal-400'
                                        }`}>
                                            {data.priority}
                                        </span>
                                    </div>
                                    <div className="flex items-center justify-between">
                                        <span className="text-muted-foreground">Created</span>
                                        <span className="text-foreground">{formatDate(data.created)}</span>
                                    </div>
                                    {data.closed && (
                                        <div className="flex items-center justify-between">
                                            <span className="text-muted-foreground">Closed</span>
                                            <span className="text-foreground">{formatDate(data.closed)}</span>
                                        </div>
                                    )}
                                    {isClaimed && data.claimerData && (
                                        <div className="flex items-center justify-between">
                                            <span className="text-muted-foreground">Claimed by</span>
                                            <div className="flex items-center gap-2">
                                                <img src={data.claimerData.avatar} alt="" className="w-5 h-5 rounded-full" />
                                                <span className="text-foreground">{data.claimerData.displayName}</span>
                                            </div>
                                        </div>
                                    )}
                                </div>
                            </div>

                            {/* Creator */}
                            <div className="glass-card rounded-xl p-4">
                                <h3 className="text-sm font-medium text-foreground mb-3">Created by</h3>
                                <div className="flex items-center gap-3">
                                    <img
                                        src={data.creatorData?.avatar || getAvatarUrl(data.creator)}
                                        alt=""
                                        className="w-10 h-10 rounded-full"
                                    />
                                    <div>
                                        <div className="font-medium text-foreground">{data.creatorData?.displayName || data.creator}</div>
                                        <div className="text-xs text-muted-foreground">{data.creator}</div>
                                    </div>
                                </div>
                            </div>

                            {/* Participants */}
                            {data.messages.length > 0 && (
                                <div className="glass-card rounded-xl p-4">
                                    <h3 className="text-sm font-medium text-foreground mb-3">
                                        Participants ({Array.from(new Set(data.messages.map(m => m.authorId))).length})
                                    </h3>
                                    <div className="space-y-2">
                                        {Array.from(new Set(data.messages.map(m => m.authorId))).slice(0, 5).map(authorId => {
                                            const msg = data.messages.find(m => m.authorId === authorId);
                                            if (!msg) return null;
                                            const count = data.messages.filter(m => m.authorId === authorId).length;
                                            return (
                                                <div key={authorId} className="flex items-center justify-between">
                                                    <div className="flex items-center gap-2">
                                                        <img src={msg.avatarUrl} alt="" className="w-6 h-6 rounded-full" />
                                                        <span className="text-sm text-foreground truncate">{msg.displayName || msg.author}</span>
                                                    </div>
                                                    <span className="text-xs text-muted-foreground">{count}</span>
                                                </div>
                                            );
                                        })}
                                    </div>
                                </div>
                            )}

                            {/* Feedback - Only show if exists */}
                            {hasFeedback && (
                                <div className="glass-card rounded-xl p-4">
                                    <h3 className="text-sm font-medium text-foreground mb-3">Feedback</h3>
                                    {data.reviewData ? (
                                        <div className="space-y-2">
                                            {Object.entries(data.reviewData)
                                                .filter(([key, val]) => key !== 'additionalFeedback' && val && typeof val === 'object' && 'value' in val)
                                                .map(([key, val]) => {
                                                    const item = val as ReviewDataItem;
                                                    return (
                                                        <div key={key} className="flex items-center justify-between text-sm">
                                                            <span className="text-muted-foreground capitalize">{key.replace(/_/g, ' ')}</span>
                                                            <div className="flex items-center gap-1">
                                                                {item.emoji && <span>{item.emoji}</span>}
                                                                <span className="text-foreground">{item.label}</span>
                                                            </div>
                                                        </div>
                                                    );
                                                })}
                                            {data.reviewData.additionalFeedback && (
                                                <div className="mt-2 pt-2 border-t border-border">
                                                    <p className="text-sm text-muted-foreground">{data.reviewData.additionalFeedback}</p>
                                                </div>
                                            )}
                                        </div>
                                    ) : (
                                        <div className="space-y-2">
                                            {data.rating && data.rating !== 'No Rating' && (
                                                <div className="flex items-center justify-between text-sm">
                                                    <span className="text-muted-foreground">Rating</span>
                                                    <span className="text-foreground">{data.rating}</span>
                                                </div>
                                            )}
                                            {data.feedback && (
                                                <p className="text-sm text-muted-foreground">{data.feedback}</p>
                                            )}
                                        </div>
                                    )}
                                </div>
                            )}

                            {/* Close Reason */}
                            {data.closeReason && (
                                <div className="glass-card rounded-xl p-4">
                                    <h3 className="text-sm font-medium text-foreground mb-2">Close Reason</h3>
                                    <p className="text-sm text-muted-foreground">{data.closeReason}</p>
                                </div>
                            )}
                        </div>
                    </div>
                </div>
            </div>
        </div>
    );
}
