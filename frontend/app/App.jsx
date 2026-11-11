import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { api, getToken, setToken, setUnauthorizedHandler } from '../lib/api';
import { useLive } from '../lib/useLive';
import { useLoad } from '../lib/useLoad';
import { can } from '../lib/roles';
import { ToastProvider, Skeleton } from '../ui/Feedback';
import { AppCtx } from './context';
import { useHouseParam, useRoute } from './route';
import Login from './Login';
import Shell from './Shell';
import Overview from '../views/dashboard/Overview';
import Inventory from '../views/inventory/Inventory';
import Alerts from '../views/alerts/Alerts';
import DataOps from '../views/data/DataOps';
import Simulator from '../views/simulator/Simulator';
import AiModels from '../views/ai/AiModels';

export default function App() {
  const [user, setUser] = useState(null);
  const [checking, setChecking] = useState(!!getToken());
  const [expired, setExpired] = useState(false);
  const signOut = useCallback(() => { setToken(''); setUser(null); }, []);

  useEffect(() => {
    setUnauthorizedHandler(() => { setExpired(true); signOut(); });
    if (getToken()) api('/auth/me').then(setUser).catch(signOut).finally(() => setChecking(false));
  }, [signOut]);

  if (checking) return <div className="boot"><Skeleton rows={2} label="Checking your session" /></div>;
  if (!user) return <Login expired={expired} onSignedIn={u => { setExpired(false); setUser(u); }} />;
  return <ToastProvider><SignedIn user={user} onSignOut={signOut} /></ToastProvider>;
}

function SignedIn({ user, onSignOut }) {
  const [route, go] = useRoute();
  const [house, setHouse] = useHouseParam();
  const live = useLive(true);
  const houses = useLoad(() => api('/houses').then(r => r.items), [live.version]);
  const alertCount = useLoad(() => api('/alerts', { query: { state: 'ACTIVE', pageSize: 1 } }).then(r => r.total), [live.version]);
  const ctx = useMemo(() => ({ user, live, houses: houses.data || [], house, setHouse, go }), [user, live, houses.data, house]); // eslint-disable-line react-hooks/exhaustive-deps
  const views = {
    overview: <Overview />,
    inventory: <Inventory arg={route.arg} />,
    alerts: <Alerts arg={route.arg} />,
    data: <DataOps arg={route.arg} />,
    simulator: can(user, 'simulate') ? <Simulator /> : null,
    ai: can(user, 'aiView') ? <AiModels arg={route.arg} /> : null,
  };
  return (
    <AppCtx.Provider value={ctx}>
      <Shell view={route.view} onSignOut={onSignOut} activeAlerts={alertCount.data}>
        {views[route.view] ?? views.overview}
      </Shell>
    </AppCtx.Provider>
  );
}
