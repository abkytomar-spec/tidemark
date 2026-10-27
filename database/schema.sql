CREATE TABLE users (
  id CHAR(36) PRIMARY KEY,
  singleton TINYINT NOT NULL DEFAULT 1 UNIQUE,
  email VARCHAR(254) NOT NULL UNIQUE,
  password_hash VARCHAR(255) NOT NULL,
  timezone VARCHAR(64) NOT NULL,
  preferences JSON NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE goals (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  title VARCHAR(160) NOT NULL,
  description TEXT NOT NULL,
  life_area ENUM('fitness','learning','work','money','wellbeing','home') NOT NULL,
  tracking_type VARCHAR(40) NOT NULL,
  target_value DECIMAL(14,2) NOT NULL DEFAULT 1,
  current_value DECIMAL(14,2) NOT NULL DEFAULT 0,
  unit VARCHAR(32) NOT NULL DEFAULT '',
  deadline DATE NULL,
  color CHAR(7) NOT NULL,
  guided_gym_type VARCHAR(32) NULL,
  guided_gym_settings JSON NULL,
  status ENUM('active','completed','archived') NOT NULL DEFAULT 'active',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX goals_user_status (user_id, status),
  CONSTRAINT goals_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE gym_plans (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  primary_goal_id CHAR(36) NOT NULL,
  rest_mode ENUM('fixed','flexible') NOT NULL,
  fixed_rest_weekdays JSON NOT NULL,
  flexible_rest_allowance TINYINT UNSIGNED NOT NULL,
  training_weekdays JSON NOT NULL,
  weekly_session_target TINYINT UNSIGNED NOT NULL,
  weight_unit ENUM('kg','lb') NOT NULL,
  measurement_unit ENUM('cm','in') NOT NULL,
  effective_from DATE NOT NULL,
  effective_to DATE NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX gym_plan_user_dates (user_id,effective_from,effective_to),
  UNIQUE KEY gym_plan_user_effective (user_id,effective_from),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (primary_goal_id) REFERENCES goals(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE gym_routines (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  name VARCHAR(120) NOT NULL,
  template_source VARCHAR(40) NULL,
  exercises JSON NOT NULL,
  position SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX gym_routine_user_position (user_id,position),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE gym_rest_events (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  local_date DATE NOT NULL,
  kind ENUM('fixed','flexible') NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY gym_rest_user_date (user_id,local_date),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE streak_safes (
  user_id CHAR(36) NOT NULL,
  scope ENUM('gym','global') NOT NULL,
  `stored` TINYINT UNSIGNED NOT NULL DEFAULT 0,
  qualifying_count TINYINT UNSIGNED NOT NULL DEFAULT 0,
  qualifying_entry_ids JSON NOT NULL DEFAULT (JSON_ARRAY()),
  earned_entry_ids JSON NOT NULL DEFAULT (JSON_ARRAY()),
  last_protected_date DATE NULL,
  PRIMARY KEY (user_id,scope),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE daily_moment_settings (
  user_id CHAR(36) PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  window_start TIME NOT NULL DEFAULT '12:00:00',
  window_end TIME NOT NULL DEFAULT '17:00:00',
  notifications BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_daily_moment_settings_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE daily_moment_days (
  id CHAR(36) PRIMARY KEY, user_id CHAR(36) NOT NULL, local_date DATE NOT NULL,
  scheduled_time TIME NOT NULL, status ENUM('scheduled','sent','captured','skipped') NOT NULL DEFAULT 'scheduled',
  captured_at TIMESTAMP(3) NULL, caption VARCHAR(240) NOT NULL DEFAULT '', created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_daily_moment_day (user_id,local_date),
  CONSTRAINT fk_daily_moment_day_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE tasks (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  goal_id CHAR(36) NULL,
  title VARCHAR(160) NOT NULL,
  notes TEXT NOT NULL,
  priority ENUM('low','medium','high') NOT NULL DEFAULT 'medium',
  color CHAR(7) NOT NULL,
  estimated_minutes SMALLINT UNSIGNED NOT NULL DEFAULT 15,
  energy ENUM('low','medium','high') NOT NULL DEFAULT 'medium',
  schedule_date DATE NOT NULL,
  schedule_time TIME NULL,
  recurrence_type ENUM('one_time','daily','weekly','monthly') NOT NULL DEFAULT 'one_time',
  recurrence_weekdays JSON NULL,
  recurrence_day TINYINT UNSIGNED NULL,
  proof_required BOOLEAN NOT NULL DEFAULT FALSE,
  archived BOOLEAN NOT NULL DEFAULT FALSE,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX tasks_user_date (user_id, schedule_date),
  CONSTRAINT tasks_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT tasks_goal_fk FOREIGN KEY (goal_id) REFERENCES goals(id) ON DELETE SET NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE task_completions (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  task_id CHAR(36) NOT NULL,
  occurrence_date DATE NOT NULL,
  completed_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  note TEXT NOT NULL,
  points SMALLINT UNSIGNED NOT NULL,
  status ENUM('complete','pending_proof') NOT NULL DEFAULT 'complete',
  UNIQUE KEY completion_occurrence (task_id, occurrence_date),
  INDEX completions_user_date (user_id, occurrence_date),
  CONSTRAINT completions_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT completions_task_fk FOREIGN KEY (task_id) REFERENCES tasks(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE milestones (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  goal_id CHAR(36) NOT NULL,
  label VARCHAR(120) NOT NULL,
  target_value DECIMAL(14,2) NOT NULL,
  completed_at DATETIME(3) NULL,
  position SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  CONSTRAINT milestones_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT milestones_goal_fk FOREIGN KEY (goal_id) REFERENCES goals(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE progress_entries (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  goal_id CHAR(36) NOT NULL,
  entry_type VARCHAR(40) NOT NULL,
  metric VARCHAR(80) NOT NULL,
  value DECIMAL(14,2) NOT NULL DEFAULT 0,
  duration_minutes SMALLINT UNSIGNED NULL,
  details JSON NOT NULL,
  note TEXT NOT NULL,
  occurrence_at DATETIME(3) NOT NULL,
  status ENUM('complete','pending_proof') NOT NULL DEFAULT 'complete',
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX entries_user_time (user_id, occurrence_at),
  CONSTRAINT entries_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT entries_goal_fk FOREIGN KEY (goal_id) REFERENCES goals(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE daily_checkins (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  local_date DATE NOT NULL,
  energy ENUM('low','medium','high') NOT NULL,
  mood TINYINT UNSIGNED NOT NULL,
  note TEXT NOT NULL,
  intention VARCHAR(280) NULL,
  win VARCHAR(280) NULL,
  gratitude VARCHAR(280) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY checkin_day (user_id, local_date),
  CONSTRAINT checkins_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE proof_photos (
  id CHAR(36) PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  completion_id CHAR(36) NULL,
  progress_entry_id CHAR(36) NULL,
  daily_moment_id CHAR(36) NULL,
  caption VARCHAR(240) NOT NULL DEFAULT '',
  storage_path VARCHAR(500) NOT NULL,
  media_type VARCHAR(32) NOT NULL,
  byte_size INT UNSIGNED NOT NULL,
  original_name VARCHAR(255) NOT NULL,
  selected_for_recap BOOLEAN NOT NULL DEFAULT FALSE,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX proofs_user_time (user_id, created_at),
  INDEX proof_daily_moment (daily_moment_id),
  CONSTRAINT proofs_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  CONSTRAINT proofs_completion_fk FOREIGN KEY (completion_id) REFERENCES task_completions(id) ON DELETE CASCADE,
  CONSTRAINT proofs_entry_fk FOREIGN KEY (progress_entry_id) REFERENCES progress_entries(id) ON DELETE CASCADE,
  CONSTRAINT fk_proof_daily_moment FOREIGN KEY (daily_moment_id) REFERENCES daily_moment_days(id) ON DELETE CASCADE,
  CONSTRAINT proof_owner_check CHECK ((completion_id IS NOT NULL) + (progress_entry_id IS NOT NULL) + (daily_moment_id IS NOT NULL) = 1)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE activity_events (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id CHAR(36) NOT NULL,
  event_type VARCHAR(50) NOT NULL,
  message VARCHAR(255) NOT NULL,
  related_type VARCHAR(40) NOT NULL,
  related_id CHAR(36) NOT NULL,
  data JSON NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX activity_user_time (user_id, created_at),
  CONSTRAINT activity_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE offline_receipts (
  user_id CHAR(36) NOT NULL,
  mutation_id CHAR(36) NOT NULL,
  response_json JSON NOT NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (user_id, mutation_id),
  CONSTRAINT receipts_user_fk FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE login_attempts (
  bucket_hash CHAR(64) NOT NULL,
  attempted_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX attempts_bucket_time (bucket_hash, attempted_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
