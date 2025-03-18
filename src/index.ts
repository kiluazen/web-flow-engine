import { CursorFlowUI } from './ui/components';
import { StateManager } from './utils/state-manager';
import { ElementUtils } from './utils/element-utils';
import { ApiClient } from './api/client';
import { 
  CursorFlowOptions,
  Recording,
  Interaction,
  CursorFlowState,
  Customization
} from './types';

export default class CursorFlow {
  private options: CursorFlowOptions;
  private apiClient: ApiClient;
  private state: CursorFlowState;
  private autoProgressTimeout: any;
  private guides: any[] = [];

  constructor(options: CursorFlowOptions) {
    this.options = {
      theme: {
        cursorColor: '#22c55e',
        highlightColor: 'rgba(34, 197, 94, 0.3)',
        buttonColor: '#22c55e',
        ...options.theme
      },
      ...options
    };

    this.apiClient = new ApiClient(this.options.apiUrl);
    
    this.state = {
      isPlaying: false,
      currentStep: 0,
      recording: null,
      cursor: null,
      highlight: null,
      startButton: null,
      targetElement: null,
      navigationInProgress: false,
      recordingId: options.recordingId
    };
    
    // Store instance reference for global access
    if (typeof window !== 'undefined') {
      // Check if CursorFlow exists in window
      if (!(window as any).CursorFlow) {
        (window as any).CursorFlow = {};
      }
      (window as any).CursorFlow.instance = this;
    }
  }

  /**
   * Initialize CursorFlow
   */
  async init(): Promise<boolean> {
    console.log('Initializing CursorFlow');
    
    // Check state FIRST
    const savedState = StateManager.restore();
    const isPlaying = savedState?.isPlaying || false;
    
    // Then create visual elements with CORRECT INITIAL STATE
    this.createVisualElements(isPlaying);
    
    // Check server health
    const isServerHealthy = await this.apiClient.checkHealth().catch(() => false);
    if (!isServerHealthy) {
      console.error('CursorFlow: Server is not available');
      return false;
    }
    
    // Load available guides
    try {
      const guidesResponse = await this.apiClient.getRecordings();
      if (guidesResponse && guidesResponse.recordings) {
        this.guides = guidesResponse.recordings;
        console.log(`Loaded ${this.guides.length} guides`);
      }
    } catch (error) {
      console.error('Failed to load guides:', error);
      // Continue initialization even if guides can't be loaded
    }
    
    // Check for existing flow state
    if (savedState && savedState.recordingId) {
      console.log("Restoring saved state...", { 
        currentStep: savedState.currentStep,
        isPlaying: savedState.isPlaying,
        recordingId: savedState.recordingId,
        hasCustomizations: !!savedState.customizations 
      });
      
      // Skip validation - just trust the saved state
      // If the ID was invalid, the subsequent getRecording call will fail anyway
      this.state.currentStep = savedState.currentStep;
      this.state.isPlaying = savedState.isPlaying;
      this.state.recordingId = savedState.recordingId;
      this.state.customizations = savedState.customizations;
      
      if (this.state.isPlaying) {
        // Update UI immediately
        if (this.state.startButton) {
          this.state.startButton.textContent = 'Stop Guide';
        }
        
        // Directly try to load the recording
        try {
          const response = await this.apiClient.getRecording(this.state.recordingId!);
          if (response) {
            this.state.recording = response;
            
            // Show elements and resume
            if (this.state.cursor) {
              this.state.cursor.style.display = 'block';
              document.body.appendChild(this.state.cursor);
            }
            
            if (this.state.highlight) {
              this.state.highlight.style.display = 'block';
              document.body.appendChild(this.state.highlight);
            }
            
            // Continue playback
            setTimeout(() => this.playNextStep(), 500);
          }
        } catch (error) {
          console.error("Failed to load recording, stopping guide", error);
          this.stop();
        }
      }
    }
    
    // Set up navigation detection
    this.setupNavigationDetection();
    
    // After loading customizations
    if (this.state.customizations && this.state.customizations.length > 0) {
      console.log('DEBUG - INITIAL customizations structure:');
      this.state.customizations.forEach((c, i) => {
        console.log(`Item ${i}:`, JSON.stringify(c));
      });
    }
    
    return true;
  }

