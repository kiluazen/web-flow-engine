/**
 * Provides selective, deeper validation for candidate HTML elements
 * using logic inspired by browser automation internals.
 * Designed to be used *after* a primary element finding mechanism.
 */
export class SelectiveDomAnalyzer {
    // Simple cache for validation checks within a single step execution
    private static VALIDATION_CACHE = {
        boundingRects: new WeakMap<Element, DOMRect>(),
        computedStyles: new WeakMap<Element, CSSStyleDeclaration>(),
    };

    /**
     * Clears the internal cache. Should be called before processing a new step.
     */
    static clearCache(): void {
        this.VALIDATION_CACHE.boundingRects = new WeakMap();
        this.VALIDATION_CACHE.computedStyles = new WeakMap();
        if (this.debugMode) {
            console.log('[SelectiveDomAnalyzer] Cache cleared.');
        }
    }

    // --- Configuration ---
    private static debugMode = false; // Set to true for verbose logging

    static setDebugMode(enabled: boolean): void {
        this.debugMode = enabled;
    }

    // --- Core Validation Method ---

    /**
     * Validates if a candidate element is suitable for interaction based on
     * visibility, interactivity, and occlusion checks.
     * @param element The candidate HTMLElement found by a primary finder.
     * @param interaction The original interaction data (optional, for context).
     * @returns True if the element is deemed valid, false otherwise.
     */
    static validateCandidateElement(element: HTMLElement, interaction?: any): boolean {
        if (!element || !(element instanceof HTMLElement)) {
            if (this.debugMode) console.log('[SelectiveDomAnalyzer] Validation failed: Invalid element provided.');
            return false;
        }

        const checkStartTime = this.debugMode ? performance.now() : 0;
        let isValid = true;
        let failureReason = '';

        // 1. Visibility Check
        if (!this.isElementVisible(element)) {
            isValid = false;
            failureReason = 'Element not visible (size, display, visibility)';
        }

        // 2. Interactivity Check (only if visible)
        if (isValid && !this.isInteractiveElement(element)) {
            // Don't immediately fail, but log it. Some elements might be containers
            // that become interactive later, or the primary finder was wrong.
            if (this.debugMode) {
                console.log(`[SelectiveDomAnalyzer] Element ${element.tagName}#${element.id} is visible but not marked interactive by detailed check.`);
            }
            // Depending on strictness, you might set isValid = false here.
            // Let's keep it potentially valid if it's visible for now.
        }

        // 3. Occlusion Check (Topmost Element) (only if visible)
        if (isValid && !this.isTopElement(element)) {
            isValid = false;
            failureReason = 'Element is obscured by another element';
        }

        // 4. (Optional) Text Content Re-verification
        if (isValid && interaction?.element?.textContent) {
            if (!this.isTextMatch(element, interaction.element.textContent)) {
                 // This could be due to dynamic content. Log warning but don't necessarily fail.
                 if (this.debugMode) {
                    console.warn(`[SelectiveDomAnalyzer] Text content mismatch for ${element.tagName}#${element.id}. Expected: "${interaction.element.textContent}", Found: "${element.textContent?.trim()}"`);
                 }
                 // Decide if this should be a hard failure based on requirements
                 // isValid = false;
                 // failureReason = 'Text content mismatch';
            }
        }


        if (this.debugMode) {
            const duration = performance.now() - checkStartTime;
            if (isValid) {
                console.log(`[SelectiveDomAnalyzer] Validation PASSED for ${element.tagName}#${element.id} (took ${duration.toFixed(2)}ms)`);
            } else {
                console.log(`[SelectiveDomAnalyzer] Validation FAILED for ${element.tagName}#${element.id}: ${failureReason} (took ${duration.toFixed(2)}ms)`);
            }
        }

        return isValid;
    }

    // --- Helper Functions (Copied/Adapted from build-dom-tree.js logic) ---

