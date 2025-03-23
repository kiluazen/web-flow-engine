import { ElementUtils } from './elementUtils';

/**
 * DirectHighlight provides an alternative implementation for element highlighting
 * using direct element modification instead of overlay positioning.
 * 
 * This is intended as a test implementation alongside the existing approach.
 */
export class DirectHighlight {
  // Store references to elements we create for cleanup
  private static activeElements: {
    targetElement: HTMLElement | null;
    cursorElement: HTMLElement | null;
    textElement: HTMLElement | null;
    styleElement: HTMLStyleElement | null;
    wrapperElement: HTMLElement | null;
  } = {
    targetElement: null,
    cursorElement: null,
    textElement: null,
    styleElement: null,
    wrapperElement: null
  };

  // Track whether we've added our global CSS
  private static stylesInitialized = false;

  /**
   * Initialize global styles needed for direct highlighting
   */
  private static initializeStyles(): void {
    if (this.stylesInitialized) return;
    
    // Create style element if it doesn't exist
    if (!this.activeElements.styleElement) {
      const style = document.createElement('style');
      style.id = 'hyphen-direct-highlight-styles';
      document.head.appendChild(style);
      this.activeElements.styleElement = style;
    }
    
    // Add CSS for direct highlighting and related elements
    this.activeElements.styleElement.textContent = `
      /* Target element highlighting */
      .hyphen-direct-highlight {
        outline: 2px solid #FF6B00 !important;
        background-color: rgba(255, 107, 0, 0.1) !important;
        position: relative !important;
        z-index: auto !important;
      }
      
      /* Wrapper for cursor and text */
      .hyphen-direct-wrapper {
        position: absolute !important;
        top: 0 !important;
        left: 0 !important;
        width: 100% !important;
        height: 100% !important;
        pointer-events: none !important;
        z-index: 9999 !important;
        /* Debug outline */
        /* outline: 1px dashed blue !important; */
      }
      
      /* Cursor styling */
      .hyphen-direct-cursor {
        position: absolute !important;
        z-index: 10000 !important;
        pointer-events: none !important;
      }
      
      /* Text popup styling */
      .hyphen-direct-text {
        position: absolute !important;
        background-color: #ffffff !important;
        color: #333333 !important;
        padding: 8px 12px !important;
        border-radius: 4px !important;
        box-shadow: 0 2px 8px rgba(0,0,0,0.15) !important;
        font-size: 14px !important;
        max-width: 300px !important;
        z-index: 10001 !important;
        pointer-events: none !important;
        word-wrap: break-word !important;
      }
    `;
    
    this.stylesInitialized = true;
    console.log('[DIRECT-HIGHLIGHT] Global styles initialized');
  }

  /**
   * Main method to highlight an element directly and show guidance UI
   */
  static highlightElement(
    element: HTMLElement,
    cursorSvg: string, 
    text: string, 
    theme?: any
  ): void {
    // Step 1: First clean up any existing highlight
    this.cleanup();
    
    if (!element) {
      console.warn('[DIRECT-HIGHLIGHT] No element provided to highlight');
      return;
    }
    
    // Log initial state
    console.log('[DIRECT-HIGHLIGHT] Highlighting element:', {
      tag: element.tagName,
      id: element.id,
      classes: element.className,
      rect: element.getBoundingClientRect(),
      computed: {
        position: window.getComputedStyle(element).position,
        display: window.getComputedStyle(element).display,
        visibility: window.getComputedStyle(element).visibility,
        opacity: window.getComputedStyle(element).opacity
      }
    });
    
    // Step 2: Initialize styles if needed
    this.initializeStyles();
    
    // Step 3: Save reference to target element
    this.activeElements.targetElement = element;
    
    // Step 4: Apply direct highlight to element
    element.classList.add('hyphen-direct-highlight');
    
    // Step 5: Ensure the element has a suitable position context for absolute positioning
    const computedStyle = window.getComputedStyle(element);
    if (computedStyle.position === 'static') {
      // Position needs to be non-static for absolute positioning of children
      element.style.setProperty('position', 'relative', 'important');
    }
    
    // Step 6: Create wrapper element
    const wrapper = document.createElement('div');
    wrapper.className = 'hyphen-direct-wrapper';
    this.activeElements.wrapperElement = wrapper;
    
    // Step 7: Create and position cursor
    const cursor = document.createElement('div');
    cursor.className = 'hyphen-direct-cursor';
    cursor.innerHTML = cursorSvg || this.getDefaultCursorSvg(theme?.cursorColor || '#a1d3a2');
    
    // Position cursor at bottom right
    cursor.style.bottom = '-24px';
    cursor.style.right = '-24px';
    
    this.activeElements.cursorElement = cursor;
    wrapper.appendChild(cursor);
    
    // Step 8: Create and position text popup
    const textElement = document.createElement('div');
    textElement.className = 'hyphen-direct-text';
    textElement.textContent = text || '';
    
    // Position text next to cursor
    textElement.style.left = 'calc(100% + 16px)';
    textElement.style.bottom = '-8px';
    
    this.activeElements.textElement = textElement;
    wrapper.appendChild(textElement);
    
    // Step 9: Append wrapper to element
    element.appendChild(wrapper);
    
    // Step 10: Check for text overflow and reposition if needed
    setTimeout(() => {
      this.handleTextOverflow(textElement);
    }, 0);
    
    console.log('[DIRECT-HIGHLIGHT] Element highlighted with direct approach');
  }

