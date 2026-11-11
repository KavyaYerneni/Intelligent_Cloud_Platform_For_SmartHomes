// How an event's source is described everywhere in the UI.
export const sourceLabel = s => ({ simulator: 'Simulator', device: 'Device', model: 'AI model' }[s] || s);
export const sourceDetail = s => ({ simulator: 'Simulated event', device: 'Reported by the device', model: 'Detected by the trained AI model' }[s] || `From ${s}`);
