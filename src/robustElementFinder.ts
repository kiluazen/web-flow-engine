interface InteractionData {
    element?: {
        tagName?: string;
        id?: string | null;
        textContent?: string;
        cssSelector?: string;
        path?: string[]; // Assuming this holds XPath segments or similar
        attributes?: string | { [key: string]: string }; // Recorded attributes
        // Add other relevant fields from sample.json if needed
    };
    // Include other interaction fields if necessary for context
    text?: string; // Sometimes text is at the interaction level
}

export class RobustElementFinder {

    private static debugMode = false;

    static setDebugMode(enabled: boolean): void {
        this.debugMode = enabled;
    }

    /**
     * Tries multiple strategies to find all plausible elements matching the interaction data.
     * @param interaction The interaction data recorded.
     * @returns An array of plausible HTMLElement candidates.
     */
    static findCandidates(interaction: InteractionData): HTMLElement[] {
        const candidates = new Map<HTMLElement, string>(); // Use Map to store unique elements and finding strategy
        const elementData = interaction.element || {};
        const targetText = interaction.text || elementData.textContent;

        if (this.debugMode) {
            console.log('[RobustFinder] Starting search for interaction:', interaction);
        }

        // 0. Define Search Contexts (similar to ElementUtils, but maybe simplified)
        const searchRoots = this.getSearchRoots();

        // --- Strategy 1: Escaped ID ---
        if (elementData.id) {
            try {
                const escapedIdSelector = `#${CSS.escape(elementData.id)}`;
                if (this.debugMode) console.log(`[RobustFinder] Strategy 1: Trying escaped ID: ${escapedIdSelector}`);
                this.findElements(searchRoots, escapedIdSelector, candidates, 'Escaped ID');
            } catch (e) {
                if (this.debugMode) console.warn(`[RobustFinder] Strategy 1 Error (ID: ${elementData.id}):`, e);
            }
        }

        // --- Strategy 2: Escaped CSS Selector ---
        if (elementData.cssSelector && elementData.cssSelector !== elementData.id) { // Avoid re-running ID selector
             // Basic check for known invalid patterns before escaping
             if (!elementData.cssSelector.includes(':contains(')) {
                try {
                    // Attempt to escape the selector - basic for now, might need refinement
                    const potentiallyEscapedSelector = this.tryEscapeSelector(elementData.cssSelector);
                    if (this.debugMode) console.log(`[RobustFinder] Strategy 2: Trying escaped CSS: ${potentiallyEscapedSelector}`);
                    this.findElements(searchRoots, potentiallyEscapedSelector, candidates, 'Escaped CSS');
                } catch (e) {
                    if (this.debugMode) console.warn(`[RobustFinder] Strategy 2 Error (CSS: ${elementData.cssSelector}):`, e);
                }
            } else {
                 if (this.debugMode) console.warn(`[RobustFinder] Strategy 2 Skipping: Invalid ':contains' in selector: ${elementData.cssSelector}`);
            }
        }

        // --- Strategy 3: Attributes ---
        const attributes = this.parseAttributes(elementData.attributes);
        if (attributes) {
             // Prioritize stable attributes
            const attrSelectors = this.buildAttributeSelectors(elementData.tagName, attributes);
             if (this.debugMode) console.log(`[RobustFinder] Strategy 3: Trying Attributes:`, attrSelectors);
            for (const selector of attrSelectors) {
                 try {
                    this.findElements(searchRoots, selector, candidates, 'Attributes');
                 } catch (e) {
                    if (this.debugMode) console.warn(`[RobustFinder] Strategy 3 Error (Attribute Selector: ${selector}):`, e);
                 }
            }
        }

        // --- Strategy 4: Text Content ---
        if (targetText && elementData.tagName) {
            if (this.debugMode) console.log(`[RobustFinder] Strategy 4: Trying TagName + Text: ${elementData.tagName} with text "${targetText}"`);
            this.findElements(searchRoots, elementData.tagName, candidates, 'Tag + Text', targetText);
        } else if (targetText) {
            // Fallback: Search any element type by text if tagName is missing
            if (this.debugMode) console.log(`[RobustFinder] Strategy 4: Trying Any Tag + Text: * with text "${targetText}"`);
            this.findElements(searchRoots, '*', candidates, 'Any Tag + Text', targetText);
        }

        // --- Strategy 5: XPath ---
        const xpath = this.buildXPath(elementData.path);
        if (xpath) {
             if (this.debugMode) console.log(`[RobustFinder] Strategy 5: Trying XPath: ${xpath}`);
             try {
                const result = document.evaluate(xpath, document, null, XPathResult.ORDERED_NODE_ITERATOR_TYPE, null);
                let node = result.iterateNext();
                while (node) {
                    if (node instanceof HTMLElement && this.isElementPotentiallyVisible(node)) {
                        candidates.set(node, 'XPath');
                    }
                    node = result.iterateNext();
                }
             } catch (e) {
                 if (this.debugMode) console.warn(`[RobustFinder] Strategy 5 Error (XPath: ${xpath}):`, e);
             }
        }

        if (this.debugMode) {
             console.log(`[RobustFinder] Found ${candidates.size} unique candidate(s) across all strategies.`);
             candidates.forEach((strategy, element) => {
                console.log(`  - Candidate: ${element.tagName}#${element.id} (Found via: ${strategy})`);
             });
        }

        return Array.from(candidates.keys());
    }

    // --- Helper Methods ---

