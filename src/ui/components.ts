interface ThemeOptions {
  cursorColor?: string;
  highlightColor?: string;
  highlightBorderColor?: string;
  buttonColor?: string;
}

interface NotificationOptions {
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

/**
 * UI components for cursor flow
 */
export class CursorFlowUI {
  /**
   * Create the start button
   */
  static createStartButton(text: string, color: string, onClick: () => void): HTMLElement {
    // Remove existing button if any
    const existingButton = document.getElementById('cursor-flow-start-button');
    if (existingButton) {
      existingButton.remove();
    }
    
    // Create the button element
    const button = document.createElement('button');
    button.id = 'cursor-flow-start-button';
    button.textContent = text;
    button.style.cssText = `
      position: fixed;
      bottom: 20px;
      left: 20px;
      padding: 10px 15px;
      background-color: ${color};
      color: white;
      border: none;
      border-radius: 20px;
      font-family: system-ui, -apple-system, sans-serif;
      font-size: 14px;
      font-weight: bold;
      cursor: pointer;
      box-shadow: 0 2px 10px rgba(0, 0, 0, 0.2);
      z-index: 9998;
      transition: transform 0.2s, background-color 0.2s;
    `;
    
    // Add hover effect
    button.onmouseover = () => {
      button.style.transform = 'scale(1.05)';
    };
    button.onmouseout = () => {
      button.style.transform = 'scale(1)';
    };
    
    // Add click handler
    button.onclick = onClick;
    
    // Add to document
    document.body.appendChild(button);
    return button;
  }
  
  /**
   * Create the guides button
   */
  static createGuidesButton(text: string, color: string, onClick: () => void): HTMLElement {
    // Reuse the start button logic with a different id
    const button = this.createStartButton(text, color, onClick);
    button.id = 'cursor-flow-guides-button';
    return button;
  }
  
  /**
   * Show guides selection dropdown
   */
  static showGuidesDropdown(
    guides: any[], 
    guideButton: HTMLElement,
    onSelect: (guideData: any) => void, 
    isClick: boolean = false
  ): HTMLElement | null {
    // Remove existing dropdown if any
    const existingDropdown = document.getElementById('cursor-flow-guides-dropdown');
    if (existingDropdown) {
      existingDropdown.remove();
      // If this was a click and we're removing, just return null (toggle behavior)
      if (isClick && existingDropdown.dataset.clickTriggered === 'true') {
        return null;
      }
    }
    
    // Get button position for positioning the dropdown
    const buttonRect = guideButton.getBoundingClientRect();
    
    // Create dropdown container
    const dropdown = document.createElement('div');
    dropdown.id = 'cursor-flow-guides-dropdown';
    dropdown.dataset.clickTriggered = isClick ? 'true' : 'false';
    
    // Position dropdown directly above the button with slight overlap
    // This eliminates the gap between button and dropdown
    dropdown.style.cssText = `
      position: fixed;
      bottom: ${window.innerHeight - buttonRect.top + 5}px;
      left: ${buttonRect.left}px;
      background-color: white;
      padding: 10px;
      border-radius: 8px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      width: 250px;
      max-height: 300px;
      overflow-y: auto;
      z-index: 9999;
    `;
    
    // Create dropdown header
    const dropdownHeader = document.createElement('div');
    dropdownHeader.style.cssText = `
      margin-bottom: 10px;
      font-family: system-ui, -apple-system, sans-serif;
      font-size: 16px;
      font-weight: bold;
    `;
    dropdownHeader.textContent = 'Available Guides';
    
    // Create guides list
    const guidesList = document.createElement('div');
    guidesList.style.cssText = `
      display: flex;
      flex-direction: column;
      gap: 8px;
    `;
    
    if (guides.length === 0) {
      const noGuides = document.createElement('p');
      noGuides.textContent = 'No guides available.';
      noGuides.style.textAlign = 'center';
      guidesList.appendChild(noGuides);
    } else {
      guides.forEach(guide => {
        const guideItem = document.createElement('div');
        guideItem.style.cssText = `
          padding: 8px;
          border: 1px solid #eee;
          border-radius: 6px;
          cursor: pointer;
          transition: background-color 0.2s;
        `;
        guideItem.onmouseover = () => {
          guideItem.style.backgroundColor = '#f5f5f5';
        };
        guideItem.onmouseout = () => {
          guideItem.style.backgroundColor = 'white';
        };
        guideItem.onclick = (e) => {
          e.stopPropagation();
          dropdown.remove();
          console.log("DEBUG: Guide clicked", guide);
          onSelect(guide);
        };
        
        const guideName = document.createElement('div');
        guideName.textContent = guide.name;
        guideName.style.cssText = `
          font-weight: bold;
          font-family: system-ui, -apple-system, sans-serif;
          font-size: 14px;
        `;
        
        guideItem.appendChild(guideName);
        guidesList.appendChild(guideItem);
      });
    }
    
    // Assemble dropdown
    dropdown.appendChild(dropdownHeader);
    dropdown.appendChild(guidesList);
    document.body.appendChild(dropdown);
    
    // Create an invisible "bridge" between button and dropdown for hover behavior
    if (!isClick) {
      const hoverBridge = document.createElement('div');
      hoverBridge.style.cssText = `
        position: fixed;
        bottom: ${window.innerHeight - buttonRect.top}px;
        left: ${buttonRect.left}px;
        width: ${buttonRect.width}px;
        height: 20px;
        background-color: transparent;
        z-index: 9998;
      `;
      document.body.appendChild(hoverBridge);
      
      // Handle hover behavior with improved bridge element
      const handleMouseLeave = (e: MouseEvent) => {
        const relatedTarget = e.relatedTarget as Node;
        if (!dropdown.contains(relatedTarget) && 
            !hoverBridge.contains(relatedTarget) && 
            relatedTarget !== guideButton) {
          dropdown.remove();
          hoverBridge.remove();
          guideButton.removeEventListener('mouseleave', handleMouseLeave);
          dropdown.removeEventListener('mouseleave', handleMouseLeave);
          hoverBridge.removeEventListener('mouseleave', handleMouseLeave);
        }
      };
      
      guideButton.addEventListener('mouseleave', handleMouseLeave);
      dropdown.addEventListener('mouseleave', handleMouseLeave);
      hoverBridge.addEventListener('mouseleave', handleMouseLeave);
    }
    
    // For click triggered dropdowns, close when clicking elsewhere
    if (isClick) {
      setTimeout(() => {
        const handleOutsideClick = (e: MouseEvent) => {
          const target = e.target as Node;
          if (dropdown && !dropdown.contains(target) && target !== guideButton) {
            dropdown.remove();
            document.removeEventListener('click', handleOutsideClick);
          }
        };
        document.addEventListener('click', handleOutsideClick);
      }, 100); // Small delay to prevent immediate closing
    }
    
    return dropdown;
  }
  
