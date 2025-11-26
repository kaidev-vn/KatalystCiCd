import { $, fetchJSON } from './utils.js';
import { state } from './state.js';

let term;
let fitAddon;
let resizeObserver;

/**
 * Initialize log controls and xterm instance
 */
export function initLogControls() {
  const jobSelector = $('jobSelector');
  const toggleScrollBtn = $('toggleScrollBtn');
  const toggleFilterBtn = $('toggleFilterBtn');

  if (jobSelector) jobSelector.addEventListener('change', () => {
    // Filter logic could be implemented here if needed
    // For xterm, filtering is harder, usually backend should filter stream
  });

  if (toggleScrollBtn) toggleScrollBtn.onclick = () => {
    // xterm handles scrolling naturally. 
    // To "pause" scroll, we just stop calling scrollToBottom if user scrolled up.
    // But xterm doesn't have a simple "autoScroll" boolean property exposed easily.
    // Usually xterm auto-scrolls if you are at the bottom.
    toggleScrollBtn.classList.toggle('active');
    const isActive = toggleScrollBtn.classList.contains('active');
    toggleScrollBtn.textContent = isActive ? '⏸️ Tạm dừng Scroll' : '▶️ Tiếp tục Scroll';
    
    if (isActive && term) {
      term.scrollToBottom();
    }
  };

  // Initialize xterm.js
  initTerminal();
}

/**
 * Initialize xterm terminal
 */
function initTerminal() {
  const container = document.getElementById('logs');
  if (!container) return;

  // Check if xterm is loaded globally via script tag
  if (!window.Terminal) {
    console.error('xterm.js not loaded');
    container.textContent = 'Error: xterm.js library not loaded.';
    return;
  }

  // Clean container
  container.innerHTML = '';

  // Create Terminal instance
  term = new window.Terminal({
    cursorBlink: true,
    convertEol: true, // Treat \n as new line
    disableStdin: true, // Read-only
    theme: {
      background: '#1e1e1e',
      foreground: '#f0f0f0',
      cursor: '#ffffff',
      selectionBackground: 'rgba(255, 255, 255, 0.3)'
    },
    fontSize: 13,
    fontFamily: 'Consolas, monospace',
    scrollback: 10000 // Virtual scrolling buffer size
  });

  // Load FitAddon
  if (window.FitAddon) {
    fitAddon = new window.FitAddon.FitAddon();
    term.loadAddon(fitAddon);
  }

  // Mount terminal
  term.open(container);
  
  if (fitAddon) {
    fitAddon.fit();
    // Auto resize
    resizeObserver = new ResizeObserver(() => {
      fitAddon.fit();
    });
    const terminalContainer = document.getElementById('terminal-container');
    if (terminalContainer) {
      resizeObserver.observe(terminalContainer);
    }
  }

  term.writeln('\x1b[1;32mWelcome to Katalyst CI/CD Realtime Logs\x1b[0m');
  term.writeln('Waiting for logs...');
}

/**
 * Open EventSource log stream
 */
export function openLogStream(buildId = null) {
  if (state.es) {
    state.es.close();
    state.es = null;
  }

  const url = buildId ? `/api/logs/stream?buildId=${buildId}` : '/api/logs/stream';
  state.es = new EventSource(url);

  state.es.onopen = () => {
    // console.log('Log stream connected');
    // appendLog('[SYSTEM] Log stream connected');
  };

  state.es.onmessage = (event) => {
    if (!term) return;
    try {
      // Direct write to xterm (handles ANSI codes automatically)
      // Replace HTML line breaks if any coming from legacy backend logic, though backend should send raw text
      let text = event.data;
      // If the data is JSON (some backends do this), parse it
      if (text.startsWith('{') && text.endsWith('}')) {
         try {
           const json = JSON.parse(text);
           text = json.message || json.log || text;
         } catch(e) {}
      }
      
      term.writeln(text);
      
      // Auto scroll if "active"
      const toggleScrollBtn = $('toggleScrollBtn');
      if (toggleScrollBtn && toggleScrollBtn.classList.contains('active')) {
        // Only scroll if close to bottom?? xterm usually handles this if we simply don't scroll up.
        // Forcing it ensures it sticks.
        term.scrollToBottom();
      }
    } catch (error) {
      console.error('Error parsing log:', error);
    }
  };

  state.es.onerror = (err) => {
    if (state.es.readyState === EventSource.CLOSED) {
      // appendLog('[SYSTEM] Log stream closed');
    } else {
      // appendLog('[SYSTEM] Log stream error, reconnecting...');
    }
  };
}

/**
 * Write a chunk of text to the terminal efficiently
 * @param {string} text 
 */
export function writeLogChunk(text) {
  if (!term) return;
  // xterm write is already optimized for chunks
  term.write(text);
}

/**
 * Append log line (Legacy function signature kept for compatibility)
 * @param {string} text 
 */
export function appendLog(text) {
  if (term) {
    term.writeln(text);
  } else {
    // Fallback if term not ready (rare)
    console.log('[LOG]', text);
  }
}

/**
 * Clear logs
 */
export function clearLogs() {
  if (term) {
    term.clear();
  }
}

/**
 * Get all logs (for copy/download)
 * Note: xterm keeps data in buffer. Getting *all* lines correctly formats them.
 */
export function getLogContent() {
  if (!term) return '';
  
  // Select all and get selection is a workaround, but accessing buffer is better
  // Simple approach:
  let content = '';
  const buffer = term.buffer.active;
  for (let i = 0; i < buffer.length; i++) {
    const line = buffer.getLine(i);
    if (line) {
      content += line.translateToString(true) + '\n';
    }
  }
  return content;
}

/**
 * Force resize terminal to fit container
 */
export function fitTerminal() {
  if (fitAddon) {
    try {
      fitAddon.fit();
    } catch (e) {
      console.warn('Failed to fit terminal:', e);
    }
  }
}
