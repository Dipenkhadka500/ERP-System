/**
 * ============================================================================
 * BIRAT HEALTHCARE INDUSTRIES PVT. LTD.
 * OPERATIONS & INVENTORY MANAGEMENT ERP — GOOGLE APPS SCRIPT BACKEND (V8)
 * ============================================================================
 * File: Code.js
 * Architecture:
 *   - Central Database: Connected Google Spreadsheet (9 Business Worksheets
 *     + Hidden System Worksheets for Transaction Ledger, Audit, Sync & Reports)
 *   - Single Source of Truth: Item Master & _SYS_Transaction_Ledger
 *   - Concurrency & Integrity: LockService + Idempotent Source Hashing
 *   - Performance: Batch getValues()/setValues() + CacheService + Version Polling
 * ============================================================================
 */

/* ==========================================================================
   1. CONFIGURATION & CONSTANTS
   ========================================================================== */

var CONFIG = {
  // Primary Operations & Inventory Google Spreadsheet ID
  SPREADSHEET_ID: '1gGmpt4gKEE4Nu42960A8cmdrXaTpT-IKHW5oTAWGAJs',
  OPERATIONS_SPREADSHEET_ID: '1gGmpt4gKEE4Nu42960A8cmdrXaTpT-IKHW5oTAWGAJs',

  // Dedicated Procurement & Tender Google Spreadsheet ID
  PROCUREMENT_SPREADSHEET_ID: '16SN_MJjvmWqt_OH8Hol3AVGB6hWFTM_rYOG1FTi2-yY',

  APP_NAME: 'Birat Healthcare Operations ERP',
  COMPANY_NAME: 'Birat Healthcare Industries Pvt. Ltd.',
  TIMEZONE: 'Asia/Kathmandu',
  DATE_FORMAT: 'yyyy-MM-dd',
  DATETIME_FORMAT: 'yyyy-MM-dd HH:mm:ss',
  CACHE_TTL_SECONDS: 300,
  LOCK_TIMEOUT_MS: 25000,
  DEFAULT_POLL_INTERVAL_SEC: 30,

  // Exact nine business worksheet names (preserving 'Goods Reciept' spelling)
  SHEETS: {
    ITEM_MASTER: 'Item Master',
    PRODUCTION: 'Production',
    DISPATCH: 'Dispatch',
    GOODS_RECEIPT: 'Goods Reciept',
    ISSUE: 'Issue',
    FINISHED_GOODS: 'Finished Goods',
    RAW_MATERIAL: 'Raw Material',
    PACKING_MATERIAL: 'Packing Material',
    ALL_STOCK_BALANCE: 'All Stock Balance',

    // Hidden system sheets
    LEDGER: '_SYS_Transaction_Ledger',
    AUDIT_LOG: '_SYS_Audit_Log',
    SYNC_ERRORS: '_SYS_Sync_Errors',
    DAILY_REPORTS: '_SYS_Daily_Reports',
    USERS: '_SYS_Users_RBAC',
    SETTINGS: '_SYS_Settings'
  },

  PROCUREMENT_SHEETS: {
    INDENTS: 'Indents',
    SUPPLIERS: 'Suppliers',
    FREIGHT_FORWARDER: 'FreightForwarder',
    QUOTATIONS: 'Quotations',
    PURCHASE_ORDERS: 'PurchaseOrders',
    LCTT_PAYMENTS: 'LCTTPayments',
    SHIPMENTS: 'Shipments',
    TENDERS: 'Tenders',
    TENDER_TRACKING: 'TenderTracking',
    EXCHANGE_RATES: 'ExchangeRates',
    AUDIT_LOG: 'AuditLog',
    SETTINGS: 'Settings'
  },

  DEFAULT_EXCHANGE_RATES: {
    USD: 135.50,
    INR: 1.6015,
    EUR: 146.20,
    NPR: 1.00,
    GBP: 172.80,
    CNY: 18.60
  },

  // Six fixed item categories and automatic item code starting sequences
  FIXED_CATEGORIES: [
    'Raw Material',
    'Packing Material',
    'Finished Goods',
    'WIP',
    'Stores & Spares',
    'Others'
  ],

  CATEGORY_CODE_PREFIXES: {
    'WIP': 2001,
    'Finished Goods': 3001,
    'Raw Material': 4001,
    'Packing Material': 5001,
    'Stores & Spares': 6001,
    'Others': 7001
  },

  // Configurable category routing rules per working sheet
  ROUTING_RULES: {
    PRODUCTION_ALLOWED: ['Finished Goods', 'WIP', 'Packing Material'],
    PRODUCTION_STRICT_FG_ONLY: false, // If true, flags WIP/Packing Material as invalid classification
    GOODS_RECEIPT_ALLOWED: [
      'Raw Material',
      'Packing Material',
      'Finished Goods',
      'WIP',
      'Stores & Spares',
      'Others'
    ],
    DISPATCH_ALLOWED: ['Finished Goods'],
    ISSUE_ALLOWED: [
      'Raw Material',
      'Packing Material',
      'WIP',
      'Stores & Spares',
      'Others',
      'Finished Goods' // Requires explicit authorization flag
    ]
  },

  // Role-Based Access Control (RBAC) Matrix
  ROLES: {
    'Super Admin': [
      'ITEM_MANAGE', 'PRODUCTION_WRITE', 'RECEIPT_WRITE', 'DISPATCH_WRITE',
      'ISSUE_WRITE', 'ISSUE_FG', 'STOCK_VIEW', 'REPORT_GENERATE',
      'REPORT_SUBMIT', 'STOCK_ADJUST', 'TX_EDIT', 'TX_CANCEL',
      'NEGATIVE_OVERRIDE', 'SYNC_ADMIN', 'AUDIT_VIEW', 'USER_MANAGE',
      'PROCUREMENT_VIEW', 'PROCUREMENT_WRITE', 'PROCUREMENT_APPROVE', 'TENDER_WRITE'
    ],
    'Operations Manager': [
      'ITEM_MANAGE', 'PRODUCTION_WRITE', 'RECEIPT_WRITE', 'DISPATCH_WRITE',
      'ISSUE_WRITE', 'ISSUE_FG', 'STOCK_VIEW', 'REPORT_GENERATE',
      'REPORT_SUBMIT', 'STOCK_ADJUST', 'TX_EDIT', 'TX_CANCEL',
      'NEGATIVE_OVERRIDE', 'SYNC_ADMIN', 'AUDIT_VIEW',
      'PROCUREMENT_VIEW', 'PROCUREMENT_WRITE', 'PROCUREMENT_APPROVE', 'TENDER_WRITE'
    ],
    'Procurement Officer': [
      'PROCUREMENT_VIEW', 'PROCUREMENT_WRITE', 'PROCUREMENT_APPROVE',
      'TENDER_WRITE', 'STOCK_VIEW', 'REPORT_GENERATE'
    ],
    'Store Officer': [
      'RECEIPT_WRITE', 'ISSUE_WRITE', 'STOCK_VIEW', 'REPORT_GENERATE', 'TX_EDIT'
    ],
    'Production Officer': [
      'PRODUCTION_WRITE', 'ISSUE_WRITE', 'STOCK_VIEW', 'REPORT_GENERATE', 'TX_EDIT'
    ],
    'Dispatch Officer': [
      'DISPATCH_WRITE', 'STOCK_VIEW', 'REPORT_GENERATE', 'TX_EDIT'
    ],
    'Viewer': [
      'STOCK_VIEW', 'REPORT_GENERATE'
    ]
  },

  // Authorized ERP Login Accounts (SHA-256 password digests)
  AUTH_ACCOUNTS: [
    {
      email: 'dipen.khadka@birathralthcare.com',
      aliases: ['dipen.khadka@birathealthcare.com'],
      passwordHash: '984247d845211ce479179cec1735ba6a109a8906f78182f19022a69b5a1a6cc1',
      displayName: 'Dipen Khadka',
      role: 'Super Admin',
      department: 'Executive & System Administration'
    },
    {
      email: 'sajal.khadka@birathealthcare.com',
      aliases: [],
      passwordHash: 'dbea622c66ab15f9d4f11f2328463c4a33cd73345e5c846b5624982424e89d58',
      displayName: 'Sajal Khadka',
      role: 'Operations Manager',
      department: 'Operations & Procurement'
    },
    {
      email: 'dispatch@birathealthcare.com',
      aliases: [],
      passwordHash: '7b9e650e5268e6be9584f5d2e903a01f7a6b52469eebffc4c9535aa6e6afef31',
      displayName: 'Dispatch Officer',
      role: 'Dispatch Officer',
      department: 'Dispatch & Logistics'
    },
    {
      email: 'production@birathealthcare.com',
      aliases: [],
      passwordHash: '5bd6f03abc5ff01cafcd5d5034fb530bc916cd102022d8e081608ead0814791b',
      displayName: 'Production Officer',
      role: 'Production Officer',
      department: 'Manufacturing & Production'
    }
  ],
  SESSION_TTL_SECONDS: 21600
};

/* ==========================================================================
   2. SHEET SCHEMAS & HEADER DEFINITIONS
   ========================================================================== */

var SCHEMAS = {
  ITEM_MASTER: [
    'Item Code',
    'Item Name',
    'Categories',
    'Brand Categories',
    'HSN Code',
    'Index Unit',
    'Fraction of Index Unit',
    'Conversion Quantity',
    'Conversion Unit',
    'Reorder Level',
    'Status',
    'Created Date',
    'Updated Date'
  ],
  PRODUCTION: [
    'Production ID',
    'Production Date',
    'Item Category',
    'Item Code',
    'Item Name',
    'Brand',
    'Quantity',
    'UOM',
    'Converted Base Qty',
    'Index Unit',
    'Secondary Display',
    'Batch/Lot Number',
    'Production Reference',
    'Remarks',
    'Created By',
    'Created At',
    'Status',
    'Sync Status'
  ],
  DISPATCH: [
    'Dispatch ID',
    'Dispatch Date',
    'Item Category',
    'Item Code',
    'Item Name',
    'Brand',
    'Secondary Qty (CTN)',
    'Index Qty (Pkt)',
    'Dispatch Quantity',
    'UOM',
    'Converted Base Qty',
    'Index Unit',
    'Secondary Display',
    'Customer/Party Name',
    'Challan Number',
    'Invoice Number',
    'Vehicle Number',
    'Remarks',
    'Created By',
    'Created At',
    'Status',
    'Sync Status'
  ],
  GOODS_RECEIPT: [
    'Receipt ID',
    'Receipt Date',
    'Item Category',
    'Item Code',
    'Item Name',
    'Brand',
    'Received Quantity',
    'UOM',
    'Converted Base Qty',
    'Index Unit',
    'Secondary Display',
    'Supplier Name',
    'Invoice Number',
    'Purchase Reference',
    'Batch/Lot Number',
    'Remarks',
    'Created By',
    'Created At',
    'Status',
    'Sync Status'
  ],
  ISSUE: [
    'Issue ID',
    'Issue Date',
    'Item Category',
    'Item Code',
    'Item Name',
    'Brand',
    'Issue Quantity',
    'UOM',
    'Converted Base Qty',
    'Index Unit',
    'Secondary Display',
    'Department/Production Section',
    'Issue Reference',
    'Issued To',
    'Remarks',
    'Created By',
    'Created At',
    'Status',
    'Sync Status'
  ],
  FINISHED_GOODS: [
    'Item Name',
    'Item Code',
    'Brand',
    'Opening Stock',
    'Production',
    'Dispatch',
    'Closing Stock',
    'Index Unit',
    'Secondary Unit Balance'
  ],
  RAW_MATERIAL: [
    'Item Name',
    'Item Code',
    'Brand',
    'Opening Stock',
    'Receipt',
    'Issue',
    'Closing Stock',
    'Index Unit'
  ],
  PACKING_MATERIAL: [
    'Item Name',
    'Item Code',
    'Brand',
    'Opening Stock',
    'Receipt',
    'Issue',
    'Closing Stock',
    'Index Unit',
    'Secondary Unit Balance'
  ],
  ALL_STOCK_BALANCE: [
    'Section',
    'Item Name',
    'Item Code',
    'Brand',
    'Category',
    'Index Unit',
    'Opening Stock',
    'Total Stock In',
    'Total Stock Out',
    'Closing Stock',
    'Secondary Unit Balance',
    'Reorder Level',
    'Stock Status'
  ],
  LEDGER: [
    'Transaction ID',
    'Transaction Type',
    'Transaction Date',
    'Item Code',
    'Item Name',
    'Category',
    'Brand',
    'Entered Quantity',
    'Entered UOM',
    'Converted Base Quantity',
    'Stock Direction',
    'Source Sheet',
    'Source Row',
    'Batch Number',
    'Reference Number',
    'Party / Section',
    'Meta JSON',
    'Remarks',
    'Created By',
    'Created At',
    'Updated By',
    'Updated At',
    'Transaction Status',
    'Record Hash'
  ],
  AUDIT_LOG: [
    'Audit ID',
    'Timestamp',
    'User',
    'Role',
    'Action',
    'Module',
    'Target ID',
    'Summary',
    'Before JSON',
    'After JSON'
  ],
  SYNC_ERRORS: [
    'Error ID',
    'Timestamp',
    'Sheet Name',
    'Row Number',
    'Item Code',
    'Raw Data JSON',
    'Error Message',
    'Status',
    'Resolved By',
    'Resolved At'
  ],
  DAILY_REPORTS: [
    'Report ID',
    'Report Date',
    'Submitted By',
    'Submitted At',
    'Total Active Items',
    'Stock In Count',
    'Stock Out Count',
    'Below Reorder Count',
    'Zero Balance Count',
    'Snapshot JSON',
    'Status'
  ],
  USERS: [
    'User Email / Key',
    'Display Name',
    'Role',
    'Status',
    'Updated At'
  ],
  SETTINGS: [
    'Setting Key',
    'Setting Value',
    'Description',
    'Updated At'
  ]
};

var PROCUREMENT_SCHEMAS = {
  Indents: [
    'IndentNo', 'Date', 'Department', 'Requester', 'ItemCode', 'ItemName',
    'RequiredQty', 'Unit', 'RequiredDeliveryDate', 'Priority', 'Status',
    'ApprovedBy', 'ApprovalDate', 'Remarks', 'Timestamp'
  ],
  Suppliers: [
    'SupplierId', 'Name', 'PanNo', 'GstNo', 'ContactPerson', 'Phone',
    'Email', 'Country', 'Address', 'PaymentTerms', 'Currency',
    'LeadTimeDays', 'Rating', 'Timestamp'
  ],
  FreightForwarder: [
    'ForwarderId', 'Name', 'Address', 'ContactPerson', 'Phone',
    'Email', 'Rating', 'Remarks', 'Timestamp'
  ],
  Quotations: [
    'QuotationNo', 'IndentNo', 'SupplierId', 'SupplierName', 'Date',
    'ValidityDate', 'Currency', 'ExchangeRate', 'Incoterms',
    'FreightCharges', 'OtherCharges', 'Subtotal', 'TotalAmount',
    'TotalAmountNPR', 'Status', 'MDApproval', 'MDApprovalDate',
    'MDNotes', 'AttachmentName', 'AttachmentUrl', 'ItemsJSON', 'Timestamp'
  ],
  PurchaseOrders: [
    'PONo', 'QuotationNo', 'SupplierId', 'SupplierName', 'OrderDate',
    'DeliveryTerms', 'PaymentTerms', 'Incoterms', 'Currency',
    'ExchangeRate', 'TotalValue', 'TotalValueNPR', 'ExpectedDeliveryDate',
    'Status', 'ApprovalStatus', 'ItemsJSON', 'ReceivedStatus',
    'ReceivedQty', 'PendingQty', 'Timestamp'
  ],
  LCTTPayments: [
    'PaymentId', 'PONo', 'SupplierName', 'BankName', 'PaymentType',
    'Currency', 'Amount', 'ExchangeRate', 'AmountNPR', 'LCNumber',
    'LCOpeningDate', 'MaturityDate', 'Status', 'PaymentStage',
    'Remarks', 'Timestamp'
  ],
  Shipments: [
    'ShipmentId', 'PONo', 'SupplierName', 'ForwarderId', 'ForwarderName',
    'ShippingLine', 'OriginType', 'OriginCountry', 'POL', 'POD',
    'ContainerNo', 'BLAWBNo', 'ETD', 'ETA', 'ActualDeparture',
    'ActualArrival', 'CustomsStatus', 'FreightAmountNPR', 'ShipmentStatus',
    'Remarks', 'Timestamp'
  ],
  Tenders: [
    'TenderNo', 'TenderName', 'Address', 'ContactInfo', 'PublicationDate',
    'SubmissionDeadline', 'ItemName', 'Quantity', 'Unit', 'EstimatedRate',
    'BidSecurityAmount', 'BidSecurityStatus', 'Result', 'Remarks', 'Timestamp'
  ],
  TenderTracking: [
    'TrackingId', 'TenderNo', 'TenderName', 'Address', 'ContactInfo',
    'LastSubmissionDate', 'ItemName', 'Unit', 'Quantity', 'RateIncVat',
    'Amount', 'MuchulkaStatus', 'MuchulkaDate', 'LOIStatus', 'LOIDate',
    'LOAStatus', 'LOADate', 'PGStatus', 'PGDate', 'SampleStatus',
    'SampleDate', 'ProductionStatus', 'DispatchStatus', 'DispatchDate',
    'Remarks', 'Timestamp'
  ],
  ExchangeRates: [
    'RateDate', 'USD', 'INR', 'EUR', 'GBP', 'CNY', 'NPR', 'Remarks', 'UpdatedBy', 'UpdatedAt'
  ],
  AuditLog: [
    'LogId', 'Timestamp', 'UserEmail', 'Action', 'Module', 'RecordId', 'Details'
  ],
  Settings: [
    'Key', 'Value', 'Description', 'UpdatedAt'
  ]
};

/* ==========================================================================
   3. CORE HELPERS, RESPONSE ENVELOPE, DATES, HASHING & VERSIONING
   ========================================================================== */

/**
 * Standard API response format required by Section 22.
 */
function buildResponse_(success, message, data) {
  return {
    success: Boolean(success),
    message: String(message || ''),
    data: data !== undefined ? data : {},
    timestamp: new Date().toISOString(),
    version: getDataVersion_()
  };
}

function nowIso_() {
  return Utilities.formatDate(new Date(), CONFIG.TIMEZONE, CONFIG.DATETIME_FORMAT);
}

function todayDateStr_() {
  return Utilities.formatDate(new Date(), CONFIG.TIMEZONE, CONFIG.DATE_FORMAT);
}

function normalizeDateStr_(val) {
  if (!val) return '';
  if (val instanceof Date && !isNaN(val.getTime())) {
    return Utilities.formatDate(val, CONFIG.TIMEZONE, CONFIG.DATE_FORMAT);
  }
  var s = String(val).trim();
  if (/^\d{4}-\d{2}-\d{2}$/.test(s)) return s;
  var parsed = new Date(s);
  if (!isNaN(parsed.getTime())) {
    return Utilities.formatDate(parsed, CONFIG.TIMEZONE, CONFIG.DATE_FORMAT);
  }
  return '';
}

function roundQty_(num) {
  var n = Number(num);
  if (isNaN(n)) return 0;
  return Math.round((n + Number.EPSILON) * 10000) / 10000;
}

function computeHash_(parts) {
  var raw = parts.map(function (p) { return String(p === null || p === undefined ? '' : p); }).join('|');
  var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.MD5, raw);
  return digest.map(function (b) {
    var v = (b < 0 ? b + 256 : b).toString(16);
    return v.length === 1 ? '0' + v : v;
  }).join('');
}

function sha256Hex_(raw) {
  var digest = Utilities.computeDigest(Utilities.DigestAlgorithm.SHA_256, String(raw || ''), Utilities.Charset.UTF_8);
  return digest.map(function (b) {
    var v = (b < 0 ? b + 256 : b).toString(16);
    return v.length === 1 ? '0' + v : v;
  }).join('');
}

function getDataVersion_() {
  try {
    var cache = CacheService.getScriptCache();
    var cached = cache.get('ERP_DATA_VERSION');
    if (cached) return Number(cached);
    var prop = PropertiesService.getScriptProperties().getProperty('ERP_DATA_VERSION');
    var ver = prop ? Number(prop) : 1;
    cache.put('ERP_DATA_VERSION', String(ver), 3600);
    return ver;
  } catch (err) {
    return 1;
  }
}

function bumpDataVersion_() {
  var next = getDataVersion_() + 1;
  PropertiesService.getScriptProperties().setProperty('ERP_DATA_VERSION', String(next));
  PropertiesService.getScriptProperties().setProperty('ERP_LAST_SYNC_AT', nowIso_());
  try {
    var cache = CacheService.getScriptCache();
    cache.put('ERP_DATA_VERSION', String(next), 3600);
  } catch (e) {}
  return next;
}

function invalidateCaches_() {
  try {
    var cache = CacheService.getScriptCache();
    cache.removeAll(['ERP_ITEMS_ALL', 'ERP_LEDGER_SUMMARY', 'ERP_SETTINGS_MAP']);
  } catch (e) {}
}

/**
 * Resolves the connected Google Spreadsheet safely.
 */
function getSpreadsheet() {
  var propId = '';
  try {
    propId = PropertiesService.getScriptProperties().getProperty('SPREADSHEET_ID') || '';
  } catch (e) {}

  var targetId = propId || CONFIG.OPERATIONS_SPREADSHEET_ID || CONFIG.SPREADSHEET_ID;
  if (targetId && targetId.trim() !== '') {
    return SpreadsheetApp.openById(targetId.trim());
  }
  var active = SpreadsheetApp.getActiveSpreadsheet();
  if (!active) {
    throw new Error('No connected Operations Google Spreadsheet found. Set CONFIG.OPERATIONS_SPREADSHEET_ID.');
  }
  return active;
}

/**
 * Resolves the dedicated Procurement & Tender Google Spreadsheet.
 */
function getProcurementSpreadsheet() {
  var propId = '';
  try {
    propId = PropertiesService.getScriptProperties().getProperty('PROCUREMENT_SPREADSHEET_ID') || '';
  } catch (e) {}

  var targetId = propId || CONFIG.PROCUREMENT_SPREADSHEET_ID;
  if (targetId && targetId.trim() !== '') {
    try {
      return SpreadsheetApp.openById(targetId.trim());
    } catch (err) {
      throw new Error('Unable to access Procurement & Tender spreadsheet (' + targetId + '): ' + err.message);
    }
  }
  throw new Error('Procurement & Tender Spreadsheet ID is not configured.');
}

/**
 * Sets or updates Operations Spreadsheet ID without modifying code.
 */
function configureSpreadsheetId_(spreadsheetId) {
  if (!spreadsheetId) throw new Error('Spreadsheet ID is required.');
  var ss = SpreadsheetApp.openById(String(spreadsheetId).trim());
  PropertiesService.getScriptProperties().setProperty('SPREADSHEET_ID', ss.getId());
  invalidateCaches_();
  return ss;
}

/**
 * Sets or updates Procurement & Tender Spreadsheet ID without modifying code.
 */
function configureProcurementSpreadsheetId_(spreadsheetId) {
  if (!spreadsheetId) throw new Error('Procurement Spreadsheet ID is required.');
  var ss = SpreadsheetApp.openById(String(spreadsheetId).trim());
  PropertiesService.getScriptProperties().setProperty('PROCUREMENT_SPREADSHEET_ID', ss.getId());
  return ss;
}

/* ==========================================================================
   4. USER IDENTITY & ROLE-BASED ACCESS CONTROL (RBAC)
   ========================================================================== */

function findAuthAccount_(userId) {
  var normalized = String(userId || '').trim().toLowerCase();
  if (!normalized) return null;
  var accounts = CONFIG.AUTH_ACCOUNTS || [];
  for (var i = 0; i < accounts.length; i++) {
    var acc = accounts[i];
    if (String(acc.email).toLowerCase() === normalized) return acc;
    if (acc.aliases && acc.aliases.length) {
      for (var j = 0; j < acc.aliases.length; j++) {
        if (String(acc.aliases[j]).toLowerCase() === normalized) return acc;
      }
    }
  }
  return null;
}

function getSessionByToken_(token) {
  var t = String(token || '').trim();
  if (!t) return null;
  var key = 'ERP_SESSION_' + t;
  var raw = '';
  try { raw = CacheService.getScriptCache().get(key) || ''; } catch (e) {}
  if (!raw) {
    try { raw = PropertiesService.getScriptProperties().getProperty(key) || ''; } catch (e2) {}
  }
  if (!raw) return null;
  try {
    var session = JSON.parse(raw);
    if (!session || !session.email) return null;
    if (session.expiresAt && new Date(session.expiresAt).getTime() < Date.now()) {
      try { CacheService.getScriptCache().remove(key); } catch (e3) {}
      try { PropertiesService.getScriptProperties().deleteProperty(key); } catch (e4) {}
      return null;
    }
    return session;
  } catch (err) {
    return null;
  }
}

