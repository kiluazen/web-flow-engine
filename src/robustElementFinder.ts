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
            const candidates = new Map<HTMLElement, string>(); // Use Map to store unique elements and finding strategy

            // REMOVED: if (this.debugMode) around attempt log
            console.log(`[RobustFinder] Attempt ${attempt + 1}/${this.MAX_RETRIES + 1} - Starting search.`);

            // 0. Define Search Contexts
            const searchRoots = this.getSearchRoots();

            // --- Strategy 1: Escaped ID ---
            if (elementData.id) {
                try {
                    const escapedIdSelector = `#${CSS.escape(elementData.id)}`;
                    // REMOVED: if (this.debugMode)
                    console.log(`[RobustFinder] Attempt ${attempt + 1} - Strategy 1: Trying escaped ID: ${escapedIdSelector}`);
                    this.findElements(searchRoots, escapedIdSelector, candidates, 'Escaped ID');
                } catch (e) {
                    // REMOVED: if (this.debugMode)
                    console.warn(`[RobustFinder] Attempt ${attempt + 1} - Strategy 1 Error (ID: ${elementData.id}):`, e);
                }
            }

            // --- Strategy 2: Escaped CSS Selector ---
            if (elementData.cssSelector && elementData.cssSelector !== elementData.id) {
                 if (!elementData.cssSelector.includes(':contains(')) {
                    try {
                        const potentiallyEscapedSelector = this.tryEscapeSelector(elementData.cssSelector);
                        // REMOVED: if (this.debugMode)
                        console.log(`[RobustFinder] Attempt ${attempt + 1} - Strategy 2: Trying escaped CSS: ${potentiallyEscapedSelector}`);
                        this.findElements(searchRoots, potentiallyEscapedSelector, candidates, 'Escaped CSS');
                    } catch (e) {
                        // REMOVED: if (this.debugMode)
                        console.warn(`[RobustFinder] Attempt ${attempt + 1} - Strategy 2 Error (CSS: ${elementData.cssSelector}):`, e);
                    }
                } else {
                     // REMOVED: if (this.debugMode)
                     console.warn(`[RobustFinder] Attempt ${attempt + 1} - Strategy 2 Skipping: Invalid ':contains' in selector: ${elementData.cssSelector}`);
                }
            }

            // --- Strategy 3: Attributes ---
            const attributes = this.parseAttributes(elementData.attributes);
            if (attributes) {
                const attrSelectors = this.buildAttributeSelectors(elementData.tagName, attributes);
                 // REMOVED: if (this.debugMode)
                 console.log(`[RobustFinder] Attempt ${attempt + 1} - Strategy 3: Trying Attributes:`, attrSelectors);
                for (const selector of attrSelectors) {
                     try {
                        this.findElements(searchRoots, selector, candidates, 'Attributes');
                     } catch (e) {
                        // REMOVED: if (this.debugMode)
                        console.warn(`[RobustFinder] Attempt ${attempt + 1} - Strategy 3 Error (Attribute Selector: ${selector}):`, e);
                     }
                }
            }

            // --- Strategy 4: Text Content ---
            if (targetText) {
                 const tagToSearch = elementData.tagName || '*'; // Default to '*' if tagName missing
                // REMOVED: if (this.debugMode)
                console.log(`[RobustFinder] Attempt ${attempt + 1} - Strategy 4: Trying Tag (${tagToSearch}) + Text: "${targetText}"`);
                 this.findElements(searchRoots, tagToSearch, candidates, 'Tag + Text', targetText);
            }

            // --- Strategy 5: XPath ---
            const xpath = this.buildXPath(elementData.path);
            if (xpath) {
                 // REMOVED: if (this.debugMode)
                 console.log(`[RobustFinder] Attempt ${attempt + 1} - Strategy 5: Trying XPath: ${xpath}`);
                 try {
                    const result = document.evaluate(xpath, document, null, XPathResult.ORDERED_NODE_ITERATOR_TYPE, null);
                    let node = result.iterateNext();
                    let xpathFoundCount = 0;
                    while (node) {
                        if (node instanceof HTMLElement) {
                            // Also apply text filter here if needed, as XPath might be less specific
                            const passesTextCheck = !targetText || this.fuzzyTextMatch(node, targetText);
                            if (passesTextCheck && this.isElementPotentiallyVisible(node)) {
                                if (!candidates.has(node)) {
                                     candidates.set(node, 'XPath');
                                     xpathFoundCount++;
                                }
                            } else {
                                // REMOVED: if (this.debugMode)
                                console.log(`[RobustFinder]   XPath result ${node.tagName}#${node.id} skipped (Visible: ${this.isElementPotentiallyVisible(node)}, TextMatch: ${passesTextCheck})`);
                            }
                        }
                        node = result.iterateNext();
                    }
                    // REMOVED: if (this.debugMode)
                    if (xpathFoundCount > 0) console.log(`[RobustFinder]   XPath added ${xpathFoundCount} new candidate(s).`);
                 } catch (e) {
                     // REMOVED: if (this.debugMode)
                     console.warn(`[RobustFinder] Attempt ${attempt + 1} - Strategy 5 Error (XPath: ${xpath}):`, e);
                 }
            }

            // --- Check Results and Retry Logic ---
            if (candidates.size > 0) {
                // REMOVED: if (this.debugMode)
                console.log(`[RobustFinder] Attempt ${attempt + 1} SUCCEEDED. Found ${candidates.size} unique candidate(s):`);
                candidates.forEach((strategy, element) => {
                   console.log(`  - Candidate: ${element.tagName}#${element.id} (Found via: ${strategy})`);
                });
                return Array.from(candidates.keys()); // Success
            }

            // If no candidates found and retries remain, wait and retry
            attempt++;
            if (attempt <= this.MAX_RETRIES) {
                // REMOVED: if (this.debugMode)
                console.log(`[RobustFinder] Attempt ${attempt} FAILED. No candidates found. Retrying in ${this.RETRY_DELAY_MS}ms...`);
                await new Promise(resolve => setTimeout(resolve, this.RETRY_DELAY_MS));
            } else {
                 // REMOVED: if (this.debugMode)
                 console.log(`[RobustFinder] All ${this.MAX_RETRIES + 1} attempts FAILED. No candidates found.`);
            }
        } // End while loop

        return []; // Return empty array if all retries fail
    }


    // --- Helper Methods ---

    /**
     * Defines search areas, prioritizing detected modals/dialogs before the main document.
     * Inspired by build-dom-tree.js iframe/shadow DOM handling.
     */
    private static getSearchRoots(): { name: string; root: Document | Element }[] {
        const roots: { name: string; root: Document | Element }[] = [];
        let activeOverlay: HTMLElement | null = null;

        try {
            const potentialOverlays = Array.from(document.querySelectorAll(
                // Keep standard roles & generic classes
                '[role="dialog"], [role="alertdialog"], .modal, .dialog, .popup, ' +
                // Add Mantine specific classes (common patterns)
                '.mantine-Modal-root, .mantine-Modal-modal, .mantine-Popover-dropdown'
            )) as HTMLElement[];

            // Filter for visibility using only CSS properties (more reliable for containers)
            const visibleOverlays = potentialOverlays.filter(el => {
                try {
                    const style = window.getComputedStyle(el);
                    return style.display !== 'none' && style.visibility !== 'hidden';
                } catch (e) {
                    // Ignore errors getting style (e.g., element detached)
                    return false;
                }
            });

            if (visibleOverlays.length > 0) {
                visibleOverlays.sort((a, b) => {
                    const zIndexA = parseInt(window.getComputedStyle(a).zIndex) || 0;
                    const zIndexB = parseInt(window.getComputedStyle(b).zIndex) || 0;
                    return zIndexB - zIndexA; // Highest z-index first
                });
                activeOverlay = visibleOverlays[0];
                console.log(`[RobustFinder] Detected active overlay element (highest z-index):`, activeOverlay);
                roots.push({ name: 'Active Overlay', root: activeOverlay });
            }
        } catch (e) {
            console.warn('[RobustFinder] Error detecting overlay elements:', e);
        }

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
        // console.log(`[RobustFinder-VERIFY] findElements called with selector: "${selector}", strategy: ${strategyName}`); // Keep commented out unless deep debugging
        
        let strategyFoundCount = 0;
        for (const { name, root } of roots) {
            try {
                const foundElements = root.querySelectorAll(selector);
                // console.log(`[RobustFinder-VERIFY] ${strategyName} in ${name}: Raw selector "${selector}" found: ${foundElements.length} element(s)`); // Keep commented out
                
                if (foundElements.length > 0) {
                     console.log(`[RobustFinder]   ${strategyName} in ${name}: Selector "${selector}" initially found ${foundElements.length} element(s).`);
                }

                foundElements.forEach(element => {
                    if (element instanceof HTMLElement) {
                        const isVisible = this.isElementPotentiallyVisible(element);
                        const passesTextCheck = !textFilter || this.fuzzyTextMatch(element, textFilter);

                        // REMOVED very verbose per-element check log
                        // const eleTextContent = (element.textContent || "").trim();
                        // const eleInnerText = (element.innerText || "").trim();
                        // console.log(`[RobustFinder-VERIFY] ${strategyName} checking: <${element.tagName.toLowerCase()}...`);

                        if (passesTextCheck && isVisible) {
                            if (!candidates.has(element)) {
                                candidates.set(element, strategyName);
                                strategyFoundCount++;
                                // Keep the log for *added* candidates
                                console.log(`[RobustFinder]     + Added candidate from ${name} via ${strategyName} (Visible: ${isVisible}, TextMatch: ${passesTextCheck}):`, element.tagName, element.id);
                            }
                        } 
                        // REMOVED per-element skip log
                        // else {
                        //     let skipReason = '';
                        //     if (!isVisible) skipReason += 'Not Visible ';
                        //     if (!passesTextCheck) skipReason += 'Text Mismatch ';
                        //     console.log(`[RobustFinder]     - Skipped candidate from ${name} via ${strategyName} (Reason: ${skipReason.trim()}):`, element.tagName, element.id);
                        // }
                    }
                });
            } catch (e) {
                 if (!selector.includes(':contains(')) { 
                     console.warn(`[RobustFinder] Error executing selector "${selector}" in ${name} via ${strategyName}:`, e);
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

        // Check if the first segment looks like an ID selector (e.g., #some-id)
        if (pathSegments[0].startsWith('#')) {
            const elementId = pathSegments[0].substring(1); // Remove the leading #
            // Construct an XPath using the id() function for the first part
            // and join the rest, assuming they are relative steps
            const remainingPath = pathSegments.slice(1).join('/');
            // Ensure remaining path starts with / if not empty
            const relativePath = remainingPath ? `/${remainingPath}` : '';
            // Use //* to find the element with the ID anywhere, then append relative path
            // Or use id() function which is more direct if supported and unique
            // Using id() is generally better if the ID is unique within the document.
             try {
                // Attempt to use the id() function
                return `id('${CSS.escape(elementId)}')${relativePath}`;
             } catch (e) {
                // Fallback if id() construction fails (e.g., complex IDs)
                 console.warn(`[RobustFinder] Could not construct XPath with id() for ${elementId}. Falling back.`);
                 return `//*[@id='${CSS.escape(elementId)}']${relativePath}`;
             }

        } else {
            // Original logic for non-ID starting paths
            let xpath = pathSegments.join('/');
            if (!xpath.startsWith('/') && !xpath.startsWith('(')) {
                 if (!/^(html|body)/i.test(pathSegments[0])) {
                     xpath = '//' + xpath;
                 }
            }
            xpath = xpath.replace(/\/\/\//g, '//');
            return xpath;
        }
    }

} 