export class ElementUtils {
    static findElementFromInteraction(interaction: any, requireExactMatch: boolean = true): HTMLElement | null {
      if (!interaction) return null;
      
      try {
        // Get element data if available
        const element = interaction.element || {};
        const findingDetails = { tried: [] as string[] };
        
        // STRATEGY 1: CSS Selector (fastest & highest confidence)
        if (element.cssSelector) {
          findingDetails.tried.push("CSS Selector");
          try {
            const foundElement = document.querySelector(element.cssSelector) as HTMLElement;
            if (foundElement) {
              // NEW: Only accept if text content matches or text isn't specified
              if (!element.textContent || foundElement.textContent?.trim() === element.textContent.trim()) {
                console.log('✓ Element found using CSS selector strategy');
                return foundElement; // Fast exit!
              } else {
                console.log(`⚠️ CSS selector matched element with wrong text. Expected "${element.textContent}", found "${foundElement.textContent?.trim()}"`);
                // Continue to other strategies instead of accepting wrong element
              }
            }
            
            // Mantine UI specific enhancement for tab elements
            if (element.cssSelector.includes('mantine-') && element.cssSelector.includes('-tab-')) {
              findingDetails.tried.push("Mantine Tab ID");
              // Extract the path part after "-tab-"
              const pathPart = element.cssSelector.split('-tab-')[1];
              if (pathPart) {
                const cleanPath = pathPart.replace(/[#"'\[\]]/g, '');
                const flexibleSelector = `[id$="-tab-${cleanPath}"]`;
                const mantineElement = document.querySelector(flexibleSelector) as HTMLElement;
                
                if (mantineElement) {
                  console.log('✓ Element found using Mantine-specific ID strategy');
                  return mantineElement;
                }
              }
            }
          } catch (e) {
            // Invalid selector, continue to next strategy
          }
        }
        
        // STRATEGY 2: Attribute selector for links (high confidence)
        if (element.tagName === 'A' && element.attributes) {
          findingDetails.tried.push("Link Attributes");
          try {
            const attrs = typeof element.attributes === 'string' 
              ? JSON.parse(element.attributes) 
              : element.attributes;
              
            if (attrs.href) {
              const foundElement = document.querySelector(`a[href="${attrs.href}"]`) as HTMLElement;
              if (foundElement) {
                console.log('✓ Element found using link attributes strategy');
                return foundElement; // Fast exit!
              }
            }
          } catch (e) {
            // Invalid attributes, continue
          }
        }
        
        // STRATEGY 3: Button/Tab with role and text (high confidence)
        if (element.tagName === 'BUTTON' && element.textContent && 
            (element.attributes?.includes('role="tab"') || element.semanticClasses?.includes('Tab'))) {
          findingDetails.tried.push("Tab by Role+Text");
          try {
            const tabElements = document.querySelectorAll('button[role="tab"]');
            
            // Find tab with exact text content
            for (const tab of tabElements) {
              if (tab.textContent?.trim() === element.textContent.trim()) {
                console.log('✓ Element found using tab role+text strategy');
                return tab as HTMLElement;
              }
            }
          } catch (e) {
            // Error finding tab by role, continue
          }
        }
        
        // STRATEGY 4: Interactive element + exact text (medium-high confidence)
        const textContent = (element.textContent || interaction.text || '').trim();
        if (textContent) {
          findingDetails.tried.push("Interactive Element+Text");
          // Target the most likely elements first
          const selector = element.tagName 
            ? element.tagName.toLowerCase() 
            : 'a, button, [role="button"], input[type="submit"]';
            
          // Use faster getElementsByTagName when possible
          let candidates: Element[] = [];
          if (selector === 'a') {
            candidates = Array.from(document.getElementsByTagName('a'));
          } else if (selector === 'button') {
            candidates = Array.from(document.getElementsByTagName('button'));
          } else {
            candidates = Array.from(document.querySelectorAll(selector));
          }
          
          // Find exact text match
          const foundElement = candidates.find(el => 
            el.textContent?.trim() === textContent
          ) as HTMLElement;
          
          if (foundElement) {
            console.log('✓ Element found using interactive element+text strategy');
            return foundElement; // Fast exit!
          }
        }
        
        // STRATEGY 5: Fallback to explicit selector (medium-high confidence)
        if (interaction.selector) {
          findingDetails.tried.push("Explicit Selector");
          try {
            const foundElement = document.querySelector(interaction.selector) as HTMLElement;
            if (foundElement) {
              console.log('✓ Element found using explicit selector strategy');
              return foundElement;
            }
          } catch (e) {
            // Invalid selector, continue
          }
        }
        
        // No element found after all strategies
        console.log(`❌ Element not found. Tried strategies: ${findingDetails.tried.join(', ')}`);
        return null;
      } catch (error) {
        console.error("Error finding element:", error);
        return null;
      }
    }
  
    static findElementByText(selector: string, text: string, exact: boolean = true): HTMLElement | null {
      return this.querySelectorAllWithText(selector, text, exact)[0] as HTMLElement || null;
    }
  
    static compareUrls(url1: string, url2: string): boolean {
      if (!url1 || !url2) {
        console.log('URL COMPARE: One or both URLs are empty', { url1, url2 });
        return false;
      }
      
      try {
        // Parse URLs to handle components properly
        const parseUrl = (url: string) => {
          try {
            // Add protocol if missing for URL parsing
            if (!url.match(/^https?:\/\//)) {
              url = 'http://' + url;
            }
            
            const parsed = new URL(url);
            return {
              hostname: parsed.hostname,
              pathname: parsed.pathname.replace(/\/$/, '') || '/', // Remove trailing slash but keep root slash
              search: parsed.search,
              hash: parsed.hash
            };
          } catch (error) {
            console.error('Failed to parse URL:', url, error);
            // Return a fallback structure
            return {
              hostname: url.split('/')[0],
              pathname: '/' + url.split('/').slice(1).join('/'),
              search: '',
              hash: ''
            };
          }
        };
        
        const parsedUrl1 = parseUrl(url1);
        const parsedUrl2 = parseUrl(url2);
        
        // Debug log
        console.log('URL COMPARE DETAILS:', {
          url1: { original: url1, parsed: parsedUrl1 },
          url2: { original: url2, parsed: parsedUrl2 }
        });
        
        // Special case: If either URL is localhost, only compare paths
        const isLocalhost1 = parsedUrl1.hostname.includes('localhost') || parsedUrl1.hostname.includes('127.0.0.1');
        const isLocalhost2 = parsedUrl2.hostname.includes('localhost') || parsedUrl2.hostname.includes('127.0.0.1');
        
        // If one is localhost and the other isn't, ignore hostname comparison
        if (isLocalhost1 || isLocalhost2) {
          // When using localhost, paths must still match exactly
          const pathsMatch = parsedUrl1.pathname === parsedUrl2.pathname;
          console.log('URL COMPARE RESULT (localhost mode):', { 
            pathsMatch,
            path1: parsedUrl1.pathname, 
            path2: parsedUrl2.pathname 
          });
          return pathsMatch;
        }
        
        // For non-localhost URLs, compare both hostname and pathname
        const hostnameMatch = parsedUrl1.hostname.toLowerCase() === parsedUrl2.hostname.toLowerCase();
        const pathMatch = parsedUrl1.pathname === parsedUrl2.pathname;
        const result = hostnameMatch && pathMatch;
        
        console.log('URL COMPARE RESULT (standard mode):', { 
          result, 
          hostnameMatch, 
          pathMatch,
          hostname1: parsedUrl1.hostname,
          hostname2: parsedUrl2.hostname,
          path1: parsedUrl1.pathname, 
          path2: parsedUrl2.pathname 
        });
        
        return result;
      } catch (error) {
        console.error('Error comparing URLs:', error);
        
        // Fallback to simple string comparison if URL parsing fails
        const fallbackResult = url1.toLowerCase() === url2.toLowerCase();
        console.log('URL COMPARE FALLBACK RESULT:', fallbackResult);
        return fallbackResult;
      }
    }
  
    static highlightElement(element: HTMLElement): void {
      if (!element) return;
      
      // Add highlight class to element
      element.classList.add('hyphen-highlighted-element');
    }
  
    static removeHighlight(element: HTMLElement): void {
      if (!element) return;
      
      // Remove highlight class from element
      element.classList.remove('hyphen-highlighted-element');
    }
  
    // Helper methods
    static ensureContainsSelector(): void {
      // Add :contains polyfill if needed
    }
  
    static querySelectorAllWithText(selector: string, text: string, exact: boolean = true): Element[] {
      try {
        // Get all elements matching the selector
        const elements = Array.from(document.querySelectorAll(selector));
        
        // Filter by text content
        return elements.filter(el => {
          const elementText = el.textContent?.trim() || '';
          const searchText = text.trim();
          
          // Also check for value attribute (buttons, inputs)
          const valueText = el.getAttribute('value')?.trim() || '';
          
          if (exact) {
            return elementText === searchText || valueText === searchText;
          } else {
            return elementText.toLowerCase().includes(searchText.toLowerCase()) || 
                   valueText.toLowerCase().includes(searchText.toLowerCase());
          }
        });
      } catch (e) {
        console.error('Error in querySelectorAllWithText:', e);
        return [];
      }
    }
  
    static isElementInView(element: HTMLElement): boolean {
      if (!element) return false;
      
      const rect = element.getBoundingClientRect();
      
      return (
        rect.top >= 0 &&
        rect.left >= 0 &&
        rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
        rect.right <= (window.innerWidth || document.documentElement.clientWidth)
      );
    }
  
    static scrollToElement(element: HTMLElement): Promise<void> {
      return new Promise((resolve) => {
        if (!element) {
          resolve();
          return;
        }
        
        // Check if element exists in DOM
        if (!document.body.contains(element)) {
          console.warn('Element not found in DOM for scrolling');
          resolve();
          return;
        }
        
        // Get element's position relative to the viewport
        const rect = element.getBoundingClientRect();
        
        // Calculate if element is in view
        const isInView = (
          rect.top >= 0 &&
          rect.left >= 0 &&
          rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
          rect.right <= (window.innerWidth || document.documentElement.clientWidth)
        );
        
        if (isInView) {
          // Already in view, no need to scroll
          resolve();
          return;
        }
        
        // Use scrollIntoView with smooth behavior
        try {
          // Check if scrollIntoView is supported with options
          element.scrollIntoView({ 
            behavior: 'smooth', 
            block: 'center' 
          });
          
          // Set up a timeout to catch when scrolling is likely done
          const scrollTimeout = setTimeout(() => {
            // Re-check position after scrolling
            const newRect = element.getBoundingClientRect();
            if (newRect.top < 0 || newRect.bottom > window.innerHeight) {
              // If still not fully in view, try a different approach
              const elemTop = newRect.top + window.scrollY;
              const middle = elemTop - (window.innerHeight / 2) + (newRect.height / 2);
              window.scrollTo({
                top: middle,
                behavior: 'smooth'
              });
            }
            resolve();
          }, 800); // Wait longer than the animation time
          
          // Also resolve on scroll end if possible
          let scrollCount = 0;
          const scrollEndDetection = () => {
            scrollCount++;
            if (scrollCount > 5) {
              clearTimeout(scrollTimeout);
              window.removeEventListener('scroll', scrollEndDetection);
              resolve();
            }
          };
          
          window.addEventListener('scroll', scrollEndDetection, { passive: true });
        } catch (e) {
          // Fallback for browsers that don't support smooth scrolling
          const elemTop = rect.top + window.scrollY;
          const middle = elemTop - (window.innerHeight / 2) + (rect.height / 2);
          window.scrollTo(0, middle);
          setTimeout(resolve, 100);
        }
      });
    }
  }