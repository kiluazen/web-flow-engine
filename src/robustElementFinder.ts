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

        // --- ADDED: Wait for potential modal/portal stability --- 
        await this.waitForModalStability();
        // --- End Stability Wait --- 

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
                    this.findElements(nonDocumentRoots, escapedIdSelector, modalCandidates, 'Escaped ID', false);
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
                        this.findElements(nonDocumentRoots, potentiallyEscapedSelector, modalCandidates, 'Escaped CSS', false);
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
                        this.findElements(nonDocumentRoots, selector, modalCandidates, 'Attributes', false);
                     } catch (e) {
                        console.warn(`[RobustFinder] Attempt ${attempt + 1} - Strategy 3 Error (Attribute Selector: ${selector}):`, e);
                     }
                }
            }

             // --- Strategy 4: Text Content ---
            if (targetText) {
                 const tagToSearch = elementData.tagName || '*';
                 console.log(`[RobustFinder] Attempt ${attempt + 1} - Strategy 4 (Modal Context): Trying Tag (${tagToSearch}) + Text: "${targetText}"`);
                 this.findElements(nonDocumentRoots, tagToSearch, modalCandidates, 'Tag + Text', false, targetText);
            }

            // --- Strategy 4b: Text-based XPath ---
            if (targetText) {
                console.log(`[RobustFinder] Attempt ${attempt + 1} - Strategy 4b (Modal Context): Trying text-based XPath`);
                const textXPath = `//*[contains(text(), "${targetText}") or contains(., "${targetText}")]`;
                try {
                    this.evaluateXPathInRoots(nonDocumentRoots, textXPath, modalCandidates, 'Text-based XPath', false, targetText);
                } catch (e) {
                    console.warn(`[RobustFinder] Text XPath error in Modal Context:`, e);
                }
            }

            // --- Prioritize and Return Modal Results (if any) ---
            if (modalCandidates.size > 0) {
                const prioritizedCandidates = this.prioritizeCandidates(modalCandidates, 'Non-Document');
                if (prioritizedCandidates.length > 0) {
                    console.log(`[RobustFinder] Attempt ${attempt + 1} SUCCEEDED in Non-Document context. Found ${prioritizedCandidates.length} prioritized candidate(s).`);
                    // Log the prioritized candidates for debugging
                    prioritizedCandidates.forEach((element, index) => {
                        const strategy = modalCandidates.get(element) || 'Unknown';
                        console.log(`  - Prioritized Candidate ${index + 1}: ${element.tagName}${element.id ? '#' + element.id : ''} (Found via: ${strategy})`);
                    });
                    return prioritizedCandidates;
                }
                // If prioritization resulted in an empty list (shouldn't normally happen if size > 0), 
                // fall through to document search just in case.
                console.warn("[RobustFinder] Modal candidates existed but prioritization yielded none. Falling through.");
            }

            // --- Fallback: Run strategies on Document root ONLY if no modal candidates found or prioritized ---
            console.log(`[RobustFinder] Attempt ${attempt + 1} - No prioritized candidates found in Non-Document contexts. Falling back to Document root.`);
            const documentCandidates = new Map<HTMLElement, string>();

            if (documentRoot) {
                const docRootArray = [documentRoot]; // findElements expects an array

                // --- Strategy 1: Escaped ID (Document Fallback) ---
                if (elementData.id) {
                    try {
                        const escapedIdSelector = `#${CSS.escape(elementData.id)}`;
                        console.log(`[RobustFinder] Attempt ${attempt + 1} - Strategy 1 (Document Fallback): Trying escaped ID: ${escapedIdSelector}`);
                        this.findElements(docRootArray, escapedIdSelector, documentCandidates, 'Escaped ID', true);
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
                            this.findElements(docRootArray, potentiallyEscapedSelector, documentCandidates, 'Escaped CSS', true);
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
                            this.findElements(docRootArray, selector, documentCandidates, 'Attributes', true);
                        } catch (e) {
                            console.warn(`[RobustFinder] Attempt ${attempt + 1} - Strategy 3 Error (Document Fallback - Attribute Selector: ${selector}):`, e);
                        }
                    }
                }

                // --- Strategy 4: Text Content (Document Fallback) ---
                if (targetText) {
                    const tagToSearch = elementData.tagName || '*';
                    console.log(`[RobustFinder] Attempt ${attempt + 1} - Strategy 4 (Document Fallback): Trying Tag (${tagToSearch}) + Text: "${targetText}"`);
                    this.findElements(docRootArray, tagToSearch, documentCandidates, 'Tag + Text', true, targetText);
                }

                 // --- Strategy 4b: Text-based XPath (Document Fallback) ---
                 if (targetText) {
                    console.log(`[RobustFinder] Attempt ${attempt + 1} - Strategy 4b (Document Fallback): Trying text-based XPath`);
                    const textXPath = `//*[contains(text(), "${targetText}") or contains(., "${targetText}")]`;
                    try {
                        this.evaluateXPathInRoots(docRootArray, textXPath, documentCandidates, 'Text-based XPath', true, targetText);
                    } catch (e) {
                        console.warn(`[RobustFinder] Text XPath error in Document Fallback:`, e);
                    }
                 }
            }

            // --- Prioritize and Return Document Results (if any) ---
            if (documentCandidates.size > 0) {
                const prioritizedCandidates = this.prioritizeCandidates(documentCandidates, 'Document Fallback');
                if (prioritizedCandidates.length > 0) {
                     console.log(`[RobustFinder] Attempt ${attempt + 1} SUCCEEDED (Context: Document Fallback). Found ${prioritizedCandidates.length} prioritized candidate(s).`);
                     // Log the prioritized candidates for debugging
                     prioritizedCandidates.forEach((element, index) => {
                        const strategy = documentCandidates.get(element) || 'Unknown';
                        console.log(`  - Prioritized Candidate ${index + 1}: ${element.tagName}${element.id ? '#' + element.id : ''} (Found via: ${strategy})`);
                     });
                     return prioritizedCandidates;
                }
                console.warn("[RobustFinder] Document candidates existed but prioritization yielded none.");
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

    // --- ADDED: Helper to prioritize candidates based on strategy --- 
    private static prioritizeCandidates(candidates: Map<HTMLElement, string>, context: string): HTMLElement[] {
        const priorityOrder = ['Escaped ID', 'Escaped CSS', 'Attributes', 'Tag + Text', 'Text-based XPath'];
        
        for (const priorityStrategy of priorityOrder) {
            const matchingCandidates = Array.from(candidates.entries())
                .filter(([_, strategy]) => strategy.includes(priorityStrategy))
                .map(([element, _]) => element);
            
            if (matchingCandidates.length > 0) {
                console.log(`[RobustFinder-Priority] Prioritizing candidates found via "${priorityStrategy}" in ${context} context.`);
                return matchingCandidates;
            }
        }

        // Should not be reached if candidates map is not empty, but return all as fallback.
        console.warn(`[RobustFinder-Priority] No specific priority strategy matched in ${context}. Returning all candidates.`);
        return Array.from(candidates.keys()); 
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
            // Look specifically for Hyphen portals first
            const portals = document.querySelectorAll('[data-portal="true"]');
            if (portals.length > 0) {
                portals.forEach((portal, index) => {
                    roots.push({ name: `Portal ${index + 1}`, root: portal });
                });
                foundSpecificContent = true;
                if (this.debugMode) console.log(`[RobustFinder] Found ${portals.length} data-portal elements.`);
            }

            // Then continue with your existing modal content detection
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
        rootsToSearch: { name: string; root: Document | Element }[],
        selector: string,
        candidates: Map<HTMLElement, string>,
        strategyName: string,
        isDocumentFallback: boolean = false,
        textFilter?: string
    ): void {
        let strategyFoundCount = 0;

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
                        // Basic text check - only if textFilter provided
                        const passesTextCheck = !textFilter || this.isTextContentMatching(element, textFilter);

                        if (passesTextCheck) {
                            if (!candidates.has(element)) {
                                const foundContext = `${strategyName} (${isDocumentFallback ? 'Document Fallback' : `in ${name}`})`;
                                candidates.set(element, foundContext);
                                strategyFoundCount++;
                                console.log(`[RobustFinder]     + Added candidate via ${foundContext}:`, element.tagName, element.id);
                                if (this.debugMode) {
                                    console.log(`[RobustFinder-DEBUG]       HTML:`, element.outerHTML);
                                }
                            }
                        }
                        else if (this.debugMode && textFilter) {
                             console.log(`[RobustFinder-DEBUG]     - Skipped candidate (failed text match):`, element.tagName, element.id);
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
        }
    }

    /** Helper to evaluate XPath specifically */
    private static evaluateXPathInRoots(
        rootsToSearch: { name: string; root: Document | Element }[],
        xpath: string,
        candidates: Map<HTMLElement, string>,
        strategyName: string,
        isDocumentFallback: boolean = false,
        targetText?: string
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
                        // Basic text check - only if targetText provided
                        const passesTextCheck = !targetText || this.isTextContentMatching(node, targetText);

                        if (passesTextCheck) {
                            if (!candidates.has(node)) {
                                const foundContext = `${strategyName} (${isDocumentFallback ? 'Document Fallback' : `in ${name}`})`;
                                candidates.set(node, foundContext);
                                foundCount++;
                                console.log(`[RobustFinder]     + Added candidate via ${foundContext}:`, node.tagName, node.id);
                                if (this.debugMode) {
                                    console.log(`[RobustFinder-DEBUG]       HTML:`, node.outerHTML);
                                }
                            }
                        } else if (this.debugMode && targetText) {
                            console.log(`[RobustFinder-DEBUG]   - Skipped XPath result (failed text match):`, node.tagName, node.id);
                        }
                    }
                    node = result.iterateNext();
                }
            } catch (e) {
                const errorContext = isDocumentFallback ? "Document Fallback" : name;
                console.warn(`[RobustFinder] Error evaluating XPath "${xpath}" in ${errorContext}:`, e);
            }
        }
    }

    /** Simplified text content matching - basic implementation for candidate filtering */
    private static isTextContentMatching(element: HTMLElement, targetText: string): boolean {
        if (!targetText || targetText.trim() === '') return true;
        
        const searchLowerTrimmed = targetText.toLowerCase().trim();
        
        // Prioritize direct text content or value for a stricter match
        const textTrimmed = (element.textContent || '').trim().toLowerCase();
        const innerTextTrimmed = (element.innerText || '').trim().toLowerCase();
        const valueTrimmed = (element as HTMLInputElement).value?.trim().toLowerCase(); // Optional chaining for value
        
        // Check for near-exact match after trimming and lowercasing
        if (textTrimmed === searchLowerTrimmed || 
            innerTextTrimmed === searchLowerTrimmed || 
            (valueTrimmed !== undefined && valueTrimmed === searchLowerTrimmed)) {
            return true;
        }

        // Fallback: Allow fuzzy 'includes' ONLY if it's likely an interactive element or direct text node?
        // For now, let's keep it stricter to avoid the container issue. 
        // If this becomes too strict, we might need more nuanced logic here.
        
        // If no near-exact match, return false for initial filtering.
        return false; 
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

    // --- ADDED: Portal/Modal Stability Wait --- 
    private static waitForModalStability(initialDelay = 150, checkInterval = 100, maxAttempts = 20, stabilityThreshold = 3): Promise<void> {
        return new Promise(resolve => {
            if (this.debugMode) console.log('[RobustFinder-Stability] Starting stability check...');

            // Selectors to monitor (combine portal and common modal roots)
            const stabilitySelectors = 
                '[data-portal="true"], [role="dialog"], .modal-content, .mantine-Modal-content, .MuiDialog-paper, .MuiModal-root > div[role="presentation"]:not([aria-hidden="true"])'; 
            
            const initialElements = document.querySelectorAll(stabilitySelectors);

            if (initialElements.length === 0) {
                if (this.debugMode) console.log('[RobustFinder-Stability] No initial modal/portal elements found. Resolving immediately.');
                resolve();
                return;
            }

            let stableCount = 0;
            let lastElementCount = initialElements.length;
            let lastStructureSignature = ''; // More robust check
            let attempts = 0;

            const getStructureSignature = (elements: NodeListOf<Element>): string => {
                return Array.from(elements).map(el => {
                    const rect = el.getBoundingClientRect();
                    // Signature includes tag, id (if any), class count, and basic geometry
                    return `${el.tagName}${el.id ? '#'+el.id : ''}:${el.classList.length}:${Math.round(rect.width)}x${Math.round(rect.height)}@${Math.round(rect.left)},${Math.round(rect.top)}`;
                }).join('|');
            };

            lastStructureSignature = getStructureSignature(initialElements);

            const checkStability = () => {
                attempts++;
                const currentElements = document.querySelectorAll(stabilitySelectors);
                const currentStructureSignature = getStructureSignature(currentElements);

                if (this.debugMode) {
                     console.log(`[RobustFinder-Stability] Check #${attempts}: Found ${currentElements.length} elements. Sig: ${currentStructureSignature.substring(0,100)}...`);
                }

                if (currentElements.length === lastElementCount && currentStructureSignature === lastStructureSignature) {
                    stableCount++;
                    if (this.debugMode) console.log(`[RobustFinder-Stability] Structure stable for ${stableCount} checks.`);

                    if (stableCount >= stabilityThreshold) {
                        if (this.debugMode) console.log('[RobustFinder-Stability] Structure deemed stable. Resolving.');
                        resolve();
                        return;
                    }
                } else {
                    if (this.debugMode) console.log('[RobustFinder-Stability] Structure changed. Resetting stability counter.');
                    stableCount = 0;
                    lastElementCount = currentElements.length;
                    lastStructureSignature = currentStructureSignature;
                }

                if (attempts < maxAttempts) {
                    setTimeout(checkStability, checkInterval);
                } else {
                    if (this.debugMode) console.log('[RobustFinder-Stability] Max attempts reached. Resolving anyway.');
                    resolve();
                }
            };

            // Start checking after the initial delay
            setTimeout(checkStability, initialDelay);
        });
    }
    // --- End Stability Wait --- 

} 