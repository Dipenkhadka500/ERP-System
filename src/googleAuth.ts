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

const app = getApps().length > 0 ? getApp() : initializeApp(firebaseConfig);
const auth = getAuth(app);

// Strictly in-memory OAuth access token storage (never persisted to localStorage/sessionStorage)
let memoryAccessToken: string | null = null;
let currentUser: User | null = auth.currentUser;
let lastAuthError = '';
let needsScopeGrant = false;
let gisLoadPromise: Promise<void> | null = null;

export interface GoogleAuthState {
  isSignedIn: boolean;
  hasAccessToken: boolean;
  needsScopeGrant: boolean;
  email: string;
  displayName: string;
  photoURL: string;
  error: string;
}

type AuthListener = (state: GoogleAuthState) => void;
const listeners = new Set<AuthListener>();

function getSnapshot(): GoogleAuthState {
  return {
    isSignedIn: Boolean(currentUser),
    hasAccessToken: Boolean(memoryAccessToken),
    needsScopeGrant,
    email: currentUser?.email || '',
    displayName: currentUser?.displayName || currentUser?.email || '',
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
    const existing = document.querySelector('script[src="https://accounts.google.com/gsi/client"]');
    if (existing) {
      existing.addEventListener('load', () => resolve(), { once: true });
      existing.addEventListener('error', () => reject(new Error('Failed to load Google Identity Services.')), { once: true });
      setTimeout(() => {
        if ((window as any).google?.accounts?.oauth2?.initTokenClient) resolve();
      }, 300);
      return;
    }
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.defer = true;
    s.onload = () => resolve();
    s.onerror = () => reject(new Error('Failed to load Google Identity Services script.'));
    document.head.appendChild(s);
  });
  return gisLoadPromise;
}

// Preload GIS script immediately so Authorize Sheets Access can invoke popup synchronously on click
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

onAuthStateChanged(auth, (user) => {
  currentUser = user;
  if (!user) {
    memoryAccessToken = null;
    needsScopeGrant = false;
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
    throw new Error('Google Identity Services could not initialize. Allow scripts from accounts.google.com and try again.');
  }

  const accessToken = await new Promise<string>((resolve, reject) => {
    try {
      const tokenClient = oauth2.initTokenClient({
        client_id: clientId,
        scope: SHEETS_SCOPE,
        hint: currentUser?.email || undefined,
        prompt: 'consent',
        callback: (resp: any) => {
          if (resp?.error) {
            reject(new Error(resp.error_description || resp.error || 'Google Sheets authorization was cancelled.'));
            return;
          }
          if (!resp?.access_token) {
            reject(new Error('No Google Sheets access token returned.'));
            return;
          }
          resolve(String(resp.access_token));
        },
        error_callback: (err: any) => {
          reject(new Error(err?.message || 'Google authorization popup was blocked or closed.'));
        },
      });
      tokenClient.requestAccessToken({ prompt: 'consent' });
    } catch (e: any) {
      reject(new Error(e?.message || 'Unable to start Google Sheets authorization.'));
    }
  });

  const check = await verifyTokenHasSheetsScope(accessToken);
  if (!check.ok) {
    memoryAccessToken = null;
    needsScopeGrant = true;
    const msg =
      'Google Sheets permission was not checked on the consent screen. Please check the "See, edit, create, and delete all your Google Sheets spreadsheets" box and click Continue.';
    lastAuthError = msg;
    notify();
    throw new Error(msg);
  }

  memoryAccessToken = accessToken;
  needsScopeGrant = false;
  lastAuthError = '';
  notify();
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
        memoryAccessToken = firebaseAccessToken;
        needsScopeGrant = false;
        lastAuthError = '';
        notify();
        return getSnapshot();
      }
    }

    // Firebase popup token lacked the spreadsheets scope (e.g., granular consent unchecked or separate OAuth client).
    // Clear unscoped token and immediately surface direct OAuth client authorization.
    memoryAccessToken = null;
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
  memoryAccessToken = null;
  needsScopeGrant = false;
  lastAuthError = '';
  await signOut(auth);
  currentUser = null;
  notify();
}
