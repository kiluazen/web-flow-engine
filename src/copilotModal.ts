import { ApiClient } from './apiClient';
import {ThemeOptions } from './uiComponents'; // Keep this for footer and maybe button positioning
import hyphenboxSvg from '../assets/hyphenbox.svg'; // Import the SVG

export class CopilotModal {
    private static activeModal: HTMLElement | null = null;
    private static apiClient: ApiClient | null = null; // To perform the search
    private static onGuideFound: (guideId: string) => void = () => {}; // Callback when guide found
    // private static onViewAllGuides: () => void = () => {}; // No longer needed, handled internally
    private static theme: ThemeOptions = {};
    private static searchLoadingIndicator: HTMLElement | null = null; // Specific loading indicator
    private static currentView: 'search' | 'list' = 'search'; // Track current view
    private static allGuides: any[] = []; // Cache guides
    private static loadingDotsStyleAdded: boolean = false; // Ensure style is added only once

    static init(apiClient: ApiClient, onGuideFound: (guideId: string) => void, /* onViewAllGuides: () => void, */ theme: ThemeOptions) {
        this.apiClient = apiClient;
        this.onGuideFound = onGuideFound;
        // this.onViewAllGuides = onViewAllGuides; // No longer needed
        this.theme = theme;
    }

    static showSearchModal() {
        // Close existing modal first
        this.closeSearchModal();
        this.currentView = 'search'; // Ensure default view
        this.addLoadingDotsStyle(); // Ensure styles are present

        // Create overlay - Updated background color
        const overlay = document.createElement('div');
        overlay.id = 'hyphen-search-overlay';
        overlay.style.cssText = `
            position: fixed;
            top: 0;
            left: 0;
            width: 100vw;
            height: 100vh;
            background-color: rgba(0, 0, 0, 0.7); /* !! UPDATED TO DARKER BLACK !! */
            z-index: 10000; /* Ensure it's above most elements */
            display: flex;
            justify-content: center;
            align-items: center;
            opacity: 0;
            transition: opacity 0.3s ease;
        `;

        // Create modal container
        const modal = document.createElement('div');
        modal.id = 'hyphen-search-modal';
        modal.style.cssText = `
            background-color: #ffffff;
            padding: 0; /* Remove padding here, apply to inner container */
            border-radius: 16px;
            box-shadow: 0 5px 20px rgba(0, 0, 0, 0.15);
            width: 90%;
            max-width: 500px;
            /* Allow height to adjust */
            max-height: 80vh; /* Limit height */
            transform: translateY(20px);
            transition: transform 0.3s ease;
            font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, sans-serif;
            display: flex; /* Use flex for layout */
            flex-direction: column; /* Stack vertically */
            overflow: hidden; /* Needed for border-radius and scrolling */
        `;

        // Inner container for content and padding
        const modalContent = document.createElement('div');
        modalContent.id = 'hyphen-modal-content';
        modalContent.style.cssText = `
            padding: 24px;
            display: flex;
            flex-direction: column;
            gap: 16px;
            flex-grow: 1; /* Allow content to grow */
            overflow-y: auto; /* Enable scrolling for content if needed */
        `;

        // Render the initial search view
        this.renderSearchView(modalContent); // Pass content container

        // Assemble Modal (add content container)
        modal.appendChild(modalContent);

        // Assemble Overlay
        overlay.appendChild(modal);
        document.body.appendChild(overlay);
        this.activeModal = modal;

        // Trigger animations
        requestAnimationFrame(() => {
            overlay.style.opacity = '1';
            modal.style.transform = 'translateY(0)';
        });

        // Focus input if in search view
        const input = modal.querySelector<HTMLInputElement>('#hyphen-search-input');
        if (input) {
            input.focus();
        }

        // Close on overlay click
        overlay.addEventListener('click', (e) => {
            if (e.target === overlay) {
                this.closeSearchModal();
            }
        });
    }

