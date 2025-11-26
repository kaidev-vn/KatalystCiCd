/**
 * Database Configuration Module
 * Manages database setup and migration within the main dashboard
 */

(function() {
  // Wizard state
  const dbWizardState = {
    currentStep: 1,
    dbType: null,
    dbConfig: null,
    existingData: null,
    connectionTested: false,
    initialized: false
  };

  // Initialize when database tab is shown
  function initDatabaseTab() {
    // Check database status
    checkDatabaseStatus();

    // Setup event listeners
    setupEventListeners();
  }

  /**
   * Check database status
   */
  async function checkDatabaseStatus() {
    try {
      const response = await fetch('/api/database/status');
      const data = await response.json();

      if (data.success && data.isSetup) {
        // Database is setup - show info
        showDatabaseInfo(data);
      } else {
        // Not setup - show wizard
        showSetupWizard();
        await loadExistingData();
      }
    } catch (error) {
      console.error('[DATABASE] Error checking status:', error);
      document.getElementById('dbStatusTitle').textContent = '❌ Lỗi kiểm tra database';
      document.getElementById('dbStatusDesc').textContent = error.message;
    }
  }

  /**
   * Show database info (if already setup)
   */
  function showDatabaseInfo(data) {
    document.getElementById('dbStatusIcon').textContent = '✅';
    document.getElementById('dbStatusTitle').textContent = 'Database đã được cấu hình';
    document.getElementById('dbStatusDesc').textContent = `Loại: ${data.type}`;

    document.getElementById('dbSetupWizard').style.display = 'none';
    document.getElementById('dbInfoSection').style.display = 'block';

    // Display config details
    document.getElementById('dbTypeInfo').textContent = data.type.toUpperCase();

    let configText = '';
    if (data.type === 'sqlite') {
      configText = `Path: ${data.config.path}`;
    } else if (data.type === 'postgresql') {
      configText = `Host: ${data.config.host}\nPort: ${data.config.port}\nDatabase: ${data.config.database}`;
    }
    document.getElementById('dbConfigDetails').textContent = configText;
  }

  /**
   * Show setup wizard (if not setup)
   */
  function showSetupWizard() {
    document.getElementById('dbStatusIcon').textContent = '⚙️';
    document.getElementById('dbStatusTitle').textContent = 'Database chưa được cấu hình';
    document.getElementById('dbStatusDesc').textContent = 'Sử dụng wizard bên dưới để setup database';

    document.getElementById('dbSetupWizard').style.display = 'block';
    document.getElementById('dbInfoSection').style.display = 'none';
  }

  /**
   * Load existing JSON data
   */
  async function loadExistingData() {
    try {
      const response = await fetch('/api/database/check-data');
      const data = await response.json();

      if (data.success && data.hasData) {
        dbWizardState.existingData = data;

        // Show in step 1
        document.getElementById('dbExistingDataInfo').style.display = 'block';
        document.getElementById('dbExistingUsers').textContent = data.users;
        document.getElementById('dbExistingJobs').textContent = data.jobs;
        document.getElementById('dbExistingConfig').textContent = data.config ? 'Yes' : 'No';

        // Show in step 3
        document.getElementById('dbMigrateUsers').textContent = data.users;
        document.getElementById('dbMigrateJobs').textContent = data.jobs;
        document.getElementById('dbMigrateConfig').textContent = data.config ? 'Yes' : 'No';
      }
    } catch (error) {
      console.error('[DATABASE] Error loading existing data:', error);
    }
  }

  /**
   * Setup event listeners
   */
  function setupEventListeners() {
    // Database type selection
    document.querySelectorAll('.db-type-card').forEach(card => {
      card.addEventListener('click', () => {
        document.querySelectorAll('.db-type-card').forEach(c => c.classList.remove('selected'));
        card.classList.add('selected');
        dbWizardState.dbType = card.dataset.type;
        dbWizardState.connectionTested = false;
      });
    });

    // Navigation buttons
    const prevBtn = document.getElementById('dbPrevBtn');
    const nextBtn = document.getElementById('dbNextBtn');

    prevBtn?.addEventListener('click', () => goToStep(dbWizardState.currentStep - 1));
    nextBtn?.addEventListener('click', () => handleNextStep());

    // Test connection
    document.getElementById('dbTestConnectionBtn')?.addEventListener('click', testConnection);

    // Manual actions
    document.getElementById('dbManualMigrateBtn')?.addEventListener('click', manualMigrate);
    document.getElementById('dbResetBtn')?.addEventListener('click', resetDatabase);
    document.getElementById('dbReloadPageBtn')?.addEventListener('click', () => window.location.reload());
  }

  /**
   * Handle next step
   */
  async function handleNextStep() {
    const step = dbWizardState.currentStep;

    if (step === 1) {
      if (!dbWizardState.dbType) {
        showError('Vui lòng chọn loại database');
        return;
      }
      goToStep(2);
    } else if (step === 2) {
      if (!dbWizardState.connectionTested) {
        showError('Vui lòng test connection trước khi tiếp tục');
        return;
      }
      goToStep(3);
    } else if (step === 3) {
      await initializeDatabase();
    }
  }

  /**
   * Go to step
   */
  function goToStep(step) {
    if (step < 1 || step > 4) return;

    // Hide all steps
    document.querySelectorAll('#dbSetupWizard .step-content').forEach(el => {
      el.classList.remove('active');
    });

    // Show target step
    document.getElementById(`dbStep${step}`)?.classList.add('active');

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

    dbWizardState.currentStep = step;

    // Update buttons
    const prevBtn = document.getElementById('dbPrevBtn');
    const nextBtn = document.getElementById('dbNextBtn');

    prevBtn.style.display = step > 1 && step < 4 ? 'block' : 'none';
    nextBtn.style.display = step < 4 ? 'block' : 'none';

    if (step === 3) {
      nextBtn.textContent = '🚀 Khởi tạo Database';
    } else {
      nextBtn.textContent = 'Tiếp theo →';
    }

    if (step === 2) {
      loadConfigForm();
    }

    hideError();
  }

  /**
   * Load config form based on DB type
   */
  function loadConfigForm() {
    const sqliteConfig = document.getElementById('dbSqliteConfig');
    const postgresqlConfig = document.getElementById('dbPostgresqlConfig');

    if (dbWizardState.dbType === 'sqlite') {
      sqliteConfig.style.display = 'block';
      postgresqlConfig.style.display = 'none';
      document.getElementById('dbStep2Title').textContent = 'Cấu hình SQLite';
    } else if (dbWizardState.dbType === 'postgresql') {
      sqliteConfig.style.display = 'none';
      postgresqlConfig.style.display = 'block';
      document.getElementById('dbStep2Title').textContent = 'Cấu hình PostgreSQL';
    }
  }

  /**
   * Get database config
   */
  function getDbConfig() {
    if (dbWizardState.dbType === 'sqlite') {
      return {
        path: document.getElementById('dbSqlitePath').value.trim()
      };
    } else if (dbWizardState.dbType === 'postgresql') {
      return {
        host: document.getElementById('dbPgHost').value.trim(),
        port: parseInt(document.getElementById('dbPgPort').value),
        database: document.getElementById('dbPgDatabase').value.trim(),
        username: document.getElementById('dbPgUsername').value.trim(),
        password: document.getElementById('dbPgPassword').value
      };
    }
    return null;
  }

  /**
   * Validate config
   */
  function validateDbConfig(config) {
    if (dbWizardState.dbType === 'sqlite') {
      if (!config.path) {
        showError('Vui lòng nhập đường dẫn database file');
        return false;
      }
    } else if (dbWizardState.dbType === 'postgresql') {
      if (!config.host || !config.database || !config.username || !config.password) {
        showError('Vui lòng điền đầy đủ thông tin kết nối');
        return false;
      }
    }
    return true;
  }

  /**
   * Test connection
   */
  async function testConnection() {
    const config = getDbConfig();
    if (!validateDbConfig(config)) return;

    const testBtn = document.getElementById('dbTestConnectionBtn');
    const statusEl = document.getElementById('dbConnectionStatus');

    testBtn.disabled = true;
    testBtn.textContent = '🔄 Testing...';

    try {
      const response = await fetch('/api/database/test-connection', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: dbWizardState.dbType,
          config: config
        })
      });

      const data = await response.json();

      if (data.success) {
        statusEl.className = 'alert alert-success';
        statusEl.textContent = '✅ ' + data.message;
        statusEl.style.display = 'block';
        dbWizardState.connectionTested = true;
        dbWizardState.dbConfig = config;
        hideError();
      } else {
        statusEl.className = 'alert alert-danger';
        statusEl.textContent = '❌ ' + data.message;
        statusEl.style.display = 'block';
        dbWizardState.connectionTested = false;
      }
    } catch (error) {
      statusEl.className = 'alert alert-danger';
      statusEl.textContent = '❌ Connection failed: ' + error.message;
      statusEl.style.display = 'block';
    } finally {
      testBtn.disabled = false;
      testBtn.textContent = '🔍 Test Connection';
    }
  }

  /**
   * Initialize database
   */
  async function initializeDatabase() {
    const migrateData = document.getElementById('dbMigrateDataCheck').checked;
    const progressDiv = document.getElementById('dbMigrationProgress');
    const nextBtn = document.getElementById('dbNextBtn');

    nextBtn.disabled = true;
    nextBtn.textContent = '🔄 Đang khởi tạo...';

    try {
      if (migrateData && dbWizardState.existingData?.hasData) {
        progressDiv.style.display = 'block';
      }

      const response = await fetch('/api/database/initialize', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          type: dbWizardState.dbType,
          config: dbWizardState.dbConfig,
          migrateData: migrateData
        })
      });

      const data = await response.json();

      if (data.success) {
        if (data.migration) {
          await animateProgress(data.migration);
        }

        dbWizardState.initialized = true;
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
   * Animate progress
   */
  async function animateProgress(migration) {
    const items = [
      { key: 'users', count: migration.users?.count || 0 },
      { key: 'jobs', count: migration.jobs?.count || 0 },
      { key: 'config', count: migration.config?.count || 0 }
    ];

    for (const item of items) {
      await new Promise(resolve => setTimeout(resolve, 300));

      const progressBar = document.getElementById(`db${item.key.charAt(0).toUpperCase() + item.key.slice(1)}ProgressBar`);
      const progressText = document.getElementById(`db${item.key.charAt(0).toUpperCase() + item.key.slice(1)}Progress`);

      progressBar.style.width = '100%';
      progressText.textContent = `${item.count} items`;
    }

    await new Promise(resolve => setTimeout(resolve, 500));
  }

  /**
   * Display final summary
   */
  function displayFinalSummary(data) {
    const configEl = document.getElementById('dbFinalConfig');
    const summaryEl = document.getElementById('dbMigrationSummary');

    let configText = `Database Type: ${data.type}\n`;
    if (data.type === 'sqlite') {
      configText += `Path: ${dbWizardState.dbConfig.path}`;
    } else if (data.type === 'postgresql') {
      configText += `Host: ${dbWizardState.dbConfig.host}\n`;
      configText += `Port: ${dbWizardState.dbConfig.port}\n`;
      configText += `Database: ${dbWizardState.dbConfig.database}`;
    }
    configEl.textContent = configText;

    if (data.migration) {
      const migration = data.migration;
      let summaryHTML = '<div class="data-summary">';
      summaryHTML += '<h4>📊 Migration Summary</h4>';

      if (migration.users) {
        summaryHTML += `<div class="data-item"><span>Users migrated:</span><strong>${migration.users.count}</strong></div>`;
      }
      if (migration.jobs) {
        summaryHTML += `<div class="data-item"><span>Jobs migrated:</span><strong>${migration.jobs.count}</strong></div>`;
      }
      if (migration.config) {
        summaryHTML += `<div class="data-item"><span>Config entries:</span><strong>${migration.config.count}</strong></div>`;
      }

      summaryHTML += '</div>';
      summaryEl.innerHTML = summaryHTML;
    } else {
      summaryEl.innerHTML = '<p class="muted">Không có dữ liệu được migrate</p>';
    }
  }

  /**
   * Manual migrate
   */
  async function manualMigrate() {
    if (!confirm('Bạn có chắc muốn re-migrate dữ liệu từ JSON files?')) return;

    try {
      const response = await fetch('/api/database/migrate', {
        method: 'POST'
      });

      const data = await response.json();

      if (data.success) {
        showSuccessToast('✅ Migration thành công!');
        window.location.reload();
      } else {
        showErrorToast('❌ Migration thất bại: ' + data.message);
      }
    } catch (error) {
      showErrorToast('❌ Lỗi: ' + error.message);
    }
  }

  /**
   * Reset database
   */
  async function resetDatabase() {
    if (!confirm('⚠️ CẢNH BÁO: Bạn có chắc muốn reset database? (Dev only)')) return;
    if (!confirm('Hành động này sẽ xoá toàn bộ cấu hình database. Tiếp tục?')) return;

    try {
      const response = await fetch('/api/database/reset', {
        method: 'POST'
      });

      const data = await response.json();

      if (data.success) {
        showSuccessToast('✅ Database đã được reset!');
        window.location.reload();
      } else {
        showErrorToast('❌ Reset thất bại: ' + data.message);
      }
    } catch (error) {
      showErrorToast('❌ Lỗi: ' + error.message);
    }
  }

  /**
   * Show error
   */
  function showError(message) {
    const errorEl = document.getElementById('dbErrorMessage');
    errorEl.textContent = '❌ ' + message;
    errorEl.style.display = 'block';
  }

  /**
   * Hide error
   */
  function hideError() {
    document.getElementById('dbErrorMessage').style.display = 'none';
  }

  // Expose to global scope
  window.initDatabaseTab = initDatabaseTab;
})();
