import { clearSheetsAccessToken, getSheetsAccessToken } from './googleAuth';
import type { GasSimulatorEngine } from './gasSimulator';

export const OPERATIONS_SPREADSHEET_ID = '1gGmpt4gKEE4Nu42960A8cmdrXaTpT-IKHW5oTAWGAJs';
export const PROCUREMENT_SPREADSHEET_ID = '16SN_MJjvmWqt_OH8Hol3AVGB6hWFTM_rYOG1FTi2-yY';

const HASH_STORAGE_KEY = 'BIRAT_ERP_SHEET_HASHES_V1';

const OPS_READ_TABS = ['Item Master', 'Production', 'Dispatch', 'Goods Reciept', 'Issue', '_SYS_Transaction_Ledger'];
const OPS_ALL_TABS = [
  'Item Master',
  'Production',
  'Dispatch',
  'Goods Reciept',
  'Issue',
  'Finished Goods',
  'Raw Material',
  'Packing Material',
  'All Stock Balance',
  '_SYS_Transaction_Ledger',
];

const PROC_READ_TABS = [
  'Indents',
  'Suppliers',
  'FreightForwarder',
  'Quotations',
  'PurchaseOrders',
  'LCTTPayments',
  'Shipments',
  'Tenders',
  'TenderTracking',
  'ExchangeRates',
];
const PROC_ALL_TABS = [...PROC_READ_TABS, 'AuditLog'];

const TAB_ALIASES: Record<string, string[]> = {
  'Goods Reciept': ['Goods Reciept', 'Goods Receipt', 'GRN'],
  'Item Master': ['Item Master', 'ItemMaster', 'Items'],
  Production: ['Production'],
  Dispatch: ['Dispatch'],
  Issue: ['Issue'],
  _SYS_Transaction_Ledger: ['_SYS_Transaction_Ledger', 'Transaction Ledger', 'Ledger'],
  Indents: ['Indents', 'Purchase Indents'],
  Suppliers: ['Suppliers', 'Supplier Master'],
  FreightForwarder: ['FreightForwarder', 'Freight Forwarder', 'Freight Forwarders'],
  Quotations: ['Quotations'],
  PurchaseOrders: ['PurchaseOrders', 'Purchase Orders', 'PO'],
  LCTTPayments: ['LCTTPayments', 'LC TT Payments', 'LCTT Payments'],
  Shipments: ['Shipments'],
  Tenders: ['Tenders'],
  TenderTracking: ['TenderTracking', 'Tender Tracking'],
  ExchangeRates: ['ExchangeRates', 'Exchange Rates'],
};

export interface SheetSyncSummary {
  opsTitle: string;
  procTitle: string;
  importedCreated: number;
  importedUpdated: number;
  importedDeleted: number;
  pushedOpsTabs: number;
  pushedProcTabs: number;
  versionChanged: boolean;
  syncedAt: string;
  errors: string[];
}

function normTabKey(name: string): string {
  return name.toLowerCase().replace(/[^a-z0-9]/g, '');
}

function resolveActualTabName(canonical: string, availableTabs: string[]): string | null {
  if (availableTabs.includes(canonical)) return canonical;
  const aliases = TAB_ALIASES[canonical] || [canonical];
  for (const a of aliases) {
    const exact = availableTabs.find((t) => t.trim().toLowerCase() === a.toLowerCase());
    if (exact) return exact;
  }
  const targetNorm = normTabKey(canonical);
  const byNorm = availableTabs.find((t) => normTabKey(t) === targetNorm);
  return byNorm || null;
}

function loadPrevHashes(): Record<string, string> {
  try {
    const raw = localStorage.getItem(HASH_STORAGE_KEY);
    return raw ? JSON.parse(raw) : {};
  } catch {
    return {};
  }
}

function saveHashes(hashes: Record<string, string>) {
  try {
    localStorage.setItem(HASH_STORAGE_KEY, JSON.stringify(hashes));
  } catch {
    // ignore storage quota errors
  }
}