    // --- Caching Helpers ---
    private static getCachedBoundingRect(element: Element): DOMRect | null {
        if (this.VALIDATION_CACHE.boundingRects.has(element)) {
            return this.VALIDATION_CACHE.boundingRects.get(element) || null;
        }
        try {
            const rect = element.getBoundingClientRect();
            if (rect) {
                this.VALIDATION_CACHE.boundingRects.set(element, rect);
            }
            return rect;
        } catch (e) {
            if (this.debugMode) console.warn('[SelectiveDomAnalyzer] Error getting BoundingRect:', e);
            return null;
        }
    }

    private static getCachedComputedStyle(element: Element): CSSStyleDeclaration | null {
        if (this.VALIDATION_CACHE.computedStyles.has(element)) {
            return this.VALIDATION_CACHE.computedStyles.get(element) || null;
        }
         try {
            const style = window.getComputedStyle(element);
            if (style) {
                this.VALIDATION_CACHE.computedStyles.set(element, style);
            }
            return style;
        } catch (e) {
             if (this.debugMode) console.warn('[SelectiveDomAnalyzer] Error getting ComputedStyle:', e);
            return null;
        }
    }

    // --- Visibility Check ---
    private static isElementVisible(element: HTMLElement): boolean {
        const style = this.getCachedComputedStyle(element);
        const rect = this.getCachedBoundingRect(element);

        if (!style || !rect) return false;

        // Check basic CSS properties
        if (style.visibility === 'hidden' || style.display === 'none' || style.opacity === '0') {
            return false;
        }

        // Check if the element has zero dimensions, considering potential borders/padding
        // Use offsetWidth/offsetHeight as it includes borders and padding
        if (element.offsetWidth <= 0 || element.offsetHeight <= 0) {
             // Check if it's potentially a container with visible children (less strict)
             // For simplicity here, we stick to offset dimensions.
            return false;
        }

         // Check if element is within viewport bounds (optional, could be handled separately)
         // const isInViewport = rect.top < window.innerHeight && rect.bottom > 0 && rect.left < window.innerWidth && rect.right > 0;
         // if (!isInViewport) return false;

        // Check parent visibility recursively (can be expensive)
        // let parent = element.parentElement;
        // while (parent && parent !== document.body) {
        //     const parentStyle = window.getComputedStyle(parent);
        //     if (parentStyle.visibility === 'hidden' || parentStyle.display === 'none' || parentStyle.opacity === '0') {
        //         return false;
        //     }
        //     parent = parent.parentElement;
        // }

        return true;
    }

    // --- Interactivity Check ---
    private static isInteractiveElement(element: HTMLElement): boolean {
        // Simplified version of the logic in build-dom-tree.js
         if (!element || element.nodeType !== Node.ELEMENT_NODE) {
            return false;
        }

        const tagName = element.tagName.toLowerCase();
        const interactiveElements = new Set([
            "a", "button", "details", "embed", "input", "select", "textarea", "summary", "canvas"
        ]);
        const interactiveRoles = new Set([
            'button', 'checkbox', 'combobox', 'link', 'menuitem', 'menuitemcheckbox',
            'menuitemradio', 'option', 'radio', 'searchbox', 'slider', 'spinbutton',
            'switch', 'tab', 'textbox', 'treeitem'
        ]);

        if (interactiveElements.has(tagName)) return true;

        const role = element.getAttribute("role")?.toLowerCase();
        if (role && interactiveRoles.has(role)) return true;

        if (element.hasAttribute("onclick")) return true;
        if (element.hasAttribute("contenteditable") && element.getAttribute("contenteditable") !== "false") return true;

        // Check tabindex (consider only explicitly focusable elements)
        const tabIndex = element.getAttribute("tabindex");
        if (tabIndex !== null && tabIndex !== "-1") return true;

        // Check if it's a label associated with a form control
        if (tagName === 'label' && element.hasAttribute('for')) {
             const control = document.getElementById(element.getAttribute('for') || '');
             if (control) return this.isInteractiveElement(control as HTMLElement); // Recurse
        }

        // Check common patterns for custom interactive elements (less reliable)
        if (element.style.cursor === 'pointer') return true;
        // Could add class name checks, but that's brittle

        return false;
    }


