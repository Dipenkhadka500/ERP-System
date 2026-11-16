import { useEffect, useMemo, useRef, useState } from 'react';
import {
  Check,
  Copy,
  Database,
  Download,
  ExternalLink,
  FileCode2,
  FlaskConical,
  Play,
  RefreshCw,
  Sheet,
  ShieldCheck,
} from 'lucide-react';
import { ErpRole, GasSimulatorEngine, TestResult } from './gasSimulator';
import {
  authorizeSheetsScopeDirect,
  clearAutoSyncConfigured,
  getGoogleAuthState,
  GoogleAuthState,
  markAutoSyncConfigured,
  signInWithGoogleSheets,
  signOutGoogleSheets,
  subscribeGoogleAuth,
} from './googleAuth';
import {
  OPERATIONS_SPREADSHEET_ID,
  PROCUREMENT_SPREADSHEET_ID,
  pushErpChangesToGoogleSheets,
  syncBidirectionalWithGoogleSheets,
} from './googleSheetsSync';

type StudioTab = 'preview' | 'codejs' | 'indexhtml' | 'setup';

function isInitialDirectWebAppMode(): boolean {
  try {
    const params = new URLSearchParams(window.location.search);
    if (params.get('studio') === '1') return false;
    if (params.get('mode') === 'erp') return true;
    const host = window.location.hostname;
    return host.startsWith('ais-pre-') || host.endsWith('.vercel.app');
  } catch {
    return false;
  }
}

const ROLES: ErpRole[] = [
  'Super Admin',
  'Operations Manager',
  'Procurement Officer',
  'Store Officer',
  'Production Officer',
  'Dispatch Officer',
  'Viewer',
];

function buildBridgedIndexHtml(rawHtml: string): string {
  const bridgeScript = `
<script>
(function() {
  function makeRunner(successCb, failureCb) {
    var handler = {
      get: function(_target, prop) {
        if (prop === 'withSuccessHandler') {
          return function(cb) { return makeRunner(cb, failureCb); };
        }
        if (prop === 'withFailureHandler') {
          return function(cb) { return makeRunner(successCb, cb); };
        }
        return function() {
          var args = Array.prototype.slice.call(arguments);
          setTimeout(function() {
            try {
              var res = window.parent.__BIRAT_GAS_DISPATCH__(String(prop), args);
              if (successCb) successCb(res);
            } catch (err) {
              if (failureCb) failureCb(err);
            }
          }, 35);
        };
      }
    };
    return new Proxy({}, handler);
  }
  window.google = {
    script: {
      run: makeRunner(null, null)
    }
  };
  window.addEventListener('message', function(ev) {
    try {
      if (ev && ev.data && ev.data.type === 'BIRAT_SHEETS_SYNCED') {
        if (typeof APP !== 'undefined') {
          APP.dataVersion = ev.data.version || APP.dataVersion;
        }
        if (typeof refreshItemsCache === 'function' && typeof renderCurrentView === 'function') {
          refreshItemsCache().then(function() {
            renderCurrentView(true);
          }).catch(function() {});
        }
      }
    } catch (e) {}
  });
  window.addEventListener('DOMContentLoaded', function() {
    try {
      if (typeof window.manualRefresh === 'function') {
        var origManualRefresh = window.manualRefresh;
        window.manualRefresh = function() {
          try {
            window.parent.postMessage({ type: 'BIRAT_REQUEST_SHEETS_SYNC' }, '*');
          } catch (e) {}
          return origManualRefresh.apply(this, arguments);
        };
      }
    } catch (e) {}
  });
})();
</script>`;
  return rawHtml.replace('<head>', `<head>${bridgeScript}`);
}

