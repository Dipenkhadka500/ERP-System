import { initializeApp, getApps, getApp } from 'firebase/app';
import {
  getAuth,
  GoogleAuthProvider,
  onAuthStateChanged,
  signInWithPopup,
  signOut,
  type User,
} from 'firebase/auth';
import firebaseConfig from '../firebase-applet-config.json';

export const SHEETS_SCOPE = 'https://www.googleapis.com/auth/spreadsheets';
const AUTO_SYNC_PREF_KEY = 'BIRAT_ERP_SHEETS_AUTOSYNC_PREF_V1';

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);

// Strictly in-memory OAuth access token storage (never persisted to localStorage/sessionStorage)
let memoryAccessToken: string | null = null;
let tokenExpiresAtMs = 0;
let proactiveRefreshTimer: number | null = null;
let inFlightSilentRefresh: Promise<string | null> | null = null;
let bootRestoreAttempted = false;

let currentUser: User | null = auth.currentUser;
let lastAuthError = '';
let needsScopeGrant = false;
let isRestoringSession = false;
let gisLoadPromise: Promise<void> | null = null;

export interface AutoSyncPreference {
  configured: boolean;
  email: string;
}

export interface GoogleAuthState {
  isSignedIn: boolean;
  hasAccessToken: boolean;
  needsScopeGrant: boolean;
  isRestoringSession: boolean;
  autoSyncConfigured: boolean;
  email: string;
  displayName: string;
  photoURL: string;
  error: string;
}

type AuthListener = (state: GoogleAuthState) => void;
const listeners = new Set<AuthListener>();

export function getAutoSyncPreference(): AutoSyncPreference {
  try {
    const raw = localStorage.getItem(AUTO_SYNC_PREF_KEY);
    if (!raw) return { configured: false, email: '' };
    const parsed = JSON.parse(raw);
    return {
      configured: Boolean(parsed?.configured),
      email: typeof parsed?.email === 'string' ? parsed.email : '',
    };
  } catch {
    return { configured: false, email: '' };
  }
}

export function markAutoSyncConfigured(email?: string): void {
  try {
    const resolvedEmail = email || currentUser?.email || getAutoSyncPreference().email || '';
    localStorage.setItem(
      AUTO_SYNC_PREF_KEY,
      JSON.stringify({ configured: true, email: resolvedEmail })
    );
  } catch {
    // ignore storage quota errors
  }
  notify();
}

export function clearAutoSyncConfigured(): void {
  try {
    localStorage.removeItem(AUTO_SYNC_PREF_KEY);
  } catch {
    // ignore
  }
  notify();
}

function getSnapshot(): GoogleAuthState {
  const pref = getAutoSyncPreference();
  return {
    isSignedIn: Boolean(currentUser),
    hasAccessToken: Boolean(memoryAccessToken),
    needsScopeGrant,
    isRestoringSession,
    autoSyncConfigured: pref.configured,
    email: currentUser?.email || pref.email || '',
    displayName: currentUser?.displayName || currentUser?.email || pref.email || '',
    photoURL: currentUser?.photoURL || '',
    error: lastAuthError,
  };
}

function notify() {
  const snap = getSnapshot();
  listeners.forEach((cb) => {
    try {
      cb(snap);
    } catch {
      // ignore subscriber errors
    }
  });
}

function clearProactiveRefreshTimer() {
  if (proactiveRefreshTimer !== null && typeof window !== 'undefined') {
    window.clearTimeout(proactiveRefreshTimer);
    proactiveRefreshTimer = null;
  }
}

function scheduleProactiveTokenRefresh() {
  clearProactiveRefreshTimer();
  if (typeof window === 'undefined' || !memoryAccessToken || !tokenExpiresAtMs) return;
  // Refresh 4 minutes before actual expiry so active sync stays uninterrupted indefinitely
  const delayMs = Math.max(60_000, tokenExpiresAtMs - Date.now() - 4 * 60_000);
  proactiveRefreshTimer = window.setTimeout(() => {
    proactiveRefreshTimer = null;
    if (getAutoSyncPreference().configured || currentUser) {
      void refreshSheetsTokenSilently();
    }
  }, delayMs);
}