function setActiveSessionPointer_(token) {
  try { CacheService.getUserCache().put('ERP_ACTIVE_USER_TOKEN', String(token || ''), CONFIG.SESSION_TTL_SECONDS); } catch (e) {}
  try { CacheService.getUserCache().remove('ERP_LOGGED_OUT'); } catch (e2) {}
  try {
    var up = PropertiesService.getUserProperties();
    up.setProperty('ERP_ACTIVE_USER_TOKEN', String(token || ''));
    up.deleteProperty('ERP_LOGGED_OUT');
  } catch (e3) {}
}

function clearActiveSessionPointer_(token) {
  if (token) {
    var key = 'ERP_SESSION_' + String(token).trim();
    try { CacheService.getScriptCache().remove(key); } catch (e) {}
    try { PropertiesService.getScriptProperties().deleteProperty(key); } catch (e2) {}
  }
  try { CacheService.getUserCache().remove('ERP_ACTIVE_USER_TOKEN'); } catch (e3) {}
  try { CacheService.getUserCache().put('ERP_LOGGED_OUT', 'TRUE', CONFIG.SESSION_TTL_SECONDS); } catch (e4) {}
  try {
    var up = PropertiesService.getUserProperties();
    up.deleteProperty('ERP_ACTIVE_USER_TOKEN');
    up.setProperty('ERP_LOGGED_OUT', 'TRUE');
  } catch (e5) {}
}

function getActiveSessionFromUserCache_() {
  var token = '';
  try { token = CacheService.getUserCache().get('ERP_ACTIVE_USER_TOKEN') || ''; } catch (e) {}
  if (!token) {
    try { token = PropertiesService.getUserProperties().getProperty('ERP_ACTIVE_USER_TOKEN') || ''; } catch (e2) {}
  }
  if (!token) return null;
  return getSessionByToken_(token);
}

function isExplicitlyLoggedOut_() {
  try {
    if (CacheService.getUserCache().get('ERP_LOGGED_OUT') === 'TRUE') return true;
  } catch (e) {}
  try {
    if (PropertiesService.getUserProperties().getProperty('ERP_LOGGED_OUT') === 'TRUE') return true;
  } catch (e2) {}
  return false;
}

/**
 * Authenticates ERP credentials and creates a persistent session token.
 */
function loginUser(userId, password) {
  try {
    var cleanId = String(userId || '').trim().toLowerCase();
    var cleanPass = String(password || '');
    if (!cleanId || !cleanPass) {
      throw new Error('Please enter both User ID and Password.');
    }

    var account = findAuthAccount_(cleanId);
    if (!account || sha256Hex_(cleanPass) !== account.passwordHash) {
      throw new Error('Invalid User ID or password. Please verify your credentials.');
    }

    var usersMap = getUsersMap_();
    var sheetRec = usersMap[account.email];
    if (sheetRec && String(sheetRec.status).toLowerCase() !== 'active') {
      throw new Error('This account is currently inactive. Contact the System Administrator.');
    }

    var effectiveRole = (sheetRec && CONFIG.ROLES[sheetRec.role]) ? sheetRec.role : account.role;
    var effectiveName = (sheetRec && sheetRec.displayName) ? sheetRec.displayName : account.displayName;
    var token = Utilities.getUuid() + '-' + new Date().getTime();
    var sessionObj = {
      token: token,
      email: account.email,
      displayName: effectiveName,
      role: effectiveRole,
      department: account.department || '',
      loginAt: nowIso_(),
      expiresAt: new Date(Date.now() + (CONFIG.SESSION_TTL_SECONDS * 1000)).toISOString()
    };

    var key = 'ERP_SESSION_' + token;
    var json = JSON.stringify(sessionObj);
    try { CacheService.getScriptCache().put(key, json, CONFIG.SESSION_TTL_SECONDS); } catch (e) {}
    try { PropertiesService.getScriptProperties().setProperty(key, json); } catch (e2) {}
    setActiveSessionPointer_(token);

    var settings = getSettingsMap_();
    var perms = CONFIG.ROLES[effectiveRole] || CONFIG.ROLES['Viewer'];
    writeAuditLogInternal_(
      { email: account.email, displayName: effectiveName, role: effectiveRole },
      'USER_LOGIN',
      'Authentication',
      account.email,
      'User signed into ERP portal as ' + effectiveRole,
      null,
      { loginAt: sessionObj.loginAt }
    );

    return buildResponse_(true, 'Signed in successfully.', {
      token: token,
      user: {
        authenticated: true,
        displayName: effectiveName,
        email: account.email,
        role: effectiveRole,
        department: account.department || '',
        permissions: perms,
        pollIntervalSec: Number(settings['POLL_INTERVAL_SEC'] || CONFIG.DEFAULT_POLL_INTERVAL_SEC),
        allowNegativeOverride: settings['ALLOW_NEGATIVE_STOCK_OVERRIDE'] === 'TRUE',
        authorizeFinishedGoodsIssue: settings['AUTHORIZE_FG_ISSUE'] === 'TRUE'
      }
    });
  } catch (err) {
    return buildResponse_(false, err.message);
  }
}

function logoutUser(sessionToken) {
  try {
    var active = getSessionByToken_(sessionToken) || getActiveSessionFromUserCache_();
    var tokenToClear = sessionToken || (active ? active.token : '');
    clearActiveSessionPointer_(tokenToClear);
    if (active) {
      writeAuditLogInternal_(
        { email: active.email, displayName: active.displayName, role: active.role },
        'USER_LOGOUT',
        'Authentication',
        active.email,
        'User signed out of ERP portal',
        null,
        null
      );
    }
    return buildResponse_(true, 'Signed out successfully.', { authenticated: false });
  } catch (err) {
    return buildResponse_(false, err.message);
  }
}

/**
 * Safely identifies the current user from active login session or Apps Script context.
 */
function resolveCurrentUser_(optionalToken) {
  var session = optionalToken ? getSessionByToken_(optionalToken) : getActiveSessionFromUserCache_();
  if (session && session.email) {
    var sRole = CONFIG.ROLES[session.role] ? session.role : 'Viewer';
    return {
      email: session.email,
      displayName: session.displayName || session.email,
      role: sRole,
      department: session.department || '',
      status: 'Active',
      permissions: CONFIG.ROLES[sRole] || CONFIG.ROLES['Viewer']
    };
  }

  if (isExplicitlyLoggedOut_()) {
    return {
      email: 'unauthenticated',
      displayName: 'Guest',
      role: 'Viewer',
      status: 'Inactive',
      permissions: []
    };
  }

  var email = '';
  try {
    email = Session.getActiveUser().getEmail() || '';
  } catch (e) {}
  if (!email) {
    try {
      email = Session.getEffectiveUser().getEmail() || '';
    } catch (e2) {}
  }
  email = String(email || '').trim().toLowerCase();

  var usersMap = getUsersMap_();
  var userRecord = email && usersMap[email] ? usersMap[email] : null;

  var role = 'Operations Manager';
  var displayName = email || 'Workspace Operator';

  if (userRecord) {
    if (String(userRecord.status).toLowerCase() !== 'active') {
      return {
        email: email || 'inactive',
        displayName: userRecord.displayName || displayName,
        role: 'Viewer',
        status: 'Inactive',
        permissions: []
      };
    }
    role = userRecord.role || 'Viewer';
    displayName = userRecord.displayName || displayName;
  } else {
    var settings = getSettingsMap_();
    var defaultRole = settings['DEFAULT_UNLISTED_ROLE'] || 'Operations Manager';
    role = CONFIG.ROLES[defaultRole] ? defaultRole : 'Viewer';
  }

  return {
    email: email || 'workspace-operator',
    displayName: displayName,
    role: role,
    status: 'Active',
    permissions: CONFIG.ROLES[role] || CONFIG.ROLES['Viewer']
  };
}

function getUsersMap_() {
  var map = {};
  try {
    var ss = getSpreadsheet();
    var sh = ss.getSheetByName(CONFIG.SHEETS.USERS);
    if (!sh || sh.getLastRow() < 2) return map;
    var vals = sh.getDataRange().getValues();
    for (var i = 1; i < vals.length; i++) {
      var key = String(vals[i][0] || '').trim().toLowerCase();
      if (!key) continue;
      map[key] = {
        email: key,
        displayName: String(vals[i][1] || key),
        role: String(vals[i][2] || 'Viewer'),
        status: String(vals[i][3] || 'Active'),
        updatedAt: String(vals[i][4] || '')
      };
    }
  } catch (e) {}
  return map;
}

function hasPermission_(user, perm) {
  if (!user || user.status !== 'Active') return false;
  return user.permissions.indexOf(perm) !== -1;
}

function assertPermission_(perm) {
  var user = resolveCurrentUser_();
  if (!hasPermission_(user, perm)) {
    throw new Error('Access denied: Role "' + user.role + '" lacks required permission (' + perm + ').');
  }
  return user;
}

function getCurrentUserContext(sessionToken) {
  try {
    var session = getSessionByToken_(sessionToken);
    if (!session) {
      return buildResponse_(true, 'Authentication required.', { authenticated: false });
    }
    setActiveSessionPointer_(session.token);
    var user = resolveCurrentUser_(session.token);
    if (!user || user.status !== 'Active') {
      return buildResponse_(true, 'Authentication required.', { authenticated: false });
    }
    var settings = getSettingsMap_();
    return buildResponse_(true, 'User context loaded.', {
      authenticated: true,
      displayName: user.displayName,
      email: user.email,
      role: user.role,
      department: user.department || session.department || '',
      permissions: user.permissions,
      pollIntervalSec: Number(settings['POLL_INTERVAL_SEC'] || CONFIG.DEFAULT_POLL_INTERVAL_SEC),
      allowNegativeOverride: settings['ALLOW_NEGATIVE_STOCK_OVERRIDE'] === 'TRUE',
      authorizeFinishedGoodsIssue: settings['AUTHORIZE_FG_ISSUE'] === 'TRUE'
    });
  } catch (err) {
    return buildResponse_(false, err.message);
  }
}

function getUsersList() {
  try {
    assertPermission_('USER_MANAGE');
    var ss = getSpreadsheet();
    var sh = ss.getSheetByName(CONFIG.SHEETS.USERS);
    if (!sh || sh.getLastRow() < 2) return buildResponse_(true, 'No users configured.', { users: [] });
    var vals = sh.getDataRange().getValues();
    var users = [];
    for (var i = 1; i < vals.length; i++) {
      if (!vals[i][0]) continue;
      users.push({
        email: String(vals[i][0]),
        displayName: String(vals[i][1]),
        role: String(vals[i][2]),
        status: String(vals[i][3]),
        updatedAt: String(vals[i][4])
      });
    }
    return buildResponse_(true, 'Users loaded.', { users: users, availableRoles: Object.keys(CONFIG.ROLES) });
  } catch (err) {
    return buildResponse_(false, err.message);
  }
}

function saveUserRole(payload) {
  var lock = LockService.getScriptLock();
  try {
    var actor = assertPermission_('USER_MANAGE');
    lock.waitLock(CONFIG.LOCK_TIMEOUT_MS);
    var email = String(payload.email || '').trim().toLowerCase();
    var displayName = String(payload.displayName || email).trim();
    var role = String(payload.role || 'Viewer').trim();
    var status = String(payload.status || 'Active').trim();
    if (!email) throw new Error('User email/key is required.');
    if (!CONFIG.ROLES[role]) throw new Error('Invalid role: ' + role);

    var ss = getSpreadsheet();
    var sh = ensureSheetWithHeaders_(ss, CONFIG.SHEETS.USERS, SCHEMAS.USERS, true);
    var vals = sh.getDataRange().getValues();
    var foundRow = -1;
    for (var i = 1; i < vals.length; i++) {
      if (String(vals[i][0] || '').trim().toLowerCase() === email) {
        foundRow = i + 1;
        break;
      }
    }
    var rowData = [email, displayName, role, status, nowIso_()];
    if (foundRow > 0) {
      sh.getRange(foundRow, 1, 1, rowData.length).setValues([rowData]);
    } else {
      sh.appendRow(rowData);
    }
    writeAuditLogInternal_(actor, 'SAVE_USER_ROLE', 'Security', email, 'Assigned role ' + role + ' (' + status + ')', null, rowData);
    return buildResponse_(true, 'User role saved.', { email: email, role: role, status: status });
  } catch (err) {
    return buildResponse_(false, err.message);
  } finally {
    lock.releaseLock();
  }
}

/* ==========================================================================
   5. DATABASE INITIALIZATION, BACKUP & MIGRATION
   ========================================================================== */

function ensureSheetWithHeaders_(ss, sheetName, headers, isHidden) {
  var sh = ss.getSheetByName(sheetName);
  var created = false;
  if (!sh) {
    sh = ss.insertSheet(sheetName);
    created = true;
  }

  if (sh.getLastRow() === 0) {
    sh.getRange(1, 1, 1, headers.length).setValues([headers]);
    sh.getRange(1, 1, 1, headers.length)
      .setFontWeight('bold')
      .setBackground('#0F172A')
      .setFontColor('#FFFFFF');
    sh.setFrozenRows(1);
  } else {
    // Preserve existing data! Only append missing trailing headers if sheet already has rows
    var existingCols = sh.getLastColumn();
    var existingHeaders = sh.getRange(1, 1, 1, existingCols).getValues()[0].map(function (h) {
      return String(h || '').trim();
    });
    var missing = [];
    for (var i = 0; i < headers.length; i++) {
      if (existingHeaders.indexOf(headers[i]) === -1) {
        missing.push(headers[i]);
      }
    }
    if (missing.length > 0 && existingCols < headers.length) {
      var startCol = existingCols + 1;
      sh.getRange(1, startCol, 1, missing.length).setValues([missing]);
      sh.getRange(1, startCol, 1, missing.length)
        .setFontWeight('bold')
        .setBackground('#0F172A')
        .setFontColor('#FFFFFF');
    }
  }

  if (isHidden && !sh.isSheetHidden()) {
    sh.hideSheet();
  }
  return sh;
}

function getSettingsMap_() {
  var map = {};
  try {
    var cache = CacheService.getScriptCache();
    var cached = cache.get('ERP_SETTINGS_MAP');
    if (cached) return JSON.parse(cached);

    var ss = getSpreadsheet();
    var sh = ss.getSheetByName(CONFIG.SHEETS.SETTINGS);
    if (!sh || sh.getLastRow() < 2) return map;
    var vals = sh.getDataRange().getValues();
    for (var i = 1; i < vals.length; i++) {
      var k = String(vals[i][0] || '').trim();
      if (k) map[k] = String(vals[i][1] || '');
    }
    cache.put('ERP_SETTINGS_MAP', JSON.stringify(map), CONFIG.CACHE_TTL_SECONDS);
  } catch (e) {}
  return map;
}

function initDefaultSettings_(ss) {
  var sh = ensureSheetWithHeaders_(ss, CONFIG.SHEETS.SETTINGS, SCHEMAS.SETTINGS, true);
  var existing = getSettingsMap_();
  var defaults = [
    ['SYSTEM_INITIALIZED', 'TRUE', 'Indicates ERP schema has been initialized'],
    ['POLL_INTERVAL_SEC', String(CONFIG.DEFAULT_POLL_INTERVAL_SEC), 'Frontend auto-refresh polling interval in seconds'],
    ['ALLOW_NEGATIVE_STOCK_OVERRIDE', 'FALSE', 'Allow authorized admin override for negative stock dispatch/issue'],
    ['AUTHORIZE_FG_ISSUE', 'FALSE', 'Allow issuing Finished Goods via Issue module'],
    ['PRODUCTION_STRICT_FG_ONLY', 'FALSE', 'If TRUE, flag WIP or Packing Material in Production as invalid classification'],
    ['DEFAULT_UNLISTED_ROLE', 'Operations Manager', 'Fallback role when user is not explicitly listed in _SYS_Users_RBAC']
  ];

  var rowsToAdd = [];
  var ts = nowIso_();
  for (var i = 0; i < defaults.length; i++) {
    if (existing[defaults[i][0]] === undefined) {
      rowsToAdd.push([defaults[i][0], defaults[i][1], defaults[i][2], ts]);
    }
  }
  if (rowsToAdd.length > 0) {
    sh.getRange(sh.getLastRow() + 1, 1, rowsToAdd.length, 4).setValues(rowsToAdd);
  }
  invalidateCaches_();
}

function updateSystemSetting(key, value) {
  var lock = LockService.getScriptLock();
  try {
    var actor = assertPermission_('SYNC_ADMIN');
    lock.waitLock(CONFIG.LOCK_TIMEOUT_MS);
    var ss = getSpreadsheet();
    var sh = ensureSheetWithHeaders_(ss, CONFIG.SHEETS.SETTINGS, SCHEMAS.SETTINGS, true);
    var vals = sh.getDataRange().getValues();
    var foundRow = -1;
    for (var i = 1; i < vals.length; i++) {
      if (String(vals[i][0] || '').trim() === key) {
        foundRow = i + 1;
        break;
      }
    }
    if (foundRow > 0) {
      sh.getRange(foundRow, 2).setValue(String(value));
      sh.getRange(foundRow, 4).setValue(nowIso_());
    } else {
      sh.appendRow([key, String(value), 'Custom setting', nowIso_()]);
    }
    invalidateCaches_();
    bumpDataVersion_();
    writeAuditLogInternal_(actor, 'UPDATE_SETTING', 'Configuration', key, 'Set ' + key + ' = ' + value, null, { key: key, value: value });
    return buildResponse_(true, 'Setting updated.', { key: key, value: value });
  } catch (err) {
    return buildResponse_(false, err.message);
  } finally {
    lock.releaseLock();
  }
}

/**
 * Full non-destructive system setup (Section 19).
 */
function setupSystem() {
  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(CONFIG.LOCK_TIMEOUT_MS);
    var ss = getSpreadsheet();
    var report = {
      spreadsheetName: ss.getName(),
      businessSheetsChecked: [],
      systemSheetsChecked: [],
      itemMasterWarnings: [],
      migratedRecords: 0,
      reconciliation: null,
      triggersInstalled: false
    };

    // 1. Check & preserve all 9 business sheets
    var bizSpecs = [
      { key: CONFIG.SHEETS.ITEM_MASTER, schema: SCHEMAS.ITEM_MASTER },
      { key: CONFIG.SHEETS.PRODUCTION, schema: SCHEMAS.PRODUCTION },
      { key: CONFIG.SHEETS.DISPATCH, schema: SCHEMAS.DISPATCH },
      { key: CONFIG.SHEETS.GOODS_RECEIPT, schema: SCHEMAS.GOODS_RECEIPT },
      { key: CONFIG.SHEETS.ISSUE, schema: SCHEMAS.ISSUE },
      { key: CONFIG.SHEETS.FINISHED_GOODS, schema: SCHEMAS.FINISHED_GOODS },
      { key: CONFIG.SHEETS.RAW_MATERIAL, schema: SCHEMAS.RAW_MATERIAL },
      { key: CONFIG.SHEETS.PACKING_MATERIAL, schema: SCHEMAS.PACKING_MATERIAL },
      { key: CONFIG.SHEETS.ALL_STOCK_BALANCE, schema: SCHEMAS.ALL_STOCK_BALANCE }
    ];

    for (var i = 0; i < bizSpecs.length; i++) {
      var existed = Boolean(ss.getSheetByName(bizSpecs[i].key));
      ensureSheetWithHeaders_(ss, bizSpecs[i].key, bizSpecs[i].schema, false);
      report.businessSheetsChecked.push({ name: bizSpecs[i].key, status: existed ? 'Preserved' : 'Created' });
    }

    // 2. Create hidden system sheets
    var sysSpecs = [
      { key: CONFIG.SHEETS.LEDGER, schema: SCHEMAS.LEDGER },
      { key: CONFIG.SHEETS.AUDIT_LOG, schema: SCHEMAS.AUDIT_LOG },
      { key: CONFIG.SHEETS.SYNC_ERRORS, schema: SCHEMAS.SYNC_ERRORS },
      { key: CONFIG.SHEETS.DAILY_REPORTS, schema: SCHEMAS.DAILY_REPORTS },
      { key: CONFIG.SHEETS.USERS, schema: SCHEMAS.USERS },
      { key: CONFIG.SHEETS.SETTINGS, schema: SCHEMAS.SETTINGS }
    ];

    for (var j = 0; j < sysSpecs.length; j++) {
      var sysExisted = Boolean(ss.getSheetByName(sysSpecs[j].key));
      ensureSheetWithHeaders_(ss, sysSpecs[j].key, sysSpecs[j].schema, true);
      report.systemSheetsChecked.push({ name: sysSpecs[j].key, status: sysExisted ? 'Preserved' : 'Created' });
    }

    // 3. Initialize default settings & current user as Super Admin if Users table is empty
    initDefaultSettings_(ss);
    var userSh = ss.getSheetByName(CONFIG.SHEETS.USERS);
    if (userSh.getLastRow() < 2) {
      var seedRows = (CONFIG.AUTH_ACCOUNTS || []).map(function (acc) {
        return [acc.email, acc.displayName, acc.role, 'Active', nowIso_()];
      });
      if (seedRows.length > 0) {
        userSh.getRange(2, 1, seedRows.length, 5).setValues(seedRows);
      }
    }

    // 4. Validate Item Master records
    invalidateCaches_();
    var items = loadItemsInternal_(true);
    for (var k = 0; k < items.length; k++) {
      var it = items[k];
      if (CONFIG.FIXED_CATEGORIES.indexOf(it.category) === -1) {
        report.itemMasterWarnings.push('Item ' + it.itemCode + ' (' + it.itemName + ') has non-standard category: ' + it.category);
      }
      if (!it.indexUnit) {
        report.itemMasterWarnings.push('Item ' + it.itemCode + ' is missing Index Unit.');
      }
    }

    // 5. Safe idempotent migration of any existing working-sheet rows not yet in ledger
    var syncRes = syncWorkingSheetsInternal_(ss, { email: 'system-setup', role: 'Super Admin' });
    report.migratedRecords = syncRes.created + syncRes.updated;

    // 6. Initial stock reconciliation & register refresh
    report.reconciliation = rebuildAllStockRegistersInternal_(ss);

    // 7. Install triggers
    try {
      installTriggersInternal_(ss);
      report.triggersInstalled = true;
    } catch (trigErr) {
      report.triggerWarning = trigErr.message;
    }

    // 8. Non-destructive initialization check for dedicated Procurement & Tender Spreadsheet
    try {
      report.procurementDb = procSetupDatabaseInternal_();
    } catch (procErr) {
      report.procurementWarning = procErr.message;
    }

    bumpDataVersion_();
    writeAuditLogInternal_({ email: 'system-setup', role: 'Super Admin' }, 'SETUP_SYSTEM', 'Configuration', 'SYSTEM', 'Executed non-destructive setupSystem()', null, report);

    return buildResponse_(true, 'System initialized and reconciled successfully.', report);
  } catch (err) {
    return buildResponse_(false, 'Setup failed: ' + err.message);
  } finally {
    lock.releaseLock();
  }
}

/**
 * Creates a timestamped backup copy of the entire spreadsheet in Google Drive before migration/upgrade.
 */
function backupSpreadsheet() {
  try {
    var actor = assertPermission_('SYNC_ADMIN');
    var ss = getSpreadsheet();
    var file = DriveApp.getFileById(ss.getId());
    var backupName = ss.getName() + ' - BACKUP ' + Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyy-MM-dd_HHmmss');
    var copy = file.makeCopy(backupName);
    writeAuditLogInternal_(actor, 'BACKUP_DATABASE', 'Configuration', copy.getId(), 'Created backup: ' + backupName, null, { backupUrl: copy.getUrl() });
    return buildResponse_(true, 'Backup created: ' + backupName, {
      backupId: copy.getId(),
      backupName: backupName,
      backupUrl: copy.getUrl()
    });
  } catch (err) {
    return buildResponse_(false, 'Backup failed: ' + err.message);
  }
}

function getSystemStatus() {
  try {
    var ss = getSpreadsheet();
    var settings = getSettingsMap_();
    var lastSync = PropertiesService.getScriptProperties().getProperty('ERP_LAST_SYNC_AT') || nowIso_();
    var triggers = ScriptApp.getProjectTriggers().map(function (t) {
      return { handler: t.getHandlerFunction(), type: String(t.getEventType()) };
    });
    return buildResponse_(true, 'System online.', {
      company: CONFIG.COMPANY_NAME,
      initialized: settings['SYSTEM_INITIALIZED'] === 'TRUE',
      lastSyncAt: lastSync,
      dataVersion: getDataVersion_(),
      pollIntervalSec: Number(settings['POLL_INTERVAL_SEC'] || CONFIG.DEFAULT_POLL_INTERVAL_SEC),
      triggersCount: triggers.length,
      triggers: triggers,
      sheetCount: ss.getSheets().length
    });
  } catch (err) {
    return buildResponse_(false, err.message);
  }
}

