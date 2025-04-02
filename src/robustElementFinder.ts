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
    private static readonly MAX_RETRIES = 3; // Number of retry attempts
    private static readonly RETRY_DELAY_MS = 1500; // UPDATED: Increased from 1000ms to 1500ms

    static setDebugMode(enabled: boolean): void {
        this.debugMode = enabled;
        // Unconditional log to verify debug mode is set
        console.log(`[RobustFinder-VERIFY] Debug mode ${enabled ? 'ENABLED' : 'DISABLED'}`);
    }

    /**
     * Tries multiple strategies to find all plausible elements matching the interaction data,
     * with built-in retries for timing issues.
     * @param interaction The interaction data recorded.
     * @returns An array of plausible HTMLElement candidates.
     */
    static async findCandidates(interaction: InteractionData): Promise<HTMLElement[]> {
        // ADDED: Unconditional verification logs to confirm function is called
        console.log(`[RobustFinder-VERIFY] findCandidates CALLED - Current debugMode setting: ${this.debugMode}`);
        console.log(`[RobustFinder-VERIFY] Interaction data:`, interaction);

        const elementData = interaction.element || {};
        const targetText = interaction.text || elementData.textContent;
        let attempt = 0;

        while (attempt <= this.MAX_RETRIES) {
            console.log(`[RobustFinder] Attempt ${attempt + 1}/${this.MAX_RETRIES + 1} - Starting search.`);

            // 0. Define Search Contexts and separate them
            const allSearchRoots = this.getSearchRoots();
            const nonDocumentRoots = allSearchRoots.filter(r => r.name !== 'Document');
            const documentRoot = allSearchRoots.find(r => r.name === 'Document');

            // --- Run strategies strictly on Non-Document roots first ---
            const modalCandidates = new Map<HTMLElement, string>();

            // --- Strategy 1: Escaped ID ---
            if (elementData.id) {
                try {
                    const escapedIdSelector = `#${CSS.escape(elementData.id)}`;
                    console.log(`[RobustFinder] Attempt ${attempt + 1} - Strategy 1 (Modal Context): Trying escaped ID: ${escapedIdSelector}`);
                    this.findElements(nonDocumentRoots, escapedIdSelector, modalCandidates, 'Escaped ID', undefined, false); // Search only non-doc
                } catch (e) {
                    console.warn(`[RobustFinder] Attempt ${attempt + 1} - Strategy 1 Error (ID: ${elementData.id}):`, e);
                }
            }

            // --- Strategy 2: Escaped CSS Selector ---
             if (elementData.cssSelector && elementData.cssSelector !== elementData.id) {
                 if (!elementData.cssSelector.includes(':contains(')) {
                    try {
                        const potentiallyEscapedSelector = this.tryEscapeSelector(elementData.cssSelector);
                        console.log(`[RobustFinder] Attempt ${attempt + 1} - Strategy 2 (Modal Context): Trying escaped CSS: ${potentiallyEscapedSelector}`);
                        this.findElements(nonDocumentRoots, potentiallyEscapedSelector, modalCandidates, 'Escaped CSS', undefined, false); // Search only non-doc
                    } catch (e) {
                        console.warn(`[RobustFinder] Attempt ${attempt + 1} - Strategy 2 Error (CSS: ${elementData.cssSelector}):`, e);
                    }
                } else {
                     console.warn(`[RobustFinder] Attempt ${attempt + 1} - Strategy 2 Skipping: Invalid ':contains' in selector: ${elementData.cssSelector}`);
                }
            }

             // --- Strategy 3: Attributes ---
            const attributes = this.parseAttributes(elementData.attributes);
            if (attributes) {
                const attrSelectors = this.buildAttributeSelectors(elementData.tagName, attributes);
                 console.log(`[RobustFinder] Attempt ${attempt + 1} - Strategy 3 (Modal Context): Trying Attributes:`, attrSelectors);
                for (const selector of attrSelectors) {
                     try {
                        this.findElements(nonDocumentRoots, selector, modalCandidates, 'Attributes', undefined, false); // Search only non-doc
                     } catch (e) {
                        console.warn(`[RobustFinder] Attempt ${attempt + 1} - Strategy 3 Error (Attribute Selector: ${selector}):`, e);
                     }
                }
            }

             // --- Strategy 4: Text Content ---
            if (targetText) {
                 const tagToSearch = elementData.tagName || '*';
                 console.log(`[RobustFinder] Attempt ${attempt + 1} - Strategy 4 (Modal Context): Trying Tag (${tagToSearch}) + Text: "${targetText}"`);
                 this.findElements(nonDocumentRoots, tagToSearch, modalCandidates, 'Tag + Text', targetText, false); // Search only non-doc
            }

            // --- Strategy 4b: Text-based XPath ---
            if (targetText) {
                console.log(`[RobustFinder] Attempt ${attempt + 1} - Strategy 4b (Modal Context): Trying text-based XPath`);
                const textXPath = `//*[contains(text(), "${targetText}") or contains(., "${targetText}")]`;
                try {
                    this.evaluateXPathInRoots(nonDocumentRoots, textXPath, targetText, modalCandidates, 'Text-based XPath');
                } catch (e) {
                    console.warn(`[RobustFinder] Text XPath error in Modal Context:`, e);
                }
            }

            // --- Check Modal Results BEFORE falling back to Document ---
            if (targetText && modalCandidates.size > 0) {
                 const textBasedCandidates = Array.from(modalCandidates.entries())
                    .filter(([_, strategy]) => strategy.includes('Tag + Text') || strategy.includes('Text-based XPath'))
                    .map(([element, _]) => element);

                 if (textBasedCandidates.length > 0) {
                     console.log(`[RobustFinder] Attempt ${attempt + 1} SUCCEEDED in Non-Document context prioritizing TEXT matches. Found ${textBasedCandidates.length} candidate(s):`);
                     textBasedCandidates.forEach((element, index) => {
                         const strategy = modalCandidates.get(element) || 'Unknown Text Strategy';
                         console.log(`  - Candidate ${index + 1}: ${element.tagName}${element.id ? '#' + element.id : ''} (Found via: ${strategy})`);
                     });
                     return textBasedCandidates; // Return only text-based matches from modal
                 }
                 // If text search was attempted but yielded no text-specific results, fall through to check *all* modal candidates
            }

            if (modalCandidates.size > 0) {
                 // This block now primarily handles cases where targetText was null/empty,
                 // or where text search was attempted but only non-text strategies (CSS, ID, Attr) found matches.
                console.log(`[RobustFinder] Attempt ${attempt + 1} SUCCEEDED in Non-Document context (Non-text strategies or fallback). Found ${modalCandidates.size} unique candidate(s):`);
                modalCandidates.forEach((strategy, element) => {
                   console.log(`  - Candidate: ${element.tagName}${element.id ? '#' + element.id : ''} (Found via: ${strategy})`);
                });
                return Array.from(modalCandidates.keys()); // Success from modal/overlay
            }

            // --- Fallback: Run strategies on Document root ONLY if no modal candidates found ---
            console.log(`[RobustFinder] Attempt ${attempt + 1} - No candidates found in Non-Document contexts. Falling back to Document root.`);
            const documentCandidates = new Map<HTMLElement, string>();

            if (documentRoot) {
                const docRootArray = [documentRoot]; // findElements expects an array

                // --- Strategy 1: Escaped ID (Document Fallback) ---
                if (elementData.id) {
                    try {
                        const escapedIdSelector = `#${CSS.escape(elementData.id)}`;
                        console.log(`[RobustFinder] Attempt ${attempt + 1} - Strategy 1 (Document Fallback): Trying escaped ID: ${escapedIdSelector}`);
                        this.findElements(docRootArray, escapedIdSelector, documentCandidates, 'Escaped ID', undefined, true);
                    } catch (e) {
                        console.warn(`[RobustFinder] Attempt ${attempt + 1} - Strategy 1 Error (Document Fallback - ID: ${elementData.id}):`, e);
                    }
                }

                // --- Strategy 2: Escaped CSS Selector (Document Fallback) ---
                if (elementData.cssSelector && elementData.cssSelector !== elementData.id) {
                    if (!elementData.cssSelector.includes(':contains(')) {
                        try {
                            const potentiallyEscapedSelector = this.tryEscapeSelector(elementData.cssSelector);
                            console.log(`[RobustFinder] Attempt ${attempt + 1} - Strategy 2 (Document Fallback): Trying escaped CSS: ${potentiallyEscapedSelector}`);
                            this.findElements(docRootArray, potentiallyEscapedSelector, documentCandidates, 'Escaped CSS', undefined, true);
                        } catch (e) {
                            console.warn(`[RobustFinder] Attempt ${attempt + 1} - Strategy 2 Error (Document Fallback - CSS: ${elementData.cssSelector}):`, e);
                        }
                    } else {
                         console.warn(`[RobustFinder] Attempt ${attempt + 1} - Strategy 2 Skipping (Document Fallback): Invalid ':contains' in selector: ${elementData.cssSelector}`);
                    }
                }

                // --- Strategy 3: Attributes (Document Fallback) ---
                if (attributes) { // Reuse parsed attributes
                    const attrSelectors = this.buildAttributeSelectors(elementData.tagName, attributes);
                    console.log(`[RobustFinder] Attempt ${attempt + 1} - Strategy 3 (Document Fallback): Trying Attributes:`, attrSelectors);
                    for (const selector of attrSelectors) {
                        try {
                            this.findElements(docRootArray, selector, documentCandidates, 'Attributes', undefined, true);
                        } catch (e) {
                            console.warn(`[RobustFinder] Attempt ${attempt + 1} - Strategy 3 Error (Document Fallback - Attribute Selector: ${selector}):`, e);
                        }
                    }
                }

                // --- Strategy 4: Text Content (Document Fallback) ---
                if (targetText) {
                    const tagToSearch = elementData.tagName || '*';
                    console.log(`[RobustFinder] Attempt ${attempt + 1} - Strategy 4 (Document Fallback): Trying Tag (${tagToSearch}) + Text: "${targetText}"`);
                    this.findElements(docRootArray, tagToSearch, documentCandidates, 'Tag + Text', targetText, true);
                }

                 // --- Strategy 4b: Text-based XPath (Document Fallback) ---
                 if (targetText) {
                    console.log(`[RobustFinder] Attempt ${attempt + 1} - Strategy 4b (Document Fallback): Trying text-based XPath`);
                    const textXPath = `//*[contains(text(), "${targetText}") or contains(., "${targetText}")]`;
                    try {
                        this.evaluateXPathInRoots(docRootArray, textXPath, targetText, documentCandidates, 'Text-based XPath');
                    } catch (e) {
                        console.warn(`[RobustFinder] Text XPath error in Document Fallback:`, e);
                    }
                 }
            }

            // --- Final Check and Retry Logic ---
            let finalCandidatesMap = documentCandidates; // Default to document candidates

            if (targetText && documentCandidates.size > 0) {
                const docTextBasedCandidatesMap = new Map<HTMLElement, string>();
                 documentCandidates.forEach((strategy, element) => {
                    if (strategy.includes('Tag + Text') || strategy.includes('Text-based XPath')) {
                        docTextBasedCandidatesMap.set(element, strategy);
                    }
                 });

                if (docTextBasedCandidatesMap.size > 0) {
                     console.log(`[RobustFinder] Attempt ${attempt + 1} - Prioritizing TEXT matches from Document Fallback.`);
                     finalCandidatesMap = docTextBasedCandidatesMap; // Use only text-based if found
                }
                 // If no text-based found in document, use the original documentCandidates map
            }

            if (finalCandidatesMap.size > 0) {
                 console.log(`[RobustFinder] Attempt ${attempt + 1} SUCCEEDED (Context: Document Fallback). Found ${finalCandidatesMap.size} unique candidate(s):`);
                 finalCandidatesMap.forEach((strategy, element) => {
                    console.log(`  - Candidate: ${element.tagName}${element.id ? '#' + element.id : ''} (Found via: ${strategy})`);
                 });
                 return Array.from(finalCandidatesMap.keys()); // Success
            }

            // If no candidates found and retries remain, wait and retry
            attempt++;
            if (attempt <= this.MAX_RETRIES) {
                console.log(`[RobustFinder] Attempt ${attempt} FAILED. No candidates found in any context. Retrying in ${this.RETRY_DELAY_MS}ms...`);
                await new Promise(resolve => setTimeout(resolve, this.RETRY_DELAY_MS));
            } else {
                 console.log(`[RobustFinder] All ${this.MAX_RETRIES + 1} attempts FAILED. No candidates found.`);
            }
        } // End while loop

        return []; // Return empty array if all retries fail
    }


    // --- Helper Methods ---

    /**
     * Defines search areas, prioritizing specific modal content containers,
     * then overlay roots, before the main document.
     * Inspired by elementUtils.ts logic.
     */
    private static getSearchRoots(): { name: string; root: Document | Element }[] {
        const roots: { name: string; root: Document | Element }[] = [];
        let foundSpecificContent = false;

        try {
            // 1. PRIORITIZE: Find specific modal/dialog CONTENT containers
            const modalContentSelectors = [
                // Mantine
                '.mantine-Modal-content', '.mantine-Dialog-content',
                // Bootstrap
                '.modal-content', '.modal-body',
                // Material UI
                '.MuiDialog-paper', '.MuiModal-root > div[role="presentation"]:not([aria-hidden="true"])',
                 // Generic dialog patterns (more specific first)
                '[role="dialog"][aria-modal="true"] > *:not(style):not(script)', // Direct child of modal dialog
                '[role="dialog"]:not([aria-modal="true"]) > *:not(style):not(script)', // Non-modal dialog direct child
                '.dialog-content', '.modal-container > *:not(style):not(script)',
                '.popup-content'
            ];

            const contentElements = document.querySelectorAll(modalContentSelectors.join(', '));

            if (contentElements.length > 0) {
                const visibleContentElements = Array.from(contentElements)
                    .filter(el => {
                        // Basic inline visibility check for potential roots
                        if (!(el instanceof HTMLElement)) return false;
                        const style = window.getComputedStyle(el);
                        const rect = el.getBoundingClientRect();
                        return style.display !== 'none' &&
                               style.visibility !== 'hidden' &&
                               parseFloat(style.opacity || '1') > 0 &&
                               !el.hidden &&
                               (rect.width > 0 || rect.height > 0); // Check rect for size
                    }) as HTMLElement[];

                 // Sort by z-index (highest first)
                 visibleContentElements.sort((a, b) => {
                    const zIndexA = parseInt(window.getComputedStyle(a).zIndex) || 0;
                    const zIndexB = parseInt(window.getComputedStyle(b).zIndex) || 0;
                    return zIndexB - zIndexA;
                 });

                if (visibleContentElements.length > 0) {
                    visibleContentElements.forEach((el, i) =>
                        roots.push({ name: `Modal Content ${i+1}`, root: el }));
                    foundSpecificContent = true;
                    if (this.debugMode) console.log(`[RobustFinder] Found ${roots.length} specific modal content root(s).`);
                }
            }

            // 2. FALLBACK: If no specific CONTENT found, look for OVERLAY roots
            if (!foundSpecificContent) {
                if (this.debugMode) console.log(`[RobustFinder] No specific content roots found, searching for overlay roots...`);
                const potentialOverlays = Array.from(document.querySelectorAll(
                    // General containers
                    '[role="dialog"], [role="alertdialog"], .modal, .dialog, .popup, .overlay,' +
                     // Framework specific roots
                     '.mantine-Modal-root, .mantine-Drawer-root, .mantine-Popover-dropdown,' +
                     '.MuiModal-root, .MuiDialog-root'
                )) as HTMLElement[];

                const visibleOverlays = potentialOverlays.filter(el => {
                     try {
                        const style = window.getComputedStyle(el);
                        // Basic visibility check for overlay roots
                        return style.display !== 'none' && style.visibility !== 'hidden' && parseFloat(style.opacity || '1') > 0 && !el.hidden;
                    } catch (e) { return false; }
                });

                if (visibleOverlays.length > 0) {
                    visibleOverlays.sort((a, b) => {
                        const zIndexA = parseInt(window.getComputedStyle(a).zIndex) || 0;
                        const zIndexB = parseInt(window.getComputedStyle(b).zIndex) || 0;
                        return zIndexB - zIndexA;
                    });
                    // Add only the highest z-index overlay if multiple are found at this stage?
                    // For now, add all visible ones found via this method.
                    visibleOverlays.forEach((el, i) =>
                        roots.push({ name: `Overlay Root ${i+1}`, root: el }));
                     if (this.debugMode) console.log(`[RobustFinder] Found ${roots.length} overlay root(s).`);
                }
            }
        } catch (e) {
            console.warn('[RobustFinder] Error detecting modal/overlay elements:', e);
        }

        // 3. FINAL FALLBACK: Always add document
        roots.push({ name: 'Document', root: document });
        console.log('[RobustFinder] Final search roots determined:', roots.map(r => r.name));
        return roots;
    }

    /** Executes querySelectorAll in specified roots and adds valid elements to the map */
    private static findElements(
        rootsToSearch: { name: string; root: Document | Element }[], // Renamed for clarity
        selector: string,
        candidates: Map<HTMLElement, string>,
        strategyName: string,
        textFilter?: string,
        isDocumentFallback: boolean = false // Added flag
    ): void {
        let strategyFoundCount = 0;
        // No longer need to split roots here, handled in findCandidates

        for (const { name, root } of rootsToSearch) {
            try {
                 const contextMsg = isDocumentFallback ? "(Document Fallback)" : `in root \"${name}\" context`;
                 if(this.debugMode) console.log(`[RobustFinder]   Searching ${contextMsg}:`, root);
                 const foundElements = root.querySelectorAll(selector);

                 if (foundElements.length > 0) {
                    const logMsg = `[RobustFinder]   ${strategyName} ${isDocumentFallback ? '(Document Fallback)' : `in ${name}`}: Selector "${selector}" found ${foundElements.length} element(s).`;
                    // Log verbosely only in debug or if found in Document fallback (to confirm fallback was needed)
                    if (this.debugMode || (isDocumentFallback && foundElements.length > 0)) {
                        console.log(logMsg);
                    } else if (foundElements.length > 0) {
                        // Less verbose log for non-document roots when not debugging
                        console.log(`[RobustFinder]   ${strategyName} in ${name} found ${foundElements.length}.`);
                    }
                 }

                 foundElements.forEach(element => {
                    if (element instanceof HTMLElement) {
                        const isVisible = this.isElementPotentiallyVisible(element);
                        const passesTextCheck = !textFilter || this.fuzzyTextMatch(element, textFilter);

                        if (passesTextCheck && isVisible) {
                            if (!candidates.has(element)) {
                                const foundContext = `${strategyName} (${isDocumentFallback ? 'Document Fallback' : `in ${name}`})`;
                                candidates.set(element, foundContext);
                                strategyFoundCount++;
                                console.log(`[RobustFinder]     + Added candidate via ${foundContext} (Visible: ${isVisible}, TextMatch: ${passesTextCheck}):`, element.tagName, element.id);
                            }
                        }
                    }
                });

            } catch (e) {
                 const errorContext = isDocumentFallback ? "Document Fallback" : name;
                 if (!(e instanceof DOMException && e.message.includes("is not a valid selector"))) {
                     console.warn(`[RobustFinder] Error executing selector "${selector}" in ${errorContext} via ${strategyName}:`, e);
                 } else if (this.debugMode) {
                     console.log(`[RobustFinder] Info: Selector "${selector}" is invalid for querySelectorAll in ${errorContext}.`);
                 }
            }
        } // End of loop through specified roots

        // Log strategy summary only if it found something
        // if (strategyFoundCount > 0) {
        //     console.log(`[RobustFinder]   ${strategyName} added ${strategyFoundCount} new candidate(s) to the list.`);
        // }
        // Removed summary log here as it's confusing with split context search
    }

    /** Helper to evaluate XPath specifically */
    private static evaluateXPathInRoots(
        rootsToSearch: { name: string; root: Document | Element }[],
        xpath: string,
        targetText: string | undefined,
        candidates: Map<HTMLElement, string>,
        strategyName: string,
        isDocumentFallback: boolean = false
    ): void {
        for (const { name, root } of rootsToSearch) {
            try {
                const contextMsg = isDocumentFallback ? "(Document Fallback)" : `in root \"${name}\" context`;
                if(this.debugMode) console.log(`[RobustFinder]   Evaluating XPath ${contextMsg}: ${xpath}`);

                const result = document.evaluate(xpath, root, null, XPathResult.ORDERED_NODE_ITERATOR_TYPE, null);
                let node = result.iterateNext();
                let foundCount = 0;
                while (node) {
                    if (node instanceof HTMLElement) {
                        const isVisible = this.isElementPotentiallyVisible(node);
                        const passesTextCheck = !targetText || this.fuzzyTextMatch(node, targetText);

                        if (passesTextCheck && isVisible) {
                            if (!candidates.has(node)) {
                                const foundContext = `${strategyName} (${isDocumentFallback ? 'Document Fallback' : `in ${name}`})`;
                                candidates.set(node, foundContext);
                                foundCount++;
                                console.log(`[RobustFinder]     + Added candidate via ${foundContext} (Visible: ${isVisible}, TextMatch: ${passesTextCheck}):`, node.tagName, node.id);
                            }
                        } else if (this.debugMode) {
                            console.log(`[RobustFinder]   XPath result in ${name} ${node.tagName}#${node.id} skipped (Visible: ${isVisible}, TextMatch: ${passesTextCheck})`);
                        }
                    }
                    node = result.iterateNext();
                }
                // Optional: Log if XPath found something in this specific root
                // if (foundCount > 0 && this.debugMode) {
                //     console.log(`[RobustFinder]   ${strategyName} found ${foundCount} candidate(s) in ${name}`);
                // }
            } catch (e) {
                const errorContext = isDocumentFallback ? "Document Fallback" : name;
                console.warn(`[RobustFinder] Error evaluating XPath "${xpath}" in ${errorContext}:`, e);
            }
        }
    }

    /** Simplified and refined visibility check based on common methods */
    private static isElementPotentiallyVisible(element: HTMLElement): boolean {
        if (!element || !element.isConnected) {
            return false; // Must be in the DOM
        }

        // Check HTML 'hidden' attribute
        if (element.hidden) {
            return false;
        }

        const style = window.getComputedStyle(element);

        // Check basic CSS properties that hide elements
        if (style.display === 'none' || style.visibility === 'hidden' || parseFloat(style.opacity || '1') < 0.01) {
            return false;
        }

        // Check dimensions using robust methods
        // offsetWidth/offsetHeight are good for block elements and include borders/padding
        // getClientRects().length > 0 is better for inline elements or elements with transforms
        const hasDimensions = element.offsetWidth > 0 || element.offsetHeight > 0 || element.getClientRects().length > 0;
        if (!hasDimensions) {
             // Allow containers with overflow:visible potentially? Too complex for now.
             // If it has no dimensions according to the browser, treat as not visible for interaction.
            return false;
        }

        // Viewport check - Is any part of the element within the viewport?
        // Optional: Could be removed if off-screen elements are valid targets
        const rect = element.getBoundingClientRect();
         const isInViewport = rect.top < window.innerHeight && rect.bottom > 0 &&
                              rect.left < window.innerWidth && rect.right > 0;

         if (!isInViewport) {
             // If strict viewport visibility is required, uncomment the next line
             // return false;
         }

        // Removed parent visibility check - can be unreliable and slow.
        // Occlusion (being covered by another element) should be handled by the SelectiveDomAnalyzer.

        return true; // Passed all checks
    }

    /** Parses the attributes string/object */
    private static parseAttributes(attrs: string | { [key: string]: string } | undefined): { [key: string]: string } | null {
         if (!attrs) return null;
         if (typeof attrs === 'object') return attrs;
         try {
            return JSON.parse(attrs);
         } catch (e) {
            // REMOVED: if (this.debugMode)
            console.error("[RobustFinder] Failed to parse attributes JSON:", attrs, e);
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
                selectors.push(`${tagPrefix}[${attr}="${CSS.escape(attributes[attr])}"]`);
            }
        }

        // Add specific common attributes if present
        if (attributes['href']) {
             selectors.push(`${tagPrefix}[href="${CSS.escape(attributes['href'])}"]`);
        }
         if (attributes['src']) {
             selectors.push(`${tagPrefix}[src="${CSS.escape(attributes['src'])}"]`);
        }

        // Add role if present and not already used by stableAttrs
        if (attributes['role'] && !stableAttrs.includes('role')) {
             selectors.push(`${tagPrefix}[role="${CSS.escape(attributes['role'])}"]`);
        }


        return selectors;
    }

    /** Enhanced text matching with logging - simplified logs */
     private static fuzzyTextMatch(element: HTMLElement, targetText: string): boolean {
        // REMOVED per-element text check log
        // console.log(`[RobustFinder-VERIFY] fuzzyTextMatch called for "${targetText}"`);
        
        const elementText = (element.textContent || "").trim();
        const elementInnerText = (element.innerText || "").trim(); 
        const elementValue = (element as HTMLInputElement).value?.trim();
        const search = targetText.trim();

        if (elementInnerText === search || elementText === search || (elementValue && elementValue === search)) {
            // console.log(`[RobustFinder-VERIFY] Exact text match found`); // Commented out
            return true;
        }
        const searchLower = search.toLowerCase();
        if (elementInnerText.toLowerCase().includes(searchLower) || 
            elementText.toLowerCase().includes(searchLower) ||
            (elementValue && elementValue.toLowerCase().includes(searchLower))) {
            // console.log(`[RobustFinder-VERIFY] Fuzzy text match found`); // Commented out
            return true; 
        }
        // console.log(`[RobustFinder-VERIFY] No text match found`); // Commented out
        return false;
    }

    /** Attempts to escape a CSS selector - basic implementation */
    private static tryEscapeSelector(selector: string): string {
         // Focuses on escaping characters within an ID hash or attribute values
         // Note: This is NOT a full CSS parser/escaper.
         try {
             // Escape hashes potentially containing special chars
             selector = selector.replace(/#((?:\\.|[\w-]|[^\x00-\xa0])+)(\S*)/g, (match, idPart, remainder) => {
                 return `#${idPart}${CSS.escape(remainder)}`;
             });
             // Escape attribute values (simple approach)
             selector = selector.replace(/\[([^\]=]+)=["']?([^\]"']+)["']?\]/g, (match, attr, value) => {
                 return `[${attr}="${CSS.escape(value)}"]`;
             });
         } catch (e) {
             // REMOVED: if (this.debugMode)
             console.warn(`[RobustFinder] CSS escaping failed for selector: ${selector}`, e);
             return selector; // Return original if escaping fails
         }
         return selector;
    }

     /** Reconstruct XPath from path segments - MODIFIED TO USE DOUBLE QUOTES */
     private static buildXPath(pathSegments: string[] | undefined): string | null {
        if (!pathSegments || pathSegments.length === 0) return null;

        if (pathSegments[0].startsWith('#')) {
            const elementId = pathSegments[0].substring(1);
            const remainingPath = pathSegments.slice(1).join('/');
            const relativePath = remainingPath ? `/${remainingPath}` : '';

            try {
                const idEscaped = CSS.escape(elementId);
                // Use double quotes for the attribute value in XPath
                return `//*[@id="${idEscaped}"]${relativePath}`;
            } catch (e) {
                 console.warn(`[RobustFinder] Could not construct XPath with [@id="..."] for ${elementId}. Error:`, e);
                 try {
                     return `id('${CSS.escape(elementId)}')${relativePath}`;
                 } catch (e2) {
                      console.warn(`[RobustFinder] Could not construct XPath with id() either for ${elementId}. Error:`, e2);
                      return null;
                 }
            }

        } else {
            let xpath = pathSegments.join('/');
            if (!xpath.startsWith('/') && !xpath.startsWith('(') && !xpath.startsWith('.') && !/^(html|body)/i.test(pathSegments[0])) {
                 xpath = '//' + xpath;
            }
            xpath = xpath.replace(/\/\/\//g, '//');
            xpath = xpath.replace(/^\/\/\//, '//');
            return xpath;
        }
    }

} 