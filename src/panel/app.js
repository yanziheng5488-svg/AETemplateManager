(function () {
  'use strict';

  var nodeRequire = window.nodeRequire || (window.cep_node && window.cep_node.require) || window.require || (typeof require === 'function' ? require : null);
  var path = null;
  var BufferCtor = null;
  var nodeLoadError = null;
  try {
    if (typeof nodeRequire !== 'function') throw new Error('CEP 未向此面板注入 Node 模块加载器');
    path = nodeRequire('path');
    if (!path) throw new Error('Node path 模块不可用');
    BufferCtor = nodeRequire('buffer').Buffer;
  } catch (error) {
    nodeLoadError = error;
    console.error(error);
  }
  var fsAdapter;
  var scanner;
  var copyService;
  var storageService;
  try {
    if (nodeRequire && path) {
      var extensionRoot = typeof CSInterface !== 'undefined' ? new CSInterface().getSystemPath('extension') : '';
      if (extensionRoot.indexOf('file:///') === 0) extensionRoot = decodeURIComponent(extensionRoot.slice(8));
      else if (extensionRoot.indexOf('file://') === 0) extensionRoot = decodeURIComponent(extensionRoot.slice(7));
      extensionRoot = extensionRoot.replace(/^\/+([A-Za-z]:[\\/])/, '$1').replace(/\//g, '\\');
      if (!extensionRoot || !path) throw new Error('无法定位 CEP 扩展目录');
      function extensionModule(relativePath) {
        return nodeRequire(path.join(extensionRoot, relativePath));
      }
      var FileSystem = extensionModule('src/panel/services/file-system').NodeFileSystem;
      fsAdapter = new FileSystem();
      scanner = extensionModule('src/panel/services/template-service');
      copyService = extensionModule('src/panel/services/copy-service');
      storageService = new (extensionModule('src/panel/services/storage').JsonStorage)();
    }
  } catch (error) {
    nodeLoadError = error;
    console.error(error);
  }

  var state = {
    settings: { templateRoot: '', projectLibraryRoot: '', previewHoverDelayMs: 300 },
    templates: [],
    categories: [],
    projects: [],
    favorites: {},
    selectedTemplate: null,
    selectedAep: '',
    selectedProject: '',
    copyToken: null,
    lastCopyParams: null,
    lastTempPath: ''
  };

  var els = {};
  var toastTimer;

  function $(id) { return document.getElementById(id); }

  function initElements() {
    [
      'library-status', 'refresh-button', 'settings-button', 'search-input', 'category-select',
      'favorite-filter', 'result-count', 'scan-time', 'template-list', 'empty-state', 'empty-title',
      'empty-description', 'empty-settings-button', 'settings-dialog', 'settings-form',
      'template-root-input', 'project-root-input', 'apply-dialog', 'apply-form', 'apply-template-name',
      'project-select', 'aep-choice-wrap', 'aep-select', 'target-name-input', 'copy-progress-wrap',
      'copy-progress', 'copy-progress-label', 'cancel-copy-button', 'apply-error', 'recovery-actions',
      'retry-copy-button', 'clean-temp-button', 'apply-actions', 'apply-submit-button', 'preview-dialog',
      'preview-dialog-title', 'preview-video', 'set-cover-button', 'preview-error', 'toast'
    ].forEach(function (id) { els[id] = $(id); });
  }

  function showToast(message) {
    els.toast.textContent = message;
    els.toast.classList.add('visible');
    clearTimeout(toastTimer);
    toastTimer = setTimeout(function () { els.toast.classList.remove('visible'); }, 3200);
  }

  function settingsReady() {
    return Boolean(state.settings.templateRoot && state.settings.projectLibraryRoot);
  }

  function showSettings() {
    els['template-root-input'].value = state.settings.templateRoot || '';
    els['project-root-input'].value = state.settings.projectLibraryRoot || '';
    els['settings-dialog'].showModal();
  }

  function closeDialog(id) {
    var dialog = $(id);
    if (dialog && dialog.open) dialog.close();
    if (id === 'preview-dialog' && els['preview-video']) {
      els['preview-video'].pause();
      els['preview-video'].removeAttribute('src');
      els['preview-video'].load();
      state.previewTemplate = null;
    }
  }

  function toFileUrl(filePath) {
    if (!filePath) return '';
    var value = String(filePath).replace(/\\/g, '/');
    if (value.indexOf('file://') === 0) return encodeURI(value);
    if (value.indexOf('//') === 0) return encodeURI('file:' + value);
    if (/^[A-Za-z]:\//.test(value)) return encodeURI('file:///' + value);
    return encodeURI('file://' + (value.charAt(0) === '/' ? '' : '/') + value);
  }

  function categoryKey(categoryPath) { return (categoryPath || []).join(' / '); }

  function previewImageUrl(template) {
    var url = toFileUrl(template.previewImagePath);
    return url ? url + '?v=' + encodeURIComponent(template.previewImageVersion || 0) : '';
  }

  function refreshCategories() {
    var current = els['category-select'].value;
    var categories = {};
    state.categories.forEach(function (category) { categories[category] = true; });
    state.templates.forEach(function (template) {
      var pathValue = categoryKey(template.categoryPath);
      if (pathValue) categories[pathValue] = true;
    });
    els['category-select'].innerHTML = '<option value="">全部分类</option>' + Object.keys(categories).sort(function (a, b) {
      return a.localeCompare(b, undefined, { sensitivity: 'base' });
    }).map(function (category) {
      return '<option value="' + escapeHtml(category) + '">' + escapeHtml(category) + '</option>';
    }).join('');
    if (categories[current]) els['category-select'].value = current;
  }

  function escapeHtml(value) {
    return String(value == null ? '' : value).replace(/[&<>"']/g, function (character) {
      return { '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[character];
    });
  }

  function filteredTemplates() {
    var query = String(els['search-input'].value || '').trim().toLocaleLowerCase();
    var category = els['category-select'].value;
    var onlyFavorites = els['favorite-filter'].getAttribute('aria-pressed') === 'true';
    return state.templates.filter(function (template) {
      var matchesQuery = !query || template.name.toLocaleLowerCase().indexOf(query) >= 0;
      var matchesCategory = !category || categoryKey(template.categoryPath) === category;
      var matchesFavorite = !onlyFavorites || template.isFavorite;
      return matchesQuery && matchesCategory && matchesFavorite;
    });
  }

  function renderTemplates() {
    var templates = filteredTemplates();
    els['result-count'].textContent = templates.length + ' 个模板';
    els['template-list'].innerHTML = templates.map(renderTemplateCard).join('');
    els['template-list'].classList.toggle('hidden', templates.length === 0 || !settingsReady());
    if (!settingsReady()) {
      els['empty-state'].classList.add('visible');
      els['empty-title'].textContent = '配置模板库';
      els['empty-description'].textContent = '选择飞牛 NAS 映射盘中的模板目录开始浏览。';
    } else if (templates.length === 0) {
      els['empty-state'].classList.add('visible');
      els['empty-title'].textContent = state.templates.length ? '没有匹配的模板' : '没有找到模板';
      els['empty-description'].textContent = state.templates.length ? '尝试调整搜索或筛选条件。' : '检查模板目录中是否包含 AEP 文件。';
    } else {
      els['empty-state'].classList.remove('visible');
    }
    bindTemplateEvents();
  }

  function renderTemplateCard(template) {
    var preview = template.previewPath
      ? (template.previewImagePath ? '<img class="preview-image" src="' + escapeHtml(previewImageUrl(template)) + '" alt="" loading="lazy">' : '') + '<video preload="metadata" muted playsinline data-preview="' + escapeHtml(template.id) + '"></video>'
      : '<div class="preview-placeholder"><span>▧</span><small>暂无预览</small></div>';
    var status = template.status === 'missing-preview' ? '<span class="warning">未设置预览</span>' : '<span>' + template.aepFiles.length + ' 个 AEP</span>';
    return '<article class="template-card" data-template-id="' + escapeHtml(template.id) + '" tabindex="0">' +
      '<div class="preview-frame ' + (template.previewImagePath ? 'has-preview-image' : 'no-preview-image') + '" data-preview-open="' + escapeHtml(template.id) + '">' + preview + '</div>' +
      '<div class="card-topline"><h3 class="template-title">' + escapeHtml(template.name) + '</h3>' +
      '<button class="favorite-button ' + (template.isFavorite ? 'active' : '') + '" type="button" data-favorite="' + escapeHtml(template.id) + '" aria-label="收藏" aria-pressed="' + String(template.isFavorite) + '">' + (template.isFavorite ? '★' : '☆') + '</button></div>' +
      '<div class="category-label">' + escapeHtml(categoryKey(template.categoryPath) || '未分类') + '</div>' +
      '<div class="card-footer"><div class="card-meta">' + status + (template.metadataError ? '<span class="warning">metadata 异常</span>' : '') + '</div><button class="apply-card-button" type="button" data-apply="' + escapeHtml(template.id) + '">应用</button></div>' +
      '</article>';
  }

  function bindTemplateEvents() {
    Array.prototype.forEach.call(document.querySelectorAll('[data-favorite]'), function (button) {
      button.addEventListener('click', function (event) {
        event.stopPropagation();
        toggleFavorite(button.getAttribute('data-favorite'));
      });
    });
    Array.prototype.forEach.call(document.querySelectorAll('[data-apply]'), function (button) {
      button.addEventListener('click', function (event) {
        event.stopPropagation();
        openApply(button.getAttribute('data-apply'));
      });
    });
    Array.prototype.forEach.call(document.querySelectorAll('.template-card'), function (card) {
      var timer;
      var video = card.querySelector('video');
      var previewFrame = card.querySelector('.preview-frame');
      var template = state.templates.find(function (item) { return item.id === card.getAttribute('data-template-id'); });
      if (!video || !template || !template.previewPath) return;
      var hoverActive = false;
      if (!template.previewImagePath) {
        video.preload = 'auto';
        video.src = toFileUrl(template.previewPath);
        video.load();
        video.addEventListener('loadedmetadata', function () {
          try { video.currentTime = 0; } catch (_) {}
        }, { once: true });
      }
      var start = function () {
        clearTimeout(timer);
        hoverActive = true;
        timer = setTimeout(function () {
          if (!video.src) video.src = toFileUrl(template.previewPath);
          video.muted = true;
          var playResult = video.play();
          if (playResult && playResult.then) {
            playResult.then(function () {
              if (hoverActive && !video.paused) previewFrame.classList.add('is-playing');
            }).catch(function () {});
          } else if (!video.paused) {
            previewFrame.classList.add('is-playing');
          }
        }, Number(state.settings.previewHoverDelayMs) || 300);
      };
      var stop = function () {
        hoverActive = false;
        clearTimeout(timer);
        video.pause();
        previewFrame.classList.remove('is-playing');
        try { video.currentTime = 0; } catch (_) {}
      };
      video.addEventListener('ended', function () { previewFrame.classList.remove('is-playing'); });
      card.addEventListener('mouseenter', start);
      card.addEventListener('mouseleave', stop);
      card.addEventListener('focusin', start);
      card.addEventListener('focusout', stop);
      previewFrame.addEventListener('dblclick', function (event) {
        event.preventDefault();
        event.stopPropagation();
        openPreview(template, video);
      });
    });
  }

  function setPreviewError(message) {
    els['preview-error'].textContent = message || '';
    els['preview-error'].classList.toggle('hidden', !message);
  }

  function openPreview(template, sourceVideo) {
    if (!template || !template.previewPath) return;
    state.previewTemplate = template;
    setPreviewError('');
    els['preview-dialog-title'].textContent = template.name + ' · 预览';
    var previewVideo = els['preview-video'];
    var currentTime = sourceVideo && Number.isFinite(sourceVideo.currentTime) ? sourceVideo.currentTime : 0;
    previewVideo.pause();
    previewVideo.muted = false;
    previewVideo.onloadedmetadata = function () {
      if (currentTime > 0 && currentTime < previewVideo.duration) previewVideo.currentTime = currentTime;
      var playResult = previewVideo.play();
      if (playResult && playResult.catch) playResult.catch(function () {});
    };
    previewVideo.src = toFileUrl(template.previewPath);
    els['preview-dialog'].showModal();
  }

  function coverPathForTemplate(template) {
    if (template.previewImagePath) return template.previewImagePath;
    var extension = path.extname(template.previewPath);
    return path.join(path.dirname(template.previewPath), path.basename(template.previewPath, extension) + '.jpg');
  }

  async function setCurrentFrameAsCover() {
    var template = state.previewTemplate;
    var video = els['preview-video'];
    if (!template || !video || !template.previewPath) return;
    if (!fsAdapter || !BufferCtor) {
      setPreviewError('文件写入能力不可用，请关闭并重新打开面板。');
      return;
    }
    if (!video.videoWidth || !video.videoHeight) {
      setPreviewError('视频当前帧尚未准备好，请播放或拖动到需要的画面后重试。');
      return;
    }
    var canvas = document.createElement('canvas');
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    try {
      canvas.getContext('2d').drawImage(video, 0, 0, canvas.width, canvas.height);
      var dataUrl = canvas.toDataURL('image/jpeg', 0.92);
      var encoded = dataUrl.split(',')[1];
      if (!encoded) throw new Error('无法读取当前帧');
      var imagePath = coverPathForTemplate(template);
      await fsAdapter.writeBinary(imagePath, BufferCtor.from(encoded, 'base64'));
      template.previewImagePath = imagePath;
      template.previewImageVersion = Date.now();
      if (storageService) await storageService.write('index.json', { scannedAt: new Date().toISOString(), categories: state.categories, templates: state.templates });
      closeDialog('preview-dialog');
      renderTemplates();
      showToast('已将当前帧设置为封面：' + path.basename(imagePath));
    } catch (error) {
      setPreviewError('封面写入失败：' + error.message);
    } finally {
      canvas.width = 1;
      canvas.height = 1;
    }
  }

  async function loadState() {
    if (!storageService) return;
    var savedSettings = await storageService.read('settings.json', {});
    state.settings = Object.assign({}, state.settings, savedSettings && typeof savedSettings === 'object' ? savedSettings : {});
    var savedFavorites = await storageService.read('favorites.json', {});
    state.favorites = savedFavorites && typeof savedFavorites === 'object' ? savedFavorites : {};
    var cached = await storageService.read('index.json', null);
    if (cached && Array.isArray(cached.templates)) {
      state.categories = Array.isArray(cached.categories) ? cached.categories : [];
      state.templates = cached.templates.map(function (template) {
        template.isFavorite = Boolean(state.favorites[template.id]);
        return template;
      });
      refreshCategories();
    }
  }

  async function saveFavorites() {
    if (storageService) await storageService.write('favorites.json', state.favorites);
  }

  async function scan() {
    if (!settingsReady()) {
      updateLibraryStatus('尚未配置');
      renderTemplates();
      return;
    }
    if (!scanner || !fsAdapter) {
      var detail = nodeLoadError && nodeLoadError.message ? '（' + nodeLoadError.message + '）' : '（Node 模块未初始化）';
      showToast('CEP Node 文件能力不可用' + detail + '，请关闭并重新打开面板');
      return;
    }
    updateLibraryStatus('正在扫描…');
    try {
      var result = await scanner.scanTemplateLibrary(fsAdapter, state.settings.templateRoot, state.favorites);
      state.templates = result.templates;
      state.categories = result.categories || [];
      refreshCategories();
      if (storageService) await storageService.write('index.json', { scannedAt: new Date().toISOString(), categories: state.categories, templates: state.templates });
      updateLibraryStatus(state.settings.templateRoot);
      els['scan-time'].textContent = new Date().toLocaleTimeString();
      renderTemplates();
      if (result.errors.length) showToast('扫描完成，有 ' + result.errors.length + ' 个路径无法读取');
    } catch (error) {
      state.templates = [];
      state.categories = [];
      renderTemplates();
      updateLibraryStatus('扫描失败');
      showToast('扫描失败：' + error.message);
    }
  }

  function updateLibraryStatus(value) { els['library-status'].textContent = value || '尚未配置'; }

  async function toggleFavorite(id) {
    var template = state.templates.find(function (item) { return item.id === id; });
    if (!template) return;
    template.isFavorite = !template.isFavorite;
    if (template.isFavorite) state.favorites[id] = true;
    else delete state.favorites[id];
    await saveFavorites();
    renderTemplates();
  }

  function openApply(id) {
    var template = state.templates.find(function (item) { return item.id === id; });
    if (!template) return;
    state.selectedTemplate = template;
    state.selectedAep = template.defaultAepPath || template.aepFiles[0] || '';
    state.lastCopyParams = null;
    els['apply-template-name'].textContent = template.name + (template.categoryPath.length ? ' · ' + categoryKey(template.categoryPath) : '');
    els['target-name-input'].value = '';
    els['apply-error'].classList.add('hidden');
    els['recovery-actions'].classList.add('hidden');
    els['copy-progress-wrap'].classList.add('hidden');
    els['apply-actions'].classList.remove('hidden');
    els['apply-submit-button'].disabled = false;
    els['aep-choice-wrap'].classList.toggle('hidden', template.aepFiles.length < 2);
    els['aep-select'].innerHTML = template.aepFiles.map(function (aep) {
      return '<option value="' + escapeHtml(aep) + '">' + escapeHtml(path ? path.basename(aep) : aep) + '</option>';
    }).join('');
    if (state.selectedAep) els['aep-select'].value = state.selectedAep;
    populateProjects().then(function () { els['apply-dialog'].showModal(); });
  }

  async function populateProjects() {
    els['project-select'].innerHTML = '<option value="">正在读取项目…</option>';
    state.projects = [];
    if (!fsAdapter || !state.settings.projectLibraryRoot) {
      els['project-select'].innerHTML = '<option value="">请先配置项目库</option>';
      return;
    }
    try {
      var entries = await fsAdapter.readDir(state.settings.projectLibraryRoot);
      state.projects = entries.filter(function (entry) { return entry.isDirectory() && !entry.name.startsWith('.'); }).sort(function (a, b) { return a.name.localeCompare(b.name); }).map(function (entry) { return { name: entry.name, path: fsAdapter.join(state.settings.projectLibraryRoot, entry.name) }; });
      els['project-select'].innerHTML = '<option value="">选择项目文件夹</option>' + state.projects.map(function (project) { return '<option value="' + escapeHtml(project.path) + '">' + escapeHtml(project.name) + '</option>'; }).join('');
    } catch (error) {
      els['project-select'].innerHTML = '<option value="">无法读取项目库</option>';
      showApplyError(error.message);
    }
  }

  function showApplyError(message, error) {
    els['apply-error'].textContent = message;
    els['apply-error'].classList.remove('hidden');
    if (error && error.tempPath) {
      state.lastTempPath = error.tempPath;
      els['recovery-actions'].classList.remove('hidden');
    }
  }

  function resetProgress() {
    els['copy-progress'].style.width = '0%';
    els['copy-progress-label'].textContent = '准备复制';
  }

  async function applyTemplate() {
    var template = state.selectedTemplate;
    if (!template || !copyService || !fsAdapter) return;
    var targetName = els['target-name-input'].value;
    var validation = copyService.validateTargetName(targetName);
    if (!validation.ok) { showApplyError(validation.message); return; }
    var projectPath = els['project-select'].value;
    if (!projectPath) { showApplyError('请选择目标项目文件夹'); return; }
    state.selectedAep = template.aepFiles.length > 1 ? els['aep-select'].value : (template.defaultAepPath || template.aepFiles[0]);
    if (!state.selectedAep) { showApplyError('请选择主 AEP 文件'); return; }
    state.lastCopyParams = { template: template, selectedAep: state.selectedAep, projectPath: projectPath, targetName: targetName };
    await runCopy(state.lastCopyParams);
  }

  async function runCopy(params) {
    state.copyToken = { cancelled: false };
    resetProgress();
    els['apply-error'].classList.add('hidden');
    els['recovery-actions'].classList.add('hidden');
    els['copy-progress-wrap'].classList.remove('hidden');
    els['apply-actions'].classList.add('hidden');
    els['apply-submit-button'].disabled = true;
    try {
      var result = await copyService.copyTemplate({
        fsAdapter: fsAdapter,
        template: params.template,
        selectedAep: params.selectedAep,
        projectPath: params.projectPath,
        targetName: params.targetName,
        token: state.copyToken,
        onProgress: function (progress) {
          els['copy-progress'].style.width = Math.round(progress.ratio * 100) + '%';
          els['copy-progress-label'].textContent = progress.currentFile || '正在复制';
        }
      });
      els['copy-progress'].style.width = '100%';
      els['copy-progress-label'].textContent = '复制完成，正在打开 AE 项目';
      state.lastTempPath = '';
      await openAeProject(result.mainAepPath);
      closeDialog('apply-dialog');
      showToast('模板已复制并打开：' + path.basename(result.finalPath));
    } catch (error) {
      showApplyError(error.message, error);
      els['apply-actions'].classList.remove('hidden');
      els['apply-submit-button'].disabled = false;
      if (error.code === 'CANCELLED') els['copy-progress-label'].textContent = '复制已取消';
    } finally {
      state.copyToken = null;
    }
  }

  function openAeProject(projectPath) {
    return new Promise(function (resolve, reject) {
      if (typeof CSInterface === 'undefined') { reject(new Error('CEP 接口不可用')); return; }
      var cs = new CSInterface();
      cs.evalScript('FNTemplateManager.openProject(' + JSON.stringify(projectPath) + ')', function (result) {
        if (String(result).indexOf('OK:') === 0) resolve(result.slice(3));
        else reject(new Error(String(result).replace(/^ERROR:/, '') || 'AE 打开项目失败'));
      });
    });
  }

  function browseDirectory(inputId) {
    var cep = window.__adobe_cep__;
    if (cep && cep.fs && typeof cep.fs.showOpenDialog === 'function') {
      var result = cep.fs.showOpenDialog(false, true, '选择目录', $(inputId).value || '', ['*']);
      if (result && result.data && result.data.length) $(inputId).value = result.data[0];
      return;
    }
    var value = window.prompt('输入目录路径', $(inputId).value || '');
    if (value != null) $(inputId).value = value;
  }

  async function saveSettings(event) {
    event.preventDefault();
    var templateRoot = els['template-root-input'].value.trim();
    var projectLibraryRoot = els['project-root-input'].value.trim();
    if (!templateRoot || !projectLibraryRoot) { showToast('模板库和项目库路径都不能为空'); return; }
    state.settings.templateRoot = templateRoot;
    state.settings.projectLibraryRoot = projectLibraryRoot;
    state.settings.previewHoverDelayMs = 300;
    if (storageService) await storageService.write('settings.json', state.settings);
    closeDialog('settings-dialog');
    await scan();
  }

  function wireEvents() {
    els['settings-button'].addEventListener('click', showSettings);
    els['empty-settings-button'].addEventListener('click', showSettings);
    els['refresh-button'].addEventListener('click', scan);
    els['search-input'].addEventListener('input', renderTemplates);
    els['category-select'].addEventListener('change', renderTemplates);
    els['favorite-filter'].addEventListener('click', function () {
      var active = els['favorite-filter'].getAttribute('aria-pressed') !== 'true';
      els['favorite-filter'].setAttribute('aria-pressed', String(active));
      els['favorite-filter'].textContent = active ? '★ 收藏' : '☆ 收藏';
      renderTemplates();
    });
    els['settings-form'].addEventListener('submit', saveSettings);
    els['apply-form'].addEventListener('submit', function (event) { event.preventDefault(); applyTemplate(); });
    els['aep-select'].addEventListener('change', function () { state.selectedAep = els['aep-select'].value; });
    els['cancel-copy-button'].addEventListener('click', function () { if (state.copyToken) state.copyToken.cancelled = true; });
    els['retry-copy-button'].addEventListener('click', function () { if (state.lastCopyParams) runCopy(state.lastCopyParams); });
    els['clean-temp-button'].addEventListener('click', async function () {
      if (!state.lastTempPath || !fsAdapter) return;
      try { await fsAdapter.remove(state.lastTempPath); state.lastTempPath = ''; els['recovery-actions'].classList.add('hidden'); showToast('已清理临时目录'); } catch (error) { showApplyError('清理失败：' + error.message); }
    });
    els['set-cover-button'].addEventListener('click', setCurrentFrameAsCover);
    Array.prototype.forEach.call(document.querySelectorAll('[data-close]'), function (button) { button.addEventListener('click', function () { closeDialog(button.getAttribute('data-close')); }); });
    Array.prototype.forEach.call(document.querySelectorAll('[data-pick]'), function (button) { button.addEventListener('click', function () { browseDirectory(button.getAttribute('data-pick')); }); });
  }

  async function start() {
    initElements();
    wireEvents();
    await loadState();
    if (state.templates.length) {
      updateLibraryStatus(state.settings.templateRoot || '缓存数据');
      renderTemplates();
    }
    await scan();
  }

  if (document.readyState === 'loading') document.addEventListener('DOMContentLoaded', start);
  else start();
})();
