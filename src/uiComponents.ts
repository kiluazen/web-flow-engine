import { ElementUtils } from './elementUtils';
// import arrowheadSvg from '../assets/arrowhead.svg';
import crazeArrow from '../assets/arrowhead.svg';
import hyphenboxSvg from '../assets/hyphenbox.svg';
import crazehqSvg from '../assets/crazehq.svg';

console.log('[SVG-DEBUG] Loaded hyphenbox SVG:', hyphenboxSvg.substring(0, 100) + '...');

interface EnhancedHTMLElement extends HTMLElement {
  [key: string]: any; // Allow any string property
}

export interface ThemeOptions {
  cursorColor?: string;
  highlightColor?: string;
  highlightBorderColor?: string;
  buttonColor?: string;
  companyName?: string;
}

export interface NotificationOptions {
  title?: string;
  message: string;
  type: 'info' | 'warning' | 'success' | 'error';
  autoClose?: number;
  buttons?: Array<{
    text: string;
    onClick: () => void;
    primary?: boolean;
  }>;
}

export interface ErrorNotificationOptions extends NotificationOptions {
  onRetry?: () => void;
  onSkip?: () => void;
  onStop?: () => void;
}

export interface RedirectNotificationOptions extends NotificationOptions {
  redirectUrl: string;
  redirectText?: string;
}

export class CursorFlowUI {
  // Add these class variables to track scroll handlers
  private static cursorScrollHandler: EventListener | null = null;
  private static highlightScrollHandler: EventListener | null = null;

  static createStartButton(text: string, color: string, onClick: () => void): HTMLElement {
    console.log('[BUTTON-DEBUG] Creating start button with text:', text);
    const button = document.createElement('button');
    button.className = 'hyphen-start-button';
    
    // Create modern layout with cursor icon using the crazehq SVG
    console.log('[BUTTON-DEBUG] Using crazehq SVG:', crazehqSvg.substring(0, 50) + '...');
    button.innerHTML = `
        <div class="hyphen-button-content" style="display: flex; align-items: center; gap: 8px;">
            <div class="hyphen-icon" style="display: flex; align-items: center;">
                ${crazehqSvg}
            </div>
            <span class="hyphen-text" style="white-space: nowrap;">${text}</span>
        </div>
    `;
    
    // Adjust the SVG size in the button
    const svg = button.querySelector('svg');
    if (svg) {
        console.log('[BUTTON-DEBUG] Adjusting SVG size');
        svg.style.width = '24px';
        svg.style.height = '24px';
        svg.style.minWidth = '24px';
        svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
        svg.setAttribute('viewBox', '0 0 120 120');
    } else {
        console.warn('[BUTTON-DEBUG] SVG element not found in button');
    }
    
    // Modern styling with adjusted padding for icon
    button.style.cssText = `
        position: fixed;
        bottom: 20px;
        left: 20px;
        padding: 10px 16px;
        background-color: #ffffff;
        color: #1a1a1a;
        border: none;
        border-radius: 12px;
        font-size: 14px;
        font-weight: 500;
        cursor: pointer;
        box-shadow: 0 2px 12px rgba(0,0,0,0.1);
        z-index: 9999;
        display: flex;
        align-items: center;
        transition: all 0.2s ease;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        min-height: 40px;
    `;

    // Add hover effect
    button.addEventListener('mouseover', () => {
        button.style.transform = 'translateY(-2px)';
        button.style.boxShadow = '0 4px 16px rgba(0,0,0,0.12)';
    });
    
    button.addEventListener('mouseout', () => {
        button.style.transform = 'translateY(0)';
        button.style.boxShadow = '0 2px 12px rgba(0,0,0,0.1)';
    });

    // Add click handler
    button.addEventListener('click', (e) => {
        e.preventDefault();
        e.stopPropagation();
        if (typeof onClick === 'function') {
            onClick();
        }
    });

    // Make draggable
    this.makeDraggable(button);
    
    return button;
  }
  
  /**
   * Make an element draggable
   */
  private static makeDraggable(element: HTMLElement): void {
    let isDragging = false;
    let offsetX = 0;
    let offsetY = 0;
    let startPosition = { x: 0, y: 0 };
    
    // Add a drag handle/indicator
    const dragIndicator = document.createElement('div');
    dragIndicator.style.position = 'absolute';
    dragIndicator.style.top = '3px';
    dragIndicator.style.left = '3px';
    dragIndicator.style.width = '10px';
    dragIndicator.style.height = '10px';
    dragIndicator.style.borderRadius = '50%';
    dragIndicator.style.backgroundColor = 'rgba(255, 255, 255, 0.4)';
    dragIndicator.style.cursor = 'move';
    dragIndicator.title = 'Drag to move';
    
    // Append the drag indicator to the element
    element.appendChild(dragIndicator);
    
    // Add a CSS class to show we're in dragging mode
    element.classList.add('hyphen-draggable');
    
    // Define event handlers (keep references to remove them later)
    const handleMouseMove = (e: MouseEvent) => {
      if (!isDragging) return;
      
      // Calculate new position
      const x = e.clientX - offsetX;
      const y = e.clientY - offsetY;
      
      // Use the viewport dimensions to ensure the button stays within visible area
      const viewportWidth = window.innerWidth;
      const viewportHeight = window.innerHeight;
      const buttonWidth = element.offsetWidth;
      const buttonHeight = element.offsetHeight;
      
      // Calculate the bounds (keep button within viewport)
      const minX = 0;
      const maxX = viewportWidth - buttonWidth;
      const minY = 0;
      const maxY = viewportHeight - buttonHeight;
      
      // Apply bounds
      const boundedX = Math.max(minX, Math.min(maxX, x));
      const boundedY = Math.max(minY, Math.min(maxY, y));
      
      // Update the position
      // We need to decide whether to use left/right and top/bottom
      // For simplicity, use left/top positioning
      element.style.left = `${boundedX}px`;
      element.style.top = `${boundedY}px`;
      
      // Remove the original right/bottom positioning
      element.style.removeProperty('right');
      element.style.removeProperty('bottom');
    };
    
    const handleMouseUp = () => {
      if (!isDragging) return;
      
      // Stop dragging
      isDragging = false;
      
      // Reset visual styles
      element.style.opacity = '1';
      element.style.transition = 'opacity 0.2s ease';
      
      // Save the position for future sessions
      try {
        const rect = element.getBoundingClientRect();
        const position = {
          left: `${rect.left}px`,
          top: `${rect.top}px`
        };
        localStorage.setItem('hyphen-button-position', JSON.stringify(position));
      } catch (e) {
        console.warn('Failed to save button position', e);
      }
      
      // Remove global event listeners
      document.removeEventListener('mousemove', handleMouseMove);
      document.removeEventListener('mouseup', handleMouseUp);
    };
    
    // Mouse down event - start dragging
    dragIndicator.addEventListener('mousedown', (e) => {
      isDragging = true;
      
      // Get element's current position
      const rect = element.getBoundingClientRect();
      
      // Calculate cursor offset relative to the element
      offsetX = e.clientX - rect.left;
      offsetY = e.clientY - rect.top;
      
      // Record original positions to compute deltas
      startPosition = {
        x: e.clientX,
        y: e.clientY
      };
      
      // Add visual indicator that we're dragging
      element.style.opacity = '0.8';
      element.style.transition = 'none';
      
      // Add global event listeners
      document.addEventListener('mousemove', handleMouseMove);
      document.addEventListener('mouseup', handleMouseUp);
      
      // Prevent text selection during drag
      e.preventDefault();
    });
    
    // Store these functions so they can be removed when the element is destroyed
    (element as any)._hyphenDragHandlers = {
      mouseMove: handleMouseMove,
      mouseUp: handleMouseUp
    };
  }

