const fs = require('fs');
const path = require('path');
const AddonEventManager = require('./AddonEventManager');
const DashboardAddonManager = require('./DashboardAddonManager');
const AddonAPI = require('./AddonAPI');

class AddonLoader {
    constructor() {
        this.eventManager = new AddonEventManager();
        this.dashboardManager = new DashboardAddonManager();
        this.loadedAddons = new Map();
        this.addonPaths = new Map();
    }

    getDashboardManager() {
        return this.dashboardManager;
    }

    setContext(client, config, lang, commands) {
        this.eventManager.setContext(client, config, lang, commands);
    }

    getFilesRecursively(dir) {
        let results = [];
        const list = fs.readdirSync(dir);

        list.forEach(file => {
            const filePath = path.join(dir, file);
            const stat = fs.statSync(filePath);

            if (stat && stat.isDirectory()) {
                results = results.concat(this.getFilesRecursively(filePath));
            } else if (file.endsWith('.js')) {
                results.push(filePath);
            }
        });

        return results;
    }

    async loadAddonsFromDirectory(addonDir = './addons') {
        if (!fs.existsSync(addonDir)) {
            return { loadedCount: 0, errorCount: 0 };
        }

        const files = [];
        for (const entry of fs.readdirSync(addonDir, { withFileTypes: true })) {
            if (entry.isDirectory()) {
                const manifest = path.join(addonDir, entry.name, 'index.js');
                if (fs.existsSync(manifest)) files.push(manifest);
                if (['events', 'ModPanel', 'SecuritySystemUltimatePanel'].includes(entry.name)) {
                    files.push(...this.getFilesRecursively(path.join(addonDir, entry.name)));
                }
            } else if (entry.isFile() && entry.name.endsWith('.js')) {
                files.push(path.join(addonDir, entry.name));
            }
        }
        let loadedCount = 0;
        let errorCount = 0;

        for (const file of files) {
            try {
                if (file.includes("cmd_") || 
                    file.includes(path.sep + "commands" + path.sep) ||
                    file.includes(path.sep + "models" + path.sep) || 
                    file.includes(path.sep + "schema" + path.sep) || 
                    file.includes(path.sep + "schemas" + path.sep) || 
                    file.includes(path.sep + "data" + path.sep) || 
                    file.includes(path.sep + "utils" + path.sep) ||
                    file.includes(path.sep + "dashboard" + path.sep) ||
                    file.endsWith("config.yml") ||
                    file.endsWith(".json")) {
                    continue;
                }

                const result = await this.loadAddon(file);
                if (result.success) {
                    loadedCount++;
                } else {
                    errorCount++;
                }
            } catch (error) {
                console.error(`[ADDON] Error loading addon from ${file}:`, error);
                errorCount++;
            }
        }

        // Register addon API routes with dashboard if available
        if (global.dashboardApp && this.dashboardManager.getApiRoutes().length > 0) {
            this.dashboardManager.setupExpressRoutes(global.dashboardApp, global.dashboardAuth);
        }

        return { loadedCount, errorCount };
    }

    async loadAddon(addonPath) {
        try {
            const absolutePath = path.resolve(addonPath);
            const folderName = addonPath.match(/\/addons\/([^/]+)/) ? 
                addonPath.match(/\/addons\/([^/]+)/)[1] : 
                path.basename(addonPath, '.js');

            delete require.cache[absolutePath];
            const addonModule = require(absolutePath);

            if (this.isNewFormatAddon(addonModule)) {
                return await this.loadNewFormatAddon(addonModule, folderName, absolutePath);
            } else {
                return await this.loadLegacyAddon(addonModule, folderName, absolutePath);
            }
        } catch (error) {
            console.error(`[ADDON] Failed to load addon from ${addonPath}:`, error);
            return { success: false, error: error.message };
        }
    }

    isNewFormatAddon(addonModule) {
        return addonModule && 
               typeof addonModule === 'object' && 
               addonModule.name && 
               (addonModule.events || addonModule.run);
    }

