import React, { createContext, useCallback, useContext, useEffect, useState } from 'react';
import { onAuthStateChanged, type User } from 'firebase/auth';
import {
  auth,
  clearCachedDriveAccessToken,
  connectGoogleDriveToken,
  getCachedDriveAccessToken,
  signInWithGoogle as firebaseSignInWithGoogle,
  signOutUser
} from '../firebase.ts';
import { ensureUserWorkspaceRoot } from '../utils/firestoreSync.ts';

interface FirebaseContextValue {
  user: User | null;
  authReady: boolean;
  workspaceRootReady: boolean;
  isSigningIn: boolean;
  authError: string | null;
  driveAccessToken: string | null;
  signInWithGoogle: () => Promise<void>;
  connectGoogleDrive: () => Promise<string | null>;
  signOut: () => Promise<void>;
  clearAuthError: () => void;
}

const FirebaseContext = createContext<FirebaseContextValue>({
  user: null,
  authReady: false,
  workspaceRootReady: false,
  isSigningIn: false,
  authError: null,
  driveAccessToken: null,
  signInWithGoogle: async () => undefined,
  connectGoogleDrive: async () => null,
  signOut: async () => undefined,
  clearAuthError: () => undefined
});

export function useFirebaseAuth(): FirebaseContextValue {
  return useContext(FirebaseContext);
}

export const FirebaseProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [authReady, setAuthReady] = useState(false);
  const [workspaceRootReady, setWorkspaceRootReady] = useState(false);
  const [isSigningIn, setIsSigningIn] = useState(false);
  const [authError, setAuthError] = useState<string | null>(null);
  const [driveAccessToken, setDriveAccessToken] = useState<string | null>(() =>
    getCachedDriveAccessToken()
  );

  useEffect(() => {
    let active = true;
    const unsubscribe = onAuthStateChanged(auth, async (nextUser) => {
      if (!active) return;
      setUser(nextUser);
      setWorkspaceRootReady(false);
      setAuthReady(true);

      if (!nextUser) {
        clearCachedDriveAccessToken();
        setDriveAccessToken(null);
      }

      if (nextUser && nextUser.emailVerified) {
        try {
          await ensureUserWorkspaceRoot(nextUser);
          if (active) {
            setWorkspaceRootReady(true);
            setAuthError(null);
          }
        } catch (err) {
          if (active) {
            setWorkspaceRootReady(false);
            setAuthError(
              err instanceof Error ? err.message : 'Unable to initialize Firebase workspace root.'
            );
          }
        }
      }
    });

    return () => {
      active = false;
      unsubscribe();
    };
  }, []);

  const signInWithGoogle = useCallback(async () => {
    if (isSigningIn) return;
    setIsSigningIn(true);
    setAuthError(null);
    try {
      await firebaseSignInWithGoogle();
      setDriveAccessToken(getCachedDriveAccessToken());
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Google sign-in failed.';
      if (msg.includes('popup-closed-by-user')) {
        setAuthError('Sign-in popup was closed before completing authentication.');
      } else {
        setAuthError(msg);
      }
    } finally {
      setIsSigningIn(false);
    }
  }, [isSigningIn]);

  const connectGoogleDrive = useCallback(async (): Promise<string | null> => {
    if (isSigningIn) return driveAccessToken;
    setIsSigningIn(true);
    setAuthError(null);
    try {
      const token = await connectGoogleDriveToken();
      setDriveAccessToken(token);
      return token;
    } catch (err) {
      const msg = err instanceof Error ? err.message : 'Google Drive authorization failed.';
      if (msg.includes('popup-closed-by-user')) {
        setAuthError('Google Drive authorization popup was closed before completing.');
      } else {
        setAuthError(msg);
      }
      return null;
    } finally {
      setIsSigningIn(false);
    }
  }, [driveAccessToken, isSigningIn]);

  const signOut = useCallback(async () => {
    setAuthError(null);
    setWorkspaceRootReady(false);
    clearCachedDriveAccessToken();
    setDriveAccessToken(null);
    await signOutUser();
  }, []);

  const clearAuthError = useCallback(() => setAuthError(null), []);

  return (
    <FirebaseContext.Provider
      value={{
        user,
        authReady,
        workspaceRootReady,
        isSigningIn,
        authError,
        driveAccessToken,
        signInWithGoogle,
        connectGoogleDrive,
        signOut,
        clearAuthError
      }}
    >
      {children}
    </FirebaseContext.Provider>
  );
};
