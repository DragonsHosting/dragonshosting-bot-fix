import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'
import yaml from 'js-yaml'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

function loadDashboardConfig() {
    try {
        const dashboardConfigPath = path.join(__dirname, '..', 'config', 'modules', 'dashboard.yml')
        if (fs.existsSync(dashboardConfigPath)) {
            const content = fs.readFileSync(dashboardConfigPath, 'utf8')
            const config = yaml.load(content)
            return {
                port: config?.Dashboard?.Port || 5000,
                url: config?.Dashboard?.Url || 'http://localhost:5000'
            }
        }
    } catch (e) {}
    return { port: 5000, url: 'http://localhost:5000' }
}

export default defineConfig(({ command }) => {
    const dashboardConfig = loadDashboardConfig()
    const apiPort = dashboardConfig.port
    
    let allowedHosts = ['localhost', '127.0.0.1']
    try {
        let urlString = dashboardConfig.url.trim()
        if (!urlString.startsWith('http://') && !urlString.startsWith('https://')) {
            urlString = 'http://' + urlString
        }
        const urlObj = new URL(urlString)
        const hostname = urlObj.hostname
        if (hostname && hostname !== 'localhost' && hostname !== '127.0.0.1') {
            allowedHosts.push(hostname)
            if (hostname.startsWith('www.')) {
                allowedHosts.push(hostname.slice(4))
            } else {
                allowedHosts.push('www.' + hostname)
            }
        }
    } catch (e) {
        const match = dashboardConfig.url.match(/^(?:https?:\/\/)?([^:/\s]+)/i)
        if (match && match[1] && match[1] !== 'localhost' && match[1] !== '127.0.0.1') {
            allowedHosts.push(match[1])
        }
    }

    return {
        root: '.',
        plugins: [
            react()
        ],
        server: {
            host: true,
            allowedHosts: allowedHosts,
            proxy: {
                '/api': {
                    target: `http://localhost:${apiPort}`,
                    changeOrigin: true,
                    secure: false,
                    ws: true
                }
            },
            fs: {
                allow: [
                    path.resolve(__dirname, '..'),
                    path.resolve(__dirname, '..', 'addons')
                ],
                strict: false
            }
        },
        build: {
            outDir: 'dist',
            emptyOutDir: true,
            rollupOptions: {
                input: {
                    main: path.resolve(__dirname, 'index.html')
                }
            }
        },
        resolve: {
            alias: {
                '@': path.resolve(__dirname, 'src'),
                '@addons': path.resolve(__dirname, '..', 'addons'),
                '/addons': path.resolve(__dirname, '..', 'addons')
            }
        }
    }
})