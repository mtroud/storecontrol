import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useState,
} from 'react';
import { UserRole } from '../types/inventory';
import {
  AuthorizedDigitalSignature,
  DEFAULT_SIGNATURE_ROLE_LABELS,
  SignatureMap,
  SignatureRoleLabels,
  SignatureSlotId,
} from '../types/signature';
import { useAuth } from './AuthContext';

interface SignatureContextValue {
  signatures: SignatureMap;
  canSign: boolean;
  signedCount: number;
  isModalOpen: boolean;
  activeSlot: SignatureSlotId;
  roleLabels: SignatureRoleLabels;
  setActiveSlot: (slot: SignatureSlotId) => void;
  openSignatureModal: (
    slot?: SignatureSlotId,
    customRoleLabels?: Partial<SignatureRoleLabels>
  ) => void;
  closeSignatureModal: () => void;
  saveSignature: (sig: AuthorizedDigitalSignature) => void;
  clearSignature: (slot: SignatureSlotId) => void;
  clearAllSignatures: () => void;
}

const SignatureContext = createContext<SignatureContextValue | undefined>(undefined);

const STORAGE_PREFIX = 'sayedmart:digital_signatures:';

export function SignatureProvider({ children }: { children: React.ReactNode }) {
  const { session } = useAuth();
  const [signatures, setSignatures] = useState<SignatureMap>({});
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [activeSlot, setActiveSlot] = useState<SignatureSlotId>('organizer');
  const [roleLabels, setRoleLabels] = useState<SignatureRoleLabels>(
    DEFAULT_SIGNATURE_ROLE_LABELS
  );

  const storageKey = session?.uid ? `${STORAGE_PREFIX}${session.uid}` : null;

  useEffect(() => {
    if (!storageKey) {
      setSignatures({});
      return;
    }
    try {
      const raw = window.localStorage.getItem(storageKey);
      if (raw) {
        const parsed = JSON.parse(raw) as SignatureMap;
        if (parsed && typeof parsed === 'object') {
          setSignatures(parsed);
          return;
        }
      }
      setSignatures({});
    } catch {
      setSignatures({});
    }
  }, [storageKey]);

  const persist = useCallback(
    (next: SignatureMap) => {
      if (!storageKey) return;
      try {
        window.localStorage.setItem(storageKey, JSON.stringify(next));
      } catch {
        // Ignore quota errors
      }
    },
    [storageKey]
  );

  const canSign = useMemo(() => {
    if (!session) return false;
    return (
      session.role === UserRole.SYSTEM_ADMIN ||
      session.role === UserRole.WAREHOUSE_MANAGER ||
      session.role === UserRole.WAREHOUSE_STAFF
    );
  }, [session]);

  const signedCount = useMemo(
    () =>
      (['organizer', 'reviewer', 'approver'] as SignatureSlotId[]).filter(
        (id) => Boolean(signatures[id])
      ).length,
    [signatures]
  );

  const openSignatureModal = useCallback(
    (
      slot: SignatureSlotId = 'organizer',
      customRoleLabels?: Partial<SignatureRoleLabels>
    ) => {
      setActiveSlot(slot);
      setRoleLabels({
        ...DEFAULT_SIGNATURE_ROLE_LABELS,
        ...(customRoleLabels || {}),
      });
      setIsModalOpen(true);
    },
    []
  );

  const closeSignatureModal = useCallback(() => {
    setIsModalOpen(false);
  }, []);

  const saveSignature = useCallback(
    (sig: AuthorizedDigitalSignature) => {
      setSignatures((prev) => {
        const next: SignatureMap = {
          ...prev,
          [sig.slotId]: sig,
        };
        persist(next);
        return next;
      });
    },
    [persist]
  );

  const clearSignature = useCallback(
    (slot: SignatureSlotId) => {
      setSignatures((prev) => {
        const next: SignatureMap = { ...prev };
        delete next[slot];
        persist(next);
        return next;
      });
    },
    [persist]
  );

  const clearAllSignatures = useCallback(() => {
    setSignatures({});
    persist({});
  }, [persist]);

  return (
    <SignatureContext.Provider
      value={{
        signatures,
        canSign,
        signedCount,
        isModalOpen,
        activeSlot,
        roleLabels,
        setActiveSlot,
        openSignatureModal,
        closeSignatureModal,
        saveSignature,
        clearSignature,
        clearAllSignatures,
      }}
    >
      {children}
    </SignatureContext.Provider>
  );
}

export function useSignatures(): SignatureContextValue {
  const ctx = useContext(SignatureContext);
  if (!ctx) {
    throw new Error('useSignatures must be used within SignatureProvider');
  }
  return ctx;
}

export function useOptionalSignatures(): SignatureContextValue | null {
  return useContext(SignatureContext) ?? null;
}
