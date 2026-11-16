-- ============================================================================
-- DIPEN_ERP Post-Migration Data Reconciliation Queries
-- Compare row counts and stock balances against Google Sheets snapshots
-- ============================================================================

SELECT 'Item Master' AS module_name, COUNT(*) AS mysql_count FROM item_master
UNION ALL
SELECT 'Production', COUNT(*) FROM stock_ledger WHERE tx_type = 'PRODUCTION'
UNION ALL
SELECT 'Dispatch', COUNT(*) FROM stock_ledger WHERE tx_type = 'DISPATCH'
UNION ALL
SELECT 'Goods Receipt', COUNT(*) FROM stock_ledger WHERE tx_type = 'GOODS_RECEIPT'
UNION ALL
SELECT 'Issue', COUNT(*) FROM stock_ledger WHERE tx_type = 'ISSUE'
UNION ALL
SELECT 'Active Ledger Total', COUNT(*) FROM stock_ledger WHERE status = 'ACTIVE'
UNION ALL
SELECT 'Suppliers', COUNT(*) FROM proc_suppliers
UNION ALL
SELECT 'Freight Forwarders', COUNT(*) FROM proc_freight_forwarders
UNION ALL
SELECT 'Purchase Indents', COUNT(*) FROM proc_indents
UNION ALL
SELECT 'Quotations', COUNT(*) FROM proc_quotations
UNION ALL
SELECT 'Purchase Orders', COUNT(*) FROM proc_purchase_orders
UNION ALL
SELECT 'Import LC/TT Payments', COUNT(*) FROM proc_lc_tt_payments
UNION ALL
SELECT 'Shipments', COUNT(*) FROM proc_shipments
UNION ALL
SELECT 'Tenders', COUNT(*) FROM proc_tenders
UNION ALL
SELECT 'Tender Tracking', COUNT(*) FROM proc_tender_tracking
UNION ALL
SELECT 'Exchange Rates', COUNT(*) FROM proc_exchange_rates;

-- Closing stock verification across all items
SELECT
  i.item_code,
  i.item_name,
  i.category,
  i.index_unit,
  COALESCE(SUM(CASE WHEN l.status = 'ACTIVE' AND l.direction = 'IN' THEN l.base_qty ELSE 0 END), 0) AS total_in,
  COALESCE(SUM(CASE WHEN l.status = 'ACTIVE' AND l.direction = 'OUT' THEN l.base_qty ELSE 0 END), 0) AS total_out,
  COALESCE(SUM(CASE WHEN l.status = 'ACTIVE' THEN (CASE WHEN l.direction = 'IN' THEN l.base_qty ELSE -l.base_qty END) ELSE 0 END), 0) AS closing_stock
FROM item_master i
LEFT JOIN stock_ledger l ON i.item_code = l.item_code
GROUP BY i.item_code, i.item_name, i.category, i.index_unit
ORDER BY i.category, i.item_code;
