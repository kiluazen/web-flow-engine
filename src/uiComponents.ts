interface EnhancedHTMLElement extends HTMLElement {
  [key: string]: any; // Allow any string property
}

export interface ThemeOptions {
  cursorColor?: string;
  highlightColor?: string;
  highlightBorderColor?: string;
  buttonColor?: string;
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
    const button = document.createElement('button');
    button.className = 'hyphen-start-button';
    button.textContent = text || 'Guides';
    
    // Style the button
    button.style.position = 'fixed';
    button.style.bottom = '20px';
    button.style.right = '20px';
    button.style.padding = '8px 16px';
    button.style.backgroundColor = color || '#007bff';
    button.style.color = '#ffffff';
    button.style.border = 'none';
    button.style.borderRadius = '4px';
    button.style.fontSize = '14px';
    button.style.fontWeight = 'bold';
    button.style.cursor = 'pointer';
    button.style.boxShadow = '0 2px 5px rgba(0,0,0,0.2)';
    button.style.zIndex = '9999';
    
    // Add hover effect
    button.addEventListener('mouseover', () => {
      button.style.backgroundColor = color ? adjustColor(color, -20) : '#0069d9';
    });
    
    button.addEventListener('mouseout', () => {
      button.style.backgroundColor = color || '#007bff';
    });
    
    // Add click handler
    button.addEventListener('click', onClick);
    
    return button;
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
    // Create dropdown container
    const dropdown = document.createElement('div');
    dropdown.className = 'hyphen-dropdown';
    
    // Style the dropdown
    dropdown.style.position = 'absolute';
    dropdown.style.bottom = '60px'; // Position above the button
    dropdown.style.right = '20px';
    dropdown.style.width = '300px';
    dropdown.style.maxHeight = '400px';
    dropdown.style.overflowY = 'auto';
    dropdown.style.backgroundColor = '#ffffff';
    dropdown.style.borderRadius = '4px';
    dropdown.style.boxShadow = '0 2px 10px rgba(0,0,0,0.2)';
    dropdown.style.zIndex = '10000';
    dropdown.style.padding = '8px 0';
    
    // Add header
    const header = document.createElement('div');
    header.textContent = 'Select a Guide';
    header.style.padding = '8px 16px';
    header.style.fontWeight = 'bold';
    header.style.borderBottom = '1px solid #eee';
    header.style.marginBottom = '8px';
    dropdown.appendChild(header);
    
    // If no guides available
    if (!guides || guides.length === 0) {
      const noGuides = document.createElement('div');
      noGuides.textContent = 'No guides available';
      noGuides.style.padding = '8px 16px';
      noGuides.style.color = '#666';
      noGuides.style.fontStyle = 'italic';
      dropdown.appendChild(noGuides);
    } else {
      // Add each guide as a selectable item
      guides.forEach(guide => {
        const item = document.createElement('div');
        item.className = 'hyphen-dropdown-item';
        item.textContent = guide.name;
        
        // Style the item
        item.style.padding = '10px 16px';
        item.style.cursor = 'pointer';
        item.style.transition = 'background-color 0.2s';
        
        // Add hover effect
        item.addEventListener('mouseover', () => {
          item.style.backgroundColor = '#f0f0f0';
        });
        
        item.addEventListener('mouseout', () => {
          item.style.backgroundColor = '';
        });
        
        // Add click handler
        item.addEventListener('click', (event) => {
          // Prevent the click from bubbling up to document
          event.stopPropagation();
          
          // Call the select handler
          onSelect(guide);
          
          // Check if dropdown is still in the DOM before removing
          if (document.body.contains(dropdown)) {
            document.body.removeChild(dropdown);
          }
          
          // Clean up the event listener
          document.removeEventListener('click', handleOutsideClick);
        });
        
        dropdown.appendChild(item);
      });
    }
    
    // Add the dropdown to the page
    document.body.appendChild(dropdown);
    
