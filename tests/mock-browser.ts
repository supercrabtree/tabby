type Listener = (...args: any[]) => void;

const messageListeners: Listener[] = [];
const sentMessages: any[] = [];
const tabsCalls: { method: string; args: any[] }[] = [];

const port = {
  name: 'sidebar',
  onMessage: {
    addListener(fn: Listener) {
      messageListeners.push(fn);
    },
    removeListener(fn: Listener) {
      const idx = messageListeners.indexOf(fn);
      if (idx >= 0) messageListeners.splice(idx, 1);
    },
    hasListener(fn: Listener) {
      return messageListeners.includes(fn);
    },
  },
  onDisconnect: {
    addListener(_fn: Listener) {},
    removeListener(_fn: Listener) {},
    hasListener(_fn: Listener) {
      return false;
    },
  },
  postMessage(msg: any) {
    sentMessages.push(structuredClone(msg));
  },
};

const browser = {
  runtime: {
    connect(_opts?: any) {
      return port;
    },
  },
  tabs: {
    async update(...args: any[]) {
      tabsCalls.push({ method: 'update', args });
      return {};
    },
    async duplicate(...args: any[]) {
      tabsCalls.push({ method: 'duplicate', args });
      return {};
    },
    async reload(...args: any[]) {
      tabsCalls.push({ method: 'reload', args });
    },
  },
};

(window as any).__tabbyMock = {
  pushState(state: any) {
    for (const listener of messageListeners) {
      listener({ type: 'STATE_UPDATED', state });
    }
  },
  getMessages(): any[] {
    return [...sentMessages];
  },
  clearMessages() {
    sentMessages.length = 0;
  },
  getTabsCalls(): any[] {
    return [...tabsCalls];
  },
  clearAll() {
    sentMessages.length = 0;
    tabsCalls.length = 0;
  },
};

export default browser;
