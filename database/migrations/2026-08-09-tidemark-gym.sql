SET @tidemark_has_gym_type = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'goals' AND COLUMN_NAME = 'guided_gym_type'
);
SET @tidemark_gym_type_sql = IF(
  @tidemark_has_gym_type = 0,
  'ALTER TABLE goals ADD COLUMN guided_gym_type VARCHAR(32) NULL AFTER color',
  'SELECT 1'
);
PREPARE tidemark_gym_type_statement FROM @tidemark_gym_type_sql;
EXECUTE tidemark_gym_type_statement;
DEALLOCATE PREPARE tidemark_gym_type_statement;

SET @tidemark_has_gym_settings = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'goals' AND COLUMN_NAME = 'guided_gym_settings'
);
SET @tidemark_gym_settings_sql = IF(
  @tidemark_has_gym_settings = 0,
  'ALTER TABLE goals ADD COLUMN guided_gym_settings JSON NULL AFTER guided_gym_type',
  'SELECT 1'
);
PREPARE tidemark_gym_settings_statement FROM @tidemark_gym_settings_sql;
EXECUTE tidemark_gym_settings_statement;
DEALLOCATE PREPARE tidemark_gym_settings_statement;

CREATE TABLE IF NOT EXISTS gym_plans (
  id CHAR(36) PRIMARY KEY, user_id CHAR(36) NOT NULL, primary_goal_id CHAR(36) NOT NULL,
  rest_mode ENUM('fixed','flexible') NOT NULL, fixed_rest_weekdays JSON NOT NULL,
  flexible_rest_allowance TINYINT UNSIGNED NOT NULL, training_weekdays JSON NOT NULL,
  weekly_session_target TINYINT UNSIGNED NOT NULL, weight_unit ENUM('kg','lb') NOT NULL,
  measurement_unit ENUM('cm','in') NOT NULL, effective_from DATE NOT NULL, effective_to DATE NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX gym_plan_user_dates (user_id,effective_from,effective_to),
  UNIQUE KEY gym_plan_user_effective (user_id,effective_from),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (primary_goal_id) REFERENCES goals(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS gym_routines (
  id CHAR(36) PRIMARY KEY, user_id CHAR(36) NOT NULL, name VARCHAR(120) NOT NULL,
  template_source VARCHAR(40) NULL, exercises JSON NOT NULL, position SMALLINT UNSIGNED NOT NULL DEFAULT 0,
  active BOOLEAN NOT NULL DEFAULT TRUE, created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  INDEX gym_routine_user_position (user_id,position),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS gym_rest_events (
  id CHAR(36) PRIMARY KEY, user_id CHAR(36) NOT NULL, local_date DATE NOT NULL,
  kind ENUM('fixed','flexible') NOT NULL, created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  UNIQUE KEY gym_rest_user_date (user_id,local_date),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS streak_safes (
  user_id CHAR(36) NOT NULL, scope ENUM('gym','global') NOT NULL,
  `stored` TINYINT UNSIGNED NOT NULL DEFAULT 0, qualifying_count TINYINT UNSIGNED NOT NULL DEFAULT 0,
  qualifying_entry_ids JSON NOT NULL DEFAULT (JSON_ARRAY()),
  earned_entry_ids JSON NOT NULL DEFAULT (JSON_ARRAY()),
  last_protected_date DATE NULL, PRIMARY KEY (user_id,scope),
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET @tidemark_has_gym_safe_entries = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'streak_safes' AND COLUMN_NAME = 'qualifying_entry_ids'
);
SET @tidemark_gym_safe_entries_sql = IF(
  @tidemark_has_gym_safe_entries = 0,
  'ALTER TABLE streak_safes ADD COLUMN qualifying_entry_ids JSON NOT NULL DEFAULT (JSON_ARRAY()) AFTER qualifying_count',
  'SELECT 1'
);
PREPARE tidemark_gym_safe_entries_statement FROM @tidemark_gym_safe_entries_sql;
EXECUTE tidemark_gym_safe_entries_statement;
DEALLOCATE PREPARE tidemark_gym_safe_entries_statement;

SET @tidemark_gym_safe_reset_sql = IF(
  @tidemark_has_gym_safe_entries = 0,
  'UPDATE streak_safes SET qualifying_count=0 WHERE scope=''gym''',
  'SELECT 1'
);
PREPARE tidemark_gym_safe_reset_statement FROM @tidemark_gym_safe_reset_sql;
EXECUTE tidemark_gym_safe_reset_statement;
DEALLOCATE PREPARE tidemark_gym_safe_reset_statement;

SET @tidemark_has_gym_safe_earned = (
  SELECT COUNT(*) FROM information_schema.COLUMNS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'streak_safes' AND COLUMN_NAME = 'earned_entry_ids'
);
SET @tidemark_gym_safe_earned_sql = IF(
  @tidemark_has_gym_safe_earned = 0,
  'ALTER TABLE streak_safes ADD COLUMN earned_entry_ids JSON NOT NULL DEFAULT (JSON_ARRAY()) AFTER qualifying_entry_ids',
  'SELECT 1'
);
PREPARE tidemark_gym_safe_earned_statement FROM @tidemark_gym_safe_earned_sql;
EXECUTE tidemark_gym_safe_earned_statement;
DEALLOCATE PREPARE tidemark_gym_safe_earned_statement;

SET @tidemark_gym_safe_earned_reset_sql = IF(
  @tidemark_has_gym_safe_earned = 0,
  'UPDATE streak_safes SET `stored`=0,qualifying_count=0 WHERE scope=''gym''',
  'SELECT 1'
);
PREPARE tidemark_gym_safe_earned_reset_statement FROM @tidemark_gym_safe_earned_reset_sql;
EXECUTE tidemark_gym_safe_earned_reset_statement;
DEALLOCATE PREPARE tidemark_gym_safe_earned_reset_statement;

SET @tidemark_has_gym_plan_effective = (
  SELECT COUNT(*) FROM information_schema.STATISTICS
  WHERE TABLE_SCHEMA = DATABASE() AND TABLE_NAME = 'gym_plans' AND INDEX_NAME = 'gym_plan_user_effective'
);
SET @tidemark_gym_plan_dedupe_sql = IF(
  @tidemark_has_gym_plan_effective = 0,
  'DELETE older FROM gym_plans older JOIN gym_plans newer ON newer.user_id=older.user_id AND newer.effective_from=older.effective_from AND (newer.created_at>older.created_at OR (newer.created_at=older.created_at AND newer.id>older.id))',
  'SELECT 1'
);
PREPARE tidemark_gym_plan_dedupe_statement FROM @tidemark_gym_plan_dedupe_sql;
EXECUTE tidemark_gym_plan_dedupe_statement;
DEALLOCATE PREPARE tidemark_gym_plan_dedupe_statement;

SET @tidemark_gym_plan_effective_sql = IF(
  @tidemark_has_gym_plan_effective = 0,
  'ALTER TABLE gym_plans ADD UNIQUE KEY gym_plan_user_effective (user_id,effective_from)',
  'SELECT 1'
);
PREPARE tidemark_gym_plan_effective_statement FROM @tidemark_gym_plan_effective_sql;
EXECUTE tidemark_gym_plan_effective_statement;
DEALLOCATE PREPARE tidemark_gym_plan_effective_statement;
