import { useState, useEffect, useRef } from "react"
import { Link, useLocation } from "react-router-dom"
import { FontAwesomeIcon } from "@fortawesome/react-fontawesome"
import {
  faHome,
  faCog,
  faExternalLinkAlt,
  faBars,
  faXmark,
  faCode,
  faTicket,
  faComments,
  faSignOutAlt,
  faChevronLeft,
  faChevronRight,
  faTerminal,
  faStar,
} from "@fortawesome/free-solid-svg-icons"
import api from "../../lib/api/axios"
import { motion, AnimatePresence } from "framer-motion"
import { socket } from "../../socket"
import { auth } from "../../lib/auth/auth"
import GuildSelector from "../dashboard/GuildSelector"

const defaultNavigationItems = [
  { name: "Overview", href: "/", icon: faHome, permission: "Login" },
  { name: "Support", href: "/tickets", icon: faTicket, permission: "Login" },
  { name: "Reviews", href: "/reviews", icon: faStar, permission: "Login" },
  { name: "Builder", href: "/embed-builder", icon: faCode, permission: "Embed" },
  { name: "Commands", href: "/custom-commands", icon: faTerminal, permission: "Settings" },
  { name: "Suggestions", href: "/suggestions", icon: faComments, permission: "Suggestions" },
  { name: "Settings", href: "/settings", icon: faCog, permission: "Settings" },
]

