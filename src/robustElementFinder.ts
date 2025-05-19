import { SelectiveDomAnalyzer } from './selectiveDomAnalyzer';
import { ElementData, InteractionData } from './types'; // Corrected import path

export class RobustElementFinder {

    private static debugMode = false;
    private static readonly MAX_RETRIES = 1; // Reduced retries as sequential logic is less prone to initial timing issues
    private static readonly RETRY_DELAY_MS = 500; // Shorter delay is likely sufficient

    static setDebugMode(enabled: boolean): void {
        this.debugMode = enabled;
        // Unconditional log to verify debug mode is set
        console.log(`[RobustFinder-VERIFY] Debug mode ${enabled ? 'ENABLED' : 'DISABLED'}`);
    }

    /**
     * Tries strategies sequentially. For each strategy, finds candidates, 
     * filters by text, and validates with SelectiveDomAnalyzer.
     * Returns the first unambiguously validated element.
     */
    static async findCandidates(interaction: InteractionData): Promise<HTMLElement[]> {
        console.log(`[RobustFinder-VERIFY] findCandidates CALLED (Sequential Text-Gated Approach) - Debug: ${this.debugMode}`);
        if (this.debugMode) console.log(`[RobustFinder-VERIFY] Interaction data:`, JSON.parse(JSON.stringify(interaction)));

        const elementData = interaction.element || {};
        const targetText = interaction.text || elementData.textContent;

        let attempt = 0;
        while (attempt <= this.MAX_RETRIES) {
            const runId = `Attempt ${attempt + 1}/${this.MAX_RETRIES + 1}`; 
            console.log(`[RobustFinder][${runId}] Starting search cycle.`);

            await this.waitForModalStability(); // Wait for UI stability before each attempt cycle
            const allSearchRoots = this.getSearchRoots();
            const attributes = this.parseAttributes(elementData.attributes);

            // --- Define Strategies in Priority Order --- 
            const strategies: { name: string; execute: () => Promise<HTMLElement[]> }[] = [];

            // 1. Escaped ID
            if (elementData.id && !elementData.id.startsWith('headlessui-')) { 
                strategies.push({ name: 'Escaped ID', execute: () => this.executeStrategy(runId, 'Escaped ID', allSearchRoots, `#${CSS.escape(elementData.id!)}`, targetText, interaction, true) });
            }
            // 2. Escaped CSS Selector
            if (elementData.cssSelector && elementData.cssSelector !== elementData.id && !elementData.cssSelector.includes(':contains(')) {
                strategies.push({ name: 'Escaped CSS', execute: () => this.executeStrategy(runId, 'Escaped CSS', allSearchRoots, this.tryEscapeSelector(elementData.cssSelector!), targetText, interaction) });
            } else if (elementData.cssSelector?.includes(':contains(')) { 
                console.warn(`[RobustFinder][${runId}] Skipping invalid CSS selector with :contains:`); 
            }
            // 3. Attributes (Stable)
            if (attributes) {
                this.buildAttributeSelectors(elementData.tagName, attributes)
                    .filter(attr => attr.type === 'Stable') // Only stable attrs first
                    .forEach(attr => {
                        strategies.push({ name: `Attributes-Stable (${attr.selector.split('[')[1].split('=')[0]})`, execute: () => this.executeStrategy(runId, `Attributes-Stable`, allSearchRoots, attr.selector, targetText, interaction) });
                    });
            }
            // 4. Text Content (Exact)
            if (targetText) {
                const tagToSearch = elementData.tagName || '*';
                const exactTextXPath = `//*[normalize-space(.) = "${targetText.replace(/"/g, '&quot;')}"] | //*[@value = "${targetText.replace(/"/g, '&quot;')}"] | //*[normalize-space(@aria-label) = "${targetText.replace(/"/g, '&quot;')}"]`
                // Add Tag + Text (Exact) - often faster than XPath
                strategies.push({ name: 'Tag + Text (Exact)', execute: () => this.executeStrategy(runId, 'Tag + Text (Exact)', allSearchRoots, tagToSearch, targetText, interaction, true) }); 
                strategies.push({ name: 'Text-based XPath (Exact)', execute: () => this.executeXPathStrategy(runId, 'Text-based XPath (Exact)', allSearchRoots, exactTextXPath, targetText, interaction, true) });
            }
            // 5. Attributes (Role)
            if (attributes) {
                 this.buildAttributeSelectors(elementData.tagName, attributes)
                     .filter(attr => attr.type === 'Role')
                     .forEach(attr => {
                         strategies.push({ name: `Attributes-Role`, execute: () => this.executeStrategy(runId, `Attributes-Role`, allSearchRoots, attr.selector, targetText, interaction) });
                     });
             }
            // 6. Text Content (Includes)
            if (targetText) {
                const tagToSearch = elementData.tagName || '*';
                const includesTextXPath = `//*[contains(normalize-space(.), "${targetText.replace(/"/g, '&quot;')}") or contains(@value, "${targetText.replace(/"/g, '&quot;')}") or contains(normalize-space(@aria-label), "${targetText.replace(/"/g, '&quot;')}")]`
                strategies.push({ name: 'Tag + Text (Includes)', execute: () => this.executeStrategy(runId, 'Tag + Text (Includes)', allSearchRoots, tagToSearch, targetText, interaction, false) }); 
                strategies.push({ name: 'Text-based XPath (Includes)', execute: () => this.executeXPathStrategy(runId, 'Text-based XPath (Includes)', allSearchRoots, includesTextXPath, targetText, interaction, false) });
            }
            // 7. Attributes (Type and Other)
            if (attributes) {
                this.buildAttributeSelectors(elementData.tagName, attributes)
                    .filter(attr => attr.type === 'Type' || attr.type === 'Other')
                    .forEach(attr => {
                        strategies.push({ name: `Attributes-${attr.type}`, execute: () => this.executeStrategy(runId, `Attributes-${attr.type}`, allSearchRoots, attr.selector, targetText, interaction) });
                    });
            }
            // --- Execute Strategies Sequentially --- 
            for (const strategy of strategies) {
                if (this.debugMode) console.log(`\n[RobustFinder][${runId}] ---> Trying Strategy: ${strategy.name}`);
                const result = await strategy.execute();
                if (result.length === 1) {
                    console.log(`[RobustFinder][${runId}] ***** SUCCESS ***** Found unambiguous element via strategy: ${strategy.name}`);
                    return result; // Found the single best element
                } else if (result.length > 1) {
                    console.warn(`[RobustFinder][${runId}] Ambiguity detected for strategy ${strategy.name}. Found ${result.length} valid candidates after deep validation. Returning empty as strategy is inconclusive.`);
                    // Ambiguous result, potentially log this and continue (or return empty based on desired strictness)
                    // For now, let's treat ambiguity after deep validation as needing the next strategy level.
                    // If it becomes a problem, we might return the ambiguous list.
                }
                // If result.length === 0, the strategy failed (no candidates, no text match, or failed deep validation), continue to next.
            }
            // --- Retry Logic --- 
            attempt++;
            if (attempt <= this.MAX_RETRIES) {
                console.log(`[RobustFinder][${runId}] FAILED CYCLE. No unambiguous element found. Retrying in ${this.RETRY_DELAY_MS}ms...`);
                await new Promise(resolve => setTimeout(resolve, this.RETRY_DELAY_MS));
            } else {
                console.log(`[RobustFinder] All ${this.MAX_RETRIES + 1} attempts FAILED. No unambiguous element found.`);
            }
        } // End while loop

        return []; // Return empty array if all strategies and retries fail
    }