    async loadNewFormatAddon(addonModule, folderName, absolutePath) {
        const addonName = addonModule.name || folderName;

        if (this.loadedAddons.has(addonName)) {
            await this.unloadAddon(addonName);
        }

        const addonConfig = {
            name: addonName,
            version: addonModule.version || '1.0.0',
            description: addonModule.description || '',
            events: addonModule.events || {},
            permissions: addonModule.permissions || [],
            priority: addonModule.priority || 0,
            dependencies: addonModule.dependencies || [],
            author: addonModule.author || 'Unknown',
            enabled: true,
            hasDashboard: false
        };

        this.eventManager.registerAddon(addonName, addonConfig);

        let cleanup = null;
        if (addonModule.run && typeof addonModule.run === 'function') {
            try {
                const ctx = this.eventManager.context;
                const api = new AddonAPI({
                    name: addonName,
                    client: ctx.client,
                    config: ctx.config,
                    lang: ctx.lang,
                    commands: ctx.commands,
                    eventManager: this.eventManager,
                    dashboardManager: this.dashboardManager
                });
                cleanup = await addonModule.run(ctx.client, this.eventManager, api);
            } catch (error) {
                console.error(`[ADDON] Error executing run function for ${addonName}:`, error);
                this.eventManager.unregisterAddon(addonName);
                this.dashboardManager.unregisterAddon(addonName);
                for (const [key, record] of AddonAPI.services) {
                    if (record.owner === addonName) AddonAPI.services.delete(key);
                }
                for (const [key, record] of AddonAPI.models) {
                    if (record.owner === addonName) AddonAPI.models.delete(key);
                }
                for (const [key, record] of AddonAPI.statistics) {
                    if (record.owner === addonName) AddonAPI.statistics.delete(key);
                }
                return { success: false, error: error.message };
            }
        }

        const addonDir = path.dirname(absolutePath);
        const dashboardResult = await this.dashboardManager.loadAddonDashboard(addonName, addonDir);
        if (dashboardResult.success) {
            addonConfig.hasDashboard = true;
            addonConfig.dashboardInfo = dashboardResult.results;
        }

        if (addonModule.dashboard) {
            if (addonModule.dashboard.pages) {
                for (const page of addonModule.dashboard.pages) {
                    this.dashboardManager.registerPage(addonName, page);
                }
            }
            if (addonModule.dashboard.navItems) {
                for (const nav of addonModule.dashboard.navItems) {
                    this.dashboardManager.registerNavItem(addonName, nav);
                }
            }
            if (addonModule.dashboard.apiRoutes) {
                for (const route of addonModule.dashboard.apiRoutes) {
                    this.dashboardManager.registerApiRoute(addonName, route);
                }
            }
            addonConfig.hasDashboard = true;
        }

        this.loadedAddons.set(addonName, {
            module: addonModule,
            config: addonConfig,
            cleanup,
            path: absolutePath,
            loadedAt: new Date(),
            type: 'new'
        });

        this.addonPaths.set(absolutePath, addonName);

        await this.eventManager.emitAddonEvent('addon:loaded', {
            name: addonName,
            config: addonConfig,
            path: absolutePath
        });

        return { success: true, name: addonName, type: 'new' };
    }

    async loadLegacyAddon(addonModule, folderName, absolutePath) {
        const addonName = `legacy_${folderName}`;

        if (this.loadedAddons.has(addonName)) {
            return { success: false, error: 'Already loaded' };
        }

        if (addonModule.run && typeof addonModule.run === 'function') {
            try {
                await addonModule.run(this.eventManager.context.client);
                
                this.loadedAddons.set(addonName, {
                    module: addonModule,
                    config: {
                        name: addonName,
                        version: '1.0.0',
                        description: 'Legacy addon',
                        type: 'legacy'
                    },
                    path: absolutePath,
                    loadedAt: new Date(),
                    type: 'legacy'
                });

                this.addonPaths.set(absolutePath, addonName);

                await this.eventManager.emitAddonEvent('addon:loaded', {
                    name: addonName,
                    path: absolutePath,
                    type: 'legacy'
                });

                return { success: true, name: addonName, type: 'legacy' };
            } catch (error) {
                console.error(`[ADDON] Error running legacy addon ${addonName}:`, error);
                return { success: false, error: error.message };
            }
        } else {
            return { success: false, error: 'Invalid format' };
        }
    }