    // --- NEW: Method to render the initial Search View ---
    private static renderSearchView(container: HTMLElement) {
        container.innerHTML = ''; // Clear previous content
        this.currentView = 'search'; // Set view state

        // Title
        const title = document.createElement('h2');
        title.textContent = 'How can I help you today?';
        title.style.cssText = `
            margin: 0 0 8px 0; /* Added bottom margin */
            font-size: 18px;
            font-weight: 600;
            color: #1a1a1a;
            text-align: center;
        `;

        // Search Input Area
        const searchArea = document.createElement('div');
        searchArea.style.cssText = `
            display: flex;
            gap: 8px;
            align-items: center; /* Vertically align items */
        `;

        const input = document.createElement('input');
        input.type = 'text';
        input.placeholder = 'Ask a question or describe your task...';
        input.id = 'hyphen-search-input'; // Keep ID for focusing
        input.style.cssText = `
            flex-grow: 1;
            padding: 10px 14px;
            border: 1px solid #d0d0d0;
            border-radius: 8px;
            font-size: 14px;
            outline: none;
            transition: border-color 0.2s ease, box-shadow 0.2s ease;
        `;
        input.addEventListener('focus', () => {
            input.style.borderColor = '#808080';
            input.style.boxShadow = '0 0 0 2px rgba(128, 128, 128, 0.2)';
        });
        input.addEventListener('blur', () => {
            input.style.borderColor = '#d0d0d0';
            input.style.boxShadow = 'none';
        });

        // Unassuming Search Button (Icon Only)
        const searchButton = document.createElement('button');
        searchButton.id = 'hyphen-search-submit';
        searchButton.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <circle cx="11" cy="11" r="8"></circle>
                <line x1="21" y1="21" x2="16.65" y2="16.65"></line>
            </svg>
        `; // Search Icon
        searchButton.setAttribute('aria-label', 'Search');
        searchButton.style.cssText = `
            padding: 8px; /* Adjust padding for icon */
            border: 1px solid #e0e0e0; /* Subtle border */
            border-radius: 8px;
            background-color: #f8f8f8; /* Light gray */
            color: #555; /* Icon color */
            cursor: pointer;
            transition: background-color 0.2s ease, border-color 0.2s ease;
            display: flex; /* Align icon */
            align-items: center;
            justify-content: center;
        `;
        searchButton.addEventListener('mouseover', () => { searchButton.style.backgroundColor = '#eee'; searchButton.style.borderColor = '#ccc'; });
        searchButton.addEventListener('mouseout', () => { searchButton.style.backgroundColor = '#f8f8f8'; searchButton.style.borderColor = '#e0e0e0'; });
        searchButton.addEventListener('click', () => this.handleSearch(input.value));

        // Add Enter key listener to input
        input.addEventListener('keydown', (e) => {
            if (e.key === 'Enter') {
                searchButton.click();
            }
        });

        searchArea.appendChild(input);
        searchArea.appendChild(searchButton);

        // Results Area (for messages)
        const resultsArea = document.createElement('div');
        resultsArea.id = 'hyphen-search-results';
        resultsArea.style.cssText = `
            min-height: 40px; /* Increased height */
            text-align: center;
            font-size: 14px;
            color: #666;
            margin-top: 8px;
            display: flex;
            flex-direction: column;
            align-items: center;
            justify-content: center;
            gap: 10px; /* Gap for button */
        `;

        // Footer Area
        const footerArea = this.createFooter('search'); // Create footer for search view

        // Assemble Content
        container.appendChild(title);
        container.appendChild(searchArea);
        container.appendChild(resultsArea);
        container.appendChild(footerArea);

        // Focus input after rendering
        requestAnimationFrame(() => input.focus());
    }

    // --- NEW: Method to render the Guide List View ---
    private static async renderListView(container: HTMLElement) {
        container.innerHTML = ''; // Clear previous content
        this.currentView = 'list';

        // --- Header with Back Button and Title ---
        const listHeader = document.createElement('div');
        listHeader.style.cssText = `
            display: flex;
            align-items: center;
            gap: 12px;
            margin-bottom: 8px; /* Space below header */
        `;

        // Back Button
        const backButton = document.createElement('button');
        backButton.innerHTML = `
            <svg xmlns="http://www.w3.org/2000/svg" width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round">
                <line x1="19" y1="12" x2="5" y2="12"></line>
                <polyline points="12 19 5 12 12 5"></polyline>
            </svg>`; // Back arrow icon
        backButton.setAttribute('aria-label', 'Back to search');
        backButton.style.cssText = `
            background: none;
            border: none;
            padding: 5px;
            cursor: pointer;
            color: #555;
            display: flex;
            align-items: center;
        `;
        backButton.addEventListener('click', () => this.renderSearchView(container)); // Re-render search view

        // Title
        const listTitle = document.createElement('h2');
        listTitle.textContent = 'All Guides';
        listTitle.style.cssText = `
            margin: 0;
            font-size: 18px;
            font-weight: 600;
            color: #1a1a1a;
            flex-grow: 1; /* Take remaining space */
            text-align: center; /* Center title if needed */
            padding-right: 30px; /* Offset back button space */
        `;

        listHeader.appendChild(backButton);
        listHeader.appendChild(listTitle);
        container.appendChild(listHeader);

        // --- Keyword Search Input for List ---
        const listSearchInput = document.createElement('input');
        listSearchInput.type = 'text';
        listSearchInput.placeholder = 'Filter guides...';
        listSearchInput.style.cssText = `
            width: 100%; /* Full width */
            padding: 8px 12px;
            border: 1px solid #e0e0e0;
            border-radius: 6px;
            font-size: 14px;
            outline: none;
            margin-bottom: 12px; /* Space below input */
            box-sizing: border-box; /* Include padding/border in width */
        `;

        container.appendChild(listSearchInput);


        // --- Guide List Area ---
        const guideListArea = document.createElement('div');
        guideListArea.id = 'hyphen-guide-list';
        guideListArea.style.cssText = `
            max-height: 40vh; /* Limit height and make scrollable */
            overflow-y: auto;
            border: 1px solid #f0f0f0; /* Optional border */
            border-radius: 8px;
        `;
        container.appendChild(guideListArea);


        // --- Loading Indicator ---
        const loadingIndicator = document.createElement('div');
        loadingIndicator.textContent = 'Loading guides...';
        loadingIndicator.style.cssText = `padding: 20px; text-align: center; color: #888; font-style: italic;`;
        guideListArea.appendChild(loadingIndicator);

        // --- Footer ---
        const footerArea = this.createFooter('list'); // Create footer for list view
        container.appendChild(footerArea); // Append footer directly to container

        // --- Fetch and Render Guides ---
        try {
            // Fetch guides only if not cached or cache is empty
            if (!this.allGuides || this.allGuides.length === 0) {
                if (!this.apiClient) throw new Error("API Client not initialized");
                console.log('Fetching all guides for list view...');
                this.allGuides = await this.apiClient.getRecordings(); // Fetch all guides (no query)
            }

            loadingIndicator.remove(); // Remove loading indicator

            if (!this.allGuides || this.allGuides.length === 0) {
                guideListArea.innerHTML = `<div style="padding: 20px; text-align: center; color: #888;">No guides available.</div>`;
                return;
            }

            // Function to render the list items
            const renderListItems = (guides: any[]) => {
                guideListArea.innerHTML = ''; // Clear previous items
                guides.forEach(guide => {
                    const item = document.createElement('div');
                    item.textContent = guide.name || 'Untitled Guide';
                    item.style.cssText = `
                        padding: 10px 15px;
                        cursor: pointer;
                        border-bottom: 1px solid #f0f0f0;
                        font-size: 14px;
                        transition: background-color 0.2s ease;
                        color: #333;
                    `;
                    item.addEventListener('mouseover', () => item.style.backgroundColor = '#f9f9f9');
                    item.addEventListener('mouseout', () => item.style.backgroundColor = '');
                    item.addEventListener('click', () => {
                        this.closeSearchModal();
                        this.onGuideFound(guide.id); // Trigger guide start
                    });
                    guideListArea.appendChild(item);
                });
                 // Remove border from last item
                 const lastItem = guideListArea.lastElementChild as HTMLElement;
                 if (lastItem) {
                     lastItem.style.borderBottom = 'none';
                 }
            };

            // Initial render of all guides
            renderListItems(this.allGuides);

            // Add filtering logic to the search input
            listSearchInput.addEventListener('input', (e) => {
                const query = (e.target as HTMLInputElement).value.toLowerCase();
                const filteredGuides = this.allGuides.filter(guide =>
                    (guide.name || '').toLowerCase().includes(query) ||
                    (guide.description || '').toLowerCase().includes(query)
                );
                renderListItems(filteredGuides);
            });

        } catch (error) {
            console.error('Failed to fetch or render guides:', error);
            guideListArea.innerHTML = `<div style="padding: 20px; text-align: center; color: #dc3545;">Failed to load guides.</div>`;
        }
    }


