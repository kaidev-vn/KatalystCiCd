/**
 * Database Schema Definitions
 * Hỗ trợ cả SQLite và PostgreSQL
 */

// SQLite Schema
const sqlite = `
-- Users Table
CREATE TABLE IF NOT EXISTS users (
  id TEXT PRIMARY KEY,
  username TEXT UNIQUE NOT NULL,
  password TEXT NOT NULL,
  role TEXT NOT NULL CHECK(role IN ('admin', 'user', 'viewer')),
  must_change_password INTEGER DEFAULT 0,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  last_login TEXT
);

-- Jobs Table
CREATE TABLE IF NOT EXISTS jobs (
  id TEXT PRIMARY KEY,
  name TEXT NOT NULL,
  enabled INTEGER DEFAULT 1,
  git_provider TEXT NOT NULL,
  git_repo_url TEXT NOT NULL,
  git_branch TEXT NOT NULL,
  git_username TEXT,
  git_password TEXT,
  docker_enabled INTEGER DEFAULT 0,
  docker_registry TEXT,
  docker_image_name TEXT,
  docker_tag TEXT DEFAULT 'latest',
  schedule_auto_check INTEGER DEFAULT 1,
  schedule_trigger_method TEXT DEFAULT 'polling' CHECK(schedule_trigger_method IN ('polling', 'webhook', 'hybrid')),
  schedule_interval INTEGER DEFAULT 300000,
  services TEXT,
  created_at TEXT DEFAULT (datetime('now')),
  updated_at TEXT DEFAULT (datetime('now')),
  created_by TEXT REFERENCES users(id)
);

-- Job Stats Table
CREATE TABLE IF NOT EXISTS job_stats (
  job_id TEXT PRIMARY KEY REFERENCES jobs(id) ON DELETE CASCADE,
  total_runs INTEGER DEFAULT 0,
  success_count INTEGER DEFAULT 0,
  failure_count INTEGER DEFAULT 0,
  last_run TEXT,
  last_commit TEXT,
  triggered_by_polling INTEGER DEFAULT 0,
  triggered_by_webhook INTEGER DEFAULT 0,
  triggered_by_manual INTEGER DEFAULT 0
);

-- Builds Table
CREATE TABLE IF NOT EXISTS builds (
  id TEXT PRIMARY KEY,
  job_id TEXT NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  status TEXT NOT NULL CHECK(status IN ('pending', 'running', 'success', 'failed')),
  trigger_source TEXT CHECK(trigger_source IN ('polling', 'webhook', 'manual')),
  commit_hash TEXT,
  commit_message TEXT,
  commit_author TEXT,
  started_at TEXT DEFAULT (datetime('now')),
  completed_at TEXT,
  duration_ms INTEGER,
  logs TEXT,
  error_message TEXT
);

-- Config Table
CREATE TABLE IF NOT EXISTS config (
  key TEXT PRIMARY KEY,
  value TEXT,
  updated_at TEXT DEFAULT (datetime('now')),
  updated_by TEXT REFERENCES users(id)
);

-- Audit Log Table
CREATE TABLE IF NOT EXISTS audit_logs (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  user_id TEXT REFERENCES users(id),
  action TEXT NOT NULL,
  resource_type TEXT,
  resource_id TEXT,
  details TEXT,
  ip_address TEXT,
  timestamp TEXT DEFAULT (datetime('now'))
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_jobs_enabled ON jobs(enabled);
CREATE INDEX IF NOT EXISTS idx_jobs_trigger_method ON jobs(schedule_trigger_method);
CREATE INDEX IF NOT EXISTS idx_builds_job_id ON builds(job_id);
CREATE INDEX IF NOT EXISTS idx_builds_status ON builds(status);
CREATE INDEX IF NOT EXISTS idx_builds_started_at ON builds(started_at);
CREATE INDEX IF NOT EXISTS idx_audit_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_logs(timestamp);
`;