function requireToken(): string {
  const token = getSheetsAccessToken();
  if (!token) {
    throw new Error('Google Sheets connection is not active. Click "Sign in with Google" first.');
  }
  return token;
}

async function sheetsApiFetch<T>(url: string, token: string, init?: RequestInit): Promise<T> {
  const res = await fetch(url, {
    ...init,
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
      ...(init?.headers || {}),
    },
  });

  if (res.status === 401 || res.status === 403) {
    let detail = '';
    let reason = '';
    try {
      const errJson = await res.json();
      detail = errJson?.error?.message || '';
      reason = String(errJson?.error?.details?.[0]?.reason || errJson?.error?.status || '');
    } catch {
      // ignore parse failure
    }
    const isScopeError =
      /insufficient|scope/i.test(detail) || /ACCESS_TOKEN_SCOPE_INSUFFICIENT/i.test(reason);
    if (res.status === 401) {
      clearSheetsAccessToken('Google session expired. Please reconnect Google Sheets.');
    } else if (isScopeError) {
      clearSheetsAccessToken(
        'Google Sheets permission was not granted. Click "Authorize Google Sheets" and check the Google Sheets permission box.',
        true
      );
      throw new Error(
        'Google Sheets permission missing. Click "Authorize Google Sheets" and check the Google Sheets permission box.'
      );
    }
    throw new Error(
      detail || `Google Sheets permission error (HTTP ${res.status}). Ensure your Google account has Editor access to both spreadsheets.`
    );
  }

  if (!res.ok) {
    let errText = '';
    try {
      const errJson = await res.json();
      errText = errJson?.error?.message || JSON.stringify(errJson);
    } catch {
      errText = await res.text();
    }
    throw new Error(errText || `Google Sheets request failed (HTTP ${res.status}).`);
  }

  return (await res.json()) as T;
}

interface SpreadsheetMeta {
  title: string;
  sheetTitles: string[];
}

async function fetchSpreadsheetMeta(spreadsheetId: string, token: string): Promise<SpreadsheetMeta> {
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}?fields=properties.title,sheets.properties.title`;
  const data = await sheetsApiFetch<{
    properties?: { title?: string };
    sheets?: Array<{ properties?: { title?: string } }>;
  }>(url, token);

  return {
    title: data.properties?.title || spreadsheetId,
    sheetTitles: (data.sheets || [])
      .map((s) => s.properties?.title || '')
      .filter(Boolean),
  };
}

async function ensureMissingTabs(
  spreadsheetId: string,
  existingTitles: string[],
  requiredTitles: string[],
  token: string
): Promise<string[]> {
  const missing = requiredTitles.filter((t) => !resolveActualTabName(t, existingTitles));
  if (missing.length === 0) return existingTitles;

  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}:batchUpdate`;
  await sheetsApiFetch(url, token, {
    method: 'POST',
    body: JSON.stringify({
      requests: missing.map((title) => ({
        addSheet: {
          properties: { title },
        },
      })),
    }),
  });

  return [...existingTitles, ...missing];
}

function matrixToRowMaps(values: any[][] | undefined): Record<string, string>[] {
  if (!values || values.length <= 1) return [];
  const headers = values[0].map((h) => String(h ?? '').trim());
  const out: Record<string, string>[] = [];
  for (let i = 1; i < values.length; i++) {
    const rowArr = values[i] || [];
    const obj: Record<string, string> = {};
    let hasValue = false;
    for (let c = 0; c < headers.length; c++) {
      const h = headers[c];
      if (!h) continue;
      const cell = rowArr[c] !== undefined && rowArr[c] !== null ? String(rowArr[c]) : '';
      if (cell.trim() !== '') hasValue = true;
      obj[h] = cell;
    }
    if (hasValue) out.push(obj);
  }
  return out;
}

function extractTabFromRange(range: string): string {
  const bang = range.lastIndexOf('!');
  const raw = bang > 0 ? range.slice(0, bang) : range;
  return raw.replace(/^'/, '').replace(/'$/, '').replace(/''/g, "'");
}