  /**
   * Setup detection for SPA navigation
   */
  private setupNavigationDetection() {
    if (typeof window === 'undefined') return;

    // Next.js router detection
    if ((window as any).next && (window as any).next.router) {
      const router = (window as any).next.router;
      
      router.events.on('routeChangeStart', (url: string) => {
        // Save current state before navigation
        this.state.navigationInProgress = true;
        StateManager.save(this.state);
        console.log('Navigation started to', url);
      });
      
      router.events.on('routeChangeComplete', (url: string) => {
        // Navigation complete, restore state if needed
        this.state.navigationInProgress = false;
        
        // If we're in the middle of a playback, continue after a short delay
        if (this.state.isPlaying) {
          console.log('Navigation completed to', url, '- resuming guide');
          setTimeout(() => {
            // Make sure elements are in the DOM
            if (this.state.cursor && !document.body.contains(this.state.cursor)) {
              this.state.cursor.style.display = 'block';
              document.body.appendChild(this.state.cursor);
            }
            
            if (this.state.highlight && !document.body.contains(this.state.highlight)) {
              this.state.highlight.style.display = 'block';
              document.body.appendChild(this.state.highlight);
            }
            
            this.playNextStep();
          }, 500);
        } else {
          console.log('Navigation completed to', url, '- guide not playing');
        }
      });
      
      // Additional handler for hash changes (like in the prototype)
      router.events.on('hashChangeComplete', (url: string) => {
        // Similar to routeChangeComplete
        this.state.navigationInProgress = false;
        
        if (this.state.isPlaying) {
          setTimeout(() => {
            this.playNextStep();
          }, 500);
        }
        console.log('Hash change completed to', url);
      });
      
      return;
    }
    
    // Detect navigation via History API
    if (typeof window !== 'undefined' && window.history) {
      console.log('Setting up navigation detection');
      
      // Store original pushState method
      const originalPushState = window.history.pushState;
      
      // Override pushState to detect navigation
      window.history.pushState = (data, unused, url) => {
        // Call original first
        originalPushState.call(window.history, data, unused, url);
        
        // Call our handler
        console.log('Navigation detected via pushState to', url);
        
        // Inform state manager of navigation
        StateManager.save({
          ...this.state,
          navigationInProgress: true
        });
        
        // Wait a moment for the DOM to update
        if (this.state.isPlaying) {
          console.log('Guide is playing, checking for matching step after navigation');
          setTimeout(() => {
            console.log('Resuming after navigation to', url);
            this.state.navigationInProgress = false;
            this.playContextMatchedStep();
          }, 500);
        } else {
          console.log('Navigation completed to', url, '- guide not playing');
        }
      };
      
      // Handle hash changes
      window.addEventListener('hashchange', (e) => {
        const url = window.location.href;
        console.log('Hash change detected to', url);
        
        if (this.state.isPlaying) {
          console.log('Guide is playing, checking for matching step after hash change');
          setTimeout(() => {
            this.playContextMatchedStep();
          }, 500);
        }
        console.log('Hash change completed to', url);
      });
      
      return;
    }
    
    // Fallback to detecting page loads and unloads
    window.addEventListener('beforeunload', () => {
      console.log('Page unload detected, saving state');
      StateManager.save(this.state);
    });
    
    // For browsers that support the Navigation API
    if ('navigation' in window) {
      const nav = window.navigation as any;
      const self = this;
      
      // Override navigate method
      const originalNavigate = nav.navigate;
      nav.navigate = function(url: string) {
        console.log('Navigation API navigate detected to', url);
        
        // Call original method
        const result = originalNavigate.call(this, url);
        
        // Handle navigation if guide is playing
        if (self.state.isPlaying) {
          console.log('Guide is playing, checking for matching step after navigation');
          setTimeout(() => {
            self.state.navigationInProgress = false;
            self.playContextMatchedStep();
          }, 500);
        }
        
        return result;
      };
      
      // Override reload method
      const originalReload = history.replaceState;
      history.replaceState = function(data, unused, url) {
        StateManager.save(self.state);
        
        // Call original method
        const result = originalReload.call(this, data, unused, url);
        
        // Handle reload if guide is playing
        if (self.state.isPlaying) {
          console.log('Guide is playing, checking for matching step after state replacement');
          setTimeout(() => {
            self.state.navigationInProgress = false;
            self.playContextMatchedStep();
          }, 500);
        }
      };
    }
  }

