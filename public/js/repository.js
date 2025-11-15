// Repository Browser Frontend Logic
// Handles: loading directory structure, browsing, breadcrumbs, viewing file content, search

// UMD pattern to support both module and classic script loading
console.log('[RepoBrowser] repository.js loaded - UMD wrapper executing');
(function(global, factory) {
  if (typeof define === 'function' && define.amd) {
    // AMD
    define(['./utils.js'], factory);
  } else if (typeof exports === 'object') {
    // CommonJS
    module.exports = factory(require('./utils.js'));
  } else {
    // Browser globals
    if (typeof global.$ === 'undefined') {
      // Fallback utilities if utils.js not available
      global.$ = function(id) { return document.getElementById(id); };
      global.fetchJSON = async function(url, options) {
        const res = await fetch(url, options);
        const data = await res.json().catch(() => ({}));
        return { ok: res.ok, status: res.status, data };
      };
    }
    // Auto-create instance for classic script usage
    global.__repoBrowserFactory = factory;
  }
}(typeof self !== 'undefined' ? self : this, function(utils) {
  console.log('[RepoBrowser] Factory called with utils:', utils);
  const { $, fetchJSON } = utils || { 
    $: function(id) { return document.getElementById(id); },
    fetchJSON: async function(url, options) {
      const res = await fetch(url, options);
      const data = await res.json().catch(() => ({}));
      return { ok: res.ok, status: res.status, data };
    }
  };

class RepositoryBrowser {
  constructor() {
    this.elems = {
      tab: document.getElementById('repository-tab'),
      input: null,
      btnBrowse: null,
      btnLoad: null,
      breadcrumb: null,
      tree: null,
      fileContent: null,
      searchInput: null,
      searchType: null
    };
    this.currentPath = '';
    this.initialized = false;
    this.debounceTimer = null;
    
    // Define fetchJSON method since it's not passed correctly from utils
    this.fetchJSON = async function(url, options) {
      const res = await fetch(url, options);
      const data = await res.json().catch(() => ({}));
      return { ok: res.ok, status: res.status, data };
    };
  }

  initOnce() {
    if (this.initialized) return;
    console.log('[RepoBrowser] initOnce() called');
    console.log('[RepoBrowser] Window object available:', typeof window !== 'undefined');
    console.log('[RepoBrowser] Document object available:', typeof document !== 'undefined');
    if (!this.elems.tab) return; // Tab not in DOM
    try {
      console.log('[RepoBrowser] initOnce() start');
    } catch (_) {}

    // Cache DOM elements
    this.elems.tab = document.getElementById('repository-tab');
    this.elems.input = document.getElementById('repoPathInput');
    this.elems.btnBrowse = document.getElementById('browseRepoBtn');
    this.elems.btnLoad = document.getElementById('loadRepoBtn');
    this.elems.breadcrumb = document.getElementById('repoBreadcrumb');
    
    console.log('[RepoBrowser] Elements initialized:', this.elems);
    this.elems.tree = document.getElementById('repoTree');
    this.elems.fileContent = document.getElementById('fileContent');
    this.elems.searchInput = document.getElementById('repoSearchInput');
    this.elems.searchType = document.getElementById('repoSearchType');

    // Events
    this.elems.btnLoad?.addEventListener('click', () => {
      try { 
        console.log('[RepoBrowser] Load button clicked');
        console.log('[RepoBrowser] Button element:', this.elems.btnLoad);
        console.log('[RepoBrowser] Input value:', this.elems.input?.value);
      } catch (_) {}
      this.handleLoadPath();
    });
    this.elems.btnBrowse?.addEventListener('click', () => this.handleBrowse());

    // Search with debounce and Enter
    console.log('[RepoBrowser] Search elements:', {
      searchInput: this.elems.searchInput,
      searchType: this.elems.searchType
    });
    this.elems.searchInput?.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        e.preventDefault();
        this.search();
      }
    });
    this.elems.searchInput?.addEventListener('input', () => {
      clearTimeout(this.debounceTimer);
      this.debounceTimer = setTimeout(() => this.search(), 450);
    });
    this.elems.searchType?.addEventListener('change', () => this.search());

    // Breadcrumb navigation (event delegation)
    this.elems.breadcrumb?.addEventListener('click', (e) => {
      const el = e.target.closest('[data-path]');
      if (!el) return;
      const path = el.getAttribute('data-path');
      if (path) this.loadDirectory(path);
    });

    // Auto-load last path when tab is activated
    const repoTabBtn = document.querySelector('[data-tab="repository-tab"]');
    repoTabBtn?.addEventListener('click', () => {
      // Delay a tick to ensure it's visible
      setTimeout(() => {
        if (!this.currentPath) {
          const last = localStorage.getItem('repositoryBrowser.lastPath');
          if (last) {
            if (this.elems.input) this.elems.input.value = last;
            this.loadDirectory(last);
          }
        }
      }, 0);
    });

    // If page loads with this tab active (e.g., from localStorage), try auto-load
    const activeTab = localStorage.getItem('activeTab');
    if (activeTab === 'repository-tab') {
      const last = localStorage.getItem('repositoryBrowser.lastPath');
      if (last) {
        if (this.elems.input) this.elems.input.value = last;
        // Load after DOM settled
        setTimeout(() => this.loadDirectory(last), 0);
      }
    }

    this.initialized = true;
    try {
      console.log('[RepoBrowser] initOnce() done');
    } catch (_) {}
  }

  async handleBrowse() {
    // Attempt File System Access API (supported in Chromium-based browsers)
    if ('showDirectoryPicker' in window) {
      try {
        // @ts-ignore
        const dirHandle = await window.showDirectoryPicker();
        // Some browsers expose a name only; we can't get full absolute path from the picker in web context
        // Use name as a hint and ask user to confirm/correct
        if (this.elems.input) this.elems.input.value = dirHandle.name || '';
        alert('Vui lòng nhập chính xác đường dẫn tuyệt đối vào ô input (Directory Picker không trả về absolute path trong trình duyệt).');
      } catch (_) {
        // ignore cancel
      }
    } else {
      // Thay vì alert, hiển thị gợi ý hữu ích hơn
      this.showBrowseSuggestions();
    }
  }

  showBrowseSuggestions() {
    // Tạo modal hoặc tooltip gợi ý các đường dẫn thông dụng
    const suggestions = [
      'D:\\SOURCE-CODE',
      'C:\\Users',
      'D:\\Projects',
      'C:\\xampp\\htdocs',
      process.cwd?.() || 'D:\\SOURCE-CODE\\NODEJS\\Ci-Cd'
    ].filter(Boolean);
    
    const message = `📁 Trình duyệt không hỗ trợ Directory Picker.\n\n` +
                   `💡 Gợi ý các đường dẫn thông dụng:\n` +
                   suggestions.map((path, i) => `${i + 1}. ${path}`).join('\n') + 
                   `\n\n📋 Vui lòng sao chép và dán đường dẫn vào ô input.`;
    
    alert(message);
  }

  async handleLoadPath() {
    console.log('[RepoBrowser] handleLoadPath() called');
    const path = this.elems.input?.value?.trim();
    try { console.debug('[RepoBrowser] handleLoadPath()', { path }); } catch (_) {}
    console.log('[RepoBrowser] Path to load:', path);
    if (!path) {
      console.log('[RepoBrowser] No path provided, showing warning');
      return this.showTreeMessage('⚠️ Vui lòng nhập đường dẫn repository');
    }
    console.log('[RepoBrowser] Proceeding to load directory');
    await this.loadDirectory(path);
  }

  async loadDirectory(path) {
    try { console.log('[RepoBrowser] loadDirectory() -> start', { path }); } catch (_) {}
    this.showTreeLoading(`Đang tải thư mục: ${path}`);
    const { ok, data } = await this.fetchJSON(`/api/repository/structure?repoPath=${encodeURIComponent(path)}`);
    if (!ok || !data?.success) {
      const msg = data?.message || data?.error || 'Không thể tải cấu trúc thư mục';
      try { console.warn('[RepoBrowser] loadDirectory() -> failed', { ok, status: data?.status, msg }); } catch (_) {}
      this.showTreeMessage(`❌ ${msg}`);
      return;
    }

    try { console.log('[RepoBrowser] loadDirectory() -> success', { base: data.data?.path, count: data.data?.items?.length }); } catch (_) {}
    this.currentPath = data.data.path;
    localStorage.setItem('repositoryBrowser.lastPath', this.currentPath);
    this.renderBreadcrumb(this.currentPath);
    this.renderTree(this.currentPath, data.data.items);
  }

  renderBreadcrumb(fullPath) {
    if (!this.elems.breadcrumb) return;
    // Windows path uses backslashes; normalize
    const parts = fullPath.split(/[/\\]+/).filter(Boolean);
    const segments = [];
    let accum = fullPath.startsWith('\\\\') ? '\\\\' : '';

    // Build clickable segments progressively
    for (let i = 0; i < parts.length; i++) {
      accum = i === 0 ? parts[0] : `${accum}\\${parts[i]}`;
      segments.push({ name: parts[i], path: accum });
    }

    // Render
    const frag = document.createDocumentFragment();
    const root = document.createElement('span');
    root.className = 'breadcrumb-item';
    root.dataset.path = segments.length ? segments[0].path.replace(/\\[^\\]*$/, '') || segments[0].path : '';
    root.textContent = 'Root';
    frag.appendChild(root);

    segments.forEach((seg, idx) => {
      const sep = document.createElement('span');
      sep.textContent = ' / ';
      sep.className = 'breadcrumb-sep';
      frag.appendChild(sep);

      const el = document.createElement('span');
      el.className = 'breadcrumb-item';
      el.dataset.path = seg.path;
      el.textContent = seg.name;
      frag.appendChild(el);
    });

    this.elems.breadcrumb.innerHTML = '';
    this.elems.breadcrumb.appendChild(frag);
  }

  renderTree(basePath, items) {
    if (!this.elems.tree) return;
    this.elems.tree.innerHTML = '';
    // mark updated for fallbacks to detect
    try { this.elems.tree.dataset.renderTs = String(Date.now()); } catch (_) {}

    const list = document.createElement('div');
    list.className = 'tree-root';

    items.forEach(item => {
      list.appendChild(this.createTreeItem(item));
    });

    this.elems.tree.appendChild(list);
  }

  createTreeItem(item) {
    const row = document.createElement('div');
    row.className = `tree-item ${item.type}`;

    const icon = document.createElement('span');
    icon.className = 'tree-icon';
    icon.textContent = item.type === 'directory' ? '📁' : '📄';
    row.appendChild(icon);

    const label = document.createElement('span');
    label.className = 'tree-label';
    label.textContent = item.name;
    row.appendChild(label);

    if (item.type === 'directory') {
      const toggle = document.createElement('button');
      toggle.className = 'tree-toggle btn small outline';
      toggle.textContent = '▶';
      row.appendChild(toggle);

      const children = document.createElement('div');
      children.className = 'tree-children';
      children.style.display = 'none';
      row.appendChild(children);

      const expand = async () => {
        const isOpen = children.style.display !== 'none';
        if (isOpen) {
          children.style.display = 'none';
          toggle.textContent = '▶';
          return;
        }
        // Load directory content lazily
        children.innerHTML = '<div class="loading">Đang tải...</div>';
        try { console.log('[RepoBrowser] expand directory', { path: item.path }); } catch (_) {}
        const { ok, data } = await this.fetchJSON(`/api/repository/structure?repoPath=${encodeURIComponent(item.path)}`);
        if (!ok || !data?.success) {
          children.innerHTML = `<div class="error">❌ ${data?.message || 'Không thể tải thư mục'}</div>`;
          return;
        }
        children.innerHTML = '';
        data.data.items.forEach(child => children.appendChild(this.createTreeItem(child)));
        children.style.display = 'block';
        toggle.textContent = '▼';
      };

      // Events on folder row and toggle
      label.addEventListener('click', expand);
      icon.addEventListener('click', expand);
      toggle.addEventListener('click', expand);
    } else {
      // File click -> view content
      const openFile = () => this.viewFile(item.path, item.name);
      label.addEventListener('click', openFile);
      icon.addEventListener('click', openFile);
    }

    return row;
  }

  async viewFile(filePath, name) {
    if (!this.elems.fileContent) return;
    this.elems.fileContent.innerHTML = `<div class="loading">📄 Đang mở file: ${name || filePath}</div>`;

    const { ok, data } = await this.fetchJSON(`/api/repository/file?filePath=${encodeURIComponent(filePath)}`);
    if (!ok || !data?.success) {
      this.elems.fileContent.innerHTML = `<div class="error">❌ ${data?.message || 'Không thể đọc file'}</div>`;
      return;
    }

    const content = document.createElement('pre');
    content.style.whiteSpace = 'pre-wrap';
    content.style.wordBreak = 'break-word';
    content.textContent = data.data.content;

    this.elems.fileContent.innerHTML = '';
    const header = document.createElement('div');
    header.className = 'file-header';
    header.innerHTML = `<strong>${name || data.data.name}</strong> — ${data.data.size} bytes`;
    this.elems.fileContent.appendChild(header);
    this.elems.fileContent.appendChild(content);
  }

  async search() {
    if (!this.currentPath) return; // need base path
    const q = this.elems.searchInput?.value?.trim();
    const type = this.elems.searchType?.value || 'all';
    if (!q) return; // empty query -> skip

    this.showTreeLoading(`🔎 Đang tìm "${q}" ...`);
    const { ok, data } = await this.fetchJSON(`/api/repository/search?repoPath=${encodeURIComponent(this.currentPath)}&query=${encodeURIComponent(q)}&fileType=${encodeURIComponent(type)}`);
    if (!ok || !data?.success) {
      this.showTreeMessage(`❌ ${data?.message || 'Tìm kiếm thất bại'}`);
      return;
    }
    this.renderSearchResults(data.data.results, q);
  }

  renderSearchResults(results, q) {
    if (!this.elems.tree) return;
    this.elems.tree.innerHTML = '';
    try { this.elems.tree.dataset.renderTs = String(Date.now()); } catch (_) {}

    const title = document.createElement('div');
    title.className = 'search-title';
    title.textContent = `Kết quả tìm kiếm cho "${q}": ${results.length} mục`;
    this.elems.tree.appendChild(title);

    if (!results.length) return;

    const list = document.createElement('div');
    list.className = 'search-results';
    results.forEach(item => {
      const row = document.createElement('div');
      row.className = `search-item ${item.type}`;
      row.innerHTML = `${item.type === 'directory' ? '📁' : '📄'} <span class="result-name">${item.name}</span>`;
      row.title = item.path;
      row.addEventListener('click', () => {
        if (item.type === 'directory') {
          this.loadDirectory(item.path);
        } else {
          this.viewFile(item.path, item.name);
        }
      });
      list.appendChild(row);
    });

    this.elems.tree.appendChild(list);
  }

  showTreeMessage(msg) {
    if (!this.elems.tree) return;
    this.elems.tree.innerHTML = `<div class="muted">${msg}</div>`;
    try { this.elems.tree.dataset.renderTs = String(Date.now()); } catch (_) {}
  }

  showTreeLoading(msg) {
    if (!this.elems.tree) return;
    this.elems.tree.innerHTML = `<div class="loading">${msg || 'Đang tải...'}</div>`;
    try { this.elems.tree.dataset.renderTs = String(Date.now()); } catch (_) {}
  }
}

// Return the class for manual instantiation
return RepositoryBrowser;
}));