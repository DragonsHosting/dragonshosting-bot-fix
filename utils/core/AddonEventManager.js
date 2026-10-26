const EventEmitter = require('events');
const path = require('path');

class AddonEventManager extends EventEmitter {
    constructor() {
        super();
        this.setMaxListeners(100);
        this.addons = new Map();
        this.eventHandlers = new Map();
        this.context = {
            client: null,
            config: null,
            lang: null,
            commands: null
        };
    }

    setContext(client, config, lang, commands = null) {
        this.context.client = client;
        this.context.config = config;
        this.context.lang = lang;
        this.context.commands = commands;
    }

    registerAddon(addonName, addonConfig) {
        if (this.addons.has(addonName)) {
            throw new Error(`Addon '${addonName}' is already registered`);
        }

        const addon = {
            name: addonName,
            version: addonConfig.version || '1.0.0',
            description: addonConfig.description || '',
            events: addonConfig.events || {},
            permissions: addonConfig.permissions || [],
            priority: addonConfig.priority || 0,
            enabled: true
        };

        this.addons.set(addonName, addon);

        Object.keys(addon.events).forEach(eventName => {
            this.registerEventHandler(addonName, eventName, addon.events[eventName], addon.priority);
        });

        this.emitSafe('addon:registered', {
            name: addonName,
            addon: addon,
            timestamp: new Date()
        });

        return addon;
    }

    registerEventHandler(addonName, eventName, handler, priority = 0) {
        if (!this.eventHandlers.has(eventName)) {
            this.eventHandlers.set(eventName, []);
        }

        const handlerInfo = {
            addonName,
            handler,
            priority,
            enabled: true
        };

        const handlers = this.eventHandlers.get(eventName);
        handlers.push(handlerInfo);
        handlers.sort((a, b) => b.priority - a.priority);

        this.eventHandlers.set(eventName, handlers);
    }

    unregisterEventHandler(addonName, eventName, handler) {
        const handlers = this.eventHandlers.get(eventName);
        if (!handlers) return false;
        const remaining = handlers.filter(item => !(item.addonName === addonName && item.handler === handler));
        if (remaining.length === handlers.length) return false;
        if (remaining.length) this.eventHandlers.set(eventName, remaining);
        else this.eventHandlers.delete(eventName);
        return true;
    }

    unregisterAddon(addonName) {
        if (!this.addons.has(addonName)) {
            return false;
        }

        const addon = this.addons.get(addonName);
        
        this.eventHandlers.forEach((handlers, eventName) => {
            const filteredHandlers = handlers.filter(h => h.addonName !== addonName);
            if (filteredHandlers.length === 0) {
                this.eventHandlers.delete(eventName);
            } else {
                this.eventHandlers.set(eventName, filteredHandlers);
            }
        });

        this.addons.delete(addonName);

        this.emitSafe('addon:unregistered', {
            name: addonName,
            addon: addon,
            timestamp: new Date()
        });

        return true;
    }

    async emitAddonEvent(eventName, eventData, options = {}) {
        const {
            timeout = 5000,
            allowParallel = true,
            stopOnError = false,
            stopOnResult = false
        } = options;

        const handlers = this.eventHandlers.get(eventName) || [];
        const enabledHandlers = handlers.filter(h => {
            const addon = this.addons.get(h.addonName);
            return addon && addon.enabled && h.enabled;
        });

        if (enabledHandlers.length === 0) {
            return { success: true, results: [] };
        }

        const context = {
            ...this.context,
            eventName,
            timestamp: new Date(),
            guild: eventData.guild || null,
            user: eventData.user || null
        };

        const results = [];

        if (allowParallel) {
            const promises = enabledHandlers.map(async (handlerInfo) => {
                try {
                    let timeoutId;
                    const timeoutPromise = new Promise((_, reject) => {
                        timeoutId = setTimeout(() => reject(new Error(`Handler timeout after ${timeout}ms`)), timeout);
                    });

                    const handlerPromise = Promise.resolve(handlerInfo.handler(eventData, context));
                    let result;
                    try {
                        result = await Promise.race([handlerPromise, timeoutPromise]);
                    } finally {
                        clearTimeout(timeoutId);
                    }

                    return {
                        addonName: handlerInfo.addonName,
                        success: true,
                        result: result,
                        error: null
                    };
                } catch (error) {
                    console.error(`[ADDON] Error in ${handlerInfo.addonName} handling ${eventName}:`, error);
                    return {
                        addonName: handlerInfo.addonName,
                        success: false,
                        result: null,
                        error: error.message
                    };
                }
            });

            const handlerResults = await Promise.allSettled(promises);
            results.push(...handlerResults.map(r => r.status === 'fulfilled' ? r.value : {
                success: false,
                error: r.reason?.message || 'Unknown error'
            }));
        } else {
            for (const handlerInfo of enabledHandlers) {
                try {
                    let timeoutId;
                    const timeoutPromise = new Promise((_, reject) => {
                        timeoutId = setTimeout(() => reject(new Error(`Handler timeout after ${timeout}ms`)), timeout);
                    });

                    const handlerPromise = Promise.resolve(handlerInfo.handler(eventData, context));
                    let result;
                    try {
                        result = await Promise.race([handlerPromise, timeoutPromise]);
                    } finally {
                        clearTimeout(timeoutId);
                    }

                    results.push({
                        addonName: handlerInfo.addonName,
                        success: true,
                        result: result,
                        error: null
                    });
                    if (stopOnResult && result === true) break;
                } catch (error) {
                    console.error(`[ADDON] Error in ${handlerInfo.addonName} handling ${eventName}:`, error);
                    results.push({
                        addonName: handlerInfo.addonName,
                        success: false,
                        result: null,
                        error: error.message
                    });

                    if (stopOnError) {
                        break;
                    }
                }
            }
        }

        const hasErrors = results.some(r => !r.success);
        return {
            success: !hasErrors || !stopOnError,
            results,
            eventName,
            handlerCount: enabledHandlers.length
        };
    }

    emitSafe(eventName, eventData, options = {}) {
        setImmediate(async () => {
            try {
                await this.emitAddonEvent(eventName, eventData, options);
            } catch (error) {
                console.error(`[ADDON] Failed to emit event ${eventName}:`, error);
            }
        });
    }

    enableAddon(addonName) {
        const addon = this.addons.get(addonName);
        if (addon) {
            addon.enabled = true;
            return true;
        }
        return false;
    }

    disableAddon(addonName) {
        const addon = this.addons.get(addonName);
        if (addon) {
            addon.enabled = false;
            return true;
        }
        return false;
    }

    getAddonInfo(addonName) {
        return this.addons.get(addonName) || null;
    }

    getAllAddons() {
        return Array.from(this.addons.values());
    }

    getEventHandlers(eventName) {
        return this.eventHandlers.get(eventName) || [];
    }

    getAllEvents() {
        return Array.from(this.eventHandlers.keys());
    }

    getStats() {
        const totalAddons = this.addons.size;
        const enabledAddons = Array.from(this.addons.values()).filter(a => a.enabled).length;
        const totalEvents = this.eventHandlers.size;
        const totalHandlers = Array.from(this.eventHandlers.values())
            .reduce((sum, handlers) => sum + handlers.length, 0);

        return {
            totalAddons,
            enabledAddons,
            totalEvents,
            totalHandlers
        };
    }
}

module.exports = AddonEventManager;