  /**
   * Create visual elements
   */
  private createVisualElements(isPlaying: boolean = false) {
    const buttonColor = this.options.theme?.buttonColor || '#22c55e';
    const theme = this.options.theme || {
      cursorColor: '#22c55e',
      highlightColor: 'rgba(34, 197, 94, 0.3)',
      highlightBorderColor: '#22c55e',
      buttonColor: '#22c55e'
    };
    
    // Use correct initial text based on state
    const buttonText = isPlaying ? 'Stop Guide' : 'Guides';
    this.state.startButton = CursorFlowUI.createStartButton(buttonText, buttonColor, this.toggleGuidesSelector.bind(this));
    this.state.cursor = CursorFlowUI.createCursor(theme);
    console.log('Created cursor element:', this.state.cursor);
    this.state.highlight = CursorFlowUI.createHighlight(theme);
    console.log('Created highlight element:', this.state.highlight);
    
    // Add hover behavior to the button
    if (this.state.startButton) {
      this.state.startButton.addEventListener('mouseenter', this.showGuidesOnHover.bind(this));
    }
  }

  /**
   * Show guides on hover
   */
  private showGuidesOnHover() {
    if (!this.state.isPlaying && this.state.startButton) {
      CursorFlowUI.showGuidesDropdown(
        this.guides, 
        this.state.startButton, 
        (guideData: any) => {
          console.log("DEBUG: Guide selected", guideData);
          // Use the id field, not the name
          this.startGuide(guideData.id);
        }
      );
    }
  }

  /**
   * Toggle guides selector on click
   */
  private toggleGuidesSelector() {
    if (this.state.isPlaying) {
      this.stop();
      return;
    }
    
    if (this.state.startButton) {
      CursorFlowUI.showGuidesDropdown(
        this.guides, 
        this.state.startButton, 
        (guideData: any) => {
          console.log("DEBUG: Guide selected from dropdown", guideData);
          // Use the id field, not the name
          this.startGuide(guideData.id);
        },
        true
      );
    }
  }

  /**
   * Start a specific guide
   */
  private startGuide(guideId: string) {
    console.log(`Starting guide: ${guideId}`);
    
    // First stop any running guide
    if (this.state.isPlaying) {
      this.stop();
    }
    
    // Clear previous state from storage
    StateManager.clear();
    
    // Reset critical state properties for the new guide
    this.state.isPlaying = false;
    this.state.currentStep = 0;
    this.state.recording = null;
    this.state.recordingId = guideId;
    this.state.customizations = [];
    this.state.navigationInProgress = false;
    this.state.targetElement = null;
    
    // Start the guide with updated state
    this.start();
  }

  /**
   * Start playback
   */
  start() {
    if (this.state.isPlaying) return;
    
    console.log('Starting CursorFlow playback');
    this.state.isPlaying = true;
    
    // Show cursor and highlight elements
    if (this.state.cursor) {
      this.state.cursor.style.display = 'block';
      document.body.appendChild(this.state.cursor);
    }
    
    if (this.state.highlight) {
      this.state.highlight.style.display = 'block';
      document.body.appendChild(this.state.highlight);
    }
    
    // Load recording if needed, then start guide
    this.loadRecordingIfNeeded().then(() => {
      // Use context-aware navigation instead of sequential steps
      this.playContextMatchedStep();
      
      // Save state
      StateManager.save(this.state);
    });
    
    // Update startButton to show active state
    if (this.state.startButton) {
      const buttonText = this.state.startButton.querySelector('.cursor-flow-button-text');
      if (buttonText) {
        buttonText.textContent = 'Stop Guide';
      }
      
      this.state.startButton.classList.add('cursor-flow-button-active');
    }
  }

