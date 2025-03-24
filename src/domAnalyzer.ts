// This file will serve as our interface to build-dom-tree.js
import { ElementUtils } from './elementUtils';

export class DomAnalyzer {
  private static domMap: any = null;
  private static domTree: any = null;
  private static highlightContainerId = "hyphen-highlight-container";
  
  /**
   * Initialize the DOM analyzer by building the DOM tree
   */
  static async initialize(viewportExpansion: number = 0, debugMode: boolean = false): Promise<boolean> {
    try {
      // Ensure script is loaded
      const scriptLoaded = await this.loadBuildDomTreeScript();
      if (!scriptLoaded) {
        console.error('Could not load build-dom-tree.js');
        return false;
      }
      
      // Clear any existing highlights
      this.clearHighlights();
      
      // Build DOM tree with automatic highlighting disabled (we'll handle it)
      const result = window.buildDomTree({
        doHighlightElements: false,
        focusHighlightIndex: -1,
        viewportExpansion,
        debugMode
      });
      
      this.domTree = result;
      this.domMap = result.map;
      
      console.log('DOM tree built successfully, found nodes:', Object.keys(this.domMap).length);
      return true;
    } catch (error) {
      console.error('Failed to initialize DOM analyzer:', error);
      return false;
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
   * Highlight an element with the enhanced highlighter
   */
  static highlightElement(element: HTMLElement, index: number, color: string = "#FF6B00"): void {
    if (!element) return;
    
    // Create or get highlight container
    let container = document.getElementById(this.highlightContainerId);
    if (!container) {
      container = document.createElement("div");
      container.id = this.highlightContainerId;
      container.style.position = "fixed";
      container.style.pointerEvents = "none";
      container.style.top = "0";
      container.style.left = "0";
      container.style.width = "100%";
      container.style.height = "100%";
      container.style.zIndex = "2147483647";
      document.body.appendChild(container);
    }
    
    // Get element position
    const rect = element.getBoundingClientRect();
    
    // Generate highlight colors
    const baseColor = color;
    const backgroundColor = baseColor + "1A"; // 10% opacity
    
    // Create highlight overlay
    const overlay = document.createElement("div");
    overlay.className = `hyphen-highlight-${index}`;
    overlay.style.position = "fixed";
    overlay.style.border = `2px solid ${baseColor}`;
    overlay.style.backgroundColor = backgroundColor;
    overlay.style.pointerEvents = "none";
    overlay.style.boxSizing = "border-box";
    
    // Set position and size
    overlay.style.top = `${rect.top}px`;
    overlay.style.left = `${rect.left}px`;
    overlay.style.width = `${rect.width}px`;
    overlay.style.height = `${rect.height}px`;
    
    // Create and position label
    const label = document.createElement("div");
    label.className = "hyphen-highlight-label";
    label.style.position = "fixed";
    label.style.background = baseColor;
    label.style.color = "white";
    label.style.padding = "1px 4px";
    label.style.borderRadius = "4px";
    label.style.fontSize = "12px";
    
    // Position label
    const labelWidth = 20;
    const labelHeight = 16;
    let labelTop = rect.top + 2;
    let labelLeft = rect.left + rect.width - labelWidth - 2;
    
    if (rect.width < labelWidth + 4 || rect.height < labelHeight + 4) {
      labelTop = rect.top - labelHeight - 2;
      labelLeft = rect.left + rect.width - labelWidth;
    }
    
    label.style.top = `${labelTop}px`;
    label.style.left = `${labelLeft}px`;
    label.textContent = index.toString();
    
    // Add to container
    container.appendChild(overlay);
    container.appendChild(label);
    
    // Update positions on scroll and resize
    const updatePositions = () => {
      const newRect = element.getBoundingClientRect();
      overlay.style.top = `${newRect.top}px`;
      overlay.style.left = `${newRect.left}px`;
      overlay.style.width = `${newRect.width}px`;
      overlay.style.height = `${newRect.height}px`;
      
      let newLabelTop = newRect.top + 2;
      let newLabelLeft = newRect.left + newRect.width - labelWidth - 2;
      
      if (newRect.width < labelWidth + 4 || newRect.height < labelHeight + 4) {
        newLabelTop = newRect.top - labelHeight - 2;
        newLabelLeft = newRect.left + newRect.width - labelWidth;
      }
      
      label.style.top = `${newLabelTop}px`;
      label.style.left = `${newLabelLeft}px`;
    };
    
    window.addEventListener('scroll', updatePositions);
    window.addEventListener('resize', updatePositions);
  }
  
  /**
   * Clear all highlights
   */
  static clearHighlights(): void {
    const container = document.getElementById(this.highlightContainerId);
    if (container) {
      container.innerHTML = '';
    }
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
      
      // Get the script path - assuming it's in the same directory as this file
      const scriptPath = '/build-dom-tree.js'; // Adjust path as needed
      
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