export default function Sidebar({ navName = "", logoUrl = "", onClose }) {
  const location = useLocation()
  const [customItems, setCustomItems] = useState([])
  const [isMobile, setIsMobile] = useState(window.innerWidth < 1024)
  const [isSidebarOpen, setIsSidebarOpen] = useState(window.innerWidth >= 1024)
  const [isCollapsed, setIsCollapsed] = useState(false)
  const [isLoading, setIsLoading] = useState(true)
  const [permissions, setPermissions] = useState(null)
  const [user, setUser] = useState(null)
  const [hoveredItem, setHoveredItem] = useState(null)
  const [logoError, setLogoError] = useState(false)
  const hoverTimeout = useRef(null)

  const [addonNavItems, setAddonNavItems] = useState([])

  useEffect(() => {
    const loadData = async () => {
      try {
        const [configRes, userRes, dashRes, addonsRes] = await Promise.all([
          api.get("/auth/config"),
          api.get("/auth/me"),
          api.get("/settings/dashboard"),
          api.get("/addons/config").catch(() => ({ data: { navItems: [] } }))
        ])
        setPermissions(configRes.data.permissions.Dashboard)
        setUser(userRes.data.user)
        if (dashRes.data?.customNavItems) {
          setCustomItems(dashRes.data.customNavItems)
        }
        if (addonsRes.data?.navItems) {
          setAddonNavItems(addonsRes.data.navItems)
        }
      } catch (e) {
        console.error("Failed to load sidebar data:", e)
      } finally {
        setIsLoading(false)
      }
    }
    loadData()
  }, [])

  useEffect(() => {
    const handleSettingsUpdate = (data) => {
      if (data?.customNavItems) setCustomItems(data.customNavItems)
    }
    socket.on("settings:update", handleSettingsUpdate)
    return () => socket.off("settings:update", handleSettingsUpdate)
  }, [])

  useEffect(() => {
    const handleResize = () => {
      const mobile = window.innerWidth < 1024
      setIsMobile(mobile)
      setIsSidebarOpen(!mobile)
      if (mobile) setIsCollapsed(false)
    }
    window.addEventListener("resize", handleResize)
    return () => window.removeEventListener("resize", handleResize)
  }, [])

  useEffect(() => {
    return () => hoverTimeout.current && clearTimeout(hoverTimeout.current)
  }, [])

  const hasPermission = (perm, requiredRoles = null) => {
    if (!user?.roles) return false

    if (requiredRoles && requiredRoles.length > 0) {
      return requiredRoles.some(r => user.roles.includes(r) || user.roles.some(role => role.id === r))
    }

    if (!perm) return true

    if (!permissions) return false
    if (perm === "Login") {
      return permissions.Login?.some(r => user.roles.includes(r) || user.roles.some(role => role.id === r))
    }
    return (permissions[perm] || []).some(r => user.roles.includes(r) || user.roles.some(role => role.id === r))
  }

  const handleHover = (id) => {
    hoverTimeout.current && clearTimeout(hoverTimeout.current)
    setHoveredItem(id)
  }

  const handleHoverEnd = () => {
    hoverTimeout.current = setTimeout(() => setHoveredItem(null), 150)
  }

  const NavItem = ({ item, index }) => {
    if (!hasPermission(item.permission, item.requiredRoles)) return null

    const isActive = location.pathname === item.href
    const isExternal = item.href?.startsWith("http")
    const showTooltip = isCollapsed && hoveredItem === index

    const itemContent = (
      <>
        <span className={`relative z-10 flex items-center justify-center w-9 h-9 rounded-lg transition-all duration-200 ${
          isActive
            ? "bg-secondary text-foreground" 
            : "text-muted-foreground group-hover:text-foreground group-hover:bg-secondary/50"
        }`}>
          {item.emoji ? (
            <span className="text-sm">{item.emoji}</span>
          ) : (
            <FontAwesomeIcon icon={item.icon} className="w-[18px] h-[18px]" />
          )}
        </span>
        {!isCollapsed && (
          <span className={`flex-1 text-[13px] font-medium transition-all duration-200 ${
            isActive ? "text-foreground" : "text-muted-foreground group-hover:text-foreground"
          }`}>
            {item.name}
          </span>
        )}
        {!isCollapsed && isExternal && (
          <FontAwesomeIcon icon={faExternalLinkAlt} className="w-3 h-3 text-muted-foreground/40" />
        )}
      </>
    )

    const classes = `group relative flex items-center gap-3 px-3 py-2.5 mx-2 rounded-lg transition-all duration-200 ${
      isActive 
        ? "bg-secondary/60" 
        : "hover:bg-secondary/40"
    }`

    return (
      <div className="relative">
        {isExternal ? (
          <a
            href={item.href}
            target="_blank"
            rel="noopener noreferrer"
            className={classes}
            onMouseEnter={() => isCollapsed && handleHover(index)}
            onMouseLeave={handleHoverEnd}
          >
            {itemContent}
          </a>
        ) : (
          <Link
            to={item.href}
            className={classes}
            onClick={() => isMobile && onClose?.()}
            onMouseEnter={() => isCollapsed && handleHover(index)}
            onMouseLeave={handleHoverEnd}
          >
            {itemContent}
          </Link>
        )}
        
        <AnimatePresence>
          {showTooltip && (
            <motion.div 
              initial={{ opacity: 0, x: -5 }}
              animate={{ opacity: 1, x: 0 }}
              exit={{ opacity: 0, x: -5 }}
              transition={{ duration: 0.15 }}
              className="absolute left-full top-1/2 -translate-y-1/2 ml-3 px-3 py-2 bg-card border border-border/40 rounded-lg text-xs font-medium z-50 whitespace-nowrap shadow-sm"
            >
              {item.name}
            </motion.div>
          )}
        </AnimatePresence>
      </div>
    )
  }

  const sidebarWidth = isCollapsed ? "w-[72px]" : "w-64"

  return (
    <>
      <AnimatePresence>
        {(isSidebarOpen || !isMobile) && (
          <motion.aside
            initial={isMobile ? { x: "-100%" } : false}
            animate={{ x: 0 }}
            exit={{ x: "-100%" }}
            transition={{ type: "spring", stiffness: 300, damping: 30 }}
            className={`h-screen flex flex-col ${sidebarWidth} z-40 bg-card border-r border-border/40 transition-[width] duration-300`}
          >
            <div className={`flex items-center h-16 px-4 border-b border-border/30 ${isCollapsed ? "justify-center" : "justify-between"}`}>
              {isLoading ? (
                <div className={`flex items-center gap-3 ${isCollapsed ? "" : "flex-1"}`}>
                  <div className="w-9 h-9 rounded-xl bg-secondary/50 animate-pulse" />
                  {!isCollapsed && <div className="h-4 w-24 bg-secondary/50 rounded-lg animate-pulse" />}
                </div>
              ) : (
                <>
                  <div className={`flex items-center gap-3 min-w-0 ${isCollapsed ? "" : "flex-1"}`}>
                    {logoUrl && !logoError ? (
                      <img src={logoUrl} alt="" className="w-9 h-9 rounded-xl object-cover shrink-0" onError={() => setLogoError(true)} />
                    ) : (
                      <div className="w-9 h-9 rounded-lg bg-secondary flex items-center justify-center text-foreground font-bold text-sm shrink-0">
                        {navName?.charAt(0)?.toUpperCase() || "D"}
                      </div>
                    )}
                    {!isCollapsed && (
                      <span className="text-sm font-semibold text-foreground truncate">
                        {navName || "Dashboard"}
                      </span>
                    )}
                  </div>
                  
                  {!isCollapsed && !isMobile && (
                    <button
                      onClick={() => setIsCollapsed(true)}
                      className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-all duration-200"
                    >
                      <FontAwesomeIcon icon={faChevronLeft} className="w-3 h-3" />
                    </button>
                  )}
                  
                  {isCollapsed && !isMobile && (
                    <button
                      onClick={() => setIsCollapsed(false)}
                      className="absolute -right-3 top-1/2 -translate-y-1/2 w-6 h-6 rounded-full bg-card border border-border/40 flex items-center justify-center text-muted-foreground hover:text-foreground transition-all duration-200 shadow-sm"
                    >
                      <FontAwesomeIcon icon={faChevronRight} className="w-2.5 h-2.5" />
                    </button>
                  )}
                  
                  {isMobile && (
                    <button
                      onClick={() => setIsSidebarOpen(false)}
                      className="p-2 rounded-lg text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-all duration-200"
                    >
                      <FontAwesomeIcon icon={faXmark} className="w-4 h-4" />
                    </button>
                  )}
                </>
              )}
            </div>

            <div className="pt-3">
              <GuildSelector collapsed={isCollapsed} />
            </div>

            <nav className="flex-1 overflow-y-auto py-4">
              {isLoading ? (
                <div className="space-y-2 px-2">
                  {[...Array(5)].map((_, i) => (
                    <div key={i} className="flex items-center gap-3 px-3 py-2.5">
                      <div className="w-9 h-9 rounded-xl bg-secondary/30 animate-pulse" />
                      {!isCollapsed && <div className="h-4 w-24 bg-secondary/30 rounded-lg animate-pulse" />}
                    </div>
                  ))}
                </div>
              ) : (
                <>
                  <div className="space-y-1">
                    {defaultNavigationItems.map((item, i) => (
                      <NavItem key={item.href} item={item} index={i} />
                    ))}
                  </div>

                  {addonNavItems.length > 0 && (
                    <>
                      <div className="mx-4 my-4 border-t border-border/30" />
                      {!isCollapsed && (
                        <div className="px-4 pb-2">
                          <span className="text-[10px] font-semibold text-muted-foreground/50 uppercase tracking-wider">
                            Addons
                          </span>
                        </div>
                      )}
                      <div className="space-y-1">
                        {addonNavItems.map((item, i) => (
                          <NavItem 
                            key={item.path} 
                            item={{ 
                              ...item, 
                              href: item.path,
                              emoji: item.emoji || "📦"
                            }} 
                            index={`addon-${i}`} 
                          />
                        ))}
                      </div>
                    </>
                  )}

                  {customItems.length > 0 && !isCollapsed && (
                    <>
                      <div className="mx-4 my-4 border-t border-border/30" />
                      <div className="space-y-1">
                        {customItems.map((item, i) => (
                          <NavItem 
                            key={item.href} 
                            item={{ ...item, emoji: item.emoji || "🔗" }} 
                            index={`custom-${i}`} 
                          />
                        ))}
                      </div>
                    </>
                  )}
                </>
              )}
            </nav>

            <div className="border-t border-border/30 p-3">
              {user && !isCollapsed && (
                <div className="flex items-center gap-3 px-3 py-3 mb-2 bg-secondary/30 rounded-lg">
                  <div className="relative">
                    <img 
                      src={user.avatar?.startsWith('https://') 
                        ? user.avatar 
                        : user.avatar 
                          ? `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${user.avatar.startsWith('a_') ? 'gif' : 'webp'}?size=64`
                          : `https://cdn.discordapp.com/embed/avatars/0.png`}
                      alt=""
                      className="w-9 h-9 rounded-lg"
                      onError={(e) => {
                        e.target.onerror = null;
                        e.target.src = 'https://cdn.discordapp.com/embed/avatars/0.png';
                      }}
                    />
                    <div className="absolute -bottom-0.5 -right-0.5 w-3 h-3 bg-emerald-500 rounded-full border-2 border-card" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <p className="text-sm font-medium text-foreground truncate">
                      {user.displayName || user.username || "User"}
                    </p>
                    {user.username && user.displayName && user.username.toLowerCase() !== user.displayName.toLowerCase() && (
                      <p className="text-[11px] text-muted-foreground truncate">
                        @{user.username}
                      </p>
                    )}
                  </div>
                </div>
              )}
              
              <div className={`flex ${isCollapsed ? "flex-col items-center gap-2" : "items-center gap-2"}`}>
                <Link
                  to="/user-settings"
                  onClick={() => isMobile && onClose?.()}
                  onMouseEnter={() => isCollapsed && handleHover("settings")}
                  onMouseLeave={handleHoverEnd}
                  className={`relative flex items-center justify-center ${isCollapsed ? "w-10 h-10" : "flex-1 gap-2 px-4 py-2.5"} rounded-lg bg-secondary/30 border border-border/30 text-muted-foreground hover:text-foreground hover:bg-secondary/50 transition-all duration-200`}
                >
                  <FontAwesomeIcon icon={faCog} className="w-4 h-4" />
                  {!isCollapsed && <span className="text-xs font-medium">Settings</span>}
                  
                  <AnimatePresence>
                    {isCollapsed && hoveredItem === "settings" && (
                      <motion.div 
                        initial={{ opacity: 0, x: -5 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -5 }}
                        transition={{ duration: 0.15 }}
                        className="absolute left-full top-1/2 -translate-y-1/2 ml-3 px-3 py-2 bg-card border border-border/40 rounded-lg text-xs font-medium z-50 whitespace-nowrap shadow-sm"
                      >
                        Settings
                      </motion.div>
                    )}
                  </AnimatePresence>
                </Link>
                
                <button
                  onClick={() => {
                    auth.logout()
                    isMobile && onClose?.()
                  }}
                  onMouseEnter={() => isCollapsed && handleHover("logout")}
                  onMouseLeave={handleHoverEnd}
                  className={`relative flex items-center justify-center ${isCollapsed ? "w-10 h-10" : "gap-2 px-4 py-2.5"} rounded-lg bg-secondary/30 border border-border/30 text-muted-foreground hover:text-red-400 hover:bg-red-500/10 hover:border-red-500/20 transition-all duration-200`}
                >
                  <FontAwesomeIcon icon={faSignOutAlt} className="w-4 h-4" />
                  {!isCollapsed && <span className="text-xs font-medium">Logout</span>}
                  
                  <AnimatePresence>
                    {isCollapsed && hoveredItem === "logout" && (
                      <motion.div 
                        initial={{ opacity: 0, x: -5 }}
                        animate={{ opacity: 1, x: 0 }}
                        exit={{ opacity: 0, x: -5 }}
                        transition={{ duration: 0.15 }}
                        className="absolute left-full top-1/2 -translate-y-1/2 ml-3 px-3 py-2 bg-card border border-border/40 rounded-lg text-xs font-medium z-50 whitespace-nowrap shadow-sm"
                      >
                        Logout
                      </motion.div>
                    )}
                  </AnimatePresence>
                </button>
              </div>
            </div>
          </motion.aside>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {!isSidebarOpen && isMobile && (
          <motion.button
            initial={{ opacity: 0, scale: 0.9 }}
            animate={{ opacity: 1, scale: 1 }}
            exit={{ opacity: 0, scale: 0.9 }}
            onClick={() => setIsSidebarOpen(true)}
            className="fixed top-4 left-4 z-50 w-11 h-11 flex items-center justify-center rounded-lg bg-card border border-border/40 text-muted-foreground hover:text-foreground transition-colors lg:hidden shadow-sm"
          >
            <FontAwesomeIcon icon={faBars} className="w-5 h-5" />
          </motion.button>
        )}
      </AnimatePresence>

      <AnimatePresence>
        {isMobile && isSidebarOpen && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            onClick={() => setIsSidebarOpen(false)}
            className="fixed inset-0 bg-background/60 backdrop-blur-sm z-30 lg:hidden"
          />
        )}
      </AnimatePresence>
    </>
  )
}