function getDatabaseHealth() {
  try {
    var ss = getSpreadsheet();
    var required = [
      CONFIG.SHEETS.ITEM_MASTER, CONFIG.SHEETS.PRODUCTION, CONFIG.SHEETS.DISPATCH,
      CONFIG.SHEETS.GOODS_RECEIPT, CONFIG.SHEETS.ISSUE, CONFIG.SHEETS.FINISHED_GOODS,
      CONFIG.SHEETS.RAW_MATERIAL, CONFIG.SHEETS.PACKING_MATERIAL, CONFIG.SHEETS.ALL_STOCK_BALANCE,
      CONFIG.SHEETS.LEDGER, CONFIG.SHEETS.AUDIT_LOG, CONFIG.SHEETS.SYNC_ERRORS,
      CONFIG.SHEETS.DAILY_REPORTS
    ];
    var sheetChecks = required.map(function (name) {
      var sh = ss.getSheetByName(name);
      return {
        name: name,
        exists: Boolean(sh),
        rows: sh ? Math.max(0, sh.getLastRow() - 1) : 0
      };
    });
    var syncErrors = getOpenSyncErrorsCount_(ss);
    return buildResponse_(true, 'Database health report generated.', {
      healthy: sheetChecks.every(function (c) { return c.exists; }) && syncErrors === 0,
      sheets: sheetChecks,
      openSyncErrors: syncErrors,
      lastSyncAt: PropertiesService.getScriptProperties().getProperty('ERP_LAST_SYNC_AT') || ''
    });
  } catch (err) {
    return buildResponse_(false, err.message);
  }
}

function checkDataVersion(clientVersion) {
  try {
    var serverVersion = getDataVersion_();
    return buildResponse_(true, 'Version checked.', {
      changed: Number(clientVersion || 0) !== serverVersion,
      serverVersion: serverVersion,
      lastSyncAt: PropertiesService.getScriptProperties().getProperty('ERP_LAST_SYNC_AT') || nowIso_()
    });
  } catch (err) {
    return buildResponse_(false, err.message);
  }
}

/* ==========================================================================
   6. ITEM MASTER — CENTRAL ITEM DATABASE & UOM CONVERSION
   ========================================================================== */

function getHeaderIndexMap_(headerRow) {
  var map = {};
  for (var i = 0; i < headerRow.length; i++) {
    var key = String(headerRow[i] || '').trim().toLowerCase();
    if (key) map[key] = i;
  }
  return map;
}

function findCol_(idxMap, candidates, fallbackIdx) {
  for (var i = 0; i < candidates.length; i++) {
    var k = candidates[i].toLowerCase();
    if (idxMap[k] !== undefined) return idxMap[k];
  }
  return fallbackIdx;
}

/**
 * Loads all Item Master records with CacheService optimization.
 */
function loadItemsInternal_(forceRefresh) {
  var cache = CacheService.getScriptCache();
  if (!forceRefresh) {
    var cached = cache.get('ERP_ITEMS_ALL');
    if (cached) {
      try { return JSON.parse(cached); } catch (e) {}
    }
  }

  var ss = getSpreadsheet();
  var sh = ss.getSheetByName(CONFIG.SHEETS.ITEM_MASTER);
  if (!sh || sh.getLastRow() < 2) return [];

  var values = sh.getDataRange().getValues();
  var hMap = getHeaderIndexMap_(values[0]);

  var cCode = findCol_(hMap, ['item code', 'code'], 0);
  var cName = findCol_(hMap, ['item name', 'name', 'particulars'], 1);
  var cCat = findCol_(hMap, ['categories', 'category'], 2);
  var cBrand = findCol_(hMap, ['brand categories', 'brand', 'brand category'], 3);
  var cHsn = findCol_(hMap, ['hsn code', 'hsn'], 4);
  var cIdxUnit = findCol_(hMap, ['index unit', 'base unit', 'unit'], 5);
  var cFrac = findCol_(hMap, ['fraction of index unit', 'fraction'], 6);
  var cConvQty = findCol_(hMap, ['conversion quantity', 'conversion qty', 'secondary qty'], 7);
  var cConvUnit = findCol_(hMap, ['conversion unit', 'secondary unit'], 8);
  var cReorder = findCol_(hMap, ['reorder level', 'reorder'], 9);
  var cStatus = findCol_(hMap, ['status'], 10);
  var cCreated = findCol_(hMap, ['created date', 'created at'], 11);
  var cUpdated = findCol_(hMap, ['updated date', 'updated at'], 12);

  var items = [];
  for (var r = 1; r < values.length; r++) {
    var row = values[r];
    var code = String(row[cCode] || '').trim();
    var name = String(row[cName] || '').trim();
    if (!code && !name) continue;

    var convQty = Number(row[cConvQty] || 0);
    var frac = Number(row[cFrac] || 0);
    // Normalize fraction vs conversion qty relationship cleanly
    if (convQty <= 0 && frac > 0 && frac < 1) {
      convQty = Math.round((1 / frac) * 10000) / 10000;
    } else if (convQty > 0 && frac <= 0) {
      frac = Math.round((1 / convQty) * 1000000) / 1000000;
    }

    items.push({
      rowNumber: r + 1,
      itemCode: code,
      itemName: name,
      category: String(row[cCat] || '').trim(),
      brand: String(row[cBrand] || '').trim(),
      hsnCode: String(row[cHsn] || '').trim(),
      indexUnit: String(row[cIdxUnit] || '').trim(),
      fractionOfIndexUnit: frac,
      conversionQty: convQty > 0 ? convQty : 0,
      conversionUnit: String(row[cConvUnit] || '').trim(),
      reorderLevel: Number(row[cReorder] || 0) || 0,
      status: String(row[cStatus] || 'Active').trim() || 'Active',
      createdDate: normalizeDateStr_(row[cCreated]) || String(row[cCreated] || ''),
      updatedDate: normalizeDateStr_(row[cUpdated]) || String(row[cUpdated] || '')
    });
  }

  try {
    var json = JSON.stringify(items);
    if (json.length < 95000) {
      cache.put('ERP_ITEMS_ALL', json, CONFIG.CACHE_TTL_SECONDS);
    }
  } catch (e) {}

  return items;
}

function getItemsIndexMap_(forceRefresh) {
  var items = loadItemsInternal_(forceRefresh);
  var map = {};
  for (var i = 0; i < items.length; i++) {
    map[String(items[i].itemCode).trim()] = items[i];
  }
  return map;
}

function getCategories() {
  return buildResponse_(true, 'Fixed categories loaded.', {
    categories: CONFIG.FIXED_CATEGORIES,
    prefixes: CONFIG.CATEGORY_CODE_PREFIXES
  });
}

function getAllItems(filters) {
  try {
    var items = loadItemsInternal_(false);
    var f = filters || {};
    var filtered = items.filter(function (it) {
      if (f.activeOnly && it.status !== 'Active') return false;
      if (f.category && it.category !== f.category) return false;
      if (f.categories && f.categories.length && f.categories.indexOf(it.category) === -1) return false;
      if (f.brand && it.brand.toLowerCase() !== String(f.brand).toLowerCase()) return false;
      if (f.hsnCode && it.hsnCode.toLowerCase().indexOf(String(f.hsnCode).toLowerCase()) === -1) return false;
      if (f.status && it.status !== f.status) return false;
      if (f.query) {
        var q = String(f.query).toLowerCase();
        var match = it.itemCode.toLowerCase().indexOf(q) !== -1 ||
                    it.itemName.toLowerCase().indexOf(q) !== -1 ||
                    it.brand.toLowerCase().indexOf(q) !== -1 ||
                    it.hsnCode.toLowerCase().indexOf(q) !== -1;
        if (!match) return false;
      }
      return true;
    });

    // Extract unique brands for filter dropdowns
    var brandsMap = {};
    for (var i = 0; i < items.length; i++) {
      if (items[i].brand) brandsMap[items[i].brand] = true;
    }

    var page = Number(f.page || 1);
    var pageSize = Number(f.pageSize || 0);
    var paged = filtered;
    if (pageSize > 0) {
      var start = (page - 1) * pageSize;
      paged = filtered.slice(start, start + pageSize);
    }

    return buildResponse_(true, 'Items fetched.', {
      items: paged,
      total: filtered.length,
      brands: Object.keys(brandsMap).sort(),
      categories: CONFIG.FIXED_CATEGORIES
    });
  } catch (err) {
    return buildResponse_(false, err.message);
  }
}

function searchItems(query, category, activeOnly, allowedCategories) {
  try {
    var items = loadItemsInternal_(false);
    var q = String(query || '').trim().toLowerCase();
    var onlyActive = activeOnly !== false;
    var results = [];
    for (var i = 0; i < items.length; i++) {
      var it = items[i];
      if (onlyActive && it.status !== 'Active') continue;
      if (category && it.category !== category) continue;
      if (allowedCategories && allowedCategories.length && allowedCategories.indexOf(it.category) === -1) continue;
      if (q) {
        var match = it.itemCode.toLowerCase().indexOf(q) !== -1 ||
                    it.itemName.toLowerCase().indexOf(q) !== -1 ||
                    it.brand.toLowerCase().indexOf(q) !== -1;
        if (!match) continue;
      }
      results.push(it);
      if (results.length >= 100) break;
    }
    return buildResponse_(true, 'Search completed.', { items: results });
  } catch (err) {
    return buildResponse_(false, err.message);
  }
}

function getItemByCode(itemCode) {
  try {
    var map = getItemsIndexMap_(false);
    var item = map[String(itemCode || '').trim()];
    if (!item) return buildResponse_(false, 'Item code "' + itemCode + '" not found in Item Master.');
    return buildResponse_(true, 'Item retrieved.', { item: item });
  } catch (err) {
    return buildResponse_(false, err.message);
  }
}

function getItemUOM(itemCode) {
  try {
    var map = getItemsIndexMap_(false);
    var item = map[String(itemCode || '').trim()];
    if (!item) return buildResponse_(false, 'Item not found.');
    var units = [item.indexUnit];
    if (item.conversionUnit && item.conversionQty > 0 && item.conversionUnit !== item.indexUnit) {
      units.push(item.conversionUnit);
    }
    return buildResponse_(true, 'Item UOM configuration retrieved.', {
      itemCode: item.itemCode,
      indexUnit: item.indexUnit,
      conversionUnit: item.conversionUnit,
      conversionQty: item.conversionQty,
      fractionOfIndexUnit: item.fractionOfIndexUnit,
      availableUnits: units
    });
  } catch (err) {
    return buildResponse_(false, err.message);
  }
}

/**
 * Generates next sequential Item Code for a fixed category without reusing old codes.
 */
function generateItemCodeInternal_(category, items) {
  if (CONFIG.FIXED_CATEGORIES.indexOf(category) === -1) {
    throw new Error('Invalid category "' + category + '". Must be one of the 6 fixed categories.');
  }
  var basePrefix = CONFIG.CATEGORY_CODE_PREFIXES[category];
  var maxCode = basePrefix - 1;
  for (var i = 0; i < items.length; i++) {
    if (items[i].category === category) {
      var num = parseInt(items[i].itemCode, 10);
      if (!isNaN(num) && num >= basePrefix && num > maxCode) {
        maxCode = num;
      }
    }
  }
  // Ensure global uniqueness even if historical manual code collided across categories
  var existingCodes = {};
  for (var j = 0; j < items.length; j++) {
    existingCodes[String(items[j].itemCode)] = true;
  }
  var candidate = maxCode + 1;
  while (existingCodes[String(candidate)]) {
    candidate++;
  }
  return String(candidate);
}

function generateItemCode(category) {
  try {
    var items = loadItemsInternal_(true);
    var nextCode = generateItemCodeInternal_(category, items);
    return buildResponse_(true, 'Next item code generated.', { itemCode: nextCode, category: category });
  } catch (err) {
    return buildResponse_(false, err.message);
  }
}

function addItem(payload) {
  var lock = LockService.getScriptLock();
  try {
    var actor = assertPermission_('ITEM_MANAGE');
    lock.waitLock(CONFIG.LOCK_TIMEOUT_MS);

    var itemName = String(payload.itemName || '').trim();
    var category = String(payload.category || '').trim();
    var brand = String(payload.brand || '').trim();
    var hsnCode = String(payload.hsnCode || '').trim();
    var indexUnit = String(payload.indexUnit || '').trim();
    var conversionUnit = String(payload.conversionUnit || '').trim();
    var conversionQty = Number(payload.conversionQty || 0);
    var fraction = Number(payload.fractionOfIndexUnit || 0);
    var reorderLevel = Number(payload.reorderLevel || 0);

    if (!itemName) throw new Error('Item Name is required.');
    if (CONFIG.FIXED_CATEGORIES.indexOf(category) === -1) {
      throw new Error('Category must be one of: ' + CONFIG.FIXED_CATEGORIES.join(', '));
    }
    if (!indexUnit) throw new Error('Index Unit is required.');
    if (reorderLevel < 0 || isNaN(reorderLevel)) throw new Error('Reorder Level cannot be negative.');

    if (conversionUnit) {
      if (conversionUnit.toLowerCase() === indexUnit.toLowerCase()) {
        throw new Error('Conversion Unit must differ from Index Unit.');
      }
      if (conversionQty <= 0 || isNaN(conversionQty)) {
        throw new Error('Conversion Quantity must be greater than zero when Conversion Unit is specified.');
      }
      fraction = Math.round((1 / conversionQty) * 1000000) / 1000000;
    } else {
      conversionQty = 0;
      fraction = 1;
    }

    var ss = getSpreadsheet();
    var sh = ensureSheetWithHeaders_(ss, CONFIG.SHEETS.ITEM_MASTER, SCHEMAS.ITEM_MASTER, false);
    var items = loadItemsInternal_(true);

    // Prevent duplicate Item Name within the same Category (case-insensitive)
    for (var i = 0; i < items.length; i++) {
      if (items[i].itemName.toLowerCase() === itemName.toLowerCase() && items[i].category === category) {
        throw new Error('Duplicate item: "' + itemName + '" already exists in ' + category + ' (' + items[i].itemCode + ').');
      }
    }

    var newCode = generateItemCodeInternal_(category, items);
    var today = todayDateStr_();
    var newRow = [
      newCode,
      itemName,
      category,
      brand,
      hsnCode,
      indexUnit,
      fraction,
      conversionQty > 0 ? conversionQty : '',
      conversionUnit,
      reorderLevel,
      'Active',
      today,
      today
    ];

    sh.appendRow(newRow);
    invalidateCaches_();
    bumpDataVersion_();
    rebuildAllStockRegistersInternal_(ss);

    writeAuditLogInternal_(actor, 'ADD_ITEM', 'Item Master', newCode, 'Created item ' + newCode + ' - ' + itemName, null, newRow);

    return buildResponse_(true, 'Item created with Item Code ' + newCode + '.', {
      itemCode: newCode,
      itemName: itemName,
      category: category
    });
  } catch (err) {
    return buildResponse_(false, err.message);
  } finally {
    lock.releaseLock();
  }
}

function updateItem(payload) {
  var lock = LockService.getScriptLock();
  try {
    var actor = assertPermission_('ITEM_MANAGE');
    lock.waitLock(CONFIG.LOCK_TIMEOUT_MS);

    var itemCode = String(payload.itemCode || '').trim();
    if (!itemCode) throw new Error('Item Code is required.');

    var ss = getSpreadsheet();
    var sh = ss.getSheetByName(CONFIG.SHEETS.ITEM_MASTER);
    if (!sh) throw new Error('Item Master sheet not found.');

    var items = loadItemsInternal_(true);
    var target = null;
    for (var i = 0; i < items.length; i++) {
      if (items[i].itemCode === itemCode) {
        target = items[i];
        break;
      }
    }
    if (!target) throw new Error('Item "' + itemCode + '" not found.');

    var itemName = String(payload.itemName !== undefined ? payload.itemName : target.itemName).trim();
    var brand = String(payload.brand !== undefined ? payload.brand : target.brand).trim();
    var hsnCode = String(payload.hsnCode !== undefined ? payload.hsnCode : target.hsnCode).trim();
    var indexUnit = String(payload.indexUnit !== undefined ? payload.indexUnit : target.indexUnit).trim();
    var conversionUnit = String(payload.conversionUnit !== undefined ? payload.conversionUnit : target.conversionUnit).trim();
    var conversionQty = Number(payload.conversionQty !== undefined ? payload.conversionQty : target.conversionQty);
    var reorderLevel = Number(payload.reorderLevel !== undefined ? payload.reorderLevel : target.reorderLevel);

    if (!itemName || !indexUnit) throw new Error('Item Name and Index Unit cannot be empty.');
    if (reorderLevel < 0 || isNaN(reorderLevel)) throw new Error('Reorder Level cannot be negative.');

    // Prevent renaming to another item's name in the same category
    for (var j = 0; j < items.length; j++) {
      if (items[j].itemCode !== itemCode &&
          items[j].category === target.category &&
          items[j].itemName.toLowerCase() === itemName.toLowerCase()) {
        throw new Error('Another item in ' + target.category + ' already uses the name "' + itemName + '".');
      }
    }

    var fraction = 1;
    if (conversionUnit) {
      if (conversionUnit.toLowerCase() === indexUnit.toLowerCase()) {
        throw new Error('Conversion Unit must differ from Index Unit.');
      }
      if (conversionQty <= 0 || isNaN(conversionQty)) {
        throw new Error('Conversion Quantity must be > 0.');
      }
      fraction = Math.round((1 / conversionQty) * 1000000) / 1000000;
    } else {
      conversionQty = 0;
    }

    var updatedRow = [
      target.itemCode,
      itemName,
      target.category, // Category cannot be mutated after code generation to preserve prefix integrity
      brand,
      hsnCode,
      indexUnit,
      fraction,
      conversionQty > 0 ? conversionQty : '',
      conversionUnit,
      reorderLevel,
      target.status,
      target.createdDate || todayDateStr_(),
      todayDateStr_()
    ];

    sh.getRange(target.rowNumber, 1, 1, updatedRow.length).setValues([updatedRow]);
    invalidateCaches_();
    bumpDataVersion_();
    rebuildAllStockRegistersInternal_(ss);

    writeAuditLogInternal_(actor, 'UPDATE_ITEM', 'Item Master', itemCode, 'Updated item ' + itemCode, target, updatedRow);
    return buildResponse_(true, 'Item ' + itemCode + ' updated.', { itemCode: itemCode });
  } catch (err) {
    return buildResponse_(false, err.message);
  } finally {
    lock.releaseLock();
  }
}

function setItemStatus(itemCode, status) {
  var lock = LockService.getScriptLock();
  try {
    var actor = assertPermission_('ITEM_MANAGE');
    lock.waitLock(CONFIG.LOCK_TIMEOUT_MS);

    var nextStatus = (String(status).toLowerCase() === 'inactive') ? 'Inactive' : 'Active';
    var ss = getSpreadsheet();
    var sh = ss.getSheetByName(CONFIG.SHEETS.ITEM_MASTER);
    if (!sh) throw new Error('Item Master sheet not found.');

    var items = loadItemsInternal_(true);
    var target = null;
    for (var i = 0; i < items.length; i++) {
      if (items[i].itemCode === String(itemCode).trim()) {
        target = items[i];
        break;
      }
    }
    if (!target) throw new Error('Item "' + itemCode + '" not found.');

    sh.getRange(target.rowNumber, 11).setValue(nextStatus);
    sh.getRange(target.rowNumber, 13).setValue(todayDateStr_());

    invalidateCaches_();
    bumpDataVersion_();
    rebuildAllStockRegistersInternal_(ss);
    writeAuditLogInternal_(actor, 'SET_ITEM_STATUS', 'Item Master', target.itemCode, 'Changed status to ' + nextStatus, { status: target.status }, { status: nextStatus });

    return buildResponse_(true, 'Item ' + target.itemCode + ' marked as ' + nextStatus + '.', { itemCode: target.itemCode, status: nextStatus });
  } catch (err) {
    return buildResponse_(false, err.message);
  } finally {
    lock.releaseLock();
  }
}

/**
 * Deletes an item from Item Master ONLY if it has zero transaction history.
 * Items with transaction history must be deactivated instead (Section 4.4).
 */
function deleteItem(itemCode) {
  var lock = LockService.getScriptLock();
  try {
    var actor = assertPermission_('ITEM_MANAGE');
    lock.waitLock(CONFIG.LOCK_TIMEOUT_MS);

    var code = String(itemCode || '').trim();
    if (!code) throw new Error('Item Code is required.');

    var ss = getSpreadsheet();
    var sh = ss.getSheetByName(CONFIG.SHEETS.ITEM_MASTER);
    if (!sh) throw new Error('Item Master sheet not found.');

    var items = loadItemsInternal_(true);
    var target = null;
    for (var i = 0; i < items.length; i++) {
      if (items[i].itemCode === code) {
        target = items[i];
        break;
      }
    }
    if (!target) throw new Error('Item "' + code + '" not found.');

    var ledger = readLedgerRowsInternal_(ss);
    for (var j = 0; j < ledger.length; j++) {
      if (ledger[j].itemCode === code) {
        throw new Error('Cannot permanently delete item ' + code + ' because it has transaction history. Please deactivate it instead.');
      }
    }

    sh.deleteRow(target.rowNumber);
    invalidateCaches_();
    bumpDataVersion_();
    rebuildAllStockRegistersInternal_(ss);
    writeAuditLogInternal_(actor, 'DELETE_ITEM', 'Item Master', code, 'Deleted unused item ' + code + ' - ' + target.itemName, target, null);

    return buildResponse_(true, 'Item ' + code + ' permanently deleted.', { itemCode: code });
  } catch (err) {
    return buildResponse_(false, err.message);
  } finally {
    lock.releaseLock();
  }
}

/* ==========================================================================
   7. UOM CONVERSION ENGINE (BASE UNIT & QUOTIENT / REMAINDER DUAL-UOM)
   ========================================================================== */

/**
 * Converts an entered quantity + UOM into the item's base Index Unit.
 */
function convertToBaseUnit(itemOrCode, quantity, uom) {
  var item = typeof itemOrCode === 'object' ? itemOrCode : getItemsIndexMap_(false)[String(itemOrCode || '').trim()];
  if (!item) throw new Error('Invalid item for UOM conversion.');

  var qty = Number(quantity);
  if (isNaN(qty) || qty <= 0) {
    throw new Error('Quantity must be a positive number.');
  }

  var enteredUom = String(uom || item.indexUnit).trim();
  if (!enteredUom) throw new Error('UOM is required.');

  if (enteredUom.toLowerCase() === item.indexUnit.toLowerCase()) {
    return {
      enteredQty: roundQty_(qty),
      enteredUom: item.indexUnit,
      baseQty: roundQty_(qty),
      indexUnit: item.indexUnit,
      dualDisplay: formatDualUOM_(item, qty)
    };
  }

  if (item.conversionUnit && item.conversionQty > 0 && enteredUom.toLowerCase() === item.conversionUnit.toLowerCase()) {
    var converted = roundQty_(qty * item.conversionQty);
    return {
      enteredQty: roundQty_(qty),
      enteredUom: item.conversionUnit,
      baseQty: converted,
      indexUnit: item.indexUnit,
      dualDisplay: formatDualUOM_(item, converted)
    };
  }

  throw new Error('Unsupported UOM "' + enteredUom + '" for item ' + item.itemCode + '. Allowed: ' + item.indexUnit + (item.conversionUnit ? ', ' + item.conversionUnit : ''));
}

/**
 * Implements Quotient + Remainder Dual-UOM breakdown (Section 4.5):
 * Example: 1 Cartoon = 48 Pkt. For 60 Pkt => 1 Cartoon 12 Pkt (no decimals in Cartoon).
 */
function decomposeToDualUOM_(item, baseQty) {
  var q = roundQty_(baseQty);
  if (!item || !item.conversionUnit || !item.conversionQty || item.conversionQty <= 0) {
    return {
      baseQty: q,
      indexUnit: item ? item.indexUnit : '',
      hasSecondary: false,
      secondaryQty: 0,
      secondaryUnit: '',
      remainderQty: q,
      display: q + ' ' + (item ? item.indexUnit : '')
    };
  }

  var sign = q < 0 ? -1 : 1;
  var absQ = Math.abs(q);
  var conv = item.conversionQty;

  var wholeSec = Math.floor((absQ + 1e-9) / conv);
  var rem = roundQty_(absQ - (wholeSec * conv));
  if (Math.abs(rem - conv) < 1e-6) {
    wholeSec += 1;
    rem = 0;
  }

  wholeSec = sign * wholeSec;
  rem = sign * rem;

  var displayStr = wholeSec + ' ' + item.conversionUnit + (rem !== 0 ? ' ' + rem + ' ' + item.indexUnit : '');
  return {
    baseQty: q,
    indexUnit: item.indexUnit,
    hasSecondary: true,
    secondaryQty: wholeSec,
    secondaryUnit: item.conversionUnit,
    remainderQty: rem,
    conversionRate: conv,
    display: displayStr
  };
}

function formatDualUOM_(item, baseQty) {
  return decomposeToDualUOM_(item, baseQty).display;
}

