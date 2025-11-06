/**
 * Database Setup Wizard Logic
 */

// Wizard state
const wizardState = {
  currentStep: 1,
  dbType: null,
  dbConfig: null,
  existingData: null,
  connectionTested: false,
  initialized: false
};

// DOM Elements
const prevBtn = document.getElementById('prevBtn');
const nextBtn = document.getElementById('nextBtn');
const errorMessage = document.getElementById('errorMessage');

// Initialize wizard
document.addEventListener('DOMContentLoaded', async () => {
  // Check if already setup
  try {
    const response = await fetch('/api/database/status');
    const data = await response.json();
    
    if (data.success && data.isSetup) {
      // Already setup, redirect to login
      window.location.href = '/login.html';
      return;
    }
  } catch (error) {
    console.error('Error checking database status:', error);
  }

  // Load existing data info
  await loadExistingData();

  // Setup event listeners
  setupEventListeners();
});

/**
 * Setup event listeners
 */
function setupEventListeners() {
  // Database type selection
  document.querySelectorAll('.db-type-card').forEach(card => {
    card.addEventListener('click', () => {
      document.querySelectorAll('.db-type-card').forEach(c => c.classList.remove('selected'));
      card.classList.add('selected');
      wizardState.dbType = card.dataset.type;
      wizardState.connectionTested = false;
    });
  });

  // Navigation buttons
  prevBtn.addEventListener('click', () => goToStep(wizardState.currentStep - 1));
  nextBtn.addEventListener('click', () => handleNextStep());

  // Test connection button
  document.getElementById('testConnectionBtn').addEventListener('click', testConnection);

  // Go to login button
  document.getElementById('goToLoginBtn').addEventListener('click', () => {
    window.location.href = '/login.html';
  });
}

/**
 * Load existing data from JSON files
 */
async function loadExistingData() {
  try {
    const response = await fetch('/api/database/check-data');
    const data = await response.json();
    
    if (data.success && data.hasData) {
      wizardState.existingData = data;
      
      // Show existing data info in step 1
      document.getElementById('existingDataInfo').style.display = 'block';
      document.getElementById('existingUsers').textContent = data.users;
      document.getElementById('existingJobs').textContent = data.jobs;
      document.getElementById('existingConfig').textContent = data.config ? 'Yes' : 'No';

      // Also show in step 3
      document.getElementById('migrateUsers').textContent = data.users;
      document.getElementById('migrateJobs').textContent = data.jobs;
      document.getElementById('migrateConfig').textContent = data.config ? 'Yes' : 'No';
    }
  } catch (error) {
    console.error('Error loading existing data:', error);
  }
}

/**
 * Handle next step
 */
async function handleNextStep() {
  const step = wizardState.currentStep;

  // Validate current step
  if (step === 1) {
    if (!wizardState.dbType) {
      showError('Vui lòng chọn loại database');
      return;
    }
    goToStep(2);
  } else if (step === 2) {
    if (!wizardState.connectionTested) {
      showError('Vui lòng test connection trước khi tiếp tục');
      return;
    }
    goToStep(3);
  } else if (step === 3) {
    // Initialize database
    await initializeDatabase();
  }
}

/**
 * Go to specific step
 */
function goToStep(step) {
  if (step < 1 || step > 4) return;

  // Hide all steps
  document.querySelectorAll('.step-content').forEach(el => {
    el.classList.remove('active');
  });

  // Show target step
  document.getElementById(`step${step}`).classList.add('active');

  // Update wizard steps indicator
  document.querySelectorAll('.wizard-step').forEach((el, index) => {
    const stepNum = index + 1;
    el.classList.remove('active', 'completed');
    
    if (stepNum < step) {
      el.classList.add('completed');
    } else if (stepNum === step) {
      el.classList.add('active');
    }
  });

  // Update wizard state
  wizardState.currentStep = step;

  // Update button visibility
  prevBtn.style.display = step > 1 && step < 4 ? 'block' : 'none';
  nextBtn.style.display = step < 4 ? 'block' : 'none';

  // Update next button text
  if (step === 3) {
    nextBtn.textContent = '🚀 Khởi tạo Database';
  } else {
    nextBtn.textContent = 'Tiếp theo →';
  }

  // Step-specific actions
  if (step === 2) {
    loadConfigForm();
  }

  hideError();
}

/**
 * Load configuration form based on DB type
 */
function loadConfigForm() {
  const sqliteConfig = document.getElementById('sqliteConfig');
  const postgresqlConfig = document.getElementById('postgresqlConfig');

  if (wizardState.dbType === 'sqlite') {
    sqliteConfig.style.display = 'block';
    postgresqlConfig.style.display = 'none';
    document.getElementById('step2Title').textContent = 'Cấu hình SQLite';
    document.getElementById('step2Desc').textContent = 'Chỉ định đường dẫn file database';
  } else if (wizardState.dbType === 'postgresql') {
    sqliteConfig.style.display = 'none';
    postgresqlConfig.style.display = 'block';
    document.getElementById('step2Title').textContent = 'Cấu hình PostgreSQL';
    document.getElementById('step2Desc').textContent = 'Nhập thông tin kết nối PostgreSQL';
  }
}

/**
 * Get current database configuration
 */
function getDbConfig() {
  if (wizardState.dbType === 'sqlite') {
    return {
      path: document.getElementById('sqlitePath').value.trim()
    };
  } else if (wizardState.dbType === 'postgresql') {
    return {
      host: document.getElementById('pgHost').value.trim(),
      port: parseInt(document.getElementById('pgPort').value),
      database: document.getElementById('pgDatabase').value.trim(),
      username: document.getElementById('pgUsername').value.trim(),
      password: document.getElementById('pgPassword').value
    };
  }
  return null;
}