  /**
   * Load recording if needed (formerly checkStartingPoint)
   * Modified to use context-aware navigation
   */
  private async loadRecordingIfNeeded(): Promise<void> {
    console.log('Loading recording if needed:', this.state.recording ? 'already loaded' : 'not loaded');
    
    if (!this.state.recording) {
      // Use state.recordingId with fallback to options.recordingId
      const recordingId = this.state.recordingId || this.options.recordingId;
      if (!recordingId) {
        console.error('No recording ID available');
        this.stop();
        throw new Error('No recording ID available');
      }
      
      console.log(`Loading recording with ID: ${recordingId}`);
      
      try {
        // Load recording and customizations in parallel for better performance
        const [recordingResponse, customizationsResponse] = await Promise.all([
          this.apiClient.getRecording(recordingId),
          this.apiClient.getCustomizations(recordingId).catch(err => {
            console.warn('Failed to load customizations:', err);
            return { customizations: [] };
          })
        ]);
        
        // Check if recording was loaded successfully
        if (!recordingResponse || !recordingResponse.recording) {
          console.error('Invalid recording data format');
          this.stop();
          throw new Error('Invalid recording data format');
        }
        
        // Set recording data
        this.state.recording = recordingResponse;
        console.log(`Recording loaded with ${this.state.recording?.recording?.interactions?.length || 0} steps`);
        
        // Set customizations if available
        if (customizationsResponse && customizationsResponse.customizations) {
          const customizations = customizationsResponse.customizations;
          this.state.customizations = customizations;
          console.log(`Customizations loaded: ${customizations.length} items`);
          
          // Log customizations for debugging
          if (customizations.length > 0) {
            console.log('DEBUG - Loaded customizations:');
            customizations.forEach((c: Customization, i: number) => {
              console.log(`Item ${i}:`, JSON.stringify(c));
            });
          }
        } else {
          // Ensure customizations exists even if empty
          this.state.customizations = [];
        }
        
        return;
      } catch (error) {
        console.error('Failed to load recording:', error);
        this.stop();
        throw error;
      }
    } else {
      console.log(`Recording already loaded with ${this.state.recording.recording.interactions.length} steps`);
      return;
    }
  }

  /**
   * Detect which screen/step the user is currently on
   * @returns Object with match result and step index
   */
  private async detectCurrentScreen(): Promise<{matched: boolean, stepIndex: number}> {
    if (!this.state.recording || !this.state.recording.recording) {
      return Promise.resolve({matched: false, stepIndex: -1});
    }
    
    const currentPath = window.location.pathname;
    const currentUrl = window.location.href;
    const currentTitle = document.title;
    const interactions = this.state.recording.recording.interactions;
    
    console.log(`Detecting current screen. Path: ${currentPath}, Title: ${currentTitle}`);
    
    // Check each step for an exact match
    for (let i = 0; i < interactions.length; i++) {
      const interaction = interactions[i];
      const pageInfo = interaction.pageInfo;
      
      // URL match check - must match exactly
      const urlMatches = this.compareUrls(currentUrl, pageInfo.url) || 
                          this.compareUrls(currentPath, pageInfo.path);
      
      if (!urlMatches) continue;
      
      // Find the target element - must exist
      const element = ElementUtils.findElementFromInteraction(interaction);
      if (!element) continue;
      
      // If we have both URL match and element exists, we're confident
      console.log(`Found exact match at step ${i + 1}`);
      return {matched: true, stepIndex: i};
    }
    
    console.log('No exact match found for current screen');
    return {matched: false, stepIndex: -1};
  }

