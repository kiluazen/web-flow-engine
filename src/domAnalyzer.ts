// This file will serve as our interface to build-dom-tree.js
import { ElementUtils } from './elementUtils';

export class DomAnalyzer {
  private static domMap: any = null;
  private static domTree: any = null;
  private static _usingFallback: boolean = false;
  
  /**
   * Initialize the DOM analyzer by building the DOM tree
   */
  static async initialize(viewportExpansion: number = 0, debugMode: boolean = false): Promise<boolean> {
    try {
      // Ensure script is loaded
      const scriptLoaded = await this.loadBuildDomTreeScript();
      if (!scriptLoaded) {
        // Set a flag to indicate we're in fallback mode
        this._usingFallback = true;
        return true; // Return success anyway so the app continues
      }
      
      // Build DOM tree with automatic highlighting disabled (we'll handle it)
      const result = window.buildDomTree({
        doHighlightElements: false,
        focusHighlightIndex: -1,
        viewportExpansion,
        debugMode
      });
      
      this.domMap = result;
      this.domTree = result.map;
      
      return true;
    } catch (error) {
      console.error('Failed to initialize DOM analyzer:', error);
      // Set flag to indicate we're in fallback mode
      this._usingFallback = true;
      return true; // Return success anyway so the app continues
    }
  }
  
  /**
   * Find an element that matches the description in the interaction
   */
  static findElement(interaction: any): HTMLElement | null {
    // First try using the existing ElementUtils method
    const element = ElementUtils.findElementFromInteraction(interaction);
    if (element) return element;
    
    // If that fails, try using our DOM tree
    if (!this.domMap) {
      // If DOM tree isn't built yet, build it
      this.initialize();
      if (!this.domMap) return null;
    }
    
    const candidateElements = this.findCandidateElements(interaction);
    if (candidateElements.length > 0) {
      return candidateElements[0];
    }
    
    return null;
  }
  
  /**
   * No-op: Highlight method - kept for API compatibility but does nothing now
   */
  static highlightElement(element: HTMLElement, index: number, color: string = "#FF6B00"): void {
    // This method intentionally left empty
    // UI highlighting is now exclusively handled by CursorFlowUI
  }
  
  /**
   * No-op: Clear highlights method - kept for API compatibility but does nothing now
   */
  static clearHighlights(): void {
    // This method intentionally left empty
    // UI highlighting is now exclusively handled by CursorFlowUI
  }
  
  /**
   * Find all candidate elements that match the interaction description
   */
  private static findCandidateElements(interaction: any): HTMLElement[] {
    const candidates: HTMLElement[] = [];
    
    // Handle different types of interactions
    if (!interaction || !this.domMap) return candidates;
    
    // Extract key properties for matching
    const targetText = interaction.text || interaction.element?.textContent;
    const tagName = interaction.element?.tagName;
    const role = interaction.element?.attributes?.role;
    
    // Search through DOM map for matching elements
    for (const id in this.domMap) {
      const node = this.domMap[id];
      
      // Skip non-interactive nodes
      if (!node.isInteractive) continue;
      
      // Match by tag name first
      if (tagName && node.tagName !== tagName.toLowerCase()) continue;
      
      // Match by role if specified
      if (role && node.attributes?.role !== role) continue;
      
      // Match by text content
      if (targetText) {
        let matched = false;
        
        // Check node's own text
        if (node.text && node.text.includes(targetText)) {
          matched = true;
        }
        
        // Check child text nodes
        if (!matched && node.children) {
          for (const childId of node.children) {
            const child = this.domMap[childId];
            if (child?.type === "TEXT_NODE" && child.text.includes(targetText)) {
              matched = true;
              break;
            }
          }
        }
        
        if (!matched) continue;
      }
      
      // If we've reached here, we have a candidate match
      // Now we need to find the actual DOM element using the XPath
      const element = this.findElementByXPath(node.xpath);
      if (element) {
        candidates.push(element);
      }
    }
    
    return candidates;
  }
  
  /**
   * Find a DOM element using XPath
   */
  private static findElementByXPath(xpath: string): HTMLElement | null {
    try {
      const result = document.evaluate(
        xpath, 
        document, 
        null, 
        XPathResult.FIRST_ORDERED_NODE_TYPE, 
        null
      );
      return result.singleNodeValue as HTMLElement;
    } catch (e) {
      console.error('XPath evaluation failed:', e);
      return null;
    }
  }
  
  /**
   * Load the build-dom-tree.js script
   */
  static loadBuildDomTreeScript(): Promise<boolean> {
    return new Promise((resolve) => {
      // Check if already loaded
      if (typeof window.buildDomTree === 'function') {
        resolve(true);
        return;
      }
      
      // FIX: Remove the leading slash to make the path relative
      const scriptPath = 'build-dom-tree.js'; // Relative to current URL
      
      const script = document.createElement('script');
      script.src = scriptPath;
      script.async = true;
      
      script.onload = () => {
        if (typeof window.buildDomTree === 'function') {
          console.log('build-dom-tree.js loaded successfully');
          resolve(true);
        } else {
          console.error('build-dom-tree.js loaded but function not found');
          resolve(false);
        }
      };
      
      script.onerror = () => {
        console.error('Failed to load build-dom-tree.js');
        resolve(false);
      };
      
      document.head.appendChild(script);
    });
  }
}

// Add type definition for the global buildDomTree function
declare global {
  interface Window {
    buildDomTree: (args: any) => any;
  }
} 