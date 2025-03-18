/**
 * Utilities for finding elements on the page
 */
export class ElementUtils {
  /**
   * Find an element in the DOM based on an interaction record
   * with strict matching requirements
   */
  static findElementFromInteraction(interaction: any, requireExactMatch: boolean = true): HTMLElement | null {
    console.log('Finding element for interaction:', interaction);
    
    // First verify URL matches current page
    const currentUrl = window.location.href;
    const currentPath = window.location.pathname;
    
    // Check if we're on the right page before attempting to find elements
    if (requireExactMatch) {
      const urlMatches = this.compareUrls(currentUrl, interaction.pageInfo.url) || 
                         this.compareUrls(currentPath, interaction.pageInfo.path);
      
      if (!urlMatches) {
        console.warn('URL mismatch - current:', currentUrl, 'expected:', interaction.pageInfo.url);
        return null;
      }
    }
    
    // Try multiple strategies to find the element
    let element = null;
    
    // Strategy 1: Try by ID if available
    if (interaction.element.id) {
      element = document.getElementById(interaction.element.id);
      if (element) {
        console.log('Found element by ID');
        return element;
      }
    }
    
    // Strategy 2: Try by CSS selector
    if (interaction.element.cssSelector) {
      try {
        element = document.querySelector(interaction.element.cssSelector);
        if (element) {
          console.log('Found element by CSS selector');
          return element as HTMLElement;
        }
      } catch (e) {
        console.warn('Invalid CSS selector', interaction.element.cssSelector);
      }
    }
    
    // Strategy 3: Try by text content for links and buttons
    if (interaction.element.textContent) {
      const textContent = interaction.element.textContent.trim();
      
      // First try exact text match on likely elements
      try {
        const tagName = interaction.element.tagName.toLowerCase();
        const exactElements = this.querySelectorAllWithText(tagName || '*', textContent, true);
        
        if (exactElements.length === 1) {
          console.log('Found element by exact text match');
          return exactElements[0] as HTMLElement;
        } else if (exactElements.length > 1 && !requireExactMatch) {
          // If multiple matches and we don't require exact, try to find best match
          console.log('Found multiple elements by exact text, looking for best match');
          
          // Try to find elements that match more properties
          const bestMatches = Array.from(exactElements).filter(el => {
            const matchesTagName = el.tagName.toLowerCase() === tagName.toLowerCase();
            return matchesTagName;
          });
          
          if (bestMatches.length > 0) {
            return bestMatches[0] as HTMLElement;
          }
        }
        
        // No exact matches, try contains if not requiring exact match
        if (!requireExactMatch) {
          const containsElements = this.querySelectorAllWithText(tagName || '*', textContent, false);
          if (containsElements.length >= 1) {
            console.log('Found element by partial text match');
            return containsElements[0] as HTMLElement;
          }
        }
      } catch (e) {
        console.warn('Error finding element by text content', e);
      }
    }
    
    // Strategy 4: Try by path
    if (interaction.element.path && interaction.element.path.length) {
      try {
        // Convert path to CSS selector
        const pathSelector = interaction.element.path.join(' > ');
        element = document.querySelector(pathSelector);
        if (element) {
          console.log('Found element by path');
          return element as HTMLElement;
        }
      } catch (e) {
        console.warn('Invalid path selector', interaction.element.path);
      }
    }
    
    console.warn('Could not find element for interaction', interaction);
    return null;
  }
  
  /**
   * Compare two URLs for functional equivalence
   */
  static compareUrls(url1: string, url2: string): boolean {
    if (!url1 || !url2) return false;
    
    // Normalize URLs for comparison
    const normalize = (url: string): string => {
      // Remove protocol
      let normalized = url.replace(/^(https?:\/\/)?/, '');
      
      // Remove trailing slashes
      normalized = normalized.replace(/\/$/, '');
      
      // Remove query parameters
      normalized = normalized.replace(/\?.*$/, '');
      
      // Remove hash
      normalized = normalized.replace(/#.*$/, '');
      
      return normalized.toLowerCase();
    };
    
    return normalize(url1) === normalize(url2);
  }
  
  /**
   * Find an element by its position on the page
   */
  static findElementByPosition(position: { x: number, y: number }): HTMLElement | null {
    console.warn('Position-based element finding is deprecated and unreliable');
    return null; // Disabled for reliability
  }
  
  /**
   * Polyfill for :contains selector
   */
  static ensureContainsSelector() {
    // Already added the polyfill
    if ((window as any).__cursorFlowContainsSelectorAdded) {
      return;
    }
    
    (window as any).__cursorFlowContainsSelectorAdded = true;
  }
  
  /**
   * Query for elements containing specific text
   */
  static querySelectorAllWithText(selector: string, text: string, exact: boolean = true): Element[] {
    // First try the most likely elements for interactions
    const prioritySelectors = ['a', 'button', 'input[type="submit"]', 'input[type="button"]', '.btn'];
    let elements: Element[] = [];
    
    // Try priority selectors first if we're looking for any element
    if (selector === '*') {
      for (const prioritySelector of prioritySelectors) {
        const selected = this.getElementsWithText(prioritySelector, text, exact);
        if (selected.length > 0) {
          elements = elements.concat(selected);
        }
      }
    }
    
    // If we haven't found anything or we're looking for a specific selector
    if (elements.length === 0) {
      elements = this.getElementsWithText(selector, text, exact);
    }
    
    // If still not found, try a broader search
    if (elements.length === 0 && selector !== '*') {
      elements = this.getElementsWithText('*', text, exact);
    }
    
    return elements;
  }
  
  /**
   * Helper method to get elements with specific text
   */
  private static getElementsWithText(selector: string, text: string, exact: boolean): Element[] {
    const elements = Array.from(document.querySelectorAll(selector));
    return elements.filter(el => {
      const elText = el.textContent?.trim() || '';
      return exact ? elText === text : elText.includes(text);
    });
  }
} 