  /**
   * Creates a custom cursor element
   */
  static createCursor(theme: ThemeOptions): HTMLElement {
    const cursor = document.createElement('div');
    cursor.className = 'cursor-flow-cursor';
    cursor.style.position = 'absolute';
    cursor.style.width = '32px';
    cursor.style.height = '32px';
    cursor.style.pointerEvents = 'none';
    cursor.style.zIndex = '99999';
    cursor.style.transform = 'translate(-8px, -8px)';
    cursor.style.display = 'none';

    // Directly embed the SVG content
    cursor.innerHTML = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 100 100" width="100%" height="100%">
      <path fill="${theme.cursorColor || '#a1d3a2'}" d="M34 71.613L34 16 73 55.135 56.429 58.428 65.805 81.376 57.282 84.949 47.906 62.001z"/>
      <path fill="#1f212b" d="M61.25 79.99c-.197 0-.384-.117-.463-.311l-6.944-17c-.104-.256.019-.548.273-.652.258-.104.548.018.652.273l6.944 17c.104.256-.019.548-.273.652C61.377 79.979 61.313 79.99 61.25 79.99zM53.5 61.02c-.197 0-.384-.117-.463-.311l-.406-.994c-.104-.256.019-.548.273-.652.256-.105.548.018.652.273l.406.994c.104.256-.019.548-.273.652C53.627 61.008 53.563 61.02 53.5 61.02zM52.257 57.977c-.197 0-.384-.117-.463-.311l-.677-1.656c-.057-.139-.048-.295.022-.427.071-.131.196-.224.343-.253l6.955-1.379c.273-.055.534.122.588.393.054.271-.122.534-.393.588l-6.36 1.261.447 1.095c.104.256-.019.548-.273.652C52.384 57.965 52.32 57.977 52.257 57.977zM61.455 54.362c-.233 0-.442-.165-.489-.403-.054-.271.122-.533.394-.587l3.537-.7L53.146 40.879c-.194-.195-.194-.512.002-.707.195-.193.512-.195.707.002l12.41 12.454c.13.13.178.322.124.498-.054.177-.2.31-.382.345l-4.454.882C61.521 54.359 61.487 54.362 61.455 54.362zM37.5 59c-.276 0-.5-.224-.5-.5V24.47c0-.202.122-.385.309-.462.186-.076.402-.035.545.109l13.978 14.027c.194.195.194.512-.002.707-.195.193-.512.195-.707-.002L38 25.68V58.5C38 58.776 37.776 59 37.5 59z"/>
      <path fill="#1f212b" d="M57.281,85.949c-0.13,0-0.261-0.025-0.383-0.076c-0.247-0.103-0.442-0.299-0.543-0.546l-8.905-21.796l-12.882,8.904c-0.307,0.213-0.704,0.235-1.033,0.063C33.206,72.326,33,71.985,33,71.613V16c0-0.404,0.244-0.77,0.618-0.924c0.373-0.157,0.804-0.069,1.09,0.218l39,39.135c0.261,0.262,0.356,0.645,0.249,0.997s-0.4,0.618-0.762,0.689l-15.382,3.058l8.917,21.825c0.207,0.508-0.033,1.088-0.539,1.3l-8.523,3.573C57.544,85.923,57.413,85.949,57.281,85.949z M47.906,61.001c0.096,0,0.191,0.014,0.285,0.041c0.291,0.087,0.526,0.3,0.641,0.581l8.994,22.014l6.679-2.8l-9.001-22.03c-0.113-0.276-0.097-0.589,0.045-0.852s0.393-0.449,0.686-0.507l14.74-2.931L35,18.42v51.286l12.337-8.527C47.506,61.062,47.705,61.001,47.906,61.001z"/>
    </svg>`;
    
    // Add text element for cursor messages
    const textEl = document.createElement('div');
    textEl.className = 'cursor-flow-text';
    textEl.style.cssText = `
      position: absolute;
      left: 24px;
      bottom: 0;
      background-color: #fff;
      border: 1px solid #ddd;
      padding: 6px 10px;
      border-radius: 4px;
      box-shadow: 0 2px 4px rgba(0,0,0,0.2);
      font-size: 14px;
      white-space: nowrap;
      transform: translateY(calc(100% + 5px));
      display: none;
      max-width: 300px;
      z-index: 99999;
    `;
    cursor.appendChild(textEl);
    
    return cursor;
  }
  
  /**
   * Create highlight element for target element
   */
  static createHighlight(theme: ThemeOptions): HTMLElement {
    // Remove existing highlight if any
    const existingHighlight = document.getElementById('cursor-flow-highlight');
    if (existingHighlight) {
      existingHighlight.remove();
    }
    
    const highlight = document.createElement('div');
    highlight.id = 'cursor-flow-highlight';
    highlight.style.cssText = `
      position: absolute; 
      pointer-events: none;
      z-index: 9997;
      background-color: ${theme.highlightColor || 'rgba(34, 197, 94, 0.3)'};
      border: 2px solid ${theme.highlightBorderColor || '#22c55e'};
      border-radius: 4px;
      box-shadow: 0 0 0 4px rgba(34, 197, 94, 0.2);
      display: none;
    `;
    
    // Add animation styles if they don't exist
    if (!document.getElementById('cursor-flow-styles')) {
      const style = document.createElement('style');
      style.id = 'cursor-flow-styles';
      style.textContent = `
        @keyframes pulse {
          0% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0.4); }
          70% { box-shadow: 0 0 0 10px rgba(34, 197, 94, 0); }
          100% { box-shadow: 0 0 0 0 rgba(34, 197, 94, 0); }
        }
      `;
      document.head.appendChild(style);
    }
    
    return highlight;
  }
  
  /**
   * Attaches cursor to an element and ensures it stays attached
   */
  static moveCursorToElement(element: HTMLElement, cursor: HTMLElement | null, interaction: any): void {
    if (!cursor || !element) return;
    
    // Make sure cursor is visible
    cursor.style.display = 'block';
    
    // Add a position wrapper to the element if needed
    let positionWrapper = element.querySelector('.cursor-flow-position-wrapper') as HTMLElement | null;
    if (!positionWrapper) {
      // Save original position style
      const originalPosition = window.getComputedStyle(element).position;
      if (originalPosition === 'static') {
        element.style.position = 'relative';
      }
      
      // Create position wrapper
      positionWrapper = document.createElement('div');
      positionWrapper.className = 'cursor-flow-position-wrapper';
      positionWrapper.style.position = 'absolute';
      positionWrapper.style.top = '0';
      positionWrapper.style.left = '0';
      positionWrapper.style.width = '100%';
      positionWrapper.style.height = '100%';
      positionWrapper.style.pointerEvents = 'none';
      positionWrapper.style.zIndex = '999999';
      element.appendChild(positionWrapper);
    }
    
    // Remove cursor from its current parent and add to wrapper
    if (cursor.parentNode) {
      cursor.parentNode.removeChild(cursor);
    }
    
    // Position cursor at the bottom-right of element
    cursor.style.position = 'absolute';
    cursor.style.right = '-8px';
    cursor.style.bottom = '-8px';
    cursor.style.transition = 'none'; // No need for transition with direct attachment
    
    // Add to the wrapper
    positionWrapper.appendChild(cursor);
    
    // Update cursor text if available
    this.updateCursorText(cursor, interaction);
    
    // Make text visible after a short delay
    setTimeout(() => {
      const textEl = cursor.querySelector('.cursor-flow-text');
      if (textEl) {
        (textEl as HTMLElement).style.display = 'block';
      }
    }, 500);
  }
  
  /**
   * Update cursor text based on the interaction
   */
  private static updateCursorText(cursor: HTMLElement, interaction: any): void {
    const textEl = cursor.querySelector('.cursor-flow-text');
    if (!textEl) return;
    
    console.log('Updating cursor text for interaction', interaction);
    
    // Clear previous text
    textEl.textContent = '';
    
    // Default message based on interaction type
    let message = 'Click this element to continue';
    
    // Use custom message if provided in interaction
    if (interaction.customText) {
      console.log('Using custom text:', interaction.customText);
      message = interaction.customText;
    } else {
      console.log('No custom text found, using default');
      // Generate a message based on the element type
      const tagName = interaction.element.tagName.toLowerCase();
      const hasText = interaction.element.textContent && interaction.element.textContent.trim();
      
      if (tagName === 'a' && hasText) {
        message = `Click "${interaction.element.textContent.trim()}" link`;
      } else if (tagName === 'button' && hasText) {
        message = `Click "${interaction.element.textContent.trim()}" button`;
      } else if (tagName === 'input' && interaction.element.type === 'text') {
        message = `Click this text field`;
      } else if (tagName === 'input' && interaction.element.type === 'submit') {
        message = `Click the submit button`;
      }
    }
    
    console.log(`Set text element content to: ${message}`);
    textEl.textContent = message;
    
    // Adjust position to prevent text from going outside viewport
    setTimeout(() => {
      const textRect = (textEl as HTMLElement).getBoundingClientRect();
      const viewportWidth = window.innerWidth || document.documentElement.clientWidth;
      
      // If text extends beyond right edge of viewport
      if (textRect.right > viewportWidth) {
        // Flip to the left side of cursor
        (textEl as HTMLElement).style.left = 'auto';
        (textEl as HTMLElement).style.right = '24px';
      }
      
      // Ensure text is visible within viewport
      const textHeight = textRect.height;
      const cursorRect = cursor.getBoundingClientRect();
      const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
      
      // If too close to bottom, position above cursor
      if (cursorRect.bottom + textHeight + 10 > viewportHeight) {
        (textEl as HTMLElement).style.bottom = 'auto';
        (textEl as HTMLElement).style.top = '0';
        (textEl as HTMLElement).style.transform = 'translateY(calc(-100% - 5px))';
      }
    }, 10);
  }
  
  /**
   * Highlight an element
   */
  static highlightElement(element: HTMLElement, highlight: HTMLElement | null): void {
    if (!element || !highlight) return;
    
    // Get original position style
    const originalPosition = window.getComputedStyle(element).position;
    if (originalPosition === 'static') {
      element.style.position = 'relative';
    }
    
    // Remove highlight from its current parent
    if (highlight.parentNode) {
      highlight.parentNode.removeChild(highlight);
    }
    
    // Set up highlight as a direct child of the element
    highlight.style.position = 'absolute';
    highlight.style.top = '-4px';
    highlight.style.left = '-4px';
    highlight.style.width = 'calc(100% + 8px)';
    highlight.style.height = 'calc(100% + 8px)';
    highlight.style.display = 'block';
    highlight.style.animation = 'pulse 1.5s infinite';
    highlight.style.pointerEvents = 'none';
    
    // Add highlight directly to the element
    element.appendChild(highlight);
    
    // Scroll element into view if needed
    if (typeof element.scrollIntoView === 'function') {
      try {
        element.scrollIntoView({ behavior: 'smooth', block: 'center' });
      } catch (e) {
        // Fallback if smooth scrolling not supported
        element.scrollIntoView();
      }
    }
  }
  
  /**
   * Show a notification
   */
  static showNotification(options: NotificationOptions): HTMLElement {
    // Remove existing notification
    const existingNotification = document.getElementById('cursor-flow-notification');
    if (existingNotification) {
      existingNotification.remove();
    }
    
    // Create container element
    const notificationEl = document.createElement('div');
    notificationEl.id = 'cursor-flow-notification';
    
    // Set styles based on type
    const colors = {
      info: '#22c55e',     // Green
      warning: '#f97316',  // Orange
      success: '#22c55e',  // Green
      error: '#ef4444'     // Red
    };
    
    // Position next to the guide button
    const guideButton = document.getElementById('cursor-flow-start-button');
    const leftPosition = guideButton ? guideButton.offsetWidth + 30 : 20;
    
    notificationEl.style.cssText = `
      position: fixed;
      bottom: 20px;
      left: ${leftPosition}px;
      max-width: 320px;
      background-color: ${colors[options.type]};
      color: white;
      padding: 12px 16px;
      border-radius: 8px;
      font-family: system-ui, -apple-system, sans-serif;
      font-size: 14px;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      z-index: 10000;
      animation: cursorFlowFadeIn 0.3s ease;
    `;
    
    // Create content
    let contentHTML = '';
    
    if (options.title) {
      contentHTML += `<h3 style="margin-top: 0; color: white; font-size: 16px; margin-bottom: 8px;">${options.title}</h3>`;
    }
    
    contentHTML += `<p style="color: white; margin: 0; margin-bottom: ${options.buttons?.length ? '12px' : '0'};">${options.message}</p>`;
    
    // Add buttons if any
    if (options.buttons && options.buttons.length > 0) {
      contentHTML += '<div style="display: flex; justify-content: flex-start; gap: 10px; margin-top: 12px;">';
      
      options.buttons.forEach(button => {
        const isPrimary = button.primary !== false;
        const buttonStyle = isPrimary ? 
          `background-color: white; color: ${colors[options.type]}; font-weight: bold;` : 
          `background-color: rgba(255,255,255,0.2); color: white;`;
          
        contentHTML += `<button class="cursor-flow-notification-btn" style="
          ${buttonStyle}
          border: none;
          padding: 8px 12px;
          border-radius: 6px;
          cursor: pointer;
          font-size: 13px;"
        >${button.text}</button>`;
      });
      
      contentHTML += '</div>';
    }
    
    notificationEl.innerHTML = contentHTML;
    
    // Add close button
    const closeBtn = document.createElement('button');
    closeBtn.innerHTML = '×';
    closeBtn.style.cssText = `
      position: absolute;
      top: 8px;
      right: 8px;
      background: none;
      border: none;
      font-size: 18px;
      cursor: pointer;
      color: rgba(255,255,255,0.8);
      line-height: 1;
      padding: 0;
      width: 20px;
      height: 20px;
    `;
    closeBtn.onclick = () => notificationEl.remove();
    notificationEl.appendChild(closeBtn);
    
    // Add button click handlers
    const buttons = notificationEl.querySelectorAll('.cursor-flow-notification-btn');
    buttons.forEach((btn, index) => {
      if (options.buttons && options.buttons[index]) {
        btn.addEventListener('click', () => {
          options.buttons![index].onClick();
          notificationEl.remove();
        });
      }
    });
    
    // Add to DOM
    document.body.appendChild(notificationEl);
    
    // Make sure animation styles exist
    if (!document.getElementById('cursor-flow-notification-styles')) {
      const style = document.createElement('style');
      style.id = 'cursor-flow-notification-styles';
      style.textContent = `
        @keyframes cursorFlowFadeIn {
          from { opacity: 0; transform: translateY(20px); }
          to { opacity: 1; transform: translateY(0); }
        }
      `;
      document.head.appendChild(style);
    }
    
    // Auto close if enabled
    if (options.autoClose && options.autoClose > 0) {
      setTimeout(() => {
        notificationEl.style.opacity = '0';
        notificationEl.style.transition = 'opacity 0.5s ease';
        setTimeout(() => {
          if (document.body.contains(notificationEl)) {
            notificationEl.remove();
          }
        }, 500);
      }, options.autoClose);
    }
    
    return notificationEl;
  }
  
  /**
   * Show navigation prompt
   */
  static showNavigationPrompt(path: string, message: string): HTMLElement {
    return this.showNotification({
      title: 'Navigation Required',
      message: message || `Please navigate to ${path} to continue.`,
      type: 'info',
      autoClose: 0,
      buttons: [
        {
          text: 'Go to Page',
          onClick: () => {
            window.location.href = path;
          },
          primary: true
        },
        {
          text: 'Cancel Guide',
          onClick: () => {
            // Will need to access CursorFlow instance to stop it
            const cf = (window as any).CursorFlow;
            if (cf && cf.instance && typeof cf.instance.stop === 'function') {
              cf.instance.stop();
            }
          }
        }
      ]
    });
  }
} 