    // --- NEW: Method to create the footer based on view ---
    private static createFooter(view: 'search' | 'list'): HTMLElement {
        const footerArea = document.createElement('div');
        footerArea.style.cssText = `
            display: flex;
            justify-content: space-between;
            align-items: center;
            border-top: 1px solid #f0f0f0;
            padding-top: 16px;
            margin-top: 16px; /* Consistent margin */
        `;

        // Left side: 'View All Guides' button (only in search view) or empty placeholder
        const leftSide = document.createElement('div');
        leftSide.style.minWidth = '100px'; // Reserve space

        if (view === 'search') {
            const allGuidesButton = document.createElement('button');
            allGuidesButton.textContent = 'View All Guides';
            allGuidesButton.style.cssText = `
                background: none;
                border: none;
                color: #555;
                font-size: 13px;
                cursor: pointer;
                padding: 5px;
                text-decoration: underline;
                transition: color 0.2s;
            `;
            allGuidesButton.addEventListener('mouseover', () => allGuidesButton.style.color = '#111');
            allGuidesButton.addEventListener('mouseout', () => allGuidesButton.style.color = '#555');
            allGuidesButton.addEventListener('click', () => {
                // Find the modal content container and render the list view
                const modalContent = document.getElementById('hyphen-modal-content');
                if (modalContent) {
                    this.renderListView(modalContent);
                } else {
                    console.error("Could not find modal content container to render list view.");
                }
                // Don't close modal here
            });
            leftSide.appendChild(allGuidesButton);
        }

        // Right side: Powered by
        const poweredByFooter = this.createPoweredByFooter(); // Use helper

        footerArea.appendChild(leftSide);
        footerArea.appendChild(poweredByFooter);

        return footerArea;
    }