  // Helper function to adjust color brightness
  static adjustColor(color: string, amount: number): string {
    const colorObj = new (window as any).Option().style;
    colorObj.color = color;
    
    if (!colorObj.color) return color;
    
    // Convert to hex if not already
    let hex = colorObj.color;
    if (hex.startsWith('rgb')) {
      const rgb = hex.match(/\d+/g)?.map(Number);
      if (!rgb) return color;
      hex = '#' + rgb.map((c: number) => {
        const newC = Math.max(0, Math.min(255, c + amount));
        return newC.toString(16).padStart(2, '0');
      }).join('');
    }
    
    return hex;
  }

  static createGuidesButton(text: string, color: string, onClick: () => void): HTMLElement {
    // For simplicity, reuse the createStartButton method
    return this.createStartButton(text, color, onClick);
  }

  static showGuidesDropdown(guides: any[], guideButton: HTMLElement, onSelect: (guideData: any) => void): HTMLElement {
    const dropdown = document.createElement('div');
    dropdown.className = 'hyphen-dropdown';
    
    // Modern styling for dropdown
    dropdown.style.cssText = `
        position: fixed;
        bottom: 80px;
        left: 20px;
        width: 320px;
        max-height: 400px;
        background-color: #ffffff;
        border-radius: 16px;
        box-shadow: 0 4px 24px rgba(0,0,0,0.12);
        z-index: 10000;
        overflow: hidden;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        display: flex;
        flex-direction: column;
    `;
    
    // Add header with modern design
    const header = document.createElement('div');
    header.style.cssText = `
        padding: 20px;
        font-weight: 600;
        font-size: 16px;
        color: #1a1a1a;
        border-bottom: 1px solid #f0f0f0;
    `;
    header.textContent = 'What can I show you?';
    dropdown.appendChild(header);
    
    // Create scrollable content area
    const content = document.createElement('div');
    content.style.cssText = `
        max-height: 320px;
        overflow-y: auto;
        padding: 8px 0;
        flex: 1;
    `;
    
    if (!guides || guides.length === 0) {
        const noGuides = document.createElement('div');
        noGuides.style.cssText = `
            padding: 16px 20px;
            color: #666;
            font-style: italic;
            font-size: 14px;
        `;
        noGuides.textContent = 'No guides available';
        content.appendChild(noGuides);
    } else {
        guides.forEach(guide => {
            const item = document.createElement('div');
            item.className = 'hyphen-dropdown-item';
            
            // Modern list item styling
            item.style.cssText = `
                padding: 12px 20px;
                cursor: pointer;
                transition: all 0.2s ease;
                color: #1a1a1a;
                font-size: 14px;
                display: flex;
                align-items: center;
                gap: 12px;
            `;
            
            // Add guide icon
            item.innerHTML = `
                <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                    <path d="M12 5l7 7-7 7"></path>
                    <path d="M5 12h14"></path>
                </svg>
                <span>${guide.name}</span>
            `;
            
            item.addEventListener('mouseover', () => {
                item.style.backgroundColor = '#f8f8f8';
            });
            
            item.addEventListener('mouseout', () => {
                item.style.backgroundColor = '';
            });
            
            item.addEventListener('click', (event) => {
                event.stopPropagation();
                onSelect(guide);
                if (document.body.contains(dropdown)) {
                    document.body.removeChild(dropdown);
                }
            });
            
            content.appendChild(item);
        });
    }
    
    dropdown.appendChild(content);

    // Add footer with "powered by" and logo
    console.log('[FOOTER-DEBUG] Creating footer with hyphenbox SVG');
    const footer = document.createElement('div');
    footer.style.cssText = `
        padding: 12px 20px;
        border-top: 1px solid #f0f0f0;
        display: flex;
        align-items: center;
        justify-content: center;
        gap: 4px;
        color: #666;
        font-size: 12px;
        background: #fafafa;
        line-height: 1;
    `;
    
    // First create the elements separately
    const poweredByText = document.createElement('span');
    poweredByText.textContent = 'powered by';
    poweredByText.style.cssText = `
        opacity: 0.7;
        display: flex;
        align-items: center;
        height: 18px;
    `;
    
    const logoContainer = document.createElement('div');
    logoContainer.style.cssText = `
        display: flex;
        align-items: center;
        justify-content: center;
        height: 18px;
        width: 55px;
        position: relative;
        transform: translateY(1px);
    `;
    
    // Set the SVG directly
    logoContainer.innerHTML = hyphenboxSvg;
    
    // Add elements to footer
    footer.appendChild(poweredByText);
    footer.appendChild(logoContainer);
    
    // Adjust the SVG
    const svg = logoContainer.querySelector('svg');
    if (svg) {
        console.log('[FOOTER-DEBUG] Adjusting SVG properties');
        svg.style.cssText = `
            width: 100%;
            height: 100%;
            opacity: 0.7;
            display: block;
        `;
        svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
        svg.setAttribute('viewBox', '0 0 3163 849');
    } else {
        console.warn('[FOOTER-DEBUG] SVG element not found in container');
    }

    dropdown.appendChild(footer);
    document.body.appendChild(dropdown);

    // Add smooth entrance animation
    dropdown.animate([
        { opacity: 0, transform: 'translateY(10px)' },
        { opacity: 1, transform: 'translateY(0)' }
    ], {
        duration: 200,
        easing: 'ease-out'
    });
    
    // Handle outside clicks
    const handleOutsideClick = (event: MouseEvent) => {
        const target = event.target as Node;
        if (!dropdown.contains(target) && target !== guideButton) {
            dropdown.animate([
                { opacity: 1, transform: 'translateY(0)' },
                { opacity: 0, transform: 'translateY(10px)' }
            ], {
                duration: 200,
                easing: 'ease-in'
            }).onfinish = () => {
                if (document.body.contains(dropdown)) {
                    document.body.removeChild(dropdown);
                }
            };
            document.removeEventListener('click', handleOutsideClick);
        }
    };
    
    setTimeout(() => {
        document.addEventListener('click', handleOutsideClick);
    }, 0);
    
    return dropdown;
  }

