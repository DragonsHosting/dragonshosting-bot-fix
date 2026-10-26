import axios from 'axios';

export interface AddonPage {
    path: string;
    component: string;
    title: string;
    permission: string | null;
    requiredRoles: string[] | null;
    addonName: string;
}

export interface AddonNavItem {
    name: string;
    path: string;
    icon: string | null;
    emoji: string;
    permission: string | null;
    requiredRoles: string[] | null;
    addonName: string;
}

export interface AddonConfig {
    pages: AddonPage[];
    navItems: AddonNavItem[];
}

export interface AddonInfo {
    name: string;
    version: string;
    description: string;
    author: string;
    dashboardInfo?: {
        pages: number;
        navItems: number;
        apiRoutes: number;
        components: string[];
    };
}

class AddonService {
    private configCache: AddonConfig | null = null;
    private configPromise: Promise<AddonConfig> | null = null;

    async getConfig(): Promise<AddonConfig> {
        if (this.configCache) {
            return this.configCache;
        }

        if (this.configPromise) {
            return this.configPromise;
        }

        this.configPromise = axios.get<AddonConfig>('/api/addons/config')
            .then(response => {
                this.configCache = response.data;
                return response.data;
            })
            .finally(() => {
                this.configPromise = null;
            });

        return this.configPromise;
    }

    async getAddons(): Promise<AddonInfo[]> {
        const response = await axios.get<{ addons: AddonInfo[] }>('/api/addons/list');
        return response.data.addons;
    }

    clearCache() {
        this.configCache = null;
    }
}

export const addonService = new AddonService();

