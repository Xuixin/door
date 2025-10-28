(window as any).global = window;
(window as any).process = {
  env: { DEBUG: undefined },
  nextTick: (fn: (...args: any[]) => void, ...args: any[]) =>
    setTimeout(() => fn(...args)),
};

/*
 * Zone JS is required by default for Angular itself.
 */
import "zone.js"; // Included with Angular CLI.