/* ==========================================================================
   8. CENTRAL INVENTORY TRANSACTION ENGINE & NORMALIZED LEDGER
   ========================================================================== */

function readLedgerRowsInternal_(ss) {
  var sh = ss.getSheetByName(CONFIG.SHEETS.LEDGER);
  if (!sh || sh.getLastRow() < 2) return [];
  var vals = sh.getDataRange().getValues();
  var rows = [];
  for (var i = 1; i < vals.length; i++) {
    var r = vals[i];
    if (!r[0]) continue;
    rows.push({
      rowNumber: i + 1,
      txId: String(r[0]).trim(),
      txType: String(r[1]).trim(),
      txDate: normalizeDateStr_(r[2]),
      itemCode: String(r[3]).trim(),
      itemName: String(r[4]).trim(),
      category: String(r[5]).trim(),
      brand: String(r[6]).trim(),
      enteredQty: Number(r[7] || 0),
      enteredUom: String(r[8]).trim(),
      baseQty: Number(r[9] || 0),
      direction: String(r[10]).trim(),
      sourceSheet: String(r[11]).trim(),
      sourceRow: Number(r[12] || 0),
      batchNo: String(r[13] || '').trim(),
      refNo: String(r[14] || '').trim(),
      partyOrSection: String(r[15] || '').trim(),
      metaJson: String(r[16] || '{}'),
      remarks: String(r[17] || ''),
      createdBy: String(r[18] || ''),
      createdAt: String(r[19] || ''),
      updatedBy: String(r[20] || ''),
      updatedAt: String(r[21] || ''),
      status: String(r[22] || 'ACTIVE').trim(),
      recordHash: String(r[23] || '').trim()
    });
  }
  return rows;
}

function generateTransactionIdInternal_(txType, existingLedger) {
  var prefixMap = {
    'PRODUCTION': 'PRD',
    'GOODS_RECEIPT': 'GRN',
    'DISPATCH': 'DSP',
    'ISSUE': 'ISS',
    'OPENING_STOCK': 'OPN',
    'ADJUSTMENT': 'ADJ'
  };
  var prefix = prefixMap[txType] || 'TRX';
  var datePart = Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyyMMdd');
  var maxSeq = 0;
  var existingIds = {};
  for (var i = 0; i < existingLedger.length; i++) {
    var id = existingLedger[i].txId;
    existingIds[id] = true;
    var parts = id.split('-');
    if (parts[0] === prefix && parts.length >= 3) {
      var seq = parseInt(parts[parts.length - 1], 10);
      if (!isNaN(seq) && seq > maxSeq) maxSeq = seq;
    }
  }
  var nextSeq = maxSeq + 1;
  var candidate = prefix + '-' + datePart + '-' + ('0000' + nextSeq).slice(-4);
  while (existingIds[candidate]) {
    nextSeq++;
    candidate = prefix + '-' + datePart + '-' + ('0000' + nextSeq).slice(-4);
  }
  return candidate;
}

/**
 * Calculates stock balances directly from ACTIVE ledger transactions up to optional asOfDate.
 */
function calculateStockMapInternal_(ss, asOfDate, excludeTxId) {
  var items = loadItemsInternal_(false);
  var ledger = readLedgerRowsInternal_(ss);
  var cutoff = asOfDate ? normalizeDateStr_(asOfDate) : '';

  var stockMap = {};
  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    stockMap[it.itemCode] = {
      item: it,
      openingBeforeDate: 0,
      periodIn: 0,
      periodOut: 0,
      totalIn: 0,
      totalOut: 0,
      closing: 0
    };
  }

  for (var j = 0; j < ledger.length; j++) {
    var tx = ledger[j];
    if (tx.status !== 'ACTIVE') continue;
    if (excludeTxId && tx.txId === excludeTxId) continue;
    if (cutoff && tx.txDate > cutoff) continue;

    if (!stockMap[tx.itemCode]) {
      // Preserve historical items even if missing from active list
      stockMap[tx.itemCode] = {
        item: {
          itemCode: tx.itemCode,
          itemName: tx.itemName,
          category: tx.category,
          brand: tx.brand,
          indexUnit: tx.enteredUom,
          conversionUnit: '',
          conversionQty: 0,
          reorderLevel: 0,
          status: 'Inactive'
        },
        openingBeforeDate: 0,
        periodIn: 0,
        periodOut: 0,
        totalIn: 0,
        totalOut: 0,
        closing: 0
      };
    }

    var rec = stockMap[tx.itemCode];
    var qty = roundQty_(tx.baseQty);
    var isIn = tx.direction === 'IN';

    if (cutoff) {
      if (tx.txDate < cutoff) {
        rec.openingBeforeDate = roundQty_(rec.openingBeforeDate + (isIn ? qty : -qty));
      } else if (tx.txDate === cutoff) {
        if (isIn) rec.periodIn = roundQty_(rec.periodIn + qty);
        else rec.periodOut = roundQty_(rec.periodOut + qty);
      }
    }

    if (isIn) rec.totalIn = roundQty_(rec.totalIn + qty);
    else rec.totalOut = roundQty_(rec.totalOut + qty);

    rec.closing = roundQty_(rec.totalIn - rec.totalOut);
  }

  return stockMap;
}

/**
 * Validates transaction business rules, category routing, UOM conversion, and available stock.
 */
function validateTransactionInternal_(ss, txInput, options) {
  var opts = options || {};
  var settings = getSettingsMap_();
  var txType = String(txInput.txType || '').trim();
  var txDate = normalizeDateStr_(txInput.txDate);
  var itemCode = String(txInput.itemCode || '').trim();

  if (!txDate) throw new Error('Valid transaction date (YYYY-MM-DD) is required.');
  if (!itemCode) throw new Error('Item Code must be selected from Item Master.');

  var itemMap = getItemsIndexMap_(false);
  var item = itemMap[itemCode];
  if (!item) throw new Error('Item Code "' + itemCode + '" does not exist in Item Master.');
  if (!opts.allowInactive && item.status !== 'Active') {
    throw new Error('Item "' + item.itemCode + ' - ' + item.itemName + '" is Inactive and cannot be used in new transactions.');
  }

  // Category routing validation
  if (txType === 'PRODUCTION') {
    var strictFG = settings['PRODUCTION_STRICT_FG_ONLY'] === 'TRUE';
    if (strictFG && item.category !== 'Finished Goods') {
      throw new Error('Invalid Production classification: Item "' + item.itemName + '" belongs to "' + item.category + '", not Finished Goods.');
    }
    if (CONFIG.ROUTING_RULES.PRODUCTION_ALLOWED.indexOf(item.category) === -1) {
      throw new Error('Category "' + item.category + '" is not permitted in Production.');
    }
  } else if (txType === 'GOODS_RECEIPT') {
    if (CONFIG.ROUTING_RULES.GOODS_RECEIPT_ALLOWED.indexOf(item.category) === -1) {
      throw new Error('Category "' + item.category + '" is not permitted in Goods Receipt.');
    }
  } else if (txType === 'DISPATCH') {
    if (CONFIG.ROUTING_RULES.DISPATCH_ALLOWED.indexOf(item.category) === -1) {
      throw new Error('Dispatch only supports Finished Goods. "' + item.itemName + '" is in "' + item.category + '".');
    }
  } else if (txType === 'ISSUE') {
    if (item.category === 'Finished Goods' && settings['AUTHORIZE_FG_ISSUE'] !== 'TRUE') {
      throw new Error('Issuing Finished Goods requires explicit authorization in System Settings.');
    }
    if (CONFIG.ROUTING_RULES.ISSUE_ALLOWED.indexOf(item.category) === -1) {
      throw new Error('Category "' + item.category + '" is not permitted in Issue.');
    }
  }

  // Quantity & Dual-UOM Conversion
  var conversion;
  if (txType === 'DISPATCH' && (Number(txInput.secondaryQty || 0) > 0 || Number(txInput.indexQty || 0) > 0) && !txInput.quantity) {
    var secQ = Number(txInput.secondaryQty || 0);
    var idxQ = Number(txInput.indexQty || 0);
    if (secQ < 0 || idxQ < 0 || (secQ === 0 && idxQ === 0)) {
      throw new Error('Dispatch CTN / Pkt quantities must be positive.');
    }
    if (secQ > 0 && (!item.conversionUnit || item.conversionQty <= 0)) {
      throw new Error('Item "' + item.itemName + '" has no secondary conversion configured in Item Master.');
    }
    var totalBase = roundQty_((secQ * (item.conversionQty || 0)) + idxQ);
    conversion = {
      enteredQty: totalBase,
      enteredUom: item.indexUnit,
      baseQty: totalBase,
      indexUnit: item.indexUnit,
      dualDisplay: formatDualUOM_(item, totalBase),
      secondaryQtyInput: secQ,
      indexQtyInput: idxQ
    };
  } else {
    conversion = convertToBaseUnit(item, txInput.quantity, txInput.uom);
  }

  var direction = (txType === 'PRODUCTION' || txType === 'GOODS_RECEIPT' || txType === 'OPENING_STOCK') ? 'IN' :
                  (txType === 'DISPATCH' || txType === 'ISSUE') ? 'OUT' :
                  (String(txInput.direction || 'IN').toUpperCase() === 'OUT' ? 'OUT' : 'IN');

  // Stock availability check for OUT transactions
  if (direction === 'OUT') {
    var stockMap = calculateStockMapInternal_(ss, null, opts.excludeTxId || null);
    var available = stockMap[item.itemCode] ? stockMap[item.itemCode].closing : 0;
    if (available + 1e-9 < conversion.baseQty) {
      var allowOverride = Boolean(txInput.allowNegativeOverride) &&
                          settings['ALLOW_NEGATIVE_STOCK_OVERRIDE'] === 'TRUE' &&
                          opts.actor && hasPermission_(opts.actor, 'NEGATIVE_OVERRIDE');
      if (!allowOverride) {
        throw new Error('Insufficient stock for ' + item.itemCode + ' (' + item.itemName + '). Available: ' +
          formatDualUOM_(item, available) + ', Requested: ' + conversion.dualDisplay + '.');
      }
    }
  }

  return {
    item: item,
    txType: txType,
    txDate: txDate,
    direction: direction,
    conversion: conversion
  };
}

function validateTransaction(txInput) {
  try {
    var ss = getSpreadsheet();
    var actor = resolveCurrentUser_();
    var res = validateTransactionInternal_(ss, txInput, { actor: actor });
    return buildResponse_(true, 'Transaction is valid.', {
      itemCode: res.item.itemCode,
      itemName: res.item.itemName,
      category: res.item.category,
      baseQty: res.conversion.baseQty,
      indexUnit: res.item.indexUnit,
      dualDisplay: res.conversion.dualDisplay
    });
  } catch (err) {
    return buildResponse_(false, err.message);
  }
}

/**
 * Formats a working-sheet row array matching the target sheet schema.
 */
function buildWorkingRowValues_(txId, validated, txInput, actorName, createdAt, status, syncStatus) {
  var it = validated.item;
  var conv = validated.conversion;
  var meta = txInput.meta || {};
  var t = validated.txType;

  if (t === 'PRODUCTION') {
    return [
      txId, validated.txDate, it.category, it.itemCode, it.itemName, it.brand,
      conv.enteredQty, conv.enteredUom, conv.baseQty, it.indexUnit, conv.dualDisplay,
      txInput.batchNo || '', txInput.refNo || '', txInput.remarks || '',
      actorName, createdAt, status, syncStatus
    ];
  }
  if (t === 'DISPATCH') {
    var dDual = decomposeToDualUOM_(it, conv.baseQty);
    return [
      txId, validated.txDate, it.category, it.itemCode, it.itemName, it.brand,
      dDual.hasSecondary ? dDual.secondaryQty : 0, dDual.remainderQty,
      conv.enteredQty, conv.enteredUom, conv.baseQty, it.indexUnit, conv.dualDisplay,
      txInput.partyOrSection || '', meta.challanNo || txInput.refNo || '', meta.invoiceNo || '',
      meta.vehicleNo || '', txInput.remarks || '',
      actorName, createdAt, status, syncStatus
    ];
  }
  if (t === 'GOODS_RECEIPT') {
    return [
      txId, validated.txDate, it.category, it.itemCode, it.itemName, it.brand,
      conv.enteredQty, conv.enteredUom, conv.baseQty, it.indexUnit, conv.dualDisplay,
      txInput.partyOrSection || '', meta.invoiceNo || '', txInput.refNo || '', txInput.batchNo || '',
      txInput.remarks || '', actorName, createdAt, status, syncStatus
    ];
  }
  if (t === 'ISSUE') {
    return [
      txId, validated.txDate, it.category, it.itemCode, it.itemName, it.brand,
      conv.enteredQty, conv.enteredUom, conv.baseQty, it.indexUnit, conv.dualDisplay,
      txInput.partyOrSection || '', txInput.refNo || '', meta.issuedTo || '',
      txInput.remarks || '', actorName, createdAt, status, syncStatus
    ];
  }
  return null;
}

function getWorkingSheetNameForType_(txType) {
  if (txType === 'PRODUCTION') return CONFIG.SHEETS.PRODUCTION;
  if (txType === 'DISPATCH') return CONFIG.SHEETS.DISPATCH;
  if (txType === 'GOODS_RECEIPT') return CONFIG.SHEETS.GOODS_RECEIPT;
  if (txType === 'ISSUE') return CONFIG.SHEETS.ISSUE;
  return '';
}

function getWorkingSchemaForType_(txType) {
  if (txType === 'PRODUCTION') return SCHEMAS.PRODUCTION;
  if (txType === 'DISPATCH') return SCHEMAS.DISPATCH;
  if (txType === 'GOODS_RECEIPT') return SCHEMAS.GOODS_RECEIPT;
  if (txType === 'ISSUE') return SCHEMAS.ISSUE;
  return [];
}

/**
 * Central transaction creation (Web App & Adjustment).
 */
function createTransaction(txInput) {
  var lock = LockService.getScriptLock();
  try {
    var txType = String(txInput.txType || '').trim();
    var permMap = {
      'PRODUCTION': 'PRODUCTION_WRITE',
      'GOODS_RECEIPT': 'RECEIPT_WRITE',
      'DISPATCH': 'DISPATCH_WRITE',
      'ISSUE': 'ISSUE_WRITE',
      'OPENING_STOCK': 'STOCK_ADJUST',
      'ADJUSTMENT': 'STOCK_ADJUST'
    };
    var actor = assertPermission_(permMap[txType] || 'STOCK_ADJUST');
    lock.waitLock(CONFIG.LOCK_TIMEOUT_MS);

    var ss = getSpreadsheet();
    var validated = validateTransactionInternal_(ss, txInput, { actor: actor });
    txInput.meta = enrichTxRateMeta_(validated.txDate, validated.conversion.enteredQty, txInput.meta);
    var ledgerSh = ensureSheetWithHeaders_(ss, CONFIG.SHEETS.LEDGER, SCHEMAS.LEDGER, true);
    var existingLedger = readLedgerRowsInternal_(ss);

    // Prevent duplicate submission via client request token if provided
    if (txInput.clientToken) {
      var cache = CacheService.getScriptCache();
      var tokenKey = 'REQ_TOKEN_' + txInput.clientToken;
      if (cache.get(tokenKey)) {
        throw new Error('Duplicate submission detected. Transaction already processed.');
      }
      cache.put(tokenKey, '1', 60);
    }

    var txId = generateTransactionIdInternal_(txType, existingLedger);
    var ts = nowIso_();
    var sheetName = getWorkingSheetNameForType_(txType);
    var sourceRow = 0;
    var rollbackNeeded = false;

    try {
      // 1. Write to working sheet if applicable
      if (sheetName) {
        var workSh = ensureSheetWithHeaders_(ss, sheetName, getWorkingSchemaForType_(txType), false);
        var workRow = buildWorkingRowValues_(txId, validated, txInput, actor.displayName, ts, 'ACTIVE', 'SYNCED');
        sourceRow = workSh.getLastRow() + 1;
        workSh.getRange(sourceRow, 1, 1, workRow.length).setValues([workRow]);
        rollbackNeeded = true;
      }

      // 2. Write to central ledger
      var recHash = computeHash_([
        txId, validated.txDate, validated.item.itemCode,
        validated.conversion.enteredQty, validated.conversion.enteredUom, 'ACTIVE'
      ]);
      var ledgerRow = [
        txId, txType, validated.txDate, validated.item.itemCode, validated.item.itemName,
        validated.item.category, validated.item.brand,
        validated.conversion.enteredQty, validated.conversion.enteredUom, validated.conversion.baseQty,
        validated.direction, sheetName || 'SYSTEM', sourceRow,
        txInput.batchNo || '', txInput.refNo || '', txInput.partyOrSection || '',
        JSON.stringify(txInput.meta || {}), txInput.remarks || '',
        actor.displayName, ts, actor.displayName, ts, 'ACTIVE', recHash
      ];
      ledgerSh.appendRow(ledgerRow);
      rollbackNeeded = false;

      // 3. Refresh stock registers & version
      invalidateCaches_();
      bumpDataVersion_();
      rebuildAllStockRegistersInternal_(ss);

      writeAuditLogInternal_(actor, 'CREATE_TX', txType, txId,
        txType + ' ' + validated.conversion.dualDisplay + ' of ' + validated.item.itemCode, null, ledgerRow);

      if (txType === 'GOODS_RECEIPT' && txInput.meta && txInput.meta.poNo) {
        try {
          tryUpdatePOReceiptProgress_(txInput.meta.poNo, validated.conversion.baseQty, actor.email);
        } catch (poErr) {}
      }

      return buildResponse_(true, 'Transaction ' + txId + ' saved successfully.', {
        txId: txId,
        itemCode: validated.item.itemCode,
        baseQty: validated.conversion.baseQty,
        dualDisplay: validated.conversion.dualDisplay
      });
    } catch (writeErr) {
      if (rollbackNeeded && sheetName && sourceRow > 1) {
        try { ss.getSheetByName(sheetName).deleteRow(sourceRow); } catch (rb) {}
      }
      throw writeErr;
    }
  } catch (err) {
    return buildResponse_(false, err.message);
  } finally {
    lock.releaseLock();
  }
}

/**
 * Updates an existing transaction in-place without duplicating stock (Test 8).
 */
function updateTransaction(txId, updates) {
  var lock = LockService.getScriptLock();
  try {
    var actor = assertPermission_('TX_EDIT');
    lock.waitLock(CONFIG.LOCK_TIMEOUT_MS);

    var ss = getSpreadsheet();
    var ledgerSh = ss.getSheetByName(CONFIG.SHEETS.LEDGER);
    if (!ledgerSh) throw new Error('Transaction ledger not initialized.');

    var rows = readLedgerRowsInternal_(ss);
    var target = null;
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].txId === String(txId).trim()) {
        target = rows[i];
        break;
      }
    }
    if (!target) throw new Error('Transaction "' + txId + '" not found.');
    if (target.status !== 'ACTIVE') throw new Error('Cannot edit a cancelled transaction.');

    var existingMeta = {};
    try { existingMeta = JSON.parse(target.metaJson || '{}'); } catch (e) {}
    var incomingMeta = updates.meta || {};
    var mergedMeta = {};
    for (var mk in existingMeta) {
      if (existingMeta.hasOwnProperty(mk)) mergedMeta[mk] = existingMeta[mk];
    }
    for (var nk in incomingMeta) {
      if (incomingMeta.hasOwnProperty(nk)) mergedMeta[nk] = incomingMeta[nk];
    }
    var mergedInput = {
      txType: target.txType,
      txDate: updates.txDate !== undefined ? updates.txDate : target.txDate,
      itemCode: updates.itemCode !== undefined ? updates.itemCode : target.itemCode,
      quantity: updates.quantity !== undefined ? updates.quantity : target.enteredQty,
      uom: updates.uom !== undefined ? updates.uom : target.enteredUom,
      secondaryQty: updates.secondaryQty,
      indexQty: updates.indexQty,
      batchNo: updates.batchNo !== undefined ? updates.batchNo : target.batchNo,
      refNo: updates.refNo !== undefined ? updates.refNo : target.refNo,
      partyOrSection: updates.partyOrSection !== undefined ? updates.partyOrSection : target.partyOrSection,
      meta: mergedMeta,
      remarks: updates.remarks !== undefined ? updates.remarks : target.remarks,
      allowNegativeOverride: updates.allowNegativeOverride
    };

    var validated = validateTransactionInternal_(ss, mergedInput, {
      actor: actor,
      excludeTxId: target.txId,
      allowInactive: (mergedInput.itemCode === target.itemCode)
    });
    mergedInput.meta = enrichTxRateMeta_(validated.txDate, validated.conversion.enteredQty, mergedInput.meta);

    // If reducing an IN transaction, ensure resulting item stock doesn't drop below zero
    if (validated.direction === 'IN' && validated.conversion.baseQty < target.baseQty) {
      var stockWithout = calculateStockMapInternal_(ss, null, target.txId);
      var baseStock = stockWithout[validated.item.itemCode] ? stockWithout[validated.item.itemCode].closing : 0;
      if (baseStock + validated.conversion.baseQty < -1e-9) {
        throw new Error('Cannot reduce this receipt/production below already dispatched/issued quantity.');
      }
    }

    var ts = nowIso_();
    var recHash = computeHash_([
      target.txId, validated.txDate, validated.item.itemCode,
      validated.conversion.enteredQty, validated.conversion.enteredUom, 'ACTIVE'
    ]);

    var updatedLedgerRow = [
      target.txId, target.txType, validated.txDate, validated.item.itemCode, validated.item.itemName,
      validated.item.category, validated.item.brand,
      validated.conversion.enteredQty, validated.conversion.enteredUom, validated.conversion.baseQty,
      validated.direction, target.sourceSheet, target.sourceRow,
      mergedInput.batchNo, mergedInput.refNo, mergedInput.partyOrSection,
      JSON.stringify(mergedInput.meta || {}), mergedInput.remarks,
      target.createdBy, target.createdAt, actor.displayName, ts, 'ACTIVE', recHash
    ];

    ledgerSh.getRange(target.rowNumber, 1, 1, updatedLedgerRow.length).setValues([updatedLedgerRow]);

    // Update linked working sheet row if present
    var sheetName = getWorkingSheetNameForType_(target.txType);
    if (sheetName) {
      var workSh = ss.getSheetByName(sheetName);
      if (workSh && workSh.getLastRow() >= 2) {
        var workVals = workSh.getDataRange().getValues();
        for (var r = 1; r < workVals.length; r++) {
          if (String(workVals[r][0]).trim() === target.txId) {
            var workRow = buildWorkingRowValues_(target.txId, validated, mergedInput, target.createdBy, target.createdAt, 'ACTIVE', 'SYNCED');
            workSh.getRange(r + 1, 1, 1, workRow.length).setValues([workRow]);
            break;
          }
        }
      }
    }

    invalidateCaches_();
    bumpDataVersion_();
    rebuildAllStockRegistersInternal_(ss);
    writeAuditLogInternal_(actor, 'UPDATE_TX', target.txType, target.txId,
      'Updated qty from ' + target.baseQty + ' to ' + validated.conversion.baseQty, target, updatedLedgerRow);

    return buildResponse_(true, 'Transaction ' + target.txId + ' updated.', {
      txId: target.txId,
      baseQty: validated.conversion.baseQty,
      dualDisplay: validated.conversion.dualDisplay
    });
  } catch (err) {
    return buildResponse_(false, err.message);
  } finally {
    lock.releaseLock();
  }
}

/**
 * Cancels a transaction and reverses its stock effect exactly once while preserving history (Test 9).
 */