function setInMemoryToken(token: string, expiresInSec = 3599) {
  memoryAccessToken = token;
  const safeTtlSec = Math.max(300, Number.isFinite(expiresInSec) ? expiresInSec : 3599);
  tokenExpiresAtMs = Date.now() + safeTtlSec * 1000;
  needsScopeGrant = false;
  lastAuthError = '';
  scheduleProactiveTokenRefresh();
  notify();
}

function preloadGisScript(): Promise<void> {
  if (typeof window === 'undefined' || typeof document === 'undefined') {
    return Promise.resolve();
  }
  const win = window as any;
  if (win.google?.accounts?.oauth2?.initTokenClient) {
    return Promise.resolve();
  }
  if (gisLoadPromise) return gisLoadPromise;

  gisLoadPromise = new Promise<void>((resolve, reject) => {
    const finishTimeout = window.setTimeout(() => {
      if ((window as any).google?.accounts?.oauth2?.initTokenClient) {
        resolve();
      } else {
        gisLoadPromise = null;
        reject(new Error('Timed out loading Google Identity Services.'));
      }
    }, 8000);

    const done = (ok: boolean, err?: Error) => {
      window.clearTimeout(finishTimeout);
      if (ok) resolve();
      else {
        gisLoadPromise = null;
        reject(err || new Error('Failed to load Google Identity Services script.'));
      }
    };

    const existing = document.querySelector('script[src="https://accounts.google.com/gsi/client"]');
    if (existing) {
      existing.addEventListener('load', () => done(true), { once: true });
      existing.addEventListener(
        'error',
        () => done(false, new Error('Failed to load Google Identity Services.')),
        { once: true }
      );
      window.setTimeout(() => {
        if ((window as any).google?.accounts?.oauth2?.initTokenClient) done(true);
      }, 250);
      return;
    }

    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.defer = true;
    s.onload = () => done(true);
    s.onerror = () => done(false, new Error('Failed to load Google Identity Services script.'));
    document.head.appendChild(s);
  });
  return gisLoadPromise;
}

// Preload GIS script immediately so Authorize / Resume can invoke GIS without delay
if (typeof window !== 'undefined') {
  preloadGisScript().catch(() => {});
}

async function verifyTokenHasSheetsScope(accessToken: string): Promise<{ ok: boolean; scopes: string[] }> {
  try {
    const res = await fetch(
      `https://www.googleapis.com/oauth2/v3/tokeninfo?access_token=${encodeURIComponent(accessToken)}`
    );
    if (!res.ok) return { ok: false, scopes: [] };
    const info = await res.json();
    const scopes = String(info?.scope || '')
      .split(/\s+/)
      .map((s) => s.trim())
      .filter(Boolean);
    const hasSheets =
      scopes.includes(SHEETS_SCOPE) ||
      scopes.includes('https://www.googleapis.com/auth/drive');
    return { ok: hasSheets, scopes };
  } catch {
    // If tokeninfo endpoint is blocked by network/extension, let actual Sheets API decide
    return { ok: true, scopes: [] };
  }
}

