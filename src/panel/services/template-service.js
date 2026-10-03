'use strict';

const path = require('path');
const { isAep, isVideo, templateId } = require('../../shared/protocol');

function isInside(root, target) {
  const relative = path.relative(root, target);
  return relative === '' || (relative !== '..' && !relative.startsWith(`..${path.sep}`) && !path.isAbsolute(relative));
}

async function readMetadata(fsAdapter, folderPath) {
  const metadataPath = fsAdapter.join(folderPath, 'template.json');
  if (!(await fsAdapter.exists(metadataPath))) return { value: {}, error: undefined };
  try {
    const value = JSON.parse(await fsAdapter.readText(metadataPath));
    if (!value || typeof value !== 'object' || Array.isArray(value)) {
      return { value: {}, error: 'template.json 必须是 JSON 对象' };
    }
    return { value, error: undefined };
  } catch (error) {
    return { value: {}, error: `template.json 解析失败：${error.message}` };
  }
}

function isIgnoredScanDirectory(name) {
  return /自动保存|auto-save|_ame/i.test(name);
}

function collectTemplateFolder(fsAdapter, currentPath, categoryName, entries, result) {
  const directFiles = entries.filter((entry) => entry.isFile());
  const aepEntries = directFiles.filter((entry) => isAep(entry.name));
  if (aepEntries.length > 0) result.folders.push({ path: currentPath, categoryName, aepEntries });
}

async function listRootVideos(fsAdapter, folderPath, entries) {
  return entries
    .filter((entry) => entry.isFile() && isVideo(entry.name))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }))
    .map((name) => fsAdapter.join(folderPath, name));
}

async function findPreviewImage(fsAdapter, previewPath) {
  if (!previewPath) return undefined;
  const previewDirectory = fsAdapter.dirname(previewPath);
  let entries;
  try {
    entries = await fsAdapter.readDir(previewDirectory);
  } catch (_) {
    return undefined;
  }
  const images = entries
    .filter((entry) => entry.isFile() && /\.jpe?g$/i.test(entry.name))
    .map((entry) => fsAdapter.join(previewDirectory, entry.name))
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  if (!images.length) return undefined;
  const matchingImage = images.find((imagePath) =>
    fsAdapter.basename(imagePath).replace(/\.jpe?g$/i, '').toLocaleLowerCase() ===
    fsAdapter.basename(previewPath).replace(/\.[^.]+$/, '').toLocaleLowerCase()
  );
  return matchingImage || images[0];
}

async function buildTemplateRecord(fsAdapter, candidate, favorites = {}) {
  const folderPath = candidate.path;
  const entries = await fsAdapter.readDir(folderPath);
  const aepFiles = candidate.aepEntries
    .map((entry) => fsAdapter.join(folderPath, entry.name))
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  const metadata = await readMetadata(fsAdapter, folderPath);
  const value = metadata.value || {};
  const categoryPath = candidate.categoryName ? [candidate.categoryName] : [];
  const id = templateId(folderPath);

  let defaultAepPath;
  if (typeof value.mainAep === 'string' && value.mainAep.trim()) {
    const candidateAep = fsAdapter.normalize(fsAdapter.join(folderPath, value.mainAep));
    if (isInside(folderPath, candidateAep) && isAep(candidateAep) && await fsAdapter.exists(candidateAep)) {
      defaultAepPath = candidateAep;
    }
  }
  if (!defaultAepPath && aepFiles.length === 1) defaultAepPath = aepFiles[0];

  let previewPath;
  if (typeof value.preview === 'string' && value.preview.trim()) {
    const candidatePreview = fsAdapter.normalize(fsAdapter.join(folderPath, value.preview));
    if (isInside(folderPath, candidatePreview) && isVideo(candidatePreview) && await fsAdapter.exists(candidatePreview)) {
      previewPath = candidatePreview;
    }
  }
  if (!previewPath) {
    const namedPreview = fsAdapter.join(folderPath, 'preview.mp4');
    if (await fsAdapter.exists(namedPreview)) previewPath = namedPreview;
  }
  if (!previewPath) {
    const videos = await listRootVideos(fsAdapter, folderPath, entries);
    previewPath = videos[0];
  }
  const previewImagePath = await findPreviewImage(fsAdapter, previewPath);

  const name = typeof value.name === 'string' && value.name.trim() ? value.name.trim() : fsAdapter.basename(folderPath);
  const status = metadata.error ? 'ready' : (previewPath ? 'ready' : 'missing-preview');
  return {
    id,
    name,
    categoryPath,
    folderPath,
    aepFiles,
    previewPath,
    previewImagePath,
    defaultAepPath,
    tags: Array.isArray(value.tags) ? value.tags.filter((tag) => typeof tag === 'string') : [],
    isFavorite: Boolean(favorites[id]),
    status,
    metadataError: metadata.error
  };
}

async function scanTemplateLibrary(fsAdapter, rootPath, favorites = {}) {
  const root = fsAdapter.normalize(rootPath);
  if (!(await fsAdapter.exists(root))) {
    return { templates: [], errors: [{ path: root, message: '模板库目录不存在' }] };
  }
  const stat = await fsAdapter.stat(root);
  if (!stat.isDirectory()) return { templates: [], errors: [{ path: root, message: '模板库路径不是目录' }] };
  let categoryEntries;
  try {
    categoryEntries = await fsAdapter.readDir(root);
  } catch (error) {
    return { templates: [], categories: [], errors: [{ path: root, message: error.message }] };
  }
  const categories = categoryEntries
    .filter((entry) => entry.isDirectory() && !entry.name.startsWith('.') && !isIgnoredScanDirectory(entry.name))
    .map((entry) => entry.name)
    .sort((a, b) => a.localeCompare(b, undefined, { sensitivity: 'base' }));
  const found = { folders: [], errors: [] };
  for (const categoryName of categories) {
    const categoryPath = fsAdapter.join(root, categoryName);
    let entries;
    try {
      entries = await fsAdapter.readDir(categoryPath);
    } catch (error) {
      found.errors.push({ path: categoryPath, message: error.message });
      continue;
    }
    for (const entry of entries) {
      if (!entry.isDirectory() || entry.name.startsWith('.') || isIgnoredScanDirectory(entry.name)) continue;
      const templatePath = fsAdapter.join(categoryPath, entry.name);
      try {
        const templateEntries = await fsAdapter.readDir(templatePath);
        collectTemplateFolder(fsAdapter, templatePath, categoryName, templateEntries, found);
      } catch (error) {
        found.errors.push({ path: templatePath, message: error.message });
      }
    }
  }
  const templates = [];
  for (const candidate of found.folders) {
    try {
      templates.push(await buildTemplateRecord(fsAdapter, candidate, favorites));
    } catch (error) {
      found.errors.push({ path: candidate.path, message: error.message });
    }
  }
  templates.sort((a, b) => `${a.categoryPath.join('/')}/${a.name}`.localeCompare(`${b.categoryPath.join('/')}/${b.name}`, undefined, { sensitivity: 'base' }));
  return { templates, categories, errors: found.errors };
}

module.exports = {
  scanTemplateLibrary,
  buildTemplateRecord,
  isInside
};