    /** Helper to execute a querySelectorAll strategy */
    private static async executeStrategy(
        runId: string, 
        strategyName: string, 
        roots: { name: string; root: Document | Element }[], 
        selector: string, 
        targetText: string | undefined, 
        interaction: InteractionData, 
        exactMatch: boolean = false
    ): Promise<HTMLElement[]> {
        const candidates: HTMLElement[] = [];
        for (const { name, root } of roots) {
            try {
                const foundElements = root.querySelectorAll(selector);
                foundElements.forEach(element => {
                    if (element instanceof HTMLElement) {
                        candidates.push(element);
                    }
                });
            } catch (e) { /* Ignore selector errors */ }
        }

        if (candidates.length === 0) {
            if (this.debugMode) console.log(`[RobustFinder][${runId}] ${strategyName}: No initial candidates found using selector '${selector}'.`);
            return []; // Strategy failed to find any element
        }

        // Filter by text
        const uniqueCandidates = Array.from(new Set(candidates)); // Ensure uniqueness
        const textMatchingCandidates = !targetText ? uniqueCandidates : uniqueCandidates.filter(el => 
            this.isTextContentMatching(el, targetText, exactMatch)
        );

        if (textMatchingCandidates.length === 0) {
            if (this.debugMode) console.log(`[RobustFinder][${runId}] ${strategyName}: Found ${uniqueCandidates.length} initial candidates, but none matched text filter (Exact: ${exactMatch}, Text: "${targetText}").`);
            return []; // Strategy found elements, but none matched text
        }

        // Validate remaining candidates deeply
        if (this.debugMode) console.log(`[RobustFinder][${runId}] ${strategyName}: Found ${textMatchingCandidates.length} text-matching candidate(s). Performing deep validation...`);
        const validCandidates: HTMLElement[] = [];
        for (const candidate of textMatchingCandidates) {
             // Use SelectiveDomAnalyzer for deep validation (visibility, occlusion etc.)
            // Pass 'strict' validation mode by default.
            if (SelectiveDomAnalyzer.validateCandidateElement(candidate, interaction)) { 
                validCandidates.push(candidate);
            }
        }
        
        if (this.debugMode) console.log(`[RobustFinder][${runId}] ${strategyName}: Deep validation resulted in ${validCandidates.length} valid candidate(s).`);
        return validCandidates; // Return validated candidates (could be 0, 1, or >1)
    }

