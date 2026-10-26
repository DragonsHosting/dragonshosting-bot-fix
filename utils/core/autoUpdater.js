const fs = require('fs');
const path = require('path');
const https = require('https');
const http = require('http');
const { execSync, spawn } = require('child_process');
const colors = require('ansi-colors');
const crypto = require('crypto');

let AdmZip;
try {
    AdmZip = require('adm-zip');
} catch {
    AdmZip = null;
}

let archiver;
try {
    archiver = require('archiver');
} catch {
    archiver = null;
}

class AutoUpdater {
    constructor(config) {
        this.enabled = false;
        this.checkInterval = 3600000;
        this.updateServer = config?.UpdateServer || process.env.BOT_UPDATE_SERVER || '';
        this.updateKey = '';
        this.guildId = '';
        this.rootDir = path.join(__dirname, '..', '..');
        this.packagePath = path.join(this.rootDir, 'package.json');
        this.currentVersion = this.getCurrentVersion();
        this.isUpdating = false;
        this.intervalId = null;
        this.clientSecret = null;
        this.autoRestart = true;
        
        this.preservePaths = [
            'config',
            '.env',
            '.git',
            'temp',
            'addons'
        ];
        
        this.botPaths = [
            'commands',
            'dashboard',
            'events',
            'models',
            'utils',
            '.npm',
            '.cache',
            'node_modules',
            'index.js',
            'package-lock.json',
            'package.json',
            'utils.js'
        ];
        
        this.backupDir = path.join(this.rootDir, 'backups');
    }

    getCurrentVersion() {
        try {
            const pkg = JSON.parse(fs.readFileSync(this.packagePath, 'utf8'));
            return pkg.version;
        } catch (error) {
            return '0.0.0';
        }
    }

    compareVersions(v1, v2) {
        const parts1 = v1.split('.').map(Number);
        const parts2 = v2.split('.').map(Number);
        
        for (let i = 0; i < Math.max(parts1.length, parts2.length); i++) {
            const p1 = parts1[i] || 0;
            const p2 = parts2[i] || 0;
            if (p1 > p2) return 1;
            if (p1 < p2) return -1;
        }
        return 0;
    }

    generateSignature(timestamp) {
        if (!this.clientSecret) {
            const data = `${this.updateKey}:${timestamp}:${this.guildId}`;
            return crypto.createHmac('sha256', this.updateKey).update(data).digest('hex');
        }
        const data = `${this.updateKey}:${timestamp}:${this.guildId}`;
        return crypto.createHmac('sha256', this.clientSecret).update(data).digest('hex');
    }