// PostgreSQL Schema
const postgresql = `
-- Users Table
CREATE TABLE IF NOT EXISTS users (
  id UUID PRIMARY KEY,
  username VARCHAR(255) UNIQUE NOT NULL,
  password VARCHAR(255) NOT NULL,
  role VARCHAR(50) NOT NULL CHECK(role IN ('admin', 'user', 'viewer')),
  must_change_password BOOLEAN DEFAULT false,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  last_login TIMESTAMP
);

-- Jobs Table
CREATE TABLE IF NOT EXISTS jobs (
  id UUID PRIMARY KEY,
  name VARCHAR(255) NOT NULL,
  enabled BOOLEAN DEFAULT true,
  git_provider VARCHAR(50) NOT NULL,
  git_repo_url TEXT NOT NULL,
  git_branch VARCHAR(255) NOT NULL,
  git_username VARCHAR(255),
  git_password VARCHAR(255),
  docker_enabled BOOLEAN DEFAULT false,
  docker_registry VARCHAR(255),
  docker_image_name VARCHAR(255),
  docker_tag VARCHAR(50) DEFAULT 'latest',
  schedule_auto_check BOOLEAN DEFAULT true,
  schedule_trigger_method VARCHAR(50) DEFAULT 'polling' CHECK(schedule_trigger_method IN ('polling', 'webhook', 'hybrid')),
  schedule_interval INTEGER DEFAULT 300000,
  services JSONB,
  created_at TIMESTAMP DEFAULT NOW(),
  updated_at TIMESTAMP DEFAULT NOW(),
  created_by UUID REFERENCES users(id)
);

-- Job Stats Table
CREATE TABLE IF NOT EXISTS job_stats (
  job_id UUID PRIMARY KEY REFERENCES jobs(id) ON DELETE CASCADE,
  total_runs INTEGER DEFAULT 0,
  success_count INTEGER DEFAULT 0,
  failure_count INTEGER DEFAULT 0,
  last_run TIMESTAMP,
  last_commit VARCHAR(255),
  triggered_by_polling INTEGER DEFAULT 0,
  triggered_by_webhook INTEGER DEFAULT 0,
  triggered_by_manual INTEGER DEFAULT 0
);

-- Builds Table
CREATE TABLE IF NOT EXISTS builds (
  id UUID PRIMARY KEY,
  job_id UUID NOT NULL REFERENCES jobs(id) ON DELETE CASCADE,
  status VARCHAR(50) NOT NULL CHECK(status IN ('pending', 'running', 'success', 'failed')),
  trigger_source VARCHAR(50) CHECK(trigger_source IN ('polling', 'webhook', 'manual')),
  commit_hash VARCHAR(255),
  commit_message TEXT,
  commit_author VARCHAR(255),
  started_at TIMESTAMP DEFAULT NOW(),
  completed_at TIMESTAMP,
  duration_ms INTEGER,
  logs TEXT,
  error_message TEXT
);

-- Config Table
CREATE TABLE IF NOT EXISTS config (
  key VARCHAR(255) PRIMARY KEY,
  value JSONB,
  updated_at TIMESTAMP DEFAULT NOW(),
  updated_by UUID REFERENCES users(id)
);

-- Audit Log Table
CREATE TABLE IF NOT EXISTS audit_logs (
  id SERIAL PRIMARY KEY,
  user_id UUID REFERENCES users(id),
  action VARCHAR(255) NOT NULL,
  resource_type VARCHAR(100),
  resource_id VARCHAR(255),
  details JSONB,
  ip_address VARCHAR(50),
  timestamp TIMESTAMP DEFAULT NOW()
);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_users_username ON users(username);
CREATE INDEX IF NOT EXISTS idx_users_role ON users(role);
CREATE INDEX IF NOT EXISTS idx_jobs_enabled ON jobs(enabled);
CREATE INDEX IF NOT EXISTS idx_jobs_trigger_method ON jobs(schedule_trigger_method);
CREATE INDEX IF NOT EXISTS idx_builds_job_id ON builds(job_id);
CREATE INDEX IF NOT EXISTS idx_builds_status ON builds(status);
CREATE INDEX IF NOT EXISTS idx_builds_started_at ON builds(started_at DESC);
CREATE INDEX IF NOT EXISTS idx_audit_user_id ON audit_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_audit_timestamp ON audit_logs(timestamp DESC);
`;

module.exports = {
  sqlite,
  postgresql
};
