import { initializeApp } from 'firebase/app';
import { initializeAppCheck, ReCaptchaV3Provider } from 'firebase/app-check';
import { getAuth, GoogleAuthProvider } from 'firebase/auth';
import { doc, getDocFromServer, initializeFirestore } from 'firebase/firestore';
import { getStorage } from 'firebase/storage';
import firebaseConfig from '../../firebase-applet-config.json';

export const app = initializeApp(firebaseConfig);

// Use experimentalForceLongPolling to avoid WebChannel 10s timeouts in proxied/restricted networks
export const db = initializeFirestore(
  app,
  {
    experimentalForceLongPolling: true,
  },
  firebaseConfig.firestoreDatabaseId
);

export const auth = getAuth(app);
export const storage = getStorage(app);

export const googleProvider = new GoogleAuthProvider();
googleProvider.setCustomParameters({
  prompt: 'select_account',
});

// Initialize Firebase App Check when a reCAPTCHA v3 site key is configured
const appCheckSiteKey =
  import.meta.env.VITE_FIREBASE_APP_CHECK_SITE_KEY ||
  firebaseConfig.recaptchaSiteKey ||
  '';

export const isAppCheckConfigured = Boolean(appCheckSiteKey);

if (typeof window !== 'undefined' && appCheckSiteKey) {
  try {
    initializeAppCheck(app, {
      provider: new ReCaptchaV3Provider(appCheckSiteKey),
      isTokenAutoRefreshEnabled: true,
    });
  } catch (err) {
    console.warn('App Check initialization skipped:', err);
  }
}

export async function testFirestoreConnection(): Promise<{
  connected: boolean;
  error?: string;
}> {
  try {
    await getDocFromServer(doc(db, 'test', 'connection'));
    return { connected: true };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    if (message.includes('the client is offline')) {
      return {
        connected: false,
        error: 'تعذر الوصول إلى خادم Cloud Firestore. يرجى التحقق من اتصال الإنترنت.',
      };
    }
    return { connected: true };
  }
}

// Non-blocking boot connectivity check
void testFirestoreConnection();
