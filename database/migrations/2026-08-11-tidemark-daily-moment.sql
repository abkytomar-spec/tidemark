CREATE TABLE IF NOT EXISTS daily_moment_settings (
  user_id CHAR(36) PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT FALSE,
  window_start TIME NOT NULL DEFAULT '12:00:00',
  window_end TIME NOT NULL DEFAULT '17:00:00',
  notifications BOOLEAN NOT NULL DEFAULT FALSE,
  created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_daily_moment_settings_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS daily_moment_days (
  id CHAR(36) PRIMARY KEY, user_id CHAR(36) NOT NULL, local_date DATE NOT NULL,
  scheduled_time TIME NOT NULL, status ENUM('scheduled','sent','captured','skipped') NOT NULL DEFAULT 'scheduled',
  captured_at TIMESTAMP(3) NULL, caption VARCHAR(240) NOT NULL DEFAULT '', created_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  UNIQUE KEY uq_daily_moment_day (user_id,local_date),
  CONSTRAINT fk_daily_moment_day_user FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

SET @tidemark_sql = IF(
  EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='proof_photos' AND COLUMN_NAME='daily_moment_id'),
  'SELECT 1',
  'ALTER TABLE proof_photos ADD COLUMN daily_moment_id CHAR(36) NULL AFTER progress_entry_id'
);
PREPARE tidemark_statement FROM @tidemark_sql;
EXECUTE tidemark_statement;
DEALLOCATE PREPARE tidemark_statement;

SET @tidemark_sql = IF(
  EXISTS(SELECT 1 FROM information_schema.STATISTICS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='proof_photos' AND INDEX_NAME='uq_proof_daily_moment'),
  'SELECT 1',
  'ALTER TABLE proof_photos ADD UNIQUE KEY uq_proof_daily_moment (daily_moment_id)'
);
PREPARE tidemark_statement FROM @tidemark_sql;
EXECUTE tidemark_statement;
DEALLOCATE PREPARE tidemark_statement;

SET @tidemark_sql = IF(
  EXISTS(SELECT 1 FROM information_schema.REFERENTIAL_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME='proof_photos' AND CONSTRAINT_NAME='fk_proof_daily_moment'),
  'SELECT 1',
  'ALTER TABLE proof_photos ADD CONSTRAINT fk_proof_daily_moment FOREIGN KEY (daily_moment_id) REFERENCES daily_moment_days(id) ON DELETE CASCADE'
);
PREPARE tidemark_statement FROM @tidemark_sql;
EXECUTE tidemark_statement;
DEALLOCATE PREPARE tidemark_statement;

SET @tidemark_sql = IF(
  EXISTS(SELECT 1 FROM information_schema.TABLE_CONSTRAINTS WHERE CONSTRAINT_SCHEMA=DATABASE() AND TABLE_NAME='proof_photos' AND CONSTRAINT_NAME='proof_owner_check'),
  'ALTER TABLE proof_photos DROP CONSTRAINT proof_owner_check',
  'SELECT 1'
);
PREPARE tidemark_statement FROM @tidemark_sql;
EXECUTE tidemark_statement;
DEALLOCATE PREPARE tidemark_statement;

ALTER TABLE proof_photos ADD CONSTRAINT proof_owner_check CHECK ((completion_id IS NOT NULL) + (progress_entry_id IS NOT NULL) + (daily_moment_id IS NOT NULL) = 1);