    makeRequest(urlString, options = {}) {
        return new Promise((resolve, reject) => {
            const url = new URL(urlString);
            const protocol = url.protocol === 'https:' ? https : http;
            const timestamp = Date.now().toString();
            
            const reqOptions = {
                hostname: url.hostname,
                port: url.port || (url.protocol === 'https:' ? 443 : 80),
                path: url.pathname + url.search,
                method: options.method || 'GET',
                headers: {
                    'User-Agent': 'DragonHostingBot-AutoUpdater',
                    'X-License-Key': this.updateKey,
                    'X-Guild-ID': this.guildId,
                    'X-Timestamp': timestamp,
                    'X-Signature': this.generateSignature(timestamp),
                    'X-Current-Version': this.currentVersion,
                    ...options.headers
                }
            };

            const req = protocol.request(reqOptions, (res) => {
                if (res.statusCode === 301 || res.statusCode === 302) {
                    this.makeRequest(res.headers.location, options)
                        .then(resolve)
                        .catch(reject);
                    return;
                }

                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    resolve({ statusCode: res.statusCode, data, headers: res.headers });
                });
            });

            req.on('error', reject);
            req.end();
        });
    }

    async fetchVersion() {
        const timeoutMs = 8000;
        
        const fetchPromise = new Promise((resolve, reject) => {
            const url = new URL(`${this.updateServer}/api/updates/version`);
            const protocol = url.protocol === 'https:' ? https : http;
            
            const req = protocol.get({
                hostname: url.hostname,
                port: url.port || (url.protocol === 'https:' ? 443 : 80),
                path: url.pathname,
                timeout: 5000
            }, (res) => {
                let data = '';
                res.on('data', chunk => data += chunk);
                res.on('end', () => {
                    if (res.statusCode === 200) {
                        resolve(data.trim());
                    } else {
                        reject(new Error(`Version check failed: ${res.statusCode}`));
                    }
                });
            });
            
            req.on('error', reject);
            req.on('timeout', () => {
                req.destroy();
                reject(new Error('Version check timed out'));
            });
        });

        const timeoutPromise = new Promise((_, reject) => {
            setTimeout(() => reject(new Error('Version check timed out (hard limit)')), timeoutMs);
        });

        return Promise.race([fetchPromise, timeoutPromise]);
    }

    async fetchUpdateInfo() {
        const url = `${this.updateServer}/api/updates/check`;
        const response = await this.makeRequest(url);

        if (response.statusCode === 401) {
            throw new Error('Invalid license or authentication failed');
        }

        if (response.statusCode === 403) {
            const data = JSON.parse(response.data);
            throw new Error(data.error || 'Access denied');
        }

        if (response.statusCode !== 200) {
            throw new Error(`Server returned ${response.statusCode}`);
        }

        const data = JSON.parse(response.data);
        
        if (data.clientSecret) {
            this.clientSecret = data.clientSecret;
        }

        return data;
    }

    async checkForUpdates() {
        if (!this.enabled || this.isUpdating) return null;

        try {
            const remoteVersion = await this.fetchVersion();
            
            if (!remoteVersion) {
                return null;
            }

            const comparison = this.compareVersions(remoteVersion, this.currentVersion);
            
            if (comparison > 0) {
                const updateInfo = await this.fetchUpdateInfo();
                return updateInfo;
            }
            
            return null;
        } catch (error) {
            console.error(colors.yellow(`[AutoUpdate] Failed to check for updates: ${error.message}`));
            return null;
        }
    }

    async downloadUpdate(updateInfo) {
        if (!AdmZip) {
            throw new Error('adm-zip package not installed. Run: npm install adm-zip');
        }

        return new Promise((resolve, reject) => {
            const downloadUrl = `${this.updateServer}/api/updates/download`;
            const tempZipPath = path.join(this.rootDir, 'temp', 'update.zip');
            
            fs.mkdirSync(path.dirname(tempZipPath), { recursive: true });
            
            const url = new URL(downloadUrl);
            const protocol = url.protocol === 'https:' ? https : http;
            const timestamp = Date.now().toString();
            
            const reqOptions = {
                hostname: url.hostname,
                port: url.port || (url.protocol === 'https:' ? 443 : 80),
                path: url.pathname,
                method: 'GET',
                headers: {
                    'User-Agent': 'DragonHosting-AutoUpdater',
                    'X-License-Key': this.updateKey,
                    'X-Guild-ID': this.guildId,
                    'X-Timestamp': timestamp,
                    'X-Signature': this.generateSignature(timestamp),
                    'X-Current-Version': this.currentVersion
                }
            };

            const file = fs.createWriteStream(tempZipPath);
            
            const req = protocol.request(reqOptions, (res) => {
                if (res.statusCode === 301 || res.statusCode === 302) {
                    file.close();
                    if (fs.existsSync(tempZipPath)) fs.unlinkSync(tempZipPath);
                    this.downloadFromUrl(res.headers.location, tempZipPath, updateInfo)
                        .then(resolve)
                        .catch(reject);
                    return;
                }

                if (res.statusCode !== 200) {
                    file.close();
                    if (fs.existsSync(tempZipPath)) fs.unlinkSync(tempZipPath);
                    reject(new Error(`Download failed: HTTP ${res.statusCode}`));
                    return;
                }

                res.pipe(file);
                file.on('finish', () => {
                    file.close();
                    
                    if (updateInfo.checksum) {
                        const fileBuffer = fs.readFileSync(tempZipPath);
                        const hash = crypto.createHash('sha256').update(fileBuffer).digest('hex');
                        if (hash !== updateInfo.checksum) {
                            fs.unlinkSync(tempZipPath);
                            reject(new Error('Checksum verification failed - file may be corrupted'));
                            return;
                        }
                    }
                    
                    resolve(tempZipPath);
                });
            });

            req.on('error', (err) => {
                file.close();
                if (fs.existsSync(tempZipPath)) fs.unlinkSync(tempZipPath);
                reject(err);
            });

            req.end();
        });
    }

    async downloadFromUrl(urlString, destPath, updateInfo) {
        return new Promise((resolve, reject) => {
            const url = new URL(urlString);
            const protocol = url.protocol === 'https:' ? https : http;
            const file = fs.createWriteStream(destPath);
            const timestamp = Date.now().toString();

            const reqOptions = {
                hostname: url.hostname,
                port: url.port || (url.protocol === 'https:' ? 443 : 80),
                path: url.pathname + url.search,
                method: 'GET',
                headers: {
                    'X-License-Key': this.updateKey,
                    'X-Guild-ID': this.guildId,
                    'X-Timestamp': timestamp,
                    'X-Signature': this.generateSignature(timestamp)
                }
            };

            protocol.request(reqOptions, (res) => {
                if (res.statusCode !== 200) {
                    file.close();
                    if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
                    reject(new Error(`Download failed: HTTP ${res.statusCode}`));
                    return;
                }
                res.pipe(file);
                file.on('finish', () => {
                    file.close();
                    if (updateInfo?.checksum) {
                        const hash = crypto.createHash('sha256').update(fs.readFileSync(destPath)).digest('hex');
                        if (hash !== updateInfo.checksum) {
                            fs.unlinkSync(destPath);
                            reject(new Error('Checksum verification failed'));
                            return;
                        }
                    }
                    resolve(destPath);
                });
            }).on('error', (err) => {
                file.close();
                if (fs.existsSync(destPath)) fs.unlinkSync(destPath);
                reject(err);
            }).end();
        });
    }

    async applyUpdate(zipPath) {
        const tempExtractPath = path.join(this.rootDir, 'temp', 'update_extract');
        
        try {
            await this.createBackup();
            
            if (fs.existsSync(tempExtractPath)) {
                fs.rmSync(tempExtractPath, { recursive: true, force: true });
            }
            fs.mkdirSync(tempExtractPath, { recursive: true });
            
            const zip = new AdmZip(zipPath);
            zip.extractAllTo(tempExtractPath, true);
            
            const extractedItems = fs.readdirSync(tempExtractPath);
            let updateSourceDir = tempExtractPath;
            
            if (extractedItems.length === 1) {
                const singleItem = path.join(tempExtractPath, extractedItems[0]);
                if (fs.statSync(singleItem).isDirectory()) {
                    updateSourceDir = singleItem;
                }
            }
            
            this.deleteBotFiles();
            
            await this.copyUpdateFiles(updateSourceDir, this.rootDir);
            
            fs.rmSync(tempExtractPath, { recursive: true, force: true });
            fs.unlinkSync(zipPath);
            
            return true;
        } catch (error) {
            console.error(colors.red(`[AutoUpdate] Failed to apply update: ${error.message}`));
            if (fs.existsSync(tempExtractPath)) {
                fs.rmSync(tempExtractPath, { recursive: true, force: true });
            }
            return false;
        }
    }

    async copyUpdateFiles(source, dest, relativePath = '') {
        const entries = fs.readdirSync(source, { withFileTypes: true });
        
        for (const entry of entries) {
            const srcPath = path.join(source, entry.name);
            const destPath = path.join(dest, entry.name);
            const entryRelativePath = relativePath ? path.join(relativePath, entry.name) : entry.name;
            
            if (this.shouldPreserve(entryRelativePath)) {
                continue;
            }
            
            if (entry.isDirectory()) {
                if (!fs.existsSync(destPath)) {
                    fs.mkdirSync(destPath, { recursive: true });
                }
                await this.copyUpdateFiles(srcPath, destPath, entryRelativePath);
            } else {
                fs.copyFileSync(srcPath, destPath);
            }
        }
    }

    shouldPreserve(relativePath) {
        const topLevel = relativePath.split(path.sep)[0];
        return this.preservePaths.includes(topLevel);
    }

    async createBackup() {
        if (!archiver) {
            console.log(colors.yellow('[AutoUpdate] Skipping backup - archiver not installed'));
            return null;
        }

        try {
            if (!fs.existsSync(this.backupDir)) {
                fs.mkdirSync(this.backupDir, { recursive: true });
            }

            const timestamp = new Date().toISOString().replace(/[:.]/g, '-').slice(0, 19);
            const backupName = `backup-v${this.currentVersion}-${timestamp}.zip`;
            const backupPath = path.join(this.backupDir, backupName);

            console.log(colors.cyan(`[AutoUpdate] Creating backup: ${backupName}`));

            await new Promise((resolve, reject) => {
                const output = fs.createWriteStream(backupPath);
                const archive = archiver('zip', { zlib: { level: 1 } });

                output.on('close', resolve);
                archive.on('error', reject);
                archive.pipe(output);

                for (const item of this.botPaths) {
                    const itemPath = path.join(this.rootDir, item);
                    if (!fs.existsSync(itemPath)) continue;

                    const stat = fs.statSync(itemPath);
                    if (stat.isDirectory()) {
                        archive.directory(itemPath, item);
                    } else {
                        archive.file(itemPath, { name: item });
                    }
                }

                archive.finalize();
            });

            console.log(colors.green(`[AutoUpdate] Backup created: ${backupPath}`));

            await this.cleanOldBackups();

            return backupPath;
        } catch (error) {
            console.error(colors.yellow(`[AutoUpdate] Backup failed: ${error.message}`));
            return null;
        }
    }

    async cleanOldBackups(keepCount = 1) {
        try {
            if (!fs.existsSync(this.backupDir)) return;

            const backups = fs.readdirSync(this.backupDir)
                .filter(f => f.startsWith('backup-') && f.endsWith('.zip'))
                .map(f => ({
                    name: f,
                    path: path.join(this.backupDir, f),
                    time: fs.statSync(path.join(this.backupDir, f)).mtime.getTime()
                }))
                .sort((a, b) => b.time - a.time);

            if (backups.length > keepCount) {
                const toDelete = backups.slice(keepCount);
                for (const backup of toDelete) {
                    fs.unlinkSync(backup.path);
                    console.log(colors.gray(`[AutoUpdate] Removed old backup: ${backup.name}`));
                }
            }
        } catch (error) {
        }
    }

    deleteBotFiles() {
        console.log(colors.cyan('[AutoUpdate] Removing old bot files...'));
        
        for (const item of this.botPaths) {
            const itemPath = path.join(this.rootDir, item);
            if (!fs.existsSync(itemPath)) continue;

            try {
                const stat = fs.statSync(itemPath);
                if (stat.isDirectory()) {
                    fs.rmSync(itemPath, { recursive: true, force: true });
                } else {
                    fs.unlinkSync(itemPath);
                }
            } catch (error) {
                console.error(colors.yellow(`[AutoUpdate] Could not remove ${item}: ${error.message}`));
            }
        }
    }

    async installDependencies() {
        try {
            execSync('npm install', { 
                cwd: this.rootDir, 
                stdio: 'pipe',
                timeout: 300000
            });
            return true;
        } catch (error) {
            console.error(colors.red('[AutoUpdate] Failed to install dependencies'));
            return false;
        }
    }

    printUpdateComplete(version, changelog, willRestart = false) {
        const changelogText = changelog ? ` | Changelog: ${changelog}` : '';
        const restartText = willRestart ? ' | Restarting...' : ' | Please restart the bot manually.';
        console.log(colors.green(`[AutoUpdate] Updated to v${version}${changelogText}${restartText}`));
    }

    restart() {
        if (process.platform === 'win32') {
            console.log(colors.yellow('[AutoUpdate] Auto-restart is not supported on Windows. Please restart manually.'));
            process.exit(0);
            return;
        }
        
        const args = process.argv.slice(1);
        const child = spawn(process.execPath, args, {
            detached: true,
            stdio: 'inherit',
            cwd: this.rootDir
        });
        
        child.unref();
        process.exit(0);
    }

    async performUpdate(updateInfo = null) {
        if (this.isUpdating) return false;
        this.isUpdating = true;

        try {
            if (!updateInfo) {
                updateInfo = await this.fetchUpdateInfo();
            }
            
            console.log(colors.cyan(`[AutoUpdate] Updating to v${updateInfo.version}...`));
            
            const zipPath = await this.downloadUpdate(updateInfo);
            
            const applied = await this.applyUpdate(zipPath);
            if (!applied) {
                this.isUpdating = false;
                return false;
            }
            
            await this.installDependencies();
            
            if (this.autoRestart) {
                this.printUpdateComplete(updateInfo.version, updateInfo.changelog, true);
                this.restart();
            } else {
                this.printUpdateComplete(updateInfo.version, updateInfo.changelog, false);
                this.isUpdating = false;
            }
            
            return true;
        } catch (error) {
            console.error(colors.red(`[AutoUpdate] Update failed: ${error.message}`));
            this.isUpdating = false;
            return false;
        }
    }

    isValidUpdateKey(key) {
        if (!key) return false;
        const pattern = /^[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}-[A-Z0-9]{4}$/;
        return pattern.test(key);
    }

    async start() {
        if (!this.enabled) {
            return;
        }

        console.log(colors.cyan('[AutoUpdate] Enabled - checking for updates every hour'));
        
        try {
            const updateCheckTimeout = 15000;
            const updateCheckPromise = this.checkForUpdates();
            const timeoutPromise = new Promise(resolve => setTimeout(() => resolve(null), updateCheckTimeout));
            
            const updateInfo = await Promise.race([updateCheckPromise, timeoutPromise]);
            if (updateInfo) {
                await this.performUpdate(updateInfo);
            }
        } catch (err) {
        }
        
        this.intervalId = setInterval(async () => {
            const info = await this.checkForUpdates();
            if (info) {
                await this.performUpdate(info);
            }
        }, this.checkInterval);
    }

    stop() {
        if (this.intervalId) {
            clearInterval(this.intervalId);
            this.intervalId = null;
        }
    }

    async forceUpdate() {
        console.log(colors.cyan('[AutoUpdate] Forcing update check...'));
        const updateInfo = await this.checkForUpdates();
        if (updateInfo) {
            return await this.performUpdate(updateInfo);
        } else {
            console.log(colors.green('[AutoUpdate] Already on latest version'));
            return false;
        }
    }
}

let updaterInstance = null;

function initAutoUpdater(config) {
    if (!updaterInstance) {
        updaterInstance = new AutoUpdater(config);
    }
    return updaterInstance;
}

function getAutoUpdater() {
    return updaterInstance;
}

module.exports = { AutoUpdater, initAutoUpdater, getAutoUpdater };