    /** Helper to execute an XPath strategy */
    private static async executeXPathStrategy(
        runId: string, 
        strategyName: string, 
        roots: { name: string; root: Document | Element }[], 
        xpath: string, 
        targetText: string | undefined, 
        interaction: InteractionData, 
        exactMatch: boolean = false
    ): Promise<HTMLElement[]> {
        const candidates: HTMLElement[] = [];
        for (const { name, root } of roots) {
            try {
                const result = document.evaluate(xpath, root, null, XPathResult.ORDERED_NODE_ITERATOR_TYPE, null);
                let node = result.iterateNext();
                while (node) {
                    if (node instanceof HTMLElement) {
                        candidates.push(node);
                    }
                    node = result.iterateNext();
                }
            } catch (e) { console.warn(`[RobustFinder][${runId}] Error evaluating XPath "${xpath.substring(0,100)}..." in ${name}:`, e); }
        }

        if (candidates.length === 0) {
            if (this.debugMode) console.log(`[RobustFinder][${runId}] ${strategyName}: No initial candidates found.`);
            return [];
        }

        const uniqueCandidates = Array.from(new Set(candidates));
        const textMatchingCandidates = !targetText ? uniqueCandidates : uniqueCandidates.filter(el => 
            this.isTextContentMatching(el, targetText, exactMatch)
        );

        if (textMatchingCandidates.length === 0) {
            if (this.debugMode) console.log(`[RobustFinder][${runId}] ${strategyName}: Found ${uniqueCandidates.length} initial candidates, but none matched text filter (Exact: ${exactMatch}, Text: "${targetText}").`);
            return [];
        }

        if (this.debugMode) console.log(`[RobustFinder][${runId}] ${strategyName}: Found ${textMatchingCandidates.length} text-matching candidate(s). Performing deep validation...`);
        const validCandidates: HTMLElement[] = [];
        for (const candidate of textMatchingCandidates) {
             if (SelectiveDomAnalyzer.validateCandidateElement(candidate, interaction)) { 
                validCandidates.push(candidate);
            }
        }
        
        if (this.debugMode) console.log(`[RobustFinder][${runId}] ${strategyName}: Deep validation resulted in ${validCandidates.length} valid candidate(s).`);
        return validCandidates;
    }

