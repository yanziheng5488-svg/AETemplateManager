'use strict';

const fs = require('fs');
const path = require('path');
const os = require('os');

function appDataDir() {
  const base = process.env.APPDATA || path.join(os.homedir(), 'AppData', 'Roaming');
  return path.join(base, 'AE-FN-TemplateManager');
}

class JsonStorage {
  constructor(rootDir = appDataDir()) {
    this.rootDir = rootDir;
  }

  async read(name, fallback) {
    try {
      const content = await fs.promises.readFile(path.join(this.rootDir, name), 'utf8');
      return JSON.parse(content);
    } catch (error) {
      if (error && error.code !== 'ENOENT') return fallback;
      return fallback;
    }
  }

  async write(name, value) {
    await fs.promises.mkdir(this.rootDir, { recursive: true });
    const target = path.join(this.rootDir, name);
    const temp = `${target}.tmp-${process.pid}-${Date.now()}`;
    await fs.promises.writeFile(temp, JSON.stringify(value, null, 2), 'utf8');
    await fs.promises.rename(temp, target);
  }
}

module.exports = { JsonStorage, appDataDir };