  /**
   * Compare URLs ignoring trailing slashes, query params, and hash
   */
  private compareUrls(url1: string, url2: string): boolean {
    if (!url1 || !url2) return false;
    
    // Normalize URLs
    const normalize = (url: string) => {
      return url.replace(/\/$/, '')  // Remove trailing slash
                .replace(/\?.*$/, '') // Remove query parameters
                .replace(/#.*$/, '') // Remove hash fragment
                .toLowerCase(); // Case insensitive
    };
    
    return normalize(url1) === normalize(url2);
  }

  /**
   * Stop the guide
   */
  stop() {
    console.log('Stopping guide');
    
    // Clear the state in localStorage first to ensure clean start next time
    StateManager.clear();
    
    // Change button text back to "Guides"
    if (this.state.startButton) {
      const buttonText = this.state.startButton.querySelector('.cursor-flow-button-text');
      if (buttonText) {
        buttonText.textContent = 'Guides';
      } else {
        // Direct fallback if the text element can't be found
        this.state.startButton.textContent = 'Guides';
      }
      
      // Update styles for stopped state
      this.state.startButton.classList.remove('cursor-flow-button-active');
    }
    
    // More reliable element removal
    if (this.state.cursor) {
      try {
        // Try removing normally first
        if (this.state.cursor.parentNode) {
          this.state.cursor.parentNode.removeChild(this.state.cursor);
        }
        // Also try selecting by ID/class as fallback
        const cursorElements = document.querySelectorAll('.cursor-flow-cursor');
        cursorElements.forEach(el => {
          if (el.parentNode) el.parentNode.removeChild(el);
        });
      } catch (e) {
        console.error('Error removing cursor element:', e);
      }
      this.state.cursor = null;
    }
    
    // Remove the highlight element
    if (this.state.highlight) {
      if (this.state.highlight.parentNode) {
        this.state.highlight.parentNode.removeChild(this.state.highlight);
      }
      this.state.highlight = null;
    }
    
    // Reset target element styles if needed
    if (this.state.targetElement) {
      // Only reset if we modified it
      const wrapper = this.state.targetElement.querySelector('.cursor-flow-position-wrapper');
      if (wrapper) {
        this.state.targetElement.style.position = '';
      }
      this.state.targetElement = null;
    }
    
    // Reset state
    this.state.isPlaying = false;
    this.state.currentStep = 0;
    this.state.recording = null; // Clear recording
    this.state.customizations = []; // Clear customizations
    
    // Clear any existing timeout
    if (this.autoProgressTimeout) {
      clearTimeout(this.autoProgressTimeout);
      this.autoProgressTimeout = null;
    }
  }

  /**
   * Detect the current context and find matching step in recording
   * Returns the matched step index or -1 if no match
   */
  private async detectCurrentContext(): Promise<{matched: boolean, stepIndex: number}> {
    if (!this.state.recording || !this.state.recording.recording || !this.state.recording.recording.interactions) {
      console.warn('No valid recording data available for context detection');
      return { matched: false, stepIndex: -1 };
    }
    
    const currentUrl = window.location.href;
    const currentPath = window.location.pathname;
    console.log(`Detecting context for: ${currentUrl} (${currentPath})`);
    
    const steps = this.state.recording.recording.interactions;
    
    // Check all steps for URL match
    for (let i = 0; i < steps.length; i++) {
      const step = steps[i];
      
      // Skip if step doesn't have required properties
      if (!step || !step.pageInfo) {
        console.warn(`Invalid step data at index ${i}`, step);
        continue;
      }
      
      // Check if URLs match
      const urlMatches = 
        ElementUtils.compareUrls(currentUrl, step.pageInfo.url) || 
        ElementUtils.compareUrls(currentPath, step.pageInfo.path);
        
      if (urlMatches) {
        console.log(`Found matching context at step ${i}: ${step.pageInfo.path}`);
        
        // Verify element exists
        const element = ElementUtils.findElementFromInteraction(step, true);
        if (element) {
          console.log(`Verified element exists for step ${i}`);
          return { matched: true, stepIndex: i };
        } else {
          console.log(`URL matched for step ${i} but element not found`);
          // Continue checking other steps with same URL in case
          // multiple steps occur on same page but with different elements
        }
      }
    }
    
    console.log('No matching context found in recording');
    return { matched: false, stepIndex: -1 };
  }

  /**
   * Play step based on current context
   */
  private async playContextMatchedStep() {
    try {
      // Validate recording data exists
      if (!this.state || !this.state.recording || !this.state.recording.recording || !this.state.recording.recording.interactions) {
        console.error('No valid recording data available');
        return;
      }
      
      const steps = this.state.recording.recording.interactions;
      if (!Array.isArray(steps) || steps.length === 0) {
        console.error('Recording has no valid steps');
        return;
      }
      
      if (this.state.navigationInProgress) {
        console.log('Skipping playContextMatchedStep while navigation is in progress');
        return;
      }
      
      // Find matching step for current context
      const context = await this.detectCurrentContext();
      
      if (!context.matched) {
        console.log('No matching step found for current context');
        
        // Show navigation prompt to first step if not at first step
        try {
          const firstStep = steps[0];
          if (firstStep && firstStep.pageInfo && firstStep.pageInfo.path) {
            const message = `This guide starts on ${firstStep.pageInfo.path}. Please navigate there to begin.`;
            CursorFlowUI.showNavigationPrompt(firstStep.pageInfo.path, message);
          } else {
            console.error('Invalid first step in recording');
            this.stop();
          }
        } catch (e) {
          console.error('Error showing navigation prompt:', e);
          this.stop();
        }
        return;
      }
      
      // Set current step based on context
      this.state.currentStep = context.stepIndex;
      
      // Get current step data with safety checks
      if (context.stepIndex < 0 || context.stepIndex >= steps.length) {
        console.error('Invalid step index:', context.stepIndex);
        return;
      }
      
      const interaction = steps[this.state.currentStep];
      
      if (!interaction || !interaction.element || !interaction.pageInfo) {
        console.error('Invalid interaction data for step', this.state.currentStep);
        return;
      }
      
      console.log(`Playing context-matched step ${this.state.currentStep + 1} of ${steps.length}`);
      
      // Find the target element with strict matching
      const targetElement = ElementUtils.findElementFromInteraction(interaction, true);
      
      if (!targetElement) {
        console.error("Could not find target element with strict matching", interaction);
        return;
      }
      
      console.log('Found target element with strict matching:', targetElement);
      
      // Execute the step
      this.state.targetElement = targetElement;
      
      // Ensure element is in view before placing cursor/highlight
      if (typeof targetElement.scrollIntoView === 'function') {
        try {
          targetElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        } catch (e) {
          // Fallback if smooth scrolling not supported
          targetElement.scrollIntoView();
        }
      }
      
      // Add detailed debug logging before trying to find customization
      console.log('DEBUG - Customizations array:', this.state.customizations);
      console.log('DEBUG - Current step index:', this.state.currentStep);
      console.log('DEBUG - Looking for customization at step:', this.state.currentStep);
      
      // When finding customization for step, handle null cases
      let customization = null;
      if (Array.isArray(this.state.customizations)) {
        customization = this.state.customizations.find(
          (c) => c && typeof c === 'object' && c.stepIndex === this.state.currentStep
        );
      }
      
      console.log('DEBUG - Found customization:', customization);
      
      // Add custom text to interaction if available
      if (customization && customization.popupText) {
        interaction.customText = customization.popupText;
        console.log('Set custom text:', interaction.customText);
      }
      
      // If we have existing cursor/highlight elements, remove them first to create fresh ones
      // This prevents any potential state issues from the previous step
      if (this.state.cursor) {
        document.body.removeChild(this.state.cursor);
        this.state.cursor = null;
      }
      
      if (this.state.highlight) {
        document.body.removeChild(this.state.highlight);
        this.state.highlight = null;
      }
      
      // Create new cursor and highlight elements
      const theme = this.options.theme || {
        cursorColor: '#22c55e',
        highlightColor: 'rgba(34, 197, 94, 0.3)',
        highlightBorderColor: '#22c55e',
        buttonColor: '#22c55e'
      };
      
      this.state.cursor = CursorFlowUI.createCursor(theme);
      this.state.highlight = CursorFlowUI.createHighlight(theme);
      
      // Move cursor and highlight with the potentially customized interaction
      if (this.state.cursor) {
        CursorFlowUI.moveCursorToElement(targetElement, this.state.cursor, interaction);
        console.log('Cursor moved to target element');
      }
      
      // Add this line to explicitly call highlightElement
      if (this.state.highlight) {
        CursorFlowUI.highlightElement(targetElement, this.state.highlight);
        console.log('Highlight applied to target element');
      }
      
      // Clear any existing timeout
      if (this.autoProgressTimeout) {
        clearTimeout(this.autoProgressTimeout);
        this.autoProgressTimeout = null;
      }
      
      // Create a transparent overlay to ensure we capture the click
      const overlay = document.createElement('div');
      overlay.style.position = 'fixed';
      overlay.style.top = '0';
      overlay.style.left = '0';
      overlay.style.width = '100%';
      overlay.style.height = '100%';
      overlay.style.zIndex = '999998'; // Below cursor, above everything else
      overlay.style.background = 'transparent';
      overlay.style.pointerEvents = 'none'; // Allow clicks to pass through
      document.body.appendChild(overlay);
      
      // Define a simplified click handler
      const handleClick = (e: Event) => {
        console.log('Target clicked!', e.target);
        
        e.stopPropagation(); // This is still fine to keep
        
        // Remove the overlay
        if (overlay.parentNode) {
          overlay.parentNode.removeChild(overlay);
        }
        
        // Clear any auto-progress timeout
        if (this.autoProgressTimeout) {
          clearTimeout(this.autoProgressTimeout);
          this.autoProgressTimeout = null;
        }
        
        // Update step and save state
        this.state.currentStep++;
        StateManager.save(this.state);
        
        // The page will navigate naturally now, no need to force it
      };
      
      // Make target clickable but prevent event bubbling
      targetElement.style.position = 'relative';
      targetElement.style.zIndex = '999999'; // Above overlay
      targetElement.style.pointerEvents = 'auto';
      
      // Clear any existing event listeners to prevent duplicates
      targetElement.replaceWith(targetElement.cloneNode(true));
      
      // Create a safe selector function to handle jQuery-style selectors
      const safeQuerySelector = (selector: string): Element | null => {
        try {
          // Check if selector contains jQuery's :contains()
          if (selector && selector.includes(':contains(')) {
            console.log('Found jQuery-style :contains() selector:', selector);
            
            // Parse the basic selector (everything before :contains)
            const baseSelector = selector.split(':contains(')[0];
            
            // Parse the text to search for
            const textMatch = selector.match(/:contains\(['"](.*?)['"][\)]/);
            const searchText = textMatch && textMatch[1] ? textMatch[1] : '';
            
            if (baseSelector && searchText) {
              // Find all elements matching the base selector
              const elements = Array.from(document.querySelectorAll(baseSelector));
              
              // Filter to find elements containing the text
              return elements.find(el => el.textContent?.includes(searchText)) || null;
            }
            
            return null;
          }
          
          // Regular selector
          return document.querySelector(selector);
        } catch (e) {
          console.error('Invalid selector:', selector, e);
          return null;
        }
      };
      
      // Get the new reference after cloning, using safe selector
      let newTarget = null;
      
      // Try CSS selector first
      if (interaction.element.cssSelector) {
        newTarget = safeQuerySelector(interaction.element.cssSelector);
      }
      
      // If not found, try ID
      if (!newTarget && interaction.element.id) {
        newTarget = document.getElementById(interaction.element.id);
      }
      
      // Fallback to original target element
      if (!newTarget) {
        newTarget = targetElement;
      }
      
      // Add the click event listener
      if (newTarget) {
        console.log('Adding click listener to element', newTarget);
        newTarget.addEventListener('click', handleClick, { once: true, capture: true });
      } else {
        console.error('Could not find target element after cloning');
        this.state.currentStep++;
        this.playNextStep();
      }
    } catch (error) {
      console.error('Error in playContextMatchedStep:', error);
      // Don't stop the guide on error, just log and continue
    }
  }

  /**
   * Keep playNextStep for backward compatibility
   * but redirect it to use the new context-aware method
   */
  private async playNextStep() {
    console.log('playNextStep called - redirecting to context-aware matching');
    await this.playContextMatchedStep();
  }

  /**
   * Single function to handle adding/showing cursor and highlight
   */
  private showVisualElements(targetElement?: HTMLElement, interaction?: any): void {
    // First ensure any existing elements are removed
    this.hideVisualElements();
    
    // Create fresh elements
    const theme = this.options.theme || {
      cursorColor: '#22c55e',
      highlightColor: 'rgba(34, 197, 94, 0.3)',
      highlightBorderColor: '#22c55e',
      buttonColor: '#22c55e'
    };
    
    // Create and store references
    this.state.cursor = CursorFlowUI.createCursor(theme);
    this.state.highlight = CursorFlowUI.createHighlight(theme);
    
    // Add to DOM
    document.body.appendChild(this.state.cursor);
    document.body.appendChild(this.state.highlight);
    
    // Position elements if target provided
    if (targetElement && interaction) {
      CursorFlowUI.moveCursorToElement(targetElement, this.state.cursor, interaction);
      CursorFlowUI.highlightElement(targetElement, this.state.highlight);
    }
    
    console.log('Visual elements added to DOM');
  }

  /**
   * Single function to handle removing/hiding cursor and highlight
   */
  private hideVisualElements(): void {
    // Remove cursor
    if (this.state.cursor && this.state.cursor.parentNode) {
      this.state.cursor.parentNode.removeChild(this.state.cursor);
    }
    
    // Also check for any orphaned cursor elements
    document.querySelectorAll('.cursor-flow-cursor').forEach(el => {
      if (el.parentNode) el.parentNode.removeChild(el);
    });
    
    // Remove highlight
    if (this.state.highlight && this.state.highlight.parentNode) {
      this.state.highlight.parentNode.removeChild(this.state.highlight);
    }
    
    // Also check for any orphaned highlight elements
    document.querySelectorAll('#cursor-flow-highlight').forEach(el => {
      if (el.parentNode) el.parentNode.removeChild(el);
    });
    
    // Clear references
    this.state.cursor = null;
    this.state.highlight = null;
    
    console.log('Visual elements removed from DOM');
  }
}

// Make it available globally
if (typeof window !== 'undefined') {
  (window as any).CursorFlow = CursorFlow;
}

