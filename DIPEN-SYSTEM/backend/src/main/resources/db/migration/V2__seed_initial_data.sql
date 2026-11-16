-- ============================================================================
-- DIPEN SYSTEM – MANUFACTURING ERP
-- Flyway Migration V2: Seed Preserved Roles, Permissions, Users & Settings
-- Note: Original SHA-256 digests are preserved in legacy_sha256_hash (no plaintext)
--       and transparently upgraded to BCrypt on each user's first login.
-- ============================================================================

INSERT IGNORE INTO erp_roles (role_name, description) VALUES
('Super Admin', 'Full Operations, Procurement, Tender, Security & System Admin access'),
('Operations Manager', 'Full Operations & Procurement access without user security management'),
('Procurement Officer', 'Procurement, Exchange Rates, Tenders & Stock View'),
('Store Officer', 'Goods Receipt, Issue, Stock View & Transaction Edit'),
('Production Officer', 'Production, Issue, Stock View & Transaction Edit'),
('Dispatch Officer', 'Dispatch, Stock View & Transaction Edit'),
('Viewer', 'Read-only Stock & Reports');

INSERT IGNORE INTO erp_permissions (perm_code, description) VALUES
('ITEM_MANAGE', 'Create, edit, activate/deactivate and delete items'),
('PRODUCTION_WRITE', 'Record production transactions'),
('RECEIPT_WRITE', 'Record goods receipt transactions'),
('DISPATCH_WRITE', 'Record dispatch transactions'),
('ISSUE_WRITE', 'Record material issue transactions'),
('ISSUE_FG', 'Issue finished goods via Issue module'),
('STOCK_VIEW', 'View stock balances and registers'),
('REPORT_GENERATE', 'Generate and export stock/transaction reports'),
('REPORT_SUBMIT', 'Submit official daily stock snapshots'),
('STOCK_ADJUST', 'Perform authorized stock adjustments'),
('TX_EDIT', 'Edit existing transactions with audit trail'),
('TX_CANCEL', 'Cancel transactions with reversal audit trail'),
('NEGATIVE_OVERRIDE', 'Override negative stock balance check when permitted'),
('SYNC_ADMIN', 'Manage Google Sheets sync, settings, triggers & backups'),
('AUDIT_VIEW', 'View Operations and Procurement audit logs'),
('USER_MANAGE', 'Manage user accounts and RBAC role assignments'),
('PROCUREMENT_VIEW', 'View Procurement, Import & Tender modules'),
('PROCUREMENT_WRITE', 'Create, edit and delete Procurement & FX records'),
('PROCUREMENT_APPROVE', 'Approve Indents, Quotations and Purchase Orders'),
('TENDER_WRITE', 'Manage Tenders and Won Tender Tracking');

-- Super Admin (all 20)
INSERT IGNORE INTO erp_role_permissions (role_name, perm_code)
SELECT 'Super Admin', perm_code FROM erp_permissions;

-- Operations Manager (19, excluding USER_MANAGE)
INSERT IGNORE INTO erp_role_permissions (role_name, perm_code)
SELECT 'Operations Manager', perm_code FROM erp_permissions WHERE perm_code <> 'USER_MANAGE';

-- Procurement Officer
INSERT IGNORE INTO erp_role_permissions (role_name, perm_code) VALUES
('Procurement Officer', 'PROCUREMENT_VIEW'),
('Procurement Officer', 'PROCUREMENT_WRITE'),
('Procurement Officer', 'PROCUREMENT_APPROVE'),
('Procurement Officer', 'TENDER_WRITE'),
('Procurement Officer', 'STOCK_VIEW'),
('Procurement Officer', 'REPORT_GENERATE');

-- Store Officer
INSERT IGNORE INTO erp_role_permissions (role_name, perm_code) VALUES
('Store Officer', 'RECEIPT_WRITE'),
('Store Officer', 'ISSUE_WRITE'),
('Store Officer', 'STOCK_VIEW'),
('Store Officer', 'REPORT_GENERATE'),
('Store Officer', 'TX_EDIT');

-- Production Officer
INSERT IGNORE INTO erp_role_permissions (role_name, perm_code) VALUES
('Production Officer', 'PRODUCTION_WRITE'),
('Production Officer', 'ISSUE_WRITE'),
('Production Officer', 'STOCK_VIEW'),
('Production Officer', 'REPORT_GENERATE'),
('Production Officer', 'TX_EDIT');