    static closeSearchModal() {
        this.hideSearchLoading(); // Ensure loading state is cleared
        const overlay = document.getElementById('hyphen-search-overlay');
        const modal = this.activeModal;

        if (overlay && modal) {
            overlay.style.opacity = '0';
            modal.style.transform = 'translateY(20px)';
            setTimeout(() => {
                if (document.body.contains(overlay)) {
                    document.body.removeChild(overlay);
                }
                this.activeModal = null;
            }, 300);
        } else if (overlay && document.body.contains(overlay)) {
            // Fallback if modal reference lost
            document.body.removeChild(overlay);
        }
        this.activeModal = null;
        this.currentView = 'search'; // Reset view on close
        this.allGuides = []; // Clear guide cache on close
    }

    private static async handleSearch(query: string) {
        if (!query.trim() || !this.apiClient) {
            this.updateResultsMessage('Please enter a question or task.', 'warning');
            return;
        }

        this.showSearchLoading(); // Show loading indicator

        try {
            const match = await this.apiClient.semanticSearch(query);
            this.hideSearchLoading(); // Hide indicator after API call

            if (match && match.id) {
                console.log(`Semantic search found match: ${match.name} (${match.id})`);
                // Display message and "Start Guide" button
                this.updateResultsMessage(`Found guide: "${match.name || 'Untitled'}"`, 'success', true, match.id);
            } else {
                console.log('Semantic search found no high-confidence match.');
                this.updateResultsMessage(
                    'Sorry, no exact match found. Try rephrasing or view all guides.',
                    'info'
                );
            }
        } catch (error) {
            this.hideSearchLoading(); // Ensure indicator is hidden on error
            console.error('Error during semantic search:', error);
            this.updateResultsMessage('Search failed. Please try again later.', 'error');
        }
    }

