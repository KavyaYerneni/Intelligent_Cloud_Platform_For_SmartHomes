// Mirrors server role checks so the UI only offers actions that can succeed.
// The server remains the security control (System Design 5.5).
export const can = (user, action) => {
  const r = user?.role;
  switch (action) {
    case 'manageInventory': return r === 'operator' || r === 'technician';
    case 'createHouse': return (r === 'operator' || r === 'technician') && !user.houseIds;
    case 'respond': return r === 'operator' || r === 'responder';
    case 'dataOps': return r === 'operator';
    case 'simulate': return r === 'operator' || r === 'technician';
    default: return false;
  }
};
export const ROLE_LABEL = { operator: 'Cloud operator', technician: 'IoT technician', owner: 'House owner', responder: 'Responder' };