    // --- Topmost Element Check ---
    private static isTopElement(element: HTMLElement): boolean {
        const rect = this.getCachedBoundingRect(element);
        if (!rect || rect.width === 0 || rect.height === 0) {
            // If element has no dimensions or is invalid, it can't be the top element
            return false;
        }

        // Check points within the element against elementFromPoint
        // Using multiple points increases reliability for elements with complex shapes or borders
        const pointsToCheck = [
            { x: rect.left + rect.width / 2, y: rect.top + rect.height / 2 }, // Center
            { x: rect.left + 1, y: rect.top + 1 },                             // Top-left corner (inset slightly)
            { x: rect.right - 1, y: rect.top + 1 },                            // Top-right corner
            { x: rect.left + 1, y: rect.bottom - 1 },                           // Bottom-left corner
            { x: rect.right - 1, y: rect.bottom - 1 }                          // Bottom-right corner
        ];

        // If the element is small, just check the center
        if (rect.width < 5 || rect.height < 5) {
            pointsToCheck.splice(1); // Keep only the center point
        }

        let doc = element.ownerDocument;
        let rootNode: Node | ShadowRoot = element.getRootNode();

        for (const point of pointsToCheck) {
            // Ensure point coordinates are within document bounds if needed
            const checkX = Math.max(0, Math.min(point.x, window.innerWidth - 1));
            const checkY = Math.max(0, Math.min(point.y, window.innerHeight - 1));

            try {
                let topElementAtPoint: Element | null = null;
                // Use the correct context for elementFromPoint (document or shadowRoot)
                if (rootNode instanceof ShadowRoot) {
                    topElementAtPoint = rootNode.elementFromPoint(checkX, checkY);
                } else {
                    topElementAtPoint = doc.elementFromPoint(checkX, checkY);
                }


                if (!topElementAtPoint) {
                     // If elementFromPoint returns null, something might be wrong, or we are outside the viewport/document.
                     // Consider the element potentially obscured for this point.
                     if (this.debugMode) console.log(`[SelectiveDomAnalyzer] elementFromPoint(${checkX}, ${checkY}) returned null.`);
                     continue; // Check next point
                }

                // Check if the found element is the target element or a descendant of it.
                let current: Element | null = topElementAtPoint;
                let isMatchOrDescendant = false;
                while (current) {
                    if (current === element) {
                        isMatchOrDescendant = true;
                        break;
                    }
                    // Stop traversal at the root node boundary (document or shadow root)
                    if (current === rootNode || current === doc.body || current === doc.documentElement) {
                        break;
                    }
                    current = current.parentElement;
                }

                if (!isMatchOrDescendant) {
                    if (this.debugMode) {
                        console.log(`[SelectiveDomAnalyzer] Occlusion detected at point (${checkX}, ${checkY}). Expected ${element.tagName}#${element.id}, but found ${topElementAtPoint.tagName}#${topElementAtPoint.id}`);
                    }
                    return false; // Obscured at this point
                }
                // If this point is okay, continue checking other points

            } catch (e) {
                 if (this.debugMode) console.warn('[SelectiveDomAnalyzer] Error during elementFromPoint check:', e);
                 // Be conservative: if checks fail, assume it might be obscured
                 return false;
            }
        }

        // If all checked points resolve to the element or its descendants, it's likely the top element.
        return true;
    }

    // --- Text Match Helper ---
     private static isTextMatch(element: HTMLElement, targetText: string | undefined): boolean {
        if (targetText === undefined || targetText === null) return true; // No text to match

        const elementText = element.textContent?.trim() || '';
        const searchText = targetText.trim();

        // Add flexibility: check innerText and value as well
        const innerText = element.innerText?.trim() || '';
        const value = (element as HTMLInputElement).value?.trim(); // Check input value

        return elementText === searchText ||
               innerText === searchText ||
               (value !== undefined && value === searchText);
    }
} 