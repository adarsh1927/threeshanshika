/**
 * A simple UI class to manage the inspector's tooltip element.
 */
export class Tooltip {
    constructor() {
        this.element = document.createElement('div');
        this.element.id = 'threeshanshika-tooltip';
        
        // Apply styles directly via JavaScript. This is cleaner for a small library
        // as it doesn't require users to import a separate CSS file.
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
            pointerEvents: 'none', // Critical: allows mouse events to pass through to the canvas
            whiteSpace: 'pre',     // Preserves newlines in the content
            zIndex: '99999',       // Ensure it's on top of everything
            backdropFilter: 'blur(8px)', // A nice modern glass effect
            '-webkit-backdrop-filter': 'blur(8px)',
        });

        document.body.appendChild(this.element);
    }

    /**
     * Shows the tooltip and updates its content and position.
     * @param {number} pageX The mouse's horizontal position on the page.
     * @param {number} pageY The mouse's vertical position on the page.
     * @param {string} content The text content to display in the tooltip.
     */
    show(pageX, pageY, content) {
        this.element.style.display = 'block';
        this.element.style.left = `${pageX + 15}px`; // Offset slightly from the cursor
        this.element.style.top = `${pageY + 15}px`;
        this.element.textContent = content;
    }

    /**
     * Hides the tooltip from view.
     */
    hide() {
        this.element.style.display = 'none';
    }

    /**
     * Cleans up the tooltip by removing its element from the DOM.
     * Good practice for libraries that might be initialized and destroyed.
     */
    destroy() {
        if (this.element.parentElement) {
            this.element.parentElement.removeChild(this.element);
        }
    }
}