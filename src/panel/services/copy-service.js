'use strict';

const path = require('path');
const { isAep } = require('../../shared/protocol');

const INVALID_NAME = /[<>:"/\\|?*\x00-\x1F]/;
const RESERVED_NAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\..*)?$/i;

function validateTargetName(name) {
  const value = String(name || '').trim();
  if (!value) return { ok: false, message: '请输入目标文件夹名称' };
  if (INVALID_NAME.test(value)) return { ok: false, message: '名称包含 Windows 不允许的字符' };
  if (RESERVED_NAME.test(value)) return { ok: false, message: '名称是 Windows 保留设备名' };
  if (value.endsWith('.') || value.endsWith(' ')) return { ok: false, message: '名称不能以空格或句号结尾' };
  return { ok: true, value };
}

function cancelled(token) {
  return token && token.cancelled;
}

function addRemoteDriveHint(error) {
  if (!error || !['EPERM', 'EACCES', 'ENOTSUP', 'EIO'].includes(error.code)) return error;
  const hint = '目标目录创建或写入被系统拒绝。若项目库位于 RaiDrive/WebDAV 映射盘，请确认当前账号有创建文件夹、写入和重命名权限；也可先复制到本地磁盘验证。';
  if (!String(error.message || '').includes(hint)) error.message = `${error.message}。${hint}`;
  return error;
}

function isRenameCompatibilityError(error) {
  if (!error) return false;
  if (['EPERM', 'EACCES', 'EXDEV'].includes(error.code)) return true;
  return /operation not permitted|cross[- ]device|not supported/i.test(String(error.message || ''));
}

async function enumerate(fsAdapter, root, selectedAep, current = root, files = []) {
  const entries = await fsAdapter.readDir(current);
  for (const entry of entries) {
    const source = fsAdapter.join(current, entry.name);
    if (entry.isDirectory()) {
      await enumerate(fsAdapter, root, selectedAep, source, files);
    } else if (entry.isFile()) {
      if (isAep(source) && fsAdapter.normalize(source).toLowerCase() !== fsAdapter.normalize(selectedAep).toLowerCase()) continue;
      const stat = await fsAdapter.stat(source);
      files.push({ source, relative: fsAdapter.relative(root, source), size: stat.size || 0 });
    }
  }
  return files;
}

async function ensureUniqueDestination(fsAdapter, projectPath, targetName) {
  let index = 0;
  while (true) {
    const suffix = index === 0 ? '' : `_${String(index).padStart(3, '0')}`;
    const candidate = fsAdapter.join(projectPath, `${targetName}${suffix}`);
    if (!(await fsAdapter.exists(candidate))) return candidate;
    index += 1;
  }
}

async function copyFiles(fsAdapter, files, sourceRoot, destinationRoot, token, onProgress, progressState) {
  for (const file of files) {
    if (cancelled(token)) throw Object.assign(new Error('用户取消复制'), { code: 'CANCELLED' });
    const source = fsAdapter.join(sourceRoot, file.relative);
    const destination = fsAdapter.join(destinationRoot, file.relative);
    await fsAdapter.mkdir(fsAdapter.dirname(destination));
    if (fsAdapter.copyFileWithProgress) {
      await fsAdapter.copyFileWithProgress(source, destination, {
        token,
        onChunk: (bytes) => {
          progressState.copiedBytes += bytes;
          if (onProgress) onProgress({ copiedBytes: progressState.copiedBytes, totalBytes: progressState.totalBytes, currentFile: file.relative, ratio: progressState.totalBytes ? progressState.copiedBytes / progressState.totalBytes : 1 });
        }
      });
    } else {
      await fsAdapter.copyFile(source, destination);
      progressState.copiedBytes += file.size;
      if (onProgress) onProgress({ copiedBytes: progressState.copiedBytes, totalBytes: progressState.totalBytes, currentFile: file.relative, ratio: progressState.totalBytes ? progressState.copiedBytes / progressState.totalBytes : 1 });
    }
  }
}

async function copyTemplate({ fsAdapter, template, selectedAep, projectPath, targetName, token, onProgress }) {
  const validation = validateTargetName(targetName);
  if (!validation.ok) throw new Error(validation.message);
  if (!template || !template.folderPath) throw new Error('模板信息无效');
  if (!selectedAep || !template.aepFiles.some((aep) => fsAdapter.normalize(aep).toLowerCase() === fsAdapter.normalize(selectedAep).toLowerCase())) {
    throw new Error('请选择模板中的主 AEP 文件');
  }
  if (!(await fsAdapter.exists(projectPath))) throw new Error('项目目录不存在');

  const files = await enumerate(fsAdapter, template.folderPath, selectedAep);
  const totalBytes = files.reduce((sum, file) => sum + file.size, 0);
  const finalPath = await ensureUniqueDestination(fsAdapter, projectPath, validation.value);
  const jobId = `${Date.now()}-${Math.random().toString(16).slice(2)}`;
  const tempPath = fsAdapter.join(projectPath, `.fn-copying-${jobId}`);
  await fsAdapter.mkdirExclusive(tempPath);
  try {
    const progressState = { copiedBytes: 0, totalBytes };
    await copyFiles(fsAdapter, files, template.folderPath, tempPath, token, onProgress, progressState);
    try {
      await fsAdapter.rename(tempPath, finalPath);
    } catch (renameError) {
      if (!isRenameCompatibilityError(renameError)) throw renameError;
      // RaiDrive/WebDAV commonly rejects directory rename. Commit the already copied
      // files into the final directory one level at a time instead.
      await fsAdapter.mkdirExclusive(finalPath);
      progressState.copiedBytes = 0;
      if (onProgress) onProgress({ copiedBytes: 0, totalBytes, currentFile: '正在兼容 WebDAV 提交目录', ratio: 0 });
      await copyFiles(fsAdapter, files, tempPath, finalPath, token, onProgress, progressState);
      try {
        await fsAdapter.remove(tempPath);
      } catch (_) {
        // Keep the temp directory for manual cleanup if the mount also rejects removal.
      }
    }
    const selectedRelative = fsAdapter.relative(template.folderPath, selectedAep);
    return { finalPath, mainAepPath: fsAdapter.join(finalPath, selectedRelative), copiedFiles: files.length, totalBytes };
  } catch (error) {
    error.tempPath = tempPath;
    throw addRemoteDriveHint(error);
  }
}

module.exports = { copyTemplate, validateTargetName, ensureUniqueDestination, enumerate, isRenameCompatibilityError, addRemoteDriveHint };
