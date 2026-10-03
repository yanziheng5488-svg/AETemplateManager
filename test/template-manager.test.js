'use strict';

const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const os = require('os');
const path = require('path');
const { NodeFileSystem } = require('../src/panel/services/file-system');
const { scanTemplateLibrary } = require('../src/panel/services/template-service');
const { copyTemplate, validateTargetName, addRemoteDriveHint } = require('../src/panel/services/copy-service');

async function tempDir() {
  return fs.promises.mkdtemp(path.join(os.tmpdir(), 'ae-fn-test-'));
}

async function writeFile(filePath, content = 'fixture') {
  await fs.promises.mkdir(path.dirname(filePath), { recursive: true });
  await fs.promises.writeFile(filePath, content);
}

test('uses first-level folders as categories and scans only one directory level for templates', async () => {
  const root = await tempDir();
  const category = path.join(root, '宣传片');
  const template = path.join(category, '科技模板');
  const autoSave = path.join(category, '自动保存');
  const ame = path.join(category, '转码_AME');
  await fs.promises.mkdir(path.join(root, '空分类'), { recursive: true });
  await writeFile(path.join(autoSave, 'autosave.aep'));
  await writeFile(path.join(ame, 'ame-output.aep'));
  await writeFile(path.join(category, 'category-level.aep'));
  await writeFile(path.join(template, 'main.aep'));
  await writeFile(path.join(template, 'alternate.aep'));
  await writeFile(path.join(template, 'sample.mp4'));
  await writeFile(path.join(template, '素材', 'image.png'));
  await writeFile(path.join(template, 'template.json'), JSON.stringify({ name: '科技片头', mainAep: 'main.aep', tags: ['future'] }));
  await writeFile(path.join(template, 'Auto-Save', 'nested-save.aep'));
  await writeFile(path.join(template, '素材', 'hidden-deep', 'deep.aep'));

  const result = await scanTemplateLibrary(new NodeFileSystem(), root, {});
  assert.equal(result.errors.length, 0);
  assert.deepEqual(result.categories, ['空分类', '宣传片']);
  assert.equal(result.templates.length, 1);
  assert.deepEqual(result.templates[0].categoryPath, ['宣传片']);
  assert.equal(result.templates[0].name, '科技片头');
  assert.equal(result.templates[0].aepFiles.length, 2);
  assert.equal(path.basename(result.templates[0].folderPath), '科技模板');
  assert.equal(path.basename(result.templates[0].defaultAepPath), 'main.aep');
  assert.equal(path.basename(result.templates[0].previewPath), 'sample.mp4');
  assert.deepEqual(result.templates[0].tags, ['future']);
  await fs.promises.rm(root, { recursive: true, force: true });
});

test('does not scan grandchildren or directories marked as automatic saves or AME output', async () => {
  const root = await tempDir();
  const category = path.join(root, '分类');
  await writeFile(path.join(category, '有效模板', 'main.aep'));
  await writeFile(path.join(category, '有效模板', '自动保存', 'backup.aep'));
  await writeFile(path.join(category, '有效模板', 'Auto-Save 1', 'autosave.aep'));
  await writeFile(path.join(category, '有效模板', 'export_AME', 'transcode.aep'));
  await writeFile(path.join(category, '自动保存', 'category-save.aep'));
  await writeFile(path.join(category, 'folder_AME', 'render.aep'));

  const result = await scanTemplateLibrary(new NodeFileSystem(), root, {});
  assert.deepEqual(result.templates.map((item) => item.name), ['有效模板']);
  assert.deepEqual(result.templates[0].aepFiles.map((file) => path.basename(file)), ['main.aep']);
  await fs.promises.rm(root, { recursive: true, force: true });
});

test('shows a same-directory JPG candidate as the preview image', async () => {
  const root = await tempDir();
  const template = path.join(root, '分类', '深层模板');
  await writeFile(path.join(template, 'nested', 'preview.mp4'));
  await writeFile(path.join(template, 'nested', 'preview.jpg'));
  await writeFile(path.join(template, 'nested', 'other.jpg'));
  await writeFile(path.join(template, 'main.aep'));
  await writeFile(path.join(template, 'template.json'), JSON.stringify({ preview: 'nested/preview.mp4' }));
  const result = await scanTemplateLibrary(new NodeFileSystem(), root, {});
  assert.equal(path.basename(result.templates[0].previewPath), 'preview.mp4');
  assert.equal(path.basename(result.templates[0].previewImagePath), 'preview.jpg');
  await fs.promises.rm(root, { recursive: true, force: true });
});

