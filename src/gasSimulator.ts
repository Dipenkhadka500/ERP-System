/**
 * Browser-side Google Apps Script + Google Sheets Runtime Simulator
 * Mirrors Code.js business logic, ledger, UOM quotient/remainder engine,
 * RBAC, working-sheet sync idempotency, and 15-test verification suite.
 */

export type ErpRole =
  | 'Super Admin'
  | 'Operations Manager'
  | 'Procurement Officer'
  | 'Store Officer'
  | 'Production Officer'
  | 'Dispatch Officer'
  | 'Viewer';

export interface ItemRecord {
  itemCode: string;
  itemName: string;
  category: string;
  brand: string;
  hsnCode: string;
  indexUnit: string;
  fractionOfIndexUnit: number;
  conversionQty: number;
  conversionUnit: string;
  reorderLevel: number;
  status: 'Active' | 'Inactive';
  createdDate: string;
  updatedDate: string;
}

export interface LedgerRecord {
  txId: string;
  txType: 'PRODUCTION' | 'GOODS_RECEIPT' | 'DISPATCH' | 'ISSUE' | 'OPENING_STOCK' | 'ADJUSTMENT';
  txDate: string;
  itemCode: string;
  itemName: string;
  category: string;
  brand: string;
  enteredQty: number;
  enteredUom: string;
  baseQty: number;
  direction: 'IN' | 'OUT';
  sourceSheet: string;
  sourceRow: number;
  batchNo: string;
  refNo: string;
  partyOrSection: string;
  metaJson: string;
  remarks: string;
  createdBy: string;
  createdAt: string;
  updatedBy: string;
  updatedAt: string;
  status: 'ACTIVE' | 'CANCELLED';
  recordHash: string;
}

export interface SyncErrorRecord {
  errorId: string;
  timestamp: string;
  sheetName: string;
  sheetRow: number;
  itemCode: string;
  message: string;
  status: 'OPEN' | 'RESOLVED';
}

export interface DailyReportRecord {
  reportId: string;
  reportDate: string;
  submittedBy: string;
  submittedAt: string;
  totalActiveItems: number;
  stockInTransactions: number;
  stockOutTransactions: number;
  belowReorderCount: number;
  zeroBalanceCount: number;
  snapshot: any;
  status: 'SUBMITTED';
}

export interface AuditRecord {
  auditId: string;
  timestamp: string;
  user: string;
  role: string;
  action: string;
  module: string;
  targetId: string;
  summary: string;
}

export interface WorkingSheetRow {
  txId: string;
  txDate: string;
  itemCode: string;
  quantity: number;
  uom: string;
  partyOrSection?: string;
  refNo?: string;
  batchNo?: string;
  remarks?: string;
  status: 'ACTIVE' | 'CANCELLED';
  syncStatus: string;
}

export interface ExchangeRateRecord {
  RateDate: string;
  USD: number;
  INR: number;
  EUR: number;
  GBP: number;
  CNY: number;
  NPR: number;
  Remarks?: string;
  UpdatedBy?: string;
  UpdatedAt?: string;
}

export interface ProcurementDb {
  exchangeRates: Record<string, number>;
  ExchangeRates: ExchangeRateRecord[];
  Indents: any[];
  Suppliers: any[];
  FreightForwarder: any[];
  Quotations: any[];
  PurchaseOrders: any[];
  LCTTPayments: any[];
  Shipments: any[];
  Tenders: any[];
  TenderTracking: any[];
  AuditLog: any[];
}

export interface SimAuthSession {
  token: string;
  email: string;
  displayName: string;
  role: ErpRole;
  department: string;
  loginAt: string;
  expiresAt: string;
}

export interface SimDb {
  version: number;
  lastSyncAt: string;
  activeRole: ErpRole;
  activeSession: SimAuthSession | null;
  settings: {
    allowNegativeOverride: boolean;
    authorizeFinishedGoodsIssue: boolean;
    productionStrictFgOnly: boolean;
  };
  items: ItemRecord[];
  ledger: LedgerRecord[];
  workingSheets: Record<string, WorkingSheetRow[]>;
  syncErrors: SyncErrorRecord[];
  dailyReports: DailyReportRecord[];
  auditLogs: AuditRecord[];
  procurement: ProcurementDb;
}

export interface TestResult {
  id: string;
  title: string;
  passed: boolean;
  details: string;
}

const STORAGE_KEY = 'BIRAT_ERP_GAS_SIM_DB_V1';

export const FIXED_CATEGORIES = [
  'Raw Material',
  'Packing Material',
  'Finished Goods',
  'WIP',
  'Stores & Spares',
  'Others',
];

const CATEGORY_PREFIXES: Record<string, number> = {
  WIP: 2001,
  'Finished Goods': 3001,
  'Raw Material': 4001,
  'Packing Material': 5001,
  'Stores & Spares': 6001,
  Others: 7001,
};

const ROLE_PERMS: Record<ErpRole, string[]> = {
  'Super Admin': [
    'ITEM_MANAGE', 'PRODUCTION_WRITE', 'RECEIPT_WRITE', 'DISPATCH_WRITE',
    'ISSUE_WRITE', 'ISSUE_FG', 'STOCK_VIEW', 'REPORT_GENERATE',
    'REPORT_SUBMIT', 'STOCK_ADJUST', 'TX_EDIT', 'TX_CANCEL',
    'NEGATIVE_OVERRIDE', 'SYNC_ADMIN', 'AUDIT_VIEW', 'USER_MANAGE',
    'PROCUREMENT_VIEW', 'PROCUREMENT_WRITE', 'PROCUREMENT_APPROVE', 'TENDER_WRITE',
  ],
  'Operations Manager': [
    'ITEM_MANAGE', 'PRODUCTION_WRITE', 'RECEIPT_WRITE', 'DISPATCH_WRITE',
    'ISSUE_WRITE', 'ISSUE_FG', 'STOCK_VIEW', 'REPORT_GENERATE',
    'REPORT_SUBMIT', 'STOCK_ADJUST', 'TX_EDIT', 'TX_CANCEL',
    'NEGATIVE_OVERRIDE', 'SYNC_ADMIN', 'AUDIT_VIEW',
    'PROCUREMENT_VIEW', 'PROCUREMENT_WRITE', 'PROCUREMENT_APPROVE', 'TENDER_WRITE',
  ],
  'Procurement Officer': ['PROCUREMENT_VIEW', 'PROCUREMENT_WRITE', 'TENDER_WRITE', 'STOCK_VIEW'],
  'Store Officer': ['RECEIPT_WRITE', 'ISSUE_WRITE', 'STOCK_VIEW', 'REPORT_GENERATE', 'TX_EDIT'],
  'Production Officer': ['PRODUCTION_WRITE', 'ISSUE_WRITE', 'STOCK_VIEW', 'REPORT_GENERATE', 'TX_EDIT'],
  'Dispatch Officer': ['DISPATCH_WRITE', 'STOCK_VIEW', 'REPORT_GENERATE', 'TX_EDIT'],
  Viewer: ['STOCK_VIEW', 'REPORT_GENERATE'],
};

interface AuthAccountDef {
  email: string;
  aliases: string[];
  passwordHash: string;
  displayName: string;
  role: ErpRole;
  department: string;
}

const AUTH_ACCOUNTS: AuthAccountDef[] = [
  {
    email: 'dipen.khadka@birathralthcare.com',
    aliases: ['dipen.khadka@birathealthcare.com'],
    passwordHash: '984247d845211ce479179cec1735ba6a109a8906f78182f19022a69b5a1a6cc1',
    displayName: 'Dipen Khadka',
    role: 'Super Admin',
    department: 'Executive & System Administration',
  },
  {
    email: 'sajal.khadka@birathealthcare.com',
    aliases: [],
    passwordHash: 'dbea622c66ab15f9d4f11f2328463c4a33cd73345e5c846b5624982424e89d58',
    displayName: 'Sajal Khadka',
    role: 'Operations Manager',
    department: 'Operations & Procurement',
  },
  {
    email: 'dispatch@birathealthcare.com',
    aliases: [],
    passwordHash: '7b9e650e5268e6be9584f5d2e903a01f7a6b52469eebffc4c9535aa6e6afef31',
    displayName: 'Dispatch Officer',
    role: 'Dispatch Officer',
    department: 'Dispatch & Logistics',
  },
  {
    email: 'production@birathealthcare.com',
    aliases: [],
    passwordHash: '5bd6f03abc5ff01cafcd5d5034fb530bc916cd102022d8e081608ead0814791b',
    displayName: 'Production Officer',
    role: 'Production Officer',
    department: 'Manufacturing & Production',
  },
];

const PROCUREMENT_SPREADSHEET_ID = '16SN_MJjvmWqt_OH8Hol3AVGB6hWFTM_rYOG1FTi2-yY';

const PROC_PRIMARY_KEYS: Record<string, string> = {
  Indents: 'IndentNo',
  Suppliers: 'SupplierId',
  FreightForwarder: 'ForwarderId',
  Quotations: 'QuotationNo',
  PurchaseOrders: 'PONo',
  LCTTPayments: 'PaymentId',
  Shipments: 'ShipmentId',
  Tenders: 'TenderNo',
  TenderTracking: 'TrackingId',
  ExchangeRates: 'RateDate',
};

const PROC_PREFIXES: Record<string, string> = {
  Indents: 'IND',
  Suppliers: 'SUP',
  FreightForwarder: 'FF',
  Quotations: 'QT',
  PurchaseOrders: 'PO',
  LCTTPayments: 'PAY',
  Shipments: 'SHP',
  Tenders: 'TND',
  TenderTracking: 'TRK',
};

function createDefaultProcurementDb(seedData = true): ProcurementDb {
  const today = todayIsoDate();
  const yr = new Date().getFullYear();
  const ts = new Date().toISOString();
  const base: ProcurementDb = {
    exchangeRates: {
      USD: 135.50,
      INR: 1.6015,
      EUR: 146.20,
      GBP: 172.80,
      CNY: 18.60,
      NPR: 1.00,
    },
    ExchangeRates: [
      {
        RateDate: today,
        USD: 135.50,
        INR: 1.6015,
        EUR: 146.20,
        GBP: 172.80,
        CNY: 18.60,
        NPR: 1.00,
        Remarks: 'Initial baseline exchange rate',
        UpdatedBy: 'system',
        UpdatedAt: ts,
      },
    ],
    Indents: [],
    Suppliers: [],
    FreightForwarder: [],
    Quotations: [],
    PurchaseOrders: [],
    LCTTPayments: [],
    Shipments: [],
    Tenders: [],
    TenderTracking: [],
    AuditLog: [],
  };

  if (!seedData) return base;

  base.Suppliers = [
    {
      SupplierId: 'SUP-001',
      Name: 'Gujarat Organic Chemical Synthetics Ltd.',
      PanNo: 'PAN-9920192',
      GstNo: 'GSTIN24AAACG1234F1Z5',
      ContactPerson: 'Mr. Amit Patel',
      Phone: '+91-9825012345',
      Email: 'sales@gujaratchem.in',
      Country: 'India',
      Address: 'GIDC Ankleshwar, Gujarat, India',
      PaymentTerms: '30 Days TT',
      Currency: 'INR',
      LeadTimeDays: 21,
      Rating: 4.8,
      Timestamp: ts,
    },
    {
      SupplierId: 'SUP-002',
      Name: 'Zhejiang Pharma Corp & Active Ingredients',
      PanNo: 'PAN-FOREIGN-01',
      GstNo: 'CN-913301007',
      ContactPerson: 'Ms. Chen Wei',
      Phone: '+86-571-88991122',
      Email: 'export@zhejiangpharma.cn',
      Country: 'China',
      Address: 'Binjiang High-Tech Park, Hangzhou, China',
      PaymentTerms: 'LC at Sight 60 Days',
      Currency: 'USD',
      LeadTimeDays: 45,
      Rating: 4.9,
      Timestamp: ts,
    },
    {
      SupplierId: 'SUP-003',
      Name: 'Himalayan Packaging & Foil Industries',
      PanNo: 'PAN-301298451',
      GstNo: 'N/A',
      ContactPerson: 'Dipesh Shrestha',
      Phone: '+977-9851088776',
      Email: 'info@himalayanpackaging.com.np',
      Country: 'Nepal',
      Address: 'Patandhoka Industrial Area, Lalitpur, Nepal',
      PaymentTerms: '15 Days Credit',
      Currency: 'NPR',
      LeadTimeDays: 7,
      Rating: 4.5,
      Timestamp: ts,
    },
    {
      SupplierId: 'SUP-004',
      Name: 'Euro-Med Health & Chemical GmbH',
      PanNo: 'DE-812345678',
      GstNo: 'DE812345678',
      ContactPerson: 'Dr. Klaus Becker',
      Phone: '+49-69-1234567',
      Email: 'klaus.becker@euromed-pharma.de',
      Country: 'Germany',
      Address: 'Industriepark Hoechst, Frankfurt, Germany',
      PaymentTerms: '100% Advance TT',
      Currency: 'EUR',
      LeadTimeDays: 35,
      Rating: 4.7,
      Timestamp: ts,
    },
  ];

  base.FreightForwarder = [
    {
      ForwarderId: 'FF-01',
      Name: 'Trans-Himalayan Logistics & Freight Pvt. Ltd.',
      Address: 'Birgunj Dry Port Rd & Thamel, KTM',
      ContactPerson: 'Sanjay Gupta',
      Phone: '+977-9855012345',
      Email: 'sanjay@transhimalaya.com.np',
      Rating: 4.8,
      Remarks: 'Expert in Kolkata Port to Birgunj Dry Port transit',
      Timestamp: ts,
    },
    {
      ForwarderId: 'FF-02',
      Name: 'Everest Express Ocean & Air Cargo',
      Address: 'Sinamangal Cargo Complex, Kathmandu',
      ContactPerson: 'Pooja Thapa',
      Phone: '+977-9801044556',
      Email: 'cargo@everestexpress.com',
      Rating: 4.6,
      Remarks: 'Reliable for air shipments from Europe & China',
      Timestamp: ts,
    },
  ];

  base.Indents = [
    {
      IndentNo: 'IND-1001',
      Date: `${yr}-02-10`,
      Department: 'Production',
      Requester: 'Dipen Khadka',
      ItemCode: '4001',
      ItemName: 'Melt-Blown Filter Fabric 25 GSM',
      RequiredQty: 500,
      Unit: 'KG',
      RequiredDeliveryDate: `${yr}-03-15`,
      Priority: 'High',
      Status: 'Approved',
      ApprovedBy: 'dipen.khadka@birathealthcare.com',
      ApprovalDate: ts,
      Remarks: 'Q1 surgical mask production line stock',
      Timestamp: ts,
    },
    {
      IndentNo: 'IND-1002',
      Date: today,
      Department: 'Packing',
      Requester: 'Production Lead',
      ItemCode: '5001',
      ItemName: 'Printed Inner Dispenser Box (50s)',
      RequiredQty: 10000,
      Unit: 'Pcs',
      RequiredDeliveryDate: todayIsoDate(14),
      Priority: 'Normal',
      Status: 'Pending',
      ApprovedBy: '',
      ApprovalDate: '',
      Remarks: 'Standard replenishment',
      Timestamp: ts,
    },
  ];

  base.Quotations = [
    {
      QuotationNo: 'QT-1001',
      IndentNo: 'IND-1001',
      SupplierId: 'SUP-002',
      SupplierName: 'Zhejiang Pharma Corp & Active Ingredients',
      Date: `${yr}-02-12`,
      ValidityDate: `${yr}-04-12`,
      Currency: 'USD',
      ExchangeRate: 135.5,
      Incoterms: 'CIF Birgunj',
      FreightCharges: 350,
      OtherCharges: 0,
      Subtotal: 4500,
      TotalAmount: 4850,
      TotalAmountNPR: 657175,
      Status: 'Ready for PO',
      MDApproval: 'Approved',
      MDApprovalDate: ts,
      MDNotes: 'Approved for immediate import',
      AttachmentName: 'QT-1001_PI.pdf',
      ItemsJSON: JSON.stringify([{ itemCode: '4001', itemName: 'Melt-Blown Filter Fabric 25 GSM', qty: 500, unit: 'KG', rate: 9 }]),
      Timestamp: ts,
    },
  ];

  base.PurchaseOrders = [
    {
      PONo: 'PO-1001',
      QuotationNo: 'QT-1001',
      SupplierId: 'SUP-002',
      SupplierName: 'Zhejiang Pharma Corp & Active Ingredients',
      OrderDate: `${yr}-02-15`,
      DeliveryTerms: 'CIF Birgunj',
      PaymentTerms: 'LC at Sight',
      Incoterms: 'CIF Birgunj',
      Currency: 'USD',
      ExchangeRate: 135.5,
      TotalValue: 4850,
      TotalValueNPR: 657175,
      ExpectedDeliveryDate: `${yr}-03-20`,
      Status: 'Approved',
      ApprovalStatus: 'Approved',
      ItemsJSON: JSON.stringify([{ itemCode: '4001', itemName: 'Melt-Blown Filter Fabric 25 GSM', qty: 500, unit: 'KG', rate: 9 }]),
      ReceivedStatus: 'Pending Receipt',
      ReceivedQty: 0,
      PendingQty: 500,
      Timestamp: ts,
    },
  ];

  base.LCTTPayments = [
    {
      PaymentId: 'PAY-1001',
      PONo: 'PO-1001',
      SupplierName: 'Zhejiang Pharma Corp & Active Ingredients',
      BankName: 'Nabil Bank Ltd.',
      PaymentType: 'LC at Sight',
      Currency: 'USD',
      Amount: 4850,
      ExchangeRate: 135.5,
      AmountNPR: 657175,
      LCNumber: 'LC-NBL-2026-088',
      LCOpeningDate: `${yr}-02-18`,
      MaturityDate: `${yr}-04-18`,
      PaymentStage: 'LC Margin / Issued',
      Status: 'Pending',
      Timestamp: ts,
    },
  ];

  base.Shipments = [
    {
      ShipmentId: 'SHP-1001',
      PONo: 'PO-1001',
      SupplierName: 'Zhejiang Pharma Corp & Active Ingredients',
      ForwarderName: 'Trans-Himalayan Logistics & Freight Pvt. Ltd.',
      OriginType: 'Third Country',
      OriginCountry: 'China',
      ShippingLine: 'COSCO Shipping',
      POL: 'Ningbo Port',
      POD: 'Kolkata / Birgunj ICD',
      ContainerNo: 'CSNU7129834',
      BLAWBNo: 'COSU639920182',
      FreightAmountNPR: 82000,
      ETD: `${yr}-02-22`,
      ETA: `${yr}-03-18`,
      CustomsStatus: 'In Transit',
      ShipmentStatus: 'In Transit',
      Timestamp: ts,
    },
  ];

  base.Tenders = [
    {
      TenderNo: 'TND-2026-041',
      TenderName: 'Department of Health Services (DoHS)',
      Address: 'Teku, Kathmandu',
      ContactInfo: 'procurement@dohs.gov.np',
      PublicationDate: `${yr}-01-18`,
      SubmissionDeadline: `${yr}-02-28`,
      ItemName: 'Surgical Face Mask 3-Ply',
      Quantity: 10000,
      Unit: 'Boxes',
      EstimatedRate: 195,
      BidSecurityAmount: 50000,
      BidSecurityStatus: 'Submitted',
      Result: 'Win',
      Timestamp: ts,
    },
  ];

  base.TenderTracking = [
    {
      TrackingId: 'TRK-TND-2026-041',
      TenderNo: 'TND-2026-041',
      TenderName: 'Department of Health Services (DoHS)',
      Address: 'Teku, Kathmandu',
      ContactInfo: 'procurement@dohs.gov.np',
      LastSubmissionDate: `${yr}-02-28`,
      ItemName: 'Surgical Face Mask 3-Ply',
      Unit: 'Boxes',
      Quantity: 10000,
      RateIncVat: 195,
      Amount: 1950000,
      MuchulkaStatus: 'Completed',
      MuchulkaDate: `${yr}-03-02`,
      LOIStatus: 'Received',
      LOIDate: `${yr}-03-06`,
      LOAStatus: 'Issued',
      LOADate: `${yr}-03-10`,
      PGStatus: 'Submitted',
      PGDate: `${yr}-03-12`,
      SampleStatus: 'Approved',
      SampleDate: `${yr}-03-14`,
      ProductionStatus: 'In Progress',
      DispatchStatus: 'Not Dispatched',
      DispatchDate: '',
      Remarks: 'PG valid for 180 days',
      Timestamp: ts,
    },
  ];

  return base;
}