    /** Defines search areas (document, modals, portals) */
    private static getSearchRoots(): { name: string; root: Document | Element }[] {
        const roots: { name: string; root: Document | Element }[] = [];
        // Basic: just search the whole document for now
        // Could be expanded later to find modals/portals like in ElementUtils
        roots.push({ name: 'Document', root: document });
        // Example: Add active modal if detected
        // const activeModal = /* logic to find active modal */;
        // if (activeModal) roots.unshift({ name: 'Active Modal', root: activeModal });
        return roots;
    }

    /** Executes querySelectorAll in specified roots and adds valid elements to the map */
    private static findElements(
        roots: { name: string; root: Document | Element }[],
        selector: string,
        candidates: Map<HTMLElement, string>,
        strategyName: string,
        textFilter?: string
    ): void {
        for (const { name, root } of roots) {
            try {
                const foundElements = root.querySelectorAll(selector);
                if (this.debugMode && foundElements.length > 0) {
                     console.log(`[RobustFinder]   ${strategyName} in ${name} found ${foundElements.length} element(s) with selector "${selector}"`);
                }
                foundElements.forEach(element => {
                    if (element instanceof HTMLElement) {
                        // Apply text filter if provided
                        if (textFilter && !this.fuzzyTextMatch(element, textFilter)) {
                            return; // Skip if text doesn't match
                        }
                        // Apply basic visibility check
                        if (this.isElementPotentiallyVisible(element)) {
                            if (!candidates.has(element)) {
                                candidates.set(element, strategyName);
                                // if (this.debugMode) console.log(`[RobustFinder]     Added candidate from ${name} via ${strategyName}:`, element);
                            }
                        }
                         // else if (this.debugMode) {
                        //     console.log(`[RobustFinder]     Skipped non-visible element from ${name} via ${strategyName}:`, element);
                        // }
                    }
                });
            } catch (e) {
                // Ignore querySelectorAll errors silently in production, log in debug
                 if (this.debugMode) {
                    // Don't warn for the :contains error we expect to skip
                    if (!selector.includes(':contains(')) {
                        console.warn(`[RobustFinder] Error executing selector "${selector}" in ${name} via ${strategyName}:`, e);
                    }
                 }
            }
        }
    }

    /** Lightweight visibility check */
    private static isElementPotentiallyVisible(element: HTMLElement): boolean {
        // Simpler than SelectiveDomAnalyzer's check - avoids computedStyle for speed
        return element.offsetWidth > 0 || element.offsetHeight > 0 || element.getClientRects().length > 0;
        // Could add a check for display:none if performance allows:
        // && window.getComputedStyle(element).display !== 'none';
    }

    /** Parses the attributes string/object */
    private static parseAttributes(attrs: string | { [key: string]: string } | undefined): { [key: string]: string } | null {
         if (!attrs) return null;
         if (typeof attrs === 'object') return attrs;
         try {
            return JSON.parse(attrs);
         } catch (e) {
            if (this.debugMode) console.error("[RobustFinder] Failed to parse attributes JSON:", attrs, e);
            return null;
         }
    }

    /** Builds potentially useful attribute selectors */
    private static buildAttributeSelectors(tagName: string | undefined, attributes: { [key: string]: string }): string[] {
        const selectors: string[] = [];
        const tagPrefix = tagName ? tagName.toLowerCase() : '';

        // Prioritize potentially stable attributes
        const stableAttrs = ['name', 'data-testid', 'role', 'type', 'placeholder', 'aria-label', 'title'];
        for (const attr of stableAttrs) {
            if (attributes[attr]) {
                 // Escape attribute value for CSS selector
                selectors.push(`${tagPrefix}[${attr}="${CSS.escape(attributes[attr])}"]`);
            }
        }

        // Add role if present and not already used
        if (attributes['role'] && !stableAttrs.includes('role')) {
             selectors.push(`${tagPrefix}[role="${CSS.escape(attributes['role'])}"]`);
        }

        return selectors;
    }

    /** Basic text matching (could be enhanced) */
     private static fuzzyTextMatch(element: HTMLElement, targetText: string): boolean {
        const elementText = (element.textContent || "").trim();
        const elementInnerText = (element.innerText || "").trim(); // innerText respects visibility
        const elementValue = (element as HTMLInputElement).value?.trim();
        const search = targetText.trim();

        // Exact match first
        if (elementText === search || elementInnerText === search || (elementValue && elementValue === search)) {
            return true;
        }
        // Case-insensitive partial match (use cautiously)
        // const searchLower = search.toLowerCase();
        // if (elementText.toLowerCase().includes(searchLower) || elementInnerText.toLowerCase().includes(searchLower)) {
        //     return true;
        // }
        return false; // Default to stricter matching
    }

    /** Attempts to escape a CSS selector - basic implementation */
    private static tryEscapeSelector(selector: string): string {
         // Very basic: replace common issues found in IDs like the Mantine example
         // A more robust solution would parse the selector properly.
         // This focuses on escaping characters within an ID hash.
         return selector.replace(/#([\w-]+)(\S+)/g, (match, idPart, remainder) => {
            // Escape the remainder part which might contain special chars like '/'
            try {
                return `#${idPart}${CSS.escape(remainder)}`;
            } catch {
                return match; // If escaping fails, return original
            }
         });
    }

     /** Reconstruct XPath from path segments */
    private static buildXPath(pathSegments: string[] | undefined): string | null {
        if (!pathSegments || pathSegments.length === 0) return null;
        // Assuming pathSegments directly form the XPath when joined
        // Add // prefix if it doesn't start with / or (
        let xpath = pathSegments.join('/');
        if (!xpath.startsWith('/') && !xpath.startsWith('(')) {
            xpath = '//' + xpath;
        }
        return xpath;
    }

} 