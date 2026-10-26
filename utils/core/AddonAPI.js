'use strict';

class AddonAPI {
    constructor({ name, client, config, lang, commands, eventManager, dashboardManager, logger }) {
        this.name = name;
        this.client = client;
        this.config = config;
        this.lang = lang;
        this.commandConfig = commands || null;
        this.events = eventManager;
        this.dashboard = dashboardManager;
        this.logger = logger || console;
        this.services = AddonAPI.services;
        this.models = AddonAPI.models;
        this.statistics = AddonAPI.statistics;
    }

    registerService(name, service) {
        if (!name || !service) throw new TypeError('A service name and value are required');
        if (this.services.has(name)) throw new Error(`Service '${name}' is already registered`);
        this.services.set(name, { owner: this.name, service });
        return service;
    }

    getService(name) {
        return this.services.get(name)?.service || null;
    }

    registerStatistics(name, provider) {
        if (!name || typeof provider !== 'function') throw new TypeError('A statistics provider is required');
        if (this.statistics.has(name)) throw new Error('Statistics provider ' + name + ' is already registered');
        this.statistics.set(name, { owner: this.name, provider });
        return () => this.statistics.delete(name);
    }

    registerModel(name, model) {
        if (!name || !model) throw new TypeError('A model name and value are required');
        if (this.models.has(name)) throw new Error(`Model '${name}' is already registered`);
        this.models.set(name, { owner: this.name, model });
        return model;
    }

    getModel(name) {
        return this.models.get(name)?.model || null;
    }

    on(eventName, handler, options = {}) {
        if (typeof handler !== 'function') throw new TypeError('Event handler must be a function');
        this.events.registerEventHandler(this.name, eventName, handler, options.priority || 0);
        return () => this.events.unregisterEventHandler?.(this.name, eventName, handler);
    }

    onDiscord(eventName, handler, options = {}) {
        return this.on(`discord:${eventName}`, handler, options);
    }

    emit(eventName, payload, options) {
        return this.events.emitAddonEvent(eventName, payload, options);
    }

    registerCommand(command, enabled = true) {
        if (!enabled || !command?.data || typeof command.execute !== 'function') return false;
        const definitions = Array.isArray(command.data) ? command.data : [command.data];
        for (const definition of definitions) {
            const name = definition.name;
            if (!name) continue;
            if (this.commandConfig && !this.commandConfig[name]) continue;
            this.client.slashCommands.set(name, command);
            if (Array.isArray(global.slashCommands)) {
                global.slashCommands.push(typeof definition.toJSON === 'function' ? definition.toJSON() : definition);
            }
        }
        return true;
    }

    registerDashboardPage(page) {
        return this.dashboard.registerPage(this.name, page);
    }

    registerDashboardNavItem(item) {
        return this.dashboard.registerNavItem(this.name, item);
    }

    registerDashboardRoute(route) {
        return this.dashboard.registerApiRoute(this.name, route);
    }
}

AddonAPI.services = new Map();
AddonAPI.models = new Map();
AddonAPI.statistics = new Map();

module.exports = AddonAPI;