    async unloadAddon(addonName) {
        if (!this.loadedAddons.has(addonName)) {
            return { success: false, error: 'Addon not loaded' };
        }

        const addon = this.loadedAddons.get(addonName);

        try {
            if (addon.type === 'new') {
                this.eventManager.unregisterAddon(addonName);
            }

            this.dashboardManager.unregisterAddon(addonName);

            if (typeof addon.cleanup === 'function') {
                await addon.cleanup();
            } else if (addon.module.unload && typeof addon.module.unload === 'function') {
                await addon.module.unload();
            }

            for (const [key, record] of AddonAPI.services) {
                if (record.owner === addonName) AddonAPI.services.delete(key);
            }
            for (const [key, record] of AddonAPI.models) {
                if (record.owner === addonName) AddonAPI.models.delete(key);
            }
            for (const [key, record] of AddonAPI.statistics) {
                if (record.owner === addonName) AddonAPI.statistics.delete(key);
            }

            delete require.cache[addon.path];
            this.loadedAddons.delete(addonName);
            this.addonPaths.delete(addon.path);

            await this.eventManager.emitAddonEvent('addon:unloaded', {
                name: addonName,
                path: addon.path,
                type: addon.type
            });

            return { success: true };
        } catch (error) {
            console.error(`[ADDON] Error unloading addon ${addonName}:`, error);
            return { success: false, error: error.message };
        }
    }

    async unloadAll() {
        const results = await Promise.allSettled(
            Array.from(this.loadedAddons.keys(), name => this.unloadAddon(name))
        );
        return results;
    }

    async reloadAddon(addonName) {
        const addon = this.loadedAddons.get(addonName);
        if (!addon) {
            return { success: false, error: 'Addon not loaded' };
        }

        const addonPath = addon.path;
        await this.unloadAddon(addonName);
        return await this.loadAddon(addonPath);
    }

    getAddon(addonName) {
        return this.loadedAddons.get(addonName) || null;
    }

    getModel(name) {
        return AddonAPI.models.get(name)?.model || null;
    }

    async getStatistics(scope) {
        const AddonAPI = require('./AddonAPI');
        const result = {};
        for (const [name, record] of AddonAPI.statistics) {
            try { Object.assign(result, await record.provider(scope)); }
            catch (error) { console.error('[ADDON] Statistics provider ' + name + ' failed:', error.message); }
        }
        return result;
    }

    getService(name) {
        return AddonAPI.services.get(name)?.service || null;
    }

    getAllAddons() {
        return Array.from(this.loadedAddons.entries()).map(([name, addon]) => ({
            name,
            ...addon.config,
            path: addon.path,
            loadedAt: addon.loadedAt,
            type: addon.type
        }));
    }

    getEventManager() {
        return this.eventManager;
    }

    async enableAddon(addonName) {
        const addon = this.loadedAddons.get(addonName);
        if (!addon) {
            return { success: false, error: 'Addon not found' };
        }

        if (addon.type === 'new') {
            return { success: this.eventManager.enableAddon(addonName) };
        }

        return { success: false, error: 'Cannot enable/disable legacy addons' };
    }

    async disableAddon(addonName) {
        const addon = this.loadedAddons.get(addonName);
        if (!addon) {
            return { success: false, error: 'Addon not found' };
        }

        if (addon.type === 'new') {
            return { success: this.eventManager.disableAddon(addonName) };
        }

        return { success: false, error: 'Cannot enable/disable legacy addons' };
    }

    getStats() {
        const eventManagerStats = this.eventManager.getStats();
        const legacyAddons = Array.from(this.loadedAddons.values()).filter(a => a.type === 'legacy').length;
        const newAddons = Array.from(this.loadedAddons.values()).filter(a => a.type === 'new').length;

        return {
            ...eventManagerStats,
            legacyAddons,
            newAddons,
            totalLoadedAddons: this.loadedAddons.size
        };
    }
}

module.exports = AddonLoader;
