'use strict';

const path = require('path');

const AEP_EXT = '.aep';
const VIDEO_EXTENSIONS = new Set(['.mp4', '.mov', '.m4v', '.webm']);

function isAep(filePath) {
  return path.extname(filePath).toLowerCase() === AEP_EXT;
}

function isVideo(filePath) {
  return VIDEO_EXTENSIONS.has(path.extname(filePath).toLowerCase());
}

function normalizePathForId(filePath) {
  return String(filePath).replace(/\\/g, '/').replace(/\/+$/, '').toLowerCase();
}

function templateId(folderPath) {
  const normalized = normalizePathForId(folderPath);
  let hash = 2166136261;
  for (let i = 0; i < normalized.length; i += 1) {
    hash ^= normalized.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return `template-${(hash >>> 0).toString(16)}`;
}

function bridgeResult(ok, data, error) {
  return ok ? { ok: true, data } : { ok: false, error };
}

module.exports = {
  AEP_EXT,
  VIDEO_EXTENSIONS,
  isAep,
  isVideo,
  templateId,
  bridgeResult
};