/**
 * Validate database configuration
 */
function validateDbConfig(config) {
  if (wizardState.dbType === 'sqlite') {
    if (!config.path) {
      showError('Vui lòng nhập đường dẫn database file');
      return false;
    }
  } else if (wizardState.dbType === 'postgresql') {
    if (!config.host || !config.database || !config.username) {
      showError('Vui lòng điền đầy đủ thông tin kết nối');
      return false;
    }
    if (!config.password) {
      showError('Vui lòng nhập password');
      return false;
    }
  }
  return true;
}

/**
 * Test database connection
 */
async function testConnection() {
  const config = getDbConfig();
  if (!validateDbConfig(config)) {
    return;
  }

  const testBtn = document.getElementById('testConnectionBtn');
  const statusEl = document.getElementById('connectionStatus');
  
  testBtn.disabled = true;
  testBtn.textContent = '🔄 Testing...';
  statusEl.style.display = 'none';

  try {
    const response = await fetch('/api/database/test-connection', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: wizardState.dbType,
        config: config
      })
    });

    const data = await response.json();

    if (data.success) {
      statusEl.className = 'alert alert-success';
      statusEl.textContent = '✅ ' + data.message;
      statusEl.style.display = 'block';
      wizardState.connectionTested = true;
      wizardState.dbConfig = config;
      hideError();
    } else {
      statusEl.className = 'alert alert-danger';
      statusEl.textContent = '❌ ' + data.message;
      statusEl.style.display = 'block';
      wizardState.connectionTested = false;
    }
  } catch (error) {
    statusEl.className = 'alert alert-danger';
    statusEl.textContent = '❌ Connection failed: ' + error.message;
    statusEl.style.display = 'block';
    wizardState.connectionTested = false;
  } finally {
    testBtn.disabled = false;
    testBtn.textContent = '🔍 Test Connection';
  }
}

/**
 * Initialize database
 */
async function initializeDatabase() {
  const migrateData = document.getElementById('migrateDataCheck').checked;
  const progressDiv = document.getElementById('migrationProgress');

  // Disable next button
  nextBtn.disabled = true;
  nextBtn.textContent = '🔄 Đang khởi tạo...';

  try {
    // Show progress if migrating
    if (migrateData && wizardState.existingData && wizardState.existingData.hasData) {
      progressDiv.style.display = 'block';
    }

    const response = await fetch('/api/database/initialize', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        type: wizardState.dbType,
        config: wizardState.dbConfig,
        migrateData: migrateData
      })
    });

    const data = await response.json();

    if (data.success) {
      // Animate progress bars
      if (data.migration) {
        await animateProgress(data.migration);
      }

      // Show success screen
      wizardState.initialized = true;
      displayFinalSummary(data);
      goToStep(4);
    } else {
      showError('Khởi tạo database thất bại: ' + data.message);
    }
  } catch (error) {
    showError('Lỗi khi khởi tạo database: ' + error.message);
  } finally {
    nextBtn.disabled = false;
    nextBtn.textContent = '🚀 Khởi tạo Database';
  }
}

/**
 * Animate migration progress
 */
async function animateProgress(migration) {
  const items = [
    { key: 'users', count: migration.users?.count || 0 },
    { key: 'jobs', count: migration.jobs?.count || 0 },
    { key: 'config', count: migration.config?.count || 0 }
  ];

  for (const item of items) {
    await new Promise(resolve => setTimeout(resolve, 300));
    
    const progressBar = document.getElementById(`${item.key}ProgressBar`);
    const progressText = document.getElementById(`${item.key}Progress`);
    
    progressBar.style.width = '100%';
    progressText.textContent = `${item.count} items`;
  }

  await new Promise(resolve => setTimeout(resolve, 500));
}

/**
 * Display final summary
 */
function displayFinalSummary(data) {
  const configEl = document.getElementById('finalConfig');
  const summaryEl = document.getElementById('migrationSummary');

  // Display configuration
  let configText = `Database Type: ${data.type}\n`;
  if (data.type === 'sqlite') {
    configText += `Path: ${wizardState.dbConfig.path}`;
  } else if (data.type === 'postgresql') {
    configText += `Host: ${wizardState.dbConfig.host}\n`;
    configText += `Port: ${wizardState.dbConfig.port}\n`;
    configText += `Database: ${wizardState.dbConfig.database}`;
  }
  configEl.textContent = configText;

  // Display migration summary
  if (data.migration) {
    const migration = data.migration;
    let summaryHTML = '<div class="data-summary">';
    summaryHTML += '<h4>📊 Migration Summary</h4>';
    
    if (migration.users) {
      summaryHTML += `<div class="data-item">
        <span>Users migrated:</span>
        <strong>${migration.users.count}</strong>
      </div>`;
    }
    
    if (migration.jobs) {
      summaryHTML += `<div class="data-item">
        <span>Jobs migrated:</span>
        <strong>${migration.jobs.count}</strong>
      </div>`;
    }
    
    if (migration.config) {
      summaryHTML += `<div class="data-item">
        <span>Config entries:</span>
        <strong>${migration.config.count}</strong>
      </div>`;
    }
    
    summaryHTML += '</div>';
    summaryEl.innerHTML = summaryHTML;
  } else {
    summaryEl.innerHTML = '<p class="muted">Không có dữ liệu được migrate</p>';
  }
}

/**
 * Show error message
 */
function showError(message) {
  errorMessage.textContent = '❌ ' + message;
  errorMessage.style.display = 'block';
}

/**
 * Hide error message
 */
function hideError() {
  errorMessage.style.display = 'none';
}
