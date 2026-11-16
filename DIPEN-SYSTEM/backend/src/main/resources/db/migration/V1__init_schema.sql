-- ============================================================================
-- DIPEN SYSTEM – MANUFACTURING ERP (Birat Healthcare Industries Pvt. Ltd.)
-- Flyway Migration V1: Complete DIPEN_ERP MySQL 8.4 LTS Schema
-- Engine: InnoDB | Charset: utf8mb4 | Decimal-safe financial & stock columns
-- ============================================================================

SET NAMES utf8mb4;

-- ----------------------------------------------------------------------------
-- 1. AUTHENTICATION, ROLES, PERMISSIONS & SESSIONS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS erp_roles (
  role_name VARCHAR(64) NOT NULL PRIMARY KEY,
  description VARCHAR(255) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS erp_permissions (
  perm_code VARCHAR(64) NOT NULL PRIMARY KEY,
  description VARCHAR(255) NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS erp_role_permissions (
  role_name VARCHAR(64) NOT NULL,
  perm_code VARCHAR(64) NOT NULL,
  PRIMARY KEY (role_name, perm_code),
  CONSTRAINT fk_rp_role FOREIGN KEY (role_name) REFERENCES erp_roles(role_name) ON DELETE CASCADE,
  CONSTRAINT fk_rp_perm FOREIGN KEY (perm_code) REFERENCES erp_permissions(perm_code) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS erp_users (
  email VARCHAR(160) NOT NULL PRIMARY KEY,
  alias_emails VARCHAR(255) NULL,
  display_name VARCHAR(120) NOT NULL,
  password_hash VARCHAR(255) NULL,
  legacy_sha256_hash VARCHAR(128) NULL,
  bcrypt_upgraded TINYINT(1) NOT NULL DEFAULT 0,
  role_name VARCHAR(64) NOT NULL,
  department VARCHAR(120) NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'Active',
  last_login_at DATETIME(3) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  CONSTRAINT fk_user_role FOREIGN KEY (role_name) REFERENCES erp_roles(role_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS erp_sessions (
  token VARCHAR(128) NOT NULL PRIMARY KEY,
  user_email VARCHAR(160) NOT NULL,
  role_name VARCHAR(64) NOT NULL,
  login_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  expires_at DATETIME(3) NOT NULL,
  revoked TINYINT(1) NOT NULL DEFAULT 0,
  INDEX idx_session_user (user_email),
  INDEX idx_session_exp (expires_at),
  CONSTRAINT fk_session_user FOREIGN KEY (user_email) REFERENCES erp_users(email) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 2. OPERATIONS SETTINGS & ITEM MASTER
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS erp_settings (
  setting_key VARCHAR(100) NOT NULL PRIMARY KEY,
  setting_value VARCHAR(500) NOT NULL,
  description VARCHAR(255) NULL,
  updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS item_master (
  item_code VARCHAR(32) NOT NULL PRIMARY KEY,
  item_name VARCHAR(200) NOT NULL,
  category VARCHAR(64) NOT NULL,
  brand VARCHAR(120) NULL DEFAULT '',
  hsn_code VARCHAR(64) NULL DEFAULT '',
  index_unit VARCHAR(40) NOT NULL,
  fraction_of_index_unit DECIMAL(18,4) NOT NULL DEFAULT 1.0000,
  conversion_qty DECIMAL(18,4) NOT NULL DEFAULT 0.0000,
  conversion_unit VARCHAR(40) NULL DEFAULT '',
  reorder_level DECIMAL(18,4) NOT NULL DEFAULT 0.0000,
  status VARCHAR(32) NOT NULL DEFAULT 'Active',
  created_date VARCHAR(32) NOT NULL,
  updated_date VARCHAR(32) NOT NULL,
  INDEX idx_item_category (category),
  INDEX idx_item_status (status),
  INDEX idx_item_name (item_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 3. OPERATIONS CENTRAL TRANSACTION LEDGER (PRODUCTION, DISPATCH, GRN, ISSUE)
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS stock_ledger (
  tx_id VARCHAR(64) NOT NULL PRIMARY KEY,
  tx_type VARCHAR(32) NOT NULL,
  tx_date DATE NOT NULL,
  item_code VARCHAR(32) NOT NULL,
  item_name VARCHAR(200) NOT NULL,
  category VARCHAR(64) NOT NULL,
  brand VARCHAR(120) NULL DEFAULT '',
  entered_qty DECIMAL(18,4) NOT NULL,
  entered_uom VARCHAR(40) NOT NULL,
  base_qty DECIMAL(18,4) NOT NULL,
  direction VARCHAR(8) NOT NULL,
  source_sheet VARCHAR(64) NOT NULL DEFAULT 'Web App',
  source_row INT NOT NULL DEFAULT 0,
  batch_no VARCHAR(100) NULL DEFAULT '',
  ref_no VARCHAR(120) NULL DEFAULT '',
  party_or_section VARCHAR(200) NULL DEFAULT '',
  secondary_qty DECIMAL(18,4) NULL,
  index_qty DECIMAL(18,4) NULL,
  invoice_no VARCHAR(100) NULL DEFAULT '',
  challan_no VARCHAR(100) NULL DEFAULT '',
  vehicle_no VARCHAR(80) NULL DEFAULT '',
  issued_to VARCHAR(120) NULL DEFAULT '',
  po_no VARCHAR(64) NULL DEFAULT '',
  unit_rate DECIMAL(18,4) NOT NULL DEFAULT 0.0000,
  currency VARCHAR(16) NOT NULL DEFAULT 'NPR',
  exchange_rate DECIMAL(18,6) NOT NULL DEFAULT 1.000000,
  total_amount DECIMAL(18,4) NOT NULL DEFAULT 0.0000,
  total_amount_npr DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  meta_json LONGTEXT NULL,
  remarks VARCHAR(500) NULL DEFAULT '',
  created_by VARCHAR(160) NOT NULL,
  created_at VARCHAR(32) NOT NULL,
  updated_by VARCHAR(160) NOT NULL,
  updated_at VARCHAR(32) NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'ACTIVE',
  sync_status VARCHAR(32) NOT NULL DEFAULT 'SYNCED',
  record_hash VARCHAR(64) NOT NULL,
  INDEX idx_ledger_date_status (tx_date, status),
  INDEX idx_ledger_item_status (item_code, status),
  INDEX idx_ledger_type_date (tx_type, tx_date),
  INDEX idx_ledger_po (po_no),
  INDEX idx_ledger_hash (record_hash),
  CONSTRAINT fk_ledger_item FOREIGN KEY (item_code) REFERENCES item_master(item_code)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS operations_audit_logs (
  audit_id VARCHAR(64) NOT NULL PRIMARY KEY,
  log_timestamp VARCHAR(32) NOT NULL,
  user_email VARCHAR(160) NOT NULL,
  user_role VARCHAR(64) NOT NULL,
  action VARCHAR(64) NOT NULL,
  module_name VARCHAR(80) NOT NULL,
  target_id VARCHAR(120) NULL,
  summary VARCHAR(500) NULL,
  before_json LONGTEXT NULL,
  after_json LONGTEXT NULL,
  INDEX idx_ops_audit_ts (log_timestamp),
  INDEX idx_ops_audit_module (module_name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS sync_errors (
  error_id VARCHAR(64) NOT NULL PRIMARY KEY,
  error_timestamp VARCHAR(32) NOT NULL,
  sheet_name VARCHAR(80) NOT NULL,
  row_number INT NOT NULL DEFAULT 0,
  item_code VARCHAR(32) NULL,
  raw_data_json LONGTEXT NULL,
  error_message VARCHAR(1000) NOT NULL,
  status VARCHAR(24) NOT NULL DEFAULT 'OPEN',
  resolved_by VARCHAR(160) NULL,
  resolved_at VARCHAR(32) NULL,
  INDEX idx_sync_err_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS daily_reports (
  report_id VARCHAR(64) NOT NULL PRIMARY KEY,
  report_date DATE NOT NULL UNIQUE,
  submitted_by VARCHAR(160) NOT NULL,
  submitted_at VARCHAR(32) NOT NULL,
  total_active_items INT NOT NULL DEFAULT 0,
  stock_in_count INT NOT NULL DEFAULT 0,
  stock_out_count INT NOT NULL DEFAULT 0,
  below_reorder_count INT NOT NULL DEFAULT 0,
  zero_balance_count INT NOT NULL DEFAULT 0,
  snapshot_json LONGTEXT NOT NULL,
  status VARCHAR(32) NOT NULL DEFAULT 'SUBMITTED'
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 4. PROCUREMENT, IMPORT, TENDER & DATE-WISE EXCHANGE RATES
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS proc_exchange_rates (
  rate_date DATE NOT NULL PRIMARY KEY,
  usd DECIMAL(18,6) NOT NULL,
  inr DECIMAL(18,6) NOT NULL,
  eur DECIMAL(18,6) NOT NULL,
  gbp DECIMAL(18,6) NOT NULL,
  cny DECIMAL(18,6) NOT NULL,
  npr DECIMAL(18,6) NOT NULL DEFAULT 1.000000,
  remarks VARCHAR(500) NULL DEFAULT '',
  updated_by VARCHAR(160) NOT NULL,
  updated_at VARCHAR(64) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS proc_suppliers (
  supplier_id VARCHAR(64) NOT NULL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  pan_no VARCHAR(64) NULL DEFAULT '',
  gst_no VARCHAR(64) NULL DEFAULT '',
  contact_person VARCHAR(120) NULL DEFAULT '',
  phone VARCHAR(64) NULL DEFAULT '',
  email VARCHAR(160) NULL DEFAULT '',
  country VARCHAR(80) NULL DEFAULT '',
  address VARCHAR(500) NULL DEFAULT '',
  payment_terms VARCHAR(120) NULL DEFAULT '',
  currency VARCHAR(16) NOT NULL DEFAULT 'NPR',
  lead_time_days INT NOT NULL DEFAULT 0,
  rating VARCHAR(32) NULL DEFAULT '',
  record_timestamp VARCHAR(64) NOT NULL,
  INDEX idx_supplier_name (name)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS proc_freight_forwarders (
  forwarder_id VARCHAR(64) NOT NULL PRIMARY KEY,
  name VARCHAR(200) NOT NULL,
  address VARCHAR(500) NULL DEFAULT '',
  contact_person VARCHAR(120) NULL DEFAULT '',
  phone VARCHAR(64) NULL DEFAULT '',
  email VARCHAR(160) NULL DEFAULT '',
  rating VARCHAR(32) NULL DEFAULT '',
  remarks VARCHAR(500) NULL DEFAULT '',
  record_timestamp VARCHAR(64) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS proc_indents (
  indent_no VARCHAR(64) NOT NULL PRIMARY KEY,
  indent_date DATE NOT NULL,
  department VARCHAR(120) NULL DEFAULT '',
  requester VARCHAR(120) NULL DEFAULT '',
  item_code VARCHAR(32) NULL DEFAULT '',
  item_name VARCHAR(200) NOT NULL,
  required_qty DECIMAL(18,4) NOT NULL DEFAULT 0.0000,
  unit VARCHAR(40) NULL DEFAULT '',
  required_delivery_date VARCHAR(32) NULL DEFAULT '',
  priority VARCHAR(32) NOT NULL DEFAULT 'Normal',
  status VARCHAR(32) NOT NULL DEFAULT 'Pending',
  approved_by VARCHAR(160) NULL DEFAULT '',
  approval_date VARCHAR(64) NULL DEFAULT '',
  remarks VARCHAR(500) NULL DEFAULT '',
  record_timestamp VARCHAR(64) NOT NULL,
  INDEX idx_indent_status (status),
  INDEX idx_indent_date (indent_date)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS proc_quotations (
  quotation_no VARCHAR(64) NOT NULL PRIMARY KEY,
  indent_no VARCHAR(64) NULL DEFAULT '',
  supplier_id VARCHAR(64) NULL DEFAULT '',
  supplier_name VARCHAR(200) NULL DEFAULT '',
  quote_date DATE NOT NULL,
  validity_date VARCHAR(32) NULL DEFAULT '',
  currency VARCHAR(16) NOT NULL DEFAULT 'NPR',
  exchange_rate DECIMAL(18,6) NOT NULL DEFAULT 1.000000,
  incoterms VARCHAR(64) NULL DEFAULT '',
  freight_charges DECIMAL(18,4) NOT NULL DEFAULT 0.0000,
  other_charges DECIMAL(18,4) NOT NULL DEFAULT 0.0000,
  subtotal DECIMAL(18,4) NOT NULL DEFAULT 0.0000,
  total_amount DECIMAL(18,4) NOT NULL DEFAULT 0.0000,
  total_amount_npr DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  status VARCHAR(40) NOT NULL DEFAULT 'Pending MD Approval',
  md_approval VARCHAR(32) NOT NULL DEFAULT 'Pending',
  md_approval_date VARCHAR(64) NULL DEFAULT '',
  md_notes VARCHAR(500) NULL DEFAULT '',
  attachment_name VARCHAR(255) NULL DEFAULT '',
  attachment_url VARCHAR(500) NULL DEFAULT '',
  items_json LONGTEXT NULL,
  record_timestamp VARCHAR(64) NOT NULL,
  INDEX idx_quote_date (quote_date),
  INDEX idx_quote_md (md_approval)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS proc_quotation_items (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  quotation_no VARCHAR(64) NOT NULL,
  line_no INT NOT NULL DEFAULT 1,
  item_code VARCHAR(32) NULL DEFAULT '',
  item_name VARCHAR(200) NOT NULL,
  qty DECIMAL(18,4) NOT NULL DEFAULT 0.0000,
  unit VARCHAR(40) NULL DEFAULT '',
  rate DECIMAL(18,4) NOT NULL DEFAULT 0.0000,
  amount DECIMAL(18,4) NOT NULL DEFAULT 0.0000,
  CONSTRAINT fk_qi_quote FOREIGN KEY (quotation_no) REFERENCES proc_quotations(quotation_no) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS proc_purchase_orders (
  po_no VARCHAR(64) NOT NULL PRIMARY KEY,
  quotation_no VARCHAR(64) NULL DEFAULT '',
  supplier_id VARCHAR(64) NULL DEFAULT '',
  supplier_name VARCHAR(200) NULL DEFAULT '',
  order_date DATE NOT NULL,
  delivery_terms VARCHAR(255) NULL DEFAULT '',
  payment_terms VARCHAR(255) NULL DEFAULT '',
  incoterms VARCHAR(64) NULL DEFAULT '',
  currency VARCHAR(16) NOT NULL DEFAULT 'NPR',
  exchange_rate DECIMAL(18,6) NOT NULL DEFAULT 1.000000,
  total_value DECIMAL(18,4) NOT NULL DEFAULT 0.0000,
  total_value_npr DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  expected_delivery_date VARCHAR(32) NULL DEFAULT '',
  status VARCHAR(40) NOT NULL DEFAULT 'Pending',
  approval_status VARCHAR(32) NOT NULL DEFAULT 'Pending',
  items_json LONGTEXT NULL,
  received_status VARCHAR(40) NOT NULL DEFAULT 'Pending Receipt',
  received_qty DECIMAL(18,4) NOT NULL DEFAULT 0.0000,
  pending_qty DECIMAL(18,4) NOT NULL DEFAULT 0.0000,
  record_timestamp VARCHAR(64) NOT NULL,
  INDEX idx_po_date (order_date),
  INDEX idx_po_approval (approval_status),
  INDEX idx_po_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS proc_purchase_order_items (
  id BIGINT AUTO_INCREMENT PRIMARY KEY,
  po_no VARCHAR(64) NOT NULL,
  line_no INT NOT NULL DEFAULT 1,
  item_code VARCHAR(32) NULL DEFAULT '',
  item_name VARCHAR(200) NOT NULL,
  qty DECIMAL(18,4) NOT NULL DEFAULT 0.0000,
  unit VARCHAR(40) NULL DEFAULT '',
  rate DECIMAL(18,4) NOT NULL DEFAULT 0.0000,
  amount DECIMAL(18,4) NOT NULL DEFAULT 0.0000,
  CONSTRAINT fk_poi_po FOREIGN KEY (po_no) REFERENCES proc_purchase_orders(po_no) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS proc_lc_tt_payments (
  payment_id VARCHAR(64) NOT NULL PRIMARY KEY,
  po_no VARCHAR(64) NULL DEFAULT '',
  supplier_name VARCHAR(200) NULL DEFAULT '',
  bank_name VARCHAR(160) NULL DEFAULT '',
  payment_type VARCHAR(32) NOT NULL DEFAULT 'LC',
  currency VARCHAR(16) NOT NULL DEFAULT 'NPR',
  amount DECIMAL(18,4) NOT NULL DEFAULT 0.0000,
  exchange_rate DECIMAL(18,6) NOT NULL DEFAULT 1.000000,
  amount_npr DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  lc_number VARCHAR(100) NULL DEFAULT '',
  lc_opening_date VARCHAR(32) NULL DEFAULT '',
  maturity_date VARCHAR(32) NULL DEFAULT '',
  status VARCHAR(32) NOT NULL DEFAULT 'Pending',
  payment_stage VARCHAR(80) NULL DEFAULT '',
  remarks VARCHAR(500) NULL DEFAULT '',
  record_timestamp VARCHAR(64) NOT NULL,
  INDEX idx_lctt_po (po_no),
  INDEX idx_lctt_status (status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS proc_shipments (
  shipment_id VARCHAR(64) NOT NULL PRIMARY KEY,
  po_no VARCHAR(64) NULL DEFAULT '',
  supplier_name VARCHAR(200) NULL DEFAULT '',
  forwarder_id VARCHAR(64) NULL DEFAULT '',
  forwarder_name VARCHAR(200) NULL DEFAULT '',
  shipping_line VARCHAR(160) NULL DEFAULT '',
  origin_type VARCHAR(64) NULL DEFAULT '',
  origin_country VARCHAR(80) NULL DEFAULT '',
  pol VARCHAR(120) NULL DEFAULT '',
  pod VARCHAR(120) NULL DEFAULT '',
  container_no VARCHAR(100) NULL DEFAULT '',
  bl_awb_no VARCHAR(120) NULL DEFAULT '',
  etd VARCHAR(32) NULL DEFAULT '',
  eta VARCHAR(32) NULL DEFAULT '',
  actual_departure VARCHAR(32) NULL DEFAULT '',
  actual_arrival VARCHAR(32) NULL DEFAULT '',
  customs_status VARCHAR(64) NULL DEFAULT '',
  freight_amount_npr DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  shipment_status VARCHAR(64) NULL DEFAULT '',
  remarks VARCHAR(500) NULL DEFAULT '',
  record_timestamp VARCHAR(64) NOT NULL,
  INDEX idx_ship_po (po_no),
  INDEX idx_ship_status (shipment_status)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS proc_tenders (
  tender_no VARCHAR(64) NOT NULL PRIMARY KEY,
  tender_name VARCHAR(255) NOT NULL,
  address VARCHAR(255) NULL DEFAULT '',
  contact_info VARCHAR(200) NULL DEFAULT '',
  publication_date VARCHAR(32) NULL DEFAULT '',
  submission_deadline VARCHAR(32) NULL DEFAULT '',
  item_name VARCHAR(200) NULL DEFAULT '',
  quantity DECIMAL(18,4) NOT NULL DEFAULT 0.0000,
  unit VARCHAR(40) NULL DEFAULT '',
  estimated_rate DECIMAL(18,4) NOT NULL DEFAULT 0.0000,
  bid_security_amount DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  bid_security_status VARCHAR(40) NULL DEFAULT '',
  result VARCHAR(32) NOT NULL DEFAULT 'Pending',
  remarks VARCHAR(500) NULL DEFAULT '',
  record_timestamp VARCHAR(64) NOT NULL,
  INDEX idx_tender_result (result)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS proc_tender_tracking (
  tracking_id VARCHAR(64) NOT NULL PRIMARY KEY,
  tender_no VARCHAR(64) NULL DEFAULT '',
  tender_name VARCHAR(255) NULL DEFAULT '',
  address VARCHAR(255) NULL DEFAULT '',
  contact_info VARCHAR(200) NULL DEFAULT '',
  last_submission_date VARCHAR(32) NULL DEFAULT '',
  item_name VARCHAR(200) NULL DEFAULT '',
  unit VARCHAR(40) NULL DEFAULT '',
  quantity DECIMAL(18,4) NOT NULL DEFAULT 0.0000,
  rate_inc_vat DECIMAL(18,4) NOT NULL DEFAULT 0.0000,
  amount DECIMAL(18,2) NOT NULL DEFAULT 0.00,
  muchulka_status VARCHAR(32) NOT NULL DEFAULT 'Pending',
  muchulka_date VARCHAR(32) NULL DEFAULT '',
  loi_status VARCHAR(32) NOT NULL DEFAULT 'Pending',
  loi_date VARCHAR(32) NULL DEFAULT '',
  loa_status VARCHAR(32) NOT NULL DEFAULT 'Pending',
  loa_date VARCHAR(32) NULL DEFAULT '',
  pg_status VARCHAR(32) NOT NULL DEFAULT 'Pending',
  pg_date VARCHAR(32) NULL DEFAULT '',
  sample_status VARCHAR(32) NOT NULL DEFAULT 'Pending',
  sample_date VARCHAR(32) NULL DEFAULT '',
  production_status VARCHAR(40) NOT NULL DEFAULT 'Not Started',
  dispatch_status VARCHAR(40) NOT NULL DEFAULT 'Not Dispatched',
  dispatch_date VARCHAR(32) NULL DEFAULT '',
  remarks VARCHAR(500) NULL DEFAULT '',
  record_timestamp VARCHAR(64) NOT NULL,
  INDEX idx_track_tender (tender_no)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS proc_audit_logs (
  log_id VARCHAR(64) NOT NULL PRIMARY KEY,
  log_timestamp VARCHAR(64) NOT NULL,
  user_email VARCHAR(160) NOT NULL,
  action VARCHAR(64) NOT NULL,
  module_name VARCHAR(80) NOT NULL,
  record_id VARCHAR(120) NULL DEFAULT '',
  details LONGTEXT NULL,
  INDEX idx_proc_audit_ts (log_timestamp)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS proc_settings (
  setting_key VARCHAR(100) NOT NULL PRIMARY KEY,
  setting_value VARCHAR(500) NOT NULL,
  description VARCHAR(255) NULL DEFAULT '',
  updated_at VARCHAR(64) NOT NULL
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

-- ----------------------------------------------------------------------------
-- 5. GOOGLE SHEETS SYNC & AUTOMATED BACKUP LOGS
-- ----------------------------------------------------------------------------
CREATE TABLE IF NOT EXISTS sheets_sync_logs (
  sync_id VARCHAR(64) NOT NULL PRIMARY KEY,
  direction VARCHAR(16) NOT NULL,
  spreadsheet_scope VARCHAR(32) NOT NULL,
  sheet_name VARCHAR(80) NOT NULL,
  actor_email VARCHAR(160) NOT NULL,
  rows_processed INT NOT NULL DEFAULT 0,
  rows_created INT NOT NULL DEFAULT 0,
  rows_updated INT NOT NULL DEFAULT 0,
  rows_skipped INT NOT NULL DEFAULT 0,
  rows_failed INT NOT NULL DEFAULT 0,
  status VARCHAR(24) NOT NULL,
  summary VARCHAR(1000) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_sheets_sync_ts (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS backup_history (
  backup_id VARCHAR(64) NOT NULL PRIMARY KEY,
  backup_type VARCHAR(24) NOT NULL,
  file_name VARCHAR(255) NOT NULL,
  file_path VARCHAR(500) NOT NULL,
  file_size_bytes BIGINT NOT NULL DEFAULT 0,
  sha256_checksum VARCHAR(128) NULL,
  verified TINYINT(1) NOT NULL DEFAULT 0,
  status VARCHAR(24) NOT NULL,
  triggered_by VARCHAR(160) NOT NULL,
  error_message VARCHAR(1000) NULL,
  created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  INDEX idx_backup_ts (created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;
