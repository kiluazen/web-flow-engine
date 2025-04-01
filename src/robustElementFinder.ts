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
    private static readonly RETRY_DELAY_MS = 1000; // UPDATED: Increased from 500ms to 1000ms

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
            const candidates = new Map<HTMLElement, string>();

            console.log(`[RobustFinder] Attempt ${attempt + 1}/${this.MAX_RETRIES + 1} - Starting search.`);

            // 0. Define Search Contexts (MODIFIED: gets potentially deeper root)
            const searchRoots = this.getSearchRoots();

            // --- Strategy 1: Escaped ID ---
            if (elementData.id) {
                try {
                    const escapedIdSelector = `#${CSS.escape(elementData.id)}`;
                    console.log(`[RobustFinder] Attempt ${attempt + 1} - Strategy 1: Trying escaped ID: ${escapedIdSelector}`);
                    this.findElements(searchRoots, escapedIdSelector, candidates, 'Escaped ID'); // Pass refined roots
                } catch (e) {
                    console.warn(`[RobustFinder] Attempt ${attempt + 1} - Strategy 1 Error (ID: ${elementData.id}):`, e);
                }
            }

            // --- Strategy 2: Escaped CSS Selector ---
             if (elementData.cssSelector && elementData.cssSelector !== elementData.id) {
                 if (!elementData.cssSelector.includes(':contains(')) {
                    try {
                        const potentiallyEscapedSelector = this.tryEscapeSelector(elementData.cssSelector);
                        console.log(`[RobustFinder] Attempt ${attempt + 1} - Strategy 2: Trying escaped CSS: ${potentiallyEscapedSelector}`);
                        this.findElements(searchRoots, potentiallyEscapedSelector, candidates, 'Escaped CSS'); // Pass refined roots
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
                 console.log(`[RobustFinder] Attempt ${attempt + 1} - Strategy 3: Trying Attributes:`, attrSelectors);
                for (const selector of attrSelectors) {
                     try {
                        this.findElements(searchRoots, selector, candidates, 'Attributes'); // Pass refined roots
                     } catch (e) {
                        console.warn(`[RobustFinder] Attempt ${attempt + 1} - Strategy 3 Error (Attribute Selector: ${selector}):`, e);
                     }
                }
            }

             // --- Strategy 4: Text Content ---
            if (targetText) {
                 const tagToSearch = elementData.tagName || '*';
                 console.log(`[RobustFinder] Attempt ${attempt + 1} - Strategy 4: Trying Tag (${tagToSearch}) + Text: "${targetText}"`);
                 this.findElements(searchRoots, tagToSearch, candidates, 'Tag + Text', targetText); // Pass refined roots
            }

            // New simple XPath strategy
            if (targetText) {
                // Add simple XPath contains() text search for reliable button finding
                console.log(`[RobustFinder] Attempt ${attempt + 1} - Strategy 4b: Trying text-based XPath`);
                
                const textXPath = `//button[contains(text(), "${targetText}")] | //button[contains(., "${targetText}")]`;
                try {
                    for (const { name, root } of searchRoots) {
                        // Only evaluate in modal contexts first to avoid document fallback
                        if (name.includes('Overlay') || name.includes('Modal')) {
                            console.log(`[RobustFinder] Evaluating text XPath in ${name}`);
                            const result = document.evaluate(textXPath, root, null, XPathResult.ORDERED_NODE_ITERATOR_TYPE, null);
                            let node = result.iterateNext();
                            while (node) {
                                if (node instanceof HTMLElement) {
                                    const passesTextCheck = !targetText || this.fuzzyTextMatch(node, targetText);
                                    if (passesTextCheck && this.isElementPotentiallyVisible(node)) {
                                        if (!candidates.has(node)) {
                                             candidates.set(node, `Text-based XPath (in ${name})`); // Note context
                                        }
                                    } else {
                                        // Only log skipped if debug mode is on maybe? Reduces noise.
                                        if(this.debugMode) console.log(`[RobustFinder]   Text XPath result in ${name} ${node.tagName}#${node.id} skipped (Visible: ${this.isElementPotentiallyVisible(node)}, TextMatch: ${passesTextCheck})`);
                                    }
                                }
                                node = result.iterateNext();
                            }
                        }
                    }
                } catch (e) {
                    console.warn(`[RobustFinder] Text XPath error:`, e);
                }
            }

             // --- Strategy 5: XPath ---
            const xpath = this.buildXPath(elementData.path); // Uses updated buildXPath
            if (xpath) {
                 console.log(`[RobustFinder] Attempt ${attempt + 1} - Strategy 5: Trying XPath: ${xpath}`);
                 try {
                    let xpathFoundCount = 0;
                    // MODIFIED: Evaluate XPath within each search root's context
                    for (const { name, root } of searchRoots) {
                        console.log(`[RobustFinder]   Evaluating XPath in root "${name}" context:`, root);
                        // Use the specific root as the context node
                        const result = document.evaluate(xpath, root, null, XPathResult.ORDERED_NODE_ITERATOR_TYPE, null);
                        let node = result.iterateNext();
                        while (node) {
                            if (node instanceof HTMLElement) {
                                const passesTextCheck = !targetText || this.fuzzyTextMatch(node, targetText);
                                if (passesTextCheck && this.isElementPotentiallyVisible(node)) {
                                    if (!candidates.has(node)) {
                                         candidates.set(node, `XPath (in ${name})`); // Note context
                                         xpathFoundCount++;
                                    }
                                } else {
                                    // Only log skipped if debug mode is on maybe? Reduces noise.
                                    if(this.debugMode) console.log(`[RobustFinder]   XPath result in ${name} ${node.tagName}#${node.id} skipped (Visible: ${this.isElementPotentiallyVisible(node)}, TextMatch: ${passesTextCheck})`);
                                }
                            }
                            node = result.iterateNext();
                        }
                    }
                    if (xpathFoundCount > 0) console.log(`[RobustFinder]   XPath added ${xpathFoundCount} new candidate(s).`);
                 } catch (e) {
                     console.warn(`[RobustFinder] Attempt ${attempt + 1} - Strategy 5 Error (XPath: ${xpath}):`, e);
                 }
            }

             // --- Check Results and Retry Logic ---
             if (candidates.size > 0) {
                 console.log(`[RobustFinder] Attempt ${attempt + 1} SUCCEEDED. Found ${candidates.size} unique candidate(s):`);
                 candidates.forEach((strategy, element) => {
                    console.log(`  - Candidate: ${element.tagName}${element.id ? '#' + element.id : ''} (Found via: ${strategy})`); // Improved log
                 });
                 return Array.from(candidates.keys()); // Success
             }

            // If no candidates found and retries remain, wait and retry
            attempt++;
            if (attempt <= this.MAX_RETRIES) {
                console.log(`[RobustFinder] Attempt ${attempt} FAILED. No candidates found. Retrying in ${this.RETRY_DELAY_MS}ms...`);
                await new Promise(resolve => setTimeout(resolve, this.RETRY_DELAY_MS));
            } else {
                 console.log(`[RobustFinder] All ${this.MAX_RETRIES + 1} attempts FAILED. No candidates found.`);
            }
        } // End while loop

        return []; // Return empty array if all retries fail
    }


    // --- Helper Methods ---

    /**
     * Defines search areas, prioritizing detected modals/dialogs before the main document.
     * MODIFIED: Attempts to find a more specific content container within the detected overlay.
     */
    private static getSearchRoots(): { name: string; root: Document | Element }[] {
        const roots: { name: string; root: Document | Element }[] = [];
        
        try {
            // IMPROVED: First try to find ANY modal/dialog/overlay with content
            const modalContentSelectors = [
                // Mantine
                '.mantine-Modal-content', '.mantine-Dialog-content',
                // Generic dialog content selectors
                '[role="dialog"] > div', '[role="dialog"] form',
                // Bootstrap 
                '.modal-body', '.modal-content',
                // Material UI
                '.MuiDialog-paper', '.MuiModal-root > div',
                // Common patterns
                '.dialog-content', '.modal-container > div',
                '.popup-content', '.overlay > div'
            ];
            
            // First try a direct search for content elements
            const contentElements = document.querySelectorAll(modalContentSelectors.join(','));
            
            if (contentElements.length > 0) {
                // Sort by z-index to find the topmost content
                const visibleElements = Array.from(contentElements)
                    .filter(el => {
                        const style = window.getComputedStyle(el);
                        return el instanceof HTMLElement && 
                               style.display !== 'none' && 
                               style.visibility !== 'hidden' &&
                               (el as HTMLElement).offsetWidth > 0;
                    }) as HTMLElement[];
                    
                // Add all visible content elements as search roots, highest z-index first
                visibleElements.sort((a, b) => {
                    const aZ = parseInt(window.getComputedStyle(a).zIndex) || 0;
                    const bZ = parseInt(window.getComputedStyle(b).zIndex) || 0;
                    return bZ - aZ;
                });
                
                visibleElements.forEach((el, i) => 
                    roots.push({ name: `Modal Content ${i+1}`, root: el }));
            }
            
            // FALLBACK: If no content found, look for modal containers
            if (roots.length === 0) {
                // Query for potential overlay roots
                const potentialOverlays = Array.from(document.querySelectorAll(
                    '[role="dialog"], [role="alertdialog"], .modal, .dialog, .popup, ' +
                     '.mantine-Modal-root, .mantine-Drawer-root, .mantine-Popover-dropdown' // Added Drawer
                )) as HTMLElement[];

                // Filter for visibility
                const visibleOverlays = potentialOverlays.filter(el => {
                    try {
                        const style = window.getComputedStyle(el);
                        // Check display, visibility, and opacity (more robust)
                        return style.display !== 'none' && style.visibility !== 'hidden' && parseFloat(style.opacity || '1') > 0;
                    } catch (e) { return false; }
                });

                if (visibleOverlays.length > 0) {
                    // Sort by z-index to find the topmost one
                    visibleOverlays.sort((a, b) => {
                        const zIndexA = parseInt(window.getComputedStyle(a).zIndex) || 0;
                        const zIndexB = parseInt(window.getComputedStyle(b).zIndex) || 0;
                        return zIndexB - zIndexA;
                    });
                    visibleOverlays.forEach((el, i) => 
                        roots.push({ name: `Overlay Root ${i+1}`, root: el }));
                }
            }
        } catch (e) {
            console.warn('[RobustFinder] Error detecting modal elements:', e);
        }
        
        // Always add document as fallback
        roots.push({ name: 'Document', root: document });
        console.log('[RobustFinder] Search roots determined:', roots.map(r => r.name));
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
        let strategyFoundCount = 0;
        
        // First search in all modal/overlay containers
        const modalRoots = roots.filter(r => 
            r.name.includes('Modal') || r.name.includes('Overlay'));
            
        // Then search in document only if no results found in modals
        const documentRoots = roots.filter(r => 
            !r.name.includes('Modal') && !r.name.includes('Overlay'));
            
        // Prioritize modal searching before falling back to document
        const orderedRoots = [...modalRoots, ...documentRoots];
        
        for (const { name, root } of orderedRoots) {
            try {
                 // Log the context root being searched
                 if(this.debugMode) console.log(`[RobustFinder]   Searching in root "${name}" context:`, root);
                 const foundElements = root.querySelectorAll(selector);

                 if (foundElements.length > 0) {
                     console.log(`[RobustFinder]   ${strategyName} in ${name}: Selector "${selector}" initially found ${foundElements.length} element(s).`);
                 }

                 foundElements.forEach(element => {
                    if (element instanceof HTMLElement) {
                        const isVisible = this.isElementPotentiallyVisible(element);
                        const passesTextCheck = !textFilter || this.fuzzyTextMatch(element, textFilter);

                        if (passesTextCheck && isVisible) {
                            if (!candidates.has(element)) {
                                candidates.set(element, `${strategyName} (in ${name})`); // Note context
                                strategyFoundCount++;
                                console.log(`[RobustFinder]     + Added candidate from ${name} via ${strategyName} (Visible: ${isVisible}, TextMatch: ${passesTextCheck}):`, element.tagName, element.id);
                            }
                        }
                        // Optional: Log skipped elements only in debug mode
                        // else if (this.debugMode) { ... }
                    }
                });

            } catch (e) {
                // Be less noisy about standard invalid selectors unless debugging
                 if (!(e instanceof DOMException && e.message.includes("is not a valid selector"))) {
                     console.warn(`[RobustFinder] Error executing selector "${selector}" in ${name} via ${strategyName}:`, e);
                 } else if (this.debugMode) {
                     console.log(`[RobustFinder] Info: Selector "${selector}" is invalid for querySelectorAll in ${name}.`);
                 }
            }
        }
        if (strategyFoundCount > 0) {
            console.log(`[RobustFinder]   ${strategyName} added ${strategyFoundCount} new candidate(s) to the list.`);
        }
    }

    /** Enhanced visibility check with detailed logging - simplified logs */
    private static isElementPotentiallyVisible(element: HTMLElement): boolean {
        const hasDimensions = element.offsetWidth > 0 && element.offsetHeight > 0;
        const hasClientRects = element.getClientRects().length > 0;
        const hasChildren = element.children.length > 0;
        const isContainer = element.tagName === 'DIV' || element.tagName === 'SECTION' || 
                           element.tagName === 'ARTICLE' || element.tagName === 'MAIN' ||
                           element.tagName === 'HEADER' || element.tagName === 'FOOTER' || 
                           element.tagName === 'NAV';
        const style = window.getComputedStyle(element);
        const isHiddenByCSS = style.display === 'none' || style.visibility === 'hidden' || 
                              parseFloat(style.opacity || '1') === 0;
        const isVisible = hasDimensions || hasClientRects || (hasChildren && isContainer && !isHiddenByCSS);
        // REMOVED per-element visibility check log
        // console.log(`[RobustFinder-VERIFY] Visibility check: <${element.tagName.toLowerCase()}...`);
        return isVisible;
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

     /** Reconstruct XPath from path segments */
     private static buildXPath(pathSegments: string[] | undefined): string | null {
        if (!pathSegments || pathSegments.length === 0) return null;

        if (pathSegments[0].startsWith('#')) {
            const elementId = pathSegments[0].substring(1);
            const remainingPath = pathSegments.slice(1).join('/');
            const relativePath = remainingPath ? `/${remainingPath}` : '';

            // --- MODIFIED: Prioritize //*[@id=...] ---
            try {
                const idEscaped = CSS.escape(elementId); // Escape for attribute value context
                // Ensure quotes within the ID itself are handled if necessary.
                // If IDs can contain single quotes, this might need adjustment.
                return `//*[@id="${idEscaped}"]${relativePath}`;
            } catch (e) {
                 console.warn(`[RobustFinder] Could not construct XPath with [@id="${elementId}"] for ${elementId}. Error:`, e);
                 // Fallback to trying id() function
                 try {
                     // Escape differently for string literal context if needed, though CSS.escape might suffice
                     return `id('${CSS.escape(elementId)}')${relativePath}`;
                 } catch (e2) {
                      console.warn(`[RobustFinder] Could not construct XPath with id() either for ${elementId}. Error:`, e2);
                      return null;
                 }
            }
            // --- END MODIFIED ---

        } else {
            // Original logic for non-ID starting paths
            let xpath = pathSegments.join('/');
            // Check if it needs to be made relative more carefully
            if (!xpath.startsWith('/') && !xpath.startsWith('(') && !xpath.startsWith('.') && !/^(html|body)/i.test(pathSegments[0])) {
                 xpath = '//' + xpath;
            }
            // Clean up double slashes
            xpath = xpath.replace(/\/\/\//g, '//');
            // Ensure it doesn't start with /// if the original path was just /
            xpath = xpath.replace(/^\/\/\//, '//');
            return xpath;
        }
    }

    private static isTextMatch(element: HTMLElement, targetText: string): boolean {
        if (!targetText) return true;
        
        const elementText = element.textContent?.trim() || '';
        const innerText = element.innerText?.trim() || '';
        
        // 1. First try exact matches (most reliable)
        if (elementText === targetText || innerText === targetText) return true;
        
        // 2. For buttons and inputs, be more flexible
        if (element.tagName === 'BUTTON' || element.tagName === 'INPUT' ||
            element.getAttribute('role') === 'button' || 
            element.getAttribute('type') === 'submit') {
            
            const targetLower = targetText.toLowerCase();
            const elementLower = elementText.toLowerCase();
            
            // Is this submit/ok/confirm button text?
            const isCommonAction = ['submit', 'ok', 'yes', 'confirm'].some(
                action => targetLower.includes(action) || elementLower.includes(action)
            );
            
            if (isCommonAction) {
                // For common action buttons, more permissive matching
                return elementLower.includes(targetLower) || targetLower.includes(elementLower);
            }
        }
        
        // 3. Don't match when texts are completely different (avoid false positives)
        return false;
    }

} 