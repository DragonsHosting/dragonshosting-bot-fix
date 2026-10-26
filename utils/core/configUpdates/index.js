const fs = require('fs');
const path = require('path');
const helpers = require('./helpers');

const SKIP_DIRS = new Set(['node_modules', '_template']);

function loadVersionModules() {
    const updatesDir = __dirname;
    const entries = fs.readdirSync(updatesDir, { withFileTypes: true });

    const versionDirs = entries
        .filter(e => e.isDirectory() && !SKIP_DIRS.has(e.name))
        .map(e => e.name)
        .sort((a, b) => {
            if (a === 'legacy') return -1;
            if (b === 'legacy') return 1;
            return helpers.compareVersions(a, b);
        });

    return versionDirs.map(dir => {
        const mod = require(path.join(updatesDir, dir));
        return { version: dir, apply: typeof mod === 'function' ? mod : mod.apply };
    }).filter(m => typeof m.apply === 'function');
}

function runConfigUpdates() {
    const modules = loadVersionModules();
    for (const mod of modules) {
        mod.apply(helpers);
    }
}

module.exports = {
    runConfigUpdates,
    helpers: {
        ensureTopKey: helpers.ensureTopKey,
        renameTopKey: helpers.renameTopKey,
        removeTopKey: helpers.removeTopKey,
        addNestedDefault: helpers.addNestedDefault
    }
};
