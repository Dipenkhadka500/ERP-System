/* ============================================================================
   DIPEN SYSTEM — SPRING BOOT REST + RPC API BRIDGE
   Preserves 100% of callServer(fnName, ...args) contracts over HTTP/JSON
   backed by Java 21 / Spring Boot / MySQL 8.4 (DIPEN_ERP) & Google Sheets v4.
   ============================================================================ */
var AUTH_STORAGE_KEY = 'BIRAT_ERP_AUTH_TOKEN';

var APP = {
  currentView: 'dashboard',
  authToken: '',
  userContext: null,
  allItems: [],
  itemMap: {},
  brands: [],
  dataVersion: 0,
  pollTimer: null,
  charts: {},
  isSubmitting: false,
  itemPage: 1,
  itemPageSize: 20,
  txPage: 1,
  txPageSize: 25,
  selectedWorkItem: null,
  lastReportSnapshot: null,
  workExportCache: {},
  lastPrintHtml: '',
  lastPrintTitle: '',
  lastExportUrl: '',
  procLookups: null,
  procRecordsCache: {},
  procQuoteItems: [],
  procPOItems: [],
  lastViewedPO: null,
  grnApprovedPOs: [],
  lastDashboardData: null,
  lastProcDashboard: null,
  lastSyncData: null,
  lastAuditLogs: []
};

function getDipenToken() {
  if (APP.authToken) return APP.authToken;
  try {
    return sessionStorage.getItem(AUTH_STORAGE_KEY) || localStorage.getItem(AUTH_STORAGE_KEY) || '';
  } catch (e) {
    return '';
  }
}

function dipenRestFetch(url, options) {
  var opts = options || {};
  var headers = Object.assign({ 'Content-Type': 'application/json' }, opts.headers || {});
  var tok = getDipenToken();
  if (tok) {
    headers['Authorization'] = 'Bearer ' + tok;
    headers['X-Auth-Token'] = tok;
  }
  return fetch(url, Object.assign({}, opts, { headers: headers })).then(function (resp) {
    return resp.text().then(function (txt) {
      var json = null;
      try {
        json = txt ? JSON.parse(txt) : {};
      } catch (e) {
        throw new Error('Server returned HTTP ' + resp.status + ': ' + txt.slice(0, 180));
      }
      if (!resp.ok || (json && json.success === false)) {
        if (resp.status === 401 && APP.userContext && typeof showLoginScreenOnly === 'function') {
          APP.authToken = '';
          APP.userContext = null;
          showLoginScreenOnly();
        }
        throw new Error((json && json.message) || ('Request failed with HTTP ' + resp.status));
      }
      return json;
    });
  });
}

function callServer(fnName) {
  var args = Array.prototype.slice.call(arguments, 1);
  if (typeof setLoading === 'function') setLoading(true);
  return dipenRestFetch('/api/rpc/' + encodeURIComponent(fnName), {
    method: 'POST',
    body: JSON.stringify({ args: args })
  }).then(function (res) {
    if (typeof setLoading === 'function') setLoading(false);
    if (res && res.version) {
      APP.dataVersion = res.version;
    }
    if (typeof updateSyncClock === 'function') updateSyncClock();
    return res;
  }).catch(function (err) {
    if (typeof setLoading === 'function') setLoading(false);
    if (typeof setConnStatus === 'function') setConnStatus(false);
    throw err;
  });
}

function startVersionPolling() {
  if (APP.pollTimer) clearInterval(APP.pollTimer);
  var sec = (APP.userContext && APP.userContext.pollIntervalSec) || 30;
  APP.pollTimer = setInterval(function () {
    dipenRestFetch('/api/rpc/checkDataVersion', {
      method: 'POST',
      body: JSON.stringify({ args: [APP.dataVersion || 0] })
    }).then(function (res) {
      if (res && res.success && res.data && res.data.changed) {
        APP.dataVersion = res.data.serverVersion;
        if (typeof refreshItemsCache === 'function') {
          refreshItemsCache().then(function () {
            if (typeof renderCurrentView === 'function') renderCurrentView(true);
          });
        }
      }
      if (typeof updateSyncClock === 'function') updateSyncClock();
    }).catch(function () {
      if (typeof setConnStatus === 'function') setConnStatus(false);
    });
  }, sec * 1000);
}

