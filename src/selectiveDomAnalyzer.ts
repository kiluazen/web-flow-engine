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
        console.log('[SelectiveDomAnalyzer] Cache cleared.');
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
            console.log('[SelectiveDomAnalyzer] Validation failed: Invalid element provided.');
            return false;
        }

        const checkStartTime = performance.now();
        let isValid = true;
        let failureReason = '';

        // 1. Visibility Check
        if (!this.isElementVisible(element)) {
            isValid = false;
            failureReason = 'Element not visible (size, display, visibility)';
        }

        // 2. Interactivity Check (only if visible)
        if (isValid && !this.isInteractiveElement(element)) {
            console.log(`[SelectiveDomAnalyzer] Element ${element.tagName}#${element.id} is visible but not marked interactive by detailed check.`);
            // Depending on strictness, you might set isValid = false here.
            // Let's keep it potentially valid if it's visible for now.
        }

        // 3. Occlusion Check (Topmost Element) (only if visible)
        if (isValid && !this.isTopElement(element)) {
            isValid = false;
            failureReason = 'Element is obscured by another element';
        }

        // 4. Text Content Re-verification
        if (isValid && interaction?.element?.textContent) {
            const targetText = interaction.element.textContent;
            if (!this.isTextMatch(element, targetText)) {
                 console.warn(`[SelectiveDomAnalyzer] Text content mismatch for ${element.tagName}#${element.id}. Expected: "${targetText}", Found: "${element.textContent?.trim()}"`);
                 // MODIFIED: Treat text mismatch as a hard failure
                 isValid = false;
                 failureReason = 'Text content mismatch';
            }
        }

        // Always log the result
        const duration = performance.now() - checkStartTime;
        if (isValid) {
            console.log(`[SelectiveDomAnalyzer] Validation PASSED for ${element.tagName}#${element.id} (took ${duration.toFixed(2)}ms)`);
        } else {
            console.log(`[SelectiveDomAnalyzer] Validation FAILED for ${element.tagName}#${element.id}: ${failureReason} (took ${duration.toFixed(2)}ms)`);
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
            console.warn('[SelectiveDomAnalyzer] Error getting BoundingRect:', e);
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
             console.warn('[SelectiveDomAnalyzer] Error getting ComputedStyle:', e);
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
            return false;
        }

        // MODIFIED: Check only the center point
        const centerX = rect.left + rect.width / 2;
        const centerY = rect.top + rect.height / 2;

        const checkX = Math.max(0, Math.min(centerX, window.innerWidth - 1));
        const checkY = Math.max(0, Math.min(centerY, window.innerHeight - 1));

        let doc = element.ownerDocument;
        let rootNode: Node | ShadowRoot = element.getRootNode();

        try {
            let topElementAtPoint: Element | null = null;
            if (rootNode instanceof ShadowRoot) {
                topElementAtPoint = rootNode.elementFromPoint(checkX, checkY);
            } else {
                topElementAtPoint = doc.elementFromPoint(checkX, checkY);
            }

            if (!topElementAtPoint) {
                console.log(`[SelectiveDomAnalyzer] elementFromPoint (center: ${checkX}, ${checkY}) returned null.`);
                // Consider it potentially obscured if center point check fails
                return false;
            }

            // Check if the found element is the target element, a descendant, or an ancestor.
            let current: Element | null = topElementAtPoint;
            let isRelated = false;
            while (current) {
                if (current === element) {
                    isRelated = true;
                    break;
                }
                current = current.parentElement;
            }
            if (!isRelated && element.contains(topElementAtPoint)) {
                isRelated = true;
            }

            if (!isRelated) {
                console.log(`[SelectiveDomAnalyzer] Occlusion detected at center point (${checkX}, ${checkY}). Target ${element.tagName}#${element.id} is not related to the top element ${topElementAtPoint.tagName}#${topElementAtPoint.id}`);
                return false; // Obscured by an unrelated element
            } else {
                // Center point check passed
                console.log(`[SelectiveDomAnalyzer] Center point (${checkX}, ${checkY}) check passed. Top element ${topElementAtPoint.tagName}#${topElementAtPoint.id} is related to target ${element.tagName}#${element.id}`);
                return true;
            }

        } catch (e) {
            console.warn('[SelectiveDomAnalyzer] Error during elementFromPoint check:', e);
            return false; // Conservative failure on error
        }
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