import DirectHighlight from './directHighlight';

/**
 * This file provides test functions for trying the DirectHighlight approach
 * without modifying the existing code.
 */

/**
 * Test the direct highlight on any element by selector
 * Run this from the browser console with:
 * 
 * Example: 
 * testDirectHighlightOn('button.primary');
 * testDirectHighlightOn('.sidebar a', 'Click this link');
 */
export function testOnElement(selector: string, text: string = 'Test highlight'): void {
  const element = document.querySelector(selector) as HTMLElement;
  if (element) {
    // Use public method to generate cursor SVG
    const cursorSvg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="32px" height="32px">
      <path fill="#a1d3a2" d="M34 71.613L34 16 73 55.135 56.429 58.428 65.805 81.376 57.282 84.949 47.906 62.001z"/>
      <path fill="#1f212b" d="M57.281,85.949c-0.13,0-0.261-0.025-0.383-0.076c-0.247-0.103-0.442-0.299-0.543-0.546l-8.905-21.796l-12.882,8.904c-0.307,0.213-0.704,0.235-1.033,0.063C33.206,72.326,33,71.985,33,71.613V16c0-0.404,0.244-0.77,0.618-0.924c0.373-0.157,0.804-0.069,1.09,0.218l39,39.135c0.261,0.262,0.356,0.645,0.249,0.997s-0.4,0.618-0.762,0.689l-15.382,3.058l8.917,21.825c0.207,0.508-0.033,1.088-0.539,1.3l-8.523,3.573C57.544,85.923,57.413,85.949,57.281,85.949z M47.906,61.001c0.096,0,0.191,0.014,0.285,0.041c0.291,0.087,0.526,0.3,0.641,0.581l8.994,22.014l6.679-2.8l-9.001-22.03c-0.113-0.276-0.097-0.589,0.045-0.852s0.393-0.449,0.686-0.507l14.74-2.931L35,18.42v51.286l12.337-8.527C47.506,61.062,47.705,61.001,47.906,61.001z"/>
    </svg>`;
    
    DirectHighlight.highlightElement(element, cursorSvg, text);
    console.log(`Applied direct highlight to element: ${selector}`);
  } else {
    console.warn(`Element not found: ${selector}`);
  }
}

/**
 * Test guide for quick visual testing
 */
export function runQuickTestGuide(): void {
  // Find a visible button to highlight
  const button = document.querySelector('button') as HTMLElement;
  if (!button) {
    console.warn('No button found to test on');
    return;
  }
  
  console.log('Starting quick test guide on button:', button);
  
  // Step 1: Highlight the button
  testOnElement('button', 'Step 1: Click this button');
  
  // Set up click handler to move to step 2
  const clickHandler = () => {
    // Clean up current highlight
    DirectHighlight.cleanup();
    
    // Find a different element for step 2
    const link = document.querySelector('a') as HTMLElement;
    if (link) {
      // Wait a moment, then show step 2
      setTimeout(() => {
        testOnElement('a', 'Step 2: Click this link');
      }, 500);
    } else {
      console.log('Test complete - no link found for step 2');
    }
    
    // Remove click handler after it's triggered
    button.removeEventListener('click', clickHandler);
  };
  
  // Add click handler to button
  button.addEventListener('click', clickHandler);
}

// Add global test functions for browser console
(window as any).testDirectHighlightOn = function(selector: string, text: string = 'Test highlight') {
  testOnElement(selector, text);
};

(window as any).runQuickTestGuide = function() {
  runQuickTestGuide();
};

(window as any).cleanupDirectHighlight = function() {
  DirectHighlight.cleanup();
};

// Export DirectHighlight for direct access
export { DirectHighlight }; 