  /**
   * Adjust text popup position if it goes off screen
   */
  private static handleTextOverflow(textElement: HTMLElement): void {
    if (!textElement) return;
    
    const textRect = textElement.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    // Check for horizontal overflow
    if (textRect.right > viewportWidth) {
      textElement.style.left = 'auto';
      textElement.style.right = 'calc(100% + 16px)';
    }
    
    // Check for vertical overflow
    if (textRect.bottom > viewportHeight) {
      textElement.style.bottom = 'auto';
      textElement.style.top = '0';
    }
  }

  /**
   * Clean up all elements created by the direct highlight approach
   */
  static cleanup(): void {
    console.log('[DIRECT-HIGHLIGHT] Cleaning up highlight elements');
    
    // Remove highlight class from target element
    if (this.activeElements.targetElement) {
      this.activeElements.targetElement.classList.remove('hyphen-direct-highlight');
      
      // Reset position if we changed it
      const originalPosition = this.activeElements.targetElement.getAttribute('data-original-position');
      if (originalPosition) {
        this.activeElements.targetElement.style.position = originalPosition;
        this.activeElements.targetElement.removeAttribute('data-original-position');
      }
      
      // Remove wrapper if it's still a child of the target
      if (this.activeElements.wrapperElement && 
          this.activeElements.targetElement.contains(this.activeElements.wrapperElement)) {
        this.activeElements.targetElement.removeChild(this.activeElements.wrapperElement);
      }
    }
    
    // Reset all references
    this.activeElements.targetElement = null;
    this.activeElements.cursorElement = null;
    this.activeElements.textElement = null;
    this.activeElements.wrapperElement = null;
    
    // Leave style element in place, just remove references
  }

  /**
   * Default cursor SVG if none provided
   */
  private static getDefaultCursorSvg(color: string = '#a1d3a2'): string {
    return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="32px" height="32px">
      <path fill="${color}" d="M34 71.613L34 16 73 55.135 56.429 58.428 65.805 81.376 57.282 84.949 47.906 62.001z"/>
      <path fill="#1f212b" d="M57.281,85.949c-0.13,0-0.261-0.025-0.383-0.076c-0.247-0.103-0.442-0.299-0.543-0.546l-8.905-21.796l-12.882,8.904c-0.307,0.213-0.704,0.235-1.033,0.063C33.206,72.326,33,71.985,33,71.613V16c0-0.404,0.244-0.77,0.618-0.924c0.373-0.157,0.804-0.069,1.09,0.218l39,39.135c0.261,0.262,0.356,0.645,0.249,0.997s-0.4,0.618-0.762,0.689l-15.382,3.058l8.917,21.825c0.207,0.508-0.033,1.088-0.539,1.3l-8.523,3.573C57.544,85.923,57.413,85.949,57.281,85.949z M47.906,61.001c0.096,0,0.191,0.014,0.285,0.041c0.291,0.087,0.526,0.3,0.641,0.581l8.994,22.014l6.679-2.8l-9.001-22.03c-0.113-0.276-0.097-0.589,0.045-0.852s0.393-0.449,0.686-0.507l14.74-2.931L35,18.42v51.286l12.337-8.527C47.506,61.062,47.705,61.001,47.906,61.001z"/>
    </svg>`;
  }
  
  /**
   * Test function to be called from the browser console for quick testing
   */
  static testHighlight(): void {
    // Find a visible button or link to test on
    const testElement = document.querySelector('button, a') as HTMLElement;
    if (testElement) {
      this.highlightElement(testElement, this.getDefaultCursorSvg(), 'This is a test highlight!');
      console.log('Test highlight applied to:', testElement);
    } else {
      console.warn('No suitable test element found');
    }
  }
  
  /**
   * Compatible interface with existing CursorFlow.showVisualElements
   * This can serve as a drop-in replacement for testing
   */
  static async showVisualElements(
    targetElement: HTMLElement, 
    interaction: any,
    cursorElement?: HTMLElement,
    annotationText?: string
  ): Promise<void> {
    // First check if element is in view and scroll to it if needed
    if (!ElementUtils.isElementInView(targetElement)) {
      console.log('[DIRECT-HIGHLIGHT] Target element is not in view, scrolling to it');
      await ElementUtils.scrollToElement(targetElement);
    }
    
    // Get the text from annotation or interaction
    const text = annotationText || interaction.text || 'Click here';
    
    // If cursor element is provided, extract its SVG content
    let cursorSvg = this.getDefaultCursorSvg();
    if (cursorElement) {
      cursorSvg = cursorElement.innerHTML;
    }
    
    // Apply the direct highlight
    this.highlightElement(targetElement, cursorSvg, text);
    
    return Promise.resolve();
  }
}

// Add a global function for testing from browser console
(window as any).testDirectHighlight = function() {
  DirectHighlight.testHighlight();
};

// Export the class for use in other modules
export default DirectHighlight; 