export async function refreshSheetsTokenSilently(emailHint?: string): Promise<string | null> {
  if (inFlightSilentRefresh) return inFlightSilentRefresh;

  const clientId = (firebaseConfig as any)?.oAuthClientId;
  const pref = getAutoSyncPreference();
  const hint = emailHint || currentUser?.email || pref.email || '';
  if (!clientId || !hint) return null;

  inFlightSilentRefresh = (async () => {
    isRestoringSession = true;
    notify();
    try {
      await preloadGisScript();
      const oauth2 = (window as any).google?.accounts?.oauth2;
      if (!oauth2?.initTokenClient) return null;

      const tokenResult = await new Promise<{ accessToken: string; expiresIn: number } | null>(
        (resolve) => {
          let settled = false;
          const timer = window.setTimeout(() => {
            if (!settled) {
              settled = true;
              resolve(null);
            }
          }, 8000);

          try {
            const tokenClient = oauth2.initTokenClient({
              client_id: clientId,
              scope: SHEETS_SCOPE,
              hint,
              prompt: '',
              callback: (resp: any) => {
                if (settled) return;
                settled = true;
                window.clearTimeout(timer);
                if (resp?.error || !resp?.access_token) {
                  resolve(null);
                  return;
                }
                const grantedScope = String(resp?.scope || '');
                if (
                  grantedScope &&
                  !grantedScope.includes(SHEETS_SCOPE) &&
                  !grantedScope.includes('https://www.googleapis.com/auth/drive')
                ) {
                  resolve(null);
                  return;
                }
                resolve({
                  accessToken: String(resp.access_token),
                  expiresIn: Number(resp?.expires_in) || 3599,
                });
              },
              error_callback: () => {
                if (!settled) {
                  settled = true;
                  window.clearTimeout(timer);
                  resolve(null);
                }
              },
            });
            tokenClient.requestAccessToken({ prompt: '' });
          } catch {
            if (!settled) {
              settled = true;
              window.clearTimeout(timer);
              resolve(null);
            }
          }
        }
      );

      if (!tokenResult) {
        if (pref.configured) {
          needsScopeGrant = true;
        }
        return null;
      }

      const check = await verifyTokenHasSheetsScope(tokenResult.accessToken);
      if (!check.ok) {
        if (pref.configured) {
          needsScopeGrant = true;
        }
        return null;
      }

      setInMemoryToken(tokenResult.accessToken, tokenResult.expiresIn);
      return tokenResult.accessToken;
    } finally {
      isRestoringSession = false;
      inFlightSilentRefresh = null;
      notify();
    }
  })();

  return inFlightSilentRefresh;
}

export async function ensureValidSheetsAccessToken(): Promise<string | null> {
  if (memoryAccessToken && Date.now() < tokenExpiresAtMs - 60_000) {
    return memoryAccessToken;
  }
  const refreshed = await refreshSheetsTokenSilently();
  return refreshed || memoryAccessToken;
}

onAuthStateChanged(auth, (user) => {
  currentUser = user;
  const pref = getAutoSyncPreference();
  if (!user) {
    memoryAccessToken = null;
    tokenExpiresAtMs = 0;
    clearProactiveRefreshTimer();
    needsScopeGrant = false;
  }

  // Automatic one-time setup session restoration (never persists access tokens to storage)
  if (!bootRestoreAttempted && pref.configured && !memoryAccessToken) {
    const restoreEmail = user?.email || pref.email;
    if (restoreEmail) {
      bootRestoreAttempted = true;
      void refreshSheetsTokenSilently(restoreEmail);
      return;
    }
  }

  notify();
});

export function subscribeGoogleAuth(cb: AuthListener): () => void {
  listeners.add(cb);
  cb(getSnapshot());
  return () => {
    listeners.delete(cb);
  };
}

export function getGoogleAuthState(): GoogleAuthState {
  return getSnapshot();
}

export function getSheetsAccessToken(): string | null {
  return memoryAccessToken;
}

export function clearSheetsAccessToken(reason?: string, scopeMissing = false) {
  memoryAccessToken = null;
  tokenExpiresAtMs = 0;
  clearProactiveRefreshTimer();
  needsScopeGrant = scopeMissing;
  if (reason) lastAuthError = reason;
  notify();
}