async function batchReadTabs(
  spreadsheetId: string,
  canonicalTabs: string[],
  availableTabs: string[],
  token: string
): Promise<{ rowsByTab: Record<string, Record<string, string>[]>; rawRowCounts: Record<string, number> }> {
  const rowsByTab: Record<string, Record<string, string>[]> = {};
  const rawRowCounts: Record<string, number> = {};
  const queryPlan: Array<{ canonical: string; actual: string }> = [];

  for (const canonical of canonicalTabs) {
    rowsByTab[canonical] = [];
    rawRowCounts[canonical] = 0;
    const actual = resolveActualTabName(canonical, availableTabs);
    if (actual) {
      queryPlan.push({ canonical, actual });
    }
  }

  if (queryPlan.length === 0) return { rowsByTab, rawRowCounts };

  const params = queryPlan
    .map((p) => `ranges=${encodeURIComponent(`'${p.actual.replace(/'/g, "''")}'!A1:AZ10000`)}`)
    .join('&');
  const url = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values:batchGet?${params}&majorDimension=ROWS`;

  const resp = await sheetsApiFetch<{
    valueRanges?: Array<{ range?: string; values?: any[][] }>;
  }>(url, token);

  (resp.valueRanges || []).forEach((vr, idx) => {
    const inferredActual = vr.range ? extractTabFromRange(vr.range) : queryPlan[idx]?.actual;
    const planItem =
      queryPlan.find((p) => p.actual.toLowerCase() === String(inferredActual || '').toLowerCase()) || queryPlan[idx];
    if (planItem) {
      rawRowCounts[planItem.canonical] = vr.values ? vr.values.length : 0;
      rowsByTab[planItem.canonical] = matrixToRowMaps(vr.values);
    }
  });

  return { rowsByTab, rawRowCounts };
}

async function writeTabsBatch(
  spreadsheetId: string,
  matrices: Record<string, (string | number)[][]>,
  existingTabs: string[],
  token: string
): Promise<number> {
  const canonicalNames = Object.keys(matrices);
  if (canonicalNames.length === 0) return 0;

  const tabsAfter = await ensureMissingTabs(spreadsheetId, existingTabs, canonicalNames, token);
  const resolvedTargets = canonicalNames.map((canonical) => ({
    canonical,
    actual: resolveActualTabName(canonical, tabsAfter) || canonical,
  }));

  const clearUrl = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values:batchClear`;
  await sheetsApiFetch(clearUrl, token, {
    method: 'POST',
    body: JSON.stringify({
      ranges: resolvedTargets.map((t) => `'${t.actual.replace(/'/g, "''")}'!A1:AZ10000`),
    }),
  });

  const updateUrl = `https://sheets.googleapis.com/v4/spreadsheets/${encodeURIComponent(spreadsheetId)}/values:batchUpdate`;
  await sheetsApiFetch(updateUrl, token, {
    method: 'POST',
    body: JSON.stringify({
      valueInputOption: 'USER_ENTERED',
      data: resolvedTargets.map((t) => ({
        range: `'${t.actual.replace(/'/g, "''")}'!A1`,
        majorDimension: 'ROWS',
        values: matrices[t.canonical],
      })),
    }),
  });

  return resolvedTargets.length;
}

/**
 * Full bidirectional sync:
 * 1. Inspects both Google Spreadsheets metadata & creates any missing ERP tabs non-destructively.
 * 2. Reads Operations & Procurement tabs and merges new/edited/deleted rows from Google Sheets into ERP.
 * 3. Writes back ERP state or generated IDs/calculated stock registers so both Sheets stay synchronized.
 */