test('writes binary cover data through the filesystem adapter', async () => {
  const root = await tempDir();
  const target = path.join(root, 'preview.jpg');
  const adapter = new NodeFileSystem();
  await adapter.writeBinary(target, Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
  assert.deepEqual(await fs.promises.readFile(target), Buffer.from([0xff, 0xd8, 0xff, 0xd9]));
  await fs.promises.rm(root, { recursive: true, force: true });
});

test('does not treat files at the library root as categorized templates', async () => {
  const root = await tempDir();
  await writeFile(path.join(root, 'root.aep'));
  await fs.promises.mkdir(path.join(root, 'empty-category'));
  const result = await scanTemplateLibrary(new NodeFileSystem(), root, {});
  assert.deepEqual(result.categories, ['empty-category']);
  assert.equal(result.templates.length, 0);
  await fs.promises.rm(root, { recursive: true, force: true });
});

test('prefers explicit preview.mp4 and marks missing preview', async () => {
  const root = await tempDir();
  const withPreview = path.join(root, '有预览', '有预览模板');
  const withoutPreview = path.join(root, '无预览', '无预览模板');
  await writeFile(path.join(withPreview, 'one.aep'));
  await writeFile(path.join(withPreview, 'preview.mp4'));
  await writeFile(path.join(withPreview, 'other.mov'));
  await writeFile(path.join(withoutPreview, 'two.aep'));
  const result = await scanTemplateLibrary(new NodeFileSystem(), root, {});
  const byName = Object.fromEntries(result.templates.map((item) => [item.name, item]));
  assert.equal(path.basename(byName['有预览模板'].previewPath), 'preview.mp4');
  assert.equal(byName['无预览模板'].previewPath, undefined);
  assert.equal(byName['无预览模板'].status, 'missing-preview');
  await fs.promises.rm(root, { recursive: true, force: true });
});

test('copies only selected AEP, preserves other files, and increments destination name', async () => {
  const root = await tempDir();
  const templatePath = path.join(root, '模板');
  const projectPath = path.join(root, '项目001');
  await fs.promises.mkdir(projectPath, { recursive: true });
  await writeFile(path.join(templatePath, '主项目.aep'), 'main');
  await writeFile(path.join(templatePath, '备用项目.aep'), 'alternate');
  await writeFile(path.join(templatePath, 'preview.mp4'), 'preview');
  await writeFile(path.join(templatePath, '素材', 'image.png'), 'image');
  await fs.promises.mkdir(path.join(projectPath, '客户片头'), { recursive: true });
  const template = { folderPath: templatePath, aepFiles: [path.join(templatePath, '主项目.aep'), path.join(templatePath, '备用项目.aep')] };
  const result = await copyTemplate({ fsAdapter: new NodeFileSystem(), template, selectedAep: path.join(templatePath, '主项目.aep'), projectPath, targetName: '客户片头', token: { cancelled: false } });
  assert.equal(path.basename(result.finalPath), '客户片头_001');
  assert.equal(await fs.promises.readFile(path.join(result.finalPath, '主项目.aep'), 'utf8'), 'main');
  assert.equal(fs.existsSync(path.join(result.finalPath, '备用项目.aep')), false);
  assert.equal(await fs.promises.readFile(path.join(result.finalPath, '素材', 'image.png'), 'utf8'), 'image');
  assert.equal(result.mainAepPath, path.join(result.finalPath, '主项目.aep'));
  await fs.promises.rm(root, { recursive: true, force: true });
});

test('falls back to a copy commit when the destination mount rejects rename', async () => {
  const root = await tempDir();
  const templatePath = path.join(root, '模板');
  const projectPath = path.join(root, '项目');
  await fs.promises.mkdir(projectPath, { recursive: true });
  await writeFile(path.join(templatePath, 'main.aep'), 'main');
  await writeFile(path.join(templatePath, '素材', '图文分类', '_7项', '_footage', '素材', 'image.png'), 'image');

  class WebDavLikeFileSystem extends NodeFileSystem {
    async rename() {
      const error = new Error('EPERM: operation not permitted, rename');
      error.code = 'EPERM';
      throw error;
    }
  }

  const adapter = new WebDavLikeFileSystem();
  const result = await copyTemplate({
    fsAdapter: adapter,
    template: { folderPath: templatePath, aepFiles: [path.join(templatePath, 'main.aep')] },
    selectedAep: path.join(templatePath, 'main.aep'),
    projectPath,
    targetName: 'WebDAV模板',
    token: { cancelled: false }
  });
  assert.equal(await fs.promises.readFile(path.join(result.finalPath, '素材', '图文分类', '_7项', '_footage', '素材', 'image.png'), 'utf8'), 'image');
  assert.equal(await fs.promises.readFile(result.mainAepPath, 'utf8'), 'main');
  const residualTempDirs = (await fs.promises.readdir(projectPath)).filter((name) => name.startsWith('.fn-copying-'));
  assert.equal(residualTempDirs.length, 0);
  await fs.promises.rm(root, { recursive: true, force: true });
});

test('adds a RaiDrive/WebDAV hint to mapped-drive permission errors', () => {
  const error = new Error('operation not permitted');
  error.code = 'EPERM';
  addRemoteDriveHint(error);
  assert.match(error.message, /RaiDrive\/WebDAV/);
});

test('keeps a temporary directory on cancellation', async () => {
  const root = await tempDir();
  const templatePath = path.join(root, '模板');
  const projectPath = path.join(root, '项目');
  await fs.promises.mkdir(projectPath, { recursive: true });
  await writeFile(path.join(templatePath, 'main.aep'), 'main');
  const token = { cancelled: true };
  await assert.rejects(copyTemplate({ fsAdapter: new NodeFileSystem(), template: { folderPath: templatePath, aepFiles: [path.join(templatePath, 'main.aep')] }, selectedAep: path.join(templatePath, 'main.aep'), projectPath, targetName: '新模板', token }), (error) => {
    assert.equal(error.code, 'CANCELLED');
    assert.ok(error.tempPath);
    assert.equal(fs.existsSync(error.tempPath), true);
    return true;
  });
  await fs.promises.rm(root, { recursive: true, force: true });
});

test('validates Windows target folder names', () => {
  assert.equal(validateTargetName('').ok, false);
  assert.equal(validateTargetName('客户:片头').ok, false);
  assert.equal(validateTargetName('CON').ok, false);
  assert.equal(validateTargetName('有效名称').ok, true);
});