  static createCursor(theme: ThemeOptions): HTMLElement {
    const cursorWrapper = document.createElement('div');
    cursorWrapper.className = 'hyphen-cursor-container';
    cursorWrapper.style.cssText = `
        position: absolute;
        display: inline-flex;
        align-items: center;
        pointer-events: none;
        z-index: 9999;
        transform-origin: top left;
    `;

    // Create the cursor element
    const cursor = document.createElement('div');
    cursor.className = 'hyphen-cursor';
    cursor.innerHTML = crazeArrow;
    cursor.style.cssText = `
        position: relative;
        pointer-events: none;
        display: flex;
        align-items: center;
        transform: translate(-1px, -1px);
    `;

    // Create the company label
    const companyLabel = document.createElement('div');
    companyLabel.className = 'hyphen-company-label';
    companyLabel.textContent = theme.companyName || 'Craze';
    const cursorColor = theme.cursorColor || '#FF6B00';
    companyLabel.style.cssText = `
        background-color: ${cursorColor};
        color: white;
        padding: 4px 8px;
        border-radius: 6px;
        font-size: 12px;
        font-weight: 500;
        margin-left: -2px;
        white-space: nowrap;
        font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
        box-shadow: 0 2px 4px rgba(0,0,0,0.1);
        transform: translateY(2px);
    `;

    // Apply theme color to cursor if provided
    if (theme?.cursorColor) {
        const paths = cursor.querySelectorAll('path');
        paths.forEach(path => {
            if (path.getAttribute('fill') === '#FF6B00') {
                path.setAttribute('fill', cursorColor);
            }
        });
    }

    // Add cursor and label to wrapper
    cursorWrapper.appendChild(cursor);
    cursorWrapper.appendChild(companyLabel);

    return cursorWrapper;
  }

  static createHighlight(theme: ThemeOptions): HTMLElement {
    const highlight = document.createElement('div');
    highlight.className = 'hyphen-highlight';
    highlight.id = 'hyphenbox-highlight';
    
    // Set styles for the highlight
    highlight.style.position = 'absolute';
    highlight.style.top = '0';
    highlight.style.left = '0';
    highlight.style.width = 'calc(100% + 6px)';
    highlight.style.height = 'calc(100% + 6px)';
    highlight.style.transform = 'translate(-3px, -3px)';
    highlight.style.pointerEvents = 'none';
    highlight.style.zIndex = '9995';
    highlight.style.border = `2px solid ${(theme?.highlightBorderColor) || '#FF6B00'}`;
    highlight.style.backgroundColor = (theme?.highlightColor) || 'rgba(255, 107, 0, 0.1)';
    highlight.style.borderRadius = '3px';
    highlight.style.boxSizing = 'border-box';
    
    return highlight;
  }

  static createTextPopup(text: string, theme: ThemeOptions): HTMLElement {
    const popup = document.createElement('div');
    popup.className = 'hyphen-text-popup';
    popup.id = 'hyphenbox-text-popup';  // Updated ID
    popup.textContent = text;
    
    // Basic styling
    popup.style.position = 'fixed';
    popup.style.zIndex = '9998';
    popup.style.backgroundColor = '#ffffff';
    popup.style.border = '1px solid #e0e0e0';
    popup.style.boxShadow = '0 2px 5px rgba(0,0,0,0.1)';
    popup.style.borderRadius = '4px';
    popup.style.padding = '8px 12px';
    popup.style.fontSize = '14px';
    popup.style.lineHeight = '1.4';
    popup.style.color = '#333333';
    popup.style.minWidth = '150px';      // Minimum width to prevent too narrow wrapping
    popup.style.maxWidth = '300px';      // Maximum width for very long content
    popup.style.width = 'max-content';   // Let content determine width up to maxWidth
    popup.style.whiteSpace = 'normal';   // Allow wrapping
    popup.style.wordWrap = 'break-word'; // Break long words if needed
    popup.style.wordBreak = 'normal';    // Use normal word breaking rules
    
    return popup;
  }