export async function syncBidirectionalWithGoogleSheets(
  engine: GasSimulatorEngine,
  options: { pushAfterPull?: boolean; initialLink?: boolean } = {}
): Promise<SheetSyncSummary> {
  const token = requireToken();
  const prevVersion = engine.getDbSnapshot().version;

  const [opsMeta, procMeta] = await Promise.all([
    fetchSpreadsheetMeta(OPERATIONS_SPREADSHEET_ID, token),
    fetchSpreadsheetMeta(PROCUREMENT_SPREADSHEET_ID, token),
  ]);

  const [opsTabsAfter, procTabsAfter] = await Promise.all([
    ensureMissingTabs(OPERATIONS_SPREADSHEET_ID, opsMeta.sheetTitles, OPS_ALL_TABS, token),
    ensureMissingTabs(PROCUREMENT_SPREADSHEET_ID, procMeta.sheetTitles, PROC_ALL_TABS, token),
  ]);

  const [opsRead, procRead] = await Promise.all([
    batchReadTabs(OPERATIONS_SPREADSHEET_ID, OPS_READ_TABS, opsTabsAfter, token),
    batchReadTabs(PROCUREMENT_SPREADSHEET_ID, PROC_READ_TABS, procTabsAfter, token),
  ]);

  const prevHashes = loadPrevHashes();
  const reconciled = engine.reconcileFromGoogleSheets({
    operations: opsRead.rowsByTab,
    procurement: procRead.rowsByTab,
    opsRawRowCounts: opsRead.rawRowCounts,
    procRawRowCounts: procRead.rawRowCounts,
    prevHashes,
    initialLink: options.initialLink,
  });

  const payload = engine.exportGoogleSheetsPayloads();
  let pushedOpsTabs = 0;
  let pushedProcTabs = 0;

  const shouldPushOps = Boolean(options.pushAfterPull || reconciled.needsWriteBackOps);
  const shouldPushProc = Boolean(options.pushAfterPull || reconciled.needsWriteBackProc);

  if (shouldPushOps) {
    pushedOpsTabs = await writeTabsBatch(OPERATIONS_SPREADSHEET_ID, payload.operations, opsTabsAfter, token);
  }
  if (shouldPushProc) {
    pushedProcTabs = await writeTabsBatch(PROCUREMENT_SPREADSHEET_ID, payload.procurement, procTabsAfter, token);
  }

  // Always preserve exact synced row key map so additions/edits/deletions are tracked cleanly
  saveHashes({ ...payload.rowHashes, ...reconciled.nextHashes });

  const afterVersion = engine.getDbSnapshot().version;
  return {
    opsTitle: opsMeta.title,
    procTitle: procMeta.title,
    importedCreated: reconciled.created,
    importedUpdated: reconciled.updated,
    importedDeleted: reconciled.deleted,
    pushedOpsTabs,
    pushedProcTabs,
    versionChanged: afterVersion !== prevVersion || reconciled.created > 0 || reconciled.updated > 0 || reconciled.deleted > 0,
    syncedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
    errors: reconciled.errors,
  };
}

/**
 * Automatically pushes ERP system mutations to the corresponding Google Spreadsheet(s).
 */
export async function pushErpChangesToGoogleSheets(
  engine: GasSimulatorEngine,
  scope: 'OPERATIONS' | 'PROCUREMENT' | 'BOTH'
): Promise<{ pushedOpsTabs: number; pushedProcTabs: number; syncedAt: string }> {
  const token = requireToken();
  const payload = engine.exportGoogleSheetsPayloads();
  let pushedOpsTabs = 0;
  let pushedProcTabs = 0;

  if (scope === 'OPERATIONS' || scope === 'BOTH') {
    const opsMeta = await fetchSpreadsheetMeta(OPERATIONS_SPREADSHEET_ID, token);
    pushedOpsTabs = await writeTabsBatch(OPERATIONS_SPREADSHEET_ID, payload.operations, opsMeta.sheetTitles, token);
  }
  if (scope === 'PROCUREMENT' || scope === 'BOTH') {
    const procMeta = await fetchSpreadsheetMeta(PROCUREMENT_SPREADSHEET_ID, token);
    pushedProcTabs = await writeTabsBatch(PROCUREMENT_SPREADSHEET_ID, payload.procurement, procMeta.sheetTitles, token);
  }

  const curHashes = loadPrevHashes();
  saveHashes({ ...curHashes, ...payload.rowHashes });

  return {
    pushedOpsTabs,
    pushedProcTabs,
    syncedAt: new Date().toLocaleTimeString([], { hour: '2-digit', minute: '2-digit', second: '2-digit' }),
  };
}
