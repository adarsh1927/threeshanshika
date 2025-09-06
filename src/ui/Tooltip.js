// In src/ui/Tooltip.js

import { logger } from '../core/Logger.js';

/**
 * A simple UI class to manage the inspector's tooltip element.
 */
export class Tooltip {
    constructor() {
        this.element = document.createElement('div');
        this.element.id = 'threeshanshika-tooltip';
        
        Object.assign(this.element.style, {
            position: 'absolute',
            display: 'none',
            padding: '8px 12px',
            backgroundColor: 'rgba(20, 20, 20, 0.85)',
            color: '#f0f0f0',
            borderRadius: '4px',
            fontFamily: 'monospace',
            fontSize: '14px',
            border: '1px solid #444',
            pointerEvents: 'none',
            whiteSpace: 'pre',
            zIndex: '99999',
            backdropFilter: 'blur(8px)',
            '-webkit-backdrop-filter': 'blur(8px)',
        });

        document.body.appendChild(this.element);
    }

    show(pageX, pageY, content) {
        if (this.element.style.display === 'none') {
            logger.debug("Tooltip: Showing");
        }
        this.element.style.display = 'block';
        this.element.style.left = `${pageX + 15}px`;
        this.element.style.top = `${pageY + 15}px`;
        this.element.textContent = content;
    }

    hide() {
        if (this.element.style.display !== 'none') {
            logger.debug("Tooltip: Hiding");
        }
        this.element.style.display = 'none';
    }

    destroy() {
        if (this.element.parentElement) {
            this.element.parentElement.removeChild(this.element);
        }
    }
}