export async function authorizeSheetsScopeDirect(): Promise<GoogleAuthState> {
  lastAuthError = '';
  const clientId = (firebaseConfig as any)?.oAuthClientId;
  if (!clientId) {
    throw new Error('OAuth Client ID is missing in configuration.');
  }

  let oauth2 = (window as any).google?.accounts?.oauth2;
  if (!oauth2?.initTokenClient) {
    await preloadGisScript();
    oauth2 = (window as any).google?.accounts?.oauth2;
  }
  if (!oauth2?.initTokenClient) {
    throw new Error(
      'Google Identity Services could not initialize. Allow scripts from accounts.google.com and try again.'
    );
  }

  const pref = getAutoSyncPreference();
  const hint = currentUser?.email || pref.email || undefined;

  const tokenResult = await new Promise<{ accessToken: string; expiresIn: number }>(
    (resolve, reject) => {
      try {
        const tokenClient = oauth2.initTokenClient({
          client_id: clientId,
          scope: SHEETS_SCOPE,
          hint,
          prompt: 'consent',
          callback: (resp: any) => {
            if (resp?.error) {
              reject(
                new Error(
                  resp.error_description ||
                    resp.error ||
                    'Google Sheets authorization was cancelled.'
                )
              );
              return;
            }
            if (!resp?.access_token) {
              reject(new Error('No Google Sheets access token returned.'));
              return;
            }
            resolve({
              accessToken: String(resp.access_token),
              expiresIn: Number(resp?.expires_in) || 3599,
            });
          },
          error_callback: (err: any) => {
            reject(
              new Error(err?.message || 'Google authorization popup was blocked or closed.')
            );
          },
        });
        tokenClient.requestAccessToken({ prompt: 'consent' });
      } catch (e: any) {
        reject(new Error(e?.message || 'Unable to start Google Sheets authorization.'));
      }
    }
  );

  const check = await verifyTokenHasSheetsScope(tokenResult.accessToken);
  if (!check.ok) {
    memoryAccessToken = null;
    tokenExpiresAtMs = 0;
    clearProactiveRefreshTimer();
    needsScopeGrant = true;
    const msg =
      'Google Sheets permission was not checked on the consent screen. Please check the "See, edit, create, and delete all your Google Sheets spreadsheets" box and click Continue.';
    lastAuthError = msg;
    notify();
    throw new Error(msg);
  }

  setInMemoryToken(tokenResult.accessToken, tokenResult.expiresIn);
  return getSnapshot();
}

export async function signInWithGoogleSheets(): Promise<GoogleAuthState> {
  lastAuthError = '';
  needsScopeGrant = false;
  const provider = new GoogleAuthProvider();
  provider.addScope(SHEETS_SCOPE);
  provider.setCustomParameters({
    prompt: 'select_account consent',
  });

  try {
    const result = await signInWithPopup(auth, provider);
    currentUser = result.user;
    const credential = GoogleAuthProvider.credentialFromResult(result);
    const firebaseAccessToken = credential?.accessToken || '';

    if (firebaseAccessToken) {
      const check = await verifyTokenHasSheetsScope(firebaseAccessToken);
      if (check.ok) {
        setInMemoryToken(firebaseAccessToken, 3000);
        return getSnapshot();
      }
    }

    // Try one silent GIS check in case user already granted permission previously on this OAuth client
    const silent = await refreshSheetsTokenSilently(result.user.email || '');
    if (silent) {
      return getSnapshot();
    }

    memoryAccessToken = null;
    tokenExpiresAtMs = 0;
    clearProactiveRefreshTimer();
    needsScopeGrant = true;
    const msg =
      'Google account signed in, but Google Sheets edit permission was not granted yet. Click "Authorize Google Sheets" and check the Google Sheets permission box on the consent popup.';
    lastAuthError = msg;
    notify();
    throw new Error(msg);
  } catch (err: any) {
    const msg =
      err?.code === 'auth/popup-closed-by-user'
        ? 'Google sign-in popup was closed before finishing.'
        : err?.code === 'auth/popup-blocked'
        ? 'Popup was blocked by your browser. Please allow popups for this site and try again.'
        : err?.message || 'Unable to connect Google account.';
    lastAuthError = msg;
    notify();
    throw new Error(msg);
  }
}

export async function signOutGoogleSheets(): Promise<void> {
  clearAutoSyncConfigured();
  memoryAccessToken = null;
  tokenExpiresAtMs = 0;
  clearProactiveRefreshTimer();
  needsScopeGrant = false;
  lastAuthError = '';
  bootRestoreAttempted = false;
  await signOut(auth);
  currentUser = null;
  notify();
}