function cancelTransaction(txId, reason) {
  var lock = LockService.getScriptLock();
  try {
    var actor = assertPermission_('TX_CANCEL');
    lock.waitLock(CONFIG.LOCK_TIMEOUT_MS);

    var ss = getSpreadsheet();
    var ledgerSh = ss.getSheetByName(CONFIG.SHEETS.LEDGER);
    if (!ledgerSh) throw new Error('Ledger not found.');

    var rows = readLedgerRowsInternal_(ss);
    var target = null;
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].txId === String(txId).trim()) {
        target = rows[i];
        break;
      }
    }
    if (!target) throw new Error('Transaction "' + txId + '" not found.');
    if (target.status === 'CANCELLED') {
      throw new Error('Transaction "' + txId + '" is already cancelled.');
    }

    // If cancelling an IN transaction, check stock won't go negative unless override allowed
    if (target.direction === 'IN') {
      var stockWithout = calculateStockMapInternal_(ss, null, target.txId);
      var remaining = stockWithout[target.itemCode] ? stockWithout[target.itemCode].closing : 0;
      if (remaining < -1e-9) {
        var settings = getSettingsMap_();
        if (!(settings['ALLOW_NEGATIVE_STOCK_OVERRIDE'] === 'TRUE' && hasPermission_(actor, 'NEGATIVE_OVERRIDE'))) {
          throw new Error('Cannot cancel IN transaction "' + txId + '": stock for ' + target.itemCode + ' has already been consumed.');
        }
      }
    }

    var ts = nowIso_();
    var cancelNote = reason ? (target.remarks ? target.remarks + ' | Cancelled: ' + reason : 'Cancelled: ' + reason) : target.remarks;
    var recHash = computeHash_([target.txId, target.txDate, target.itemCode, target.enteredQty, target.enteredUom, 'CANCELLED']);

    ledgerSh.getRange(target.rowNumber, 18).setValue(cancelNote);
    ledgerSh.getRange(target.rowNumber, 21).setValue(actor.displayName);
    ledgerSh.getRange(target.rowNumber, 22).setValue(ts);
    ledgerSh.getRange(target.rowNumber, 23).setValue('CANCELLED');
    ledgerSh.getRange(target.rowNumber, 24).setValue(recHash);

    var sheetName = getWorkingSheetNameForType_(target.txType);
    if (sheetName) {
      var workSh = ss.getSheetByName(sheetName);
      if (workSh && workSh.getLastRow() >= 2) {
        var workVals = workSh.getDataRange().getValues();
        var statusCol = workVals[0].length - 1; // 'Status' is 2nd-to-last col
        for (var r = 1; r < workVals.length; r++) {
          if (String(workVals[r][0]).trim() === target.txId) {
            workSh.getRange(r + 1, statusCol, 1, 2).setValues([['CANCELLED', 'SYNCED']]);
            break;
          }
        }
      }
    }

    invalidateCaches_();
    bumpDataVersion_();
    rebuildAllStockRegistersInternal_(ss);
    writeAuditLogInternal_(actor, 'CANCEL_TX', target.txType, target.txId, 'Cancelled transaction: ' + (reason || 'No reason'), target, { status: 'CANCELLED' });

    return buildResponse_(true, 'Transaction ' + target.txId + ' cancelled and stock reversed.', { txId: target.txId });
  } catch (err) {
    return buildResponse_(false, err.message);
  } finally {
    lock.releaseLock();
  }
}

function enrichTxRateMeta_(txDate, enteredQty, metaIn) {
  var meta = {};
  if (metaIn && typeof metaIn === 'object') {
    for (var k in metaIn) {
      if (metaIn.hasOwnProperty(k)) meta[k] = metaIn[k];
    }
  }
  var unitRate = parseFloat(meta.unitRate);
  if (isNaN(unitRate) || unitRate < 0) unitRate = 0;
  var curr = String(meta.currency || 'NPR').toUpperCase().trim() || 'NPR';
  var exRate = parseFloat(meta.exchangeRate);
  if (curr === 'NPR') {
    exRate = 1.00;
  } else if (!(exRate > 0) || meta.syncDateRate) {
    try {
      var dateRates = procGetExchangeRatesForDate_(getProcurementSpreadsheet(), txDate);
      exRate = Number(dateRates[curr]) || Number(CONFIG.DEFAULT_EXCHANGE_RATES[curr]) || 1.00;
    } catch (e) {
      exRate = Number(CONFIG.DEFAULT_EXCHANGE_RATES[curr]) || 1.00;
    }
  }
  delete meta.syncDateRate;
  meta.unitRate = unitRate;
  meta.currency = curr;
  meta.exchangeRate = exRate;
  meta.totalAmount = unitRate > 0 ? roundQty_(Number(enteredQty || 0) * unitRate) : 0;
  meta.totalAmountNPR = meta.totalAmount > 0 ? Math.round(meta.totalAmount * exRate * 100) / 100 : 0;
  return meta;
}

function attachTxRateFields_(tx) {
  var meta = {};
  try { meta = JSON.parse(tx.metaJson || '{}'); } catch (e) {}
  tx.meta = meta;
  tx.unitRate = Number(meta.unitRate || 0);
  tx.currency = String(meta.currency || 'NPR');
  tx.exchangeRate = Number(meta.exchangeRate || 1);
  tx.totalAmount = Number(meta.totalAmount || (tx.unitRate > 0 ? roundQty_(tx.enteredQty * tx.unitRate) : 0));
  tx.totalAmountNPR = Number(meta.totalAmountNPR || (tx.totalAmount > 0 ? Math.round(tx.totalAmount * tx.exchangeRate * 100) / 100 : 0));
  return tx;
}

function getTransactionById(txId) {
  try {
    var ss = getSpreadsheet();
    var rows = readLedgerRowsInternal_(ss);
    for (var i = 0; i < rows.length; i++) {
      if (rows[i].txId === String(txId).trim()) {
        return buildResponse_(true, 'Transaction found.', { transaction: attachTxRateFields_(rows[i]) });
      }
    }
    return buildResponse_(false, 'Transaction not found.');
  } catch (err) {
    return buildResponse_(false, err.message);
  }
}

function getTransactionHistory(filters) {
  try {
    var ss = getSpreadsheet();
    var rows = readLedgerRowsInternal_(ss);
    var itemMap = getItemsIndexMap_(false);
    var f = filters || {};

    var filtered = rows.filter(function (tx) {
      if (f.txType && tx.txType !== f.txType) return false;
      if (f.category && tx.category !== f.category) return false;
      if (f.brand && tx.brand !== f.brand) return false;
      if (f.itemCode && tx.itemCode !== f.itemCode) return false;
      if (f.status && tx.status !== f.status) return false;
      if (f.startDate && tx.txDate < normalizeDateStr_(f.startDate)) return false;
      if (f.endDate && tx.txDate > normalizeDateStr_(f.endDate)) return false;
      if (f.query) {
        var q = String(f.query).toLowerCase();
        var m = tx.txId.toLowerCase().indexOf(q) !== -1 ||
                tx.itemCode.toLowerCase().indexOf(q) !== -1 ||
                tx.itemName.toLowerCase().indexOf(q) !== -1 ||
                tx.refNo.toLowerCase().indexOf(q) !== -1 ||
                tx.partyOrSection.toLowerCase().indexOf(q) !== -1;
        if (!m) return false;
      }
      return true;
    });

    filtered.sort(function (a, b) {
      if (a.txDate !== b.txDate) return b.txDate.localeCompare(a.txDate);
      return b.createdAt.localeCompare(a.createdAt);
    });

    var page = Number(f.page || 1);
    var pageSize = Number(f.pageSize || 50);
    var start = (page - 1) * pageSize;
    var paged = filtered.slice(start, start + pageSize).map(function (tx) {
      var it = itemMap[tx.itemCode];
      tx.dualDisplay = it ? formatDualUOM_(it, tx.baseQty) : (tx.baseQty + ' ' + tx.enteredUom);
      tx.indexUnit = it ? it.indexUnit : tx.enteredUom;
      return attachTxRateFields_(tx);
    });

    return buildResponse_(true, 'Transactions loaded.', {
      records: paged,
      total: filtered.length,
      page: page,
      pageSize: pageSize
    });
  } catch (err) {
    return buildResponse_(false, err.message);
  }
}

/* ==========================================================================
   9. WORKING SHEETS API WRAPPERS (PRODUCTION, DISPATCH, RECEIPT, ISSUE)
   ========================================================================== */

function saveProduction(payload) {
  payload.txType = 'PRODUCTION';
  return createTransaction(payload);
}

function saveDispatch(payload) {
  payload.txType = 'DISPATCH';
  return createTransaction(payload);
}

function saveGoodsReceipt(payload) {
  payload.txType = 'GOODS_RECEIPT';
  return createTransaction(payload);
}

function saveIssue(payload) {
  payload.txType = 'ISSUE';
  return createTransaction(payload);
}

function getProductionRecords(filters) {
  var f = filters || {};
  f.txType = 'PRODUCTION';
  return getTransactionHistory(f);
}

function getDispatchRecords(filters) {
  var f = filters || {};
  f.txType = 'DISPATCH';
  return getTransactionHistory(f);
}

function getGoodsReceiptRecords(filters) {
  var f = filters || {};
  f.txType = 'GOODS_RECEIPT';
  return getTransactionHistory(f);
}

function getIssueRecords(filters) {
  var f = filters || {};
  f.txType = 'ISSUE';
  return getTransactionHistory(f);
}

/* ==========================================================================
   10. DIRECT GOOGLE SHEETS SYNCHRONIZATION & RECONCILIATION
   ========================================================================== */

function installTriggersInternal_(ss) {
  var existing = ScriptApp.getProjectTriggers();
  for (var i = 0; i < existing.length; i++) {
    var fn = existing[i].getHandlerFunction();
    if (fn === 'handleSpreadsheetEdit' || fn === 'handleSpreadsheetChange' || fn === 'scheduledReconciliation') {
      ScriptApp.deleteTrigger(existing[i]);
    }
  }
  ScriptApp.newTrigger('handleSpreadsheetEdit').forSpreadsheet(ss).onEdit().create();
  ScriptApp.newTrigger('handleSpreadsheetChange').forSpreadsheet(ss).onChange().create();
  ScriptApp.newTrigger('scheduledReconciliation').timeBased().everyMinutes(15).create();
}

function installTriggers() {
  try {
    var actor = assertPermission_('SYNC_ADMIN');
    var ss = getSpreadsheet();
    installTriggersInternal_(ss);
    writeAuditLogInternal_(actor, 'INSTALL_TRIGGERS', 'Synchronization', 'TRIGGERS', 'Installed onEdit, onChange, and 15-min reconciliation triggers', null, null);
    return buildResponse_(true, 'Installable triggers created successfully.');
  } catch (err) {
    return buildResponse_(false, err.message);
  }
}

/**
 * Installable onEdit trigger handler. Handles single-cell edits, multi-row pastes, and cleared cells.
 */
function handleSpreadsheetEdit(e) {
  if (!e || !e.range) return;
  var sheet = e.range.getSheet();
  var sheetName = sheet.getName();

  if (sheetName === CONFIG.SHEETS.ITEM_MASTER) {
    invalidateCaches_();
    bumpDataVersion_();
    return;
  }

  var workingSheets = [
    CONFIG.SHEETS.PRODUCTION,
    CONFIG.SHEETS.DISPATCH,
    CONFIG.SHEETS.GOODS_RECEIPT,
    CONFIG.SHEETS.ISSUE
  ];
  if (workingSheets.indexOf(sheetName) === -1) return;
  if (e.range.getRow() <= 1) return;

  var lock = LockService.getScriptLock();
  try {
    lock.waitLock(CONFIG.LOCK_TIMEOUT_MS);
    var ss = getSpreadsheet();
    syncSingleWorkingSheet_(ss, sheet, sheetName, { email: 'sheet-edit-trigger', role: 'Super Admin' }, e.range.getRow(), e.range.getLastRow());
    invalidateCaches_();
    bumpDataVersion_();
    rebuildAllStockRegistersInternal_(ss);
  } catch (err) {
    logSyncError_(getSpreadsheet(), sheetName, e.range.getRow(), '', {}, err.message);
  } finally {
    lock.releaseLock();
  }
}

function handleSpreadsheetChange(e) {
  if (!e) return;
  if (e.changeType === 'REMOVE_ROW' || e.changeType === 'INSERT_ROW' || e.changeType === 'EDIT') {
    syncWorkingSheets();
  }
}

function scheduledReconciliation() {
  syncWorkingSheets();
}

function logSyncError_(ss, sheetName, rowNumber, itemCode, rawObj, message) {
  try {
    var errSh = ensureSheetWithHeaders_(ss, CONFIG.SHEETS.SYNC_ERRORS, SCHEMAS.SYNC_ERRORS, true);
    var errId = 'ERR-' + Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyyMMdd-HHmmss') + '-' + rowNumber;
    errSh.appendRow([
      errId, nowIso_(), sheetName, rowNumber, itemCode || '',
      JSON.stringify(rawObj || {}), String(message), 'OPEN', '', ''
    ]);
  } catch (e) {}
}

function getOpenSyncErrorsCount_(ss) {
  var sh = ss.getSheetByName(CONFIG.SHEETS.SYNC_ERRORS);
  if (!sh || sh.getLastRow() < 2) return 0;
  var vals = sh.getDataRange().getValues();
  var count = 0;
  for (var i = 1; i < vals.length; i++) {
    if (String(vals[i][7]) === 'OPEN') count++;
  }
  return count;
}

/**
 * Synchronizes a working sheet (or specific row span) with the central ledger idempotently.
 */
function syncSingleWorkingSheet_(ss, sheet, sheetName, actor, startRowOpt, endRowOpt) {
  var stats = { created: 0, updated: 0, cancelled: 0, skipped: 0, errors: 0 };
  if (!sheet || sheet.getLastRow() < 2) return stats;

  var typeMap = {};
  typeMap[CONFIG.SHEETS.PRODUCTION] = 'PRODUCTION';
  typeMap[CONFIG.SHEETS.DISPATCH] = 'DISPATCH';
  typeMap[CONFIG.SHEETS.GOODS_RECEIPT] = 'GOODS_RECEIPT';
  typeMap[CONFIG.SHEETS.ISSUE] = 'ISSUE';
  var txType = typeMap[sheetName];
  if (!txType) return stats;

  var allVals = sheet.getDataRange().getValues();
  var headers = allVals[0];
  var hMap = getHeaderIndexMap_(headers);

  var cId = findCol_(hMap, ['production id', 'dispatch id', 'receipt id', 'issue id', 'transaction id'], 0);
  var cDate = findCol_(hMap, ['production date', 'dispatch date', 'receipt date', 'issue date', 'date'], 1);
  var cCode = findCol_(hMap, ['item code', 'code'], 3);
  var cQty = findCol_(hMap, ['quantity', 'dispatch quantity', 'received quantity', 'issue quantity', 'qty'], txType === 'DISPATCH' ? 8 : 6);
  var cUom = findCol_(hMap, ['uom', 'unit'], txType === 'DISPATCH' ? 9 : 7);
  var cSecQty = txType === 'DISPATCH' ? findCol_(hMap, ['secondary qty (ctn)', 'ctn'], 6) : -1;
  var cIdxQty = txType === 'DISPATCH' ? findCol_(hMap, ['index qty (pkt)', 'pkt'], 7) : -1;
  var cParty = findCol_(hMap, ['customer/party name', 'supplier name', 'department/production section'], txType === 'DISPATCH' ? 13 : 11);
  var cRef = findCol_(hMap, ['production reference', 'challan number', 'purchase reference', 'issue reference'], txType === 'DISPATCH' ? 14 : 12);
  var cBatch = findCol_(hMap, ['batch/lot number'], 11);
  var cRemarks = findCol_(hMap, ['remarks'], txType === 'DISPATCH' ? 17 : (txType === 'PRODUCTION' ? 13 : 15));
  var cStatus = findCol_(hMap, ['status'], headers.length - 2);

  var ledgerSh = ensureSheetWithHeaders_(ss, CONFIG.SHEETS.LEDGER, SCHEMAS.LEDGER, true);
  var ledgerRows = readLedgerRowsInternal_(ss);
  var ledgerById = {};
  for (var L = 0; L < ledgerRows.length; L++) {
    ledgerById[ledgerRows[L].txId] = ledgerRows[L];
  }

  var startR = Math.max(2, startRowOpt || 2);
  var endR = Math.min(allVals.length, endRowOpt || allVals.length);

  for (var r = startR; r <= endR; r++) {
    var row = allVals[r - 1];
    var txId = String(row[cId] || '').trim();
    var itemCode = String(row[cCode] || '').trim();
    var dateVal = row[cDate];
    var qtyVal = row[cQty];
    var uomVal = String(row[cUom] || '').trim();
    var secVal = cSecQty >= 0 ? Number(row[cSecQty] || 0) : 0;
    var idxVal = cIdxQty >= 0 ? Number(row[cIdxQty] || 0) : 0;
    var rowStatus = String(row[cStatus] || 'ACTIVE').trim().toUpperCase() || 'ACTIVE';

    // Handle cleared row if txId existed in ledger
    var isBlank = !itemCode && !dateVal && !qtyVal && secVal === 0 && idxVal === 0;
    if (isBlank) {
      if (txId && ledgerById[txId] && ledgerById[txId].status === 'ACTIVE') {
        ledgerSh.getRange(ledgerById[txId].rowNumber, 23).setValue('CANCELLED');
        ledgerSh.getRange(ledgerById[txId].rowNumber, 22).setValue(nowIso_());
        stats.cancelled++;
      } else {
        stats.skipped++;
      }
      continue;
    }

    if (!txId) {
      txId = generateTransactionIdInternal_(txType, ledgerRows);
      sheet.getRange(r, cId + 1).setValue(txId);
    }

    // Build payload & check hash
    var itemMap = getItemsIndexMap_(false);
    var itemObj = itemMap[itemCode];
    var effectiveUom = uomVal || (itemObj ? itemObj.indexUnit : '');
    var effectiveQty = Number(qtyVal || 0);
    if (txType === 'DISPATCH' && effectiveQty === 0 && (secVal > 0 || idxVal > 0) && itemObj) {
      effectiveQty = roundQty_((secVal * (itemObj.conversionQty || 0)) + idxVal);
      effectiveUom = itemObj.indexUnit;
    }

    var normDate = normalizeDateStr_(dateVal);
    var candidateHash = computeHash_([txId, normDate, itemCode, effectiveQty, effectiveUom, rowStatus]);

    var existingTx = ledgerById[txId];
    if (existingTx && existingTx.recordHash === candidateHash) {
      stats.skipped++;
      continue; // Idempotent skip — already synced!
    }

    try {
      var txInput = {
        txType: txType,
        txDate: normDate,
        itemCode: itemCode,
        quantity: effectiveQty,
        uom: effectiveUom,
        secondaryQty: secVal,
        indexQty: idxVal,
        batchNo: cBatch >= 0 ? String(row[cBatch] || '') : '',
        refNo: cRef >= 0 ? String(row[cRef] || '') : '',
        partyOrSection: cParty >= 0 ? String(row[cParty] || '') : '',
        remarks: cRemarks >= 0 ? String(row[cRemarks] || '') : ''
      };

      var validated = validateTransactionInternal_(ss, txInput, {
        actor: actor,
        excludeTxId: existingTx ? existingTx.txId : null,
        allowInactive: Boolean(existingTx && existingTx.itemCode === itemCode)
      });

      var ts = nowIso_();
      var syncedRow = buildWorkingRowValues_(txId, validated, txInput, actor.displayName || 'Sheet Entry', existingTx ? existingTx.createdAt : ts, rowStatus, 'SYNCED');
      sheet.getRange(r, 1, 1, syncedRow.length).setValues([syncedRow]);

      var newLedgerRow = [
        txId, txType, validated.txDate, validated.item.itemCode, validated.item.itemName,
        validated.item.category, validated.item.brand,
        validated.conversion.enteredQty, validated.conversion.enteredUom, validated.conversion.baseQty,
        validated.direction, sheetName, r,
        txInput.batchNo, txInput.refNo, txInput.partyOrSection,
        '{}', txInput.remarks,
        existingTx ? existingTx.createdBy : (actor.displayName || 'Sheet Entry'),
        existingTx ? existingTx.createdAt : ts,
        actor.displayName || 'Sheet Entry', ts, rowStatus, candidateHash
      ];

      if (existingTx) {
        ledgerSh.getRange(existingTx.rowNumber, 1, 1, newLedgerRow.length).setValues([newLedgerRow]);
        stats.updated++;
      } else {
        ledgerSh.appendRow(newLedgerRow);
        var addedObj = { txId: txId, rowNumber: ledgerSh.getLastRow(), status: rowStatus, recordHash: candidateHash, itemCode: itemCode };
        ledgerRows.push(addedObj);
        ledgerById[txId] = addedObj;
        stats.created++;
      }
    } catch (rowErr) {
      stats.errors++;
      var errCol = headers.length;
      sheet.getRange(r, errCol).setValue('ERROR: ' + rowErr.message);
      logSyncError_(ss, sheetName, r, itemCode, { txId: txId, date: dateVal, qty: qtyVal, uom: uomVal }, rowErr.message);
    }
  }

  return stats;
}

function syncWorkingSheetsInternal_(ss, actor) {
  var total = { created: 0, updated: 0, cancelled: 0, skipped: 0, errors: 0 };
  var names = [CONFIG.SHEETS.PRODUCTION, CONFIG.SHEETS.DISPATCH, CONFIG.SHEETS.GOODS_RECEIPT, CONFIG.SHEETS.ISSUE];
  for (var i = 0; i < names.length; i++) {
    var sh = ss.getSheetByName(names[i]);
    if (!sh) continue;
    var s = syncSingleWorkingSheet_(ss, sh, names[i], actor);
    total.created += s.created;
    total.updated += s.updated;
    total.cancelled += s.cancelled;
    total.skipped += s.skipped;
    total.errors += s.errors;
  }
  return total;
}

function syncWorkingSheets() {
  var lock = LockService.getScriptLock();
  try {
    var actor = resolveCurrentUser_();
    lock.waitLock(CONFIG.LOCK_TIMEOUT_MS);
    var ss = getSpreadsheet();
    var stats = syncWorkingSheetsInternal_(ss, actor);
    invalidateCaches_();
    bumpDataVersion_();
    var recon = rebuildAllStockRegistersInternal_(ss);
    return buildResponse_(true, 'Working sheets synchronized.', { syncStats: stats, reconciliation: recon });
  } catch (err) {
    return buildResponse_(false, err.message);
  } finally {
    lock.releaseLock();
  }
}

function reconcileInventory() {
  var lock = LockService.getScriptLock();
  try {
    var actor = assertPermission_('SYNC_ADMIN');
    lock.waitLock(CONFIG.LOCK_TIMEOUT_MS);
    var ss = getSpreadsheet();
    var syncStats = syncWorkingSheetsInternal_(ss, actor);
    var recon = rebuildAllStockRegistersInternal_(ss);
    invalidateCaches_();
    bumpDataVersion_();
    writeAuditLogInternal_(actor, 'RECONCILE_INVENTORY', 'Synchronization', 'ALL', 'Manual full reconciliation run', null, { syncStats: syncStats, recon: recon });
    return buildResponse_(true, 'Full inventory reconciliation completed.', { syncStats: syncStats, reconciliation: recon });
  } catch (err) {
    return buildResponse_(false, err.message);
  } finally {
    lock.releaseLock();
  }
}

function getSyncStatus() {
  try {
    var ss = getSpreadsheet();
    var sh = ss.getSheetByName(CONFIG.SHEETS.SYNC_ERRORS);
    var errors = [];
    if (sh && sh.getLastRow() >= 2) {
      var vals = sh.getDataRange().getValues();
      for (var i = vals.length - 1; i >= 1; i--) {
        if (String(vals[i][7]) === 'OPEN') {
          errors.push({
            rowNumber: i + 1,
            errorId: String(vals[i][0]),
            timestamp: String(vals[i][1]),
            sheetName: String(vals[i][2]),
            sheetRow: Number(vals[i][3]),
            itemCode: String(vals[i][4]),
            message: String(vals[i][6]),
            status: String(vals[i][7])
          });
        }
        if (errors.length >= 100) break;
      }
    }
    return buildResponse_(true, 'Sync status retrieved.', {
      lastSyncAt: PropertiesService.getScriptProperties().getProperty('ERP_LAST_SYNC_AT') || nowIso_(),
      dataVersion: getDataVersion_(),
      openErrorCount: errors.length,
      errors: errors
    });
  } catch (err) {
    return buildResponse_(false, err.message);
  }
}

function resolveSyncError(errorId) {
  var lock = LockService.getScriptLock();
  try {
    var actor = assertPermission_('SYNC_ADMIN');
    lock.waitLock(CONFIG.LOCK_TIMEOUT_MS);
    var ss = getSpreadsheet();
    var sh = ss.getSheetByName(CONFIG.SHEETS.SYNC_ERRORS);
    if (!sh || sh.getLastRow() < 2) throw new Error('No sync errors found.');
    var vals = sh.getDataRange().getValues();
    for (var i = 1; i < vals.length; i++) {
      if (String(vals[i][0]) === String(errorId)) {
        sh.getRange(i + 1, 8, 1, 3).setValues([['RESOLVED', actor.displayName, nowIso_()]]);
        bumpDataVersion_();
        return buildResponse_(true, 'Sync error marked resolved.');
      }
    }
    return buildResponse_(false, 'Sync error ID not found.');
  } catch (err) {
    return buildResponse_(false, err.message);
  } finally {
    lock.releaseLock();
  }
}

/* ==========================================================================
   11. STOCK REGISTERS & ALL STOCK BALANCE (LEDGER-DERIVED)
   ========================================================================== */

function writeSheetMatrixClean_(sh, headers, rows) {
  var maxRows = sh.getMaxRows();
  if (maxRows > 1) {
    sh.getRange(2, 1, maxRows - 1, Math.max(sh.getLastColumn(), headers.length)).clearContent();
  }
  sh.getRange(1, 1, 1, headers.length).setValues([headers])
    .setFontWeight('bold')
    .setBackground('#0F172A')
    .setFontColor('#FFFFFF');
  sh.setFrozenRows(1);
  if (rows.length > 0) {
    sh.getRange(2, 1, rows.length, headers.length).setValues(rows);
  }
}

