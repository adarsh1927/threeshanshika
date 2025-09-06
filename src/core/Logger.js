// In src/core/Logger.js

const LOG_PREFIX = '[Threeshanshika]';

/**
 * A simple, controllable logger for the inspector.
 * All logs can be enabled or disabled with a single flag.
 */
export const logger = {
    // Set this to `false` to disable all logs from the library.
    enabled: true,

    log(...args) {
        if (this.enabled) {
            console.log(LOG_PREFIX, ...args);
        }
    },

    warn(...args) {
        if (this.enabled) {
            console.warn(LOG_PREFIX, ...args);
        }
    },

    error(...args) {
        if (this.enabled) {
            console.error(LOG_PREFIX, ...args);
        }
    },
    
    // A special method for detailed debug data, which you might want to toggle separately.
    debug(...args) {
        // You could add a separate this.debugEnabled flag if you want.
        // For now, we'll tie it to the main `enabled` flag.
        if (this.enabled) {
            console.log(LOG_PREFIX, 'DEBUG:', ...args);
        }
    }
};