function todayIsoDate(offsetDays = 0): string {
  const d = new Date(Date.now() + offsetDays * 86400000);
  const m = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${d.getFullYear()}-${m}-${day}`;
}

function nowIso(): string {
  return new Date().toISOString().replace('T', ' ').slice(0, 19);
}

function roundQty(n: number): number {
  return Math.round((Number(n || 0) + Number.EPSILON) * 10000) / 10000;
}

function hashParts(parts: Array<string | number>): string {
  const raw = parts.map((p) => String(p ?? '')).join('|');
  let h = 2166136261;
  for (let i = 0; i < raw.length; i++) {
    h ^= raw.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return (h >>> 0).toString(16).padStart(8, '0');
}

function sha256Hex(input: string): string {
  const utf8 = unescape(encodeURIComponent(input));
  const K = [
    0x428a2f98, 0x71374491, 0xb5c0fbcf, 0xe9b5dba5, 0x3956c25b, 0x59f111f1, 0x923f82a4, 0xab1c5ed5,
    0xd807aa98, 0x12835b01, 0x243185be, 0x550c7dc3, 0x72be5d74, 0x80deb1fe, 0x9bdc06a7, 0xc19bf174,
    0xe49b69c1, 0xefbe4786, 0x0fc19dc6, 0x240ca1cc, 0x2de92c6f, 0x4a7484aa, 0x5cb0a9dc, 0x76f988da,
    0x983e5152, 0xa831c66d, 0xb00327c8, 0xbf597fc7, 0xc6e00bf3, 0xd5a79147, 0x06ca6351, 0x14292967,
    0x27b70a85, 0x2e1b2138, 0x4d2c6dfc, 0x53380d13, 0x650a7354, 0x766a0abb, 0x81c2c92e, 0x92722c85,
    0xa2bfe8a1, 0xa81a664b, 0xc24b8b70, 0xc76c51a3, 0xd192e819, 0xd6990624, 0xf40e3585, 0x106aa070,
    0x19a4c116, 0x1e376c08, 0x2748774c, 0x34b0bcb5, 0x391c0cb3, 0x4ed8aa4a, 0x5b9cca4f, 0x682e6ff3,
    0x748f82ee, 0x78a5636f, 0x84c87814, 0x8cc70208, 0x90befffa, 0xa4506ceb, 0xbef9a3f7, 0xc67178f2,
  ];
  const H = [0x6a09e667, 0xbb67ae85, 0x3c6ef372, 0xa54ff53a, 0x510e527f, 0x9b05688c, 0x1f83d9ab, 0x5be0cd19];
  const bytes: number[] = [];
  for (let i = 0; i < utf8.length; i++) bytes.push(utf8.charCodeAt(i) & 0xff);
  const bitLen = bytes.length * 8;
  bytes.push(0x80);
  while ((bytes.length % 64) !== 56) bytes.push(0);
  bytes.push(0, 0, 0, 0, (bitLen >>> 24) & 0xff, (bitLen >>> 16) & 0xff, (bitLen >>> 8) & 0xff, bitLen & 0xff);
  const rotr = (n: number, x: number) => (x >>> n) | (x << (32 - n));
  const w = new Array<number>(64);
  for (let i = 0; i < bytes.length; i += 64) {
    for (let t = 0; t < 16; t++) {
      const j = i + t * 4;
      w[t] = (bytes[j] << 24) | (bytes[j + 1] << 16) | (bytes[j + 2] << 8) | bytes[j + 3];
    }
    for (let t = 16; t < 64; t++) {
      const s0 = rotr(7, w[t - 15]) ^ rotr(18, w[t - 15]) ^ (w[t - 15] >>> 3);
      const s1 = rotr(17, w[t - 2]) ^ rotr(19, w[t - 2]) ^ (w[t - 2] >>> 10);
      w[t] = (w[t - 16] + s0 + w[t - 7] + s1) | 0;
    }
    let [a, b, c, d, e, f, g, h] = H;
    for (let t = 0; t < 64; t++) {
      const S1 = rotr(6, e) ^ rotr(11, e) ^ rotr(25, e);
      const ch = (e & f) ^ (~e & g);
      const temp1 = (h + S1 + ch + K[t] + w[t]) | 0;
      const S0 = rotr(2, a) ^ rotr(13, a) ^ rotr(22, a);
      const maj = (a & b) ^ (a & c) ^ (b & c);
      const temp2 = (S0 + maj) | 0;
      h = g;
      g = f;
      f = e;
      e = (d + temp1) | 0;
      d = c;
      c = b;
      b = a;
      a = (temp1 + temp2) | 0;
    }
    H[0] = (H[0] + a) | 0;
    H[1] = (H[1] + b) | 0;
    H[2] = (H[2] + c) | 0;
    H[3] = (H[3] + d) | 0;
    H[4] = (H[4] + e) | 0;
    H[5] = (H[5] + f) | 0;
    H[6] = (H[6] + g) | 0;
    H[7] = (H[7] + h) | 0;
  }
  return H.map((v) => (v >>> 0).toString(16).padStart(8, '0')).join('');
}

function createEmptyDb(seedCatalog = false): SimDb {
  const today = todayIsoDate();
  const db: SimDb = {
    version: 1,
    lastSyncAt: nowIso(),
    activeRole: 'Super Admin',
    activeSession: null,
    settings: {
      allowNegativeOverride: true,
      authorizeFinishedGoodsIssue: false,
      productionStrictFgOnly: false,
    },
    items: [],
    ledger: [],
    workingSheets: {
      Production: [],
      Dispatch: [],
      'Goods Reciept': [],
      Issue: [],
    },
    syncErrors: [],
    dailyReports: [],
    auditLogs: [],
    procurement: createDefaultProcurementDb(seedCatalog),
  };

  if (seedCatalog) {
    db.items = [
      {
        itemCode: '3001',
        itemName: 'Surgical Face Mask 3-Ply',
        category: 'Finished Goods',
        brand: 'Birat Care',
        hsnCode: '63079090',
        indexUnit: 'Pkt',
        fractionOfIndexUnit: 0.020833,
        conversionQty: 48,
        conversionUnit: 'Cartoon',
        reorderLevel: 96,
        status: 'Active',
        createdDate: today,
        updatedDate: today,
      },
      {
        itemCode: '3002',
        itemName: 'N95 Particulate Respirator',
        category: 'Finished Goods',
        brand: 'Birat Shield',
        hsnCode: '63079090',
        indexUnit: 'Pkt',
        fractionOfIndexUnit: 0.04,
        conversionQty: 25,
        conversionUnit: 'Cartoon',
        reorderLevel: 50,
        status: 'Active',
        createdDate: today,
        updatedDate: today,
      },
      {
        itemCode: '4001',
        itemName: 'Melt-Blown Filter Fabric 25 GSM',
        category: 'Raw Material',
        brand: 'Birat Raw',
        hsnCode: '56031200',
        indexUnit: 'KG',
        fractionOfIndexUnit: 1,
        conversionQty: 0,
        conversionUnit: '',
        reorderLevel: 50,
        status: 'Active',
        createdDate: today,
        updatedDate: today,
      },
      {
        itemCode: '4002',
        itemName: 'Spunbond Non-Woven PP Fabric (Blue)',
        category: 'Raw Material',
        brand: 'Birat Raw',
        hsnCode: '56031100',
        indexUnit: 'KG',
        fractionOfIndexUnit: 0.04,
        conversionQty: 25,
        conversionUnit: 'Roll',
        reorderLevel: 75,
        status: 'Active',
        createdDate: today,
        updatedDate: today,
      },
      {
        itemCode: '5001',
        itemName: 'Printed Inner Dispenser Box (50s)',
        category: 'Packing Material',
        brand: 'Birat Pack',
        hsnCode: '48192090',
        indexUnit: 'Pcs',
        fractionOfIndexUnit: 0.01,
        conversionQty: 100,
        conversionUnit: 'Bundle',
        reorderLevel: 200,
        status: 'Active',
        createdDate: today,
        updatedDate: today,
      },
      {
        itemCode: '5002',
        itemName: 'BOPP Packaging Film Roll',
        category: 'Packing Material',
        brand: 'Birat Pack',
        hsnCode: '39202020',
        indexUnit: 'Roll',
        fractionOfIndexUnit: 1,
        conversionQty: 0,
        conversionUnit: '',
        reorderLevel: 20,
        status: 'Active',
        createdDate: today,
        updatedDate: today,
      },
    ];
  }
  return db;
}

export class GasSimulatorEngine {
  private db: SimDb;
  private persist: boolean;
  private usedClientTokens = new Set<string>();

  constructor(persist = true, seedCatalog = true) {
    this.persist = persist;
    if (persist && typeof localStorage !== 'undefined') {
      const saved = localStorage.getItem(STORAGE_KEY);
      if (saved) {
        try {
          this.db = JSON.parse(saved);
          if (!this.db.procurement) {
            this.db.procurement = createDefaultProcurementDb(true);
            this.save();
          }
          if (!Array.isArray(this.db.procurement.ExchangeRates) || this.db.procurement.ExchangeRates.length === 0) {
            const cur = this.db.procurement.exchangeRates || { USD: 135.5, INR: 1.6015, EUR: 146.2, GBP: 172.8, CNY: 18.6, NPR: 1 };
            this.db.procurement.ExchangeRates = [
              {
                RateDate: todayIsoDate(),
                USD: cur.USD || 135.5,
                INR: cur.INR || 1.6015,
                EUR: cur.EUR || 146.2,
                GBP: cur.GBP || 172.8,
                CNY: cur.CNY || 18.6,
                NPR: 1.0,
                Remarks: 'Baseline rate',
                UpdatedBy: 'system',
                UpdatedAt: nowIso(),
              },
            ];
            this.save();
          }
          if (this.db.activeSession === undefined) {
            this.db.activeSession = null;
          }
          return;
        } catch {
          // fallback to fresh
        }
      }
    }
    this.db = createEmptyDb(seedCatalog);
    this.save();
  }

  private save() {
    if (this.persist && typeof localStorage !== 'undefined') {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(this.db));
    }
  }

  private bump() {
    this.db.version += 1;
    this.db.lastSyncAt = nowIso();
    this.save();
  }

  private ok(message: string, data: any = {}) {
    return {
      success: true,
      message,
      data,
      timestamp: new Date().toISOString(),
      version: this.db.version,
    };
  }

  private fail(message: string) {
    return {
      success: false,
      message,
      data: {},
      timestamp: new Date().toISOString(),
      version: this.db.version,
    };
  }

  private actor() {
    if (this.db.activeSession) {
      const s = this.db.activeSession;
      return {
        email: s.email,
        displayName: s.displayName,
        role: s.role,
        department: s.department,
        permissions: ROLE_PERMS[s.role] || [],
      };
    }
    const role = this.db.activeRole;
    return {
      email: 'dipen.khadka@birathralthcare.com',
      displayName: `Dipen Khadka (${role})`,
      role,
      department: '',
      permissions: ROLE_PERMS[role] || [],
    };
  }

  private assertPerm(perm: string) {
    const u = this.actor();
    if (!u.permissions.includes(perm)) {
      throw new Error(`Access denied: Role "${u.role}" lacks required permission (${perm}).`);
    }
    return u;
  }

  private audit(action: string, moduleName: string, targetId: string, summary: string) {
    const u = this.actor();
    this.db.auditLogs.push({
      auditId: `AUD-${Date.now()}-${Math.floor(Math.random() * 900 + 100)}`,
      timestamp: nowIso(),
      user: u.displayName,
      role: u.role,
      action,
      module: moduleName,
      targetId,
      summary,
    });
  }

  getDbSnapshot(): SimDb {
    return this.db;
  }

  setActiveRole(role: ErpRole) {
    this.db.activeRole = role;
    if (this.db.activeSession) {
      this.db.activeSession.role = role;
    }
    this.bump();
  }

  resetSandbox(seedCatalog: boolean) {
    this.db = createEmptyDb(seedCatalog);
    this.usedClientTokens.clear();
    this.save();
  }

  decomposeDualUOM(item: ItemRecord | undefined, baseQty: number) {
    const q = roundQty(baseQty);
    if (!item || !item.conversionUnit || !item.conversionQty || item.conversionQty <= 0) {
      return {
        baseQty: q,
        indexUnit: item?.indexUnit || '',
        hasSecondary: false,
        secondaryQty: 0,
        secondaryUnit: '',
        remainderQty: q,
        display: `${q} ${item?.indexUnit || ''}`.trim(),
      };
    }
    const sign = q < 0 ? -1 : 1;
    const absQ = Math.abs(q);
    const conv = item.conversionQty;
    let sec = Math.floor((absQ + 1e-9) / conv);
    let rem = roundQty(absQ - sec * conv);
    if (Math.abs(rem - conv) < 1e-6) {
      sec += 1;
      rem = 0;
    }
    sec *= sign;
    rem *= sign;
    const display = `${sec} ${item.conversionUnit}${rem !== 0 ? ` ${rem} ${item.indexUnit}` : ''}`;
    return {
      baseQty: q,
      indexUnit: item.indexUnit,
      hasSecondary: true,
      secondaryQty: sec,
      secondaryUnit: item.conversionUnit,
      remainderQty: rem,
      display,
    };
  }

  private convertToBase(item: ItemRecord, quantity: number, uom?: string) {
    const qty = Number(quantity);
    if (isNaN(qty) || qty <= 0) throw new Error('Quantity must be a positive number.');
    const u = String(uom || item.indexUnit).trim();
    if (u.toLowerCase() === item.indexUnit.toLowerCase()) {
      return {
        enteredQty: roundQty(qty),
        enteredUom: item.indexUnit,
        baseQty: roundQty(qty),
        dualDisplay: this.decomposeDualUOM(item, qty).display,
      };
    }
    if (item.conversionUnit && item.conversionQty > 0 && u.toLowerCase() === item.conversionUnit.toLowerCase()) {
      const base = roundQty(qty * item.conversionQty);
      return {
        enteredQty: roundQty(qty),
        enteredUom: item.conversionUnit,
        baseQty: base,
        dualDisplay: this.decomposeDualUOM(item, base).display,
      };
    }
    throw new Error(`Unsupported UOM "${u}" for item ${item.itemCode}.`);
  }

  private nextItemCode(category: string): string {
    const base = CATEGORY_PREFIXES[category];
    if (!base) throw new Error(`Invalid category "${category}".`);
    let maxCode = base - 1;
    const existing = new Set(this.db.items.map((i) => i.itemCode));
    for (const it of this.db.items) {
      if (it.category === category) {
        const n = parseInt(it.itemCode, 10);
        if (!isNaN(n) && n >= base && n > maxCode) maxCode = n;
      }
    }
    let cand = maxCode + 1;
    while (existing.has(String(cand))) cand++;
    return String(cand);
  }

  private calcStockMap(asOfDate?: string, excludeTxId?: string) {
    const map: Record<string, { item: ItemRecord; totalIn: number; totalOut: number; closing: number }> = {};
    for (const it of this.db.items) {
      map[it.itemCode] = { item: it, totalIn: 0, totalOut: 0, closing: 0 };
    }
    for (const tx of this.db.ledger) {
      if (tx.status !== 'ACTIVE') continue;
      if (excludeTxId && tx.txId === excludeTxId) continue;
      if (asOfDate && tx.txDate > asOfDate) continue;
      const rec = map[tx.itemCode];
      if (!rec) continue;
      if (tx.direction === 'IN') rec.totalIn = roundQty(rec.totalIn + tx.baseQty);
      else rec.totalOut = roundQty(rec.totalOut + tx.baseQty);
      rec.closing = roundQty(rec.totalIn - rec.totalOut);
    }
    return map;
  }

  private buildCategoryRegister(category: string | null, f: any = {}) {
    const targetDate = f.date || '';
    const monthF = f.month ? String(f.month).padStart(2, '0') : '';
    const yearF = f.year ? String(f.year) : '';
    let startDate = '';
    let endDate = '';
    if (targetDate) {
      startDate = targetDate;
      endDate = targetDate;
    } else if (yearF && monthF) {
      startDate = `${yearF}-${monthF}-01`;
      const lastD = new Date(Number(yearF), Number(monthF), 0).getDate();
      endDate = `${yearF}-${monthF}-${String(lastD).padStart(2, '0')}`;
    } else if (yearF) {
      startDate = `${yearF}-01-01`;
      endDate = `${yearF}-12-31`;
    }

    const q = (f.query || '').toLowerCase();
    const map: Record<string, { item: ItemRecord; opening: number; stockIn: number; stockOut: number; hasTx: boolean }> = {};
    for (const it of this.db.items) {
      if (category && it.category !== category) continue;
      if (f.brand && it.brand !== f.brand) continue;
      if (q && !it.itemCode.toLowerCase().includes(q) && !it.itemName.toLowerCase().includes(q)) continue;
      map[it.itemCode] = { item: it, opening: 0, stockIn: 0, stockOut: 0, hasTx: it.status === 'Active' };
    }

    for (const tx of this.db.ledger) {
      if (tx.status !== 'ACTIVE') continue;
      const rec = map[tx.itemCode];
      if (!rec) continue;
      rec.hasTx = true;
      const qty = roundQty(tx.baseQty);
      const isIn = tx.direction === 'IN';
      if (startDate && endDate) {
        if (tx.txDate < startDate) {
          rec.opening = roundQty(rec.opening + (isIn ? qty : -qty));
        } else if (tx.txDate >= startDate && tx.txDate <= endDate) {
          if (isIn) rec.stockIn = roundQty(rec.stockIn + qty);
          else rec.stockOut = roundQty(rec.stockOut + qty);
        }
      } else {
        if (tx.txType === 'OPENING_STOCK') rec.opening = roundQty(rec.opening + qty);
        else if (isIn) rec.stockIn = roundQty(rec.stockIn + qty);
        else rec.stockOut = roundQty(rec.stockOut + qty);
      }
    }

    return Object.values(map)
      .filter((e) => e.hasTx)
      .sort((a, b) => a.item.itemCode.localeCompare(b.item.itemCode))
      .map((e) => {
        const closing = roundQty(e.opening + e.stockIn - e.stockOut);
        const dual = this.decomposeDualUOM(e.item, closing);
        const stockStatus =
          closing <= 0
            ? 'Out of Stock'
            : e.item.reorderLevel > 0 && closing <= e.item.reorderLevel
            ? 'Low Stock'
            : 'In Stock';
        return {
          itemCode: e.item.itemCode,
          itemName: e.item.itemName,
          category: e.item.category,
          brand: e.item.brand,
          indexUnit: e.item.indexUnit,
          conversionUnit: e.item.conversionUnit,
          conversionQty: e.item.conversionQty,
          openingStock: e.opening,
          stockIn: e.stockIn,
          stockOut: e.stockOut,
          closingStock: closing,
          dualDisplay: dual.display,
          secondaryQty: dual.secondaryQty,
          remainderQty: dual.remainderQty,
          hasSecondary: dual.hasSecondary,
          reorderLevel: e.item.reorderLevel,
          stockStatus,
        };
      });
  }

  private computeDailyReportSnapshot(d: string) {
    const fg = this.buildCategoryRegister('Finished Goods', { date: d });
    const rm = this.buildCategoryRegister('Raw Material', { date: d });
    const pm = this.buildCategoryRegister('Packing Material', { date: d });
    const all = [...fg, ...rm, ...pm];
    let inTx = 0;
    let outTx = 0;
    for (const tx of this.db.ledger) {
      if (tx.status !== 'ACTIVE' || tx.txDate !== d) continue;
      if (tx.direction === 'IN') inTx++;
      else outTx++;
    }
    return {
      reportDate: d,
      generatedAt: nowIso(),
      finishedGoods: fg,
      rawMaterial: rm,
      packingMaterial: pm,
      summary: {
        totalActiveItems: all.length,
        stockInTransactions: inTx,
        stockOutTransactions: outTx,
        belowReorderCount: all.filter((r) => r.reorderLevel > 0 && r.closingStock <= r.reorderLevel).length,
        zeroBalanceCount: all.filter((r) => r.closingStock <= 0).length,
      },
    };
  }

  private nextTxId(txType: string): string {
    const pMap: Record<string, string> = {
      PRODUCTION: 'PRD',
      GOODS_RECEIPT: 'GRN',
      DISPATCH: 'DSP',
      ISSUE: 'ISS',
      OPENING_STOCK: 'OPN',
      ADJUSTMENT: 'ADJ',
    };
    const p = pMap[txType] || 'TRX';
    const dt = todayIsoDate().replace(/-/g, '');
    const ids = new Set(this.db.ledger.map((l) => l.txId));
    let seq = this.db.ledger.filter((l) => l.txId.startsWith(p)).length + 1;
    let cand = `${p}-${dt}-${String(seq).padStart(4, '0')}`;
    while (ids.has(cand)) {
      seq++;
      cand = `${p}-${dt}-${String(seq).padStart(4, '0')}`;
    }
    return cand;
  }

  private validateTx(txInput: any, excludeTxId?: string, allowInactive = false) {
    const txType = String(txInput.txType || '');
    const txDate = String(txInput.txDate || '');
    const itemCode = String(txInput.itemCode || '').trim();
    if (!/^\d{4}-\d{2}-\d{2}$/.test(txDate)) throw new Error('Valid date (YYYY-MM-DD) is required.');
    const item = this.db.items.find((i) => i.itemCode === itemCode);
    if (!item) throw new Error(`Item Code "${itemCode}" not found in Item Master.`);
    if (!allowInactive && item.status !== 'Active') {
      throw new Error(`Item "${item.itemCode} - ${item.itemName}" is Inactive.`);
    }

    if (txType === 'PRODUCTION' && !['Finished Goods', 'WIP', 'Packing Material'].includes(item.category)) {
      throw new Error(`Category "${item.category}" is not allowed in Production.`);
    }
    if (txType === 'DISPATCH' && item.category !== 'Finished Goods') {
      throw new Error(`Dispatch only supports Finished Goods ("${item.itemName}" is ${item.category}).`);
    }
    if (txType === 'ISSUE' && item.category === 'Finished Goods' && !this.db.settings.authorizeFinishedGoodsIssue) {
      throw new Error('Issuing Finished Goods is not authorized in System Settings.');
    }

    let conv;
    if (txType === 'DISPATCH' && (Number(txInput.secondaryQty || 0) > 0 || Number(txInput.indexQty || 0) > 0) && !txInput.quantity) {
      const sec = Number(txInput.secondaryQty || 0);
      const idx = Number(txInput.indexQty || 0);
      if (sec < 0 || idx < 0 || (sec === 0 && idx === 0)) throw new Error('Dispatch quantities must be positive.');
      if (sec > 0 && (!item.conversionUnit || item.conversionQty <= 0)) {
        throw new Error(`Item "${item.itemName}" has no secondary conversion configured.`);
      }
      const base = roundQty(sec * (item.conversionQty || 0) + idx);
      conv = { enteredQty: base, enteredUom: item.indexUnit, baseQty: base, dualDisplay: this.decomposeDualUOM(item, base).display };
    } else {
      conv = this.convertToBase(item, txInput.quantity, txInput.uom);
    }

    const direction: 'IN' | 'OUT' =
      txType === 'PRODUCTION' || txType === 'GOODS_RECEIPT' || txType === 'OPENING_STOCK' ? 'IN' : 'OUT';

    if (direction === 'OUT') {
      const sMap = this.calcStockMap(undefined, excludeTxId);
      const avail = sMap[item.itemCode]?.closing || 0;
      if (avail + 1e-9 < conv.baseQty) {
        const canOverride =
          Boolean(txInput.allowNegativeOverride) &&
          this.db.settings.allowNegativeOverride &&
          this.actor().permissions.includes('NEGATIVE_OVERRIDE');
        if (!canOverride) {
          throw new Error(
            `Insufficient stock for ${item.itemCode} (${item.itemName}). Available: ${this.decomposeDualUOM(item, avail).display}, Requested: ${conv.dualDisplay}.`
          );
        }
      }
    }

    return { item, txType, txDate, direction, conv };
  }

  /* ========================================================================
     PUBLIC GAS RPC API METHODS (INVOKED BY INDEX.HTML)
     ======================================================================== */
  invoke(fnName: string, args: any[]): any {
    try {
      switch (fnName) {
        case 'loginUser': {
          const cleanId = String(args[0] || '').trim().toLowerCase();
          const cleanPass = String(args[1] || '');
          if (!cleanId || !cleanPass) {
            return this.fail('Please enter both User ID and Password.');
          }
          const acc = AUTH_ACCOUNTS.find(
            (a) => a.email.toLowerCase() === cleanId || a.aliases.some((al) => al.toLowerCase() === cleanId)
          );
          if (!acc || sha256Hex(cleanPass) !== acc.passwordHash) {
            return this.fail('Invalid User ID or password. Please verify your credentials.');
          }
          const token = `SIM-${Date.now()}-${Math.random().toString(36).slice(2, 10)}`;
          const session: SimAuthSession = {
            token,
            email: acc.email,
            displayName: acc.displayName,
            role: acc.role,
            department: acc.department,
            loginAt: nowIso(),
            expiresAt: new Date(Date.now() + 21600 * 1000).toISOString(),
          };
          this.db.activeSession = session;
          this.db.activeRole = acc.role;
          this.audit('USER_LOGIN', 'Authentication', acc.email, `User signed into ERP portal as ${acc.role}`);
          this.save();
          return this.ok('Signed in successfully.', {
            token,
            user: {
              authenticated: true,
              displayName: acc.displayName,
              email: acc.email,
              role: acc.role,
              department: acc.department,
              permissions: ROLE_PERMS[acc.role] || [],
              pollIntervalSec: 30,
              allowNegativeOverride: this.db.settings.allowNegativeOverride,
              authorizeFinishedGoodsIssue: this.db.settings.authorizeFinishedGoodsIssue,
            },
          });
        }
        case 'logoutUser': {
          if (this.db.activeSession) {
            this.audit('USER_LOGOUT', 'Authentication', this.db.activeSession.email, 'User signed out of ERP portal');
          }
          this.db.activeSession = null;
          this.save();
          return this.ok('Signed out successfully.', { authenticated: false });
        }
        case 'getCurrentUserContext': {
          const token = String(args[0] || '').trim();
          const s = this.db.activeSession;
          if (!token || !s || s.token !== token || (s.expiresAt && new Date(s.expiresAt).getTime() < Date.now())) {
            return this.ok('Authentication required.', { authenticated: false });
          }
          return this.ok('User context loaded.', {
            authenticated: true,
            displayName: s.displayName,
            email: s.email,
            role: s.role,
            department: s.department,
            permissions: ROLE_PERMS[s.role] || [],
            pollIntervalSec: 30,
            allowNegativeOverride: this.db.settings.allowNegativeOverride,
            authorizeFinishedGoodsIssue: this.db.settings.authorizeFinishedGoodsIssue,
          });
        }
        case 'checkDataVersion': {
          const clientVer = Number(args[0] || 0);
          return this.ok('Version checked.', {
            changed: clientVer !== this.db.version,
            serverVersion: this.db.version,
            lastSyncAt: this.db.lastSyncAt,
          });
        }
        case 'getAllItems': {
          const brands = Array.from(new Set(this.db.items.map((i) => i.brand).filter(Boolean))).sort();
          return this.ok('Items fetched.', {
            items: this.db.items,
            total: this.db.items.length,
            brands,
            categories: FIXED_CATEGORIES,
          });
        }
        case 'generateItemCode': {
          return this.ok('Next item code generated.', {
            itemCode: this.nextItemCode(String(args[0])),
            category: args[0],
          });
        }
        case 'addItem': {
          this.assertPerm('ITEM_MANAGE');
          const p = args[0] || {};
          const name = String(p.itemName || '').trim();
          const cat = String(p.category || '').trim();
          const idxU = String(p.indexUnit || '').trim();
          const convU = String(p.conversionUnit || '').trim();
          let convQ = Number(p.conversionQty || 0);
          if (!name || !idxU || !FIXED_CATEGORIES.includes(cat)) {
            throw new Error('Item Name, Fixed Category, and Index Unit are required.');
          }
          if (this.db.items.some((i) => i.category === cat && i.itemName.toLowerCase() === name.toLowerCase())) {
            throw new Error(`Duplicate item "${name}" in ${cat}.`);
          }
          let frac = 1;
          if (convU) {
            if (convU.toLowerCase() === idxU.toLowerCase()) throw new Error('Conversion Unit must differ from Index Unit.');
            if (convQ <= 0) throw new Error('Conversion Qty must be > 0.');
            frac = Math.round((1 / convQ) * 1000000) / 1000000;
          } else {
            convQ = 0;
          }
          const code = this.nextItemCode(cat);
          const today = todayIsoDate();
          this.db.items.push({
            itemCode: code,
            itemName: name,
            category: cat,
            brand: String(p.brand || '').trim(),
            hsnCode: String(p.hsnCode || '').trim(),
            indexUnit: idxU,
            fractionOfIndexUnit: frac,
            conversionQty: convQ,
            conversionUnit: convU,
            reorderLevel: Math.max(0, Number(p.reorderLevel || 0)),
            status: 'Active',
            createdDate: today,
            updatedDate: today,
          });
          this.audit('ADD_ITEM', 'Item Master', code, `Created item ${code} - ${name}`);
          this.bump();
          return this.ok(`Item created with Item Code ${code}.`, { itemCode: code });
        }
        case 'updateItem': {
          this.assertPerm('ITEM_MANAGE');
          const p = args[0] || {};
          const it = this.db.items.find((i) => i.itemCode === String(p.itemCode));
          if (!it) throw new Error('Item not found.');
          const name = String(p.itemName || '').trim();
          const idxU = String(p.indexUnit || '').trim();
          const convU = String(p.conversionUnit || '').trim();
          const convQ = Number(p.conversionQty || 0);
          if (!name || !idxU) throw new Error('Item Name and Index Unit are required.');
          if (this.db.items.some((i) => i.itemCode !== it.itemCode && i.category === it.category && i.itemName.toLowerCase() === name.toLowerCase())) {
            throw new Error('Another item in this category already uses that name.');
          }
          it.itemName = name;
          it.brand = String(p.brand || '').trim();
          it.hsnCode = String(p.hsnCode || '').trim();
          it.indexUnit = idxU;
          it.conversionUnit = convU;
          it.conversionQty = convU ? convQ : 0;
          it.fractionOfIndexUnit = convU && convQ > 0 ? Math.round((1 / convQ) * 1000000) / 1000000 : 1;
          it.reorderLevel = Math.max(0, Number(p.reorderLevel || 0));
          it.updatedDate = todayIsoDate();
          this.audit('UPDATE_ITEM', 'Item Master', it.itemCode, `Updated ${it.itemCode}`);
          this.bump();
          return this.ok(`Item ${it.itemCode} updated.`, { itemCode: it.itemCode });
        }
        case 'setItemStatus': {
          this.assertPerm('ITEM_MANAGE');
          const it = this.db.items.find((i) => i.itemCode === String(args[0]));
          if (!it) throw new Error('Item not found.');
          it.status = String(args[1]).toLowerCase() === 'inactive' ? 'Inactive' : 'Active';
          it.updatedDate = todayIsoDate();
          this.audit('SET_ITEM_STATUS', 'Item Master', it.itemCode, `Set status to ${it.status}`);
          this.bump();
          return this.ok(`Item ${it.itemCode} marked as ${it.status}.`, { itemCode: it.itemCode, status: it.status });
        }
        case 'deleteItem': {
          this.assertPerm('ITEM_MANAGE');
          const code = String(args[0] || '').trim();
          const idx = this.db.items.findIndex((i) => i.itemCode === code);
          if (idx === -1) throw new Error('Item not found.');
          if (this.db.ledger.some((l) => l.itemCode === code)) {
            throw new Error(`Cannot permanently delete item ${code} because it has transaction history. Please deactivate it instead.`);
          }
          const removed = this.db.items.splice(idx, 1)[0];
          this.audit('DELETE_ITEM', 'Item Master', code, `Deleted unused item ${code} - ${removed.itemName}`);
          this.bump();
          return this.ok(`Item ${code} permanently deleted.`, { itemCode: code });
        }
        case 'getStockByItem': {
          const code = String(args[0] || '').trim();
          const sMap = this.calcStockMap();
          const rec = sMap[code];
          if (!rec) throw new Error('Item not found.');
          const dual = this.decomposeDualUOM(rec.item, rec.closing);
          return this.ok('Item stock retrieved.', {
            itemCode: rec.item.itemCode,
            itemName: rec.item.itemName,
            category: rec.item.category,
            closingStock: rec.closing,
            indexUnit: rec.item.indexUnit,
            dualDisplay: dual.display,
            secondaryQty: dual.secondaryQty,
            remainderQty: dual.remainderQty,
            reorderLevel: rec.item.reorderLevel,
          });
        }
        case 'saveProduction':
        case 'saveDispatch':
        case 'saveGoodsReceipt':
        case 'saveIssue': {
          const typeMap: Record<string, string> = {
            saveProduction: 'PRODUCTION',
            saveDispatch: 'DISPATCH',
            saveGoodsReceipt: 'GOODS_RECEIPT',
            saveIssue: 'ISSUE',
          };
          const permMap: Record<string, string> = {
            PRODUCTION: 'PRODUCTION_WRITE',
            DISPATCH: 'DISPATCH_WRITE',
            GOODS_RECEIPT: 'RECEIPT_WRITE',
            ISSUE: 'ISSUE_WRITE',
          };
          const txType = typeMap[fnName];
          const actor = this.assertPerm(permMap[txType]);
          const p = { ...(args[0] || {}), txType };
          if (p.clientToken) {
            if (this.usedClientTokens.has(p.clientToken)) {
              throw new Error('Duplicate submission detected.');
            }
            this.usedClientTokens.add(p.clientToken);
          }
          const v = this.validateTx(p);
          const txId = this.nextTxId(txType);
          const ts = nowIso();
          const sheetMap: Record<string, string> = {
            PRODUCTION: 'Production',
            DISPATCH: 'Dispatch',
            GOODS_RECEIPT: 'Goods Reciept',
            ISSUE: 'Issue',
          };
          const srcSheet = sheetMap[txType];
          const srcRow = this.db.workingSheets[srcSheet].length + 2;
          const recHash = hashParts([txId, v.txDate, v.item.itemCode, v.conv.enteredQty, v.conv.enteredUom, 'ACTIVE']);

          this.db.workingSheets[srcSheet].push({
            txId,
            txDate: v.txDate,
            itemCode: v.item.itemCode,
            quantity: v.conv.enteredQty,
            uom: v.conv.enteredUom,
            partyOrSection: p.partyOrSection || '',
            refNo: p.refNo || '',
            batchNo: p.batchNo || '',
            remarks: p.remarks || '',
            status: 'ACTIVE',
            syncStatus: 'SYNCED',
          });

          const enrichedMeta = this.enrichTxRateMeta(v.txDate, v.conv.enteredQty, p.meta);

          this.db.ledger.push({
            txId,
            txType: txType as any,
            txDate: v.txDate,
            itemCode: v.item.itemCode,
            itemName: v.item.itemName,
            category: v.item.category,
            brand: v.item.brand,
            enteredQty: v.conv.enteredQty,
            enteredUom: v.conv.enteredUom,
            baseQty: v.conv.baseQty,
            direction: v.direction,
            sourceSheet: srcSheet,
            sourceRow: srcRow,
            batchNo: p.batchNo || '',
            refNo: p.refNo || '',
            partyOrSection: p.partyOrSection || '',
            metaJson: JSON.stringify(enrichedMeta),
            remarks: p.remarks || '',
            createdBy: actor.displayName,
            createdAt: ts,
            updatedBy: actor.displayName,
            updatedAt: ts,
            status: 'ACTIVE',
            recordHash: recHash,
          });
          this.audit('CREATE_TX', txType, txId, `${txType} ${v.conv.dualDisplay} of ${v.item.itemCode}`);
          if (txType === 'GOODS_RECEIPT' && p.meta && p.meta.poNo) {
            try {
              const po = this.db.procurement.PurchaseOrders.find(
                (r) => String(r.PONo) === String(p.meta.poNo)
              );
              if (po) {
                let items: any[] = [];
                try {
                  items = JSON.parse(po.ItemsJSON || '[]');
                } catch {}
                let orderedQty = 0;
                if (Array.isArray(items) && items.length > 0) {
                  for (const it of items) orderedQty += Number(it.qty || 0);
                }
                if (orderedQty <= 0) {
                  orderedQty = Number(po.ReceivedQty || 0) + Number(po.PendingQty || 0) || Number(v.conv.baseQty || 0);
                }
                const newRec = roundQty(Number(po.ReceivedQty || 0) + Number(v.conv.baseQty || 0));
                const newPend = Math.max(0, roundQty(orderedQty - newRec));
                po.ReceivedQty = newRec;
                po.PendingQty = newPend;
                po.ReceivedStatus = newPend <= 1e-6 ? 'Fully Received' : 'Partially Received';
                po.Timestamp = new Date().toISOString();
              }
            } catch {}
          }
          this.bump();
          return this.ok(`Transaction ${txId} saved successfully.`, {
            txId,
            itemCode: v.item.itemCode,
            baseQty: v.conv.baseQty,
            dualDisplay: v.conv.dualDisplay,
          });
        }
        case 'getProductionRecords':
        case 'getDispatchRecords':
        case 'getGoodsReceiptRecords':
        case 'getIssueRecords': {
          const typeMap: Record<string, string> = {
            getProductionRecords: 'PRODUCTION',
            getDispatchRecords: 'DISPATCH',
            getGoodsReceiptRecords: 'GOODS_RECEIPT',
            getIssueRecords: 'ISSUE',
          };
          const f = args[0] || {};
          const txType = typeMap[fnName];
          const itemMap = Object.fromEntries(this.db.items.map((i) => [i.itemCode, i]));
          const q = (f.query || '').toLowerCase();
          const filtered = this.db.ledger
            .filter((tx) => {
              if (tx.txType !== txType) return false;
              if (f.startDate && tx.txDate < f.startDate) return false;
              if (f.endDate && tx.txDate > f.endDate) return false;
              if (
                q &&
                !tx.txId.toLowerCase().includes(q) &&
                !tx.itemCode.toLowerCase().includes(q) &&
                !tx.itemName.toLowerCase().includes(q) &&
                !tx.refNo.toLowerCase().includes(q)
              ) {
                return false;
              }
              return true;
            })
            .sort((a, b) => (a.txDate !== b.txDate ? b.txDate.localeCompare(a.txDate) : b.createdAt.localeCompare(a.createdAt)));

          const page = Number(f.page || 1);
          const pageSize = Number(f.pageSize || 25);
          const paged = filtered.slice((page - 1) * pageSize, page * pageSize).map((tx) => {
            const it = itemMap[tx.itemCode];
            return {
              ...this.attachTxRateFields(tx),
              indexUnit: it ? it.indexUnit : tx.enteredUom,
              dualDisplay: it ? this.decomposeDualUOM(it, tx.baseQty).display : `${tx.baseQty} ${tx.enteredUom}`,
            };
          });
          return this.ok('Transactions loaded.', { records: paged, total: filtered.length, page, pageSize });
        }
        case 'getTransactionById': {
          const tx = this.db.ledger.find((l) => l.txId === String(args[0]));
          if (!tx) throw new Error('Transaction not found.');
          return this.ok('Transaction found.', { transaction: this.attachTxRateFields({ ...tx }) });
        }
        case 'updateTransaction': {
          const actor = this.assertPerm('TX_EDIT');
          const txId = String(args[0]);
          const u = args[1] || {};
          const tx = this.db.ledger.find((l) => l.txId === txId);
          if (!tx) throw new Error('Transaction not found.');
          if (tx.status !== 'ACTIVE') throw new Error('Cannot edit cancelled transaction.');
          let oldMeta: Record<string, any> = {};
          try { oldMeta = JSON.parse(tx.metaJson || '{}'); } catch {}
          const mergedMeta = { ...oldMeta, ...(u.meta || {}) };
          const merged = {
            txType: tx.txType,
            txDate: u.txDate ?? tx.txDate,
            itemCode: tx.itemCode,
            quantity: u.quantity ?? tx.enteredQty,
            uom: u.uom ?? tx.enteredUom,
            refNo: u.refNo ?? tx.refNo,
            partyOrSection: u.partyOrSection ?? tx.partyOrSection,
            remarks: u.remarks ?? tx.remarks,
            meta: mergedMeta,
          };
          const v = this.validateTx(merged, tx.txId, true);
          if (v.direction === 'IN' && v.conv.baseQty < tx.baseQty) {
            const without = this.calcStockMap(undefined, tx.txId);
            const cur = without[v.item.itemCode]?.closing || 0;
            if (cur + v.conv.baseQty < -1e-9) {
              throw new Error('Cannot reduce receipt/production below already dispatched/issued quantity.');
            }
          }
          const prevQty = tx.baseQty;
          const updatedMeta = this.enrichTxRateMeta(v.txDate, v.conv.enteredQty, mergedMeta);
          tx.txDate = v.txDate;
          tx.enteredQty = v.conv.enteredQty;
          tx.enteredUom = v.conv.enteredUom;
          tx.baseQty = v.conv.baseQty;
          tx.refNo = merged.refNo;
          tx.partyOrSection = merged.partyOrSection;
          tx.metaJson = JSON.stringify(updatedMeta);
          tx.remarks = merged.remarks;
          tx.updatedBy = actor.displayName;
          tx.updatedAt = nowIso();
          tx.recordHash = hashParts([tx.txId, tx.txDate, tx.itemCode, tx.enteredQty, tx.enteredUom, 'ACTIVE']);

          const wsRow = this.db.workingSheets[tx.sourceSheet]?.find((r) => r.txId === tx.txId);
          if (wsRow) {
            wsRow.txDate = tx.txDate;
            wsRow.quantity = tx.enteredQty;
            wsRow.uom = tx.enteredUom;
            wsRow.refNo = tx.refNo;
            wsRow.partyOrSection = tx.partyOrSection;
            wsRow.remarks = tx.remarks;
          }
          this.audit('UPDATE_TX', tx.txType, tx.txId, `Updated base qty from ${prevQty} to ${tx.baseQty}`);
          this.bump();
          return this.ok(`Transaction ${tx.txId} updated.`, { txId: tx.txId, baseQty: tx.baseQty });
        }
        case 'cancelTransaction': {
          const actor = this.assertPerm('TX_CANCEL');
          const txId = String(args[0]);
          const reason = String(args[1] || '');
          const tx = this.db.ledger.find((l) => l.txId === txId);
          if (!tx) throw new Error('Transaction not found.');
          if (tx.status === 'CANCELLED') throw new Error('Transaction is already cancelled.');
          if (tx.direction === 'IN') {
            const without = this.calcStockMap(undefined, tx.txId);
            const rem = without[tx.itemCode]?.closing || 0;
            if (rem < -1e-9 && !this.db.settings.allowNegativeOverride) {
              throw new Error('Cannot cancel IN transaction: stock already consumed.');
            }
          }
          tx.status = 'CANCELLED';
          tx.updatedBy = actor.displayName;
          tx.updatedAt = nowIso();
          if (reason) tx.remarks = `${tx.remarks ? `${tx.remarks} | ` : ''}Cancelled: ${reason}`;
          tx.recordHash = hashParts([tx.txId, tx.txDate, tx.itemCode, tx.enteredQty, tx.enteredUom, 'CANCELLED']);
          const wsRow = this.db.workingSheets[tx.sourceSheet]?.find((r) => r.txId === tx.txId);
          if (wsRow) wsRow.status = 'CANCELLED';
          this.audit('CANCEL_TX', tx.txType, tx.txId, `Cancelled transaction (${reason || 'No reason'})`);
          this.bump();
          return this.ok(`Transaction ${tx.txId} cancelled and stock reversed.`, { txId: tx.txId });
        }
        case 'getFinishedGoodsStock':
          this.assertPerm('STOCK_VIEW');
          return this.ok('FG stock loaded.', { rows: this.buildCategoryRegister('Finished Goods', args[0]) });
        case 'getRawMaterialStock':
          this.assertPerm('STOCK_VIEW');
          return this.ok('RM stock loaded.', { rows: this.buildCategoryRegister('Raw Material', args[0]) });
        case 'getPackingMaterialStock':
          this.assertPerm('STOCK_VIEW');
          return this.ok('PM stock loaded.', { rows: this.buildCategoryRegister('Packing Material', args[0]) });
        case 'getAllStockBalance': {
          this.assertPerm('STOCK_VIEW');
          const rows = this.buildCategoryRegister(null, args[0]);
          return this.ok('All Stock Balance loaded.', {
            rows,
            sections: {
              finishedGoods: rows.filter((r) => r.category === 'Finished Goods'),
              rawMaterial: rows.filter((r) => r.category === 'Raw Material'),
              packingMaterial: rows.filter((r) => r.category === 'Packing Material'),
              others: rows.filter(
                (r) => r.category !== 'Finished Goods' && r.category !== 'Raw Material' && r.category !== 'Packing Material'
              ),
            },
          });
        }
        case 'generateDailyStockReport': {
          this.assertPerm('REPORT_GENERATE');
          const d = args[0] || todayIsoDate();
          const snap: any = this.computeDailyReportSnapshot(d);
          const sub = [...this.db.dailyReports].reverse().find((r) => r.reportDate === d);
          snap.submittedInfo = sub || null;
          return this.ok(`Daily Stock Report generated for ${d}.`, snap);
        }
        case 'submitDailyReport': {
          const actor = this.assertPerm('REPORT_SUBMIT');
          const d = args[0] || todayIsoDate();
          const snap = this.computeDailyReportSnapshot(d);
          const reportId = `DSR-${d.replace(/-/g, '')}-${Date.now().toString().slice(-4)}`;
          const rec: DailyReportRecord = {
            reportId,
            reportDate: d,
            submittedBy: actor.displayName,
            submittedAt: nowIso(),
            totalActiveItems: snap.summary.totalActiveItems,
            stockInTransactions: snap.summary.stockInTransactions,
            stockOutTransactions: snap.summary.stockOutTransactions,
            belowReorderCount: snap.summary.belowReorderCount,
            zeroBalanceCount: snap.summary.zeroBalanceCount,
            snapshot: snap,
            status: 'SUBMITTED',
          };
          this.db.dailyReports.push(rec);
          this.audit('SUBMIT_DAILY_REPORT', 'Reporting', reportId, `Submitted report for ${d}`);
          this.bump();
          return this.ok(`Daily Stock Report ${reportId} submitted and locked.`, rec);
        }
        case 'getHistoricalReport': {
          this.assertPerm('REPORT_GENERATE');
          const target = args[0];
          const hist = [...this.db.dailyReports].reverse().map((r) => ({
            reportId: r.reportId,
            reportDate: r.reportDate,
            submittedBy: r.submittedBy,
            submittedAt: r.submittedAt,
            totalActiveItems: r.totalActiveItems,
            stockInTransactions: r.stockInTransactions,
            stockOutTransactions: r.stockOutTransactions,
            belowReorderCount: r.belowReorderCount,
            zeroBalanceCount: r.zeroBalanceCount,
          }));
          let snapshot: any = null;
          if (target) {
            const match = [...this.db.dailyReports].reverse().find((r) => r.reportDate === target);
            snapshot = match ? { ...match.snapshot, submittedInfo: match } : this.computeDailyReportSnapshot(target);
          }
          return this.ok('Historical reports loaded.', { history: hist, snapshot });
        }
        case 'exportReport': {
          this.assertPerm('REPORT_GENERATE');
          const d = args[0] || todayIsoDate();
          const snap = this.computeDailyReportSnapshot(d);
          const xmlEsc = (v: any) =>
            String(v ?? '')
              .replace(/&/g, '&amp;')
              .replace(/</g, '&lt;')
              .replace(/>/g, '&gt;')
              .replace(/"/g, '&quot;');
          const buildSheet = (name: string, inCol: string, outCol: string, list: any[]) => {
            const rows: any[][] = [
              [`Birat Healthcare Industries Pvt. Ltd. - Daily Stock Report (${name})`],
              ['Report Date', d, 'Generated At', snap.generatedAt],
              [],
              ['Item Code', 'Item Name', 'Brand', 'Opening', inCol, outCol, 'Closing', 'Index Unit', 'Secondary'],
            ];
            for (const r of list) {
              rows.push([r.itemCode, r.itemName, r.brand || '', r.openingStock, r.stockIn, r.stockOut, r.closingStock, r.indexUnit, r.dualDisplay]);
            }
            return `<Worksheet ss:Name="${xmlEsc(name)}"><Table>${rows
              .map(
                (row) =>
                  `<Row>${row
                    .map((cell) => {
                      const isNum = typeof cell === 'number' && !Number.isNaN(cell);
                      return `<Cell><Data ss:Type="${isNum ? 'Number' : 'String'}">${xmlEsc(cell)}</Data></Cell>`;
                    })
                    .join('')}</Row>`
              )
              .join('')}</Table></Worksheet>`;
          };
          const xlsContent =
            `<?xml version="1.0" encoding="UTF-8"?><?mso-application progid="Excel.Sheet"?>` +
            `<Workbook xmlns="urn:schemas-microsoft-com:office:spreadsheet" xmlns:ss="urn:schemas-microsoft-com:office:spreadsheet">` +
            buildSheet('Finished Goods', 'Production', 'Dispatch', snap.finishedGoods) +
            buildSheet('Raw Material', 'Receipt', 'Issue', snap.rawMaterial) +
            buildSheet('Packing Material', 'Receipt', 'Issue', snap.packingMaterial) +
            `</Workbook>`;
          return this.ok('Excel export ready.', { filename: `Birat_Daily_Stock_Report_${d}.xls`, xlsContent, snapshot: snap });
        }
        case 'getDashboardData': {
          this.assertPerm('STOCK_VIEW');
          const allStock = this.buildCategoryRegister(null, {});
          const today = todayIsoDate();
          const activeItems = this.db.items.filter((i) => i.status === 'Active').length;
          let fgBal = 0, rmBal = 0, pmBal = 0, lowCount = 0;
          const catSummary: Record<string, number> = {};
          for (const r of allStock) {
            if (r.category === 'Finished Goods') fgBal = roundQty(fgBal + r.closingStock);
            else if (r.category === 'Raw Material') rmBal = roundQty(rmBal + r.closingStock);
            else if (r.category === 'Packing Material') pmBal = roundQty(pmBal + r.closingStock);
            if (r.reorderLevel > 0 && r.closingStock <= r.reorderLevel) lowCount++;
            catSummary[r.category] = roundQty((catSummary[r.category] || 0) + r.closingStock);
          }
          let tProd = 0, tRec = 0, tDisp = 0, tIss = 0;
          const last14: Record<string, { prod: number; disp: number; rec: number; iss: number }> = {};
          for (let d = 13; d >= 0; d--) {
            last14[todayIsoDate(-d)] = { prod: 0, disp: 0, rec: 0, iss: 0 };
          }
          const monthly: Record<string, { stockIn: number; stockOut: number }> = {};
          for (const tx of this.db.ledger) {
            if (tx.status !== 'ACTIVE') continue;
            if (tx.txDate === today) {
              if (tx.txType === 'PRODUCTION') tProd = roundQty(tProd + tx.baseQty);
              else if (tx.txType === 'GOODS_RECEIPT') tRec = roundQty(tRec + tx.baseQty);
              else if (tx.txType === 'DISPATCH') tDisp = roundQty(tDisp + tx.baseQty);
              else if (tx.txType === 'ISSUE') tIss = roundQty(tIss + tx.baseQty);
            }
            if (last14[tx.txDate]) {
              if (tx.txType === 'PRODUCTION') last14[tx.txDate].prod += tx.baseQty;
              else if (tx.txType === 'DISPATCH') last14[tx.txDate].disp += tx.baseQty;
              else if (tx.txType === 'GOODS_RECEIPT') last14[tx.txDate].rec += tx.baseQty;
              else if (tx.txType === 'ISSUE') last14[tx.txDate].iss += tx.baseQty;
            }
            const ym = tx.txDate.slice(0, 7);
            if (!monthly[ym]) monthly[ym] = { stockIn: 0, stockOut: 0 };
            if (tx.direction === 'IN') monthly[ym].stockIn += tx.baseQty;
            else monthly[ym].stockOut += tx.baseQty;
          }
          const labels14 = Object.keys(last14);
          const mLabels = Object.keys(monthly).sort().slice(-6);
          return this.ok('Dashboard loaded.', {
            cards: {
              totalActiveItems: activeItems,
              finishedGoodsBalance: fgBal,
              rawMaterialBalance: rmBal,
              packingMaterialBalance: pmBal,
              todayProduction: tProd,
              todayGoodsReceipt: tRec,
              todayDispatch: tDisp,
              todayIssue: tIss,
              lowStockItems: lowCount,
              pendingSyncErrors: this.db.syncErrors.filter((e) => e.status === 'OPEN').length,
            },
            charts: {
              dailyTrendLabels: labels14,
              dailyProduction: labels14.map((k) => last14[k].prod),
              dailyDispatch: labels14.map((k) => last14[k].disp),
              dailyReceipt: labels14.map((k) => last14[k].rec),
              dailyIssue: labels14.map((k) => last14[k].iss),
              categorySummary: catSummary,
              top10Items: [...allStock].sort((a, b) => b.closingStock - a.closingStock).slice(0, 10).map((x) => ({ name: x.itemName, qty: x.closingStock })),
              lowStockAnalysis: allStock.filter((r) => r.reorderLevel > 0 && r.closingStock <= r.reorderLevel).slice(0, 10).map((x) => ({ name: x.itemName, current: x.closingStock, reorder: x.reorderLevel })),
              monthlyLabels: mLabels,
              monthlyMovement: monthly,
            },
            recentActivity: [...this.db.ledger].reverse().slice(0, 15),
          });
        }
        case 'syncWorkingSheets':
        case 'reconcileInventory': {
          if (fnName === 'reconcileInventory') this.assertPerm('SYNC_ADMIN');
          const stats = this.runWorkingSheetSync();
          this.bump();
          return this.ok(`Synchronization complete (${stats.created} created, ${stats.updated} updated, ${stats.skipped} skipped, ${stats.errors} errors).`, { syncStats: stats });
        }
        case 'getSyncStatus': {
          const open = this.db.syncErrors.filter((e) => e.status === 'OPEN');
          return this.ok('Sync status loaded.', {
            lastSyncAt: this.db.lastSyncAt,
            dataVersion: this.db.version,
            openErrorCount: open.length,
            errors: open,
          });
        }
        case 'getDatabaseHealth': {
          const open = this.db.syncErrors.filter((e) => e.status === 'OPEN').length;
          return this.ok('Database health checked.', {
            healthy: open === 0,
            openSyncErrors: open,
            lastSyncAt: this.db.lastSyncAt,
          });
        }
        case 'resolveSyncError': {
          this.assertPerm('SYNC_ADMIN');
          const err = this.db.syncErrors.find((e) => e.errorId === args[0]);
          if (err) err.status = 'RESOLVED';
          this.bump();
          return this.ok('Sync error resolved.');
        }
        case 'backupSpreadsheet':
          this.assertPerm('SYNC_ADMIN');
          this.audit('BACKUP_DATABASE', 'Configuration', 'SIM', 'Created simulator database snapshot');
          return this.ok('Backup snapshot verified in Google Drive (Simulator mode).');
        case 'installTriggers':
          this.assertPerm('SYNC_ADMIN');
          return this.ok('Installable onEdit, onChange, and 15-min reconciliation triggers active.');
        case 'getAuditLogs':
          this.assertPerm('AUDIT_VIEW');
          return this.ok('Audit logs loaded.', { logs: [...this.db.auditLogs].reverse().slice(0, Number(args[0] || 100)) });

        /* ================================================================
           PROCUREMENT & TENDER MODULE RPC HANDLERS
           ================================================================ */
        case 'procSetupDatabase': {
          this.assertPerm('PROCUREMENT_VIEW');
          if (!this.db.procurement) {
            this.db.procurement = createDefaultProcurementDb(true);
            this.bump();
          }
          const verified = [
            'Indents', 'Suppliers', 'FreightForwarder', 'Quotations',
            'PurchaseOrders', 'LCTTPayments', 'Shipments', 'Tenders',
            'TenderTracking', 'AuditLog', 'Settings',
          ];
          return this.ok(`Procurement & Tender database initialized (${verified.length} sheets verified).`, {
            spreadsheetId: PROCUREMENT_SPREADSHEET_ID,
            spreadsheetName: 'Birat Healthcare Procurement & Tender DB',
            spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${PROCUREMENT_SPREADSHEET_ID}`,
            sheetsVerified: verified,
          });
        }
        case 'procGetExchangeRateByDate': {
          const actor = this.actor();
          if (!actor.permissions.includes('PROCUREMENT_VIEW') && !actor.permissions.includes('STOCK_VIEW')) {
            throw new Error('Access denied: authentication required.');
          }
          const rateInfo = this.resolveExchangeRatesForDate(args[0]);
          return this.ok(`Exchange rate resolved for ${rateInfo.RateDate}.`, {
            rateDate: rateInfo.RateDate,
            exchangeRates: rateInfo,
          });
        }
        case 'procSaveExchangeRates': {
          const actor = this.assertPerm('PROCUREMENT_WRITE');
          const inp = args[0] || {};
          const pDb = this.db.procurement;
          if (!Array.isArray(pDb.ExchangeRates)) pDb.ExchangeRates = [];
          const rateDate = String(inp.RateDate || inp.rateDate || todayIsoDate()).trim().slice(0, 10) || todayIsoDate();
          const existing = this.resolveExchangeRatesForDate(rateDate);
          const usd = parseFloat(inp.USD) > 0 ? parseFloat(inp.USD) : existing.USD || 135.5;
          const inr = parseFloat(inp.INR) > 0 ? parseFloat(inp.INR) : existing.INR || 1.6015;
          const eur = parseFloat(inp.EUR) > 0 ? parseFloat(inp.EUR) : existing.EUR || 146.2;
          const gbp = parseFloat(inp.GBP) > 0 ? parseFloat(inp.GBP) : existing.GBP || 172.8;
          const cny = parseFloat(inp.CNY) > 0 ? parseFloat(inp.CNY) : existing.CNY || 18.6;
          const remarks = String(inp.Remarks || inp.remarks || '').trim();
          const entry: ExchangeRateRecord = {
            RateDate: rateDate,
            USD: usd,
            INR: inr,
            EUR: eur,
            GBP: gbp,
            CNY: cny,
            NPR: 1.0,
            Remarks: remarks,
            UpdatedBy: actor.email,
            UpdatedAt: nowIso(),
          };
          const idx = pDb.ExchangeRates.findIndex((r) => r.RateDate === rateDate);
          if (idx >= 0) pDb.ExchangeRates[idx] = entry;
          else pDb.ExchangeRates.push(entry);

          const history = this.getExchangeRateHistory();
          if (history.length > 0 && history[0].RateDate === rateDate) {
            pDb.exchangeRates = { USD: usd, INR: inr, EUR: eur, GBP: gbp, CNY: cny, NPR: 1.0 };
          }

          let updatedEntriesCount = 0;
          if (inp.applyToExistingRecords === true) {
            const rateMap: Record<string, number> = { USD: usd, INR: inr, EUR: eur, GBP: gbp, CNY: cny, NPR: 1.0 };
            for (const q of pDb.Quotations) {
              if (String(q.Date || '').slice(0, 10) === rateDate) {
                const c = String(q.Currency || 'NPR').toUpperCase().trim();
                const r = rateMap[c] || 1;
                q.ExchangeRate = r;
                q.TotalAmountNPR = (parseFloat(q.TotalAmount) || 0) * r;
                updatedEntriesCount++;
              }
            }
            for (const po of pDb.PurchaseOrders) {
              if (String(po.OrderDate || '').slice(0, 10) === rateDate) {
                const c = String(po.Currency || 'NPR').toUpperCase().trim();
                const r = rateMap[c] || 1;
                po.ExchangeRate = r;
                po.TotalValueNPR = (parseFloat(po.TotalValue) || 0) * r;
                updatedEntriesCount++;
              }
            }
            for (const pay of pDb.LCTTPayments) {
              const dVal = String(pay.LCOpeningDate || pay.MaturityDate || '').slice(0, 10);
              if (dVal === rateDate) {
                const c = String(pay.Currency || 'NPR').toUpperCase().trim();
                const r = rateMap[c] || 1;
                pay.ExchangeRate = r;
                pay.AmountNPR = (parseFloat(pay.Amount) || 0) * r;
                updatedEntriesCount++;
              }
            }
            for (const tx of this.db.ledger) {
              if (tx.status !== 'ACTIVE' || tx.txDate !== rateDate) continue;
              let meta: Record<string, any> = {};
              try { meta = JSON.parse(tx.metaJson || '{}'); } catch {}
              const c = String(meta.currency || 'NPR').toUpperCase().trim();
              if (c !== 'NPR' && Number(meta.unitRate || 0) > 0) {
                const r = rateMap[c] || 1;
                meta.exchangeRate = r;
                meta.totalAmount = roundQty(tx.enteredQty * Number(meta.unitRate || 0));
                meta.totalAmountNPR = Math.round(meta.totalAmount * r * 100) / 100;
                tx.metaJson = JSON.stringify(meta);
                updatedEntriesCount++;
              }
            }
          }

          pDb.AuditLog.push({
            LogId: `LOG-${Date.now().toString(36).toUpperCase()}`,
            Timestamp: new Date().toISOString(),
            User: actor.email,
            Action: 'UPDATE_EXCHANGE_RATES',
            Module: 'ExchangeRates',
            RecordId: rateDate,
            Details: JSON.stringify({ entry, updatedEntriesCount }),
          });
          this.audit('UPDATE_EXCHANGE_RATES', 'Procurement:ExchangeRates', rateDate, `Saved date-wise exchange rates for ${rateDate}`);
          this.bump();
          const todayRates = this.resolveExchangeRatesForDate(todayIsoDate());
          return this.ok(
            `Exchange rates saved for ${rateDate}${updatedEntriesCount > 0 ? ` (${updatedEntriesCount} existing records recalculated).` : '.'}`,
            {
              rateDate,
              savedRate: entry,
              updatedEntriesCount,
              exchangeRates: todayRates,
              exchangeRateHistory: history,
            }
          );
        }
        case 'procGetRecords': {
          this.assertPerm('PROCUREMENT_VIEW');
          const sheetName = String(args[0] || '');
          const filterCriteria = args[1];
          const pDb: any = this.db.procurement;
          if (!pDb || !Array.isArray(pDb[sheetName])) {
            throw new Error(`Invalid Procurement & Tender sheet: ${sheetName}`);
          }
          let records: any[] = sheetName === 'ExchangeRates' ? this.getExchangeRateHistory() : [...pDb[sheetName]];
          if (filterCriteria && typeof filterCriteria === 'object') {
            records = records.filter((rec) => {
              for (const key of Object.keys(filterCriteria)) {
                const fv = filterCriteria[key];
                if (fv !== undefined && fv !== '' && fv !== null) {
                  if (String(rec[key] || '').toLowerCase() !== String(fv).toLowerCase()) {
                    return false;
                  }
                }
              }
              return true;
            });
          }
          return this.ok(`${sheetName} loaded.`, { records });
        }
        case 'procGetLookups': {
          this.assertPerm('PROCUREMENT_VIEW');
          const pDb = this.db.procurement;
          const activeItems = this.db.items
            .filter((it) => it.status === 'Active')
            .map((it) => ({ itemCode: it.itemCode, itemName: it.itemName, category: it.category, unit: it.indexUnit }));
          const approvedQuotes = pDb.Quotations.filter(
            (q) => String(q.MDApproval || '').toLowerCase() === 'approved'
          );
          const activePOs = pDb.PurchaseOrders.filter((p) => {
            const st = String(p.Status || '').toLowerCase();
            return st !== 'rejected' && st !== 'cancelled';
          });
          return this.ok('Procurement lookups loaded.', {
            items: activeItems,
            suppliers: pDb.Suppliers,
            forwarders: pDb.FreightForwarder,
            indents: pDb.Indents,
            approvedQuotations: approvedQuotes,
            activePOs,
            tenders: pDb.Tenders,
            exchangeRates: this.resolveExchangeRatesForDate(todayIsoDate()),
            exchangeRateHistory: this.getExchangeRateHistory(),
          });
        }
        case 'procSaveRecord': {
          const sheetName = String(args[0] || '');
          const requiredPerm = sheetName === 'Tenders' || sheetName === 'TenderTracking' ? 'TENDER_WRITE' : 'PROCUREMENT_WRITE';
          const actor = this.assertPerm(requiredPerm);
          const pDb: any = this.db.procurement;
          const pk = PROC_PRIMARY_KEYS[sheetName];
          if (!pk || !Array.isArray(pDb[sheetName])) {
            throw new Error(`Invalid Procurement & Tender sheet: ${sheetName}`);
          }
          const res = this.procSaveRecordInternal(sheetName, args[1] || {}, actor.email);
          this.audit(res.updated ? 'UPDATE_RECORD' : 'CREATE_RECORD', `Procurement:${sheetName}`, res.id, `${res.updated ? 'Updated' : 'Created'} ${res.id}`);
          this.bump();
          return this.ok(`Record ${res.id} ${res.updated ? 'updated' : 'created'} in ${sheetName}.`, res);
        }
        case 'procDeleteRecord': {
          const sheetName = String(args[0] || '');
          const recordId = String(args[1] || '');
          const requiredPerm = sheetName === 'Tenders' || sheetName === 'TenderTracking' ? 'TENDER_WRITE' : 'PROCUREMENT_WRITE';
          const actor = this.assertPerm(requiredPerm);
          const pDb: any = this.db.procurement;
          const pk = PROC_PRIMARY_KEYS[sheetName];
          if (!pk || !Array.isArray(pDb[sheetName])) {
            throw new Error(`Invalid Procurement & Tender sheet: ${sheetName}`);
          }
          const idx = pDb[sheetName].findIndex((r: any) => String(r[pk]) === recordId);
          if (idx === -1) {
            throw new Error(`Record with ID ${recordId} not found in ${sheetName}`);
          }
          pDb[sheetName].splice(idx, 1);
          pDb.AuditLog.push({
            LogId: `LOG-${Date.now().toString(36).toUpperCase()}`,
            Timestamp: new Date().toISOString(),
            User: actor.email,
            Action: 'DELETE_RECORD',
            Module: sheetName,
            RecordId: recordId,
            Details: `Deleted ${recordId}`,
          });
          this.audit('DELETE_RECORD', `Procurement:${sheetName}`, recordId, `Deleted ${recordId}`);
          this.bump();
          return this.ok(`Record ${recordId} deleted from ${sheetName}.`, { id: recordId });
        }
        case 'procSetApproval': {
          const actor = this.assertPerm('PROCUREMENT_APPROVE');
          const moduleName = String(args[0] || '');
          const id = String(args[1] || '');
          const status = String(args[2] || '');
          const remarks = String(args[3] || '');
          const pDb = this.db.procurement;

          if (moduleName === 'Quotations') {
            const q = pDb.Quotations.find((x) => String(x.QuotationNo) === id);
            if (!q) throw new Error(`Quotation ${id} not found.`);
            q.MDApproval = status;
            q.MDApprovalDate = new Date().toISOString();
            q.MDNotes = remarks;
            q.Status = status === 'Approved' ? 'Ready for PO' : 'Rejected';
            q.Timestamp = new Date().toISOString();
            this.audit('APPROVAL_ACTION', 'Procurement:Quotations', id, `MD approval set to ${status}`);
            this.bump();
            return this.ok(`Quotation ${id} MD approval set to ${status}.`);
          }
          if (moduleName === 'PurchaseOrders') {
            const po = pDb.PurchaseOrders.find((x) => String(x.PONo) === id);
            if (!po) throw new Error(`Purchase Order ${id} not found.`);
            po.ApprovalStatus = status;
            po.Status = status === 'Approved' ? 'Approved' : 'Rejected';
            po.Timestamp = new Date().toISOString();
            this.audit('APPROVAL_ACTION', 'Procurement:PurchaseOrders', id, `PO approval set to ${status}`);
            this.bump();
            return this.ok(`Purchase Order ${id} approval set to ${status}.`);
          }
          if (moduleName === 'Indents') {
            const ind = pDb.Indents.find((x) => String(x.IndentNo) === id);
            if (!ind) throw new Error(`Indent ${id} not found.`);
            ind.Status = status;
            ind.ApprovedBy = actor.email;
            ind.ApprovalDate = new Date().toISOString();
            if (remarks) ind.Remarks = remarks;
            ind.Timestamp = new Date().toISOString();
            this.audit('APPROVAL_ACTION', 'Procurement:Indents', id, `Indent marked ${status}`);
            this.bump();
            return this.ok(`Indent ${id} marked ${status}.`);
          }
          throw new Error(`Unsupported approval module: ${moduleName}`);
        }
        case 'procGetDashboard': {
          this.assertPerm('PROCUREMENT_VIEW');
          const pDb = this.db.procurement;
          const rates = this.resolveExchangeRatesForDate(todayIsoDate());
          const rateHistory = this.getExchangeRateHistory();
          const toNPR = (amt: any, curr: any) => {
            const n = parseFloat(amt) || 0;
            const c = String(curr || 'NPR').toUpperCase().trim();
            return n * ((rates as any)[c] || 1);
          };

          let totalPOValueNPR = 0;
          let pendingPOCount = 0;
          let pendingPOValueNPR = 0;
          const monthlyMap: Record<string, number> = {};
          const months = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
          const currentYear = new Date().getFullYear();
          months.forEach((m) => {
            monthlyMap[`${m} ${currentYear}`] = 0;
          });

          for (const po of pDb.PurchaseOrders) {
            const valNPR = parseFloat(po.TotalValueNPR) || toNPR(po.TotalValue, po.Currency);
            totalPOValueNPR += valNPR;
            const st = String(po.Status || '').toLowerCase();
            const recvSt = String(po.ReceivedStatus || '').toLowerCase();
            if (st !== 'completed' && st !== 'cancelled' && recvSt !== 'fully received') {
              pendingPOCount++;
              pendingPOValueNPR += valNPR;
            }
            if (po.OrderDate) {
              const d = new Date(po.OrderDate);
              if (!isNaN(d.getTime())) {
                const k = `${months[d.getMonth()]} ${d.getFullYear()}`;
                monthlyMap[k] = (monthlyMap[k] || 0) + valNPR;
              }
            }
          }

          let supplierOutstandingNPR = 0;
          let supplierPaidNPR = 0;
          for (const pay of pDb.LCTTPayments) {
            const amtNPR = parseFloat(pay.AmountNPR) || toNPR(pay.Amount, pay.Currency);
            const st = String(pay.Status || '').toLowerCase();
            if (st === 'pending' || st === 'in progress') supplierOutstandingNPR += amtNPR;
            else supplierPaidNPR += amtNPR;
          }

          let customerOutstandingNPR = 0;
          for (const t of pDb.TenderTracking) {
            const amt = parseFloat(t.Amount) || 0;
            const ds = String(t.DispatchStatus || '').toLowerCase();
            if (ds === 'dispatched' || ds === 'partial' || ds === 'batch 1 dispatched') {
              customerOutstandingNPR += amt;
            }
          }

          let shipIndia = 0;
          let shipThird = 0;
          let shipTransitTotal = 0;
          for (const s of pDb.Shipments) {
            const st = String(s.ShipmentStatus || '').toLowerCase();
            if (st.includes('transit') || st.includes('port') || st === 'customs pending' || st === 'in progress') {
              shipTransitTotal++;
              const orig = String(s.OriginType || '').toLowerCase();
              const country = String(s.OriginCountry || '').toLowerCase();
              if (orig === 'india' || country.includes('india')) shipIndia++;
              else shipThird++;
            }
          }

          const pendingIndents = pDb.Indents.filter((i) => String(i.Status || 'Pending') === 'Pending').length;
          const pendingQuotes = pDb.Quotations.filter((q) => String(q.MDApproval || 'Pending') === 'Pending').length;
          const wonTenders = pDb.Tenders.filter((t) => String(t.Result || '').toLowerCase() === 'win').length;
          const trendLabels = Object.keys(monthlyMap);
          const audits = [...pDb.AuditLog].sort((a, b) => String(b.Timestamp || '').localeCompare(String(a.Timestamp || '')));

          return this.ok('Procurement dashboard loaded.', {
            kpis: {
              totalPOValueNPR,
              pendingPOCount,
              pendingPOValueNPR,
              supplierOutstandingNPR,
              supplierPaidNPR,
              customerOutstandingNPR,
              period: args[0]?.period || 'yearly',
              shipmentsInTransit: { total: shipTransitTotal, india: shipIndia, thirdCountry: shipThird },
              totalIndents: pDb.Indents.length,
              pendingIndents,
              pendingQuotes,
              totalTenders: pDb.Tenders.length,
              wonTenders,
            },
            charts: {
              procurementTrend: {
                labels: trendLabels,
                data: trendLabels.map((k) => Math.round(monthlyMap[k])),
              },
              tenderBreakdown: {
                Win: wonTenders,
                Pending: pDb.Tenders.filter((t) => String(t.Result || 'Pending').toLowerCase() === 'pending').length,
                Lose: pDb.Tenders.filter((t) => String(t.Result || '').toLowerCase() === 'lose').length,
              },
            },
            recentPOs: pDb.PurchaseOrders.slice(-8).reverse(),
            recentTenders: pDb.Tenders.slice(-8).reverse(),
            recentAudit: audits.slice(0, 12),
            exchangeRates: { ...rates },
            exchangeRateHistory: rateHistory,
            spreadsheetId: PROCUREMENT_SPREADSHEET_ID,
            spreadsheetUrl: `https://docs.google.com/spreadsheets/d/${PROCUREMENT_SPREADSHEET_ID}`,
          });
        }
        case 'getApprovedPOsForGoodsReceipt': {
          const actor = this.actor();
          if (
            !actor.permissions.includes('RECEIPT_WRITE') &&
            !actor.permissions.includes('PROCUREMENT_VIEW') &&
            !actor.permissions.includes('STOCK_VIEW')
          ) {
            throw new Error('Access denied for loading Approved Purchase Orders.');
          }
          const pos = (this.db.procurement?.PurchaseOrders || []).filter((p) => {
            const app = String(p.ApprovalStatus || '').toLowerCase();
            const st = String(p.Status || '').toLowerCase();
            return app === 'approved' && st !== 'cancelled' && st !== 'rejected';
          });
          const purchaseOrders = pos.map((p) => {
            let items: any[] = [];
            try {
              items = JSON.parse(p.ItemsJSON || '[]');
            } catch {}
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
              items: Array.isArray(items) ? items : [],
            };
          });
          return this.ok('Approved Purchase Orders loaded.', { purchaseOrders });
        }
        default:
          return this.fail(`Unknown backend function: ${fnName}`);
      }
    } catch (err: any) {
      return this.fail(err?.message || String(err));
    }
  }

  private enrichTxRateMeta(txDate: string, enteredQty: number, metaIn?: Record<string, any>) {
    const meta: Record<string, any> = metaIn && typeof metaIn === 'object' ? { ...metaIn } : {};
    let unitRate = parseFloat(meta.unitRate);
    if (isNaN(unitRate) || unitRate < 0) unitRate = 0;
    const curr = String(meta.currency || 'NPR').toUpperCase().trim() || 'NPR';
    let exRate = parseFloat(meta.exchangeRate);
    if (curr === 'NPR') {
      exRate = 1.0;
    } else if (!(exRate > 0) || meta.syncDateRate) {
      const dateRates = this.resolveExchangeRatesForDate(txDate);
      exRate = Number(dateRates[curr]) || 1.0;
    }
    delete meta.syncDateRate;
    meta.unitRate = unitRate;
    meta.currency = curr;
    meta.exchangeRate = exRate;
    meta.totalAmount = unitRate > 0 ? roundQty(Number(enteredQty || 0) * unitRate) : 0;
    meta.totalAmountNPR = meta.totalAmount > 0 ? Math.round(meta.totalAmount * exRate * 100) / 100 : 0;
    return meta;
  }

  private attachTxRateFields(tx: LedgerRecord) {
    let meta: Record<string, any> = {};
    try { meta = JSON.parse(tx.metaJson || '{}'); } catch {}
    const unitRate = Number(meta.unitRate || 0);
    const currency = String(meta.currency || 'NPR');
    const exchangeRate = Number(meta.exchangeRate || 1);
    const totalAmount = Number(meta.totalAmount || (unitRate > 0 ? roundQty(tx.enteredQty * unitRate) : 0));
    const totalAmountNPR = Number(meta.totalAmountNPR || (totalAmount > 0 ? Math.round(totalAmount * exchangeRate * 100) / 100 : 0));
    return {
      ...tx,
      meta,
      unitRate,
      currency,
      exchangeRate,
      totalAmount,
      totalAmountNPR,
    };
  }

  private getExchangeRateHistory(): ExchangeRateRecord[] {
    const list = Array.isArray(this.db.procurement.ExchangeRates) ? [...this.db.procurement.ExchangeRates] : [];
    return list.sort((a, b) => String(b.RateDate || '').localeCompare(String(a.RateDate || '')));
  }

  private resolveExchangeRatesForDate(dateStr?: any): Record<string, any> {
    const targetDate = String(dateStr || '').trim().slice(0, 10) || todayIsoDate();
    const history = this.getExchangeRateHistory();
    const exact = history.find((r) => r.RateDate === targetDate);
    if (exact) {
      return { ...exact, RateDate: targetDate, matchedDate: exact.RateDate, source: 'Exact Date' };
    }
    const prior = history.find((r) => r.RateDate <= targetDate);
    if (prior) {
      return { ...prior, RateDate: targetDate, matchedDate: prior.RateDate, source: 'Effective Prior Date' };
    }
    if (history.length > 0) {
      const earliest = history[history.length - 1];
      return { ...earliest, RateDate: targetDate, matchedDate: earliest.RateDate, source: 'Earliest Configured Date' };
    }
    const def = this.db.procurement.exchangeRates || { USD: 135.5, INR: 1.6015, EUR: 146.2, GBP: 172.8, CNY: 18.6, NPR: 1.0 };
    return { ...def, RateDate: targetDate, matchedDate: targetDate, source: 'Default' };
  }

  private procSaveRecordInternal(sheetName: string, recordData: Record<string, any>, actorEmail: string) {
    const pDb: any = this.db.procurement;
    const pk = PROC_PRIMARY_KEYS[sheetName];
    const rows: any[] = pDb[sheetName];
    const copy: Record<string, any> = { ...recordData };
    let idValue = copy[pk] ? String(copy[pk]).trim() : '';
    const isNew = !idValue;

    if (isNew) {
      const prefix = PROC_PREFIXES[sheetName] || 'REC';
      const existingIds = new Set(rows.map((r) => String(r[pk] || '')));
      let nextNum = 1001;
      while (existingIds.has(`${prefix}-${nextNum}`)) nextNum++;
      idValue = `${prefix}-${nextNum}`;
      copy[pk] = idValue;
    }

    const txDate = String(copy.Date || copy.OrderDate || copy.LCOpeningDate || copy.MaturityDate || todayIsoDate()).trim().slice(0, 10);
    const rates = this.resolveExchangeRatesForDate(txDate);
    const currKey = String(copy.Currency || 'NPR').toUpperCase().trim();
    const effectiveRate = parseFloat(copy.ExchangeRate) > 0 ? parseFloat(copy.ExchangeRate) : (Number(rates[currKey]) || 1);
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

    const existingIdx = rows.findIndex((r) => String(r[pk]) === String(idValue));
    const updated = existingIdx >= 0;
    if (updated) {
      rows[existingIdx] = { ...rows[existingIdx], ...copy };
    } else {
      rows.push(copy);
    }

    pDb.AuditLog.push({
      LogId: `LOG-${Date.now().toString(36).toUpperCase()}`,
      Timestamp: copy.Timestamp,
      User: actorEmail,
      Action: updated ? 'UPDATE_RECORD' : 'CREATE_RECORD',
      Module: sheetName,
      RecordId: idValue,
      Details: JSON.stringify(copy).slice(0, 500),
    });

    if (sheetName === 'Tenders' && String(copy.Result || '').toLowerCase() === 'win') {
      const hasTrack = pDb.TenderTracking.some(
        (r: any) => String(r.TenderNo || '').toLowerCase() === String(copy.TenderNo || '').toLowerCase()
      );
      if (!hasTrack) {
        const amt = (parseFloat(copy.Quantity) || 0) * (parseFloat(copy.EstimatedRate) || 0);
        this.procSaveRecordInternal(
          'TenderTracking',
          {
            TrackingId: `TRK-${copy.TenderNo}`,
            TenderNo: copy.TenderNo,
            TenderName: copy.TenderName || '',
            Address: copy.Address || '',
            ContactInfo: copy.ContactInfo || '',
            LastSubmissionDate: copy.SubmissionDeadline || '',
            ItemName: copy.ItemName || '',
            Unit: copy.Unit || '',
            Quantity: copy.Quantity || 0,
            RateIncVat: copy.EstimatedRate || 0,
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
            Remarks: `Auto-created from won tender ${copy.TenderNo}`,
          },
          actorEmail
        );
      }
    }

    return { id: idValue, updated, data: copy };
  }

  /**
   * Mirrors handleSpreadsheetEdit / syncSingleWorkingSheet_ idempotent hashing!
   */
  simulateManualSheetRow(
    sheetName: 'Production' | 'Dispatch' | 'Goods Reciept' | 'Issue',
    row: { txId?: string; txDate: string; itemCode: string; quantity: number; uom: string; refNo?: string; partyOrSection?: string }
  ) {
    const ws = this.db.workingSheets[sheetName];
    const existingIdx = row.txId ? ws.findIndex((r) => r.txId === row.txId) : -1;
    const entry: WorkingSheetRow = {
      txId: row.txId || '',
      txDate: row.txDate,
      itemCode: row.itemCode,
      quantity: Number(row.quantity),
      uom: row.uom,
      refNo: row.refNo || '',
      partyOrSection: row.partyOrSection || '',
      status: 'ACTIVE',
      syncStatus: 'PENDING',
    };
    if (existingIdx >= 0) ws[existingIdx] = entry;
    else ws.push(entry);
    return this.runWorkingSheetSync();
  }

  private runWorkingSheetSync() {
    const typeMap: Record<string, LedgerRecord['txType']> = {
      Production: 'PRODUCTION',
      Dispatch: 'DISPATCH',
      'Goods Reciept': 'GOODS_RECEIPT',
      Issue: 'ISSUE',
    };
    const stats = { created: 0, updated: 0, skipped: 0, errors: 0 };

    for (const [sheetName, rows] of Object.entries(this.db.workingSheets)) {
      const txType = typeMap[sheetName];
      for (let i = 0; i < rows.length; i++) {
        const r = rows[i];
        if (!r.txId) r.txId = this.nextTxId(txType);
        const candHash = hashParts([r.txId, r.txDate, r.itemCode, r.quantity, r.uom, r.status]);
        const existingTx = this.db.ledger.find((l) => l.txId === r.txId);
        if (existingTx && existingTx.recordHash === candHash) {
          r.syncStatus = 'SYNCED';
          stats.skipped++;
          continue;
        }
        try {
          const v = this.validateTx(
            { txType, txDate: r.txDate, itemCode: r.itemCode, quantity: r.quantity, uom: r.uom },
            existingTx ? existingTx.txId : undefined,
            Boolean(existingTx)
          );
          const ts = nowIso();
          if (existingTx) {
            existingTx.txDate = v.txDate;
            existingTx.enteredQty = v.conv.enteredQty;
            existingTx.enteredUom = v.conv.enteredUom;
            existingTx.baseQty = v.conv.baseQty;
            existingTx.updatedAt = ts;
            existingTx.updatedBy = 'Manual Sheet Sync';
            existingTx.recordHash = candHash;
            stats.updated++;
          } else {
            this.db.ledger.push({
              txId: r.txId,
              txType,
              txDate: v.txDate,
              itemCode: v.item.itemCode,
              itemName: v.item.itemName,
              category: v.item.category,
              brand: v.item.brand,
              enteredQty: v.conv.enteredQty,
              enteredUom: v.conv.enteredUom,
              baseQty: v.conv.baseQty,
              direction: v.direction,
              sourceSheet: sheetName,
              sourceRow: i + 2,
              batchNo: r.batchNo || '',
              refNo: r.refNo || '',
              partyOrSection: r.partyOrSection || '',
              metaJson: '{}',
              remarks: r.remarks || 'Direct Sheet Entry',
              createdBy: 'Manual Sheet Sync',
              createdAt: ts,
              updatedBy: 'Manual Sheet Sync',
              updatedAt: ts,
              status: 'ACTIVE',
              recordHash: candHash,
            });
            stats.created++;
          }
          r.syncStatus = 'SYNCED';
        } catch (err: any) {
          r.syncStatus = `ERROR: ${err.message}`;
          stats.errors++;
          this.db.syncErrors.push({
            errorId: `ERR-${Date.now()}-${i + 2}`,
            timestamp: nowIso(),
            sheetName,
            sheetRow: i + 2,
            itemCode: r.itemCode,
            message: err.message,
            status: 'OPEN',
          });
        }
      }
    }
    return stats;
  }

  /**
   * Builds 2D matrices for both Operations & Procurement Google Spreadsheets
   * matching Code.js SCHEMAS & PROCUREMENT_SCHEMAS exactly.
   */
  exportGoogleSheetsPayloads(): {
    operations: Record<string, (string | number)[][]>;
    procurement: Record<string, (string | number)[][]>;
    rowHashes: Record<string, string>;
  } {
    const itemMap = Object.fromEntries(this.db.items.map((i) => [i.itemCode, i]));
    const rowHashes: Record<string, string> = {};

    const ledgerBySheet = (sheetName: string) =>
      this.db.ledger.filter((l) => l.sourceSheet === sheetName);

    const parseMeta = (json: string): Record<string, any> => {
      try {
        return JSON.parse(json || '{}') || {};
      } catch {
        return {};
      }
    };

    // 1. Operations Spreadsheet (1gGmpt4gKEE4Nu42960A8cmdrXaTpT-IKHW5oTAWGAJs)
    const itemMasterRows: (string | number)[][] = [
      [
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
        'Updated Date',
      ],
    ];
    for (const it of this.db.items) {
      const row = [
        it.itemCode,
        it.itemName,
        it.category,
        it.brand || '',
        it.hsnCode || '',
        it.indexUnit,
        it.fractionOfIndexUnit,
        it.conversionQty || 0,
        it.conversionUnit || '',
        it.reorderLevel || 0,
        it.status,
        it.createdDate,
        it.updatedDate,
      ];
      itemMasterRows.push(row);
      rowHashes[`OPS:Item Master:${it.itemCode}`] = hashParts(row);
    }

    const buildTxRows = (
      sheetName: 'Production' | 'Dispatch' | 'Goods Reciept' | 'Issue',
      headers: string[],
      mapper: (tx: LedgerRecord, it: ItemRecord | undefined, dual: string, meta: Record<string, any>) => (string | number)[]
    ) => {
      const matrix: (string | number)[][] = [headers];
      const ledgerList = ledgerBySheet(sheetName);
      const seenIds = new Set<string>();
      for (const tx of ledgerList) {
        seenIds.add(tx.txId);
        const it = itemMap[tx.itemCode];
        const dual = this.decomposeDualUOM(it, tx.baseQty).display;
        const meta = parseMeta(tx.metaJson);
        const row = mapper(tx, it, dual, meta);
        matrix.push(row);
        rowHashes[`OPS:${sheetName}:${tx.txId}`] = hashParts(row);
      }
      // Include any unsynced working-sheet rows that failed validation
      for (const wr of this.db.workingSheets[sheetName] || []) {
        if (wr.txId && seenIds.has(wr.txId)) continue;
        const it = itemMap[wr.itemCode];
        const synthetic: LedgerRecord = {
          txId: wr.txId || '',
          txType: sheetName === 'Production' ? 'PRODUCTION' : sheetName === 'Dispatch' ? 'DISPATCH' : sheetName === 'Goods Reciept' ? 'GOODS_RECEIPT' : 'ISSUE',
          txDate: wr.txDate,
          itemCode: wr.itemCode,
          itemName: it?.itemName || '',
          category: it?.category || '',
          brand: it?.brand || '',
          enteredQty: wr.quantity,
          enteredUom: wr.uom,
          baseQty: wr.quantity,
          direction: sheetName === 'Production' || sheetName === 'Goods Reciept' ? 'IN' : 'OUT',
          sourceSheet: sheetName,
          sourceRow: 0,
          batchNo: wr.batchNo || '',
          refNo: wr.refNo || '',
          partyOrSection: wr.partyOrSection || '',
          metaJson: '{}',
          remarks: wr.remarks || '',
          createdBy: 'Sheet Sync',
          createdAt: nowIso(),
          updatedBy: 'Sheet Sync',
          updatedAt: nowIso(),
          status: wr.status,
          recordHash: '',
        };
        const row = mapper(synthetic, it, `${wr.quantity} ${wr.uom}`, {});
        matrix.push(row);
      }
      return matrix;
    };

    const productionRows = buildTxRows(
      'Production',
      [
        'Production ID', 'Production Date', 'Item Category', 'Item Code', 'Item Name', 'Brand',
        'Quantity', 'UOM', 'Converted Base Qty', 'Index Unit', 'Secondary Display',
        'Batch/Lot Number', 'Production Reference', 'Remarks', 'Created By', 'Created At',
        'Status', 'Sync Status', 'Unit Rate', 'Currency', 'Exchange Rate', 'Total NPR',
      ],
      (tx, it, dual, meta) => [
        tx.txId, tx.txDate, tx.category, tx.itemCode, tx.itemName, tx.brand || '',
        tx.enteredQty, tx.enteredUom, tx.baseQty, it?.indexUnit || tx.enteredUom, dual,
        tx.batchNo || '', tx.refNo || '', tx.remarks || '', tx.createdBy, tx.createdAt,
        tx.status, 'SYNCED', Number(meta.unitRate || 0), String(meta.currency || 'NPR'),
        Number(meta.exchangeRate || 1), Number(meta.totalAmountNPR || 0),
      ]
    );

    const dispatchRows = buildTxRows(
      'Dispatch',
      [
        'Dispatch ID', 'Dispatch Date', 'Item Category', 'Item Code', 'Item Name', 'Brand',
        'Secondary Qty (CTN)', 'Index Qty (Pkt)', 'Dispatch Quantity', 'UOM', 'Converted Base Qty',
        'Index Unit', 'Secondary Display', 'Customer/Party Name', 'Challan Number', 'Invoice Number',
        'Vehicle Number', 'Remarks', 'Created By', 'Created At', 'Status', 'Sync Status',
        'Unit Rate', 'Currency', 'Exchange Rate', 'Total NPR',
      ],
      (tx, it, dual, meta) => {
        const d = this.decomposeDualUOM(it, tx.baseQty);
        return [
          tx.txId, tx.txDate, tx.category, tx.itemCode, tx.itemName, tx.brand || '',
          d.hasSecondary ? d.secondaryQty : 0, d.remainderQty, tx.enteredQty, tx.enteredUom, tx.baseQty,
          it?.indexUnit || tx.enteredUom, dual, tx.partyOrSection || '', tx.refNo || '',
          String(meta.invoiceNo || ''), String(meta.vehicleNo || ''), tx.remarks || '',
          tx.createdBy, tx.createdAt, tx.status, 'SYNCED',
          Number(meta.unitRate || 0), String(meta.currency || 'NPR'),
          Number(meta.exchangeRate || 1), Number(meta.totalAmountNPR || 0),
        ];
      }
    );

    const grnRows = buildTxRows(
      'Goods Reciept',
      [
        'Receipt ID', 'Receipt Date', 'Item Category', 'Item Code', 'Item Name', 'Brand',
        'Received Quantity', 'UOM', 'Converted Base Qty', 'Index Unit', 'Secondary Display',
        'Supplier Name', 'Invoice Number', 'Purchase Reference', 'Batch/Lot Number', 'Remarks',
        'Created By', 'Created At', 'Status', 'Sync Status',
        'PO No', 'Unit Rate', 'Currency', 'Exchange Rate', 'Total NPR',
      ],
      (tx, it, dual, meta) => [
        tx.txId, tx.txDate, tx.category, tx.itemCode, tx.itemName, tx.brand || '',
        tx.enteredQty, tx.enteredUom, tx.baseQty, it?.indexUnit || tx.enteredUom, dual,
        tx.partyOrSection || '', String(meta.invoiceNo || ''), tx.refNo || '', tx.batchNo || '',
        tx.remarks || '', tx.createdBy, tx.createdAt, tx.status, 'SYNCED',
        String(meta.poNo || ''), Number(meta.unitRate || 0), String(meta.currency || 'NPR'),
        Number(meta.exchangeRate || 1), Number(meta.totalAmountNPR || 0),
      ]
    );

    const issueRows = buildTxRows(
      'Issue',
      [
        'Issue ID', 'Issue Date', 'Item Category', 'Item Code', 'Item Name', 'Brand',
        'Issue Quantity', 'UOM', 'Converted Base Qty', 'Index Unit', 'Secondary Display',
        'Department/Production Section', 'Issue Reference', 'Issued To', 'Remarks',
        'Created By', 'Created At', 'Status', 'Sync Status',
        'Unit Rate', 'Currency', 'Exchange Rate', 'Total NPR',
      ],
      (tx, it, dual, meta) => [
        tx.txId, tx.txDate, tx.category, tx.itemCode, tx.itemName, tx.brand || '',
        tx.enteredQty, tx.enteredUom, tx.baseQty, it?.indexUnit || tx.enteredUom, dual,
        tx.partyOrSection || '', tx.refNo || '', String(meta.issuedTo || ''), tx.remarks || '',
        tx.createdBy, tx.createdAt, tx.status, 'SYNCED',
        Number(meta.unitRate || 0), String(meta.currency || 'NPR'),
        Number(meta.exchangeRate || 1), Number(meta.totalAmountNPR || 0),
      ]
    );

    const fgReg = this.buildCategoryRegister('Finished Goods', {});
    const rmReg = this.buildCategoryRegister('Raw Material', {});
    const pmReg = this.buildCategoryRegister('Packing Material', {});
    const allReg = this.buildCategoryRegister(null, {});

    const fgRows: (string | number)[][] = [
      ['Item Name', 'Item Code', 'Brand', 'Opening Stock', 'Production', 'Dispatch', 'Closing Stock', 'Index Unit', 'Secondary Unit Balance'],
      ...fgReg.map((r) => [r.itemName, r.itemCode, r.brand || '', r.openingStock, r.stockIn, r.stockOut, r.closingStock, r.indexUnit, r.dualDisplay]),
    ];
    const rmRows: (string | number)[][] = [
      ['Item Name', 'Item Code', 'Brand', 'Opening Stock', 'Receipt', 'Issue', 'Closing Stock', 'Index Unit'],
      ...rmReg.map((r) => [r.itemName, r.itemCode, r.brand || '', r.openingStock, r.stockIn, r.stockOut, r.closingStock, r.indexUnit]),
    ];
    const pmRows: (string | number)[][] = [
      ['Item Name', 'Item Code', 'Brand', 'Opening Stock', 'Receipt', 'Issue', 'Closing Stock', 'Index Unit', 'Secondary Unit Balance'],
      ...pmReg.map((r) => [r.itemName, r.itemCode, r.brand || '', r.openingStock, r.stockIn, r.stockOut, r.closingStock, r.indexUnit, r.dualDisplay]),
    ];
    const allStockRows: (string | number)[][] = [
      ['Section', 'Item Name', 'Item Code', 'Brand', 'Category', 'Index Unit', 'Opening Stock', 'Total Stock In', 'Total Stock Out', 'Closing Stock', 'Secondary Unit Balance', 'Reorder Level', 'Stock Status'],
      ...allReg.map((r) => [
        r.category === 'Finished Goods' ? 'Finished Goods' : r.category === 'Raw Material' ? 'Raw Material' : r.category === 'Packing Material' ? 'Packing Material' : 'Other Stock',
        r.itemName, r.itemCode, r.brand || '', r.category, r.indexUnit,
        r.openingStock, r.stockIn, r.stockOut, r.closingStock, r.dualDisplay, r.reorderLevel, r.stockStatus,
      ]),
    ];

    const ledgerRows: (string | number)[][] = [
      [
        'Transaction ID', 'Transaction Type', 'Transaction Date', 'Item Code', 'Item Name', 'Category', 'Brand',
        'Entered Quantity', 'Entered UOM', 'Converted Base Quantity', 'Stock Direction', 'Source Sheet', 'Source Row',
        'Batch Number', 'Reference Number', 'Party / Section', 'Meta JSON', 'Remarks',
        'Created By', 'Created At', 'Updated By', 'Updated At', 'Transaction Status', 'Record Hash',
      ],
      ...this.db.ledger.map((l, idx) => {
        const row = [
          l.txId, l.txType, l.txDate, l.itemCode, l.itemName, l.category, l.brand || '',
          l.enteredQty, l.enteredUom, l.baseQty, l.direction, l.sourceSheet, l.sourceRow || idx + 2,
          l.batchNo || '', l.refNo || '', l.partyOrSection || '', l.metaJson || '{}', l.remarks || '',
          l.createdBy, l.createdAt, l.updatedBy, l.updatedAt, l.status, l.recordHash,
        ];
        rowHashes[`OPS:_SYS_Transaction_Ledger:${l.txId}`] = hashParts(row);
        return row;
      }),
    ];

    // 2. Procurement & Tender Spreadsheet (16SN_MJjvmWqt_OH8Hol3AVGB6hWFTM_rYOG1FTi2-yY)
    const pDb: any = this.db.procurement || createDefaultProcurementDb(false);
    const procSchemas: Record<string, string[]> = {
      Indents: ['IndentNo', 'Date', 'Department', 'Requester', 'ItemCode', 'ItemName', 'RequiredQty', 'Unit', 'RequiredDeliveryDate', 'Priority', 'Status', 'ApprovedBy', 'ApprovalDate', 'Remarks', 'Timestamp'],
      Suppliers: ['SupplierId', 'Name', 'PanNo', 'GstNo', 'ContactPerson', 'Phone', 'Email', 'Country', 'Address', 'PaymentTerms', 'Currency', 'LeadTimeDays', 'Rating', 'Timestamp'],
      FreightForwarder: ['ForwarderId', 'Name', 'Address', 'ContactPerson', 'Phone', 'Email', 'Rating', 'Remarks', 'Timestamp'],
      Quotations: ['QuotationNo', 'IndentNo', 'SupplierId', 'SupplierName', 'Date', 'ValidityDate', 'Currency', 'ExchangeRate', 'Incoterms', 'FreightCharges', 'OtherCharges', 'Subtotal', 'TotalAmount', 'TotalAmountNPR', 'Status', 'MDApproval', 'MDApprovalDate', 'MDNotes', 'AttachmentName', 'AttachmentUrl', 'ItemsJSON', 'Timestamp'],
      PurchaseOrders: ['PONo', 'QuotationNo', 'SupplierId', 'SupplierName', 'OrderDate', 'DeliveryTerms', 'PaymentTerms', 'Incoterms', 'Currency', 'ExchangeRate', 'TotalValue', 'TotalValueNPR', 'ExpectedDeliveryDate', 'Status', 'ApprovalStatus', 'ItemsJSON', 'ReceivedStatus', 'ReceivedQty', 'PendingQty', 'Timestamp'],
      LCTTPayments: ['PaymentId', 'PONo', 'SupplierName', 'BankName', 'PaymentType', 'Currency', 'Amount', 'ExchangeRate', 'AmountNPR', 'LCNumber', 'LCOpeningDate', 'MaturityDate', 'Status', 'PaymentStage', 'Remarks', 'Timestamp'],
      Shipments: ['ShipmentId', 'PONo', 'SupplierName', 'ForwarderId', 'ForwarderName', 'ShippingLine', 'OriginType', 'OriginCountry', 'POL', 'POD', 'ContainerNo', 'BLAWBNo', 'ETD', 'ETA', 'ActualDeparture', 'ActualArrival', 'CustomsStatus', 'FreightAmountNPR', 'ShipmentStatus', 'Remarks', 'Timestamp'],
      Tenders: ['TenderNo', 'TenderName', 'Address', 'ContactInfo', 'PublicationDate', 'SubmissionDeadline', 'ItemName', 'Quantity', 'Unit', 'EstimatedRate', 'BidSecurityAmount', 'BidSecurityStatus', 'Result', 'Remarks', 'Timestamp'],
      TenderTracking: ['TrackingId', 'TenderNo', 'TenderName', 'Address', 'ContactInfo', 'LastSubmissionDate', 'ItemName', 'Unit', 'Quantity', 'RateIncVat', 'Amount', 'MuchulkaStatus', 'MuchulkaDate', 'LOIStatus', 'LOIDate', 'LOAStatus', 'LOADate', 'PGStatus', 'PGDate', 'SampleStatus', 'SampleDate', 'ProductionStatus', 'DispatchStatus', 'DispatchDate', 'Remarks', 'Timestamp'],
      ExchangeRates: ['RateDate', 'USD', 'INR', 'EUR', 'GBP', 'CNY', 'NPR', 'Remarks', 'UpdatedBy', 'UpdatedAt'],
      AuditLog: ['LogId', 'Timestamp', 'UserEmail', 'Action', 'Module', 'RecordId', 'Details'],
    };

    const procurement: Record<string, (string | number)[][]> = {};
    for (const [tabName, cols] of Object.entries(procSchemas)) {
      const list: any[] = tabName === 'ExchangeRates' ? this.getExchangeRateHistory() : (Array.isArray(pDb[tabName]) ? pDb[tabName] : []);
      const pk = PROC_PRIMARY_KEYS[tabName] || cols[0];
      const matrix: (string | number)[][] = [cols];
      for (const rec of list) {
        const row = cols.map((c) => {
          if (tabName === 'AuditLog' && c === 'UserEmail') return rec.UserEmail ?? rec.User ?? '';
          const v = rec[c];
          return v === undefined || v === null ? '' : v;
        });
        matrix.push(row);
        const pkVal = String(rec[pk] || '').trim();
        if (pkVal) {
          rowHashes[`PROC:${tabName}:${pkVal}`] = hashParts(row);
        }
      }
      procurement[tabName] = matrix;
    }

    return {
      operations: {
        'Item Master': itemMasterRows,
        Production: productionRows,
        Dispatch: dispatchRows,
        'Goods Reciept': grnRows,
        Issue: issueRows,
        'Finished Goods': fgRows,
        'Raw Material': rmRows,
        'Packing Material': pmRows,
        'All Stock Balance': allStockRows,
        _SYS_Transaction_Ledger: ledgerRows,
      },
      procurement,
      rowHashes,
    };
  }

  /**
   * Reconciles data entered or edited directly in the two Google Spreadsheets
   * cleanly and idempotently back into the ERP database without losing ERP state.
   */
  reconcileFromGoogleSheets(input: {
    operations: Record<string, Record<string, string>[]>;
    procurement: Record<string, Record<string, string>[]>;
    opsRawRowCounts?: Record<string, number>;
    procRawRowCounts?: Record<string, number>;
    prevHashes: Record<string, string>;
    initialLink?: boolean;
  }): {
    created: number;
    updated: number;
    deleted: number;
    needsWriteBackOps: boolean;
    needsWriteBackProc: boolean;
    nextHashes: Record<string, string>;
    errors: string[];
  } {
    const prev = input.prevHashes || {};
    const nextHashes: Record<string, string> = {};
    const isInitial = Boolean(input.initialLink) || Object.keys(prev).length === 0;
    const isUntouchedSeedDb =
      this.db.auditLogs.length <= 2 &&
      !this.db.auditLogs.some((a) => !['SYSTEM_INIT', 'USER_LOGIN', 'USER_LOGOUT'].includes(a.action));
    let created = 0;
    let updated = 0;
    let deleted = 0;
    let needsWriteBackOps = false;
    let needsWriteBackProc = false;
    const errors: string[] = [];

    const normDate = (val: any, fallbackToday = true): string => {
      if (val === undefined || val === null) return fallbackToday ? todayIsoDate() : '';
      const s = String(val).trim();
      if (!s) return fallbackToday ? todayIsoDate() : '';
      if (/^\d{4}-\d{2}-\d{2}/.test(s)) return s.slice(0, 10);
      if (/^\d{4}\/\d{1,2}\/\d{1,2}/.test(s)) {
        const [y, m, d] = s.slice(0, 10).split('/');
        return `${y}-${m.padStart(2, '0')}-${d.padStart(2, '0')}`;
      }
      const dmy = s.match(/^(\d{1,2})[\/\-](\d{1,2})[\/\-](\d{4})$/);
      if (dmy) {
        const p1 = Number(dmy[1]);
        const p2 = Number(dmy[2]);
        const y = dmy[3];
        // Prefer DD/MM/YYYY unless second part > 12 (MM/DD/YYYY)
        const month = p2 > 12 ? p1 : p1 > 12 ? p2 : p2;
        const day = p2 > 12 ? p2 : p1 > 12 ? p1 : p1;
        return `${y}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
      }
      if (/^\d{5}(\.\d+)?$/.test(s)) {
        const serial = Number(s);
        if (serial > 20000 && serial < 90000) {
          const utcMs = Math.round((serial - 25569) * 86400 * 1000);
          return new Date(utcMs).toISOString().slice(0, 10);
        }
      }
      const d = new Date(s);
      if (!isNaN(d.getTime())) return d.toISOString().slice(0, 10);
      return fallbackToday ? todayIsoDate() : '';
    };

    const numOr = (val: any, def = 0): number => {
      if (val === undefined || val === null) return def;
      const cleaned = String(val)
        .replace(/(NPR|USD|INR|EUR|GBP|CNY|RS\.?|रू)/gi, '')
        .replace(/[$€£¥₹,\s]/g, '')
        .trim();
      if (!cleaned) return def;
      const n = Number(cleaned);
      return isNaN(n) ? def : n;
    };

    const normKey = (k: string) => k.toLowerCase().replace(/[^a-z0-9]/g, '');

    const pick = (row: Record<string, string>, ...keys: string[]) => {
      for (const k of keys) {
        if (row[k] !== undefined && String(row[k]).trim() !== '') return String(row[k]).trim();
      }
      const rowEntries = Object.entries(row);
      for (const k of keys) {
        const target = normKey(k);
        const found = rowEntries.find(([rk, rv]) => normKey(rk) === target && String(rv ?? '').trim() !== '');
        if (found) return String(found[1]).trim();
      }
      return '';
    };

    const normalizeCategory = (rawCat: string): string => {
      const c = rawCat.trim().toLowerCase();
      if (!c) return '';
      if (c === 'wip' || c.includes('work in progress')) return 'WIP';
      if (c.includes('finished')) return 'Finished Goods';
      if (c.includes('raw')) return 'Raw Material';
      if (c.includes('pack')) return 'Packing Material';
      if (c.includes('store') || c.includes('spare')) return 'Stores & Spares';
      const exact = FIXED_CATEGORIES.find((fc) => fc.toLowerCase() === c);
      return exact || (c === 'other' || c === 'others' ? 'Others' : 'Others');
    };

    const resolveItemForSheetRow = (itemCodeRaw: string, itemNameRaw: string): ItemRecord | undefined => {
      const code = itemCodeRaw.trim();
      if (code) {
        const byCode = this.db.items.find((it) => it.itemCode.trim().toLowerCase() === code.toLowerCase());
        if (byCode) return byCode;
      }
      const nm = itemNameRaw.trim().toLowerCase();
      if (nm) {
        return this.db.items.find((it) => it.itemName.trim().toLowerCase() === nm);
      }
      return undefined;
    };

    const resolveUomForItem = (item: ItemRecord, rawUom: string): string => {
      const u = rawUom.trim();
      if (!u) return item.indexUnit;
      const ul = u.toLowerCase();
      const idxL = item.indexUnit.toLowerCase();
      if (ul === idxL || ul === `${idxL}s` || `${ul}s` === idxL) return item.indexUnit;
      if (item.conversionUnit) {
        const convL = item.conversionUnit.toLowerCase();
        if (
          ul === convL ||
          ul === `${convL}s` ||
          `${ul}s` === convL ||
          (convL === 'cartoon' && (ul === 'ctn' || ul === 'carton' || ul === 'cartons'))
        ) {
          return item.conversionUnit;
        }
      }
      return u;
    };

    // 1. Operations: Item Master
    const sheetItems = input.operations['Item Master'] || [];
    const itemMasterRawCount = input.opsRawRowCounts?.['Item Master'] ?? (sheetItems.length > 0 ? sheetItems.length + 1 : 0);
    if (itemMasterRawCount === 0 && this.db.items.length > 0) {
      needsWriteBackOps = true;
    }

    const seenSheetItemCodes = new Set<string>();
    const parsedItems: Array<{ code: string; name: string; cat: string; raw: Record<string, string> }> = [];
    for (let i = 0; i < sheetItems.length; i++) {
      const r = sheetItems[i];
      const name = pick(r, 'Item Name', 'itemName', 'Name');
      const rawCat = pick(r, 'Categories', 'Category', 'Item Category', 'category');
      const cat = normalizeCategory(rawCat) || 'Others';
      const idxU = pick(r, 'Index Unit', 'Base Unit', 'Unit', 'UOM', 'indexUnit');
      if (!name || !idxU) continue;
      let code = pick(r, 'Item Code', 'itemCode', 'Code');
      if (code) seenSheetItemCodes.add(code);
      parsedItems.push({ code, name, cat, raw: r });
    }

    // If initial link on untouched seed DB and Google Sheet already has real items, replace seed-only items not in sheet
    if (isInitial && isUntouchedSeedDb && sheetItems.length > 0 && seenSheetItemCodes.size > 0) {
      const kept = this.db.items.filter((it) => seenSheetItemCodes.has(it.itemCode));
      if (kept.length !== this.db.items.length) {
        this.db.items = kept;
        updated++;
      }
    } else if (itemMasterRawCount >= 1) {
      // Deletion detection for previously synced items removed from Google Sheet
      const removedPrevItems = this.db.items.filter((it) => {
        const hk = `OPS:Item Master:${it.itemCode}`;
        return Boolean(prev[hk]) && !seenSheetItemCodes.has(it.itemCode) && !this.db.ledger.some((l) => l.itemCode === it.itemCode);
      });
      if (removedPrevItems.length > 0) {
        const removeSet = new Set(removedPrevItems.map((x) => x.itemCode));
        this.db.items = this.db.items.filter((it) => !removeSet.has(it.itemCode));
        deleted += removedPrevItems.length;
      }
    }

    for (let i = 0; i < parsedItems.length; i++) {
      const { name, cat, raw: r } = parsedItems[i];
      let code = parsedItems[i].code;
      const idxU = pick(r, 'Index Unit', 'Base Unit', 'Unit', 'UOM', 'indexUnit');
      const hashVal = hashParts(Object.keys(r).sort().map((k) => `${k}:${r[k]}`));
      const existingIdx = code
        ? this.db.items.findIndex((it) => it.itemCode.toLowerCase() === code.toLowerCase())
        : this.db.items.findIndex((it) => it.category === cat && it.itemName.toLowerCase() === name.toLowerCase());

      if (existingIdx === -1) {
        if (!code) {
          code = this.nextItemCode(FIXED_CATEGORIES.includes(cat) ? cat : 'Others');
          needsWriteBackOps = true;
        }
        const convUnit = pick(r, 'Conversion Unit', 'Secondary Unit', 'Conv Unit', 'conversionUnit');
        const convQty = convUnit ? numOr(pick(r, 'Conversion Quantity', 'Conversion Qty', 'Conv Qty', 'conversionQty'), 0) : 0;
        const frac =
          convUnit && convQty > 0
            ? Math.round((1 / convQty) * 1000000) / 1000000
            : numOr(pick(r, 'Fraction of Index Unit', 'fractionOfIndexUnit'), 1);
        this.db.items.push({
          itemCode: code,
          itemName: name,
          category: FIXED_CATEGORIES.includes(cat) ? cat : 'Others',
          brand: pick(r, 'Brand Categories', 'Brand', 'Brand Name', 'brand'),
          hsnCode: pick(r, 'HSN Code', 'HSN', 'hsnCode'),
          indexUnit: idxU,
          fractionOfIndexUnit: frac,
          conversionQty: convQty,
          conversionUnit: convUnit,
          reorderLevel: numOr(pick(r, 'Reorder Level', 'Min Stock', 'reorderLevel'), 0),
          status: pick(r, 'Status', 'status').toLowerCase() === 'inactive' ? 'Inactive' : 'Active',
          createdDate: normDate(pick(r, 'Created Date', 'createdDate')),
          updatedDate: normDate(pick(r, 'Updated Date', 'updatedDate')),
        });
        nextHashes[`OPS:Item Master:${code}`] = hashVal;
        created++;
      } else {
        const it = this.db.items[existingIdx];
        code = it.itemCode;
        const convUnit = pick(r, 'Conversion Unit', 'Secondary Unit', 'Conv Unit', 'conversionUnit');
        const convQty = convUnit ? numOr(pick(r, 'Conversion Quantity', 'Conversion Qty', 'Conv Qty', 'conversionQty'), it.conversionQty) : 0;
        const nextStatus = pick(r, 'Status', 'status').toLowerCase() === 'inactive' ? 'Inactive' : 'Active';
        const nextBrand = pick(r, 'Brand Categories', 'Brand', 'Brand Name', 'brand');
        const nextHsn = pick(r, 'HSN Code', 'HSN', 'hsnCode');
        const nextReorder = numOr(pick(r, 'Reorder Level', 'Min Stock', 'reorderLevel'), it.reorderLevel);
        const changed =
          it.itemName !== name ||
          it.category !== cat ||
          it.indexUnit !== idxU ||
          it.conversionQty !== convQty ||
          it.conversionUnit !== convUnit ||
          it.brand !== nextBrand ||
          it.hsnCode !== nextHsn ||
          it.reorderLevel !== nextReorder ||
          it.status !== nextStatus;
        if (changed) {
          it.itemName = name;
          if (FIXED_CATEGORIES.includes(cat)) it.category = cat;
          it.brand = nextBrand;
          it.hsnCode = nextHsn;
          it.indexUnit = idxU;
          it.conversionUnit = convUnit;
          it.conversionQty = convUnit ? convQty : 0;
          it.fractionOfIndexUnit = convUnit && convQty > 0 ? Math.round((1 / convQty) * 1000000) / 1000000 : 1;
          it.reorderLevel = nextReorder;
          it.status = nextStatus;
          it.updatedDate = normDate(pick(r, 'Updated Date', 'updatedDate'));
          updated++;
        }
        nextHashes[`OPS:Item Master:${code}`] = hashVal;
      }
    }

    // 2. Operations: Working Sheets & _SYS_Transaction_Ledger Sync
    const workingDefs: Array<{
      sheetName: 'Production' | 'Dispatch' | 'Goods Reciept' | 'Issue';
      txType: LedgerRecord['txType'];
      idKeys: string[];
      dateKeys: string[];
      qtyKeys: string[];
      refKeys: string[];
      partyKeys: string[];
    }> = [
      {
        sheetName: 'Production',
        txType: 'PRODUCTION',
        idKeys: ['Production ID', 'Transaction ID', 'ID', 'txId'],
        dateKeys: ['Production Date', 'Transaction Date', 'Tx Date', 'Date'],
        qtyKeys: ['Quantity', 'Qty', 'Entered Quantity', 'Production Qty'],
        refKeys: ['Production Reference', 'Reference Number', 'Ref No'],
        partyKeys: ['Party / Section', 'Section', 'Department'],
      },
      {
        sheetName: 'Dispatch',
        txType: 'DISPATCH',
        idKeys: ['Dispatch ID', 'Transaction ID', 'ID', 'txId'],
        dateKeys: ['Dispatch Date', 'Transaction Date', 'Tx Date', 'Date'],
        qtyKeys: ['Dispatch Quantity', 'Quantity', 'Qty', 'Entered Quantity'],
        refKeys: ['Challan Number', 'Reference Number', 'Ref No'],
        partyKeys: ['Customer/Party Name', 'Customer Name', 'Party Name', 'Party / Section'],
      },
      {
        sheetName: 'Goods Reciept',
        txType: 'GOODS_RECEIPT',
        idKeys: ['Receipt ID', 'GRN ID', 'Transaction ID', 'ID', 'txId'],
        dateKeys: ['Receipt Date', 'GRN Date', 'Transaction Date', 'Tx Date', 'Date'],
        qtyKeys: ['Received Quantity', 'Receipt Quantity', 'Quantity', 'Qty', 'Entered Quantity'],
        refKeys: ['Purchase Reference', 'Reference Number', 'Ref No'],
        partyKeys: ['Supplier Name', 'Vendor Name', 'Party / Section'],
      },
      {
        sheetName: 'Issue',
        txType: 'ISSUE',
        idKeys: ['Issue ID', 'Transaction ID', 'ID', 'txId'],
        dateKeys: ['Issue Date', 'Transaction Date', 'Tx Date', 'Date'],
        qtyKeys: ['Issue Quantity', 'Issued Quantity', 'Quantity', 'Qty', 'Entered Quantity'],
        refKeys: ['Issue Reference', 'Reference Number', 'Ref No'],
        partyKeys: ['Department/Production Section', 'Department', 'Section', 'Party / Section'],
      },
    ];

    if (isInitial && isUntouchedSeedDb) {
      const hasAnySheetTx =
        workingDefs.some((d) => (input.operations[d.sheetName] || []).length > 0) ||
        (input.operations['_SYS_Transaction_Ledger'] || []).length > 0;
      if (hasAnySheetTx) {
        this.db.ledger = [];
        for (const d of workingDefs) {
          this.db.workingSheets[d.sheetName] = [];
        }
        updated++;
      } else if (sheetItems.length > 0) {
        const validCodes = new Set(this.db.items.map((it) => it.itemCode));
        const beforeLen = this.db.ledger.length;
        this.db.ledger = this.db.ledger.filter((l) => validCodes.has(l.itemCode));
        for (const d of workingDefs) {
          this.db.workingSheets[d.sheetName] = (this.db.workingSheets[d.sheetName] || []).filter((w) => validCodes.has(w.itemCode));
        }
        if (this.db.ledger.length !== beforeLen) updated++;
      }
    }

    const seenSheetTxIdsBySheet: Record<string, Set<string>> = {};
    for (const def of workingDefs) {
      const sheetRows = input.operations[def.sheetName] || [];
      const rawCount = input.opsRawRowCounts?.[def.sheetName] ?? (sheetRows.length > 0 ? sheetRows.length + 1 : 0);
      const localRows = this.db.ledger.filter((l) => l.sourceSheet === def.sheetName);
      if (rawCount === 0 && localRows.length > 0) {
        needsWriteBackOps = true;
      }

      const seenInThisSheet = new Set<string>();
      seenSheetTxIdsBySheet[def.sheetName] = seenInThisSheet;

      for (let i = 0; i < sheetRows.length; i++) {
        const r = sheetRows[i];
        const rawCode = pick(r, 'Item Code', 'itemCode', 'Code');
        const rawName = pick(r, 'Item Name', 'itemName');
        const matchedItem = resolveItemForSheetRow(rawCode, rawName);
        const itemCode = matchedItem ? matchedItem.itemCode : rawCode;
        const qtyRaw = numOr(pick(r, ...def.qtyKeys), 0);
        if (!itemCode || qtyRaw <= 0) continue;

        let txId = pick(r, ...def.idKeys);
        if (txId) seenInThisSheet.add(txId);

        const txDate = normDate(pick(r, ...def.dateKeys));
        const rawUom = pick(r, 'UOM', 'Unit', 'Entered UOM');
        const uom = matchedItem ? resolveUomForItem(matchedItem, rawUom) : rawUom;
        const statusRaw = pick(r, 'Status', 'Transaction Status').toUpperCase() === 'CANCELLED' ? 'CANCELLED' : 'ACTIVE';
        const refNo = pick(r, ...def.refKeys);
        const party = pick(r, ...def.partyKeys);
        const batchNo = pick(r, 'Batch/Lot Number', 'Batch Number', 'Batch No');
        const remarks = pick(r, 'Remarks');
        const unitRate = numOr(pick(r, 'Unit Rate', 'Rate', 'unitRate'), 0);
        const currency = pick(r, 'Currency', 'currency') || 'NPR';
        const exRateInput = numOr(pick(r, 'Exchange Rate', 'exchangeRate'), 0);
        const poNo = pick(r, 'PO No', 'PONo', 'poNo');
        const invoiceNo = pick(r, 'Invoice Number', 'Invoice No', 'invoiceNo');
        const vehicleNo = pick(r, 'Vehicle Number', 'Vehicle No', 'vehicleNo');
        const issuedTo = pick(r, 'Issued To', 'issuedTo');

        const hashVal = hashParts(Object.keys(r).sort().map((k) => `${k}:${r[k]}`));
        const existingTx = txId ? this.db.ledger.find((l) => l.txId === txId) : undefined;

        if (!existingTx) {
          if (!txId) {
            txId = this.nextTxId(def.txType);
            seenInThisSheet.add(txId);
            needsWriteBackOps = true;
          }
          try {
            const v = this.validateTx(
              { txType: def.txType, txDate, itemCode, quantity: qtyRaw, uom: uom || undefined, allowNegativeOverride: true },
              undefined,
              true
            );
            const ts = pick(r, 'Created At') || nowIso();
            const meta = this.enrichTxRateMeta(v.txDate, v.conv.enteredQty, {
              unitRate,
              currency,
              exchangeRate: exRateInput > 0 ? exRateInput : undefined,
              poNo: poNo || undefined,
              invoiceNo: invoiceNo || undefined,
              vehicleNo: vehicleNo || undefined,
              issuedTo: issuedTo || undefined,
            });
            const candHash = hashParts([txId, v.txDate, v.item.itemCode, v.conv.enteredQty, v.conv.enteredUom, statusRaw]);
            this.db.ledger.push({
              txId,
              txType: def.txType,
              txDate: v.txDate,
              itemCode: v.item.itemCode,
              itemName: v.item.itemName,
              category: v.item.category,
              brand: v.item.brand,
              enteredQty: v.conv.enteredQty,
              enteredUom: v.conv.enteredUom,
              baseQty: v.conv.baseQty,
              direction: v.direction,
              sourceSheet: def.sheetName,
              sourceRow: i + 2,
              batchNo,
              refNo,
              partyOrSection: party,
              metaJson: JSON.stringify(meta),
              remarks,
              createdBy: pick(r, 'Created By') || 'Google Sheets Sync',
              createdAt: ts,
              updatedBy: 'Google Sheets Sync',
              updatedAt: nowIso(),
              status: statusRaw,
              recordHash: candHash,
            });
            if (!this.db.workingSheets[def.sheetName]) this.db.workingSheets[def.sheetName] = [];
            this.db.workingSheets[def.sheetName].push({
              txId,
              txDate: v.txDate,
              itemCode: v.item.itemCode,
              quantity: v.conv.enteredQty,
              uom: v.conv.enteredUom,
              partyOrSection: party,
              refNo,
              batchNo,
              remarks,
              status: statusRaw,
              syncStatus: 'SYNCED',
            });
            nextHashes[`OPS:${def.sheetName}:${txId}`] = hashVal;
            created++;
          } catch (err: any) {
            errors.push(`${def.sheetName} row ${i + 2}: ${err?.message || err}`);
          }
        } else {
          try {
            const v = this.validateTx(
              { txType: def.txType, txDate, itemCode, quantity: qtyRaw, uom: uom || existingTx.enteredUom, allowNegativeOverride: true },
              existingTx.txId,
              true
            );
            const candHash = hashParts([txId, v.txDate, v.item.itemCode, v.conv.enteredQty, v.conv.enteredUom, statusRaw]);
            const prevMeta = (() => { try { return JSON.parse(existingTx.metaJson || '{}'); } catch { return {}; } })();
            const nextMeta = this.enrichTxRateMeta(v.txDate, v.conv.enteredQty, {
              ...prevMeta,
              unitRate: unitRate || prevMeta.unitRate || 0,
              currency: currency || prevMeta.currency || 'NPR',
              exchangeRate: exRateInput > 0 ? exRateInput : prevMeta.exchangeRate,
              poNo: poNo || prevMeta.poNo,
              invoiceNo: invoiceNo || prevMeta.invoiceNo,
              vehicleNo: vehicleNo || prevMeta.vehicleNo,
              issuedTo: issuedTo || prevMeta.issuedTo,
            });
            if (
              existingTx.itemCode !== v.item.itemCode ||
              existingTx.txDate !== v.txDate ||
              existingTx.enteredQty !== v.conv.enteredQty ||
              existingTx.enteredUom !== v.conv.enteredUom ||
              existingTx.status !== statusRaw ||
              existingTx.refNo !== refNo ||
              existingTx.partyOrSection !== party ||
              existingTx.batchNo !== batchNo ||
              existingTx.remarks !== remarks ||
              JSON.stringify(prevMeta) !== JSON.stringify(nextMeta)
            ) {
              existingTx.itemCode = v.item.itemCode;
              existingTx.itemName = v.item.itemName;
              existingTx.category = v.item.category;
              existingTx.brand = v.item.brand;
              existingTx.txDate = v.txDate;
              existingTx.enteredQty = v.conv.enteredQty;
              existingTx.enteredUom = v.conv.enteredUom;
              existingTx.baseQty = v.conv.baseQty;
              existingTx.status = statusRaw;
              existingTx.refNo = refNo;
              existingTx.partyOrSection = party;
              existingTx.batchNo = batchNo;
              existingTx.remarks = remarks;
              existingTx.metaJson = JSON.stringify(nextMeta);
              existingTx.updatedBy = 'Google Sheets Sync';
              existingTx.updatedAt = nowIso();
              existingTx.recordHash = candHash;
              const wsRow = (this.db.workingSheets[def.sheetName] || []).find((w) => w.txId === txId);
              if (wsRow) {
                wsRow.txDate = v.txDate;
                wsRow.itemCode = v.item.itemCode;
                wsRow.quantity = v.conv.enteredQty;
                wsRow.uom = v.conv.enteredUom;
                wsRow.refNo = refNo;
                wsRow.partyOrSection = party;
                wsRow.batchNo = batchNo;
                wsRow.remarks = remarks;
                wsRow.status = statusRaw;
              }
              updated++;
            }
            nextHashes[`OPS:${def.sheetName}:${txId}`] = hashVal;
          } catch (err: any) {
            errors.push(`${def.sheetName} row ${i + 2}: ${err?.message || err}`);
          }
        }
      }

      // Deletion detection: if a previously synced TX was deleted from Google Sheet
      if (rawCount >= 1) {
        const removedTx = this.db.ledger.filter(
          (l) => l.sourceSheet === def.sheetName && Boolean(prev[`OPS:${def.sheetName}:${l.txId}`]) && !seenInThisSheet.has(l.txId)
        );
        if (removedTx.length > 0) {
          const rmIds = new Set(removedTx.map((t) => t.txId));
          this.db.ledger = this.db.ledger.filter((l) => !rmIds.has(l.txId));
          if (this.db.workingSheets[def.sheetName]) {
            this.db.workingSheets[def.sheetName] = this.db.workingSheets[def.sheetName].filter((w) => !rmIds.has(w.txId));
          }
          deleted += removedTx.length;
        }
      }
    }

    // 2b. Operations: Also reconcile any extra rows in _SYS_Transaction_Ledger not already covered
    const ledgerSheetRows = input.operations['_SYS_Transaction_Ledger'] || [];
    for (let i = 0; i < ledgerSheetRows.length; i++) {
      const r = ledgerSheetRows[i];
      const txId = pick(r, 'Transaction ID', 'txId');
      if (!txId) continue;
      const rawType = pick(r, 'Transaction Type', 'txType').toUpperCase();
      if (!['PRODUCTION', 'GOODS_RECEIPT', 'DISPATCH', 'ISSUE', 'OPENING_STOCK', 'ADJUSTMENT'].includes(rawType)) continue;
      const rawCode = pick(r, 'Item Code', 'itemCode');
      const rawName = pick(r, 'Item Name', 'itemName');
      const matchedItem = resolveItemForSheetRow(rawCode, rawName);
      const itemCode = matchedItem ? matchedItem.itemCode : rawCode;
      const qtyRaw = numOr(pick(r, 'Entered Quantity', 'Quantity'), 0);
      if (!itemCode || qtyRaw <= 0) continue;
      if (this.db.ledger.some((l) => l.txId === txId)) continue;
      try {
        const txDate = normDate(pick(r, 'Transaction Date', 'txDate'));
        const rawUom = pick(r, 'Entered UOM', 'UOM');
        const uom = matchedItem ? resolveUomForItem(matchedItem, rawUom) : rawUom;
        const v = this.validateTx(
          { txType: rawType as any, txDate, itemCode, quantity: qtyRaw, uom: uom || undefined, allowNegativeOverride: true },
          undefined,
          true
        );
        let parsedMeta: Record<string, any> = {};
        const mj = pick(r, 'Meta JSON', 'metaJson');
        if (mj) { try { parsedMeta = JSON.parse(mj); } catch {} }
        const statusRaw = pick(r, 'Transaction Status', 'Status').toUpperCase() === 'CANCELLED' ? 'CANCELLED' : 'ACTIVE';
        const srcSheet =
          pick(r, 'Source Sheet', 'sourceSheet') ||
          (rawType === 'PRODUCTION' ? 'Production' : rawType === 'DISPATCH' ? 'Dispatch' : rawType === 'ISSUE' ? 'Issue' : 'Goods Reciept');
        const candHash = hashParts([txId, v.txDate, v.item.itemCode, v.conv.enteredQty, v.conv.enteredUom, statusRaw]);
        this.db.ledger.push({
          txId,
          txType: rawType as any,
          txDate: v.txDate,
          itemCode: v.item.itemCode,
          itemName: v.item.itemName,
          category: v.item.category,
          brand: v.item.brand,
          enteredQty: v.conv.enteredQty,
          enteredUom: v.conv.enteredUom,
          baseQty: v.conv.baseQty,
          direction: v.direction,
          sourceSheet: srcSheet,
          sourceRow: Number(pick(r, 'Source Row')) || i + 2,
          batchNo: pick(r, 'Batch Number', 'Batch/Lot Number'),
          refNo: pick(r, 'Reference Number'),
          partyOrSection: pick(r, 'Party / Section'),
          metaJson: JSON.stringify(this.enrichTxRateMeta(v.txDate, v.conv.enteredQty, parsedMeta)),
          remarks: pick(r, 'Remarks'),
          createdBy: pick(r, 'Created By') || 'Google Sheets Sync',
          createdAt: pick(r, 'Created At') || nowIso(),
          updatedBy: 'Google Sheets Sync',
          updatedAt: nowIso(),
          status: statusRaw,
          recordHash: candHash,
        });
        created++;
      } catch (err: any) {
        errors.push(`_SYS_Transaction_Ledger row ${i + 2}: ${err?.message || err}`);
      }
    }

    // 3. Procurement & Tender Tabs + ExchangeRates + Settings
    const pDb: any = this.db.procurement || (this.db.procurement = createDefaultProcurementDb(false));
    const procSchemas: Record<string, string[]> = {
      Indents: ['IndentNo', 'Date', 'Department', 'Requester', 'ItemCode', 'ItemName', 'RequiredQty', 'Unit', 'RequiredDeliveryDate', 'Priority', 'Status', 'ApprovedBy', 'ApprovalDate', 'Remarks', 'Timestamp'],
      Suppliers: ['SupplierId', 'Name', 'PanNo', 'GstNo', 'ContactPerson', 'Phone', 'Email', 'Country', 'Address', 'PaymentTerms', 'Currency', 'LeadTimeDays', 'Rating', 'Timestamp'],
      FreightForwarder: ['ForwarderId', 'Name', 'Address', 'ContactPerson', 'Phone', 'Email', 'Rating', 'Remarks', 'Timestamp'],
      Quotations: ['QuotationNo', 'IndentNo', 'SupplierId', 'SupplierName', 'Date', 'ValidityDate', 'Currency', 'ExchangeRate', 'Incoterms', 'FreightCharges', 'OtherCharges', 'Subtotal', 'TotalAmount', 'TotalAmountNPR', 'Status', 'MDApproval', 'MDApprovalDate', 'MDNotes', 'AttachmentName', 'AttachmentUrl', 'ItemsJSON', 'Timestamp'],
      PurchaseOrders: ['PONo', 'QuotationNo', 'SupplierId', 'SupplierName', 'OrderDate', 'DeliveryTerms', 'PaymentTerms', 'Incoterms', 'Currency', 'ExchangeRate', 'TotalValue', 'TotalValueNPR', 'ExpectedDeliveryDate', 'Status', 'ApprovalStatus', 'ItemsJSON', 'ReceivedStatus', 'ReceivedQty', 'PendingQty', 'Timestamp'],
      LCTTPayments: ['PaymentId', 'PONo', 'SupplierName', 'BankName', 'PaymentType', 'Currency', 'Amount', 'ExchangeRate', 'AmountNPR', 'LCNumber', 'LCOpeningDate', 'MaturityDate', 'Status', 'PaymentStage', 'Remarks', 'Timestamp'],
      Shipments: ['ShipmentId', 'PONo', 'SupplierName', 'ForwarderId', 'ForwarderName', 'ShippingLine', 'OriginType', 'OriginCountry', 'POL', 'POD', 'ContainerNo', 'BLAWBNo', 'ETD', 'ETA', 'ActualDeparture', 'ActualArrival', 'CustomsStatus', 'FreightAmountNPR', 'ShipmentStatus', 'Remarks', 'Timestamp'],
      Tenders: ['TenderNo', 'TenderName', 'Address', 'ContactInfo', 'PublicationDate', 'SubmissionDeadline', 'ItemName', 'Quantity', 'Unit', 'EstimatedRate', 'BidSecurityAmount', 'BidSecurityStatus', 'Result', 'Remarks', 'Timestamp'],
      TenderTracking: ['TrackingId', 'TenderNo', 'TenderName', 'Address', 'ContactInfo', 'LastSubmissionDate', 'ItemName', 'Unit', 'Quantity', 'RateIncVat', 'Amount', 'MuchulkaStatus', 'MuchulkaDate', 'LOIStatus', 'LOIDate', 'LOAStatus', 'LOADate', 'PGStatus', 'PGDate', 'SampleStatus', 'SampleDate', 'ProductionStatus', 'DispatchStatus', 'DispatchDate', 'Remarks', 'Timestamp'],
    };
    const numericProcFields = new Set([
      'RequiredQty', 'LeadTimeDays', 'Rating', 'ExchangeRate', 'FreightCharges', 'OtherCharges', 'Subtotal',
      'TotalAmount', 'TotalAmountNPR', 'TotalValue', 'TotalValueNPR', 'ReceivedQty', 'PendingQty',
      'Amount', 'AmountNPR', 'FreightAmountNPR', 'Quantity', 'EstimatedRate', 'BidSecurityAmount', 'RateIncVat',
    ]);
    const dateProcFields = new Set([
      'Date', 'OrderDate', 'ValidityDate', 'RequiredDeliveryDate', 'ExpectedDeliveryDate',
      'LCOpeningDate', 'MaturityDate', 'PublicationDate', 'SubmissionDeadline', 'LastSubmissionDate',
      'MuchulkaDate', 'LOIDate', 'LOADate', 'PGDate', 'SampleDate', 'DispatchDate',
      'ETD', 'ETA', 'ActualDeparture', 'ActualArrival',
    ]);

    // First import ExchangeRates so PO/Quotation/LCTT conversions have latest date rates
    const fxSheetRows = input.procurement['ExchangeRates'] || [];
    const fxRawCount = input.procRawRowCounts?.['ExchangeRates'] ?? (fxSheetRows.length > 0 ? fxSheetRows.length + 1 : 0);
    if (fxRawCount === 0 && Array.isArray(pDb.ExchangeRates) && pDb.ExchangeRates.length > 0) {
      needsWriteBackProc = true;
    }
    const seenFxDates = new Set<string>();
    for (let i = 0; i < fxSheetRows.length; i++) {
      const raw = fxSheetRows[i];
      if (!Object.values(raw).some((v) => String(v || '').trim() !== '')) continue;
      const rateDate = normDate(pick(raw, 'RateDate', 'Rate Date', 'Date'));
      seenFxDates.add(rateDate);
      const hashVal = hashParts(Object.keys(raw).sort().map((k) => `${k}:${raw[k]}`));
      const hashKey = `PROC:ExchangeRates:${rateDate}`;
      const existingIdx = (pDb.ExchangeRates || []).findIndex((r: any) => r.RateDate === rateDate);
      const nextEntry: ExchangeRateRecord = {
        RateDate: rateDate,
        USD: numOr(pick(raw, 'USD'), 135.5),
        INR: numOr(pick(raw, 'INR'), 1.6015),
        EUR: numOr(pick(raw, 'EUR'), 146.2),
        GBP: numOr(pick(raw, 'GBP'), 172.8),
        CNY: numOr(pick(raw, 'CNY'), 18.6),
        NPR: 1.0,
        Remarks: pick(raw, 'Remarks'),
        UpdatedBy: pick(raw, 'UpdatedBy', 'Updated By') || 'Google Sheets Sync',
        UpdatedAt: pick(raw, 'UpdatedAt', 'Updated At') || nowIso(),
      };
      if (existingIdx === -1) {
        pDb.ExchangeRates.push(nextEntry);
        created++;
      } else {
        const cur = pDb.ExchangeRates[existingIdx];
        if (
          cur.USD !== nextEntry.USD ||
          cur.INR !== nextEntry.INR ||
          cur.EUR !== nextEntry.EUR ||
          cur.GBP !== nextEntry.GBP ||
          cur.CNY !== nextEntry.CNY ||
          (cur.Remarks || '') !== (nextEntry.Remarks || '')
        ) {
          pDb.ExchangeRates[existingIdx] = nextEntry;
          updated++;
        }
      }
      nextHashes[hashKey] = hashVal;
    }
    if (fxRawCount >= 1 && seenFxDates.size > 0) {
      const removedFx = (pDb.ExchangeRates || []).filter(
        (r: any) => Boolean(prev[`PROC:ExchangeRates:${r.RateDate}`]) && !seenFxDates.has(r.RateDate)
      );
      if (removedFx.length > 0) {
        pDb.ExchangeRates = pDb.ExchangeRates.filter((r: any) => seenFxDates.has(r.RateDate) || !prev[`PROC:ExchangeRates:${r.RateDate}`]);
        deleted += removedFx.length;
      }
    }

    // Reconcile all 9 core Procurement & Tender tabs
    const procTabs = Object.keys(procSchemas);
    if (isInitial && isUntouchedSeedDb) {
      const hasAnyProcRows = procTabs.some((t) => (input.procurement[t] || []).length > 0);
      if (hasAnyProcRows) {
        for (const t of procTabs) {
          if ((input.procurement[t] || []).length > 0) {
            pDb[t] = [];
          }
        }
        updated++;
      }
    }

    for (const tabName of procTabs) {
      const pk = PROC_PRIMARY_KEYS[tabName];
      const canonicalCols = procSchemas[tabName];
      const sheetRows = input.procurement[tabName] || [];
      const rawCount = input.procRawRowCounts?.[tabName] ?? (sheetRows.length > 0 ? sheetRows.length + 1 : 0);
      const localList: any[] = Array.isArray(pDb[tabName]) ? pDb[tabName] : (pDb[tabName] = []);
      if (rawCount === 0 && localList.length > 0) {
        needsWriteBackProc = true;
      }

      const seenPks = new Set<string>();
      for (let i = 0; i < sheetRows.length; i++) {
        const raw = sheetRows[i];
        const nonEmpty = Object.values(raw).some((v) => String(v || '').trim() !== '');
        if (!nonEmpty) continue;

        // Map sheet columns to canonical schema fields (case/space/underscore insensitive)
        const cleanRec: Record<string, any> = {};
        const rawKeyByNorm: Record<string, string> = {};
        for (const rk of Object.keys(raw)) {
          rawKeyByNorm[normKey(rk)] = raw[rk];
        }
        for (const col of canonicalCols) {
          const val = raw[col] !== undefined ? raw[col] : rawKeyByNorm[normKey(col)];
          if (val === undefined) continue;
          if (numericProcFields.has(col)) {
            cleanRec[col] = String(val).trim() === '' ? 0 : numOr(val, 0);
          } else if (dateProcFields.has(col)) {
            cleanRec[col] = normDate(val, false);
          } else {
            cleanRec[col] = String(val ?? '').trim();
          }
        }

        let pkVal = String(cleanRec[pk] || '').trim();
        if (pkVal) seenPks.add(pkVal);

        const hashVal = hashParts(Object.keys(raw).sort().map((k) => `${k}:${raw[k]}`));
        const existingIdx = pkVal
          ? localList.findIndex((r) => String(r[pk] || '').trim().toLowerCase() === pkVal.toLowerCase())
          : -1;

        if (existingIdx === -1) {
          if (!pkVal) {
            const prefix = PROC_PREFIXES[tabName] || 'REC';
            const ids = new Set(localList.map((r) => String(r[pk] || '')));
            let n = 1001;
            while (ids.has(`${prefix}-${n}`)) n++;
            pkVal = `${prefix}-${n}`;
            cleanRec[pk] = pkVal;
            seenPks.add(pkVal);
            needsWriteBackProc = true;
          }
          if (!cleanRec.Timestamp) cleanRec.Timestamp = new Date().toISOString();
          localList.push(cleanRec);
          nextHashes[`PROC:${tabName}:${pkVal}`] = hashVal;
          created++;
        } else {
          const cur = localList[existingIdx];
          pkVal = String(cur[pk] || pkVal);
          seenPks.add(pkVal);
          const merged = { ...cur, ...cleanRec };
          let diff = false;
          for (const col of canonicalCols) {
            if (col === 'Timestamp') continue;
            if (String(cur[col] ?? '') !== String(merged[col] ?? '')) {
              diff = true;
              break;
            }
          }
          if (diff) {
            localList[existingIdx] = merged;
            updated++;
          }
          nextHashes[`PROC:${tabName}:${pkVal}`] = hashVal;
        }
      }

      // Deletion detection for Procurement tabs
      if (rawCount >= 1) {
        const removed = localList.filter((r) => {
          const id = String(r[pk] || '').trim();
          return id && Boolean(prev[`PROC:${tabName}:${id}`]) && !seenPks.has(id);
        });
        if (removed.length > 0) {
          const rmSet = new Set(removed.map((r) => String(r[pk] || '').trim()));
          pDb[tabName] = localList.filter((r) => !rmSet.has(String(r[pk] || '').trim()));
          deleted += removed.length;
        }
      }
    }

    const latestFx = this.getExchangeRateHistory();
    if (latestFx.length > 0) {
      pDb.exchangeRates = {
        USD: latestFx[0].USD,
        INR: latestFx[0].INR,
        EUR: latestFx[0].EUR,
        GBP: latestFx[0].GBP,
        CNY: latestFx[0].CNY,
        NPR: 1.0,
      };
    }

    if (created > 0 || updated > 0 || deleted > 0) {
      this.audit(
        'GOOGLE_SHEETS_SYNC',
        'Integration',
        'SHEETS_2WAY',
        `Synced from Google Sheets (created=${created}, updated=${updated}, deleted=${deleted})`
      );
      this.bump();
    }

    return {
      created,
      updated,
      deleted,
      needsWriteBackOps,
      needsWriteBackProc,
      nextHashes,
      errors,
    };
  }

  /**
   * Executes all 15 mandatory test scenarios against an isolated clean simulator instance.
   */
  static runAll15VerificationTests(): TestResult[] {
    const t = new GasSimulatorEngine(false, false);
    const today = todayIsoDate();
    const yesterday = todayIsoDate(-1);
    const results: TestResult[] = [];

    // TEST 1: Item Master Auto-Code, Update & Delete Unused Item
    const t1Res = t.invoke('addItem', [{ itemName: 'Test Polymer Resin', category: 'Raw Material', indexUnit: 'KG', reorderLevel: 20 }]);
    const rmCode = t1Res.data.itemCode;
    const t1Upd = t.invoke('updateItem', [{ itemCode: rmCode, itemName: 'Test Polymer Resin Grade A', indexUnit: 'KG', reorderLevel: 25 }]);
    const t1Temp = t.invoke('addItem', [{ itemName: 'Temp Unused Spare', category: 'Stores & Spares', indexUnit: 'Nos' }]);
    const t1Del = t.invoke('deleteItem', [t1Temp.data.itemCode]);
    const t1Search = t.invoke('getAllItems', [{}]);
    results.push({
      id: 'TEST 1',
      title: 'Item Master Auto-Code, Edit & Unused Item Delete',
      passed:
        t1Res.success &&
        t1Upd.success &&
        t1Temp.data.itemCode === '6001' &&
        t1Del.success &&
        rmCode === '4001' &&
        t1Search.data.items.some((x: any) => x.itemCode === '4001' && x.itemName === 'Test Polymer Resin Grade A') &&
        !t1Search.data.items.some((x: any) => x.itemCode === '6001'),
      details: `Generated ${rmCode} (updated) and deleted unused ${t1Temp.data.itemCode}; catalog size = ${t1Search.data.items.length}.`,
    });

    // TEST 2: Raw Material Goods Receipt (+100 KG)
    const t2Rec = t.invoke('saveGoodsReceipt', [{ txDate: today, itemCode: rmCode, quantity: 100, uom: 'KG' }]);
    const t2Stk = t.invoke('getRawMaterialStock', [{}]);
    const rmQtyAfterRec = t2Stk.data.rows.find((r: any) => r.itemCode === rmCode)?.closingStock;
    results.push({
      id: 'TEST 2',
      title: 'Goods Receipt Increases Raw Material Stock',
      passed: t2Rec.success && rmQtyAfterRec === 100,
      details: `Receipt ${t2Rec.data.txId}: RM stock = ${rmQtyAfterRec} KG (expected 100).`,
    });

    // TEST 3: Packing Material Receipt (+50 Rolls)
    const pmItem = t.invoke('addItem', [{ itemName: 'Packing Stretch Film', category: 'Packing Material', indexUnit: 'Roll' }]);
    const pmCode = pmItem.data.itemCode;
    t.invoke('saveGoodsReceipt', [{ txDate: today, itemCode: pmCode, quantity: 50, uom: 'Roll' }]);
    const pmStk = t.invoke('getPackingMaterialStock', [{}]).data.rows.find((r: any) => r.itemCode === pmCode)?.closingStock;
    results.push({
      id: 'TEST 3',
      title: 'Packing Material Receipt Increases PM Stock',
      passed: pmCode === '5001' && pmStk === 50,
      details: `Code ${pmCode}; Packing Material Stock = ${pmStk} Roll (expected 50).`,
    });

    // TEST 4: Production (+500 Pkt Finished Goods, with 1 Cartoon = 48 Pkt)
    const fgItem = t.invoke('addItem', [{
      itemName: 'Mask 3-Ply',
      category: 'Finished Goods',
      indexUnit: 'Pkt',
      conversionUnit: 'Cartoon',
      conversionQty: 48,
    }]);
    const fgCode = fgItem.data.itemCode;
    const t4Prod = t.invoke('saveProduction', [{ txDate: yesterday, itemCode: fgCode, quantity: 500, uom: 'Pkt' }]);
    const fgStk4 = t.invoke('getStockByItem', [fgCode]).data;
    results.push({
      id: 'TEST 4',
      title: 'Production Increases Finished Goods Stock (+Quotient/Remainder UOM)',
      passed: t4Prod.success && fgStk4.closingStock === 500 && fgStk4.dualDisplay === '10 Cartoon 20 Pkt',
      details: `Code ${fgCode}: Closing = ${fgStk4.closingStock} Pkt (${fgStk4.dualDisplay}).`,
    });

    // TEST 5: Dispatch (-100 Pkt => 400 Pkt)
    const t5Disp = t.invoke('saveDispatch', [{ txDate: yesterday, itemCode: fgCode, quantity: 100, uom: 'Pkt', partyOrSection: 'Birat Distributors' }]);
    const fgStk5 = t.invoke('getStockByItem', [fgCode]).data;
    results.push({
      id: 'TEST 5',
      title: 'Dispatch Reduces Finished Goods Stock',
      passed: t5Disp.success && fgStk5.closingStock === 400 && fgStk5.dualDisplay === '8 Cartoon 16 Pkt',
      details: `Remaining FG stock = ${fgStk5.closingStock} Pkt (${fgStk5.dualDisplay}).`,
    });

    // TEST 6: Issue Raw Material (-20 KG => 80 KG)
    const t6Iss = t.invoke('saveIssue', [{ txDate: today, itemCode: rmCode, quantity: 20, uom: 'KG', partyOrSection: 'Line A' }]);
    const rmStk6 = t.invoke('getStockByItem', [rmCode]).data.closingStock;
    results.push({
      id: 'TEST 6',
      title: 'Issue Reduces Raw Material Stock',
      passed: t6Iss.success && rmStk6 === 80,
      details: `Remaining RM stock = ${rmStk6} KG (expected 80).`,
    });

    // TEST 7: Secondary UOM Conversion Receipt (2 Cartoon = 96 Pkt) + Remainder Carryover (60 Pkt => 1 Cartoon 12 Pkt)
    const t7Item = t.invoke('addItem', [{
      itemName: 'UOM Test Mask',
      category: 'Finished Goods',
      indexUnit: 'Pkt',
      conversionUnit: 'Cartoon',
      conversionQty: 48,
    }]);
    t.invoke('saveGoodsReceipt', [{ txDate: today, itemCode: t7Item.data.itemCode, quantity: 2, uom: 'Cartoon' }]);
    const stk7a = t.invoke('getStockByItem', [t7Item.data.itemCode]).data;
    const t7bItem = t.invoke('addItem', [{
      itemName: 'Remainder Mask',
      category: 'Finished Goods',
      indexUnit: 'Pkt',
      conversionUnit: 'Cartoon',
      conversionQty: 48,
    }]);
    t.invoke('saveProduction', [{ txDate: today, itemCode: t7bItem.data.itemCode, quantity: 60, uom: 'Pkt' }]);
    const stk7b = t.invoke('getStockByItem', [t7bItem.data.itemCode]).data;
    results.push({
      id: 'TEST 7',
      title: 'Secondary UOM Conversion & Remainder Rule (60 Pkt => 1 Cartoon 12 Pkt)',
      passed: stk7a.closingStock === 96 && stk7b.dualDisplay === '1 Cartoon 12 Pkt',
      details: `2 Cartoon => ${stk7a.closingStock} Pkt; 60 Pkt => ${stk7b.dualDisplay}.`,
    });

    // TEST 8: Transaction Editing (100 -> 120 KG => net 100 after 20 issue, not 200)
    const t8Upd = t.invoke('updateTransaction', [t2Rec.data.txId, { quantity: 120 }]);
    const rmStk8 = t.invoke('getStockByItem', [rmCode]).data.closingStock;
    results.push({
      id: 'TEST 8',
      title: 'Transaction Edit Updates In-Place (No Double-Counting)',
      passed: t8Upd.success && rmStk8 === 100,
      details: `Edited receipt 100->120 KG (with 20 KG issued): Stock = ${rmStk8} KG (expected 100, not 200).`,
    });

    // TEST 9: Transaction Cancellation (reverses exactly once, preserves history)
    const cancelRes = t.invoke('cancelTransaction', [t6Iss.data.txId, 'Test cancellation']);
    const cancelAgain = t.invoke('cancelTransaction', [t6Iss.data.txId, 'Double cancel check']);
    const rmStk9 = t.invoke('getStockByItem', [rmCode]).data.closingStock;
    results.push({
      id: 'TEST 9',
      title: 'Transaction Cancellation Reverses Exactly Once',
      passed: cancelRes.success && !cancelAgain.success && rmStk9 === 120,
      details: `Cancelled 20 KG issue => RM stock = ${rmStk9} KG; second cancel blocked.`,
    });

    // TEST 10: Manual Spreadsheet Entry Sync
    const manSync = t.simulateManualSheetRow('Goods Reciept', {
      txId: 'GRN-MANUAL-001',
      txDate: today,
      itemCode: rmCode,
      quantity: 30,
      uom: 'KG',
    });
    const rmStk10 = t.invoke('getStockByItem', [rmCode]).data.closingStock;
    results.push({
      id: 'TEST 10',
      title: 'Direct Spreadsheet Entry Synchronizes to Ledger',
      passed: manSync.created === 1 && rmStk10 === 150,
      details: `Manual Goods Reciept +30 KG synced => RM stock = ${rmStk10} KG.`,
    });

    // TEST 11: Duplicate Paste / Re-sync Protection
    const dupSync = t.simulateManualSheetRow('Goods Reciept', {
      txId: 'GRN-MANUAL-001',
      txDate: today,
      itemCode: rmCode,
      quantity: 30,
      uom: 'KG',
    });
    const rmStk11 = t.invoke('getStockByItem', [rmCode]).data.closingStock;
    results.push({
      id: 'TEST 11',
      title: 'Duplicate Paste / Re-Sync Idempotency',
      passed: dupSync.skipped >= 1 && dupSync.created === 0 && rmStk11 === 150,
      details: `Re-pasted identical row => skipped=${dupSync.skipped}, RM stock remains ${rmStk11} KG.`,
    });

    // TEST 12: Insufficient Stock Rejection
    const t12Fail = t.invoke('saveDispatch', [{ txDate: today, itemCode: fgCode, quantity: 9999, uom: 'Pkt' }]);
    results.push({
      id: 'TEST 12',
      title: 'Insufficient Stock Dispatch Rejection',
      passed: !t12Fail.success && t12Fail.message.includes('Insufficient stock'),
      details: t12Fail.message,
    });

    // TEST 13: Daily Stock Report Accuracy
    const repYestBefore = t.invoke('generateDailyStockReport', [yesterday]).data;
    const fgRowBefore = repYestBefore.finishedGoods.find((r: any) => r.itemCode === fgCode);
    results.push({
      id: 'TEST 13',
      title: 'Daily Stock Report Balances (Opening + In - Out = Closing)',
      passed: fgRowBefore.openingStock === 0 && fgRowBefore.stockIn === 500 && fgRowBefore.stockOut === 100 && fgRowBefore.closingStock === 400,
      details: `Yesterday FG: Open=${fgRowBefore.openingStock}, Prod=${fgRowBefore.stockIn}, Disp=${fgRowBefore.stockOut}, Close=${fgRowBefore.closingStock}.`,
    });

    // TEST 14: Historical Accuracy After Future Transactions
    t.invoke('saveProduction', [{ txDate: today, itemCode: fgCode, quantity: 250, uom: 'Pkt' }]);
    const repYestAfter = t.invoke('generateDailyStockReport', [yesterday]).data;
    const fgRowAfter = repYestAfter.finishedGoods.find((r: any) => r.itemCode === fgCode);
    const fgToday = t.invoke('getStockByItem', [fgCode]).data.closingStock;
    results.push({
      id: 'TEST 14',
      title: 'Historical Report Unchanged by Today Transactions',
      passed: fgRowAfter.closingStock === 400 && fgToday === 650,
      details: `Yesterday closing stays ${fgRowAfter.closingStock} Pkt while today live stock is ${fgToday} Pkt.`,
    });

    // TEST 15: Concurrent / Duplicate Token Prevention & Unique IDs
    const token = 'CONC-TOKEN-99';
    const c1 = t.invoke('saveProduction', [{ txDate: today, itemCode: fgCode, quantity: 10, uom: 'Pkt', clientToken: token }]);
    const c2 = t.invoke('saveProduction', [{ txDate: today, itemCode: fgCode, quantity: 10, uom: 'Pkt', clientToken: token }]);
    const c3 = t.invoke('saveProduction', [{ txDate: today, itemCode: fgCode, quantity: 10, uom: 'Pkt', clientToken: 'CONC-TOKEN-100' }]);
    results.push({
      id: 'TEST 15',
      title: 'Duplicate Token & Unique Transaction ID Concurrency Guard',
      passed: c1.success && !c2.success && c3.success && c1.data.txId !== c3.data.txId,
      details: `First ID ${c1.data.txId}, duplicate token blocked, second unique tx ID ${c3.data.txId}.`,
    });

    return results;
  }
}
