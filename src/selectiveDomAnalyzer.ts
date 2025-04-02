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
            // Keep logs minimal unless debugging
            // console.log('[SelectiveDomAnalyzer] Validation failed: Invalid element provided.');
            return false;
        }
         // Check if the element is still connected to the DOM
        if (!element.isConnected) {
            if (this.debugMode) {
                console.log(`[SelectiveDomAnalyzer] Validation FAILED for ${element.tagName}#${element.id}: Element not connected to DOM.`);
            }
            return false;
        }

        const checkStartTime = performance.now();
        let isValid = true;
        let failureReason = '';

        // --- REMOVED: Automatic scroll-into-view from validation check ---
        // const isInView = this.isElementInViewport(element);
        // if (!isInView) {
        //     console.log('[SelectiveDomAnalyzer] Element is out of viewport, scrolling into view before validation');
        //     this.scrollElementIntoView(element);
        //     // ... scroll delay logic removed ...
        // }
        // --- End removal ---

        // 1. Visibility Check
        if (!this.isElementVisible(element)) {
            isValid = false;
            failureReason = 'Element not visible (size, display, visibility, DOM connection)';
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

        // --- ADDED: Structural Validation against Original Data ---

        // 5. Tag Name Check
        const originalTagName = interaction?.element?.tagName;
        if (isValid && originalTagName && element.tagName !== originalTagName) {
            if (this.debugMode) {
                 console.log(`[SelectiveDomAnalyzer] Validation FAILED for ${element.tagName}#${element.id}: Tag name mismatch (Expected: ${originalTagName}, Found: ${element.tagName})`);
            }
            isValid = false;
            failureReason = 'Tag name mismatch';
        }

        // 6. ID Check
        const originalId = interaction?.element?.id;
        if (isValid && originalId && element.id !== originalId) {
            // Allow partial matches for dynamic IDs (e.g., Mantine)
            // Basic check: if original ID contains '-', assume dynamic potential
            if (!originalId.includes('-')) { 
                 if (this.debugMode) {
                    console.log(`[SelectiveDomAnalyzer] Validation FAILED for ${element.tagName}#${element.id}: ID mismatch (Expected: ${originalId}, Found: ${element.id})`);
                 }
                isValid = false;
                failureReason = 'ID mismatch';
            } else if (this.debugMode) {
                // Log if skipping due to potential dynamic ID
                console.log(`[SelectiveDomAnalyzer] Skipping strict ID check for potential dynamic ID (Original: ${originalId}, Found: ${element.id})`);
            }
        }
        
        // 7. Key Attribute Check (Example: href for <a> tags)
        // Note: Parsing attributes can be complex. Start simple.
        const originalAttributes = interaction?.element?.attributes;
        // Ensure we check if parsedAttrs exists before accessing properties
        if (isValid && originalAttributes) {
            let parsedAttrs: Record<string, any> | null = null;
            if (typeof originalAttributes === 'string') {
                try { parsedAttrs = JSON.parse(originalAttributes); } catch (e) { /* ignore parse error */ }
            } else if (typeof originalAttributes === 'object') {
                parsedAttrs = originalAttributes;
            }

            if (parsedAttrs) {
                if (element.tagName === 'A' && parsedAttrs.href) {
                    const candidateHref = element.getAttribute('href');
                    // Basic comparison (could be enhanced for relative/absolute URLs)
                    if (candidateHref !== parsedAttrs.href) {
                         if (this.debugMode) {
                             console.log(`[SelectiveDomAnalyzer] Validation FAILED for ${element.tagName}#${element.id}: href attribute mismatch (Expected: ${parsedAttrs.href}, Found: ${candidateHref})`);
                         }
                         isValid = false;
                         failureReason = 'href mismatch';
                    }
                }
                 // Add check for 'name' attribute on INPUT elements
                if (element.tagName === 'INPUT' && parsedAttrs.name) {
                     const candidateName = element.getAttribute('name');
                     if (candidateName !== parsedAttrs.name) {
                         if (this.debugMode) {
                             console.log(`[SelectiveDomAnalyzer] Validation FAILED for ${element.tagName}#${element.id}: name attribute mismatch (Expected: ${parsedAttrs.name}, Found: ${candidateName})`);
                         }
                         isValid = false;
                         failureReason = 'name mismatch';
                     }
                }
                // TODO: Add checks for other key attributes (e.g., type for input, role)
            }
        }
        
        // --- End Structural Validation ---

        // Always log the result
        const duration = performance.now() - checkStartTime;
        if (this.debugMode) {
            if (isValid) {
                console.log(`[SelectiveDomAnalyzer] Validation PASSED for ${element.tagName}#${element.id} (took ${duration.toFixed(2)}ms)`);
            } else {
                console.log(`[SelectiveDomAnalyzer] Validation FAILED for ${element.tagName}#${element.id}: ${failureReason} (took ${duration.toFixed(2)}ms)`);
            }
        } else if (!isValid) {
            // When not in debug mode, only log failures
            console.warn(`[SelectiveDomAnalyzer] Validation FAILED: ${failureReason}`);
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

        // Check if the element is a common interactive element based on tag name or role
        // These elements are more likely to be valid targets even if partially obscured
        const isCommonInteractive = 
            ['BUTTON', 'A', 'INPUT', 'SELECT', 'TEXTAREA'].includes(element.tagName) ||
            ['button', 'link', 'checkbox', 'radio'].includes(element.getAttribute('role') || '');

        // Check if element is in a modal/dialog context
        const isInModal = 
            element.closest('[role="dialog"]') !== null ||
            element.closest('.modal') !== null ||
            element.closest('.mantine-Modal-content') !== null ||
            element.closest('[data-portal="true"]') !== null;

        // For interactive elements in modals, we can be more lenient
        // as they often have complex layering that might trigger false positives
        if (isCommonInteractive && isInModal) {
            if (this.debugMode) {
                console.log(`[SelectiveDomAnalyzer] Element ${element.tagName}#${element.id} is an interactive element in a modal context - skipping strict occlusion check`);
            }
            return true;
        }

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
                // Keep log if elementFromPoint returns null, as it indicates an issue
                console.log(`[SelectiveDomAnalyzer] elementFromPoint (center: ${checkX}, ${checkY}) returned null.`);
                return false;
            }

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

            // If the element is not the top element at its center point,
            // try checking additional points for robustness
            if (!isRelated) {
                // For buttons and links in modals, check additional points
                // like top edge, bottom edge, or quarter points
                if (isCommonInteractive && isInModal) {
                    // Try a few more points before giving up
                    const additionalPoints = [
                        { x: rect.left + rect.width * 0.25, y: rect.top + rect.height * 0.25 },
                        { x: rect.left + rect.width * 0.75, y: rect.top + rect.height * 0.25 },
                        { x: rect.left + rect.width * 0.25, y: rect.top + rect.height * 0.75 },
                        { x: rect.left + rect.width * 0.75, y: rect.top + rect.height * 0.75 }
                    ];
                    
                    for (const point of additionalPoints) {
                        const checkPointX = Math.max(0, Math.min(point.x, window.innerWidth - 1));
                        const checkPointY = Math.max(0, Math.min(point.y, window.innerHeight - 1));
                        
                        let pointElement = doc.elementFromPoint(checkPointX, checkPointY);
                        if (!pointElement) continue;
                        
                        current = pointElement;
                        while (current) {
                            if (current === element) {
                                isRelated = true;
                                break;
                            }
                            current = current.parentElement;
                        }
                        
                        if (isRelated) break;
                    }
                }
            }

            if (!isRelated) {
                 // Keep log for occlusion failure
                console.log(`[SelectiveDomAnalyzer] Occlusion detected at center point (${checkX}, ${checkY}). Target ${element.tagName}#${element.id} is not related to the top element ${topElementAtPoint.tagName}#${topElementAtPoint.id}`);
                return false;
            }
            return true; // Point check passed

        } catch (e) {
            console.warn('[SelectiveDomAnalyzer] Error during elementFromPoint check:', e);
            return false;
        }
    }

    // --- Text Match Helper ---
     // MODIFIED: Replaced with logic from RobustElementFinder.fuzzyTextMatch
     private static isTextMatch(element: HTMLElement, targetText: string | undefined): boolean {
        if (targetText === undefined || targetText === null) return true; // No text to match

        const elementText = (element.textContent || "").trim();
        const elementInnerText = (element.innerText || "").trim(); 
        const elementValue = (element as HTMLInputElement).value?.trim(); // Check input value
        const search = targetText.trim();

        // Exact match check
        if (elementInnerText === search || elementText === search || (elementValue && elementValue === search)) {
            return true;
        }

        // Fuzzy match check (case-insensitive contains)
        const searchLower = search.toLowerCase();
        if (elementInnerText.toLowerCase().includes(searchLower) || 
            elementText.toLowerCase().includes(searchLower) ||
            (elementValue && elementValue.toLowerCase().includes(searchLower))) {
            return true; 
        }

        return false; // No match found
    }

    // --- NEW: Helper methods for viewport detection and scrolling ---
    private static isElementInViewport(element: HTMLElement): boolean {
        const rect = element.getBoundingClientRect();
        return (
            rect.top >= 0 &&
            rect.left >= 0 &&
            rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
            rect.right <= (window.innerWidth || document.documentElement.clientWidth)
        );
    }

    private static scrollElementIntoView(element: HTMLElement): void {
        try {
            element.scrollIntoView({
                behavior: 'auto', // Use 'auto' for immediate scrolling
                block: 'center',   // Center the element vertically
                inline: 'center'   // Center the element horizontally
            });
        } catch (e) {
            // Fallback for browsers that don't support scrollIntoView with options
            const rect = element.getBoundingClientRect();
            const scrollX = window.scrollX || window.pageXOffset;
            const scrollY = window.scrollY || window.pageYOffset;
            
            // Calculate center position
            const elementTop = rect.top + scrollY;
            const viewportHeight = window.innerHeight || document.documentElement.clientHeight;
            const scrollToY = elementTop - (viewportHeight / 2) + (rect.height / 2);
            
            window.scrollTo(scrollX, scrollToY);
        }
    }
    // --- End new helper methods ---
} 