'use strict';

const fs = require('fs');
const path = require('path');

class NodeFileSystem {
  async exists(target) {
    try {
      await fs.promises.access(target);
      return true;
    } catch (_) {
      return false;
    }
  }

  async stat(target) {
    return fs.promises.stat(target);
  }

  async readDir(target) {
    return fs.promises.readdir(target, { withFileTypes: true });
  }

  async readText(target) {
    return fs.promises.readFile(target, 'utf8');
  }

  async writeBinary(target, content) {
    await fs.promises.writeFile(target, content);
  }

  async mkdir(target) {
    // WebDAV mounts such as RaiDrive may reject one recursive mkdir request.
    // Create each path segment separately so mapped drives receive one request per level.
    const normalized = path.normalize(target);
    const parsed = path.parse(normalized);
    const parts = normalized.slice(parsed.root.length).split(path.sep).filter(Boolean);
    let current = parsed.root;
    for (const part of parts) {
      current = path.join(current, part);
      try {
        await fs.promises.mkdir(current);
      } catch (error) {
        // RaiDrive/WebDAV can report EPERM for an already-created directory.
        // Verify the path before treating it as an idempotent mkdir.
        if (!['EEXIST', 'EPERM'].includes(error.code)) throw error;
        try {
          const stat = await fs.promises.stat(current);
          if (!stat.isDirectory()) throw error;
        } catch (_) {
          throw error;
        }
      }
    }
  }

  async mkdirExclusive(target) {
    await fs.promises.mkdir(target);
  }

  async remove(target) {
    await fs.promises.rm(target, { recursive: true, force: true });
  }

  async rename(from, to) {
    await fs.promises.rename(from, to);
  }

  async copyFile(from, to) {
    const source = await fs.promises.open(from, 'r');
    const target = await fs.promises.open(to, 'w');
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    let position = 0;
    try {
      while (true) {
        const { bytesRead } = await source.read(buffer, 0, buffer.length, position);
        if (!bytesRead) break;
        let written = 0;
        while (written < bytesRead) {
          const result = await target.write(buffer, written, bytesRead - written, position + written);
          written += result.bytesWritten;
        }
        position += bytesRead;
      }
    } finally {
      await Promise.all([source.close(), target.close()]);
    }
  }

  async copyFileWithProgress(from, to, options = {}) {
    const source = await fs.promises.open(from, 'r');
    const target = await fs.promises.open(to, 'w');
    const buffer = Buffer.allocUnsafe(1024 * 1024);
    let position = 0;
    try {
      while (true) {
        if (options.token && options.token.cancelled) {
          const error = new Error('用户取消复制');
          error.code = 'CANCELLED';
          throw error;
        }
        const { bytesRead } = await source.read(buffer, 0, buffer.length, position);
        if (!bytesRead) break;
        let written = 0;
        while (written < bytesRead) {
          const result = await target.write(buffer, written, bytesRead - written, position + written);
          written += result.bytesWritten;
        }
        position += bytesRead;
        if (options.onChunk) options.onChunk(bytesRead);
      }
    } finally {
      await Promise.all([source.close(), target.close()]);
    }
  }

  join(...parts) {
    return path.join(...parts);
  }

  relative(from, to) {
    return path.relative(from, to);
  }

  basename(target) {
    return path.basename(target);
  }

  dirname(target) {
    return path.dirname(target);
  }

  normalize(target) {
    return path.normalize(target);
  }
}

module.exports = { NodeFileSystem };