  static moveCursorToElement(element: HTMLElement, cursor: HTMLElement | null, interaction: any): void {
    if (!cursor) return;
    
    // Get or create cursor wrapper
    let wrapper = document.getElementById('hyphenbox-cursor-wrapper') as EnhancedHTMLElement;
    
    if (!wrapper) {
        // Create new wrapper only if it doesn't exist
        wrapper = document.createElement('div') as EnhancedHTMLElement;
        wrapper.className = 'hyphen-cursor-wrapper';
        wrapper.id = 'hyphenbox-cursor-wrapper';
        wrapper.style.position = 'absolute';
        wrapper.style.pointerEvents = 'none';
        wrapper.style.zIndex = '9999';
        wrapper.style.top = '0';
        wrapper.style.left = '0';
        wrapper.appendChild(cursor);
        document.body.appendChild(wrapper);
    }

    // IMPORTANT: Clean up previous observers and handlers before setting up new ones
    if (wrapper['observer']) {
        wrapper['observer'].disconnect();
        wrapper['observer'] = null;
    }
    if (wrapper['scrollHandler']) {
        window.removeEventListener('scroll', wrapper['scrollHandler']);
        window.removeEventListener('resize', wrapper['scrollHandler']);
        wrapper['scrollHandler'] = null;
    }
    if (wrapper['resizeHandler']) {
        window.removeEventListener('resize', wrapper['resizeHandler']);
        wrapper['resizeHandler'] = null;
    }
    
    // Store current target element reference
    wrapper['currentElement'] = element;
    
    // Add smooth transition for cursor movement
    cursor.style.transition = 'all 0.5s ease';
    cursor.style.position = 'absolute';
    
    // Position cursor at bottom right of element
    cursor.style.right = 'auto';
    cursor.style.bottom = 'auto';
    cursor.style.left = '100%';
    cursor.style.top = '100%';
    cursor.style.transform = 'translate(-8px, -8px)';
    
    // Log cursor position for debugging
    console.log('[CURSOR-DEBUG] Moving cursor to element:', {
        element: element.outerHTML.substring(0, 100),
        currentPosition: wrapper.style.transform,
        timestamp: new Date().getTime()
    });
    
    // Function to update the wrapper position with smooth animation
    const updatePosition = () => {
        // Only update position if this is still the current target element
        if (wrapper['currentElement'] !== element) {
            console.log('[CURSOR-DEBUG] Skipping position update - element is no longer current target');
            return;
        }

        const rect = element.getBoundingClientRect();
        const scrollX = window.scrollX || window.pageXOffset;
        const scrollY = window.scrollY || window.pageYOffset;
        
        // Add transition to wrapper for smooth sliding
        wrapper.style.transition = 'transform 0.5s ease';
        wrapper.style.transform = `translate(${rect.left + scrollX}px, ${rect.top + scrollY}px)`;
        wrapper.style.width = `${rect.width}px`;
        wrapper.style.height = `${rect.height}px`;

        console.log('[CURSOR-DEBUG] Updated position for element:', {
            element: element.outerHTML.substring(0, 100),
            newPosition: wrapper.style.transform,
            timestamp: new Date().getTime()
        });
    };
    
    // Create a MutationObserver with debouncing to prevent rapid updates
    let debounceTimeout: any;
    const observer = new MutationObserver(() => {
        if (debounceTimeout) {
            clearTimeout(debounceTimeout);
        }
        debounceTimeout = setTimeout(() => {
            if (wrapper['currentElement'] === element) {
                updatePosition();
            }
        }, 100);
    });
    
    // Watch for changes to the element's attributes and children
    observer.observe(element, {
        attributes: true,
        childList: true,
        subtree: true
    });
    
    // Store the observer on the wrapper for later cleanup
    wrapper['observer'] = observer;
    
    // Update position immediately and then after a short delay to ensure rendering
    updatePosition();
    setTimeout(updatePosition, 100);
    
    // Create handlers for scroll and resize events with debouncing
    let scrollTimeout: any;
    const scrollHandler = () => {
        if (scrollTimeout) {
            clearTimeout(scrollTimeout);
        }
        scrollTimeout = setTimeout(() => {
            if (wrapper['currentElement'] === element) {
                updatePosition();
            }
        }, 100);
    };

    let resizeTimeout: any;
    const resizeHandler = () => {
        if (resizeTimeout) {
            clearTimeout(resizeTimeout);
        }
        resizeTimeout = setTimeout(() => {
            if (wrapper['currentElement'] === element) {
                updatePosition();
            }
        }, 100);
    };
    
    // Add event listeners
    window.addEventListener('scroll', scrollHandler, { passive: true });
    window.addEventListener('resize', resizeHandler, { passive: true });
    
    // Store the handlers on the wrapper for later cleanup
    wrapper['scrollHandler'] = scrollHandler;
    wrapper['resizeHandler'] = resizeHandler;
  }
  
  static positionTextPopupNearCursor(cursor: HTMLElement, popup: HTMLElement): void {
    if (!cursor || !popup) return;
    
    console.log('[TEXT-DEBUG] Positioning text popup near cursor');
    
    // Get the cursor wrapper
    const wrapper = document.getElementById('hyphenbox-cursor-wrapper');
    if (!wrapper) {
      console.error('[TEXT-DEBUG] Cursor wrapper not found');
      return;
    }
    
    // Clean up any existing text popup before adding the new one
    const existingPopup = document.getElementById('hyphenbox-text-popup');
    if (existingPopup && existingPopup.parentNode) {
      existingPopup.parentNode.removeChild(existingPopup);
    }
    
    // Add popup to the wrapper for relative positioning
    wrapper.appendChild(popup);
    
    // The cursor parameter is already the container with class 'hyphen-cursor-container'
    const cursorContainer = cursor.classList.contains('hyphen-cursor-container') ? 
      cursor : cursor.querySelector('.hyphen-cursor-container');

    if (!cursorContainer) {
      console.error('[TEXT-DEBUG] Cursor container not found');
      return;
    }
    
    // Store original text for streaming effect
    const originalText = popup.textContent || '';
    popup.textContent = '';
    
    // Get dimensions
    const containerRect = cursorContainer.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    // Style the popup - start with transparent until positioned
    popup.style.cssText = `
        position: absolute;
        z-index: 9998;
        background-color: #ffffff;
        border: 1px solid #e0e0e0;
        box-shadow: 0 2px 5px rgba(0,0,0,0.1);
        border-radius: 4px;
        padding: 8px 12px;
        min-width: 150px;
        max-width: 300px;
        width: max-content;
        white-space: normal;
        word-wrap: break-word;
        word-break: normal;
        opacity: 0;
        transition: opacity 0.3s ease;
        font-size: 14px;
        line-height: 1.4;
        color: #333333;
    `;
    
    // Position function that handles all four possible positions
    const positionPopup = () => {
      const popupRect = popup.getBoundingClientRect();
      const containerRect = cursorContainer.getBoundingClientRect();
      const wrapperRect = wrapper.getBoundingClientRect();
      
      // Calculate position relative to the wrapper
      const containerTop = containerRect.top - wrapperRect.top;
      const containerLeft = containerRect.left - wrapperRect.left;
      const containerRight = containerLeft + containerRect.width;
      const containerBottom = containerTop + containerRect.height;
      
      // Calculate available space in each direction
      const spaceRight = viewportWidth - (wrapperRect.left + containerRight);
      const spaceBelow = viewportHeight - (wrapperRect.top + containerBottom);
      
      // Default position: bottom-right with padding
      popup.style.left = `${containerRight}px`;
      popup.style.top = `${containerBottom}px`;
      popup.style.transform = 'translate(-1px, -1px)';
      
      // If not enough space, adjust position
      if (spaceRight < popup.offsetWidth) {
        // Not enough space right, position to left
        popup.style.left = `${containerLeft}px`;
        popup.style.transform = 'translate(-100%, 4px)';
        popup.style.marginLeft = '-4px';
      }

      if (spaceBelow < popup.offsetHeight) {
        // Not enough space below, position above
        popup.style.top = `${containerTop}px`;
        popup.style.transform = `translate(${spaceRight < popup.offsetWidth ? '-100%' : '4px'}, -100%)`;
        popup.style.marginTop = '-4px';
      }
    };
    
    // Initial positioning
    setTimeout(positionPopup, 0);
    
    // Streaming text effect
    let charIndex = 0;
    const textLength = originalText.length;
    
    const streamText = () => {
      if (charIndex < textLength) {
        popup.textContent = originalText.substring(0, charIndex + 1);
        charIndex++;
        setTimeout(streamText, 30);
        
        // Recheck position periodically as text streams in
        if (charIndex === Math.floor(textLength * 0.25) || 
            charIndex === Math.floor(textLength * 0.5) || 
            charIndex === Math.floor(textLength * 0.75)) {
          positionPopup();
        }
      }
    };
    
    // Start the sequence after a short delay to ensure positioning
    setTimeout(() => {
      popup.style.opacity = '1';
      streamText();
    }, 500);
  }