/**
 * Rebuilds Finished Goods, Raw Material, Packing Material, and All Stock Balance sheets in batch.
 */
function rebuildAllStockRegistersInternal_(ss) {
  var stockMap = calculateStockMapInternal_(ss, null, null);
  var ledger = readLedgerRowsInternal_(ss);

  var fgRows = [];
  var rmRows = [];
  var pmRows = [];
  var allRows = [];

  var prodMap = {};
  var dispMap = {};
  var recMap = {};
  var issMap = {};
  var openMap = {};

  for (var i = 0; i < ledger.length; i++) {
    var tx = ledger[i];
    if (tx.status !== 'ACTIVE') continue;
    var q = roundQty_(tx.baseQty);
    if (tx.txType === 'PRODUCTION') prodMap[tx.itemCode] = roundQty_((prodMap[tx.itemCode] || 0) + q);
    else if (tx.txType === 'DISPATCH') dispMap[tx.itemCode] = roundQty_((dispMap[tx.itemCode] || 0) + q);
    else if (tx.txType === 'GOODS_RECEIPT') recMap[tx.itemCode] = roundQty_((recMap[tx.itemCode] || 0) + q);
    else if (tx.txType === 'ISSUE') issMap[tx.itemCode] = roundQty_((issMap[tx.itemCode] || 0) + q);
    else if (tx.txType === 'OPENING_STOCK') openMap[tx.itemCode] = roundQty_((openMap[tx.itemCode] || 0) + q);
  }

  var codes = Object.keys(stockMap).sort();
  for (var k = 0; k < codes.length; k++) {
    var entry = stockMap[codes[k]];
    var it = entry.item;
    if (it.status !== 'Active' && entry.totalIn === 0 && entry.totalOut === 0) continue;

    var dualText = it.conversionUnit && it.conversionQty > 0 ? formatDualUOM_(it, entry.closing) : '-';
    var openVal = openMap[it.itemCode] || 0;
    var statusLabel = entry.closing <= 0 ? 'OUT OF STOCK' : (it.reorderLevel > 0 && entry.closing <= it.reorderLevel ? 'LOW STOCK' : 'IN STOCK');

    if (it.category === 'Finished Goods') {
      fgRows.push([
        it.itemName, it.itemCode, it.brand, openVal,
        prodMap[it.itemCode] || 0, dispMap[it.itemCode] || 0,
        entry.closing, it.indexUnit, dualText
      ]);
      allRows.push([
        'A. FINISHED GOODS', it.itemName, it.itemCode, it.brand, it.category,
        it.indexUnit, openVal, entry.totalIn, entry.totalOut, entry.closing,
        dualText, it.reorderLevel, statusLabel
      ]);
    } else if (it.category === 'Raw Material') {
      rmRows.push([
        it.itemName, it.itemCode, it.brand, openVal,
        recMap[it.itemCode] || 0, issMap[it.itemCode] || 0,
        entry.closing, it.indexUnit
      ]);
      allRows.push([
        'B. RAW MATERIAL', it.itemName, it.itemCode, it.brand, it.category,
        it.indexUnit, openVal, entry.totalIn, entry.totalOut, entry.closing,
        dualText, it.reorderLevel, statusLabel
      ]);
    } else if (it.category === 'Packing Material') {
      pmRows.push([
        it.itemName, it.itemCode, it.brand, openVal,
        recMap[it.itemCode] || 0, issMap[it.itemCode] || 0,
        entry.closing, it.indexUnit, dualText
      ]);
      allRows.push([
        'C. PACKING MATERIAL', it.itemName, it.itemCode, it.brand, it.category,
        it.indexUnit, openVal, entry.totalIn, entry.totalOut, entry.closing,
        dualText, it.reorderLevel, statusLabel
      ]);
    } else {
      allRows.push([
        'D. ' + it.category.toUpperCase(), it.itemName, it.itemCode, it.brand, it.category,
        it.indexUnit, openVal, entry.totalIn, entry.totalOut, entry.closing,
        dualText, it.reorderLevel, statusLabel
      ]);
    }
  }

  writeSheetMatrixClean_(ensureSheetWithHeaders_(ss, CONFIG.SHEETS.FINISHED_GOODS, SCHEMAS.FINISHED_GOODS, false), SCHEMAS.FINISHED_GOODS, fgRows);
  writeSheetMatrixClean_(ensureSheetWithHeaders_(ss, CONFIG.SHEETS.RAW_MATERIAL, SCHEMAS.RAW_MATERIAL, false), SCHEMAS.RAW_MATERIAL, rmRows);
  writeSheetMatrixClean_(ensureSheetWithHeaders_(ss, CONFIG.SHEETS.PACKING_MATERIAL, SCHEMAS.PACKING_MATERIAL, false), SCHEMAS.PACKING_MATERIAL, pmRows);
  writeSheetMatrixClean_(ensureSheetWithHeaders_(ss, CONFIG.SHEETS.ALL_STOCK_BALANCE, SCHEMAS.ALL_STOCK_BALANCE, false), SCHEMAS.ALL_STOCK_BALANCE, allRows);

  return {
    finishedGoodsCount: fgRows.length,
    rawMaterialCount: rmRows.length,
    packingMaterialCount: pmRows.length,
    totalBalanceRows: allRows.length
  };
}

/**
 * Builds stock register view for a specific category and optional date/month/year filters.
 */
function buildCategoryRegister_(category, filters) {
  var ss = getSpreadsheet();
  var items = loadItemsInternal_(false);
  var ledger = readLedgerRowsInternal_(ss);
  var f = filters || {};

  // Determine reporting period window
  var targetDate = f.date ? normalizeDateStr_(f.date) : '';
  var monthFilter = f.month ? String(f.month).padStart(2, '0') : '';
  var yearFilter = f.year ? String(f.year) : '';

  var startDate = '';
  var endDate = '';
  if (targetDate) {
    startDate = targetDate;
    endDate = targetDate;
  } else if (yearFilter && monthFilter) {
    startDate = yearFilter + '-' + monthFilter + '-01';
    var lastDay = new Date(Number(yearFilter), Number(monthFilter), 0).getDate();
    endDate = yearFilter + '-' + monthFilter + '-' + ('0' + lastDay).slice(-2);
  } else if (yearFilter) {
    startDate = yearFilter + '-01-01';
    endDate = yearFilter + '-12-31';
  }

  var map = {};
  for (var i = 0; i < items.length; i++) {
    var it = items[i];
    if (category && it.category !== category) continue;
    if (f.brand && it.brand !== f.brand) continue;
    if (f.itemCode && it.itemCode !== f.itemCode) continue;
    if (f.query) {
      var q = String(f.query).toLowerCase();
      if (it.itemCode.toLowerCase().indexOf(q) === -1 && it.itemName.toLowerCase().indexOf(q) === -1) continue;
    }
    if (it.status !== 'Active' && !f.includeInactive) {
      // Include inactive only if it has ledger activity
      map[it.itemCode] = { item: it, opening: 0, stockIn: 0, stockOut: 0, closing: 0, hasTx: false };
    } else {
      map[it.itemCode] = { item: it, opening: 0, stockIn: 0, stockOut: 0, closing: 0, hasTx: true };
    }
  }

  for (var j = 0; j < ledger.length; j++) {
    var tx = ledger[j];
    if (tx.status !== 'ACTIVE') continue;
    var rec = map[tx.itemCode];
    if (!rec) continue;
    rec.hasTx = true;
    var qty = roundQty_(tx.baseQty);
    var isIn = tx.direction === 'IN';

    if (startDate && endDate) {
      if (tx.txDate < startDate) {
        rec.opening = roundQty_(rec.opening + (isIn ? qty : -qty));
      } else if (tx.txDate >= startDate && tx.txDate <= endDate) {
        if (isIn) rec.stockIn = roundQty_(rec.stockIn + qty);
        else rec.stockOut = roundQty_(rec.stockOut + qty);
      }
    } else {
      if (tx.txType === 'OPENING_STOCK') {
        rec.opening = roundQty_(rec.opening + qty);
      } else if (isIn) {
        rec.stockIn = roundQty_(rec.stockIn + qty);
      } else {
        rec.stockOut = roundQty_(rec.stockOut + qty);
      }
    }
  }

  var rows = [];
  var keys = Object.keys(map).sort();
  for (var k = 0; k < keys.length; k++) {
    var entry = map[keys[k]];
    if (!entry.hasTx && entry.item.status !== 'Active') continue;
    entry.closing = roundQty_(entry.opening + entry.stockIn - entry.stockOut);
    var dual = decomposeToDualUOM_(entry.item, entry.closing);
    var status = entry.closing <= 0 ? 'Out of Stock' :
                 (entry.item.reorderLevel > 0 && entry.closing <= entry.item.reorderLevel ? 'Low Stock' : 'In Stock');
    rows.push({
      itemCode: entry.item.itemCode,
      itemName: entry.item.itemName,
      category: entry.item.category,
      brand: entry.item.brand,
      indexUnit: entry.item.indexUnit,
      conversionUnit: entry.item.conversionUnit,
      conversionQty: entry.item.conversionQty,
      openingStock: entry.opening,
      stockIn: entry.stockIn,
      stockOut: entry.stockOut,
      closingStock: entry.closing,
      dualDisplay: dual.display,
      secondaryQty: dual.secondaryQty,
      remainderQty: dual.remainderQty,
      hasSecondary: dual.hasSecondary,
      reorderLevel: entry.item.reorderLevel,
      stockStatus: status
    });
  }
  return rows;
}

function getFinishedGoodsStock(filters) {
  try {
    assertPermission_('STOCK_VIEW');
    return buildResponse_(true, 'Finished Goods stock register loaded.', {
      rows: buildCategoryRegister_('Finished Goods', filters)
    });
  } catch (err) {
    return buildResponse_(false, err.message);
  }
}

function getRawMaterialStock(filters) {
  try {
    assertPermission_('STOCK_VIEW');
    return buildResponse_(true, 'Raw Material stock register loaded.', {
      rows: buildCategoryRegister_('Raw Material', filters)
    });
  } catch (err) {
    return buildResponse_(false, err.message);
  }
}

function getPackingMaterialStock(filters) {
  try {
    assertPermission_('STOCK_VIEW');
    return buildResponse_(true, 'Packing Material stock register loaded.', {
      rows: buildCategoryRegister_('Packing Material', filters)
    });
  } catch (err) {
    return buildResponse_(false, err.message);
  }
}

function getAllStockBalance(filters) {
  try {
    assertPermission_('STOCK_VIEW');
    var f = filters || {};
    var rows = buildCategoryRegister_(f.category || null, f);
    var sections = {
      finishedGoods: rows.filter(function (r) { return r.category === 'Finished Goods'; }),
      rawMaterial: rows.filter(function (r) { return r.category === 'Raw Material'; }),
      packingMaterial: rows.filter(function (r) { return r.category === 'Packing Material'; }),
      others: rows.filter(function (r) {
        return r.category !== 'Finished Goods' && r.category !== 'Raw Material' && r.category !== 'Packing Material';
      })
    };
    return buildResponse_(true, 'All Stock Balance loaded.', { rows: rows, sections: sections });
  } catch (err) {
    return buildResponse_(false, err.message);
  }
}

function getStockByItem(itemCode) {
  try {
    var ss = getSpreadsheet();
    var stockMap = calculateStockMapInternal_(ss, null, null);
    var rec = stockMap[String(itemCode || '').trim()];
    if (!rec) return buildResponse_(false, 'Item not found.');
    var dual = decomposeToDualUOM_(rec.item, rec.closing);
    return buildResponse_(true, 'Item stock retrieved.', {
      itemCode: rec.item.itemCode,
      itemName: rec.item.itemName,
      category: rec.item.category,
      closingStock: rec.closing,
      indexUnit: rec.item.indexUnit,
      dualDisplay: dual.display,
      secondaryQty: dual.secondaryQty,
      remainderQty: dual.remainderQty,
      reorderLevel: rec.item.reorderLevel
    });
  } catch (err) {
    return buildResponse_(false, err.message);
  }
}

function getStockMovement(itemCode, startDate, endDate) {
  return getTransactionHistory({
    itemCode: itemCode,
    startDate: startDate,
    endDate: endDate,
    status: 'ACTIVE',
    pageSize: 200
  });
}

function getLowStockItems() {
  try {
    var rows = buildCategoryRegister_(null, {});
    var low = rows.filter(function (r) {
      return r.reorderLevel > 0 && r.closingStock <= r.reorderLevel;
    });
    return buildResponse_(true, 'Low stock items loaded.', { items: low });
  } catch (err) {
    return buildResponse_(false, err.message);
  }
}

/* ==========================================================================
   12. DAILY STOCK REPORT & IMMUTABLE HISTORICAL SNAPSHOTS
   ========================================================================== */

function computeDailyReportSnapshot_(reportDate) {
  var d = normalizeDateStr_(reportDate) || todayDateStr_();
  var ss = getSpreadsheet();
  var ledger = readLedgerRowsInternal_(ss);

  var fg = buildCategoryRegister_('Finished Goods', { date: d });
  var rm = buildCategoryRegister_('Raw Material', { date: d });
  var pm = buildCategoryRegister_('Packing Material', { date: d });
  var all = fg.concat(rm).concat(pm);

  var inTxCount = 0;
  var outTxCount = 0;
  for (var i = 0; i < ledger.length; i++) {
    if (ledger[i].status !== 'ACTIVE' || ledger[i].txDate !== d) continue;
    if (ledger[i].direction === 'IN') inTxCount++;
    else outTxCount++;
  }

  var belowReorder = 0;
  var zeroBal = 0;
  for (var j = 0; j < all.length; j++) {
    if (all[j].closingStock <= 0) zeroBal++;
    if (all[j].reorderLevel > 0 && all[j].closingStock <= all[j].reorderLevel) belowReorder++;
  }

  function sumByUnit_(list) {
    var units = {};
    for (var x = 0; x < list.length; x++) {
      var u = list[x].indexUnit || 'Unit';
      units[u] = roundQty_((units[u] || 0) + list[x].closingStock);
    }
    return units;
  }

  return {
    reportDate: d,
    generatedAt: nowIso_(),
    finishedGoods: fg,
    rawMaterial: rm,
    packingMaterial: pm,
    summary: {
      totalActiveItems: all.length,
      stockInTransactions: inTxCount,
      stockOutTransactions: outTxCount,
      belowReorderCount: belowReorder,
      zeroBalanceCount: zeroBal,
      categoryUnitTotals: {
        finishedGoods: sumByUnit_(fg),
        rawMaterial: sumByUnit_(rm),
        packingMaterial: sumByUnit_(pm)
      }
    }
  };
}

function generateDailyStockReport(reportDate) {
  try {
    assertPermission_('REPORT_GENERATE');
    var d = normalizeDateStr_(reportDate) || todayDateStr_();
    var snapshot = computeDailyReportSnapshot_(d);

    // Check if an immutable submitted snapshot exists for this date
    var ss = getSpreadsheet();
    var repSh = ss.getSheetByName(CONFIG.SHEETS.DAILY_REPORTS);
    var submittedInfo = null;
    if (repSh && repSh.getLastRow() >= 2) {
      var vals = repSh.getDataRange().getValues();
      for (var i = vals.length - 1; i >= 1; i--) {
        if (normalizeDateStr_(vals[i][1]) === d && String(vals[i][10]) === 'SUBMITTED') {
          submittedInfo = {
            reportId: String(vals[i][0]),
            submittedBy: String(vals[i][2]),
            submittedAt: String(vals[i][3])
          };
          break;
        }
      }
    }
    snapshot.submittedInfo = submittedInfo;
    return buildResponse_(true, 'Daily Stock Report generated for ' + d + '.', snapshot);
  } catch (err) {
    return buildResponse_(false, err.message);
  }
}

function submitDailyReport(reportDate) {
  var lock = LockService.getScriptLock();
  try {
    var actor = assertPermission_('REPORT_SUBMIT');
    lock.waitLock(CONFIG.LOCK_TIMEOUT_MS);

    var d = normalizeDateStr_(reportDate) || todayDateStr_();
    var ss = getSpreadsheet();
    var sh = ensureSheetWithHeaders_(ss, CONFIG.SHEETS.DAILY_REPORTS, SCHEMAS.DAILY_REPORTS, true);

    var snapshot = computeDailyReportSnapshot_(d);
    var reportId = 'DSR-' + d.replace(/-/g, '') + '-' + Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'HHmmss');
    var ts = nowIso_();

    sh.appendRow([
      reportId,
      d,
      actor.displayName,
      ts,
      snapshot.summary.totalActiveItems,
      snapshot.summary.stockInTransactions,
      snapshot.summary.stockOutTransactions,
      snapshot.summary.belowReorderCount,
      snapshot.summary.zeroBalanceCount,
      JSON.stringify(snapshot),
      'SUBMITTED'
    ]);

    bumpDataVersion_();
    writeAuditLogInternal_(actor, 'SUBMIT_DAILY_REPORT', 'Reporting', reportId, 'Submitted immutable report for ' + d, null, snapshot.summary);

    return buildResponse_(true, 'Daily Stock Report ' + reportId + ' submitted and locked.', {
      reportId: reportId,
      reportDate: d,
      submittedBy: actor.displayName,
      submittedAt: ts
    });
  } catch (err) {
    return buildResponse_(false, err.message);
  } finally {
    lock.releaseLock();
  }
}

function getHistoricalReport(reportDate) {
  try {
    assertPermission_('REPORT_GENERATE');
    var ss = getSpreadsheet();
    var sh = ss.getSheetByName(CONFIG.SHEETS.DAILY_REPORTS);
    var history = [];
    var target = reportDate ? normalizeDateStr_(reportDate) : '';
    var matchedSnapshot = null;

    if (sh && sh.getLastRow() >= 2) {
      var vals = sh.getDataRange().getValues();
      for (var i = vals.length - 1; i >= 1; i--) {
        var rDate = normalizeDateStr_(vals[i][1]);
        var item = {
          reportId: String(vals[i][0]),
          reportDate: rDate,
          submittedBy: String(vals[i][2]),
          submittedAt: String(vals[i][3]),
          totalActiveItems: Number(vals[i][4] || 0),
          stockInTransactions: Number(vals[i][5] || 0),
          stockOutTransactions: Number(vals[i][6] || 0),
          belowReorderCount: Number(vals[i][7] || 0),
          zeroBalanceCount: Number(vals[i][8] || 0),
          status: String(vals[i][10])
        };
        history.push(item);
        if (target && rDate === target && !matchedSnapshot) {
          matchedSnapshot = JSON.parse(String(vals[i][9] || '{}'));
          matchedSnapshot.submittedInfo = item;
        }
      }
    }

    if (target && !matchedSnapshot) {
      // Dynamic historical calculation strictly up to target date (Test 14)
      matchedSnapshot = computeDailyReportSnapshot_(target);
    }

    return buildResponse_(true, 'Historical report data retrieved.', {
      history: history.slice(0, 50),
      snapshot: matchedSnapshot
    });
  } catch (err) {
    return buildResponse_(false, err.message);
  }
}

function exportReport(reportDate, format) {
  try {
    assertPermission_('REPORT_GENERATE');
    var d = normalizeDateStr_(reportDate) || todayDateStr_();
    var snap = computeDailyReportSnapshot_(d);

    function xmlEsc(v) {
      return String(v === null || v === undefined ? '' : v)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;');
    }

    function buildWorksheet(sheetName, title, inCol, outCol, list) {
      var rows = [
        ['Birat Healthcare Industries Pvt. Ltd. - ' + title],
        ['Report Date', d, 'Generated At', snap.generatedAt],
        [],
        ['Item Code', 'Item Name', 'Brand', 'Opening Stock', inCol, outCol, 'Closing Stock', 'Index Unit', 'Secondary Unit Balance']
      ];
      for (var i = 0; i < list.length; i++) {
        var r = list[i];
        rows.push([
          r.itemCode, r.itemName, r.brand || '', r.openingStock,
          r.stockIn, r.stockOut, r.closingStock, r.indexUnit, r.dualDisplay
        ]);
      }
      var xml = '<Worksheet ss:Name="' + xmlEsc(sheetName) + '"><Table>';
      for (var rIdx = 0; rIdx < rows.length; rIdx++) {
        xml += '<Row>';
        for (var cIdx = 0; cIdx < rows[rIdx].length; cIdx++) {
          var cell = rows[rIdx][cIdx];
          var isNum = typeof cell === 'number' && !isNaN(cell);
          xml += '<Cell><Data ss:Type="' + (isNum ? 'Number' : 'String') + '">' + xmlEsc(cell) + '</Data></Cell>';
        }
        xml += '</Row>';
      }
      xml += '</Table></Worksheet>';
      return xml;
    }

    var xlsXml = '<?xml version="1.0" encoding="UTF-8"?><?mso-application progid="Excel.Sheet"?>' +
      '<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">' +
      buildWorksheet('Finished Goods', 'Daily Stock Report (Finished Goods)', 'Production', 'Dispatch', snap.finishedGoods) +
      buildWorksheet('Raw Material', 'Daily Stock Report (Raw Material)', 'Receipt', 'Issue', snap.rawMaterial) +
      buildWorksheet('Packing Material', 'Daily Stock Report (Packing Material)', 'Receipt', 'Issue', snap.packingMaterial) +
      '</Workbook>';

    return buildResponse_(true, 'Excel export prepared.', {
      filename: 'Birat_Daily_Stock_Report_' + d + '.xls',
      xlsContent: xlsXml,
      snapshot: snap
    });
  } catch (err) {
    return buildResponse_(false, err.message);
  }
}

/* ==========================================================================
   13. DASHBOARD ANALYTICS (LIVE DATABASE AGGREGATION)
   ========================================================================== */

function getDashboardData() {
  try {
    assertPermission_('STOCK_VIEW');
    var ss = getSpreadsheet();
    var items = loadItemsInternal_(false);
    var ledger = readLedgerRowsInternal_(ss);
    var allStock = buildCategoryRegister_(null, {});
    var today = todayDateStr_();
    var openErrors = getOpenSyncErrorsCount_(ss);

    var activeItems = items.filter(function (it) { return it.status === 'Active'; }).length;

    var fgBal = 0, rmBal = 0, pmBal = 0, lowStockCount = 0;
    var catSummary = {};
    for (var i = 0; i < allStock.length; i++) {
      var r = allStock[i];
      if (r.category === 'Finished Goods') fgBal = roundQty_(fgBal + r.closingStock);
      else if (r.category === 'Raw Material') rmBal = roundQty_(rmBal + r.closingStock);
      else if (r.category === 'Packing Material') pmBal = roundQty_(pmBal + r.closingStock);
      if (r.reorderLevel > 0 && r.closingStock <= r.reorderLevel) lowStockCount++;
      catSummary[r.category] = roundQty_((catSummary[r.category] || 0) + r.closingStock);
    }

    var todayProd = 0, todayRec = 0, todayDisp = 0, todayIss = 0;

    // 14-day daily trend & 6-month movement buckets
    var last14 = {};
    var todayObj = new Date();
    for (var d = 13; d >= 0; d--) {
      var dt = new Date(todayObj.getTime() - d * 86400000);
      var ds = Utilities.formatDate(dt, CONFIG.TIMEZONE, CONFIG.DATE_FORMAT);
      last14[ds] = { prod: 0, disp: 0, rec: 0, iss: 0 };
    }
    var monthly = {};

    var activeLedger = [];
    for (var j = 0; j < ledger.length; j++) {
      var tx = ledger[j];
      if (tx.status !== 'ACTIVE') continue;
      activeLedger.push(tx);
      var q = roundQty_(tx.baseQty);

      if (tx.txDate === today) {
        if (tx.txType === 'PRODUCTION') todayProd = roundQty_(todayProd + q);
        else if (tx.txType === 'GOODS_RECEIPT') todayRec = roundQty_(todayRec + q);
        else if (tx.txType === 'DISPATCH') todayDisp = roundQty_(todayDisp + q);
        else if (tx.txType === 'ISSUE') todayIss = roundQty_(todayIss + q);
      }

      if (last14[tx.txDate]) {
        if (tx.txType === 'PRODUCTION') last14[tx.txDate].prod = roundQty_(last14[tx.txDate].prod + q);
        else if (tx.txType === 'DISPATCH') last14[tx.txDate].disp = roundQty_(last14[tx.txDate].disp + q);
        else if (tx.txType === 'GOODS_RECEIPT') last14[tx.txDate].rec = roundQty_(last14[tx.txDate].rec + q);
        else if (tx.txType === 'ISSUE') last14[tx.txDate].iss = roundQty_(last14[tx.txDate].iss + q);
      }

      var ym = tx.txDate ? tx.txDate.slice(0, 7) : '';
      if (ym) {
        if (!monthly[ym]) monthly[ym] = { stockIn: 0, stockOut: 0 };
        if (tx.direction === 'IN') monthly[ym].stockIn = roundQty_(monthly[ym].stockIn + q);
        else monthly[ym].stockOut = roundQty_(monthly[ym].stockOut + q);
      }
    }

    // Top 10 stock items & Low stock items
    var top10 = allStock.slice().sort(function (a, b) { return b.closingStock - a.closingStock; }).slice(0, 10);
    var lowList = allStock.filter(function (r) { return r.reorderLevel > 0 && r.closingStock <= r.reorderLevel; }).slice(0, 10);

    // Recent 15 ledger activities (including cancelled for full visibility)
    var recent = ledger.slice().sort(function (a, b) {
      return b.createdAt.localeCompare(a.createdAt);
    }).slice(0, 15);

    return buildResponse_(true, 'Dashboard data loaded.', {
      cards: {
        totalActiveItems: activeItems,
        finishedGoodsBalance: fgBal,
        rawMaterialBalance: rmBal,
        packingMaterialBalance: pmBal,
        todayProduction: todayProd,
        todayGoodsReceipt: todayRec,
        todayDispatch: todayDisp,
        todayIssue: todayIss,
        lowStockItems: lowStockCount,
        pendingSyncErrors: openErrors
      },
      charts: {
        dailyTrendLabels: Object.keys(last14),
        dailyProduction: Object.keys(last14).map(function (k) { return last14[k].prod; }),
        dailyDispatch: Object.keys(last14).map(function (k) { return last14[k].disp; }),
        dailyReceipt: Object.keys(last14).map(function (k) { return last14[k].rec; }),
        dailyIssue: Object.keys(last14).map(function (k) { return last14[k].iss; }),
        categorySummary: catSummary,
        top10Items: top10.map(function (x) { return { name: x.itemName, code: x.itemCode, qty: x.closingStock, unit: x.indexUnit }; }),
        lowStockAnalysis: lowList.map(function (x) { return { name: x.itemName, code: x.itemCode, current: x.closingStock, reorder: x.reorderLevel }; }),
        monthlyLabels: Object.keys(monthly).sort().slice(-6),
        monthlyMovement: monthly
      },
      recentActivity: recent
    });
  } catch (err) {
    return buildResponse_(false, err.message);
  }
}