    // --- Helper Methods --- 
    // (Keep: isTextContentMatching, buildAttributeSelectors, getSearchRoots, parseAttributes, tryEscapeSelector, buildXPath, waitForModalStability, ensureCandidatesInView, findScrollableParent) 
    /** Text content matching with exact/includes option */
    private static isTextContentMatching(element: HTMLElement, targetText: string, exactMatchRequired: boolean): boolean {
        if (!targetText || targetText.trim() === '') return true;

        // Normalize the targetText (from interaction data) by lowercasing, trimming, and removing all whitespace
        // This is because the recorder already does this.
        const normalizedTargetText = targetText.toLowerCase().trim().replace(/\s+/g, '');

        const elementTextContent = (element.textContent || '').trim().toLowerCase().replace(/\s+/g, '');
        const elementInnerText = (element.innerText || '').trim().toLowerCase().replace(/\s+/g, '');
        // Prefer innerText if available and not empty, otherwise fall back to textContent
        const bestElementText = elementInnerText.length > 0 ? elementInnerText : elementTextContent;

        const valueText = (element as HTMLInputElement).value || '';
        const normalizedValueText = valueText.trim().toLowerCase().replace(/\s+/g, '');

        const ariaLabel = element.getAttribute('aria-label') || '';
        const normalizedAriaLabel = ariaLabel.trim().toLowerCase().replace(/\s+/g, '');

        if (this.debugMode) {
            console.log(`[RobustFinder] Text Matching:
    - Target (normalized): "${normalizedTargetText}" (Exact: ${exactMatchRequired})
    - Element Best Text (normalized): "${bestElementText}" (from innerText/textContent)
    - Element Value (normalized): "${normalizedValueText}"
    - Element AriaLabel (normalized): "${normalizedAriaLabel}"`);
        }

        if (exactMatchRequired) {
            return bestElementText === normalizedTargetText ||
                   normalizedValueText === normalizedTargetText ||
                   normalizedAriaLabel === normalizedTargetText;
        } else {
            return bestElementText.includes(normalizedTargetText) ||
                   normalizedValueText.includes(normalizedTargetText) ||
                   normalizedAriaLabel.includes(normalizedTargetText);
        }
    }

    /** Builds attribute selectors WITH TYPE INFO for strategy ordering */
    private static buildAttributeSelectors(tagName: string | undefined, attributes: { [key: string]: string }): { type: string; selector: string }[] {
        const selectors: { type: string; selector: string }[] = [];
        const tagPrefix = tagName ? tagName.toLowerCase() : '';
        const stableAttrs: { [key: string]: string } = { 
            'name': 'Stable', 'data-testid': 'Stable', 'data-test': 'Stable', 'href': 'Stable', 'src': 'Stable' 
        };
        const otherAttrs: { [key: string]: string } = {
             'placeholder': 'Other', 'title': 'Other', 'aria-label': 'Other'
         }; 
        for (const attr in stableAttrs) {
            if (attributes[attr]) { selectors.push({ type: stableAttrs[attr], selector: `${tagPrefix}[${attr}="${CSS.escape(attributes[attr])}"]` }); }
        }
        for (const attr in otherAttrs) {
            if (attributes[attr]) { selectors.push({ type: otherAttrs[attr], selector: `${tagPrefix}[${attr}="${CSS.escape(attributes[attr])}"]` }); }
        }
        if (attributes['role']) selectors.push({ type: 'Role', selector: `${tagPrefix}[role="${CSS.escape(attributes['role'])}"]` });
        if (attributes['type']) selectors.push({ type: 'Type', selector: `${tagPrefix}[type="${CSS.escape(attributes['type'])}"]` });
        return selectors;
    }