  static showNotification(options: NotificationOptions): HTMLElement {
    const notification = document.createElement('div');
    notification.className = 'hyphen-notification';
    
    // Set basic styles
    notification.style.position = 'fixed';
    notification.style.zIndex = '10001';
    notification.style.padding = '12px 16px';
    notification.style.borderRadius = '4px';
    notification.style.boxShadow = '0 2px 10px rgba(0,0,0,0.2)';
    notification.style.fontSize = '14px';
    notification.style.transition = 'all 0.3s ease';
    notification.style.maxWidth = '300px';
    notification.style.display = 'flex';  // Add flex display
    notification.style.flexDirection = 'column';  // Stack children vertically
    
    // Create header with close button
    const header = document.createElement('div');
    header.style.display = 'flex';
    header.style.justifyContent = 'space-between';
    header.style.alignItems = 'flex-start';
    header.style.width = '100%';
    header.style.marginBottom = options.title ? '0' : '4px';
    
    // Add title if provided
    if (options.title) {
        const title = document.createElement('div');
        title.style.fontWeight = 'bold';
        title.style.marginBottom = '4px';
        title.style.flex = '1';
        title.textContent = options.title;
        header.appendChild(title);
    }
    
    // Add close button
    const closeButton = document.createElement('button');
    closeButton.innerHTML = '✕';
    closeButton.style.background = 'none';
    closeButton.style.border = 'none';
    closeButton.style.color = options.type === 'warning' ? '#333333' : '#ffffff';
    closeButton.style.cursor = 'pointer';
    closeButton.style.padding = '0 0 0 8px';
    closeButton.style.fontSize = '14px';
    closeButton.style.opacity = '0.7';
    closeButton.style.marginLeft = '8px';
    closeButton.addEventListener('mouseover', () => closeButton.style.opacity = '1');
    closeButton.addEventListener('mouseout', () => closeButton.style.opacity = '0.7');
    closeButton.addEventListener('click', () => {
        if (notification.parentNode) {
            notification.style.opacity = '0';
            setTimeout(() => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
            }, 300);
        }
    });
    header.appendChild(closeButton);
    
    notification.appendChild(header);
    
    // Add message
    const message = document.createElement('div');
    message.textContent = options.message;
    message.style.flex = '1';
    notification.appendChild(message);
    
    // Adjust style based on notification type
    switch (options.type) {
        case 'success':
            notification.style.backgroundColor = '#4CAF50';
            notification.style.color = '#ffffff';
            break;
        case 'error':
            notification.style.backgroundColor = '#F44336';
            notification.style.color = '#ffffff';
            break;
        case 'warning':
            notification.style.backgroundColor = '#FFC107';
            notification.style.color = '#333333';
            break;
        default: // info
            notification.style.backgroundColor = '#2196F3';
            notification.style.color = '#ffffff';
    }
    
    // Add buttons if provided
    if (options.buttons && options.buttons.length > 0) {
        const buttonContainer = document.createElement('div');
        buttonContainer.style.marginTop = '8px';
        buttonContainer.style.display = 'flex';
        buttonContainer.style.gap = '8px';
        buttonContainer.style.flexWrap = 'wrap';
        
        options.buttons.forEach(button => {
            const btn = document.createElement('button');
            btn.textContent = button.text;
            btn.style.padding = '6px 12px';
            btn.style.border = 'none';
            btn.style.borderRadius = '4px';
            btn.style.cursor = 'pointer';
            
            if (button.primary) {
                btn.style.backgroundColor = '#ffffff';
                btn.style.color = '#333333';
            } else {
                btn.style.backgroundColor = 'rgba(255, 255, 255, 0.3)';
                btn.style.color = options.type === 'warning' ? '#333333' : '#ffffff';
            }
            
            btn.addEventListener('click', () => {
                if (notification.parentNode) {
                    notification.parentNode.removeChild(notification);
                }
                button.onClick();
            });
            
            buttonContainer.appendChild(btn);
        });
        
        notification.appendChild(buttonContainer);
    }
    
    // Add to DOM
    document.body.appendChild(notification);
    
    // Position next to the Guides button
    const guideButton = document.querySelector('.hyphen-start-button');
    if (guideButton) {
        const buttonRect = guideButton.getBoundingClientRect();
        notification.style.bottom = `${buttonRect.height + 20}px`;
        notification.style.right = '20px';
    } else {
        // Fallback position if button not found
        notification.style.bottom = '70px';
        notification.style.right = '20px';
    }
    
    // Auto-close if specified (default to 2000ms for stop notifications)
    if (options.autoClose) {
        setTimeout(() => {
            if (notification.parentNode) {
                notification.style.opacity = '0';
                setTimeout(() => {
                    if (notification.parentNode) {
                        notification.parentNode.removeChild(notification);
                    }
                }, 300);
            }
        }, options.autoClose);
    }
    
