import { useState, useEffect, useCallback } from 'react'
import { Link } from 'react-router-dom'
import { FontAwesomeIcon } from '@fortawesome/react-fontawesome'
import {
    faStar,
    faStarHalfStroke,
    faSearch,
    faChevronLeft,
    faChevronRight,
    faFilter,
    faInbox,
    faQuoteLeft,
    faTicket,
    faArrowUp,
    faArrowDown
} from '@fortawesome/free-solid-svg-icons'
import { motion } from 'framer-motion'
import { ticketService } from '../../services/ticketService'
import { userDataService } from '../../utils/userDataService'

interface ReviewQuestion {
    id: string
    label: string
    value: string
    emoji: string
}

interface Review {
    ticketId: string
    userId: string
    ticketType: string
    typeName: string
    status: string
    rating: string
    ratingValue: number | null
    feedback: string
    reviewQuestions: ReviewQuestion[]
    closedAt: string
    createdAt: string
    closedBy: string | null
    claimedBy: string | null
}

interface ReviewStats {
    totalReviews: number
    averageRating: number
    ratingDistribution: Record<number, number>
}

interface Pagination {
    page: number
    pages: number
    total: number
}

interface UserDisplayData {
    avatar: string
    displayName: string
}

const container = {
    hidden: { opacity: 0 },
    show: {
        opacity: 1,
        transition: { staggerChildren: 0.06 }
    }
}

const item = {
    hidden: { opacity: 0, y: 20 },
    show: { opacity: 1, y: 0 }
}

function StarRating({ value, max = 5 }: { value: number; max?: number }) {
    const stars = []
    for (let i = 1; i <= max; i++) {
        if (i <= Math.floor(value)) {
            stars.push(
                <FontAwesomeIcon key={i} icon={faStar} className="w-4 h-4 text-amber-400" />
            )
        } else if (i - 0.5 <= value) {
            stars.push(
                <FontAwesomeIcon key={i} icon={faStarHalfStroke} className="w-4 h-4 text-amber-400" />
            )
        } else {
            stars.push(
                <FontAwesomeIcon key={i} icon={faStar} className="w-4 h-4 text-muted-foreground/20" />
            )
        }
    }
    return <div className="flex items-center gap-0.5">{stars}</div>
}

function RatingBar({ rating, count, total }: { rating: number; count: number; total: number }) {
    const percentage = total > 0 ? (count / total) * 100 : 0
    return (
        <div className="flex items-center gap-3">
            <span className="text-xs font-medium text-muted-foreground w-3 text-right">{rating}</span>
            <FontAwesomeIcon icon={faStar} className="w-3 h-3 text-amber-400" />
            <div className="flex-1 h-2 rounded-full bg-secondary/50 overflow-hidden">
                <motion.div
                    initial={{ width: 0 }}
                    animate={{ width: `${percentage}%` }}
                    transition={{ duration: 0.8, ease: 'easeOut' }}
                    className="h-full rounded-full bg-gradient-to-r from-amber-400 to-amber-500"
                />
            </div>
            <span className="text-xs text-muted-foreground w-8 text-right">{count}</span>
        </div>
    )
}

