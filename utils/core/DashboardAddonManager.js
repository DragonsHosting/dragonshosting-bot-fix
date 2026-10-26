const fs = require('fs');
const path = require('path');

class DashboardAddonManager {
    constructor() {
        this.pages = new Map();
        this.navItems = new Map();
        this.apiRoutes = new Map();
        this.addonAssets = new Map();
    }

    registerPage(addonName, pageConfig) {
        const pageId = `${addonName}:${pageConfig.path}`;
        
        this.pages.set(pageId, {
            addonName,
            path: pageConfig.path,
            component: pageConfig.component,
            title: pageConfig.title || addonName,
            permission: pageConfig.permission || null,
            requiredRoles: pageConfig.requiredRoles || null,
            props: pageConfig.props || {}
        });

        return pageId;
    }

    registerNavItem(addonName, navConfig) {
        const navId = `${addonName}:${navConfig.path}`;
        
        this.navItems.set(navId, {
            addonName,
            name: navConfig.name,
            path: navConfig.path,
            icon: navConfig.icon || null,
            emoji: navConfig.emoji || '📦',
            permission: navConfig.permission || null,
            requiredRoles: navConfig.requiredRoles || null,
            order: navConfig.order || 100
        });

        return navId;
    }

    registerApiRoute(addonName, routeConfig) {
        const method = (routeConfig.method || 'get').toLowerCase();
        const routeId = `${addonName}:${method}:${routeConfig.path}`;
        
        this.apiRoutes.set(routeId, {
            addonName,
            method: method,
            path: routeConfig.path,
            fullPath: routeConfig.fullPath || null,
            useGlobalAuth: routeConfig.useGlobalAuth === true,
            handler: routeConfig.handler,
            middleware: routeConfig.middleware || [],
            requiredRoles: routeConfig.requiredRoles || null
        });

        return routeId;
    }

    registerAssets(addonName, assetsPath) {
        this.addonAssets.set(addonName, assetsPath);
    }

    unregisterAddon(addonName) {
        for (const [id, page] of this.pages) {
            if (page.addonName === addonName) {
                this.pages.delete(id);
            }
        }

        for (const [id, nav] of this.navItems) {
            if (nav.addonName === addonName) {
                this.navItems.delete(id);
            }
        }

        for (const [id, route] of this.apiRoutes) {
            if (route.addonName === addonName) {
                this.apiRoutes.delete(id);
            }
        }

        this.addonAssets.delete(addonName);
    }

    getPages() {
        return Array.from(this.pages.values());
    }

    getNavItems() {
        return Array.from(this.navItems.values()).sort((a, b) => a.order - b.order);
    }

    getApiRoutes() {
        return Array.from(this.apiRoutes.values());
    }

    getAddonAssets(addonName) {
        return this.addonAssets.get(addonName);
    }

    getAllAssets() {
        return Object.fromEntries(this.addonAssets);
    }

    getClientConfig() {
        return {
            pages: this.getPages().map(p => ({
                path: p.path,
                component: p.component,
                title: p.title,
                permission: p.permission,
                requiredRoles: p.requiredRoles,
                addonName: p.addonName
            })),
            navItems: this.getNavItems().map(n => ({
                name: n.name,
                path: n.path,
                icon: n.icon,
                emoji: n.emoji,
                permission: n.permission,
                requiredRoles: n.requiredRoles,
                addonName: n.addonName
            }))
        };
    }

    async loadAddonDashboard(addonName, addonPath) {
        const dashboardPath = path.join(addonPath, 'dashboard');
        
        if (!fs.existsSync(dashboardPath)) {
            return { success: false, reason: 'No dashboard folder' };
        }

        const results = {
            pages: 0,
            navItems: 0,
            apiRoutes: 0,
            components: []
        };

        const configPath = path.join(dashboardPath, 'config.js');
        if (fs.existsSync(configPath)) {
            try {
                delete require.cache[require.resolve(configPath)];
                const config = require(configPath);

                if (config.pages) {
                    for (const page of config.pages) {
                        this.registerPage(addonName, page);
                        results.pages++;
                    }
                }

                if (config.navItems) {
                    for (const nav of config.navItems) {
                        this.registerNavItem(addonName, nav);
                        results.navItems++;
                    }
                }

                if (config.apiRoutes) {
                    for (const route of config.apiRoutes) {
                        this.registerApiRoute(addonName, route);
                        results.apiRoutes++;
                    }
                }
            } catch (error) {
                console.error(`[DASHBOARD ADDON] Error loading config for ${addonName}:`, error);
                return { success: false, error: error.message };
            }
        }

        const componentsPath = path.join(dashboardPath, 'components');
        if (fs.existsSync(componentsPath)) {
            this.registerAssets(addonName, componentsPath);
            results.components = fs.readdirSync(componentsPath).filter(f => 
                f.endsWith('.jsx') || f.endsWith('.tsx') || f.endsWith('.js')
            );
        }

        const pagesPath = path.join(dashboardPath, 'pages');
        if (fs.existsSync(pagesPath)) {
            const pageFiles = fs.readdirSync(pagesPath).filter(f => 
                f.endsWith('.jsx') || f.endsWith('.tsx') || f.endsWith('.js')
            );
            
            for (const file of pageFiles) {
                const pageName = path.basename(file, path.extname(file));
                const pagePath = `/addon/${addonName.toLowerCase()}/${pageName.toLowerCase()}`;
                
                if (!this.pages.has(`${addonName}:${pagePath}`)) {
                    this.registerPage(addonName, {
                        path: pagePath,
                        component: `addon/${addonName}/pages/${pageName}`,
                        title: pageName.charAt(0).toUpperCase() + pageName.slice(1)
                    });
                    results.pages++;
                }
            }
        }

        return { success: true, results };
    }

    setupExpressRoutes(app, authMiddleware) {
        for (const route of this.getApiRoutes()) {
            const fullPath = route.fullPath || '/api/addons/' + route.addonName.toLowerCase() + route.path;
            const middlewares = route.middleware || [];

            if (authMiddleware && route.useGlobalAuth) {
                middlewares.unshift(authMiddleware);
            }

            const wrappedHandler = async (req, res, next) => {
                try {
                    await route.handler(req, res, next);
                } catch (error) {
                    console.error(`[ADDON API] Error in ${fullPath}:`, error);
                    if (!res.headersSent) {
                        res.status(500).json({ error: 'Internal addon error' });
                    }
                }
            };

            app[route.method.toLowerCase()](fullPath, ...middlewares, wrappedHandler);
        }
    }
}

module.exports = DashboardAddonManager;