    private static getSearchRoots(): { name: string; root: Document | Element }[] {
        const roots: { name: string; root: Document | Element }[] = [];
        let foundSpecificContent = false;

        try {
            // Look specifically for Hyphen portals first
            const portals = document.querySelectorAll('[data-portal="true"]');
            if (portals.length > 0) {
                portals.forEach((portal, index) => { roots.push({ name: `Portal ${index + 1}`, root: portal }); });
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

    private static parseAttributes(attrs: string | { [key: string]: string } | undefined): { [key: string]: string } | null {
         if (!attrs) return null;
         if (typeof attrs === 'object') return attrs;
         try {
            return JSON.parse(attrs);
         } catch (e) {
            console.error("[RobustFinder] Failed to parse attributes JSON:", attrs, e);
            return null;
         }
    }

    private static tryEscapeSelector(selector: string): string {
         try {
             selector = selector.replace(/#((?:\\.|[\w-]|[^\x00-\xa0])+)(\S*)/g, (match, idPart, remainder) => `#${idPart}${CSS.escape(remainder)}`);
             selector = selector.replace(/\[([^\]=]+)=["']?([^\]"']+)["']?\]/g, (match, attr, value) => `[${attr}="${CSS.escape(value)}"]`);
         } catch (e) {
             console.warn(`[RobustFinder] CSS escaping failed for selector: ${selector}`, e);
         }
         return selector;
    }

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

    private static waitForModalStability(initialDelay = 150, checkInterval = 100, maxAttempts = 20, stabilityThreshold = 3): Promise<void> {
        return new Promise(resolve => {
            const shouldLogStability = this.debugMode; 
            if (shouldLogStability) console.log('[RobustFinder-Stability] Starting stability check...');
            const stabilitySelectors ='[data-portal="true"], [role="dialog"], .modal-content, .mantine-Modal-content, .MuiDialog-paper, .MuiModal-root > div[role="presentation"]:not([aria-hidden="true"])';
            const initialElements = document.querySelectorAll(stabilitySelectors);
            if (initialElements.length === 0) { if (shouldLogStability) console.log('[RobustFinder-Stability] No initial modal/portal elements found. Resolving immediately.'); resolve(); return; }
            let stableCount = 0, lastElementCount = initialElements.length, lastStructureSignature = '', attempts = 0;
            const getStructureSignature = (elements: NodeListOf<Element>): string => { return Array.from(elements).map(el => { const r = el.getBoundingClientRect(); return `${el.tagName}${el.id?'#'+el.id:''}:${el.classList.length}:${Math.round(r.width)}x${Math.round(r.height)}@${Math.round(r.left)},${Math.round(r.top)}`}).join('|'); };
            lastStructureSignature = getStructureSignature(initialElements);
            const checkStability = () => { attempts++; const currentElements = document.querySelectorAll(stabilitySelectors); const currentStructureSignature = getStructureSignature(currentElements); if (shouldLogStability) { console.log(`[RobustFinder-Stability] Check #${attempts}: Found ${currentElements.length} elements. Sig: ${currentStructureSignature.substring(0,100)}...`); } if (currentElements.length === lastElementCount && currentStructureSignature === lastStructureSignature) { stableCount++; if (shouldLogStability) console.log(`[RobustFinder-Stability] Structure stable for ${stableCount} checks.`); if (stableCount >= stabilityThreshold) { if (shouldLogStability) console.log('[RobustFinder-Stability] Structure deemed stable. Resolving.'); resolve(); return; } } else { if (shouldLogStability) console.log('[RobustFinder-Stability] Structure changed. Resetting stability counter.'); stableCount = 0; lastElementCount = currentElements.length; lastStructureSignature = currentStructureSignature; } if (attempts < maxAttempts) { setTimeout(checkStability, checkInterval); } else { if (shouldLogStability) console.log('[RobustFinder-Stability] Max attempts reached. Resolving anyway.'); resolve(); } };
            setTimeout(checkStability, initialDelay);
        });
    }

    // Keep these as public static if CursorFlow needs them for scrolling
    public static async ensureCandidatesInView(candidates: HTMLElement[]): Promise<HTMLElement[]> {
        const visibleCandidates: HTMLElement[] = [];
        
        // Try different scroll behaviors if the first one doesn't work
        const scrollBehaviors: ScrollIntoViewOptions[] = [
            { behavior: 'smooth', block: 'center' },
            { behavior: 'auto', block: 'center' },  // Fallback to instant scrolling
            { behavior: 'auto', block: 'nearest' }  // Minimum required scroll
        ];
        
        for (const element of candidates) {
            try {
                // Check if element is in viewport
                const rect = element.getBoundingClientRect();
                const isInViewport = (
                    rect.top >= 0 &&
                    rect.left >= 0 &&
                    rect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
                    rect.right <= (window.innerWidth || document.documentElement.clientWidth)
                );
                
                if (isInViewport) {
                    console.log(`[RobustFinder] Element already in viewport:`, element.tagName, element.id);
                    visibleCandidates.push(element);
                    continue;
                }
                
                // Element not in viewport, try to scroll it into view
                console.log(`[RobustFinder] Element not in viewport, attempting to scroll:`, element.tagName, element.id);
                
                // Check if element is in a scrollable container (like a modal)
                const scrollableContainer = this.findScrollableParent(element);
                
                // Try each scroll behavior until one works
                let scrollSucceeded = false;
                for (const scrollBehavior of scrollBehaviors) {
                    if (scrollSucceeded) break;
                    
                    // If element is in a scrollable container, scroll that container
                    if (scrollableContainer && scrollableContainer !== document.body && scrollableContainer !== document.documentElement) {
                        console.log(`[RobustFinder] Scrolling container:`, scrollableContainer.tagName, scrollableContainer.id);
                        
                        // Calculate position to scroll to
                        const containerRect = scrollableContainer.getBoundingClientRect();
                        const elementRect = element.getBoundingClientRect();
                        const relativeTop = elementRect.top - containerRect.top;
                        
                        // Scroll the container
                        scrollableContainer.scrollTop = scrollableContainer.scrollTop + relativeTop - containerRect.height / 2;
                    } else {
                        // Scroll the element directly
                        element.scrollIntoView(scrollBehavior);
                    }
                    
                    // Wait for scroll to complete
                    await new Promise(resolve => setTimeout(resolve, scrollBehavior.behavior === 'smooth' ? 500 : 100));
                    
                    // Check if element is now in viewport
                    const newRect = element.getBoundingClientRect();
                    const isNowInViewport = (
                        newRect.top >= 0 &&
                        newRect.left >= 0 &&
                        newRect.bottom <= (window.innerHeight || document.documentElement.clientHeight) &&
                        newRect.right <= (window.innerWidth || document.documentElement.clientWidth)
                    );
                    
                    if (isNowInViewport) {
                        console.log(`[RobustFinder] Successfully scrolled element into viewport with behavior:`, scrollBehavior.behavior);
                        visibleCandidates.push(element);
                        scrollSucceeded = true;
                        break;
                    }
                    
                    // If element still not fully in viewport but partially visible, it might be good enough
                    const isPartiallyVisible = (
                        newRect.top < (window.innerHeight || document.documentElement.clientHeight) &&
                        newRect.bottom > 0 &&
                        newRect.left < (window.innerWidth || document.documentElement.clientWidth) &&
                        newRect.right > 0
                    );
                    
                    if (isPartiallyVisible) {
                        console.log(`[RobustFinder] Element partially visible after scrolling with behavior:`, scrollBehavior.behavior);
                        visibleCandidates.push(element);
                        scrollSucceeded = true;
                        break;
                    }
                }
                
                if (!scrollSucceeded) {
                    console.log(`[RobustFinder] Element still not visible after all scroll attempts:`, element.tagName, element.id);
                }
            } catch (e) {
                console.warn(`[RobustFinder] Error checking/scrolling element:`, e);
            }
        }
        
        return visibleCandidates;
    }
    
    public static findScrollableParent(element: HTMLElement): HTMLElement | null {
        if (!element) return null;
        
        // Start with the parent element
        let parent = element.parentElement;
        
        // Traverse up the DOM tree
        while (parent) {
            const style = window.getComputedStyle(parent);
            const overflowY = style.getPropertyValue('overflow-y');
            const overflowX = style.getPropertyValue('overflow-x');
            
            // Check if this element has scrollable overflow
            if (
                (overflowY === 'auto' || overflowY === 'scroll') ||
                (overflowX === 'auto' || overflowX === 'scroll')
            ) {
                return parent;
            }
            
            // Move up to the next parent
            parent = parent.parentElement;
        }
        
        // If no scrollable parent found, return document.body
        return document.body;
    }

    // --- ADDED FROM ElementUtils ---
    static compareUrls(url1: string, url2: string): boolean {
      if (!url1 || !url2) {
        console.log('URL COMPARE: One or both URLs are empty', { url1, url2 });
        return false;
      }
      
      try {
        // Parse URLs to handle components properly
        const parseUrl = (url: string) => {
          try {
            // Add protocol if missing for URL parsing
            if (!url.match(/^https?:\/\//)) {
              url = 'http://' + url;
            }
            
            const parsed = new URL(url);
            return {
              hostname: parsed.hostname,
              pathname: parsed.pathname.replace(/\/\$/, '') || '/', // Remove trailing slash but keep root slash
              search: parsed.search,
              hash: parsed.hash
            };
          } catch (error) {
            console.error('Failed to parse URL:', url, error);
            // Return a fallback structure
            return {
              hostname: url.split('/')[0],
              pathname: '/' + url.split('/').slice(1).join('/'),
              search: '',
              hash: ''
            };
          }
        };
        
        const parsedUrl1 = parseUrl(url1);
        const parsedUrl2 = parseUrl(url2);
        
        // Debug log
        console.log('URL COMPARE DETAILS:', {
          url1: { original: url1, parsed: parsedUrl1 },
          url2: { original: url2, parsed: parsedUrl2 }
        });
        
        // Special case: If either URL is localhost, only compare paths
        const isLocalhost1 = parsedUrl1.hostname.includes('localhost') || parsedUrl1.hostname.includes('127.0.0.1');
        const isLocalhost2 = parsedUrl2.hostname.includes('localhost') || parsedUrl2.hostname.includes('127.0.0.1');
        
        // If one is localhost and the other isn't, ignore hostname comparison
        if (isLocalhost1 || isLocalhost2) {
          // When using localhost, paths must still match exactly
          const pathsMatch = parsedUrl1.pathname === parsedUrl2.pathname;
          console.log('URL COMPARE RESULT (localhost mode):', { 
            pathsMatch,
            path1: parsedUrl1.pathname, 
            path2: parsedUrl2.pathname 
          });
          return pathsMatch;
        }
        
        // For non-localhost URLs, compare both hostname and pathname
        const hostnameMatch = parsedUrl1.hostname.toLowerCase() === parsedUrl2.hostname.toLowerCase();
        const pathMatch = parsedUrl1.pathname === parsedUrl2.pathname;
        const result = hostnameMatch && pathMatch;
        
        console.log('URL COMPARE RESULT (standard mode):', { 
          result, 
          hostnameMatch, 
          pathMatch,
          hostname1: parsedUrl1.hostname,
          hostname2: parsedUrl2.hostname,
          path1: parsedUrl1.pathname, 
          path2: parsedUrl2.pathname 
        });
        
        return result;
      } catch (error) {
        console.error('Error comparing URLs:', error);
        
        // Fallback to simple string comparison if URL parsing fails
        const fallbackResult = url1.toLowerCase() === url2.toLowerCase();
        console.log('URL COMPARE FALLBACK RESULT:', fallbackResult);
        return fallbackResult;
      }
    }

} 