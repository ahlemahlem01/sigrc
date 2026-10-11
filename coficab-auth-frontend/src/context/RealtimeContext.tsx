import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import * as signalR from '@microsoft/signalr';
import { useAuth } from './AuthContext';
import { ACTION_PLAN_ORIGIN } from '../config/apiEnv';

const HUB_URL = `${ACTION_PLAN_ORIGIN}/hubs/notifications`;

export type RealtimeEventName =
  | 'ReceiveNotification'
  | 'ReceiveAlertUpdated'
  | 'ReceiveDossierStatusChanged';

type Listener = (payload: unknown) => void;

interface RealtimeContextValue {
  connected: boolean;
  /** Subscribe to a hub event. Returns an unsubscribe function. */
  subscribe: (event: RealtimeEventName, listener: Listener) => () => void;
}

const RealtimeContext = createContext<RealtimeContextValue | null>(null);

export function RealtimeProvider({ children }: { children: React.ReactNode }) {
  const { accessToken } = useAuth();
  const [connected, setConnected] = useState(false);
  const connectionRef = useRef<signalR.HubConnection | null>(null);
  const listenersRef = useRef<Map<RealtimeEventName, Set<Listener>>>(new Map());

  const dispatch = useCallback((event: RealtimeEventName, payload: unknown) => {
    const set = listenersRef.current.get(event);
    if (!set) return;
    set.forEach((fn) => {
      try {
        fn(payload);
      } catch (err) {
        console.error(`Realtime listener error (${event}):`, err);
      }
    });
  }, []);

  const subscribe = useCallback((event: RealtimeEventName, listener: Listener) => {
    let set = listenersRef.current.get(event);
    if (!set) {
      set = new Set();
      listenersRef.current.set(event, set);
    }
    set.add(listener);
    return () => {
      set?.delete(listener);
    };
  }, []);

  useEffect(() => {
    if (!accessToken) {
      setConnected(false);
      return;
    }

    const connection = new signalR.HubConnectionBuilder()
      .withUrl(HUB_URL, { accessTokenFactory: () => accessToken })
      .withAutomaticReconnect()
      .build();

    const events: RealtimeEventName[] = [
      'ReceiveNotification',
      'ReceiveAlertUpdated',
      'ReceiveDossierStatusChanged',
    ];
    for (const event of events) {
      connection.on(event, (payload: unknown) => dispatch(event, payload));
    }

    connection.onreconnected(() => setConnected(true));
    connection.onclose(() => setConnected(false));
    connection.onreconnecting(() => setConnected(false));

    connection
      .start()
      .then(() => setConnected(true))
      .catch((err) => {
        console.error('SignalR connection error:', err);
        setConnected(false);
      });

    connectionRef.current = connection;

    return () => {
      connection.stop().catch(() => undefined);
      connectionRef.current = null;
      setConnected(false);
    };
  }, [accessToken, dispatch]);

  const value = useMemo(() => ({ connected, subscribe }), [connected, subscribe]);

  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

export function useRealtime() {
  const ctx = useContext(RealtimeContext);
  if (!ctx) {
    throw new Error('useRealtime must be used within RealtimeProvider');
  }
  return ctx;
}

/** Safe variant when provider may be absent (optional pages). */
export function useRealtimeOptional(): RealtimeContextValue | null {
  return useContext(RealtimeContext);
}
