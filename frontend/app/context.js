import { createContext, useContext } from 'react';
// user, live {state, version, lastAt}, houses, house (selected id), setHouse, go(view, arg)
export const AppCtx = createContext(null);
export const useApp = () => useContext(AppCtx);