/* ============================================================================
   TWO-WAY GOOGLE SHEETS SYNC & MYSQL BACKUP CONSOLE EXTENSION
   ============================================================================ */
var dipenSheetsConsole = {
  opsSheets: ['Item Master', 'Production', 'Dispatch', 'Goods Reciept', 'Issue'],
  procSheets: ['Indents', 'Suppliers', 'FreightForwarder', 'Quotations', 'PurchaseOrders', 'LCTTPayments', 'Shipments', 'Tenders', 'TenderTracking', 'ExchangeRates'],

  populateSheetChoices: function () {
    var scopeEl = document.getElementById('dsSheetScope');
    var sheetEl = document.getElementById('dsSheetTab');
    if (!scopeEl || !sheetEl) return;
    var list = scopeEl.value === 'PROCUREMENT' ? dipenSheetsConsole.procSheets : dipenSheetsConsole.opsSheets;
    sheetEl.innerHTML = list.map(function (name) {
      return '<option value="' + escapeHtml(name) + '">' + escapeHtml(name) + '</option>';
    }).join('');
  },

  loadOverview: function () {
    var box = document.getElementById('dsSheetsStatusBanner');
    var logsBody = document.getElementById('dsSyncLogsBody');
    var bkpBody = document.getElementById('dsBackupHistoryBody');
    if (!box) return;

    dipenRestFetch('/api/sheets/status', { method: 'GET' }).then(function (res) {
      var d = res.data || {};
      box.innerHTML =
        '<strong>Google Sheets Credentials:</strong> ' +
        (d.googleSheetsConfigured ? '<span class="status-ok">Configured (Service Account)</span>' : '<span class="status-warn">Not Configured (Set DIPEN_GOOGLE_CREDENTIALS_PATH)</span>') +
        ' · <strong>Auto-Sync:</strong> ' +
        (d.googleSheetsConfigured && d.autoSyncEnabled ? '<span class="status-ok">Active (Push on Save + 30s Pull)</span>' : '<span class="status-muted">Waiting for Credentials</span>') +
        ' · <strong>Operations Sheet ID:</strong> <span class="font-mono">' + escapeHtml(d.operationsSpreadsheetId || '-') + '</span>' +
        ' · <strong>Procurement Sheet ID:</strong> <span class="font-mono">' + escapeHtml(d.procurementSpreadsheetId || '-') + '</span>';

      var logs = d.recentSyncLogs || [];
      if (logsBody) {
        logsBody.innerHTML = logs.length
          ? logs.map(function (l) {
              return '<tr>' +
                '<td class="font-mono">' + escapeHtml(l.syncId) + '</td>' +
                '<td><span class="fw-semibold">' + escapeHtml(l.direction) + '</span></td>' +
                '<td>' + escapeHtml(l.spreadsheetScope) + '</td>' +
                '<td>' + escapeHtml(l.sheetName) + '</td>' +
                '<td class="tabular-nums">' + (l.rowsCreated || 0) + ' / ' + (l.rowsUpdated || 0) + ' / ' + (l.rowsFailed || 0) + '</td>' +
                '<td><span class="status-text ' + (l.status === 'SUCCESS' ? 'status-ok' : 'status-warn') + '">' + escapeHtml(l.status) + '</span></td>' +
                '<td class="small">' + escapeHtml(l.summary || '') + '</td>' +
                '</tr>';
            }).join('')
          : '<tr><td colspan="7" class="text-center text-muted py-3">No Google Sheets sync operations recorded yet.</td></tr>';
      }
    }).catch(function () {});

    if (bkpBody && typeof hasPerm === 'function' && hasPerm('SYNC_ADMIN')) {
      dipenRestFetch('/api/admin/backups', { method: 'GET' }).then(function (res) {
        var list = (res.data && res.data.backups) || [];
        bkpBody.innerHTML = list.length
          ? list.slice(0, 15).map(function (b) {
              return '<tr>' +
                '<td class="font-mono">' + escapeHtml(b.backupId) + '</td>' +
                '<td>' + escapeHtml(b.backupType) + '</td>' +
                '<td class="font-mono">' + escapeHtml(b.fileName) + '</td>' +
                '<td class="tabular-nums">' + fmtNum(b.fileSizeBytes || 0) + ' B</td>' +
                '<td>' + (b.verified ? '<span class="status-ok">Verified</span>' : '<span class="status-warn">' + escapeHtml(b.status) + '</span>') + '</td>' +
                '<td class="small text-muted">' + escapeHtml(b.errorMessage || (b.sha256Checksum ? b.sha256Checksum.slice(0, 16) + '...' : '-')) + '</td>' +
                '</tr>';
            }).join('')
          : '<tr><td colspan="6" class="text-center text-muted py-3">No MySQL backups recorded yet.</td></tr>';
      }).catch(function () {});
    }
  },

  previewImport: function () {
    var scope = document.getElementById('dsSheetScope').value;
    var sheetName = document.getElementById('dsSheetTab').value;
    var outBox = document.getElementById('dsPreviewBox');
    dipenRestFetch('/api/sheets/import/preview', {
      method: 'POST',
      body: JSON.stringify({ scope: scope, sheetName: sheetName })
    }).then(function (res) {
      var d = res.data || {};
      var commitBtn = document.getElementById('dsCommitImportBtn');
      if (commitBtn) commitBtn.disabled = !(d.newRows > 0 || d.updateRows > 0);
      outBox.innerHTML =
        '<div class="alert alert-info py-2 px-3 small mt-2 mb-0">' +
        '<strong>Preview (' + escapeHtml(sheetName) + '):</strong> Total=' + (d.totalRows || 0) +
        ' · New=' + (d.newRows || 0) +
        ' · Updates=' + (d.updateRows || 0) +
        ' · Errors=' + (d.errorCount || 0) +
        '</div>';
      showToast('Google Sheet preview loaded (' + (d.totalRows || 0) + ' rows).', 'success');
    }).catch(function (err) {
      showToast(err.message, 'error');
    });
  },

  commitImport: function () {
    var scope = document.getElementById('dsSheetScope').value;
    var sheetName = document.getElementById('dsSheetTab').value;
    dipenRestFetch('/api/sheets/import/commit', {
      method: 'POST',
      body: JSON.stringify({ scope: scope, sheetName: sheetName })
    }).then(function (res) {
      var d = res.data || {};
      showToast('Imported to MySQL DIPEN_ERP: Created ' + (d.created || 0) + ', Updated ' + (d.updated || 0) + '.', 'success');
      if (typeof refreshItemsCache === 'function') refreshItemsCache();
      dipenSheetsConsole.loadOverview();
    }).catch(function (err) {
      showToast(err.message, 'error');
    });
  },

  exportToSheet: function () {
    var scope = document.getElementById('dsSheetScope').value;
    var sheetName = document.getElementById('dsSheetTab').value;
    dipenRestFetch('/api/sheets/export', {
      method: 'POST',
      body: JSON.stringify({ scope: scope, sheetName: sheetName })
    }).then(function (res) {
      var d = res.data || {};
      showToast('Exported ' + (d.exportedRows || 0) + ' rows from MySQL DIPEN_ERP to Google Sheet "' + sheetName + '".', 'success');
      dipenSheetsConsole.loadOverview();
    }).catch(function (err) {
      showToast(err.message, 'error');
    });
  },

  syncAllNow: function () {
    dipenRestFetch('/api/sheets/sync-all', { method: 'POST', body: '{}' }).then(function (res) {
      var d = res.data || {};
      showToast('Two-Way Google Sheets Sync complete (Created: ' + (d.created || 0) + ', Updated: ' + (d.updated || 0) + ').', 'success');
      if (typeof refreshItemsCache === 'function') refreshItemsCache();
      dipenSheetsConsole.loadOverview();
    }).catch(function (err) {
      showToast(err.message, 'error');
    });
  },

  runBackup: function () {
    dipenRestFetch('/api/admin/backups/run', { method: 'POST', body: '{}' }).then(function (res) {
      showToast(res.message || 'MySQL backup finished.', 'success');
      dipenSheetsConsole.loadOverview();
    }).catch(function (err) {
      showToast(err.message, 'error');
    });
  },

  mountPanel: function () {
    var ws = document.getElementById('erpWorkspace');
    if (!ws || document.getElementById('dsTwoWayPanel')) return;
    var isAdmin = typeof hasPerm === 'function' && hasPerm('SYNC_ADMIN');
    var panel = document.createElement('div');
    panel.id = 'dsTwoWayPanel';
    panel.innerHTML =
      '<div class="erp-card mt-3">' +
      '  <div class="erp-card-header">' +
      '    <div><h6 class="erp-card-title">Two-Way Google Sheets Sync &amp; MySQL DIPEN_ERP Bridge</h6><div class="text-muted small">Import sheet data-entry tabs into MySQL (Preview &rarr; Validate &rarr; Commit) or push MySQL state back to Google Sheets</div></div>' +
      '    <div class="d-flex gap-2 flex-wrap align-items-center">' +
      '      <select id="dsSheetScope" class="form-select form-select-sm" style="width:185px" onchange="dipenSheetsConsole.populateSheetChoices()">' +
      '        <option value="OPERATIONS">Operations &amp; Inventory Sheet</option>' +
      '        <option value="PROCUREMENT">Procurement &amp; Tender Sheet</option>' +
      '      </select>' +
      '      <select id="dsSheetTab" class="form-select form-select-sm" style="width:175px"></select>' +
      '      <button class="btn btn-sm btn-outline-primary" onclick="dipenSheetsConsole.previewImport()"><i class="fa-solid fa-eye me-1"></i>Preview Import</button>' +
      (isAdmin ? '<button id="dsCommitImportBtn" class="btn btn-sm btn-primary" onclick="dipenSheetsConsole.commitImport()"><i class="fa-solid fa-download me-1"></i>Commit to MySQL</button>' : '') +
      '      <button class="btn btn-sm btn-outline-success" onclick="dipenSheetsConsole.exportToSheet()"><i class="fa-solid fa-upload me-1"></i>Push MySQL to Sheet</button>' +
      (isAdmin ? '<button class="btn btn-sm btn-success" onclick="dipenSheetsConsole.syncAllNow()"><i class="fa-solid fa-arrows-rotate me-1"></i>Full 2-Way Sync Now</button>' : '') +
      '    </div>' +
      '  </div>' +
      '  <div id="dsSheetsStatusBanner" class="alert alert-light border small mb-2">Loading Google Sheets connector status...</div>' +
      '  <div id="dsPreviewBox"></div>' +
      '  <h6 class="fw-bold mt-3 mb-2">Recent Google Sheets Sync Log</h6>' +
      '  <div class="table-responsive-erp"><table class="erp-table"><thead><tr>' +
      '    <th>Sync ID</th><th>Direction</th><th>Scope</th><th>Sheet Tab</th><th>New / Upd / Err</th><th>Status</th><th>Summary</th>' +
      '  </tr></thead><tbody id="dsSyncLogsBody"></tbody></table></div>' +
      '</div>' +
      (isAdmin
        ? '<div class="erp-card mt-3">' +
          '  <div class="erp-card-header">' +
          '    <div><h6 class="erp-card-title">Automated MySQL DIPEN_ERP Backups</h6><div class="text-muted small">Daily automated 02:00 AM mysqldump + SHA-256 checksum &amp; completion verification</div></div>' +
          '    <button class="btn btn-sm btn-dark" onclick="dipenSheetsConsole.runBackup()"><i class="fa-solid fa-database me-1"></i>Run Verified MySQL Backup</button>' +
          '  </div>' +
          '  <div class="table-responsive-erp"><table class="erp-table"><thead><tr>' +
          '    <th>Backup ID</th><th>Trigger</th><th>SQL Dump File</th><th>Size</th><th>Integrity</th><th>SHA-256 / Notes</th>' +
          '  </tr></thead><tbody id="dsBackupHistoryBody"></tbody></table></div>' +
          '</div>'
        : '');
    ws.appendChild(panel);
    dipenSheetsConsole.populateSheetChoices();
    dipenSheetsConsole.loadOverview();
  }
};