/* ==========================================================================
   14. AUDIT LOGGING
   ========================================================================== */

function writeAuditLogInternal_(actor, action, moduleName, targetId, summary, beforeObj, afterObj) {
  try {
    var ss = getSpreadsheet();
    var sh = ensureSheetWithHeaders_(ss, CONFIG.SHEETS.AUDIT_LOG, SCHEMAS.AUDIT_LOG, true);
    var auditId = 'AUD-' + Utilities.formatDate(new Date(), CONFIG.TIMEZONE, 'yyyyMMdd-HHmmss') + '-' + Math.floor(Math.random() * 900 + 100);
    sh.appendRow([
      auditId,
      nowIso_(),
      actor ? (actor.displayName || actor.email || 'System') : 'System',
      actor ? (actor.role || 'System') : 'System',
      action,
      moduleName,
      targetId || '',
      summary || '',
      beforeObj ? JSON.stringify(beforeObj).slice(0, 4000) : '',
      afterObj ? JSON.stringify(afterObj).slice(0, 4000) : ''
    ]);
  } catch (e) {}
}

function writeAuditLog(action, moduleName, targetId, summary, beforeObj, afterObj) {
  var actor = resolveCurrentUser_();
  writeAuditLogInternal_(actor, action, moduleName, targetId, summary, beforeObj, afterObj);
  return buildResponse_(true, 'Audit log recorded.');
}

function getAuditLogs(limit) {
  try {
    assertPermission_('AUDIT_VIEW');
    var ss = getSpreadsheet();
    var sh = ss.getSheetByName(CONFIG.SHEETS.AUDIT_LOG);
    if (!sh || sh.getLastRow() < 2) return buildResponse_(true, 'No audit logs.', { logs: [] });
    var vals = sh.getDataRange().getValues();
    var max = Number(limit || 100);
    var logs = [];
    for (var i = vals.length - 1; i >= 1; i--) {
      logs.push({
        auditId: String(vals[i][0]),
        timestamp: String(vals[i][1]),
        user: String(vals[i][2]),
        role: String(vals[i][3]),
        action: String(vals[i][4]),
        module: String(vals[i][5]),
        targetId: String(vals[i][6]),
        summary: String(vals[i][7])
      });
      if (logs.length >= max) break;
    }
    return buildResponse_(true, 'Audit logs retrieved.', { logs: logs });
  } catch (err) {
    return buildResponse_(false, err.message);
  }
}

/* ==========================================================================
   15. WEB APP ENTRYPOINT (HTML SERVICE)
   ========================================================================== */