    // Updated updateResultsMessage to handle adding the button
    private static updateResultsMessage(message: string, type: 'info' | 'warning' | 'error' | 'success' | '' = 'info', showStartButton: boolean = false, guideId: string | null = null) {
        if (this.currentView !== 'search') return;

        const resultsArea = document.getElementById('hyphen-search-results');
        if (resultsArea) {
            resultsArea.innerHTML = ''; // Clear previous content (including potential loading indicator)

            // Message Span
            const messageSpan = document.createElement('span');
            messageSpan.textContent = message;
            messageSpan.style.color = type === 'error' ? '#dc3545' :
                                      type === 'warning' ? '#ffc107' :
                                      type === 'success' ? '#28a745' :
                                      '#666';
            resultsArea.appendChild(messageSpan);

            // Add Start Guide Button if needed
            if (showStartButton && guideId) {
                const startButton = document.createElement('button');
                startButton.textContent = 'Start Guide';
                startButton.style.cssText = `
                    margin-left: 10px; /* Space from message */
                    padding: 6px 12px;
                    border: none;
                    border-radius: 6px;
                    background-color: ${this.theme.buttonColor || '#007bff'}; /* Use theme color */
                    color: white;
                    font-size: 14px;
                    font-weight: 500;
                    cursor: pointer;
                    transition: background-color 0.2s ease;
                `;
                startButton.addEventListener('mouseover', () => startButton.style.backgroundColor = this.adjustColor(this.theme.buttonColor || '#007bff', -20));
                startButton.addEventListener('mouseout', () => startButton.style.backgroundColor = this.theme.buttonColor || '#007bff');
                startButton.addEventListener('click', () => {
                    this.closeSearchModal();
                    this.onGuideFound(guideId);
                });
                resultsArea.appendChild(startButton); // Append button next to message
            }

            // Add small animation
            resultsArea.style.opacity = '0';
            requestAnimationFrame(() => {
                resultsArea.style.transition = 'opacity 0.3s';
                resultsArea.style.opacity = '1';
            });
        }
    }

    // Renamed from showThinking
    private static showSearchLoading() {
        this.hideSearchLoading(); // Ensure previous state is cleared

        const input = document.getElementById('hyphen-search-input') as HTMLInputElement | null;
        const searchButton = document.getElementById('hyphen-search-submit') as HTMLButtonElement | null;
        if (input) input.disabled = true;
        if (searchButton) searchButton.disabled = true;

        const resultsArea = document.getElementById('hyphen-search-results');
        if (resultsArea) {
             // Clear previous content and add loading indicator
             resultsArea.innerHTML = `
                <div style="display: flex; align-items: center; justify-content: center; gap: 5px; color: #888;">
                    <span>Figuring out the guide</span>
                    <span class="copilot-loading-dots"><span>.</span><span>.</span><span>.</span></span>
                </div>
            `;
            this.searchLoadingIndicator = resultsArea.firstElementChild as HTMLElement;
        }
    }

    // Renamed from hideThinking
    private static hideSearchLoading() {
         const input = document.getElementById('hyphen-search-input') as HTMLInputElement | null;
         const searchButton = document.getElementById('hyphen-search-submit') as HTMLButtonElement | null;
         if (input) input.disabled = false;
         if (searchButton) searchButton.disabled = false;

        // Remove the specific loading indicator if it exists
        if (this.searchLoadingIndicator && this.searchLoadingIndicator.parentElement) {
            this.searchLoadingIndicator.parentElement.innerHTML = ''; // Clear results area content
        }
        this.searchLoadingIndicator = null;
    }