export default function ReviewsPage() {
    const [reviews, setReviews] = useState<Review[]>([])
    const [stats, setStats] = useState<ReviewStats>({ totalReviews: 0, averageRating: 0, ratingDistribution: {} })
    const [pagination, setPagination] = useState<Pagination>({ page: 1, pages: 1, total: 0 })
    const [loading, setLoading] = useState(true)
    const [userDisplayData, setUserDisplayData] = useState<Record<string, UserDisplayData>>({})
    const [filters, setFilters] = useState({
        rating: 'all',
        type: 'all',
        search: '',
        sortBy: 'newest'
    })

    const fetchReviews = useCallback(async (page = 1) => {
        setLoading(true)
        try {
            const data = await ticketService.getReviews(filters, page)
            setReviews(data.reviews)
            setStats(data.stats)
            setPagination(data.pagination)

            const uniqueUsers = Array.from(new Set([
                ...data.reviews.map((r: Review) => r.userId),
                ...data.reviews.map((r: Review) => r.claimedBy).filter(Boolean)
            ]))
            const userDataPromises = uniqueUsers.map(async (userId: string) => {
                const userData = await userDataService.getUserData(userId)
                return [userId, userData] as const
            })
            const userData = await Promise.all(userDataPromises)
            setUserDisplayData(Object.fromEntries(
                userData.map(([userId, data]) => [userId, { avatar: data.avatar, displayName: data.displayName }])
            ))
        } catch (error) {
            console.error('Error fetching reviews:', error)
        } finally {
            setLoading(false)
        }
    }, [filters])

    useEffect(() => {
        fetchReviews(1)
    }, [fetchReviews])

    const handlePageChange = (page: number) => {
        fetchReviews(page)
        window.scrollTo({ top: 0, behavior: 'smooth' })
    }

    if (loading && reviews.length === 0) {
        return (
            <div className="space-y-6 px-4 lg:px-6">
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                    {[...Array(3)].map((_, i) => (
                        <div key={i} className="glass-card p-6 animate-pulse">
                            <div className="h-4 w-24 bg-secondary/50 rounded-lg mb-4" />
                            <div className="h-8 w-16 bg-secondary/50 rounded-lg" />
                        </div>
                    ))}
                </div>
                <div className="glass-card p-6 animate-pulse">
                    <div className="h-4 w-32 bg-secondary/50 rounded-lg mb-4" />
                    <div className="space-y-3">
                        {[...Array(5)].map((_, i) => (
                            <div key={i} className="h-3 bg-secondary/30 rounded-full" />
                        ))}
                    </div>
                </div>
                <div className="space-y-4">
                    {[...Array(3)].map((_, i) => (
                        <div key={i} className="glass-card p-6 animate-pulse">
                            <div className="flex items-center gap-3 mb-4">
                                <div className="w-10 h-10 rounded-xl bg-secondary/50" />
                                <div className="h-4 w-32 bg-secondary/50 rounded-lg" />
                            </div>
                            <div className="h-4 w-full bg-secondary/30 rounded-lg" />
                        </div>
                    ))}
                </div>
            </div>
        )
    }

    return (
        <div className="space-y-6 px-4 lg:px-6">
            <motion.div
                variants={container}
                initial="hidden"
                animate="show"
                className="grid grid-cols-1 sm:grid-cols-3 gap-4"
            >
                <motion.div variants={item} className="glass-card-hover p-5">
                    <div className="flex items-start justify-between mb-4">
                        <div className="relative p-3 rounded-xl bg-gradient-to-br from-amber-500 to-orange-600 shadow-[0_0_20px_-5px_rgba(245,158,11,0.5)] transition-transform duration-300 group-hover:scale-110">
                            <FontAwesomeIcon icon={faStar} className="w-5 h-5 text-white" />
                            <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-white/20 to-transparent" />
                        </div>
                    </div>
                    <p className="text-3xl font-bold text-foreground tracking-tight font-mono">
                        {stats.averageRating.toFixed(1)}
                    </p>
                    <div className="flex items-center gap-2 mt-1">
                        <StarRating value={stats.averageRating} />
                    </div>
                    <p className="text-sm text-muted-foreground mt-1">Average Rating</p>
                </motion.div>

                <motion.div variants={item} className="glass-card-hover p-5">
                    <div className="flex items-start justify-between mb-4">
                        <div className="relative p-3 rounded-xl bg-gradient-to-br from-violet-500 to-purple-600 shadow-[0_0_20px_-5px_rgba(139,92,246,0.5)] transition-transform duration-300 group-hover:scale-110">
                            <FontAwesomeIcon icon={faTicket} className="w-5 h-5 text-white" />
                            <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-white/20 to-transparent" />
                        </div>
                    </div>
                    <p className="text-3xl font-bold text-foreground tracking-tight font-mono">
                        {stats.totalReviews}
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">Total Reviews</p>
                </motion.div>

                <motion.div variants={item} className="glass-card-hover p-5">
                    <div className="flex items-start justify-between mb-4">
                        <div className="relative p-3 rounded-xl bg-gradient-to-br from-emerald-500 to-green-600 shadow-[0_0_20px_-5px_rgba(16,185,129,0.5)] transition-transform duration-300 group-hover:scale-110">
                            <FontAwesomeIcon icon={faArrowUp} className="w-5 h-5 text-white" />
                            <div className="absolute inset-0 rounded-xl bg-gradient-to-br from-white/20 to-transparent" />
                        </div>
                    </div>
                    <p className="text-3xl font-bold text-foreground tracking-tight font-mono">
                        {stats.totalReviews > 0
                            ? `${Math.round(((stats.ratingDistribution[4] || 0) + (stats.ratingDistribution[5] || 0)) / stats.totalReviews * 100)}%`
                            : '0%'}
                    </p>
                    <p className="text-sm text-muted-foreground mt-1">Satisfaction Rate</p>
                </motion.div>
            </motion.div>

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
                className="glass-card p-5"
            >
                <h3 className="text-sm font-semibold text-foreground mb-4">Rating Distribution</h3>
                <div className="space-y-2.5">
                    {[5, 4, 3, 2, 1].map(rating => (
                        <RatingBar
                            key={rating}
                            rating={rating}
                            count={stats.ratingDistribution[rating] || 0}
                            total={stats.totalReviews}
                        />
                    ))}
                </div>
            </motion.div>

            <motion.div
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.3 }}
                className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3"
            >
                <div className="relative flex-1">
                    <FontAwesomeIcon icon={faSearch} className="absolute left-3.5 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
                    <input
                        type="text"
                        placeholder="Search by ticket ID..."
                        value={filters.search}
                        onChange={(e) => setFilters(prev => ({ ...prev, search: e.target.value }))}
                        className="w-full pl-10 pr-4 py-2.5 rounded-xl glass-input text-sm"
                    />
                </div>
                <div className="flex items-center gap-3">
                    <div className="relative">
                        <FontAwesomeIcon icon={faFilter} className="absolute left-3 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-muted-foreground" />
                        <select
                            value={filters.rating}
                            onChange={(e) => setFilters(prev => ({ ...prev, rating: e.target.value }))}
                            className="pl-9 pr-4 py-2.5 rounded-xl glass-input text-sm appearance-none cursor-pointer"
                        >
                            <option value="all">All Ratings</option>
                            <option value="5">5 Stars</option>
                            <option value="4">4 Stars</option>
                            <option value="3">3 Stars</option>
                            <option value="2">2 Stars</option>
                            <option value="1">1 Star</option>
                        </select>
                    </div>
                    <select
                        value={filters.sortBy}
                        onChange={(e) => setFilters(prev => ({ ...prev, sortBy: e.target.value }))}
                        className="px-4 py-2.5 rounded-xl glass-input text-sm appearance-none cursor-pointer"
                    >
                        <option value="newest">Newest First</option>
                        <option value="oldest">Oldest First</option>
                        <option value="highest">Highest Rated</option>
                        <option value="lowest">Lowest Rated</option>
                    </select>
                </div>
            </motion.div>

            {reviews.length === 0 ? (
                <motion.div
                    initial={{ opacity: 0, y: 20 }}
                    animate={{ opacity: 1, y: 0 }}
                    className="flex flex-col items-center justify-center py-16 px-6"
                >
                    <div className="w-14 h-14 rounded-2xl glass-subtle flex items-center justify-center mb-4">
                        <FontAwesomeIcon icon={faInbox} className="w-6 h-6 text-muted-foreground" />
                    </div>
                    <p className="text-sm font-medium text-foreground mb-1">No reviews found</p>
                    <p className="text-xs text-muted-foreground">Reviews will appear here when users rate their tickets</p>
                </motion.div>
            ) : (
                <motion.div
                    variants={container}
                    initial="hidden"
                    animate="show"
                    className="space-y-4"
                >
                    {reviews.map((review) => {
                        const userData = userDisplayData[review.userId] || userDataService.getDefaultUserData(review.userId)
                        const staffData = review.claimedBy ? (userDisplayData[review.claimedBy] || userDataService.getDefaultUserData(review.claimedBy)) : null

                        return (
                            <motion.div
                                key={review.ticketId}
                                variants={item}
                                className="glass-card-hover p-5"
                            >
                                <div className="flex flex-col sm:flex-row sm:items-start justify-between gap-4">
                                    <div className="flex items-start gap-3">
                                        <img
                                            src={userData.avatar}
                                            alt={userData.displayName}
                                            className="w-10 h-10 rounded-xl ring-2 ring-border/30 object-cover shrink-0"
                                        />
                                        <div className="min-w-0">
                                            <div className="flex items-center gap-2 flex-wrap">
                                                <span className="text-sm font-semibold text-foreground">
                                                    {userData.displayName}
                                                </span>
                                                <Link
                                                    to={`/tickets/${review.ticketId}/transcript`}
                                                    className="text-xs font-mono text-primary hover:text-primary/80 transition-colors"
                                                >
                                                    #{review.ticketId}
                                                </Link>
                                                <span className="inline-flex items-center px-2 py-0.5 rounded-lg glass-subtle text-xs font-medium text-muted-foreground">
                                                    {review.typeName}
                                                </span>
                                            </div>
                                            <div className="flex items-center gap-2 mt-1">
                                                {review.ratingValue !== null && (
                                                    <StarRating value={review.ratingValue} />
                                                )}
                                                {review.ratingValue !== null && (
                                                    <span className="text-xs font-medium text-muted-foreground">
                                                        {review.ratingValue}/5
                                                    </span>
                                                )}
                                            </div>
                                        </div>
                                    </div>
                                    <div className="flex items-center gap-3 text-xs text-muted-foreground shrink-0">
                                        {staffData && (
                                            <div className="flex items-center gap-2">
                                                <img
                                                    src={staffData.avatar}
                                                    alt={staffData.displayName}
                                                    className="w-5 h-5 rounded-md ring-1 ring-border/30 object-cover"
                                                />
                                                <span>{staffData.displayName}</span>
                                            </div>
                                        )}
                                        <span className="font-mono">{review.closedAt}</span>
                                    </div>
                                </div>

                                {review.reviewQuestions.length > 0 && (
                                    <div className="mt-4 flex flex-wrap gap-2">
                                        {review.reviewQuestions.map((q) => (
                                            <div
                                                key={q.id}
                                                className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg glass-subtle text-xs"
                                            >
                                                {q.emoji && <span>{q.emoji}</span>}
                                                <span className="text-muted-foreground">{q.label}:</span>
                                                <span className="font-medium text-foreground">{q.value}/5</span>
                                            </div>
                                        ))}
                                    </div>
                                )}

                                {review.feedback && (
                                    <div className="mt-4 flex gap-3 p-3 rounded-xl glass-subtle">
                                        <FontAwesomeIcon icon={faQuoteLeft} className="w-4 h-4 text-primary/40 shrink-0 mt-0.5" />
                                        <p className="text-sm text-muted-foreground leading-relaxed">
                                            {review.feedback}
                                        </p>
                                    </div>
                                )}
                            </motion.div>
                        )
                    })}
                </motion.div>
            )}

            {pagination.pages > 1 && (
                <motion.div
                    initial={{ opacity: 0 }}
                    animate={{ opacity: 1 }}
                    className="flex items-center justify-between pt-2"
                >
                    <p className="text-xs text-muted-foreground">
                        Showing {(pagination.page - 1) * 20 + 1}-{Math.min(pagination.page * 20, pagination.total)} of {pagination.total}
                    </p>
                    <div className="flex items-center gap-2">
                        <button
                            onClick={() => handlePageChange(pagination.page - 1)}
                            disabled={pagination.page <= 1}
                            className="p-2 rounded-lg glass-button text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                            <FontAwesomeIcon icon={faChevronLeft} className="w-3 h-3" />
                        </button>
                        {Array.from({ length: Math.min(pagination.pages, 5) }, (_, i) => {
                            let pageNum: number
                            if (pagination.pages <= 5) {
                                pageNum = i + 1
                            } else if (pagination.page <= 3) {
                                pageNum = i + 1
                            } else if (pagination.page >= pagination.pages - 2) {
                                pageNum = pagination.pages - 4 + i
                            } else {
                                pageNum = pagination.page - 2 + i
                            }
                            return (
                                <button
                                    key={pageNum}
                                    onClick={() => handlePageChange(pageNum)}
                                    className={`w-8 h-8 rounded-lg text-xs font-medium transition-all duration-200 ${
                                        pageNum === pagination.page
                                            ? 'bg-primary/20 text-primary'
                                            : 'glass-button text-muted-foreground hover:text-foreground'
                                    }`}
                                >
                                    {pageNum}
                                </button>
                            )
                        })}
                        <button
                            onClick={() => handlePageChange(pagination.page + 1)}
                            disabled={pagination.page >= pagination.pages}
                            className="p-2 rounded-lg glass-button text-muted-foreground hover:text-foreground disabled:opacity-30 disabled:cursor-not-allowed"
                        >
                            <FontAwesomeIcon icon={faChevronRight} className="w-3 h-3" />
                        </button>
                    </div>
                </motion.div>
            )}
        </div>
    )
}