    return notification;
  }

  static showCompletionPopup(guideButton: HTMLElement): HTMLElement {
    // Create popup near the guide button
    const popup = document.createElement('div');
    popup.className = 'hyphen-completion-popup';
    
    // Style the popup
    popup.style.position = 'fixed';
    popup.style.backgroundColor = '#4CAF50';
    popup.style.color = '#ffffff';
    popup.style.padding = '10px 15px';
    popup.style.borderRadius = '4px';
    popup.style.boxShadow = '0 2px 10px rgba(0,0,0,0.2)';
    popup.style.fontSize = '14px';
    popup.style.zIndex = '10001';
    popup.style.maxWidth = '300px';
    
    // Set content
    popup.textContent = 'Guide Completed! 🎉';
    
    // Add to DOM
    document.body.appendChild(popup);
    
    // Position near the guide button - consistent with notifications
    const buttonRect = guideButton.getBoundingClientRect();
    popup.style.bottom = `${buttonRect.height + 20}px`;
    popup.style.right = '20px';
    
    // Add animation class
    popup.style.animation = 'hyphen-popup-fade 5s forwards';
    
    // Add animation keyframes if they don't exist
    if (!document.getElementById('hyphenbox-animations')) {
      const style = document.createElement('style');
      style.id = 'hyphenbox-animations';
      style.textContent = `
        @keyframes hyphen-popup-fade {
          0% { opacity: 0; transform: translateY(5px); }
          10% { opacity: 1; transform: translateY(0); }
          90% { opacity: 1; transform: translateY(0); }
          100% { opacity: 0; transform: translateY(-5px); }
        }
      `;
      document.head.appendChild(style);
    }
    
    // Remove after animation completes
    setTimeout(() => {
      if (popup.parentNode) {
        popup.parentNode.removeChild(popup);
      }
    }, 5000);
    
    return popup;
  }

  static showErrorNotification(message: string, options: ErrorNotificationOptions): HTMLElement {
    // Add retry, skip, and stop buttons
    const buttons = [];
    
    if (options.onRetry) {
      buttons.push({
        text: 'Retry',
        onClick: options.onRetry,
        primary: true
      });
    }
    
    if (options.onSkip) {
      buttons.push({
        text: 'Skip Step',
        onClick: options.onSkip
      });
    }
    
    if (options.onStop) {
      buttons.push({
        text: 'Stop Guide',
        onClick: options.onStop
      });
    }
    
    return this.showNotification({
      title: 'Error',
      message,
      type: 'error',
      buttons
    });
  }

  static positionHighlightOnElement(element: HTMLElement, highlight: HTMLElement | null): void {
    if (!highlight || !element) return;
    
    console.log('[HIGHLIGHT-POSITION] Starting highlight positioning for:', {
        element: {
            tag: element.tagName,
            id: element.id,
            classes: element.className
        }
    });

    // Remove highlight from current parent if it exists
    if (highlight.parentElement) {
        highlight.parentElement.removeChild(highlight);
    }
    
    // Add the highlight to the document body
    document.body.appendChild(highlight);
    
    // Set up highlight style
    highlight.style.position = 'absolute';
    highlight.style.pointerEvents = 'none';
    
    // Store element reference for cleanup
    (highlight as any)._targetElement = element;
    
    // Function to check if element position has stabilized
    let lastRect: DOMRect | null = null;
    const hasPositionChanged = (rect: DOMRect): boolean => {
        if (!lastRect) return true;
        return (
            Math.abs(rect.top - lastRect.top) > 0.5 ||
            Math.abs(rect.left - lastRect.left) > 0.5 ||
            Math.abs(rect.width - lastRect.width) > 0.5 ||
            Math.abs(rect.height - lastRect.height) > 0.5
        );
    };

    // Function to update highlight position
    const updateHighlightPosition = () => {
        if (!element || !highlight) return;
        
        try {
            const rect = element.getBoundingClientRect();
            const scrollX = window.scrollX || document.documentElement.scrollLeft;
            const scrollY = window.scrollY || document.documentElement.scrollTop;
            
            // Position highlight
            highlight.style.top = `${rect.top + scrollY - 3}px`;
            highlight.style.left = `${rect.left + scrollX - 3}px`;
            highlight.style.width = `${rect.width + 6}px`;
            highlight.style.height = `${rect.height + 6}px`;
            highlight.style.transform = 'none';
            highlight.style.zIndex = '9995';
            
            lastRect = rect;
            
            console.log('[HIGHLIGHT-POSITION] Updated highlight position for element:', {
                elementRect: rect,
                highlightPosition: {
                    top: highlight.style.top,
                    left: highlight.style.left,
                    width: highlight.style.width,
                    height: highlight.style.height,
                    zIndex: highlight.style.zIndex
                }
            });
        } catch (error) {
            console.error('[HIGHLIGHT-POSITION] Error updating highlight position:', error);
        }
    };

    // Initial position update with stability check
    let stabilityAttempts = 0;
    const MAX_STABILITY_ATTEMPTS = 10;
    const checkStability = () => {
        const rect = element.getBoundingClientRect();
        
        if (hasPositionChanged(rect)) {
            lastRect = rect;
            stabilityAttempts++;
            
            if (stabilityAttempts < MAX_STABILITY_ATTEMPTS) {
                // Position changed, wait a bit and check again
                setTimeout(checkStability, 50);
            } else {
                // Max attempts reached, use final position
                updateHighlightPosition();
            }
        } else {
            // Position has stabilized
            updateHighlightPosition();
        }
    };

    // Start stability checks after a short delay to allow for initial render
    setTimeout(checkStability, 50);
    
    // Create handler for scroll and resize events
    const scrollResizeHandler = () => {
        requestAnimationFrame(updateHighlightPosition);
    };
    
    // Create mutation observer for DOM changes
    const observer = new MutationObserver(() => {
        requestAnimationFrame(updateHighlightPosition);
    });
    
    // Observe the element and its parent for changes
    observer.observe(element, {
        attributes: true,
        childList: true,
        subtree: true
    });
    
    if (element.parentElement) {
        observer.observe(element.parentElement, {
            attributes: true,
            childList: true,
            subtree: true
        });
    }
    
    // Store handlers and observer on highlight for cleanup
    (highlight as any)._scrollResizeHandler = scrollResizeHandler;
    (highlight as any)._observer = observer;
    
    // Add event listeners
    window.addEventListener('scroll', scrollResizeHandler, { passive: true });
    window.addEventListener('resize', scrollResizeHandler, { passive: true });
    
    console.log('[HIGHLIGHT-POSITION] Highlight positioning setup completed with stability checks');
  }

  // Add a new method to properly clean up all UI components
  static cleanupAllUI(keepCursor: boolean = false, keepNotifications: boolean = true): void {
    // Clean up the guidance container and its contents
    const container = document.querySelector('.hyphen-guidance-container') as EnhancedHTMLElement;
    if (container) {
        // Clean up event listeners
        if (container['observer']) {
            container['observer'].disconnect();
            container['observer'] = null;
        }
        if (container['parentObserver']) {
            container['parentObserver'].disconnect();
            container['parentObserver'] = null;
        }
        if (container['positionInterval']) {
            clearInterval(container['positionInterval']);
        }
        if (container['scrollHandler']) {
            window.removeEventListener('scroll', container['scrollHandler']);
            window.removeEventListener('resize', container['scrollHandler']);
            container['scrollHandler'] = null;
        }
        document.body.removeChild(container);
    }

    // Clean up all highlights by class name
    const highlights = document.querySelectorAll('.hyphen-highlight');
    highlights.forEach(highlight => {
        try {
            // Clean up event listeners and observers for the new overlay approach
            if ((highlight as any)._scrollResizeHandler) {
                window.removeEventListener('scroll', (highlight as any)._scrollResizeHandler);
                window.removeEventListener('resize', (highlight as any)._scrollResizeHandler);
                (highlight as any)._scrollResizeHandler = null;
            }
            
            if ((highlight as any)._observer) {
                (highlight as any)._observer.disconnect();
                (highlight as any)._observer = null;
            }
            
            // Remove reference to target element
            (highlight as any)._targetElement = null;
            
            // Remove the highlight from DOM
            if (highlight.parentNode) {
                highlight.parentNode.removeChild(highlight);
            }
        } catch (error) {
            console.warn('Error cleaning up highlight:', error);
        }
    });

    // Clean up text popup by ID
    const textPopup = document.getElementById('hyphenbox-text-popup');
    if (textPopup && textPopup.parentNode) {
        textPopup.parentNode.removeChild(textPopup);
    }

    // Only clean up cursor if explicitly requested
    if (!keepCursor) {
        // Find cursor wrapper by ID
        const cursorWrapper = document.getElementById('hyphenbox-cursor-wrapper') as EnhancedHTMLElement;
        if (cursorWrapper) {
            try {
                // Clean up all observers and handlers
                if (cursorWrapper['observer']) {
                    cursorWrapper['observer'].disconnect();
                    cursorWrapper['observer'] = null;
                }
                if (cursorWrapper['scrollHandler']) {
                    window.removeEventListener('scroll', cursorWrapper['scrollHandler']);
                    window.removeEventListener('resize', cursorWrapper['scrollHandler']);
                    cursorWrapper['scrollHandler'] = null;
                }
                if (cursorWrapper['resizeHandler']) {
                    window.removeEventListener('resize', cursorWrapper['resizeHandler']);
                    cursorWrapper['resizeHandler'] = null;
                }
                if (cursorWrapper['positionInterval']) {
                    clearInterval(cursorWrapper['positionInterval']);
                }
                
                // Clear current element reference
                cursorWrapper['currentElement'] = null;
                
                // Remove the wrapper and cursor
                if (cursorWrapper.parentNode) {
                    cursorWrapper.parentNode.removeChild(cursorWrapper);
                }
            } catch (error) {
                console.warn('Error cleaning up cursor:', error);
            }
        }
    }

    // Clean up draggable elements' event handlers
    const draggables = document.querySelectorAll('.hyphen-draggable') as NodeListOf<EnhancedHTMLElement>;
    draggables.forEach(draggable => {
        try {
            if (draggable['_hyphenDragHandlers']) {
                document.removeEventListener('mousemove', draggable['_hyphenDragHandlers'].mouseMove);
                document.removeEventListener('mouseup', draggable['_hyphenDragHandlers'].mouseUp);
                delete draggable['_hyphenDragHandlers'];
            }
        } catch (error) {
            console.warn('Error cleaning up draggable:', error);
        }
    });

    // Clean up any notifications only if explicitly requested
    if (!keepNotifications) {
        const notifications = document.querySelectorAll('.hyphen-notification');
        notifications.forEach(notification => {
            if (notification.parentNode) {
                notification.parentNode.removeChild(notification);
            }
        });
    }

    console.log('[CLEANUP-DEBUG] UI elements cleaned up', keepCursor ? '(keeping cursor)' : '(including cursor)', keepNotifications ? '(keeping notifications)' : '(including notifications)');
  }

  static showRedirectNotification(options: RedirectNotificationOptions): HTMLElement {
    // Create buttons array with redirect button
    const buttons = [
      {
        text: options.redirectText || 'Go to page',
        onClick: () => {
          window.location.href = options.redirectUrl;
        },
        primary: true
      },
      ...(options.buttons || [])
    ];
    
    // Create a notification with the redirect button
    return this.showNotification({
      ...options,
      buttons
    });
  }

  // Add a more efficient cleanup method that keeps elements but hides them
  static hideGuidanceElements(): void {
    const container = document.querySelector('.hyphen-guidance-container') as HTMLElement;
    if (container) {
      // Hide instead of removing
      container.style.display = 'none';
    }
  }

  // Add this as a new method in the CursorFlowUI class
  static detectAndLogPortals(): { 
    portals: HTMLElement[], 
    modals: HTMLElement[],
    activeModal: HTMLElement | null
  } {
    // Find all portals and modal-like elements
    const portals = Array.from(document.querySelectorAll('[data-portal="true"]')) as HTMLElement[];
    const modals = Array.from(document.querySelectorAll(
      '.mantine-Modal-content, [role="dialog"], .modal-content, .modal, .dialog'
    )) as HTMLElement[];
    
    // Log detailed info about portals and modals
    console.log('[PORTAL-DETECTOR] Found portals:', {
      count: portals.length,
      portals: portals.map(p => ({
        classes: p.className,
        children: p.children.length,
        visible: p.offsetParent !== null,
        rect: p.getBoundingClientRect()
      }))
    });
    
    console.log('[PORTAL-DETECTOR] Found modals:', {
      count: modals.length,
      modals: modals.map(m => ({
        classes: m.className,
        role: m.getAttribute('role'),
        children: m.children.length,
        visible: m.offsetParent !== null,
        rect: m.getBoundingClientRect()
      }))
    });
    
    // Determine which modal is most likely to be active/visible
    let activeModal = null;
    
    // Check for visibility and z-index to determine most prominent modal
    const visibleModals = modals.filter(m => {
      const rect = m.getBoundingClientRect();
      const styles = window.getComputedStyle(m);
      return rect.width > 0 && 
             rect.height > 0 && 
             styles.display !== 'none' &&
             styles.visibility !== 'hidden' &&
             styles.opacity !== '0';
    });
    
    if (visibleModals.length > 0) {
      // Sort by z-index (highest first)
      visibleModals.sort((a, b) => {
        const zIndexA = parseInt(window.getComputedStyle(a).zIndex) || 0;
        const zIndexB = parseInt(window.getComputedStyle(b).zIndex) || 0;
        return zIndexB - zIndexA;
      });
      
      activeModal = visibleModals[0];
      console.log('[PORTAL-DETECTOR] Active modal identified:', {
        classes: activeModal.className,
        role: activeModal.getAttribute('role'),
        zIndex: window.getComputedStyle(activeModal).zIndex
      });
    }
    
    return { portals, modals, activeModal };
  }

  static async handleMantineFormTransition(buttonText: string, inputPlaceholder: string): Promise<HTMLElement | null> {
    console.log(`[MANTINE-HANDLER] Handling form transition for button "${buttonText}" and input "${inputPlaceholder}"`);
    
    // First wait for any portal animations to complete
    await ElementUtils.waitForPortalStability();
    
    // After portal has stabilized, find the input element
    let inputElement = null;
    let attempts = 0;
    const MAX_ATTEMPTS = 10;
    
    while (!inputElement && attempts < MAX_ATTEMPTS) {
      attempts++;
      console.log(`[MANTINE-HANDLER] Attempt ${attempts} to find input`);
      
      // Use the specialized finder
      inputElement = ElementUtils.findMantineInput(inputPlaceholder);
      
      if (!inputElement) {
        // Wait a bit before trying again
        await new Promise(resolve => setTimeout(resolve, 150));
      }
    }
    
    if (inputElement) {
      console.log('[MANTINE-HANDLER] Successfully found input element:', {
        id: inputElement.id,
        classes: inputElement.className,
        rect: inputElement.getBoundingClientRect()
      });
    } else {
      console.log('[MANTINE-HANDLER] Failed to find input element after all attempts');
    }
    
    return inputElement;
  }

  // Add a new method to show thinking indicator
  static showThinkingIndicator(button: HTMLElement): HTMLElement {
    console.log('[THINKING-DEBUG] Showing thinking indicator');
    
    // Create a container for the thinking indicator
    const container = document.createElement('div');
    container.className = 'hyphen-thinking-indicator';
    container.style.cssText = `
      position: fixed;
      z-index: 9999;
      pointer-events: none;
    `;
    
    // Create a cursor element
    const cursor = this.createCursor({});
    cursor.style.cssText = `
      display: block;
      position: absolute;
      bottom: 5px;
      left: 5px;
      animation: hyphen-pulse 1.5s infinite;
    `;
    
    // Create text bubble
    const bubble = document.createElement('div');
    bubble.style.cssText = `
      position: absolute;
      background: #ffffff;
      box-shadow: 0 2px 8px rgba(0,0,0,0.15);
      border-radius: 8px;
      padding: 8px 12px;
      font-size: 14px;
      font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
      color: #333;
      bottom: 10px;
      left: 45px;
      white-space: nowrap;
    `;
    
    // Add loading dots animation to the text
    bubble.innerHTML = `
      Thinking<span class="hyphen-loading-dots"><span>.</span><span>.</span><span>.</span></span>
    `;
    
    // Add animation styles
    const style = document.createElement('style');
    style.textContent = `
      @keyframes hyphen-pulse {
        0% { opacity: 0.6; transform: scale(0.95); }
        50% { opacity: 1; transform: scale(1); }
        100% { opacity: 0.6; transform: scale(0.95); }
      }
      
      .hyphen-loading-dots span {
        animation: hyphen-dots 1.5s infinite;
        animation-fill-mode: both;
        opacity: 0;
      }
      
      .hyphen-loading-dots span:nth-child(2) {
        animation-delay: 0.2s;
      }
      
      .hyphen-loading-dots span:nth-child(3) {
        animation-delay: 0.4s;
      }
      
      @keyframes hyphen-dots {
        0% { opacity: 0; }
        25% { opacity: 1; }
        50% { opacity: 1; }
        75% { opacity: 0; }
      }
    `;
    document.head.appendChild(style);
    
    // Add elements to container
    container.appendChild(cursor);
    container.appendChild(bubble);
    
    // Position the container relative to the button
    const buttonRect = button.getBoundingClientRect();
    container.style.left = `${buttonRect.left - 10}px`;
    container.style.top = `${buttonRect.top - 70}px`;
    
    // Add to document
    document.body.appendChild(container);
    
    // Add entrance animation
    container.animate([
      { opacity: 0, transform: 'translateY(10px)' },
      { opacity: 1, transform: 'translateY(0)' }
    ], {
      duration: 300,
      easing: 'ease-out'
    });
    
    return container;
  }
  
  static hideThinkingIndicator(indicator: HTMLElement): void {
    if (!indicator || !document.body.contains(indicator)) return;
    
    // Add exit animation
    const animation = indicator.animate([
      { opacity: 1, transform: 'translateY(0)' },
      { opacity: 0, transform: 'translateY(10px)' }
    ], {
      duration: 300,
      easing: 'ease-in'
    });
    
    // Remove after animation completes
    animation.onfinish = () => {
      if (document.body.contains(indicator)) {
        document.body.removeChild(indicator);
      }
    };
  }
}

// Helper function to adjust color brightness
function adjustColor(color: string, amount: number): string {
  try {
    // Simple algorithm to darken/lighten hex color
    return color.replace(/^#/, '').replace(/.{2}/g, (c) => {
      const newC = Math.max(0, Math.min(255, parseInt(c, 16) + amount));
      return newC.toString(16).padStart(2, '0');
    });
  } catch (e) {
    return color;
  }
}