function doGet(e) {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle(CONFIG.COMPANY_NAME + ' — Operations & Inventory ERP')
    .setXFrameOptionsMode(HtmlService.XFrameOptionsMode.ALLOWALL)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function include(filename) {
  return HtmlService.createHtmlOutputFromFile(filename).getContent();
}

/* ==========================================================================
   16. PROCUREMENT & TENDER MODULE (DEDICATED SPREADSHEET DATABASE)
   ========================================================================== */

function procAssertSheetName_(sheetName) {
  if (!PROCUREMENT_SCHEMAS[sheetName]) {
    throw new Error('Invalid Procurement & Tender sheet: ' + sheetName);
  }
}

function procFormatHeaderRow_(sheet, colCount) {
  var headerRange = sheet.getRange(1, 1, 1, colCount);
  headerRange.setBackground('#0F172A')
    .setFontColor('#FFFFFF')
    .setFontWeight('bold')
    .setFontSize(10);
  sheet.setFrozenRows(1);
}

function procEnsureSheet_(ss, sheetName) {
  procAssertSheetName_(sheetName);
  var headers = PROCUREMENT_SCHEMAS[sheetName];
  var sheet = ss.getSheetByName(sheetName);
  if (!sheet) {
    sheet = ss.insertSheet(sheetName);
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    procFormatHeaderRow_(sheet, headers.length);
  } else if (sheet.getLastRow() === 0) {
    sheet.getRange(1, 1, 1, headers.length).setValues([headers]);
    procFormatHeaderRow_(sheet, headers.length);
  }
  return sheet;
}

function procSetupDatabaseInternal_() {
  var ss = getProcurementSpreadsheet();
  var sheetsVerified = [];
  for (var sheetName in PROCUREMENT_SCHEMAS) {
    if (PROCUREMENT_SCHEMAS.hasOwnProperty(sheetName)) {
      procEnsureSheet_(ss, sheetName);
      sheetsVerified.push(sheetName);
    }
  }
  procSeedInitialData_(ss);
  return {
    spreadsheetId: ss.getId(),
    spreadsheetName: ss.getName(),
    spreadsheetUrl: ss.getUrl(),
    sheetsVerified: sheetsVerified
  };
}

function procSetupDatabase() {
  var lock = LockService.getScriptLock();
  try {
    assertPermission_('PROCUREMENT_VIEW');
    lock.waitLock(CONFIG.LOCK_TIMEOUT_MS);
    var res = procSetupDatabaseInternal_();
    procLogAudit_('SYSTEM_SETUP', 'ProcurementDB', res.spreadsheetId, 'Procurement & Tender sheets verified');
    return buildResponse_(true, 'Procurement & Tender database initialized (' + res.sheetsVerified.length + ' sheets verified).', res);
  } catch (err) {
    return buildResponse_(false, 'Procurement DB setup error: ' + err.message);
  } finally {
    lock.releaseLock();
  }
}

function procSeedInitialData_(ss) {
  var ts = new Date().toISOString();

  var settingsSheet = ss.getSheetByName('Settings');
  if (settingsSheet && settingsSheet.getLastRow() <= 1) {
    var defaultSettings = [
      ['COMPANY_NAME', CONFIG.COMPANY_NAME, 'Company Legal Name', ts],
      ['BASE_CURRENCY', 'NPR', 'Base Financial Currency', ts],
      ['EXCHANGE_RATE_USD', String(CONFIG.DEFAULT_EXCHANGE_RATES.USD), 'USD to NPR Exchange Rate', ts],
      ['EXCHANGE_RATE_INR', String(CONFIG.DEFAULT_EXCHANGE_RATES.INR), 'INR to NPR Exchange Rate', ts],
      ['EXCHANGE_RATE_EUR', String(CONFIG.DEFAULT_EXCHANGE_RATES.EUR), 'EUR to NPR Exchange Rate', ts],
      ['EXCHANGE_RATE_GBP', String(CONFIG.DEFAULT_EXCHANGE_RATES.GBP), 'GBP to NPR Exchange Rate', ts],
      ['EXCHANGE_RATE_CNY', String(CONFIG.DEFAULT_EXCHANGE_RATES.CNY), 'CNY to NPR Exchange Rate', ts]
    ];
    settingsSheet.getRange(2, 1, defaultSettings.length, 4).setValues(defaultSettings);
  }

  var fxSheet = procEnsureSheet_(ss, 'ExchangeRates');
  if (fxSheet && fxSheet.getLastRow() <= 1) {
    var baseRates = procGetDefaultExchangeRates_(ss);
    fxSheet.appendRow([
      todayDateStr_(),
      baseRates.USD,
      baseRates.INR,
      baseRates.EUR,
      baseRates.GBP,
      baseRates.CNY,
      1.00,
      'Initial baseline exchange rate',
      'system',
      ts
    ]);
  }

  var supSheet = ss.getSheetByName('Suppliers');
  if (supSheet && supSheet.getLastRow() <= 1) {
    var sampleSuppliers = [
      ['SUP-001', 'Gujarat Organic Chemical Synthetics Ltd.', 'PAN-9920192', 'GSTIN24AAACG1234F1Z5', 'Mr. Amit Patel', '+91-9825012345', 'sales@gujaratchem.in', 'India', 'GIDC Ankleshwar, Gujarat, India', '30 Days TT', 'INR', 21, 4.8, ts],
      ['SUP-002', 'Zhejiang Pharma Corp & Active Ingredients', 'PAN-FOREIGN-01', 'CN-913301007', 'Ms. Chen Wei', '+86-571-88991122', 'export@zhejiangpharma.cn', 'China', 'Binjiang High-Tech Park, Hangzhou, China', 'LC at Sight 60 Days', 'USD', 45, 4.9, ts],
      ['SUP-003', 'Himalayan Packaging & Foil Industries', 'PAN-301298451', 'N/A', 'Dipesh Shrestha', '+977-9851088776', 'info@himalayanpackaging.com.np', 'Nepal', 'Patandhoka Industrial Area, Lalitpur, Nepal', '15 Days Credit', 'NPR', 7, 4.5, ts],
      ['SUP-004', 'Euro-Med Health & Chemical GmbH', 'DE-812345678', 'DE812345678', 'Dr. Klaus Becker', '+49-69-1234567', 'klaus.becker@euromed-pharma.de', 'Germany', 'Industriepark Hoechst, Frankfurt, Germany', '100% Advance TT', 'EUR', 35, 4.7, ts]
    ];
    supSheet.getRange(2, 1, sampleSuppliers.length, 14).setValues(sampleSuppliers);
  }

  var ffSheet = ss.getSheetByName('FreightForwarder');
  if (ffSheet && ffSheet.getLastRow() <= 1) {
    var sampleFF = [
      ['FF-01', 'Trans-Himalayan Logistics & Freight Pvt. Ltd.', 'Birgunj Dry Port Rd & Thamel, KTM', 'Sanjay Gupta', '+977-9855012345', 'sanjay@transhimalaya.com.np', 4.8, 'Expert in Kolkata Port to Birgunj Dry Port transit', ts],
      ['FF-02', 'Everest Express Ocean & Air Cargo', 'Sinamangal Cargo Complex, Kathmandu', 'Pooja Thapa', '+977-9801044556', 'cargo@everestexpress.com', 4.6, 'Reliable for air shipments from Europe & China', ts]
    ];
    ffSheet.getRange(2, 1, sampleFF.length, 9).setValues(sampleFF);
  }
}

function procLogAudit_(action, moduleName, recordId, details, actorEmail) {
  try {
    var ss = getProcurementSpreadsheet();
    var sheet = procEnsureSheet_(ss, 'AuditLog');
    var email = actorEmail;
    if (!email) {
      try { email = Session.getActiveUser().getEmail() || 'system'; } catch (e) { email = 'system'; }
    }
    sheet.appendRow([
      'LOG-' + Utilities.getUuid().substring(0, 8).toUpperCase(),
      new Date().toISOString(),
      email,
      action,
      moduleName,
      recordId || '',
      typeof details === 'object' ? JSON.stringify(details) : String(details || '')
    ]);
  } catch (e) {}
}

function procGetDefaultExchangeRates_(ss) {
  var rates = {
    USD: CONFIG.DEFAULT_EXCHANGE_RATES.USD,
    INR: CONFIG.DEFAULT_EXCHANGE_RATES.INR,
    EUR: CONFIG.DEFAULT_EXCHANGE_RATES.EUR,
    GBP: CONFIG.DEFAULT_EXCHANGE_RATES.GBP,
    CNY: CONFIG.DEFAULT_EXCHANGE_RATES.CNY,
    NPR: 1.00
  };
  try {
    var procSs = ss || getProcurementSpreadsheet();
    var setSheet = procSs.getSheetByName('Settings');
    if (setSheet && setSheet.getLastRow() > 1) {
      var vals = setSheet.getRange(2, 1, setSheet.getLastRow() - 1, 2).getValues();
      var map = {};
      for (var i = 0; i < vals.length; i++) {
        map[String(vals[i][0] || '').trim()] = vals[i][1];
      }
      rates.USD = parseFloat(map['EXCHANGE_RATE_USD']) || rates.USD;
      rates.INR = parseFloat(map['EXCHANGE_RATE_INR']) || rates.INR;
      rates.EUR = parseFloat(map['EXCHANGE_RATE_EUR']) || rates.EUR;
      rates.GBP = parseFloat(map['EXCHANGE_RATE_GBP']) || rates.GBP;
      rates.CNY = parseFloat(map['EXCHANGE_RATE_CNY']) || rates.CNY;
    }
  } catch (e) {}
  return rates;
}

function procGetExchangeRateHistory_(ss) {
  var procSs = ss || getProcurementSpreadsheet();
  var sheet = procEnsureSheet_(procSs, 'ExchangeRates');
  var rows = procGetSheetObjects_(sheet).map(function (r) {
    return {
      RateDate: normalizeDateStr_(r.RateDate) || String(r.RateDate || '').trim(),
      USD: parseFloat(r.USD) || CONFIG.DEFAULT_EXCHANGE_RATES.USD,
      INR: parseFloat(r.INR) || CONFIG.DEFAULT_EXCHANGE_RATES.INR,
      EUR: parseFloat(r.EUR) || CONFIG.DEFAULT_EXCHANGE_RATES.EUR,
      GBP: parseFloat(r.GBP) || CONFIG.DEFAULT_EXCHANGE_RATES.GBP,
      CNY: parseFloat(r.CNY) || CONFIG.DEFAULT_EXCHANGE_RATES.CNY,
      NPR: 1.00,
      Remarks: String(r.Remarks || ''),
      UpdatedBy: String(r.UpdatedBy || ''),
      UpdatedAt: String(r.UpdatedAt || '')
    };
  }).filter(function (r) { return Boolean(r.RateDate); });
  rows.sort(function (a, b) {
    return String(b.RateDate).localeCompare(String(a.RateDate));
  });
  return rows;
}

function procGetExchangeRatesForDate_(ss, dateStr) {
  var procSs = ss || getProcurementSpreadsheet();
  var targetDate = normalizeDateStr_(dateStr) || todayDateStr_();
  var history = procGetExchangeRateHistory_(procSs); // sorted descending by RateDate
  var fallback = procGetDefaultExchangeRates_(procSs);

  for (var i = 0; i < history.length; i++) {
    if (history[i].RateDate === targetDate) {
      return {
        RateDate: targetDate,
        matchedDate: history[i].RateDate,
        source: 'Exact Date',
        USD: history[i].USD,
        INR: history[i].INR,
        EUR: history[i].EUR,
        GBP: history[i].GBP,
        CNY: history[i].CNY,
        NPR: 1.00,
        Remarks: history[i].Remarks
      };
    }
  }

  for (var j = 0; j < history.length; j++) {
    if (history[j].RateDate <= targetDate) {
      return {
        RateDate: targetDate,
        matchedDate: history[j].RateDate,
        source: 'Effective Prior Date',
        USD: history[j].USD,
        INR: history[j].INR,
        EUR: history[j].EUR,
        GBP: history[j].GBP,
        CNY: history[j].CNY,
        NPR: 1.00,
        Remarks: history[j].Remarks
      };
    }
  }

  if (history.length > 0) {
    var earliest = history[history.length - 1];
    return {
      RateDate: targetDate,
      matchedDate: earliest.RateDate,
      source: 'Earliest Configured Date',
      USD: earliest.USD,
      INR: earliest.INR,
      EUR: earliest.EUR,
      GBP: earliest.GBP,
      CNY: earliest.CNY,
      NPR: 1.00,
      Remarks: earliest.Remarks
    };
  }

  return {
    RateDate: targetDate,
    matchedDate: targetDate,
    source: 'Default',
    USD: fallback.USD,
    INR: fallback.INR,
    EUR: fallback.EUR,
    GBP: fallback.GBP,
    CNY: fallback.CNY,
    NPR: 1.00,
    Remarks: ''
  };
}

function procGetExchangeRates_(ss, dateStr) {
  return procGetExchangeRatesForDate_(ss, dateStr);
}

function procGetExchangeRateByDate(dateStr) {
  try {
    var actor = resolveCurrentUser_();
    if (!hasPermission_(actor, 'PROCUREMENT_VIEW') && !hasPermission_(actor, 'STOCK_VIEW')) {
      throw new Error('Access denied: authentication required.');
    }
    var ss = getProcurementSpreadsheet();
    procSeedInitialData_(ss);
    var rateInfo = procGetExchangeRatesForDate_(ss, dateStr);
    return buildResponse_(true, 'Exchange rate resolved for ' + rateInfo.RateDate + '.', {
      rateDate: rateInfo.RateDate,
      exchangeRates: rateInfo
    });
  } catch (err) {
    return buildResponse_(false, err.message);
  }
}

function procConvertToNPR_(amount, currency, rates) {
  var amt = parseFloat(amount) || 0;
  var curr = String(currency || 'NPR').toUpperCase().trim();
  var rate = (rates && rates[curr]) ? rates[curr] : (CONFIG.DEFAULT_EXCHANGE_RATES[curr] || 1.00);
  return amt * rate;
}

function procSaveExchangeRates(ratesInput) {
  var lock = LockService.getScriptLock();
  try {
    var actor = assertPermission_('PROCUREMENT_WRITE');
    lock.waitLock(CONFIG.LOCK_TIMEOUT_MS);
    var ss = getProcurementSpreadsheet();
    var fxSheet = procEnsureSheet_(ss, 'ExchangeRates');
    var sh = procEnsureSheet_(ss, 'Settings');

    var rateDate = normalizeDateStr_(ratesInput && (ratesInput.RateDate || ratesInput.rateDate)) || todayDateStr_();
    var existing = procGetExchangeRatesForDate_(ss, rateDate);
    var usd = parseFloat(ratesInput && ratesInput.USD);
    var inr = parseFloat(ratesInput && ratesInput.INR);
    var eur = parseFloat(ratesInput && ratesInput.EUR);
    var gbp = parseFloat(ratesInput && ratesInput.GBP);
    var cny = parseFloat(ratesInput && ratesInput.CNY);

    if (!(usd > 0)) usd = existing.USD || CONFIG.DEFAULT_EXCHANGE_RATES.USD;
    if (!(inr > 0)) inr = existing.INR || CONFIG.DEFAULT_EXCHANGE_RATES.INR;
    if (!(eur > 0)) eur = existing.EUR || CONFIG.DEFAULT_EXCHANGE_RATES.EUR;
    if (!(gbp > 0)) gbp = existing.GBP || CONFIG.DEFAULT_EXCHANGE_RATES.GBP;
    if (!(cny > 0)) cny = existing.CNY || CONFIG.DEFAULT_EXCHANGE_RATES.CNY;

    var remarks = String((ratesInput && (ratesInput.Remarks || ratesInput.remarks)) || '').trim();
    var ts = nowIso_();
    var rowData = [rateDate, usd, inr, eur, gbp, cny, 1.00, remarks, actor.email, ts];

    var foundRow = -1;
    if (fxSheet.getLastRow() > 1) {
      var dateList = fxSheet.getRange(2, 1, fxSheet.getLastRow() - 1, 1).getValues();
      for (var d = 0; d < dateList.length; d++) {
        var cellDate = (dateList[d][0] instanceof Date)
          ? Utilities.formatDate(dateList[d][0], CONFIG.TIMEZONE, CONFIG.DATE_FORMAT)
          : (normalizeDateStr_(dateList[d][0]) || String(dateList[d][0] || '').trim());
        if (cellDate === rateDate) {
          foundRow = d + 2;
          break;
        }
      }
    }
    if (foundRow > 0) {
      fxSheet.getRange(foundRow, 1, 1, rowData.length).setValues([rowData]);
    } else {
      fxSheet.appendRow(rowData);
    }

    // Keep Settings fallback aligned with latest date's rates
    var history = procGetExchangeRateHistory_(ss);
    if (history.length > 0 && history[0].RateDate === rateDate) {
      var keys = [
        ['EXCHANGE_RATE_USD', usd, 'USD to NPR Exchange Rate'],
        ['EXCHANGE_RATE_INR', inr, 'INR to NPR Exchange Rate'],
        ['EXCHANGE_RATE_EUR', eur, 'EUR to NPR Exchange Rate'],
        ['EXCHANGE_RATE_GBP', gbp, 'GBP to NPR Exchange Rate'],
        ['EXCHANGE_RATE_CNY', cny, 'CNY to NPR Exchange Rate']
      ];
      var vals = sh.getLastRow() > 1 ? sh.getRange(2, 1, sh.getLastRow() - 1, 1).getValues() : [];
      var rowMap = {};
      for (var i = 0; i < vals.length; i++) {
        rowMap[String(vals[i][0] || '').trim()] = i + 2;
      }
      var isoNow = new Date().toISOString();
      keys.forEach(function (entry) {
        var rIdx = rowMap[entry[0]];
        if (rIdx) {
          sh.getRange(rIdx, 2, 1, 3).setValues([[String(entry[1]), entry[2], isoNow]]);
        } else {
          sh.appendRow([entry[0], String(entry[1]), entry[2], isoNow]);
        }
      });
    }

    var updatedEntriesCount = 0;
    if (ratesInput && ratesInput.applyToExistingRecords === true) {
      var rateLookup = { USD: usd, INR: inr, EUR: eur, GBP: gbp, CNY: cny, NPR: 1.00 };
      ['Quotations', 'PurchaseOrders', 'LCTTPayments'].forEach(function (shName) {
        var modSheet = procEnsureSheet_(ss, shName);
        var modRows = procGetSheetObjects_(modSheet);
        modRows.forEach(function (rec) {
          var dVal = normalizeDateStr_(rec.Date || rec.OrderDate || rec.LCOpeningDate || rec.MaturityDate);
          if (dVal !== rateDate) return;
          var cKey = String(rec.Currency || 'NPR').toUpperCase().trim();
          var newR = rateLookup[cKey] || 1.00;
          rec.ExchangeRate = newR;
          if (shName === 'Quotations') rec.TotalAmountNPR = (parseFloat(rec.TotalAmount) || 0) * newR;
          if (shName === 'PurchaseOrders') rec.TotalValueNPR = (parseFloat(rec.TotalValue) || 0) * newR;
          if (shName === 'LCTTPayments') rec.AmountNPR = (parseFloat(rec.Amount) || 0) * newR;
          procSaveRecordInternal_(ss, shName, rec, actor.email);
          updatedEntriesCount++;
        });
      });
      try {
        var opsSs = getSpreadsheet();
        var ledgerSh = opsSs.getSheetByName(CONFIG.SHEETS.LEDGER);
        var ledgerRows = readLedgerRowsInternal_(opsSs);
        ledgerRows.forEach(function (tx) {
          if (tx.status !== 'ACTIVE' || tx.txDate !== rateDate) return;
          var meta = {};
          try { meta = JSON.parse(tx.metaJson || '{}'); } catch (e) {}
          var curr = String(meta.currency || 'NPR').toUpperCase().trim();
          if (curr !== 'NPR' && Number(meta.unitRate || 0) > 0) {
            var newR = rateLookup[curr] || 1.00;
            meta.exchangeRate = newR;
            meta.totalAmount = roundQty_(tx.enteredQty * Number(meta.unitRate || 0));
            meta.totalAmountNPR = Math.round(meta.totalAmount * newR * 100) / 100;
            ledgerSh.getRange(tx.rowNumber, 17).setValue(JSON.stringify(meta));
            updatedEntriesCount++;
          }
        });
      } catch (opsErr) {}
    }

    var todayRates = procGetExchangeRatesForDate_(ss, todayDateStr_());
    var savedRow = procGetExchangeRatesForDate_(ss, rateDate);
    procLogAudit_('UPDATE_EXCHANGE_RATES', 'ExchangeRates', rateDate, { rates: savedRow, updatedEntriesCount: updatedEntriesCount }, actor.email);
    bumpDataVersion_();
    return buildResponse_(true, 'Exchange rates saved for ' + rateDate + (updatedEntriesCount > 0 ? (' (' + updatedEntriesCount + ' existing records recalculated).') : '.'), {
      rateDate: rateDate,
      savedRate: savedRow,
      updatedEntriesCount: updatedEntriesCount,
      exchangeRates: todayRates,
      exchangeRateHistory: history
    });
  } catch (err) {
    return buildResponse_(false, err.message);
  } finally {
    lock.releaseLock();
  }
}

function procGetSheetObjects_(sheet) {
  if (!sheet || sheet.getLastRow() <= 1) return [];
  var lastRow = sheet.getLastRow();
  var lastCol = sheet.getLastColumn();
  var data = sheet.getRange(1, 1, lastRow, lastCol).getValues();
  var headers = data[0];
  var results = [];
  for (var r = 1; r < data.length; r++) {
    var obj = { _row: r + 1 };
    var hasContent = false;
    for (var c = 0; c < headers.length; c++) {
      var header = String(headers[c] || '').trim();
      if (!header) continue;
      var cellVal = data[r][c];
      if (cellVal instanceof Date) {
        cellVal = Utilities.formatDate(cellVal, CONFIG.TIMEZONE, CONFIG.DATE_FORMAT);
      }
      obj[header] = cellVal;
      if (cellVal !== '' && cellVal !== null && cellVal !== undefined) {
        hasContent = true;
      }
    }
    if (hasContent) results.push(obj);
  }
  return results;
}

function procGenerateUniqueId_(ss, sheetName) {
  var prefixMap = {
    Indents: 'IND',
    Suppliers: 'SUP',
    FreightForwarder: 'FF',
    Quotations: 'QT',
    PurchaseOrders: 'PO',
    LCTTPayments: 'PAY',
    Shipments: 'SHP',
    Tenders: 'TND',
    TenderTracking: 'TRK'
  };
  var prefix = prefixMap[sheetName] || 'REC';
  var sheet = procEnsureSheet_(ss, sheetName);
  var existingIds = {};
  if (sheet.getLastRow() > 1) {
    var vals = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
    for (var i = 0; i < vals.length; i++) {
      existingIds[String(vals[i][0] || '')] = true;
    }
  }
  var nextNum = 1001;
  while (existingIds[prefix + '-' + nextNum]) {
    nextNum++;
  }
  return prefix + '-' + nextNum;
}

function procGetRecords(sheetName, filterCriteria) {
  try {
    assertPermission_('PROCUREMENT_VIEW');
    var ss = getProcurementSpreadsheet();
    var sheet = procEnsureSheet_(ss, sheetName);
    var records = procGetSheetObjects_(sheet);
    if (filterCriteria && typeof filterCriteria === 'object') {
      records = records.filter(function (rec) {
        for (var key in filterCriteria) {
          if (filterCriteria[key] !== undefined && filterCriteria[key] !== '' && filterCriteria[key] !== null) {
            if (String(rec[key] || '').toLowerCase() !== String(filterCriteria[key]).toLowerCase()) {
              return false;
            }
          }
        }
        return true;
      });
    }
    return buildResponse_(true, sheetName + ' loaded.', { records: records });
  } catch (err) {
    return buildResponse_(false, err.message);
  }
}

function procGetLookups() {
  try {
    assertPermission_('PROCUREMENT_VIEW');
    var ss = getProcurementSpreadsheet();
    procSeedInitialData_(ss);
    var opsItems = [];
    try {
      opsItems = loadItemsInternal_(false).filter(function (it) { return it.status === 'Active'; });
    } catch (e) {}

    var quotes = procGetSheetObjects_(procEnsureSheet_(ss, 'Quotations')).filter(function (q) {
      return String(q.MDApproval || '').toLowerCase() === 'approved';
    });
    var pos = procGetSheetObjects_(procEnsureSheet_(ss, 'PurchaseOrders')).filter(function (p) {
      return String(p.Status || '').toLowerCase() !== 'rejected' && String(p.Status || '').toLowerCase() !== 'cancelled';
    });

    return buildResponse_(true, 'Procurement lookups loaded.', {
      items: opsItems.map(function (it) {
        return { itemCode: it.itemCode, itemName: it.itemName, category: it.category, unit: it.indexUnit };
      }),
      suppliers: procGetSheetObjects_(procEnsureSheet_(ss, 'Suppliers')),
      forwarders: procGetSheetObjects_(procEnsureSheet_(ss, 'FreightForwarder')),
      indents: procGetSheetObjects_(procEnsureSheet_(ss, 'Indents')),
      approvedQuotations: quotes,
      activePOs: pos,
      tenders: procGetSheetObjects_(procEnsureSheet_(ss, 'Tenders')),
      exchangeRates: procGetExchangeRatesForDate_(ss, todayDateStr_()),
      exchangeRateHistory: procGetExchangeRateHistory_(ss)
    });
  } catch (err) {
    return buildResponse_(false, err.message);
  }
}

function procSaveRecordInternal_(ss, sheetName, recordData, actorEmail) {
  procAssertSheetName_(sheetName);
  var sheet = procEnsureSheet_(ss, sheetName);
  var headers = sheet.getRange(1, 1, 1, sheet.getLastColumn()).getValues()[0];
  var primaryKey = String(headers[0]);
  var copy = {};
  for (var k in recordData) {
    if (recordData.hasOwnProperty(k)) copy[k] = recordData[k];
  }

  var idValue = copy[primaryKey] ? String(copy[primaryKey]).trim() : '';
  var isNew = !idValue;
  if (isNew) {
    idValue = procGenerateUniqueId_(ss, sheetName);
    copy[primaryKey] = idValue;
  }

  var txDate = normalizeDateStr_(copy.Date || copy.OrderDate || copy.LCOpeningDate || copy.MaturityDate) || todayDateStr_();
  var rates = procGetExchangeRatesForDate_(ss, txDate);
  var currKey = String(copy.Currency || 'NPR').toUpperCase().trim();
  var effectiveRate = parseFloat(copy.ExchangeRate) > 0 ? parseFloat(copy.ExchangeRate) : (Number(rates[currKey]) || 1);
  if (copy.Currency) {
    copy.ExchangeRate = effectiveRate;
  }
  if (copy.Currency && copy.TotalValue !== undefined && copy.TotalValue !== '' && (copy.TotalValueNPR === undefined || copy.TotalValueNPR === '')) {
    copy.TotalValueNPR = (parseFloat(copy.TotalValue) || 0) * effectiveRate;
  }
  if (copy.Currency && copy.TotalAmount !== undefined && copy.TotalAmount !== '' && (copy.TotalAmountNPR === undefined || copy.TotalAmountNPR === '')) {
    copy.TotalAmountNPR = (parseFloat(copy.TotalAmount) || 0) * effectiveRate;
  }
  if (copy.Currency && copy.Amount !== undefined && copy.Amount !== '' && (copy.AmountNPR === undefined || copy.AmountNPR === '')) {
    copy.AmountNPR = (parseFloat(copy.Amount) || 0) * effectiveRate;
  }
  copy.Timestamp = new Date().toISOString();

  var existingRow = -1;
  if (sheet.getLastRow() > 1) {
    var idList = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
    for (var i = 0; i < idList.length; i++) {
      if (String(idList[i][0]) === String(idValue)) {
        existingRow = i + 2;
        break;
      }
    }
  }

  var existingRowVals = null;
  if (existingRow > 0) {
    existingRowVals = sheet.getRange(existingRow, 1, 1, headers.length).getValues()[0];
  }

  var rowValues = [];
  for (var h = 0; h < headers.length; h++) {
    var colName = String(headers[h]);
    var val = copy[colName];
    if (val === undefined && existingRowVals) {
      val = existingRowVals[h];
    }
    if (typeof val === 'object' && val !== null) {
      val = JSON.stringify(val);
    }
    rowValues.push(val !== undefined && val !== null ? val : '');
  }

  if (existingRow > 0) {
    sheet.getRange(existingRow, 1, 1, headers.length).setValues([rowValues]);
    procLogAudit_('UPDATE_RECORD', sheetName, idValue, copy, actorEmail);
  } else {
    sheet.appendRow(rowValues);
    procLogAudit_('CREATE_RECORD', sheetName, idValue, copy, actorEmail);
  }

  if (sheetName === 'Tenders' && String(copy.Result || '').toLowerCase() === 'win') {
    procCreateOrUpdateTenderTracking_(ss, copy, actorEmail);
  }

  return {
    id: idValue,
    updated: existingRow > 0,
    data: copy
  };
}

function procCreateOrUpdateTenderTracking_(ss, tenderData, actorEmail) {
  var trkSheet = procEnsureSheet_(ss, 'TenderTracking');
  var existing = procGetSheetObjects_(trkSheet).filter(function (r) {
    return String(r.TenderNo || '').toLowerCase() === String(tenderData.TenderNo || '').toLowerCase();
  });
  if (existing.length === 0) {
    var amt = (parseFloat(tenderData.Quantity) || 0) * (parseFloat(tenderData.EstimatedRate) || 0);
    procSaveRecordInternal_(ss, 'TenderTracking', {
      TrackingId: 'TRK-' + tenderData.TenderNo,
      TenderNo: tenderData.TenderNo,
      TenderName: tenderData.TenderName || '',
      Address: tenderData.Address || '',
      ContactInfo: tenderData.ContactInfo || '',
      LastSubmissionDate: tenderData.SubmissionDeadline || '',
      ItemName: tenderData.ItemName || '',
      Unit: tenderData.Unit || '',
      Quantity: tenderData.Quantity || 0,
      RateIncVat: tenderData.EstimatedRate || 0,
      Amount: amt,
      MuchulkaStatus: 'Pending',
      MuchulkaDate: '',
      LOIStatus: 'Pending',
      LOIDate: '',
      LOAStatus: 'Pending',
      LOADate: '',
      PGStatus: 'Pending',
      PGDate: '',
      SampleStatus: 'Pending',
      SampleDate: '',
      ProductionStatus: 'Not Started',
      DispatchStatus: 'Not Dispatched',
      DispatchDate: '',
      Remarks: 'Auto-created from won tender ' + tenderData.TenderNo
    }, actorEmail);
  }
}

function procSaveRecord(sheetName, recordData) {
  var lock = LockService.getScriptLock();
  try {
    var requiredPerm = (sheetName === 'Tenders' || sheetName === 'TenderTracking') ? 'TENDER_WRITE' : 'PROCUREMENT_WRITE';
    var actor = assertPermission_(requiredPerm);
    lock.waitLock(CONFIG.LOCK_TIMEOUT_MS);
    var ss = getProcurementSpreadsheet();
    var res = procSaveRecordInternal_(ss, sheetName, recordData || {}, actor.email);
    bumpDataVersion_();
    return buildResponse_(true, 'Record ' + res.id + ' ' + (res.updated ? 'updated' : 'created') + ' in ' + sheetName + '.', res);
  } catch (err) {
    return buildResponse_(false, err.message);
  } finally {
    lock.releaseLock();
  }
}

function procDeleteRecord(sheetName, recordId) {
  var lock = LockService.getScriptLock();
  try {
    var requiredPerm = (sheetName === 'Tenders' || sheetName === 'TenderTracking') ? 'TENDER_WRITE' : 'PROCUREMENT_WRITE';
    var actor = assertPermission_(requiredPerm);
    lock.waitLock(CONFIG.LOCK_TIMEOUT_MS);
    procAssertSheetName_(sheetName);
    var ss = getProcurementSpreadsheet();
    var sheet = procEnsureSheet_(ss, sheetName);
    if (sheet.getLastRow() <= 1) {
      throw new Error('Record ' + recordId + ' not found in ' + sheetName);
    }
    var idList = sheet.getRange(2, 1, sheet.getLastRow() - 1, 1).getValues();
    var targetRow = -1;
    for (var i = 0; i < idList.length; i++) {
      var cellId = (sheetName === 'ExchangeRates' && idList[i][0] instanceof Date)
        ? Utilities.formatDate(idList[i][0], CONFIG.TIMEZONE, CONFIG.DATE_FORMAT)
        : (sheetName === 'ExchangeRates' ? (normalizeDateStr_(idList[i][0]) || String(idList[i][0])) : String(idList[i][0]));
      if (String(cellId) === String(recordId)) {
        targetRow = i + 2;
        break;
      }
    }
    if (targetRow === -1) {
      throw new Error('Record with ID ' + recordId + ' not found in ' + sheetName);
    }
    sheet.deleteRow(targetRow);
    procLogAudit_('DELETE_RECORD', sheetName, recordId, 'Deleted row ' + targetRow, actor.email);
    bumpDataVersion_();
    return buildResponse_(true, 'Record ' + recordId + ' deleted from ' + sheetName + '.', { id: recordId });
  } catch (err) {
    return buildResponse_(false, err.message);
  } finally {
    lock.releaseLock();
  }
}

function procSetApproval(moduleName, id, status, remarks) {
  var lock = LockService.getScriptLock();
  try {
    var actor = assertPermission_('PROCUREMENT_APPROVE');
    lock.waitLock(CONFIG.LOCK_TIMEOUT_MS);
    var ss = getProcurementSpreadsheet();

    if (moduleName === 'Quotations') {
      var qRows = procGetSheetObjects_(procEnsureSheet_(ss, 'Quotations')).filter(function (q) {
        return String(q.QuotationNo) === String(id);
      });
      if (qRows.length === 0) throw new Error('Quotation ' + id + ' not found.');
      var quote = qRows[0];
      quote.MDApproval = status;
      quote.MDApprovalDate = new Date().toISOString();
      quote.MDNotes = remarks || '';
      quote.Status = status === 'Approved' ? 'Ready for PO' : 'Rejected';
      procSaveRecordInternal_(ss, 'Quotations', quote, actor.email);
      procLogAudit_('APPROVAL_ACTION', 'Quotations', id, { status: status, remarks: remarks }, actor.email);
      bumpDataVersion_();
      return buildResponse_(true, 'Quotation ' + id + ' MD approval set to ' + status + '.');
    }

    if (moduleName === 'PurchaseOrders') {
      var poRows = procGetSheetObjects_(procEnsureSheet_(ss, 'PurchaseOrders')).filter(function (p) {
        return String(p.PONo) === String(id);
      });
      if (poRows.length === 0) throw new Error('Purchase Order ' + id + ' not found.');
      var po = poRows[0];
      po.ApprovalStatus = status;
      po.Status = status === 'Approved' ? 'Approved' : 'Rejected';
      procSaveRecordInternal_(ss, 'PurchaseOrders', po, actor.email);
      procLogAudit_('APPROVAL_ACTION', 'PurchaseOrders', id, { status: status, remarks: remarks }, actor.email);
      bumpDataVersion_();
      return buildResponse_(true, 'Purchase Order ' + id + ' approval set to ' + status + '.');
    }

    if (moduleName === 'Indents') {
      var indRows = procGetSheetObjects_(procEnsureSheet_(ss, 'Indents')).filter(function (ind) {
        return String(ind.IndentNo) === String(id);
      });
      if (indRows.length === 0) throw new Error('Indent ' + id + ' not found.');
      var ind = indRows[0];
      ind.Status = status;
      ind.ApprovedBy = actor.email;
      ind.ApprovalDate = new Date().toISOString();
      if (remarks) ind.Remarks = remarks;
      procSaveRecordInternal_(ss, 'Indents', ind, actor.email);
      procLogAudit_('APPROVAL_ACTION', 'Indents', id, { status: status, remarks: remarks }, actor.email);
      bumpDataVersion_();
      return buildResponse_(true, 'Indent ' + id + ' marked ' + status + '.');
    }

    throw new Error('Unsupported approval module: ' + moduleName);
  } catch (err) {
    return buildResponse_(false, err.message);
  } finally {
    lock.releaseLock();
  }
}

function procGetDashboard(filterOpts) {
  try {
    assertPermission_('PROCUREMENT_VIEW');
    var ss = getProcurementSpreadsheet();
    procSeedInitialData_(ss);
    var rates = procGetExchangeRatesForDate_(ss, todayDateStr_());
    var rateHistory = procGetExchangeRateHistory_(ss);
    var filters = filterOpts || {};

    var indents = procGetSheetObjects_(procEnsureSheet_(ss, 'Indents'));
    var quotes = procGetSheetObjects_(procEnsureSheet_(ss, 'Quotations'));
    var pos = procGetSheetObjects_(procEnsureSheet_(ss, 'PurchaseOrders'));
    var lctts = procGetSheetObjects_(procEnsureSheet_(ss, 'LCTTPayments'));
    var shipments = procGetSheetObjects_(procEnsureSheet_(ss, 'Shipments'));
    var tenders = procGetSheetObjects_(procEnsureSheet_(ss, 'Tenders'));
    var tracks = procGetSheetObjects_(procEnsureSheet_(ss, 'TenderTracking'));
    var audits = procGetSheetObjects_(procEnsureSheet_(ss, 'AuditLog'));

    var totalPOValueNPR = 0;
    var pendingPOCount = 0;
    var pendingPOValueNPR = 0;
    var monthlyMap = {};
    var months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
    var currentYear = new Date().getFullYear();
    months.forEach(function (m) { monthlyMap[m + ' ' + currentYear] = 0; });

    pos.forEach(function (po) {
      var valNPR = parseFloat(po.TotalValueNPR) || procConvertToNPR_(po.TotalValue, po.Currency, rates);
      totalPOValueNPR += valNPR;
      var st = String(po.Status || '').toLowerCase();
      var recvSt = String(po.ReceivedStatus || '').toLowerCase();
      if (st !== 'completed' && st !== 'cancelled' && recvSt !== 'fully received') {
        pendingPOCount++;
        pendingPOValueNPR += valNPR;
      }
      if (po.OrderDate) {
        var d = new Date(po.OrderDate);
        if (!isNaN(d.getTime())) {
          var k = months[d.getMonth()] + ' ' + d.getFullYear();
          monthlyMap[k] = (monthlyMap[k] || 0) + valNPR;
        }
      }
    });

    var supplierOutstandingNPR = 0;
    var supplierPaidNPR = 0;
    lctts.forEach(function (pay) {
      var amtNPR = parseFloat(pay.AmountNPR) || procConvertToNPR_(pay.Amount, pay.Currency, rates);
      var st = String(pay.Status || '').toLowerCase();
      if (st === 'pending' || st === 'in progress') supplierOutstandingNPR += amtNPR;
      else supplierPaidNPR += amtNPR;
    });

    var customerOutstandingNPR = 0;
    tracks.forEach(function (t) {
      var amt = parseFloat(t.Amount) || 0;
      var ds = String(t.DispatchStatus || '').toLowerCase();
      if (ds === 'dispatched' || ds === 'partial' || ds === 'batch 1 dispatched') {
        customerOutstandingNPR += amt;
      }
    });

    var shipIndia = 0;
    var shipThird = 0;
    var shipTransitTotal = 0;
    shipments.forEach(function (s) {
      var st = String(s.ShipmentStatus || '').toLowerCase();
      if (st.indexOf('transit') !== -1 || st.indexOf('port') !== -1 || st === 'customs pending' || st === 'in progress') {
        shipTransitTotal++;
        var orig = String(s.OriginType || '').toLowerCase();
        var country = String(s.OriginCountry || '').toLowerCase();
        if (orig === 'india' || country.indexOf('india') !== -1) shipIndia++;
        else shipThird++;
      }
    });

    var pendingIndents = indents.filter(function (i) { return String(i.Status || 'Pending') === 'Pending'; }).length;
    var pendingQuotes = quotes.filter(function (q) { return String(q.MDApproval || 'Pending') === 'Pending'; }).length;
    var wonTenders = tenders.filter(function (t) { return String(t.Result || '').toLowerCase() === 'win'; }).length;

    audits.sort(function (a, b) {
      return String(b.Timestamp || '').localeCompare(String(a.Timestamp || ''));
    });

    var trendLabels = Object.keys(monthlyMap);
    return buildResponse_(true, 'Procurement dashboard loaded.', {
      kpis: {
        totalPOValueNPR: totalPOValueNPR,
        pendingPOCount: pendingPOCount,
        pendingPOValueNPR: pendingPOValueNPR,
        supplierOutstandingNPR: supplierOutstandingNPR,
        supplierPaidNPR: supplierPaidNPR,
        customerOutstandingNPR: customerOutstandingNPR,
        period: filters.period || 'yearly',
        shipmentsInTransit: { total: shipTransitTotal, india: shipIndia, thirdCountry: shipThird },
        totalIndents: indents.length,
        pendingIndents: pendingIndents,
        pendingQuotes: pendingQuotes,
        totalTenders: tenders.length,
        wonTenders: wonTenders
      },
      charts: {
        procurementTrend: {
          labels: trendLabels,
          data: trendLabels.map(function (k) { return Math.round(monthlyMap[k]); })
        },
        tenderBreakdown: {
          Win: wonTenders,
          Pending: tenders.filter(function (t) { return String(t.Result || 'Pending').toLowerCase() === 'pending'; }).length,
          Lose: tenders.filter(function (t) { return String(t.Result || '').toLowerCase() === 'lose'; }).length
        }
      },
      recentPOs: pos.slice(-8).reverse(),
      recentTenders: tenders.slice(-8).reverse(),
      recentAudit: audits.slice(0, 12),
      exchangeRates: rates,
      exchangeRateHistory: rateHistory,
      spreadsheetId: ss.getId(),
      spreadsheetUrl: ss.getUrl()
    });
  } catch (err) {
    return buildResponse_(false, err.message);
  }
}

function getApprovedPOsForGoodsReceipt() {
  try {
    var actor = resolveCurrentUser_();
    if (!hasPermission_(actor, 'RECEIPT_WRITE') && !hasPermission_(actor, 'PROCUREMENT_VIEW') && !hasPermission_(actor, 'STOCK_VIEW')) {
      throw new Error('Access denied for loading Approved Purchase Orders.');
    }
    var ss = getProcurementSpreadsheet();
    var pos = procGetSheetObjects_(procEnsureSheet_(ss, 'PurchaseOrders')).filter(function (p) {
      var app = String(p.ApprovalStatus || '').toLowerCase();
      var st = String(p.Status || '').toLowerCase();
      return app === 'approved' && st !== 'cancelled' && st !== 'rejected';
    });
    var formatted = pos.map(function (p) {
      var items = [];
      try { items = JSON.parse(p.ItemsJSON || '[]'); } catch (e) {}
      return {
        poNo: p.PONo,
        quotationNo: p.QuotationNo || '',
        supplierId: p.SupplierId || '',
        supplierName: p.SupplierName || '',
        orderDate: p.OrderDate || '',
        expectedDeliveryDate: p.ExpectedDeliveryDate || '',
        currency: p.Currency || 'NPR',
        exchangeRate: Number(p.ExchangeRate || 1),
        totalValue: Number(p.TotalValue || 0),
        totalValueNPR: Number(p.TotalValueNPR || 0),
        receivedStatus: p.ReceivedStatus || 'Pending Receipt',
        receivedQty: Number(p.ReceivedQty || 0),
        pendingQty: Number(p.PendingQty || 0),
        items: Array.isArray(items) ? items : []
      };
    });
    return buildResponse_(true, 'Approved Purchase Orders loaded.', { purchaseOrders: formatted });
  } catch (err) {
    return buildResponse_(false, err.message);
  }
}

function tryUpdatePOReceiptProgress_(poNo, receivedDeltaQty, actorEmail) {
  if (!poNo) return;
  var ss = getProcurementSpreadsheet();
  var sheet = procEnsureSheet_(ss, 'PurchaseOrders');
  var rows = procGetSheetObjects_(sheet).filter(function (p) {
    return String(p.PONo) === String(poNo);
  });
  if (!rows.length) return;
  var po = rows[0];
  var items = [];
  try { items = JSON.parse(po.ItemsJSON || '[]'); } catch (e) {}
  var orderedQty = 0;
  if (Array.isArray(items) && items.length > 0) {
    items.forEach(function (it) { orderedQty += (Number(it.qty) || 0); });
  }
  if (orderedQty <= 0) {
    orderedQty = (Number(po.ReceivedQty || 0) + Number(po.PendingQty || 0)) || Number(receivedDeltaQty || 0);
  }
  var newReceived = roundQty_(Number(po.ReceivedQty || 0) + Number(receivedDeltaQty || 0));
  var newPending = Math.max(0, roundQty_(orderedQty - newReceived));
  po.ReceivedQty = newReceived;
  po.PendingQty = newPending;
  po.ReceivedStatus = newPending <= 1e-6 ? 'Fully Received' : 'Partially Received';
  procSaveRecordInternal_(ss, 'PurchaseOrders', po, actorEmail);
  bumpDataVersion_();
}