-- Dispatch Officer
INSERT IGNORE INTO erp_role_permissions (role_name, perm_code) VALUES
('Dispatch Officer', 'DISPATCH_WRITE'),
('Dispatch Officer', 'STOCK_VIEW'),
('Dispatch Officer', 'REPORT_GENERATE'),
('Dispatch Officer', 'TX_EDIT');

-- Viewer
INSERT IGNORE INTO erp_role_permissions (role_name, perm_code) VALUES
('Viewer', 'STOCK_VIEW'),
('Viewer', 'REPORT_GENERATE');

-- Authorized Users (exact preserved accounts & SHA-256 hashes from Code.js)
INSERT IGNORE INTO erp_users
  (email, alias_emails, display_name, password_hash, legacy_sha256_hash, bcrypt_upgraded, role_name, department, status)
VALUES
  ('dipen.khadka@birathralthcare.com', 'dipen.khadka@birathealthcare.com', 'Dipen Khadka', NULL, '984247d845211ce479179cec1735ba6a109a8906f78182f19022a69b5a1a6cc1', 0, 'Super Admin', 'Executive & System Administration', 'Active'),
  ('sajal.khadka@birathealthcare.com', NULL, 'Sajal Khadka', NULL, 'dbea622c66ab15f9d4f11f2328463c4a33cd73345e5c846b5624982424e89d58', 0, 'Operations Manager', 'Operations & Procurement', 'Active'),
  ('dispatch@birathealthcare.com', NULL, 'Dispatch Officer', NULL, '7b9e650e5268e6be9584f5d2e903a01f7a6b52469eebffc4c9535aa6e6afef31', 0, 'Dispatch Officer', 'Dispatch & Logistics', 'Active'),
  ('production@birathealthcare.com', NULL, 'Production Officer', NULL, '5bd6f03abc5ff01cafcd5d5034fb530bc916cd102022d8e081608ead0814791b', 0, 'Production Officer', 'Manufacturing & Production', 'Active');

-- Default System Settings (exact keys from Code.js)
INSERT IGNORE INTO erp_settings (setting_key, setting_value, description) VALUES
('SYSTEM_INITIALIZED', 'TRUE', 'Indicates ERP schema has been initialized'),
('POLL_INTERVAL_SEC', '30', 'Frontend auto-refresh polling interval in seconds'),
('ALLOW_NEGATIVE_STOCK_OVERRIDE', 'FALSE', 'Allow authorized admin override for negative stock dispatch/issue'),
('AUTHORIZE_FG_ISSUE', 'FALSE', 'Allow issuing Finished Goods via Issue module'),
('PRODUCTION_STRICT_FG_ONLY', 'FALSE', 'If TRUE, flag WIP or Packing Material in Production as invalid classification'),
('DEFAULT_UNLISTED_ROLE', 'Operations Manager', 'Fallback role reference'),
('ERP_DATA_VERSION', '1', 'Monotonic data version counter'),
('ERP_LAST_SYNC_AT', DATE_FORMAT(NOW(), '%Y-%m-%d %H:%i:%s'), 'Timestamp of last data mutation or sync');

-- Default Date-Wise Exchange Rate Baseline (Base: NPR)
INSERT IGNORE INTO proc_exchange_rates (rate_date, usd, inr, eur, gbp, cny, npr, remarks, updated_by, updated_at)
VALUES ('2026-01-01', 135.500000, 1.601500, 146.200000, 172.800000, 18.600000, 1.000000, 'System baseline rate (Base: NPR)', 'system-seed', DATE_FORMAT(NOW(), '%Y-%m-%d %H:%i:%s'));

INSERT IGNORE INTO proc_settings (setting_key, setting_value, description, updated_at) VALUES
('DEFAULT_EXCHANGE_RATE_USD', '135.50', 'Baseline USD rate in NPR', DATE_FORMAT(NOW(), '%Y-%m-%d %H:%i:%s')),
('DEFAULT_EXCHANGE_RATE_INR', '1.6015', 'Baseline INR rate in NPR', DATE_FORMAT(NOW(), '%Y-%m-%d %H:%i:%s')),
('DEFAULT_EXCHANGE_RATE_EUR', '146.20', 'Baseline EUR rate in NPR', DATE_FORMAT(NOW(), '%Y-%m-%d %H:%i:%s')),
('DEFAULT_EXCHANGE_RATE_GBP', '172.80', 'Baseline GBP rate in NPR', DATE_FORMAT(NOW(), '%Y-%m-%d %H:%i:%s')),
('DEFAULT_EXCHANGE_RATE_CNY', '18.60', 'Baseline CNY rate in NPR', DATE_FORMAT(NOW(), '%Y-%m-%d %H:%i:%s'));