    // Close dropdown when clicking outside
    const handleOutsideClick = (event: MouseEvent) => {
      const target = event.target as Node;
      if (!dropdown.contains(target) && target !== guideButton) {
        // Check if dropdown is still in the DOM before removing
        if (document.body.contains(dropdown)) {
          document.body.removeChild(dropdown);
        }
        document.removeEventListener('click', handleOutsideClick);
      }
    };
    
    // Use setTimeout to avoid immediate trigger
    setTimeout(() => {
      document.addEventListener('click', handleOutsideClick);
    }, 0);
    
    return dropdown;
  }

  static createCursor(theme: ThemeOptions): HTMLElement {
    const cursor = document.createElement('div');
    cursor.className = 'hyphen-cursor';
    
    // Load the SVG cursor
    cursor.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="32px" height="32px"><path fill="#a1d3a2" d="M34 71.613L34 16 73 55.135 56.429 58.428 65.805 81.376 57.282 84.949 47.906 62.001z"/><path fill="#1f212b" d="M61.25 79.99c-.197 0-.384-.117-.463-.311l-6.944-17c-.104-.256.019-.548.273-.652.258-.104.548.018.652.273l6.944 17c.104.256-.019.548-.273.652C61.377 79.979 61.313 79.99 61.25 79.99zM53.5 61.02c-.197 0-.384-.117-.463-.311l-.406-.994c-.104-.256.019-.548.273-.652.256-.105.548.018.652.273l.406.994c.104.256-.019.548-.273.652C53.627 61.008 53.563 61.02 53.5 61.02zM52.257 57.977c-.197 0-.384-.117-.463-.311l-.677-1.656c-.057-.139-.048-.295.022-.427.071-.131.196-.224.343-.253l6.955-1.379c.273-.055.534.122.588.393.054.271-.122.534-.393.588l-6.36 1.261.447 1.095c.104.256-.019.548-.273.652C52.384 57.965 52.32 57.977 52.257 57.977zM61.455 54.362c-.233 0-.442-.165-.489-.403-.054-.271.122-.533.394-.587l3.537-.7L53.146 40.879c-.194-.195-.194-.512.002-.707.195-.193.512-.195.707.002l12.41 12.454c.13.13.178.322.124.498-.054.177-.2.31-.382.345l-4.454.882C61.521 54.359 61.487 54.362 61.455 54.362zM37.5 59c-.276 0-.5-.224-.5-.5V24.47c0-.202.122-.385.309-.462.186-.076.402-.035.545.109l13.978 14.027c.194.195.194.512-.002.707-.195.193-.512.195-.707-.002L38 25.68V58.5C38 58.776 37.776 59 37.5 59z"/><g><path fill="#1f212b" d="M57.281,85.949c-0.13,0-0.261-0.025-0.383-0.076c-0.247-0.103-0.442-0.299-0.543-0.546l-8.905-21.796l-12.882,8.904c-0.307,0.213-0.704,0.235-1.033,0.063C33.206,72.326,33,71.985,33,71.613V16c0-0.404,0.244-0.77,0.618-0.924c0.373-0.157,0.804-0.069,1.09,0.218l39,39.135c0.261,0.262,0.356,0.645,0.249,0.997s-0.4,0.618-0.762,0.689l-15.382,3.058l8.917,21.825c0.207,0.508-0.033,1.088-0.539,1.3l-8.523,3.573C57.544,85.923,57.413,85.949,57.281,85.949z M47.906,61.001c0.096,0,0.191,0.014,0.285,0.041c0.291,0.087,0.526,0.3,0.641,0.581l8.994,22.014l6.679-2.8l-9.001-22.03c-0.113-0.276-0.097-0.589,0.045-0.852s0.393-0.449,0.686-0.507l14.74-2.931L35,18.42v51.286l12.337-8.527C47.506,61.062,47.705,61.001,47.906,61.001z"/></g></svg>`;
    
    // Set basic styles for cursor
    cursor.style.position = 'absolute';
    cursor.style.zIndex = '9999';
    cursor.style.pointerEvents = 'none'; // Ensures it doesn't interfere with clicks
    cursor.style.transform = 'translate(-5px, -5px)'; // Adjust position so tip of cursor is at the target
    
    // Apply theme if provided
    if (theme?.cursorColor) {
      const paths = cursor.querySelectorAll('path');
      paths.forEach(path => {
        if (path.getAttribute('fill') === '#a1d3a2') {
          path.setAttribute('fill', theme.cursorColor || '#a1d3a2');
        }
      });
    }
    
    return cursor;
  }

  static createHighlight(theme: ThemeOptions): HTMLElement {
    const highlight = document.createElement('div');
    highlight.className = 'hyphen-highlight';
    
    // Set basic styles
    highlight.style.position = 'absolute';
    highlight.style.boxSizing = 'border-box';
    highlight.style.pointerEvents = 'none';
    highlight.style.zIndex = '9998';
    highlight.style.border = `2px solid ${theme?.highlightBorderColor || '#FF6B00'}`;
    highlight.style.backgroundColor = theme?.highlightColor || 'rgba(255, 107, 0, 0.1)';
    highlight.style.borderRadius = '3px';
    highlight.style.transition = 'all 0.3s ease-in-out';
    
    return highlight;
  }

  static createTextPopup(text: string, theme: ThemeOptions): HTMLElement {
    const popup = document.createElement('div');
    popup.className = 'hyphen-text-popup';
    
    // Simplified styles - just what's needed
    popup.style.position = 'absolute';
    popup.style.zIndex = '10000';
    popup.style.backgroundColor = '#ffffff';
    popup.style.color = '#333333';
    popup.style.padding = '8px 12px';
    popup.style.borderRadius = '4px';
    popup.style.boxShadow = '0 2px 8px rgba(0,0,0,0.15)';
    popup.style.fontSize = '14px';
    popup.style.maxWidth = '300px';
    popup.style.whiteSpace = 'nowrap'; // Keep short text on one line
    
    // Set text directly - no nested divs
    popup.textContent = text;
    
    return popup;
  }

  static moveCursorToElement(element: HTMLElement, cursor: HTMLElement | null, interaction: any): void {
    if (!cursor || !element) return;
    
    // First, remove any existing cursor wrapper
    const existingWrapper = document.querySelector('.hyphen-cursor-wrapper');
    if (existingWrapper && existingWrapper.parentNode) {
      existingWrapper.parentNode.removeChild(existingWrapper);
    }
    
    // Create a wrapper element that will be positioned relative to the target element
    const wrapper = document.createElement('div') as EnhancedHTMLElement;
    wrapper.className = 'hyphen-cursor-wrapper';
    wrapper.style.position = 'absolute';
    wrapper.style.top = '0';
    wrapper.style.left = '0';
    wrapper.style.pointerEvents = 'none';
    wrapper.style.zIndex = '9999';
    
    // Add the cursor to the wrapper
    wrapper.appendChild(cursor);
    
    // Position the cursor relative to the target
    cursor.style.position = 'absolute';
    cursor.style.left = '50%';
    cursor.style.top = '50%';
    cursor.style.transform = 'translate(-5px, -5px)';
    
    // Add the wrapper to the document
    document.body.appendChild(wrapper);
    
    // Create a MutationObserver to watch for changes to the element
    const observer = new MutationObserver(() => {
      updatePosition();
    });
    
    // Watch for changes to the element's attributes and children
    observer.observe(element, {
      attributes: true,
      childList: true,
      subtree: true
    });
    
    // Store the observer on the wrapper for later cleanup
    wrapper['observer'] = observer;
    
    // Function to update the wrapper position
    const updatePosition = () => {
      const rect = element.getBoundingClientRect();
      const scrollX = window.scrollX || window.pageXOffset;
      const scrollY = window.scrollY || window.pageYOffset;
      
      wrapper.style.transform = `translate(${rect.left + scrollX}px, ${rect.top + scrollY}px)`;
      wrapper.style.width = `${rect.width}px`;
      wrapper.style.height = `${rect.height}px`;
    };
    
    // Initial position update
    updatePosition();
    
    // Update position on scroll and resize
    const handler = () => updatePosition();
    window.addEventListener('scroll', handler, { passive: true });
    window.addEventListener('resize', handler, { passive: true });
    
    // Store the handlers on the wrapper for later cleanup
    wrapper['scrollHandler'] = handler;
    wrapper['resizeHandler'] = handler;
  }
  
  static positionTextPopupNearCursor(cursor: HTMLElement, popup: HTMLElement): void {
    if (!cursor || !popup) return;
    
    // Add to DOM if not already there
    if (!popup.parentElement) {
      document.body.appendChild(popup);
    }
    
    // Get cursor position
    const cursorRect = cursor.getBoundingClientRect();
    
    // Position popup at the cursor's tip
    popup.style.left = `${cursorRect.right - 8}px`; // Adjust for cursor tip
    popup.style.top = `${cursorRect.bottom - 8}px`; // Adjust for cursor tip
    
    // Viewport boundary checks
    const popupRect = popup.getBoundingClientRect();
    const viewportWidth = window.innerWidth;
    const viewportHeight = window.innerHeight;
    
    // Adjust horizontal position if off-screen
    if (popupRect.right > viewportWidth) {
      popup.style.left = `${cursorRect.left - popupRect.width - 5}px`;
    }
    
    // Adjust vertical position if off-screen
    if (popupRect.bottom > viewportHeight) {
      popup.style.top = `${cursorRect.top - popupRect.height - 5}px`;
    }
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
    
    // Add title if provided
    if (options.title) {
      const title = document.createElement('div');
      title.style.fontWeight = 'bold';
      title.style.marginBottom = '4px';
      title.textContent = options.title;
      notification.appendChild(title);
    }
    
    // Add message
    const message = document.createElement('div');
    message.textContent = options.message;
    notification.appendChild(message);
    
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
    
    // Auto-close if specified
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
    if (!document.getElementById('hyphen-animations')) {
      const style = document.createElement('style');
      style.id = 'hyphen-animations';
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
    
    // First, remove any existing highlight wrapper
    const existingWrapper = document.querySelector('.hyphen-highlight-wrapper');
    if (existingWrapper && existingWrapper.parentNode) {
      existingWrapper.parentNode.removeChild(existingWrapper);
    }
    
    // Create a wrapper element that will be positioned relative to the target element
    const wrapper = document.createElement('div') as EnhancedHTMLElement;
    wrapper.className = 'hyphen-highlight-wrapper';
    wrapper.style.position = 'absolute';
    wrapper.style.top = '0';
    wrapper.style.left = '0';
    wrapper.style.pointerEvents = 'none';
    wrapper.style.zIndex = '9998';
    
    // Add the highlight to the wrapper
    wrapper.appendChild(highlight);
    
    // Position the highlight with a small padding
    highlight.style.position = 'absolute';
    highlight.style.left = '-4px';  // 4px padding on left
    highlight.style.top = '-4px';   // 4px padding on top
    highlight.style.width = 'calc(100% + 8px)';  // Add 8px (4px on each side)
    highlight.style.height = 'calc(100% + 8px)'; // Add 8px (4px on each side)
    
    // Add the wrapper to the document
    document.body.appendChild(wrapper);
    
    // Create a MutationObserver to watch for changes to the element
    const observer = new MutationObserver(() => {
      updatePosition();
    });
    
    // Watch for changes to the element's attributes and children
    observer.observe(element, {
      attributes: true,
      childList: true,
      subtree: true
    });
    
    // Store the observer on the wrapper for later cleanup
    wrapper['observer'] = observer;
    
    // Function to update the wrapper position
    const updatePosition = () => {
      const rect = element.getBoundingClientRect();
      const scrollX = window.scrollX || window.pageXOffset;
      const scrollY = window.scrollY || window.pageYOffset;
      
      wrapper.style.transform = `translate(${rect.left + scrollX}px, ${rect.top + scrollY}px)`;
      wrapper.style.width = `${rect.width}px`;
      wrapper.style.height = `${rect.height}px`;
    };
    
    // Initial position update
    updatePosition();
    
    // Update position on scroll and resize
    const handler = () => updatePosition();
    window.addEventListener('scroll', handler, { passive: true });
    window.addEventListener('resize', handler, { passive: true });
    
    // Store the handlers on the wrapper for later cleanup
    wrapper['scrollHandler'] = handler;
    wrapper['resizeHandler'] = handler;
  }

  // Add a new method to properly clean up all UI components
  static cleanupAllUI(): void {
    // Clean up the guidance container and its contents
    const container = document.querySelector('.hyphen-guidance-container') as EnhancedHTMLElement;
    if (container) {
      // Clean up event listeners
      if (container['observer']) {
        container['observer'].disconnect();
      }
      if (container['scrollHandler']) {
        window.removeEventListener('scroll', container['scrollHandler']);
        window.removeEventListener('resize', container['scrollHandler']);
      }
      document.body.removeChild(container);
    }
    
    // Also clean up any individual elements that might exist
    const wrappers = document.querySelectorAll('.hyphen-cursor-wrapper, .hyphen-highlight-wrapper');
    wrappers.forEach(wrapper => {
      const enhancedWrapper = wrapper as EnhancedHTMLElement;
      if (enhancedWrapper['observer']) {
        enhancedWrapper['observer'].disconnect();
      }
      if (enhancedWrapper['scrollHandler']) {
        window.removeEventListener('scroll', enhancedWrapper['scrollHandler']);
        window.removeEventListener('resize', enhancedWrapper['scrollHandler']);
      }
      if (wrapper.parentNode) {
        wrapper.parentNode.removeChild(wrapper);
      }
    });
    
    // Remove any text popups
    const textPopups = document.querySelectorAll('.hyphen-text-popup');
    textPopups.forEach(popup => {
      if (popup.parentNode) {
        popup.parentNode.removeChild(popup);
      }
    });
    
    console.log('All UI elements cleaned up');
  }

  static showGuidanceElements(element: HTMLElement, cursor: HTMLElement, highlight: HTMLElement, text: string, theme: ThemeOptions): void {
    // Get or create the container (reuse if possible)
    let container = document.querySelector('.hyphen-guidance-container') as EnhancedHTMLElement;
    let shouldUpdatePositionOnly = false;
    
    // If container exists, we'll reuse it instead of recreating
    if (container) {
      // Clear previous observers gracefully
      if (container['observer']) {
        container['observer'].disconnect();
      }
      shouldUpdatePositionOnly = true;
    } else {
      // Create new container
      container = document.createElement('div') as EnhancedHTMLElement;
      container.className = 'hyphen-guidance-container';
      container.style.position = 'absolute';
      container.style.top = '0';
      container.style.left = '0';
      container.style.pointerEvents = 'none';
      container.style.zIndex = '9998';
      
      // Add container to document once
      document.body.appendChild(container);
      
      // Add the highlight (once) with padding
      container.appendChild(highlight);
      highlight.style.position = 'absolute';
      highlight.style.left = '-4px';
      highlight.style.top = '-4px';
      highlight.style.width = 'calc(100% + 8px)';
      highlight.style.height = 'calc(100% + 8px)';
      
      // Position cursor at bottom right edge of highlighted element
      container.appendChild(cursor);
      cursor.style.position = 'absolute';
      cursor.style.right = '-24px';
      cursor.style.bottom = '-24px';
      cursor.style.transform = 'none';
    }
    
    // Only update text content if popup exists
    const existingPopup = container.querySelector('.hyphen-text-popup');
    let popup: HTMLElement;
    
    if (existingPopup) {
      popup = existingPopup as HTMLElement;
      // Just update text directly
      popup.textContent = text;
    } else {
      // Create new popup
      popup = this.createTextPopup(text, theme);
      container.appendChild(popup);
      popup.style.position = 'absolute';
    }
    
    // Use requestAnimationFrame for smoother position updates
    const updatePosition = () => {
      requestAnimationFrame(() => {
        const rect = element.getBoundingClientRect();
        const scrollX = window.scrollX || window.pageXOffset;
        const scrollY = window.scrollY || window.pageYOffset;
        
        container.style.transform = `translate(${rect.left + scrollX}px, ${rect.top + scrollY}px)`;
        container.style.width = `${rect.width}px`;
        container.style.height = `${rect.height}px`;
        
        // Position cursor at bottom right
        if (cursor) {
          cursor.style.right = '-24px';
          cursor.style.bottom = '-24px';
        }
        
        // Position textbox directly at cursor tip
        if (popup) {
          // Get cursor position within container
          const cursorRect = cursor.getBoundingClientRect();
          const containerRect = container.getBoundingClientRect();
          
          // The cursor SVG tip is approximately at these offsets from its top-left
          const cursorTipX = 24;  // Approximate X offset to cursor tip
          const cursorTipY = 16;  // Approximate Y offset to cursor tip
          
          // Position popup absolutely from container
          popup.style.position = 'absolute';
          popup.style.right = 'auto';
          popup.style.bottom = 'auto';
          popup.style.left = `calc(100% + ${cursorTipX}px)`;
          popup.style.top = `calc(100% - ${cursorTipY}px)`;
          
          // SIMPLIFIED: Just make the box wide and handle text properly
          popup.style.width = '150px';           // Fixed wider width
          popup.style.maxWidth = '500px';        // Match the width
          popup.style.whiteSpace = 'normal';     // Allow wrapping
          popup.style.wordWrap = 'break-word';   // Handle long words
          
          // No conditional width adjustment based on text length
          // This gives consistent wider box behavior
          
          // Viewport boundary checks (after positioning and sizing)
          setTimeout(() => {
            const popupRect = popup.getBoundingClientRect();
            const viewportWidth = window.innerWidth;
            const viewportHeight = window.innerHeight;
            
            // If off right edge
            if (popupRect.right > viewportWidth) {
              popup.style.left = 'auto';
              popup.style.right = `calc(100% + 10px)`;
            }
            
            // If off bottom
            if (popupRect.bottom > viewportHeight) {
              popup.style.top = 'auto'; 
              popup.style.bottom = `calc(100% + 10px)`;
            }
          }, 0);
        }
      });
    };
    
    // Set up scroll/resize event listeners efficiently (only once)
    if (!shouldUpdatePositionOnly) {
      // Remove old handlers if they exist
      if (container['scrollHandler']) {
        window.removeEventListener('scroll', container['scrollHandler']);
        window.removeEventListener('resize', container['resizeHandler']);
      }
      
      // Throttled event handler
      const throttled = (() => {
        let lastCall = 0;
        return function() {
          const now = Date.now();
          if (now - lastCall >= 16) { // ~60fps
            lastCall = now;
            updatePosition();
          }
        };
      })();
      
      window.addEventListener('scroll', throttled, { passive: true });
      window.addEventListener('resize', throttled, { passive: true });
      container['scrollHandler'] = throttled;
      container['resizeHandler'] = throttled;
    }
    
    // Create a lighter MutationObserver
    const observer = new MutationObserver(() => {
      updatePosition();
    });
    
    // Watch only position-affecting attributes
    observer.observe(element, {
      attributes: true,
      attributeFilter: ['style', 'class'],
      childList: false
    });
    
    // Store the observer
    container['observer'] = observer;
    
    // Initial position update
    updatePosition();
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