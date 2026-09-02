// @ts-nocheck
const memoryFallback = new Map<string, string>();

export const storage = {
  async get(key: string): Promise<any> {
    try {
      if (typeof window !== 'undefined' && (window as any).storage) {
        const val = await (window as any).storage.get(key);
        return val ? JSON.parse(val) : null;
      }
    } catch (e) {
      console.warn('window.storage error, falling back');
    }
    
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        const val = window.localStorage.getItem(key);
        return val ? JSON.parse(val) : null;
      }
    } catch (e) {
      console.warn('localStorage error, using memory fallback');
    }
    
    const val = memoryFallback.get(key);
    return val ? JSON.parse(val) : null;
  },

  async set(key: string, value: any): Promise<void> {
    const strVal = JSON.stringify(value);
    memoryFallback.set(key, strVal);
    
    try {
      if (typeof window !== 'undefined' && window.localStorage) {
        window.localStorage.setItem(key, strVal);
      }
    } catch (e) {
      console.warn('localStorage set error');
    }

    try {
      if (typeof window !== 'undefined' && (window as any).storage) {
        await (window as any).storage.set(key, strVal);
      }
    } catch (e) {
      console.warn('window.storage error, using memory fallback');
    }
  }
};