export default function App() {
  const [directWebAppMode, setDirectWebAppMode] = useState<boolean>(() => isInitialDirectWebAppMode());
  const [activeTab, setActiveTab] = useState<StudioTab>('preview');
  const [codeJs, setCodeJs] = useState<string>('');
  const [indexHtml, setIndexHtml] = useState<string>('');
  const [loadError, setLoadError] = useState<string>('');
  const [copiedTarget, setCopiedTarget] = useState<string>('');
  const [codeSearch, setCodeSearch] = useState<string>('');

  const simRef = useRef<GasSimulatorEngine | null>(null);
  if (!simRef.current) {
    simRef.current = new GasSimulatorEngine(true, true);
  }

  const [role, setRole] = useState<ErpRole>(() => simRef.current!.getDbSnapshot().activeRole);
  const [iframeKey, setIframeKey] = useState<number>(1);
  const [testResults, setTestResults] = useState<TestResult[] | null>(null);

  // Manual Sheet Sync Simulator Modal State
  const [showSheetSim, setShowSheetSim] = useState(false);
  const [sheetInspectorOpen, setSheetInspectorOpen] = useState(false);
  const [inspectorSheet, setInspectorSheet] = useState<string>('Item Master');
  const [simSheetName, setSimSheetName] = useState<'Goods Reciept' | 'Production' | 'Dispatch' | 'Issue'>('Goods Reciept');
  const [simTxId, setSimTxId] = useState('');
  const [simDate, setSimDate] = useState(() => new Date().toISOString().slice(0, 10));
  const [simItemCode, setSimItemCode] = useState('4001');
  const [simQty, setSimQty] = useState('25');
  const [simUom, setSimUom] = useState('KG');
  const [simSyncFeedback, setSimSyncFeedback] = useState('');

  const [simTick, setSimTick] = useState(0);

  // Google Sheets Live Bidirectional Sync State
  const [googleAuth, setGoogleAuth] = useState<GoogleAuthState>(() => getGoogleAuthState());
  const [sheetsAutoSyncConfirmed, setSheetsAutoSyncConfirmed] = useState<boolean>(false);
  const [showSyncConfirmModal, setShowSyncConfirmModal] = useState<boolean>(false);
  const [pendingSyncAction, setPendingSyncAction] = useState<'enable_auto' | 'full_push'>('enable_auto');
  const [syncBusy, setSyncBusy] = useState<boolean>(false);
  const [lastSheetsSyncAt, setLastSheetsSyncAt] = useState<string>('');
  const [sheetsSyncNote, setSheetsSyncNote] = useState<string>('');
  const [sheetsSyncError, setSheetsSyncError] = useState<string>('');

  const iframeRef = useRef<HTMLIFrameElement | null>(null);
  const autoSyncConfirmedRef = useRef<boolean>(false);
  const hasTokenRef = useRef<boolean>(false);
  const pushTimerRef = useRef<number | null>(null);
  const pendingScopeRef = useRef<'OPERATIONS' | 'PROCUREMENT' | 'BOTH' | null>(null);
  const syncInFlightRef = useRef<boolean>(false);
  const initialRestoredSyncDoneRef = useRef<boolean>(false);

  useEffect(() => {
    autoSyncConfirmedRef.current = sheetsAutoSyncConfirmed;
  }, [sheetsAutoSyncConfirmed]);

  useEffect(() => {
    const unsub = subscribeGoogleAuth((st) => {
      setGoogleAuth(st);
      hasTokenRef.current = st.hasAccessToken;
      if (!st.hasAccessToken) {
        setSheetsAutoSyncConfirmed(false);
        autoSyncConfirmedRef.current = false;
      } else {
        if (!st.error) {
          setSheetsSyncError('');
        }
        if (st.autoSyncConfigured && !autoSyncConfirmedRef.current) {
          setSheetsAutoSyncConfirmed(true);
          autoSyncConfirmedRef.current = true;
          if (!initialRestoredSyncDoneRef.current) {
            initialRestoredSyncDoneRef.current = true;
            window.setTimeout(() => {
              void runBidirectionalSync({ pushAfterPull: false });
            }, 50);
          }
        }
      }
      if (st.error) {
        setSheetsSyncError(st.error);
      }
    });
    return unsub;
  }, []);

  const notifyIframeSynced = () => {
    try {
      const ver = simRef.current?.getDbSnapshot().version || 1;
      iframeRef.current?.contentWindow?.postMessage({ type: 'BIRAT_SHEETS_SYNCED', version: ver }, '*');
    } catch {}
  };

  const runBidirectionalSync = async (opts: { pushAfterPull?: boolean; initialLink?: boolean; manual?: boolean } = {}) => {
    if (!simRef.current || !hasTokenRef.current || syncInFlightRef.current) return;
    syncInFlightRef.current = true;
    setSyncBusy(true);
    setSheetsSyncError('');
    try {
      // Flush any pending local ERP push before pulling from Google Sheets
      if (pushTimerRef.current) {
        window.clearTimeout(pushTimerRef.current);
        pushTimerRef.current = null;
        const pendingScope = pendingScopeRef.current;
        pendingScopeRef.current = null;
        if (pendingScope) {
          await pushErpChangesToGoogleSheets(simRef.current, pendingScope);
        }
      }

      const summary = await syncBidirectionalWithGoogleSheets(simRef.current, opts);
      setLastSheetsSyncAt(summary.syncedAt);
      const parts: string[] = [];
      if (summary.importedCreated > 0 || summary.importedUpdated > 0 || summary.importedDeleted > 0) {
        const counts = [
          summary.importedCreated > 0 ? `+${summary.importedCreated} new` : '',
          summary.importedUpdated > 0 ? `${summary.importedUpdated} updated` : '',
          summary.importedDeleted > 0 ? `${summary.importedDeleted} deleted` : '',
        ].filter(Boolean);
        parts.push(`Pulled ${counts.join(', ')} from Sheets`);
      }
      if (summary.pushedOpsTabs > 0 || summary.pushedProcTabs > 0) {
        parts.push(`Updated ${summary.pushedOpsTabs + summary.pushedProcTabs} sheet tabs`);
      }
      setSheetsSyncNote(parts.length > 0 ? parts.join(' · ') : 'Operations & Procurement sheets in sync');
      if (summary.errors.length > 0) {
        setSheetsSyncError(`${summary.errors.length} sync issue(s): ${summary.errors[0]}`);
      }
      if (summary.versionChanged || summary.importedCreated > 0 || summary.importedUpdated > 0 || summary.importedDeleted > 0 || opts.manual) {
        setSimTick((t) => t + 1);
        notifyIframeSynced();
      }
    } catch (err: any) {
      setSheetsSyncError(err?.message || 'Google Sheets sync failed.');
    } finally {
      syncInFlightRef.current = false;
      setSyncBusy(false);
    }
  };

  const scheduleAutoPush = (scope: 'OPERATIONS' | 'PROCUREMENT' | 'BOTH') => {
    if (!autoSyncConfirmedRef.current || !hasTokenRef.current || !simRef.current) return;
    const prev = pendingScopeRef.current;
    pendingScopeRef.current = !prev ? scope : prev === scope ? scope : 'BOTH';
    if (pushTimerRef.current) {
      window.clearTimeout(pushTimerRef.current);
    }
    pushTimerRef.current = window.setTimeout(async () => {
      const targetScope = pendingScopeRef.current || scope;
      pendingScopeRef.current = null;
      pushTimerRef.current = null;
      if (!simRef.current || !autoSyncConfirmedRef.current || !hasTokenRef.current) return;
      if (syncInFlightRef.current) {
        scheduleAutoPush(targetScope);
        return;
      }
      syncInFlightRef.current = true;
      setSyncBusy(true);
      setSheetsSyncError('');
      try {
        const res = await pushErpChangesToGoogleSheets(simRef.current, targetScope);
        setLastSheetsSyncAt(res.syncedAt);
        setSheetsSyncNote(`Auto-saved to Google Sheets (${targetScope})`);
      } catch (err: any) {
        setSheetsSyncError(err?.message || 'Auto-push to Google Sheets failed.');
      } finally {
        syncInFlightRef.current = false;
        setSyncBusy(false);
      }
    }, 350);
  };

  useEffect(() => {
    if (!sheetsAutoSyncConfirmed || !googleAuth.hasAccessToken) return;
    const intervalId = window.setInterval(() => {
      runBidirectionalSync({ pushAfterPull: false });
    }, 10000);
    const onFocusOrVisible = () => {
      if (document.visibilityState === 'visible') {
        runBidirectionalSync({ pushAfterPull: false });
      }
    };
    window.addEventListener('focus', onFocusOrVisible);
    document.addEventListener('visibilitychange', onFocusOrVisible);
    return () => {
      window.clearInterval(intervalId);
      window.removeEventListener('focus', onFocusOrVisible);
      document.removeEventListener('visibilitychange', onFocusOrVisible);
    };
  }, [sheetsAutoSyncConfirmed, googleAuth.hasAccessToken]);

  useEffect(() => {
    const onMsg = (ev: MessageEvent) => {
      if (ev?.data?.type === 'BIRAT_REQUEST_SHEETS_SYNC') {
        if (autoSyncConfirmedRef.current && hasTokenRef.current) {
          runBidirectionalSync({ pushAfterPull: false, manual: true });
        }
      }
    };
    window.addEventListener('message', onMsg);
    (window as any).__BIRAT_GAS_DISPATCH__ = (fnName: string, args: any[]) => {
      const res = simRef.current!.invoke(fnName, args);
      const opsMutations = [
        'addItem',
        'updateItem',
        'setItemStatus',
        'deleteItem',
        'saveProduction',
        'saveDispatch',
        'saveIssue',
        'updateTransaction',
        'cancelTransaction',
        'submitDailyReport',
      ];
      const procMutations = [
        'procSaveRecord',
        'procDeleteRecord',
        'procSetApproval',
        'procSetupDatabase',
      ];
      const bothMutations = ['saveGoodsReceipt', 'procSaveExchangeRates'];
      const bidirectionalTriggers = ['syncWorkingSheets', 'reconcileInventory'];

      if (res?.success && [...opsMutations, ...procMutations, ...bothMutations, ...bidirectionalTriggers, 'loginUser', 'logoutUser'].includes(fnName)) {
        if (fnName === 'loginUser' || fnName === 'logoutUser') {
          setRole(simRef.current!.getDbSnapshot().activeRole);
        }
        setSimTick((t) => t + 1);

        if (bidirectionalTriggers.includes(fnName)) {
          if (autoSyncConfirmedRef.current && hasTokenRef.current) {
            setTimeout(() => runBidirectionalSync({ pushAfterPull: false, manual: true }), 50);
          }
        } else if (bothMutations.includes(fnName)) {
          scheduleAutoPush('BOTH');
        } else if (opsMutations.includes(fnName)) {
          scheduleAutoPush('OPERATIONS');
        } else if (procMutations.includes(fnName)) {
          scheduleAutoPush('PROCUREMENT');
        }
      }
      return res;
    };
    (window as any).__BIRAT_DOWNLOAD_BYTES__ = (bytes: ArrayLike<number> | ArrayBuffer, mime: string, filename: string) => {
      try {
        if (!bytes) return;
        const copy = bytes instanceof ArrayBuffer ? new Uint8Array(bytes) : new Uint8Array(bytes);
        const blob = new Blob([copy], { type: mime || 'application/octet-stream' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = filename;
        document.body.appendChild(a);
        a.click();
        setTimeout(() => {
          try {
            a.remove();
            URL.revokeObjectURL(url);
          } catch {}
        }, 15000);
      } catch {}
    };
    (window as any).__BIRAT_OPEN_HTML__ = (html: string) => {
      try {
        const blob = new Blob([html], { type: 'text/html;charset=utf-8' });
        const url = URL.createObjectURL(blob);
        const w = window.open(url, '_blank');
        setTimeout(() => {
          try {
            URL.revokeObjectURL(url);
          } catch {}
        }, 60000);
        return Boolean(w);
      } catch {
        return false;
      }
    };
    return () => {
      window.removeEventListener('message', onMsg);
      delete (window as any).__BIRAT_GAS_DISPATCH__;
      delete (window as any).__BIRAT_DOWNLOAD_BYTES__;
      delete (window as any).__BIRAT_OPEN_HTML__;
      if (pushTimerRef.current) window.clearTimeout(pushTimerRef.current);
    };
  }, []);

  useEffect(() => {
    Promise.all([
      fetch('/gas/Code.js').then((r) => {
        if (!r.ok) throw new Error('Failed to load Code.js');
        return r.text();
      }),
      fetch('/gas/Index.html').then((r) => {
        if (!r.ok) throw new Error('Failed to load Index.html');
        return r.text();
      }),
    ])
      .then(([c, h]) => {
        setCodeJs(c);
        setIndexHtml(h);
      })
      .catch((err) => setLoadError(err.message));
  }, []);

  const bridgedSrcDoc = useMemo(() => {
    if (!indexHtml) return '';
    return buildBridgedIndexHtml(indexHtml);
  }, [indexHtml]);

  const handleRoleChange = (nextRole: ErpRole) => {
    setRole(nextRole);
    simRef.current!.setActiveRole(nextRole);
    setIframeKey((k) => k + 1);
  };

  const handleResetSandbox = (seedCatalog: boolean) => {
    try {
      sessionStorage.removeItem('BIRAT_ERP_AUTH_TOKEN');
      localStorage.removeItem('BIRAT_ERP_AUTH_TOKEN');
    } catch {}
    simRef.current!.resetSandbox(seedCatalog);
    setRole('Super Admin');
    setSimTick((t) => t + 1);
    setIframeKey((k) => k + 1);
  };

  const handleManualSheetSync = () => {
    const stats = simRef.current!.simulateManualSheetRow(simSheetName, {
      txId: simTxId.trim() || undefined,
      txDate: simDate,
      itemCode: simItemCode.trim(),
      quantity: Number(simQty),
      uom: simUom.trim(),
    });
    setSimSyncFeedback(
      `Synced ${simSheetName}: created=${stats.created}, updated=${stats.updated}, skipped(idempotent)=${stats.skipped}, errors=${stats.errors}`
    );
    setIframeKey((k) => k + 1);
  };

  const copyText = (text: string, label: string) => {
    navigator.clipboard.writeText(text).then(() => {
      setCopiedTarget(label);
      setTimeout(() => setCopiedTarget(''), 2000);
    });
  };

  const downloadFile = (filename: string, content: string, mime = 'text/plain;charset=utf-8') => {
    const blob = new Blob([content], { type: mime });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = filename;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => {
      try {
        a.remove();
        URL.revokeObjectURL(url);
      } catch {}
    }, 15000);
  };

  const downloadBundle = () => {
    if (codeJs) downloadFile('Code.js', codeJs, 'application/javascript;charset=utf-8');
    setTimeout(() => {
      if (indexHtml) downloadFile('Index.html', indexHtml, 'text/html;charset=utf-8');
    }, 250);
  };

  const run15Tests = () => {
    const res = GasSimulatorEngine.runAll15VerificationTests();
    setTestResults(res);
  };

  const filteredCodeLines = useMemo(() => {
    const src = activeTab === 'codejs' ? codeJs : indexHtml;
    if (!src) return [];
    const lines = src.split('\n');
    if (!codeSearch.trim()) return lines.map((line, i) => ({ num: i + 1, text: line }));
    const q = codeSearch.toLowerCase();
    return lines
      .map((line, i) => ({ num: i + 1, text: line }))
      .filter((l) => l.text.toLowerCase().includes(q));
  }, [activeTab, codeJs, indexHtml, codeSearch]);

  const dbSnap = simRef.current.getDbSnapshot();

  const directErpUrl = useMemo(() => {
    try {
      return `${window.location.origin}/?mode=erp`;
    } catch {
      return '/?mode=erp';
    }
  }, []);

  const handleConnectGoogleSheets = async () => {
    setSheetsSyncError('');
    try {
      const nextState =
        googleAuth.needsScopeGrant || googleAuth.isSignedIn || googleAuth.autoSyncConfigured
          ? await authorizeSheetsScopeDirect()
          : await signInWithGoogleSheets();

      if (nextState.autoSyncConfigured) {
        setSheetsAutoSyncConfirmed(true);
        autoSyncConfirmedRef.current = true;
        initialRestoredSyncDoneRef.current = true;
        await runBidirectionalSync({
          pushAfterPull: false,
          initialLink: true,
        });
      } else {
        setPendingSyncAction('enable_auto');
        setShowSyncConfirmModal(true);
      }
    } catch (err: any) {
      setSheetsSyncError(err?.message || 'Google sign-in failed.');
    }
  };

  const handleConfirmSheetsSync = async () => {
    setShowSyncConfirmModal(false);
    markAutoSyncConfigured(googleAuth.email);
    setSheetsAutoSyncConfirmed(true);
    autoSyncConfirmedRef.current = true;
    initialRestoredSyncDoneRef.current = true;
    await runBidirectionalSync({
      pushAfterPull: pendingSyncAction === 'full_push',
      initialLink: true,
    });
  };

  const renderGoogleSignInButton = () => (
    <div className="inline-flex items-center gap-1.5 shrink-0">
      <button
        type="button"
        disabled={googleAuth.isRestoringSession}
        onClick={handleConnectGoogleSheets}
        className={`px-3 py-1 rounded-md text-xs font-medium inline-flex items-center gap-2 shadow-xs transition-colors whitespace-nowrap shrink-0 disabled:opacity-60 ${
          googleAuth.autoSyncConfigured || googleAuth.needsScopeGrant
            ? 'bg-amber-400 hover:bg-amber-300 text-slate-950 font-semibold border border-amber-300'
            : 'bg-white hover:bg-slate-50 text-slate-800 border border-slate-300'
        }`}
      >
        <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" aria-hidden="true">
          <path fill="#4285F4" d="M23.745 12.27c0-.7-.06-1.4-.19-2.07H12v4.51h6.6c-.29 1.52-1.14 2.82-2.4 3.68v3.05h3.88c2.27-2.09 3.665-5.17 3.665-9.17Z" />
          <path fill="#34A853" d="M12 24c3.24 0 5.95-1.08 7.93-2.91l-3.88-3.05c-1.08.72-2.45 1.16-4.05 1.16-3.12 0-5.77-2.11-6.72-4.96H1.29v3.14C3.26 21.3 7.31 24 12 24Z" />
          <path fill="#FBBC05" d="M5.28 14.24c-.24-.72-.38-1.49-.38-2.24s.14-1.52.38-2.24V6.62H1.29C.47 8.24 0 10.06 0 12s.47 3.76 1.29 5.38l3.99-3.14Z" />
          <path fill="#EA4335" d="M12 4.75c1.77 0 3.35.61 4.6 1.8l3.42-3.42C17.95 1.19 15.24 0 12 0 7.31 0 3.26 2.7 1.29 6.62l3.99 3.14c.95-2.85 3.6-4.96 6.72-4.96Z" />
        </svg>
        <span>
          {googleAuth.isRestoringSession
            ? 'Restoring Auto-Sync...'
            : googleAuth.autoSyncConfigured
            ? 'Resume Auto-Sync'
            : googleAuth.needsScopeGrant
            ? 'Authorize Google Sheets'
            : googleAuth.isSignedIn
            ? 'Reconnect Google Sheets'
            : 'Sign in with Google'}
        </span>
      </button>
      {(googleAuth.isSignedIn || googleAuth.autoSyncConfigured) && (
        <button
          type="button"
          onClick={() => {
            setSheetsSyncError('');
            initialRestoredSyncDoneRef.current = false;
            clearAutoSyncConfigured();
            setSheetsAutoSyncConfirmed(false);
            signOutGoogleSheets();
          }}
          className="px-2 py-1 text-[11px] text-slate-300 hover:text-white underline whitespace-nowrap"
          title={`Signed in as ${googleAuth.email}`}
        >
          {googleAuth.autoSyncConfigured ? 'Disconnect' : 'Switch Account'}
        </button>
      )}
    </div>
  );

  const renderSyncConfirmModal = () =>
    showSyncConfirmModal ? (
      <div className="fixed inset-0 bg-slate-950/60 z-50 flex items-center justify-center p-4">
        <div className="bg-white rounded-xl border border-slate-200 max-w-lg w-full p-6 space-y-4 shadow-xl text-slate-900">
          <div className="flex items-start justify-between gap-3">
            <div>
              <h3 className="text-base font-bold text-slate-900">
                {pendingSyncAction === 'full_push'
                  ? 'Confirm Writing ERP Data to Google Sheets'
                  : 'Confirm Two-Way Google Sheets Auto-Sync'}
              </h3>
              <p className="text-xs text-slate-500 mt-0.5">
                Signed in as <span className="font-semibold text-slate-700">{googleAuth.email || 'Google Account'}</span>
              </p>
            </div>
            <button
              type="button"
              onClick={() => setShowSyncConfirmModal(false)}
              className="text-xs text-slate-400 hover:text-slate-700"
            >
              Close
            </button>
          </div>

          <div className="text-xs text-slate-700 space-y-2 leading-relaxed bg-slate-50 border border-slate-200 rounded-lg p-3.5">
            <p>
              This action links and enables automatic two-way synchronization with your two Google Spreadsheets:
            </p>
            <ul className="list-disc pl-5 space-y-1">
              <li>
                <strong>Operations &amp; Inventory Sheet:</strong>{' '}
                <code className="font-mono text-[11px] bg-white px-1 py-0.5 rounded border">{OPERATIONS_SPREADSHEET_ID}</code>
              </li>
              <li>
                <strong>Procurement &amp; Tender Sheet:</strong>{' '}
                <code className="font-mono text-[11px] bg-white px-1 py-0.5 rounded border">{PROCUREMENT_SPREADSHEET_ID}</code>
              </li>
            </ul>
            <p className="text-slate-600 pt-1">
              {pendingSyncAction === 'full_push'
                ? 'Existing rows will be reconciled and ERP tabs in both spreadsheets will be updated with current ERP records.'
                : 'New or updated rows entered directly in Google Sheets will automatically update the ERP every 10 seconds, and entries saved in the ERP will automatically write to Google Sheets.'}
            </p>
          </div>

          <div className="flex justify-end gap-2 pt-1">
            <button
              type="button"
              onClick={() => setShowSyncConfirmModal(false)}
              className="px-3 py-1.5 text-xs font-medium bg-slate-100 text-slate-700 rounded-lg hover:bg-slate-200"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleConfirmSheetsSync}
              className="px-4 py-1.5 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700"
            >
              {pendingSyncAction === 'full_push' ? 'Confirm & Update Sheets' : 'Confirm & Enable Auto-Sync'}
            </button>
          </div>
        </div>
      </div>
    ) : null;

  const renderGoogleSheetsBar = (compact: boolean) => (
    <div
      className={`${
        compact ? 'h-10 bg-slate-900 text-slate-100 border-b border-slate-800 px-4' : 'bg-slate-800 text-slate-100 border-b border-slate-700 px-6 py-2'
      } flex items-center justify-between gap-3 text-xs overflow-x-auto`}
    >
      <div className="flex items-center gap-2.5 whitespace-nowrap shrink-0">
        <Sheet className="w-3.5 h-3.5 text-emerald-400 shrink-0" />
        <span className="font-semibold text-white">Google Sheets Auto-Sync</span>
        <a
          href={`https://docs.google.com/spreadsheets/d/${OPERATIONS_SPREADSHEET_ID}`}
          target="_blank"
          rel="noopener noreferrer"
          className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-[11px] inline-flex items-center gap-1"
          title={`Operations Sheet: ${OPERATIONS_SPREADSHEET_ID}`}
        >
          Ops Sheet <ExternalLink className="w-2.5 h-2.5" />
        </a>
        <a
          href={`https://docs.google.com/spreadsheets/d/${PROCUREMENT_SPREADSHEET_ID}`}
          target="_blank"
          rel="noopener noreferrer"
          className="px-2 py-0.5 rounded bg-slate-800 hover:bg-slate-700 border border-slate-700 text-slate-200 text-[11px] inline-flex items-center gap-1"
          title={`Procurement & Tender Sheet: ${PROCUREMENT_SPREADSHEET_ID}`}
        >
          Procurement Sheet <ExternalLink className="w-2.5 h-2.5" />
        </a>
        {sheetsSyncError ? (
          <span className="text-amber-300 truncate max-w-md" title={sheetsSyncError}>
            · {sheetsSyncError}
          </span>
        ) : googleAuth.isRestoringSession ? (
          <span className="text-sky-300">
            · Restoring persistent Google Sheets Auto-Sync ({googleAuth.email || 'saved account'})...
          </span>
        ) : sheetsAutoSyncConfirmed && googleAuth.hasAccessToken ? (
          <span className="text-emerald-300 tabular-nums">
            · {syncBusy ? 'Syncing both Google Sheets...' : `Live 2-Way Active${lastSheetsSyncAt ? ` (${lastSheetsSyncAt})` : ''}`}
            {sheetsSyncNote ? ` · ${sheetsSyncNote}` : ''}
          </span>
        ) : googleAuth.autoSyncConfigured ? (
          <span className="text-amber-200">
            · Auto-Sync saved for {googleAuth.email || 'Google Account'} — click &quot;Resume Auto-Sync&quot; to activate
          </span>
        ) : (
          <span className="text-amber-200">
            · Not connected — one-time setup: click{' '}
            {googleAuth.needsScopeGrant
              ? '"Authorize Google Sheets" and tick the Google Sheets checkbox'
              : googleAuth.isSignedIn
              ? '"Reconnect Google Sheets"'
              : '"Sign in with Google"'}{' '}
            to sync both sheets
          </span>
        )}
      </div>

      <div className="flex items-center gap-2 whitespace-nowrap shrink-0">
        {!googleAuth.hasAccessToken ? (
          renderGoogleSignInButton()
        ) : !sheetsAutoSyncConfirmed ? (
          <button
            type="button"
            onClick={() => {
              setPendingSyncAction('enable_auto');
              setShowSyncConfirmModal(true);
            }}
            className="px-3 py-1 bg-emerald-600 hover:bg-emerald-700 text-white rounded-md font-semibold text-xs inline-flex items-center gap-1.5"
          >
            <RefreshCw className="w-3 h-3" />
            Enable Two-Way Auto-Sync
          </button>
        ) : (
          <>
            <button
              type="button"
              disabled={syncBusy}
              onClick={() => runBidirectionalSync({ pushAfterPull: false, manual: true })}
              className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 disabled:opacity-50 text-white rounded-md font-medium text-xs inline-flex items-center gap-1.5"
            >
              <RefreshCw className={`w-3 h-3 ${syncBusy ? 'animate-spin' : ''}`} />
              Sync Now
            </button>
            <button
              type="button"
              disabled={syncBusy}
              onClick={() => {
                setPendingSyncAction('full_push');
                setShowSyncConfirmModal(true);
              }}
              className="px-2.5 py-1 bg-slate-700 hover:bg-slate-600 disabled:opacity-50 text-white rounded-md text-xs"
            >
              Push All to Sheets
            </button>
            <button
              type="button"
              onClick={() => {
                initialRestoredSyncDoneRef.current = false;
                clearAutoSyncConfigured();
                setSheetsAutoSyncConfirmed(false);
                signOutGoogleSheets();
              }}
              className="px-2 py-1 text-slate-300 hover:text-white text-[11px]"
              title={googleAuth.email}
            >
              Disconnect ({googleAuth.email.split('@')[0]})
            </button>
          </>
        )}
      </div>
    </div>
  );

  if (directWebAppMode) {
    return (
      <div className="w-screen h-screen bg-white relative overflow-hidden flex flex-col">
        {renderGoogleSheetsBar(true)}
        {loadError && (
          <div className="m-6 p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
            {loadError}
          </div>
        )}
        <div className="flex-1 min-h-0">
          {bridgedSrcDoc ? (
            <iframe
              ref={iframeRef}
              key={iframeKey}
              title="Birat Healthcare Operations ERP Web App"
              srcDoc={bridgedSrcDoc}
              className="w-full h-full border-0 block"
              sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-downloads allow-popups allow-popups-to-escape-sandbox"
            />
          ) : (
            <div className="h-full flex items-center justify-center text-sm text-slate-500">
              Loading Birat Healthcare ERP Web App...
            </div>
          )}
        </div>
        {renderSyncConfirmModal()}
      </div>
    );
  }

  return (
    <div className="min-h-screen flex flex-col bg-[#F8FAFC] text-[#0F172A]">
      {/* 3-ZONE TOP BAR CONTRACT */}
      <header className="h-14 bg-white border-b border-slate-200 px-6 flex items-center justify-between gap-8 sticky top-0 z-30">
        <span className="text-base font-bold tracking-tight text-slate-900 whitespace-nowrap shrink-0">
          Birat Healthcare ERP
        </span>

        <nav className="flex items-center gap-6 text-sm font-medium text-slate-600 overflow-x-auto">
          <button
            onClick={() => setActiveTab('preview')}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
              activeTab === 'preview'
                ? 'border-blue-600 text-slate-900 font-semibold'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            Live ERP Preview
          </button>
          <button
            onClick={() => setActiveTab('codejs')}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
              activeTab === 'codejs'
                ? 'border-blue-600 text-slate-900 font-semibold'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            Code.js
          </button>
          <button
            onClick={() => setActiveTab('indexhtml')}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
              activeTab === 'indexhtml'
                ? 'border-blue-600 text-slate-900 font-semibold'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            Index.html
          </button>
          <button
            onClick={() => setActiveTab('setup')}
            className={`py-1 transition-colors whitespace-nowrap shrink-0 border-b-2 ${
              activeTab === 'setup'
                ? 'border-blue-600 text-slate-900 font-semibold'
                : 'border-transparent hover:text-slate-900'
            }`}
          >
            Setup &amp; Tests
          </button>
        </nav>

        <div className="shrink-0 flex items-center gap-2">
          <button
            onClick={() => copyText(directErpUrl, 'weblink')}
            className="px-3 py-2 text-xs font-medium text-slate-700 bg-slate-100 hover:bg-slate-200 rounded-lg transition-colors whitespace-nowrap shrink-0 inline-flex items-center gap-1.5"
            title="Copy direct full-screen Web App link"
          >
            {copiedTarget === 'weblink' ? (
              <>
                <Check className="w-3.5 h-3.5 text-green-600" />
                Link Copied
              </>
            ) : (
              <>
                <Copy className="w-3.5 h-3.5" />
                Copy Web App Link
              </>
            )}
          </button>
          <button
            onClick={() => setDirectWebAppMode(true)}
            disabled={!indexHtml}
            className="px-3 py-2 text-xs font-semibold text-white bg-emerald-600 rounded-lg hover:bg-emerald-700 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 inline-flex items-center gap-1.5"
            title="Run full-screen ERP Web App without developer toolbar"
          >
            <ExternalLink className="w-3.5 h-3.5" />
            Run Web App
          </button>
          <button
            onClick={downloadBundle}
            disabled={!codeJs || !indexHtml}
            className="px-4 py-2 text-xs font-semibold text-white bg-blue-600 rounded-lg hover:bg-blue-700 disabled:opacity-50 transition-colors whitespace-nowrap shrink-0 inline-flex items-center gap-2"
          >
            <Download className="w-3.5 h-3.5" />
            Download GAS Bundle
          </button>
        </div>
      </header>

      {loadError && (
        <div className="m-6 p-4 bg-red-50 border border-red-200 rounded-lg text-sm text-red-700">
          {loadError}
        </div>
      )}

      {/* TAB 1: LIVE INTERACTIVE ERP PREVIEW (RUNS ACTUAL Index.html) */}
      {activeTab === 'preview' && (
        <div className="flex-1 flex flex-col">
          {/* Workspace Simulation Toolbar (below top bar) */}
          <div className="bg-slate-900 text-slate-200 px-6 py-2.5 border-b border-slate-800 flex flex-wrap items-center justify-between gap-4 text-xs">
            <div className="flex items-center gap-3 text-slate-300">
              <span className="font-semibold text-white">Local GAS Simulator</span>
              <span aria-hidden="true">·</span>
              <span>Bridges google.script.run to browser storage</span>
              <span aria-hidden="true">·</span>
              <span className="tabular-nums" data-sync-tick={simTick}>
                {dbSnap.items.length} items · {dbSnap.ledger.length} ledger tx · {dbSnap.procurement?.PurchaseOrders?.length || 0} POs · {dbSnap.procurement?.Tenders?.length || 0} tenders
                {dbSnap.activeSession ? ` · Signed in: ${dbSnap.activeSession.email}` : ' · Signed out'}
              </span>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <label className="flex items-center gap-1.5 text-slate-300">
                <span>Role:</span>
                <select
                  value={role}
                  onChange={(e) => handleRoleChange(e.target.value as ErpRole)}
                  className="bg-slate-800 border border-slate-700 text-white rounded px-2 py-1 text-xs focus:outline-none focus:border-blue-500"
                >
                  {ROLES.map((r) => (
                    <option key={r} value={r}>
                      {r}
                    </option>
                  ))}
                </select>
              </label>

              <button
                onClick={() => {
                  setShowSheetSim(true);
                  setSimSyncFeedback('');
                }}
                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded text-white inline-flex items-center gap-1.5 whitespace-nowrap"
              >
                <Sheet className="w-3.5 h-3.5 text-blue-400" />
                Simulate Manual Sheet Edit
              </button>

              <button
                onClick={() => setSheetInspectorOpen(true)}
                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded text-white inline-flex items-center gap-1.5 whitespace-nowrap"
              >
                <Database className="w-3.5 h-3.5 text-emerald-400" />
                Inspect Sheets &amp; Ledger
              </button>

              <button
                onClick={() => {
                  run15Tests();
                  setActiveTab('setup');
                }}
                className="px-2.5 py-1 bg-blue-600 hover:bg-blue-700 rounded text-white font-medium inline-flex items-center gap-1.5 whitespace-nowrap"
              >
                <FlaskConical className="w-3.5 h-3.5" />
                Run 15 Tests
              </button>

              <button
                onClick={() => handleResetSandbox(true)}
                className="px-2.5 py-1 bg-slate-800 hover:bg-slate-700 border border-slate-700 rounded text-slate-300 inline-flex items-center gap-1 whitespace-nowrap"
                title="Reset simulator with Birat Healthcare sample catalog"
              >
                <RefreshCw className="w-3 h-3" />
                Reset
              </button>
            </div>
          </div>

          {renderGoogleSheetsBar(false)}

          <div className="flex-1 bg-white">
            {bridgedSrcDoc ? (
              <iframe
                ref={iframeRef}
                key={iframeKey}
                title="Birat Healthcare Operations ERP Live Preview"
                srcDoc={bridgedSrcDoc}
                className="w-full border-0"
                style={{ height: 'calc(100vh - 142px)' }}
                sandbox="allow-scripts allow-same-origin allow-forms allow-modals allow-downloads allow-popups allow-popups-to-escape-sandbox"
              />
            ) : (
              <div className="p-12 text-center text-sm text-slate-500">
                Loading Index.html application...
              </div>
            )}
          </div>
        </div>
      )}

      {/* TAB 2 & 3: CODE.JS & INDEX.HTML VIEWERS */}
      {(activeTab === 'codejs' || activeTab === 'indexhtml') && (
        <div className="max-w-7xl w-full mx-auto p-6 space-y-4">
          <div className="bg-white border border-slate-200 rounded-xl p-5 flex flex-wrap items-center justify-between gap-4">
            <div>
              <h1 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                <FileCode2 className="w-5 h-5 text-blue-600" />
                {activeTab === 'codejs'
                  ? 'Code.js — Google Apps Script Backend (V8)'
                  : 'Index.html — Google Apps Script Web App Frontend'}
              </h1>
              <p className="text-xs text-slate-500 mt-1 tabular-nums">
                {(activeTab === 'codejs' ? codeJs : indexHtml).split('\n').length} lines ·{' '}
                {((activeTab === 'codejs' ? codeJs : indexHtml).length / 1024).toFixed(1)} KB · Single-file GAS deliverable
              </p>
            </div>

            <div className="flex flex-wrap items-center gap-2">
              <input
                type="text"
                value={codeSearch}
                onChange={(e) => setCodeSearch(e.target.value)}
                placeholder="Search symbol or line..."
                className="px-3 py-1.5 text-xs border border-slate-300 rounded-lg focus:outline-none focus:border-blue-500 w-56"
              />
              <button
                onClick={() =>
                  copyText(
                    activeTab === 'codejs' ? codeJs : indexHtml,
                    activeTab
                  )
                }
                className="px-3 py-1.5 text-xs font-medium bg-slate-100 hover:bg-slate-200 text-slate-800 rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap"
              >
                {copiedTarget === activeTab ? (
                  <>
                    <Check className="w-3.5 h-3.5 text-green-600" /> Copied
                  </>
                ) : (
                  <>
                    <Copy className="w-3.5 h-3.5" /> Copy Entire File
                  </>
                )}
              </button>
              <button
                onClick={() =>
                  downloadFile(
                    activeTab === 'codejs' ? 'Code.js' : 'Index.html',
                    activeTab === 'codejs' ? codeJs : indexHtml
                  )
                }
                className="px-3 py-1.5 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg inline-flex items-center gap-1.5 whitespace-nowrap"
              >
                <Download className="w-3.5 h-3.5" />
                Download {activeTab === 'codejs' ? 'Code.js' : 'Index.html'}
              </button>
            </div>
          </div>

          <div className="bg-slate-950 text-slate-100 rounded-xl border border-slate-800 overflow-hidden">
            <div className="max-h-[72vh] overflow-auto p-4 font-mono text-xs leading-5">
              {filteredCodeLines.map((l) => (
                <div key={l.num} className="flex hover:bg-slate-900/80">
                  <span className="w-14 shrink-0 text-right pr-4 text-slate-500 select-none tabular-nums">
                    {l.num}
                  </span>
                  <pre className="whitespace-pre text-slate-200 flex-1">{l.text || ' '}</pre>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* TAB 4: SETUP, DEPLOYMENT, SYNC ARCHITECTURE & 15-TEST SUITE */}
      {activeTab === 'setup' && (
        <div className="max-w-6xl w-full mx-auto p-6 space-y-6">
          {/* 15-TEST VERIFICATION RUNNER */}
          <section className="bg-white border border-slate-200 rounded-xl p-6">
            <div className="flex flex-wrap items-center justify-between gap-4 mb-4">
              <div>
                <h2 className="text-lg font-bold text-slate-900 flex items-center gap-2">
                  <ShieldCheck className="w-5 h-5 text-blue-600" />
                  Automated 15-Scenario ERP Verification Suite
                </h2>
                <p className="text-xs text-slate-500 mt-1">
                  Executes all 15 mandatory functional &amp; integrity tests (Item Master auto-coding, UOM quotient/remainder, edit idempotency, cancellation, manual sheet sync, historical date isolation, and concurrency tokens).
                </p>
              </div>
              <button
                onClick={run15Tests}
                className="px-4 py-2 text-xs font-semibold bg-blue-600 hover:bg-blue-700 text-white rounded-lg inline-flex items-center gap-2 whitespace-nowrap"
              >
                <Play className="w-3.5 h-3.5" />
                Execute All 15 Tests
              </button>
            </div>

            {testResults ? (
              <div className="space-y-2">
                <div className="text-xs font-semibold text-slate-700 pb-2 border-b border-slate-200">
                  Result: {testResults.filter((t) => t.passed).length} / {testResults.length} Passed
                </div>
                <div className="divide-y divide-slate-100 border border-slate-200 rounded-lg">
                  {testResults.map((t) => (
                    <div key={t.id} className="p-3 flex items-start justify-between gap-4 text-xs">
                      <div>
                        <div className="font-semibold text-slate-900">
                          <span className="font-mono text-blue-600 mr-2">{t.id}</span>
                          {t.title}
                        </div>
                        <div className="text-slate-600 mt-0.5 font-mono">{t.details}</div>
                      </div>
                      <span
                        className={`font-semibold shrink-0 ${
                          t.passed ? 'text-green-600' : 'text-red-600'
                        }`}
                      >
                        {t.passed ? 'PASS' : 'FAIL'}
                      </span>
                    </div>
                  ))}
                </div>
              </div>
            ) : (
              <div className="p-6 text-center text-xs text-slate-500 border border-dashed border-slate-300 rounded-lg">
                Click "Execute All 15 Tests" to run the complete verification checklist against the ERP engine.
              </div>
            )}
          </section>

          {/* SETUP & ARCHITECTURE GUIDE */}
          <div className="grid md:grid-cols-2 gap-6">
            <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
              <h3 className="text-base font-bold text-slate-900">1. Dual Google Spreadsheet Setup</h3>
              <ol className="list-decimal pl-5 text-xs text-slate-700 space-y-2 leading-relaxed">
                <li><strong>Operations &amp; Inventory Database:</strong> Linked to Spreadsheet ID <code className="font-mono bg-slate-100 px-1 rounded">1gGmpt4gKEE4Nu42960A8cmdrXaTpT-IKHW5oTAWGAJs</code> with worksheets <code className="font-mono bg-slate-100 px-1 rounded">Item Master</code>, <code className="font-mono bg-slate-100 px-1 rounded">Production</code>, <code className="font-mono bg-slate-100 px-1 rounded">Dispatch</code>, <code className="font-mono bg-slate-100 px-1 rounded">Goods Reciept</code>, <code className="font-mono bg-slate-100 px-1 rounded">Issue</code>, <code className="font-mono bg-slate-100 px-1 rounded">Finished Goods</code>, <code className="font-mono bg-slate-100 px-1 rounded">Raw Material</code>, <code className="font-mono bg-slate-100 px-1 rounded">Packing Material</code>, <code className="font-mono bg-slate-100 px-1 rounded">All Stock Balance</code>.</li>
                <li><strong>Procurement &amp; Tender Database:</strong> Linked to Spreadsheet ID <code className="font-mono bg-slate-100 px-1 rounded">16SN_MJjvmWqt_OH8Hol3AVGB6hWFTM_rYOG1FTi2-yY</code>. Running <code className="font-mono bg-slate-100 px-1 rounded">setupSystem()</code> or clicking <strong>Verify Procurement DB</strong> auto-creates <code className="font-mono bg-slate-100 px-1 rounded">Indents</code>, <code className="font-mono bg-slate-100 px-1 rounded">Suppliers</code>, <code className="font-mono bg-slate-100 px-1 rounded">FreightForwarder</code>, <code className="font-mono bg-slate-100 px-1 rounded">Quotations</code>, <code className="font-mono bg-slate-100 px-1 rounded">PurchaseOrders</code>, <code className="font-mono bg-slate-100 px-1 rounded">LCTTPayments</code>, <code className="font-mono bg-slate-100 px-1 rounded">Shipments</code>, <code className="font-mono bg-slate-100 px-1 rounded">Tenders</code>, <code className="font-mono bg-slate-100 px-1 rounded">TenderTracking</code>, <code className="font-mono bg-slate-100 px-1 rounded">AuditLog</code>, and <code className="font-mono bg-slate-100 px-1 rounded">Settings</code>.</li>
                <li>Open <strong>Extensions → Apps Script</strong>, paste <code className="font-mono bg-slate-100 px-1 rounded">Code.js</code> into <code className="font-mono bg-slate-100 px-1 rounded">Code.gs</code>, and create an HTML file named <code className="font-mono bg-slate-100 px-1 rounded">Index</code> pasting <code className="font-mono bg-slate-100 px-1 rounded">Index.html</code>.</li>
                <li>Both <code className="font-mono bg-slate-100 px-1 rounded">CONFIG.OPERATIONS_SPREADSHEET_ID</code> and <code className="font-mono bg-slate-100 px-1 rounded">CONFIG.PROCUREMENT_SPREADSHEET_ID</code> are preconfigured in <code className="font-mono bg-slate-100 px-1 rounded">Code.js</code>.</li>
              </ol>
            </section>

            <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
              <h3 className="text-base font-bold text-slate-900">2. Initialization &amp; Trigger Installation</h3>
              <ol className="list-decimal pl-5 text-xs text-slate-700 space-y-2 leading-relaxed">
                <li>In the Apps Script Editor, select <code className="font-mono bg-slate-100 px-1 rounded">setupSystem</code> from the function dropdown and click <strong>Run</strong>.</li>
                <li>Grant spreadsheet, Drive (for backups), and trigger permissions when prompted.</li>
                <li><code className="font-mono bg-slate-100 px-1 rounded">setupSystem()</code> non-destructively preserves existing data, creates hidden system sheets (<code className="font-mono bg-slate-100 px-1 rounded">_SYS_Transaction_Ledger</code>, <code className="font-mono bg-slate-100 px-1 rounded">_SYS_Audit_Log</code>, <code className="font-mono bg-slate-100 px-1 rounded">_SYS_Sync_Errors</code>, <code className="font-mono bg-slate-100 px-1 rounded">_SYS_Daily_Reports</code>, <code className="font-mono bg-slate-100 px-1 rounded">_SYS_Users_RBAC</code>, <code className="font-mono bg-slate-100 px-1 rounded">_SYS_Settings</code>), migrates existing working-sheet rows idempotently, and installs triggers.</li>
                <li>Verify in <strong>Apps Script → Triggers</strong> that <code className="font-mono bg-slate-100 px-1 rounded">handleSpreadsheetEdit</code> (On edit), <code className="font-mono bg-slate-100 px-1 rounded">handleSpreadsheetChange</code> (On change), and <code className="font-mono bg-slate-100 px-1 rounded">scheduledReconciliation</code> (Every 15 minutes) exist.</li>
              </ol>
            </section>

            <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
              <h3 className="text-base font-bold text-slate-900">3. Web App Deployment</h3>
              <ol className="list-decimal pl-5 text-xs text-slate-700 space-y-2 leading-relaxed">
                <li>Click <strong>Deploy → New deployment</strong> in the Apps Script Editor.</li>
                <li>Select Type: <strong>Web app</strong>.</li>
                <li>Description: <code className="font-mono bg-slate-100 px-1 rounded">Birat Healthcare Operations ERP v1</code>.</li>
                <li>Execute as: <strong>Me (spreadsheet owner)</strong> so all staff read/write the central database seamlessly through RBAC.</li>
                <li>Who has access: <strong>Anyone within birathealthcare.com</strong> (recommended so Google Workspace email identity resolves reliably via <code className="font-mono bg-slate-100 px-1 rounded">Session.getActiveUser().getEmail()</code>).</li>
              </ol>
            </section>

            <section className="bg-white border border-slate-200 rounded-xl p-6 space-y-3">
              <h3 className="text-base font-bold text-slate-900">4. How Working Sheets Sync &amp; Safe Upgrades</h3>
              <ul className="list-disc pl-5 text-xs text-slate-700 space-y-2 leading-relaxed">
                <li><strong>Idempotent Hashing:</strong> Every working-sheet row generates an MD5 <code className="font-mono bg-slate-100 px-1 rounded">Record Hash</code> of <code className="font-mono bg-slate-100 px-1 rounded">(txId, date, itemCode, qty, uom, status)</code> stored in <code className="font-mono bg-slate-100 px-1 rounded">_SYS_Transaction_Ledger</code>. Repeated edits, pastes, or periodic reconciliation skip unchanged rows and update changed rows in-place.</li>
                <li><strong>Stock Registers:</strong> <code className="font-mono bg-slate-100 px-1 rounded">Finished Goods</code>, <code className="font-mono bg-slate-100 px-1 rounded">Raw Material</code>, <code className="font-mono bg-slate-100 px-1 rounded">Packing Material</code>, and <code className="font-mono bg-slate-100 px-1 rounded">All Stock Balance</code> are rebuilt cleanly in batch from <code className="font-mono bg-slate-100 px-1 rounded">_SYS_Transaction_Ledger</code>.</li>
                <li><strong>Safe Upgrades:</strong> Always run <code className="font-mono bg-slate-100 px-1 rounded">backupSpreadsheet()</code> (or Sync Console → Create Drive Backup) before updating <code className="font-mono bg-slate-100 px-1 rounded">Code.gs</code> / <code className="font-mono bg-slate-100 px-1 rounded">Index.html</code>. Updating script code never touches spreadsheet data; deploy a new Web App version via <strong>Manage deployments</strong>.</li>
              </ul>
            </section>
          </div>
        </div>
      )}

      {/* MANUAL SHEET EDIT SIMULATOR MODAL */}
      {showSheetSim && (
        <div className="fixed inset-0 bg-slate-950/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-slate-200 max-w-lg w-full p-6 space-y-4">
            <div className="flex items-center justify-between">
              <h3 className="text-base font-bold text-slate-900">Simulate Direct Google Sheet Entry / Edit</h3>
              <button onClick={() => setShowSheetSim(false)} className="text-slate-400 hover:text-slate-700 text-sm">
                Close
              </button>
            </div>
            <p className="text-xs text-slate-600">
              Tests <code className="font-mono">handleSpreadsheetEdit</code> &amp; <code className="font-mono">syncWorkingSheets</code>. Submit an entry once, then submit the exact same ID again to verify duplicate-paste idempotency.
            </p>
            <div className="grid grid-cols-2 gap-3 text-xs">
              <div>
                <label className="block font-semibold mb-1">Working Sheet</label>
                <select
                  value={simSheetName}
                  onChange={(e) => setSimSheetName(e.target.value as any)}
                  className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5"
                >
                  <option value="Goods Reciept">Goods Reciept</option>
                  <option value="Production">Production</option>
                  <option value="Dispatch">Dispatch</option>
                  <option value="Issue">Issue</option>
                </select>
              </div>
              <div>
                <label className="block font-semibold mb-1">Transaction ID (blank = new)</label>
                <input
                  value={simTxId}
                  onChange={(e) => setSimTxId(e.target.value)}
                  placeholder="e.g., GRN-MANUAL-101"
                  className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 font-mono"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">Date</label>
                <input
                  type="date"
                  value={simDate}
                  onChange={(e) => setSimDate(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">Item Code</label>
                <input
                  value={simItemCode}
                  onChange={(e) => setSimItemCode(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 font-mono"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">Quantity</label>
                <input
                  type="number"
                  value={simQty}
                  onChange={(e) => setSimQty(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5 font-mono"
                />
              </div>
              <div>
                <label className="block font-semibold mb-1">UOM</label>
                <input
                  value={simUom}
                  onChange={(e) => setSimUom(e.target.value)}
                  className="w-full border border-slate-300 rounded-lg px-2.5 py-1.5"
                />
              </div>
            </div>
            {simSyncFeedback && (
              <div className="p-2.5 bg-slate-50 border border-slate-200 rounded-lg text-xs font-mono text-slate-700">
                {simSyncFeedback}
              </div>
            )}
            <div className="flex justify-end gap-2 pt-2">
              <button
                onClick={() => setShowSheetSim(false)}
                className="px-3 py-1.5 text-xs bg-slate-100 rounded-lg hover:bg-slate-200"
              >
                Close
              </button>
              <button
                onClick={handleManualSheetSync}
                className="px-4 py-1.5 text-xs font-semibold bg-blue-600 text-white rounded-lg hover:bg-blue-700"
              >
                Trigger Sheet Sync
              </button>
            </div>
          </div>
        </div>
      )}

      {/* SHEETS & LEDGER INSPECTOR MODAL */}
      {sheetInspectorOpen && (
        <div className="fixed inset-0 bg-slate-950/60 z-50 flex items-center justify-center p-4">
          <div className="bg-white rounded-xl border border-slate-200 max-w-5xl w-full max-h-[85vh] flex flex-col overflow-hidden">
            <div className="px-6 py-4 border-b border-slate-200 flex items-center justify-between">
              <div className="flex items-center gap-3">
                <h3 className="text-base font-bold text-slate-900">Simulated Google Sheets Inspector</h3>
                <select
                  value={inspectorSheet}
                  onChange={(e) => setInspectorSheet(e.target.value)}
                  className="text-xs border border-slate-300 rounded-lg px-2.5 py-1"
                >
                  <optgroup label="Operations &amp; Inventory DB (1gGmpt4g...GAJs)">
                    <option value="Item Master">Item Master</option>
                    <option value="_SYS_Transaction_Ledger">_SYS_Transaction_Ledger</option>
                    <option value="Production">Production</option>
                    <option value="Dispatch">Dispatch</option>
                    <option value="Goods Reciept">Goods Reciept</option>
                    <option value="Issue">Issue</option>
                  </optgroup>
                  <optgroup label="Procurement &amp; Tender DB (16SN_MJj...2-yY)">
                    <option value="PROC:Indents">Indents</option>
                    <option value="PROC:Suppliers">Suppliers</option>
                    <option value="PROC:FreightForwarder">FreightForwarder</option>
                    <option value="PROC:Quotations">Quotations</option>
                    <option value="PROC:PurchaseOrders">PurchaseOrders</option>
                    <option value="PROC:LCTTPayments">LCTTPayments</option>
                    <option value="PROC:Shipments">Shipments</option>
                    <option value="PROC:Tenders">Tenders</option>
                    <option value="PROC:TenderTracking">TenderTracking</option>
                  </optgroup>
                </select>
              </div>
              <button onClick={() => setSheetInspectorOpen(false)} className="text-xs text-slate-500 hover:text-slate-900">
                Close
              </button>
            </div>
            <div className="flex-1 overflow-auto p-4 text-xs">
              {inspectorSheet === 'Item Master' && (
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-slate-100 text-left">
                      <th className="p-2 border">Code</th>
                      <th className="p-2 border">Item Name</th>
                      <th className="p-2 border">Category</th>
                      <th className="p-2 border">Index Unit</th>
                      <th className="p-2 border">Conv Unit</th>
                      <th className="p-2 border">Conv Qty</th>
                      <th className="p-2 border">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dbSnap.items.map((it) => (
                      <tr key={it.itemCode}>
                        <td className="p-2 border font-mono">{it.itemCode}</td>
                        <td className="p-2 border">{it.itemName}</td>
                        <td className="p-2 border">{it.category}</td>
                        <td className="p-2 border">{it.indexUnit}</td>
                        <td className="p-2 border">{it.conversionUnit || '-'}</td>
                        <td className="p-2 border font-mono">{it.conversionQty || '-'}</td>
                        <td className="p-2 border">{it.status}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {inspectorSheet === '_SYS_Transaction_Ledger' && (
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-slate-100 text-left">
                      <th className="p-2 border">Tx ID</th>
                      <th className="p-2 border">Type</th>
                      <th className="p-2 border">Date</th>
                      <th className="p-2 border">Code</th>
                      <th className="p-2 border">Dir</th>
                      <th className="p-2 border">Base Qty</th>
                      <th className="p-2 border">Source</th>
                      <th className="p-2 border">Status</th>
                      <th className="p-2 border">Hash</th>
                    </tr>
                  </thead>
                  <tbody>
                    {dbSnap.ledger.map((l) => (
                      <tr key={l.txId}>
                        <td className="p-2 border font-mono">{l.txId}</td>
                        <td className="p-2 border">{l.txType}</td>
                        <td className="p-2 border font-mono">{l.txDate}</td>
                        <td className="p-2 border font-mono">{l.itemCode}</td>
                        <td className="p-2 border">{l.direction}</td>
                        <td className="p-2 border font-mono">{l.baseQty}</td>
                        <td className="p-2 border">{l.sourceSheet}</td>
                        <td className="p-2 border">{l.status}</td>
                        <td className="p-2 border font-mono">{l.recordHash}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {['Production', 'Dispatch', 'Goods Reciept', 'Issue'].includes(inspectorSheet) && (
                <table className="w-full border-collapse">
                  <thead>
                    <tr className="bg-slate-100 text-left">
                      <th className="p-2 border">Tx ID</th>
                      <th className="p-2 border">Date</th>
                      <th className="p-2 border">Item Code</th>
                      <th className="p-2 border">Qty</th>
                      <th className="p-2 border">UOM</th>
                      <th className="p-2 border">Status</th>
                      <th className="p-2 border">Sync Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {(dbSnap.workingSheets[inspectorSheet] || []).map((r, idx) => (
                      <tr key={`${r.txId}-${idx}`}>
                        <td className="p-2 border font-mono">{r.txId}</td>
                        <td className="p-2 border font-mono">{r.txDate}</td>
                        <td className="p-2 border font-mono">{r.itemCode}</td>
                        <td className="p-2 border font-mono">{r.quantity}</td>
                        <td className="p-2 border">{r.uom}</td>
                        <td className="p-2 border">{r.status}</td>
                        <td className="p-2 border">{r.syncStatus}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
              {inspectorSheet.startsWith('PROC:') && (() => {
                const pKey = inspectorSheet.replace('PROC:', '') as keyof typeof dbSnap.procurement;
                const rows = Array.isArray(dbSnap.procurement?.[pKey]) ? (dbSnap.procurement[pKey] as any[]) : [];
                if (rows.length === 0) {
                  return <div className="p-6 text-center text-slate-500">No rows in {pKey} yet.</div>;
                }
                const cols = Object.keys(rows[0]).filter((c) => c !== 'ItemsJSON').slice(0, 10);
                return (
                  <table className="w-full border-collapse">
                    <thead>
                      <tr className="bg-slate-100 text-left">
                        {cols.map((c) => (
                          <th key={c} className="p-2 border">{c}</th>
                        ))}
                      </tr>
                    </thead>
                    <tbody>
                      {rows.map((r, idx) => (
                        <tr key={idx}>
                          {cols.map((c) => (
                            <td key={c} className="p-2 border font-mono">
                              {r[c] !== undefined && r[c] !== null && r[c] !== '' ? String(r[c]) : '-'}
                            </td>
                          ))}
                        </tr>
                      ))}
                    </tbody>
                  </table>
                );
              })()}
            </div>
          </div>
        </div>
      )}
      {renderSyncConfirmModal()}
    </div>
  );
}