    // Add CSS for loading dots (only once)
    private static addLoadingDotsStyle() {
        if (this.loadingDotsStyleAdded) return;
        const style = document.createElement('style');
        style.textContent = `
            .copilot-loading-dots span {
                animation: copilot-dots 1.4s infinite;
                animation-fill-mode: both;
                opacity: 0;
            }
            .copilot-loading-dots span:nth-child(2) {
                animation-delay: 0.2s;
            }
            .copilot-loading-dots span:nth-child(3) {
                animation-delay: 0.4s;
            }
            @keyframes copilot-dots {
                0%, 80%, 100% { opacity: 0; }
                40% { opacity: 1; }
            }
        `;
        document.head.appendChild(style);
        this.loadingDotsStyleAdded = true;
    }

    // Helper to reuse color adjustment logic if needed
    private static adjustColor(color: string, amount: number): string {
        try {
            let usePound = false;
            if (color[0] == "#") {
                color = color.slice(1);
                usePound = true;
            }
            const num = parseInt(color, 16);
            let r = (num >> 16) + amount;
            if (r > 255) r = 255;
            else if (r < 0) r = 0;
            let b = ((num >> 8) & 0x00FF) + amount;
            if (b > 255) b = 255;
            else if (b < 0) b = 0;
            let g = (num & 0x0000FF) + amount;
            if (g > 255) g = 255;
            else if (g < 0) g = 0;
            const newColor = (g | (b << 8) | (r << 16)).toString(16);
            // Pad with leading zeros if necessary
            const paddedColor = "000000".slice(newColor.length) + newColor;
            return (usePound ? "#" : "") + paddedColor;
        } catch (e) {
            return color; // Fallback
        }
    }

    // Re-create the powered by footer logic here or import if possible
    private static createPoweredByFooter(): HTMLElement {
        const footer = document.createElement('div');
        footer.style.cssText = `display: flex; align-items: center; justify-content: center; gap: 4px; color: #666; font-size: 12px; line-height: 1;`;

        const poweredByText = document.createElement('span');
        poweredByText.textContent = 'powered by';
        poweredByText.style.cssText = `opacity: 0.7; display: flex; align-items: center; height: 18px;`;

        // Create Anchor Tag for the link
        const logoLink = document.createElement('a');
        logoLink.href = 'https://hyphenbox.com';
        logoLink.target = '_blank';
        logoLink.rel = 'noopener noreferrer';
        logoLink.style.display = 'flex'; // Make link a flex container
        logoLink.style.alignItems = 'center';
        logoLink.style.textDecoration = 'none'; // Remove underline from link

        const logoContainer = document.createElement('div');
        logoContainer.style.cssText = `display: flex; align-items: center; justify-content: center; height: 18px; width: 55px; position: relative; transform: translateY(1px); cursor: pointer;`; // Added cursor: pointer
        
        // Use the imported SVG
        logoContainer.innerHTML = hyphenboxSvg;

        // Style the SVG inside the container
        const svg = logoContainer.querySelector('svg');
        if (svg) {
            svg.style.cssText = `
                width: 100%;
                height: 100%;
                opacity: 0.7;
                display: block;
                transition: opacity 0.2s ease;
            `;
            svg.setAttribute('preserveAspectRatio', 'xMidYMid meet');
            svg.setAttribute('viewBox', '0 0 3163 849');

            // Add hover effect to SVG via link
            logoLink.addEventListener('mouseover', () => { svg.style.opacity = '1'; });
            logoLink.addEventListener('mouseout', () => { svg.style.opacity = '0.7'; });
        } else {
             console.warn('[Hyphen CopilotModal] SVG element not found in container for footer logo.');
             // Fallback text if SVG fails to load/render
             logoContainer.textContent = 'HyphenBox';
             logoContainer.style.fontWeight = 'bold';
             logoContainer.style.opacity = '0.7';
        }

        // Append logo container to the link
        logoLink.appendChild(logoContainer);

        // Append text and link to footer
        footer.appendChild(poweredByText);
        footer.appendChild(logoLink);

        return footer;
    }
} 