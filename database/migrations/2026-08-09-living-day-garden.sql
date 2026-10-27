SET @tidemark_sql = IF(
  EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='daily_checkins' AND COLUMN_NAME='intention'),
  'SELECT 1',
  'ALTER TABLE daily_checkins ADD COLUMN intention VARCHAR(280) NULL AFTER note'
);
PREPARE tidemark_statement FROM @tidemark_sql;
EXECUTE tidemark_statement;
DEALLOCATE PREPARE tidemark_statement;

SET @tidemark_sql = IF(
  EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='daily_checkins' AND COLUMN_NAME='win'),
  'SELECT 1',
  'ALTER TABLE daily_checkins ADD COLUMN win VARCHAR(280) NULL AFTER intention'
);
PREPARE tidemark_statement FROM @tidemark_sql;
EXECUTE tidemark_statement;
DEALLOCATE PREPARE tidemark_statement;

SET @tidemark_sql = IF(
  EXISTS(SELECT 1 FROM information_schema.COLUMNS WHERE TABLE_SCHEMA=DATABASE() AND TABLE_NAME='daily_checkins' AND COLUMN_NAME='gratitude'),
  'SELECT 1',
  'ALTER TABLE daily_checkins ADD COLUMN gratitude VARCHAR(280) NULL AFTER win'
);
PREPARE tidemark_statement FROM @tidemark_sql;
EXECUTE tidemark_statement;
DEALLOCATE PREPARE tidemark_statement;
