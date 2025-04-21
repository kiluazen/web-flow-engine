import { ApiClient } from './apiClient';
import { StateManager } from './manageState';
import { CursorFlowUI } from './uiComponents';
import { CursorFlowOptions, CursorFlowState } from './types';
import { ElementUtils } from './elementUtils';
import { RobustElementFinder } from './robustElementFinder';
import { SelectiveDomAnalyzer } from './selectiveDomAnalyzer';
import { CopilotModal } from './copilotModal';


// Add type definition for notification options
type NotificationType = 'warning' | 'info' | 'success' | 'error';
interface StopNotificationOptions {
    message: string;
    type: NotificationType;
    autoClose?: number;
}

export default class CursorFlow {
    // Properties
    private options: CursorFlowOptions;
    private apiClient: ApiClient;
    private state: CursorFlowState;
    private cursorElement: HTMLElement | null = null;
    private highlightElement: HTMLElement | null = null;
    private currentTargetElement: HTMLElement | null = null;
    private currentListener: EventListener | null = null;
    private currentInteractionType: string | null = null;
    private recording: any = null;
    private guides: any[] = [];
    private autoProgressTimeout: any = null;
    private startButton: HTMLElement | null = null;
    private sortedSteps: any[] = [];
    private isHandlingNavigation = false;
    private thinkingIndicator: HTMLElement | null = null;
    private validationLoopId: number | null = null;
    private isLoadingGuide = false;
    private operationToken: string = '';
    private invalidationInProgress = false;
    private isDropdownOpen = false;
  
    constructor(options: CursorFlowOptions) {
      // Initialize with default options
      console.log('[CURSOR-FLOW-DEBUG] Initializing with options:', options);
      console.log('[CURSOR-FLOW-DEBUG] Original buttonText:', options.buttonText);
      
      this.options = {
        ...options,
        theme: options.theme || {},
        buttonText: 'Co-pilot',
        guidesButtonText: options.guidesButtonText || 'Select Guide',
        debug: options.debug || false
      };
      
      console.log('[CURSOR-FLOW-DEBUG] Final options after defaults:', this.options);
      
      // Create API client
      // this.apiClient = new ApiClient(this.options.apiUrl, this.options.organizationId);
      this.apiClient = new ApiClient('https://hyphenbox-backend.onrender.com', this.options.organizationId);
      
      // Initialize empty state
      this.state = {
        isPlaying: false,
        currentStep: 0,
        recordingId: null,
        completedSteps: [],
        timestamp: Date.now()
      };
      
      if (this.options.debug) {
        console.log('CursorFlow initialized with options:', this.options);
      }
      
      this.operationToken = this.generateToken();
    }
    
    // --- NEW Encapsulated State Setter ---
    private setIsPlaying(value: boolean, immediateSave = false): void {
      if (this.state.isPlaying === value) return; // Avoid redundant updates
      
      this.debugLog(`Setting isPlaying state to: ${value}`);
      this.state.isPlaying = value;
      StateManager.saveWithDebounce(this.state, immediateSave);
      this.updateButtonState(); // Guarantee UI update
    }
    // --- End Encapsulated State Setter ---
  
    async init(): Promise<boolean> {
      try {
        // Check if API is accessible
        const isHealthy = await this.apiClient.checkHealth();
        if (!isHealthy) {
          console.error('API is not available');
          return false;
        }
        
        if (this.options.debug) {
          console.log('API health check successful');
        }
        
        let needsAutoStart = false;
        let redirectGuideId: string | null = null;
        
        // Restore state if available
        const savedState = StateManager.restore();
        if (savedState) {
          this.state = savedState;
          
          // Check if tab was closed during active session
          if (this.state.isPlaying && !StateManager.isSessionActive()) {
            // Tab was closed, reset playing state using the setter
            console.log('Tab was closed, resetting playing state');
            this.setIsPlaying(false, true); // Immediate save on reset
          }
          
          if (this.options.debug) {
            console.log('Restored state:', this.state);
          }
        }
        
        // Check for a guide that required redirect (BEFORE creating button)
        try {
          redirectGuideId = localStorage.getItem('hyphen_redirect_guide_id');
          if (redirectGuideId) {
            console.log('Found guide requiring redirect to auto-start:', redirectGuideId);
            // Remove the guide ID immediately to prevent loops
            localStorage.removeItem('hyphen_redirect_guide_id');
            needsAutoStart = true;
            // DO NOT set isPlaying here
          }
        } catch (err) {
          console.error('Error checking for redirect guide:', err);
        }
        
        // Fetch available guides
        await this.fetchGuides();
        
        // Ensure the button exists and update its initial state
        this.ensureStartButtonExists();
        this.updateButtonState(); // Reflect restored state
        
        // *** Initialize CopilotModal ***
        CopilotModal.init(
          this.apiClient, 
          (guideId) => this.startGuideAfterSearch(guideId), // Callback for when search finds a guide
          // () => this.showGuidesDropdown(), // Callback for 'View All Guides' button
          this.options.theme || {}
        );
        
        // Add a window event listener to flush state on page unload
        window.addEventListener('beforeunload', () => {
          if (this.state.isPlaying) {
            StateManager.flushPendingSave();
          }
        });
        
        // Handle Auto-Start AFTER button is created and initial state rendered
        if (needsAutoStart && redirectGuideId) {
          // Wait a short moment for the page to fully load
          setTimeout(() => {
            console.log('Executing auto-start for redirect guide:', redirectGuideId);
            // Generate operation token
            this.operationToken = this.generateToken();
            const currentToken = this.operationToken;
            
            // Set playing state via the setter
            this.setIsPlaying(true);
            
            // Show thinking indicator
            if (this.startButton) {
              this.thinkingIndicator = CursorFlowUI.showThinkingIndicator(this.startButton);
            }
            
            // Start the guide automatically
            this.retrieveGuideData(redirectGuideId, currentToken);
          }, 1000); // Keep delay for page load stability
        } else if (this.state.isPlaying && this.state.recordingId) {
          // Handle standard restored playback state (only if not auto-starting)
          console.log('Guide is active from restored state, loading recording');
          await this.loadRecording(this.state.recordingId);
          this.setupNavigationDetection();
          console.log('Active guide detected, finding appropriate step to play');
          setTimeout(() => {
            this.handleNavigation(true); // Check where to resume
          }, 500);
        }
        
        return true;
      } catch (error) {
        console.error('Failed to initialize CursorFlow:', error);
        return false;
      }
    }
  
    private async fetchGuides() {
      try {
        // API now returns flows instead of recordings
        const flows = await this.apiClient.getRecordings();
        this.guides = flows;
        
        if (this.options.debug) {
          console.log('Available guides:', this.guides);
        }
      } catch (error) {
        console.error('Failed to fetch guides:', error);
        this.guides = [];
      }
    }
    
    // --- UPDATED Button Creation/Finding ---
    private ensureStartButtonExists(): void {
      if (this.startButton && document.body.contains(this.startButton)) {
        // Button already exists and is in DOM
        console.log('[CURSOR-FLOW-DEBUG] Start button already exists.');
        return;
      }
      
      // Try finding existing button in DOM first
      const existingButton = document.querySelector('.hyphen-start-button') as HTMLElement;
      if (existingButton) {
        console.log('[CURSOR-FLOW-DEBUG] Found existing start button in DOM.');
        this.startButton = existingButton;
        // Re-attach listener just in case
        this.startButton.removeEventListener('click', this.handleToggleClick); // Remove old if any
        this.startButton.addEventListener('click', this.handleToggleClick);
        return;
      }
      
      // If not found, create it
      console.log('[CURSOR-FLOW-DEBUG] Creating new start button.');
      this.startButton = CursorFlowUI.createStartButton(
          this.options.buttonText || 'Guides',
          this.options.theme?.buttonColor || '#007bff',
          this.handleToggleClick // Use a bound method reference
      );
      document.body.appendChild(this.startButton);
    }
    
    // Method to handle the button click, bound in constructor or ensureStartButtonExists
    private handleToggleClick = () => {
        // If guide is playing, stop it
        if (this.state.isPlaying) {
            this.stop();
        } else {
            // If guide is not playing, show the SEARCH MODAL instead of the dropdown
            CopilotModal.showSearchModal();
        }
    }
    // --- End Button Creation/Finding ---
    
    private toggleGuideState() {
      // This method is now effectively replaced by handleToggleClick's logic
      // Keeping it just in case, but it directly calls the new logic.
      this.handleToggleClick(); 
    }
  
    private updateButtonState() {
      // Add robustness check
      if (!this.startButton || !document.body.contains(this.startButton)) {
          console.error('[CURSOR-FLOW-DEBUG] Attempted to update button state, but button not found or not in DOM.');
          // Maybe try to re-ensure button exists?
          // this.ensureStartButtonExists();
          // if (!this.startButton) return; // If still not found, give up
          return; 
      }
      
      this.debugLog('Updating button state');
      this.debugLog('Current state:', { isPlaying: this.state.isPlaying });
      
      // Get or create the text span
      let textSpan = this.startButton.querySelector('.hyphen-text');
      if (!textSpan) {
          console.warn('[CURSOR-FLOW-DEBUG] Button text span not found, creating it.');
          textSpan = document.createElement('span');
          textSpan.className = 'hyphen-text';
          // Ensure icon exists before appending text next to it
          const iconDiv = this.startButton.querySelector('.hyphen-icon');
          if (iconDiv && iconDiv.parentNode) {
            iconDiv.parentNode.appendChild(textSpan); 
          } else {
            this.startButton.appendChild(textSpan); // Fallback
          }
      }
      
      // Update text and class in a single operation
      if (this.state.isPlaying) {
          this.debugLog('Setting button to "Stop Guide"');
          textSpan.textContent = 'Stop Guide';
          this.startButton.classList.add('hyphen-playing');
      } else {
          this.debugLog('Setting button to:', this.options.buttonText || 'Guides');
          textSpan.textContent = this.options.buttonText || 'Guides';
          this.startButton.classList.remove('hyphen-playing');
      }
    }
  
    // start() is effectively replaced by showGuidesDropdown when not playing
    // We keep a simple start() concept for internal logic if needed later,
    // but user interaction primarily goes through toggleGuideState -> showGuidesDropdown
    private start() { 
      if (this.options.debug) {
        console.log('Attempting to start guide selection process...');
      }
       // This is now handled by the dropdown selection flow
       this.showGuidesDropdown(); // OR CopilotModal.showSearchModal() if default is search
    }
  
    private showGuidesDropdown() {
      if (!this.startButton) return;
      
      // Toggle dropdown state
      if (this.isDropdownOpen) {
        // If dropdown is open, close it
        const dropdown = document.getElementById('hyphen-guides-dropdown');
        if (dropdown) {
          dropdown.remove();
        }
        this.isDropdownOpen = false;
        this.debugLog('Guides dropdown closed.');
        return;
      }
      
      // --- Fetch guides only if needed and not already fetched ---
      const fetchAndShow = async () => {
          if (this.guides.length === 0) {
             this.debugLog('No guides loaded, fetching...');
             await this.fetchGuides();
          }
          
          if (this.guides.length === 0) {
             console.warn('No guides available after fetch.');
             // Show a notification? For now, just don't open dropdown.
             return;
          }
          
          this.debugLog('Showing guides dropdown.');
          // Create and show dropdown
          CursorFlowUI.showGuidesDropdown(
            this.guides, 
            this.startButton!,
            (guideData) => {
              // Mark dropdown as closed when a guide is selected
              this.isDropdownOpen = false;
              this.debugLog('Guide selected from dropdown:', guideData);
              
              // IMPORTANT: Generate a new operation token to cancel any in-flight operations
              this.operationToken = this.generateToken();
              const currentToken = this.operationToken;
              
              // Set playing state via the setter
              this.setIsPlaying(true);
              
              // Show thinking indicator
              if (this.startButton) {
                this.thinkingIndicator = CursorFlowUI.showThinkingIndicator(this.startButton);
              }
              
              // Start loading the guide, passing the current token
              this.retrieveGuideData(guideData.id, currentToken);
            }
          );
          // Mark dropdown as open
          this.isDropdownOpen = true;
      };
      
      fetchAndShow();
    }
  
    private async retrieveGuideData(guideId: string, token: string) {
      try {
        // Clear any previous redirect guide ID 
        try {
          localStorage.removeItem('hyphen_redirect_guide_id');
        } catch (err) {
          console.warn('Failed to clear previous redirect guide ID:', err);
        }
        
        this.debugLog(`Retrieving guide data for ID: ${guideId}, Token: ${token}`);
        // Validate token at the start of operation
        if (token !== this.operationToken) {
          this.debugLog('Operation was cancelled (token mismatch), aborting guide retrieval');
          // Ensure playing state is false if cancelled here
          this.setIsPlaying(false, true);
          return;
        }
        
        // Fetch recording data
        const flowData = await this.apiClient.getRecording(guideId);
        
        // Check token again after async operation
        if (token !== this.operationToken) {
          this.debugLog('Operation was cancelled during API fetch, aborting guide processing');
          this.setIsPlaying(false, true);
          return;
        }
        
        this.debugLog('Retrieved guide data:', flowData);
        
        // Get texts if needed
        const texts = await this.apiClient.getTexts(guideId);
        
        // Check token again
        if (token !== this.operationToken) {
          this.debugLog('Operation was cancelled during texts fetch, aborting guide processing');
          this.setIsPlaying(false, true);
          return;
        }
        
        this.debugLog('Retrieved guide texts:', texts);
        
        // Store the recording
        this.recording = flowData;
        
        // Sort steps
        if (this.recording && this.recording.steps) {
          console.time('Sort steps');
          this.sortedSteps = [...this.recording.steps].sort((a, b) => {
            return (a.position || 0) - (b.position || 0);
          });
          console.timeEnd('Sort steps');
        }
        
        // Final token check before proceeding
        if (token !== this.operationToken) {
          this.debugLog('Operation was cancelled after step sorting, aborting guide start');
          this.setIsPlaying(false, true);
          return;
        }
        
        // Clear previous state for this guide ID (using StateManager)
        StateManager.clear();
        
        // NEW: Check if user is on the correct starting page
        if (this.recording && this.recording.steps && this.recording.steps.length > 0) {
          // Find the first step
          const sortedSteps = [...this.recording.steps].sort((a, b) => {
            return (a.position || 0) - (b.position || 0);
          });
          
          const firstStep = sortedSteps[0];
          
          // Add debugging logs
          this.debugLog('URL CHECK DEBUG: First step data:', {
            firstStepUrl: firstStep.url,
            firstStepPageInfo: firstStep.interaction?.pageInfo,
            currentUrl: window.location.href,
            firstStepPath: firstStep.interaction?.pageInfo?.path || 'not set'
          });
          
          // Extract URL info from the step - check interaction.pageInfo
          const pageInfo = firstStep.interaction?.pageInfo;
          const stepUrl = pageInfo?.url;
          const stepPath = pageInfo?.path;
          
          // Check if we have URL info to compare
          const hasUrlToCheck = !!stepUrl || !!stepPath;
          
          // Only show redirect if there's a URL to redirect to
          const redirectUrl = stepUrl || (stepPath ? stepPath : null);
          
          // Check URL matching - use URL first, then fall back to path
          const isUrlMatch = stepUrl ? ElementUtils.compareUrls(stepUrl, window.location.href) : false;
          const isPathMatch = stepPath ? window.location.pathname === stepPath : false;
          
          this.debugLog('URL CHECK DETAILS:', { 
            hasUrlToCheck, 
            stepUrl, 
            stepPath, 
            redirectUrl, 
            isUrlMatch, 
            isPathMatch,
            currentPath: window.location.pathname
          });
          
          // Hide thinking indicator if we're showing a notification
          if (hasUrlToCheck && !isUrlMatch && !isPathMatch) {
            // User is not on the correct starting page
            this.debugLog('URL CHECK FAILED: User is not on the correct starting page for the guide');
            
            // Hide thinking indicator before showing notification
            if (this.thinkingIndicator) {
              CursorFlowUI.hideThinkingIndicator(this.thinkingIndicator);
              this.thinkingIndicator = null;
            }
            
            if (redirectUrl) {
              // Store the guide ID in localStorage for auto-start after redirect
              try {
                localStorage.setItem('hyphen_redirect_guide_id', guideId);
                this.debugLog('Stored redirect guide ID in localStorage:', guideId);
              } catch (err) {
                console.error('Failed to store guide ID in localStorage:', err);
              }
              
              // Show notification with redirect option
              CursorFlowUI.showRedirectNotification({
                message: 'To start this guide, you need to go to the starting page first',
                type: 'info',
                redirectUrl: redirectUrl,
                redirectText: 'Go to start'
              });
              // IMPORTANT: Reset playing state as we are redirecting, not playing yet
              this.setIsPlaying(false, true);
            } else {
              // No redirect URL available
              CursorFlowUI.showNotification({
                message: 'Guide cannot start - missing URL information',
                type: 'error',
                autoClose: 5000
              });
              // Reset playing state as guide cannot start
              this.setIsPlaying(false, true);
            }
            
            return; // Stop processing here
          }
          
          this.debugLog('URL CHECK PASSED: User is on the correct starting page for the guide');
        }
        
        // If URL check passed or wasn't needed, start the actual guide
        // Hide thinking indicator just before starting the guide visuals
        if (this.thinkingIndicator) {
           CursorFlowUI.hideThinkingIndicator(this.thinkingIndicator);
           this.thinkingIndicator = null;
        }
        await this.startGuide(guideId, token);
      } catch (error) {
        console.error('Failed to retrieve guide data:', error);
        
        // Clear redirect guide ID on error
        try {
          localStorage.removeItem('hyphen_redirect_guide_id');
        } catch (err) {
          console.warn('Failed to clear redirect guide ID on error:', err);
        }
        
        // Only stop if this is still the current operation
        if (token === this.operationToken) {
          // Use stop method which handles resetting isPlaying
          this.stop({
            message: 'Failed to load guide. Please try again.',
            type: 'error',
            autoClose: 5000
          });
        }
      }
    }
  
    private showFirstStepDemo(firstStepData: any) {
      // Create cursor and text popup elements if not already created
      if (!this.cursorElement) {
        this.cursorElement = CursorFlowUI.createCursor(this.options.theme || {});
      }
      
      // Create text popup with the instruction
      const textPopup = CursorFlowUI.createTextPopup(
        firstStepData.popupText || "Click here",
        this.options.theme || {}
      );
      
      // For demo purposes, create a meaningful interaction object based on the step text
      const popupText = firstStepData.popupText || '';
      this.debugLog('Step instruction:', popupText);
      
      // Extract what to look for from the popup text
      let elementText = '';
      
      if (popupText.includes('Writing link')) {
        elementText = 'Writing';
      } else if (popupText.includes('Examples of Deep Focus')) {
        elementText = 'Examples of Deep Focus';
      } else if (popupText.includes('Podcasts section')) {
        elementText = 'Podcasts';
      } else {
        // Generic fallback
        elementText = popupText.replace(/Click on /i, '').replace(/Navigate to /i, '');
      }
      
      const interaction = {
        text: elementText,
        action: "click"
      };
      
      this.debugLog('Looking for element with text:', elementText);
      
      // Find the target element
      this.currentTargetElement = ElementUtils.findElementFromInteraction(interaction, false);
      
      if (this.currentTargetElement) {
        this.debugLog('Found target element:', this.currentTargetElement);
        
        // Move cursor to the element
        CursorFlowUI.moveCursorToElement(
          this.currentTargetElement, 
          this.cursorElement, 
          interaction
        );
        
        // Position the text popup near the cursor
        CursorFlowUI.positionTextPopupNearCursor(this.cursorElement, textPopup);
        
        // Highlight the target element
        this.highlightElement = CursorFlowUI.createHighlight(this.options.theme || {});
        this.positionHighlightOnElement(this.currentTargetElement, this.highlightElement);
        
        if (this.options.debug) {
          this.debugLog('Demo: Showing cursor and text for first step');
        }
      } else {
        console.warn('Could not find target element for first step');
      }
    }
  
    private positionHighlightOnElement(element: HTMLElement, highlight: HTMLElement | null) {
      if (!highlight || !element) return;
      
      // Delegate positioning to CursorFlowUI
      CursorFlowUI.positionHighlightOnElement(element, highlight);
    }
  
    stop(notificationOptions?: StopNotificationOptions) {
      // Generate a new token FIRST to cancel any in-flight operations
      const oldToken = this.operationToken;
      this.operationToken = this.generateToken();
      this.debugLog(`[STOP CALLED] Invalidating token ${oldToken}, new token ${this.operationToken}`);
      
      // Set isPlaying to false using the setter (immediate save for cleanup)
      this.setIsPlaying(false, true); 
      
      // Reset dropdown state
      this.isDropdownOpen = false;
      
      // Close any existing dropdown
      const existingDropdown = document.getElementById('hyphen-guides-dropdown');
      if (existingDropdown) {
        existingDropdown.remove();
      }
      
      // Clear any redirect guide ID
      try {
        localStorage.removeItem('hyphen_redirect_guide_id');
      } catch (err) {
        console.warn('Failed to clear redirect guide ID on stop:', err);
      }
      
      // Clean up thinking indicator immediately
      if (this.thinkingIndicator) {
        CursorFlowUI.hideThinkingIndicator(this.thinkingIndicator);
        this.thinkingIndicator = null;
      }
      
      // Reset loading flag immediately
      this.isLoadingGuide = false;
      
      // Stop validation loop immediately
      this.stopValidationLoop();

      // Show notification if provided (doesn't need to block cleanup)
      if (notificationOptions) {
        CursorFlowUI.showNotification({
          ...notificationOptions,
          autoClose: notificationOptions.autoClose || 2000 
        });
      }
      
      if (this.options.debug) {
        this.debugLog('Stopping guide - Initiating immediate cleanup');
      }
      
      // Clean up all UI elements - pass false to ensure cursor is also cleaned up,
      // and true to keep notifications
      CursorFlowUI.cleanupAllUI(false, true);
      
      // Reset state variables other than isPlaying
      this.state.currentStep = 0;
      this.state.recordingId = null;
      this.state.completedSteps = [];
      this.state.timestamp = Date.now();
      
      // Use immediate clear instead of debounced save for main state
      StateManager.clear();
      StateManager.clearSession();
      
      // Remove event listeners
      this.removeExistingListeners();
      
      // Update button state one last time (setIsPlaying already called)
      // this.updateButtonState(); // No - setIsPlaying handles this
      
      // Reset all element references
      this.cursorElement = null;
      this.highlightElement = null;
      this.currentTargetElement = null;
      
      // Reset invalidation flag after everything is done
      this.invalidationInProgress = false;
      
      if (this.options.debug) {
        this.debugLog('Guide stopped, state reset, cleanup complete');
      }
    }
  
    private async loadRecording(recordingId: string) {
      try {
        this.debugLog(`Loading recording: ${recordingId}`);
        // Fetch recording data from API
        const flowData = await this.apiClient.getRecording(recordingId);
        
        // Store the recording
        this.recording = flowData;
        
        // Pre-sort steps once and cache them 
        if (this.recording && this.recording.steps) {
          console.time('Sort steps');
          this.sortedSteps = [...this.recording.steps].sort((a, b) => {
            return (a.position || 0) - (b.position || 0);
          });
          console.timeEnd('Sort steps');
        }
        
        // Preserve completedSteps when it's the same recording ID
        // const preserveSteps = this.state.recordingId === recordingId ? this.state.completedSteps : [];
        // StateManager.restore already handles loading existing state, including completedSteps
        
        // Update state recordingId only (isPlaying is handled elsewhere)
        this.state.recordingId = recordingId;
        // this.state.isPlaying = true; // NO - isPlaying is set by the caller (init or dropdown)
        // this.state.currentStep = 0; // No - state restore handles this or handleNavigation adjusts it
        // this.state.completedSteps = preserveSteps; // No - state restore handles this
        
        // Save state immediately since this is an important transition?
        // Let StateManager handle debouncing unless immediate needed
        StateManager.saveWithDebounce(this.state); 
        
        if (this.options.debug) {
          this.debugLog('Recording loaded:', recordingId, flowData);
          // this.debugLog('Preserved completed steps:', preserveSteps);
        }
        
        return flowData;
      } catch (error) {
        console.error('Failed to load recording:', error);
        this.stop({ message: 'Failed to load guide data.', type: 'error'}); // Stop if loading fails
        throw error;
      }
    }
  
    private async startGuide(guideId: string, token: string) {
      try {
        // Check token validity before starting
        if (token !== this.operationToken) {
          this.debugLog('Operation was cancelled (token mismatch), aborting guide start');
          this.setIsPlaying(false, true);
          return false;
        }
        
        this.debugLog('Starting guide internally:', guideId);
        
        // Set isPlaying via setter - should already be true if called from dropdown/redirect
        // but call again to ensure consistency
        this.setIsPlaying(true);
        
        // Update state variables directly - isPlaying is handled by setter
        this.state.currentStep = 0;
        this.state.recordingId = guideId;
        this.state.completedSteps = []; // Always start fresh
        this.state.timestamp = Date.now();
        
        // Add debug logging
        this.debugLog('Starting guide with state:', JSON.stringify(this.state));
        
        // Load recording (should already be loaded by retrieveGuideData, but maybe call loadRecording for consistency?)
        // Or assume this.recording is populated correctly by retrieveGuideData
        if (!this.recording || this.recording.id !== guideId) {
           console.warn('Recording mismatch in startGuide, attempting to reload');
           await this.loadRecording(guideId);
        } else {
          this.debugLog('Recording already loaded.');
        }
        
        // Set session active
        StateManager.setSessionActive();
        
        // Create visual elements if needed
        this.createVisualElements();
        
        // Setup navigation detection
        this.setupNavigationDetection();
        
        // Update button state (setIsPlaying already did this)
        // this.updateButtonState();
        
        // Play first step
        await this.playCurrentStep();
        
        return true;
      } catch (error) {
        console.error('Failed to start guide:', error);
        this.stop({ message: 'Failed to start guide', type: 'error'}); // Stop on error
        return false;
      }
    }
  
    private async detectCurrentContext() {
      if (!this.recording || !this.sortedSteps.length) {
        return null;
      }
      
      const currentUrl = window.location.href;
      const currentPath = window.location.pathname;
      
      if (this.options.debug) {
        this.debugLog('DETECT CONTEXT: Current URL:', currentUrl, 'Path:', currentPath);
      }
      
      // Find steps that match the current URL without excessive logging
      console.time('Find matching steps');
      // Use cached sortedSteps instead of re-filtering recording.steps
      const matchingSteps = this.sortedSteps.filter((step: any) => {
        // The pageInfo is inside the interaction object
        const pageInfo = step.interaction?.pageInfo;
        
        // Check URL and path from pageInfo
        const stepUrl = pageInfo?.url;
        const stepPath = pageInfo?.path;
        
        // Check for matches - simplified logic
        const urlMatches = stepUrl ? ElementUtils.compareUrls(stepUrl, currentUrl) : false;
        const pathMatches = stepPath === currentPath;
        
        // Return true if either URL or path matches
        return urlMatches || pathMatches;
      });
      console.timeEnd('Find matching steps');
      
      if (matchingSteps.length === 0) {
        if (this.options.debug) {
          this.debugLog('DETECT CONTEXT: No steps match current URL or path');
        }
        return null;
      }
      
      console.time('Find uncompleted step');
      // Find the earliest uncompleted step for this URL
      const uncompletedSteps = matchingSteps.filter((step: any) => {
        const stepIndex = step.position || 0;
        return !this.state.completedSteps.includes(stepIndex);
      });
      
      if (uncompletedSteps.length > 0) {
        // Get earliest uncompleted step by position
        // The steps are already sorted, so just take the first one
        const earliestStep = uncompletedSteps[0];
        console.timeEnd('Find uncompleted step');
        return earliestStep;
      }
      
      // All steps for this URL are completed, return the last step for navigation context
      // Since we know sortedSteps is sorted by position, we can use the last matching step
      console.timeEnd('Find uncompleted step');
      return matchingSteps[matchingSteps.length - 1];
    }
  
    // Add this helper method for debug logging
    private debugLog(...args: any[]): void {
      if (this.options.debug) {
        console.log('[CursorFlow]', ...args);
      }
    }
    
    private async playCurrentStep() {
      // ADDED: Log this.options.debug at the start of the function
      this.debugLog(`[DEBUG-VERIFY] playCurrentStep called. this.options.debug = ${this.options.debug}`);

      // Ensure any previous validation loop is stopped before starting a new step
      this.stopValidationLoop();

      // Hide thinking indicator when starting to play a step
      if (this.thinkingIndicator) {
        CursorFlowUI.hideThinkingIndicator(this.thinkingIndicator);
        this.thinkingIndicator = null;
      }
      
      if (!this.recording || !this.state.isPlaying) {
        console.warn('[CursorFlow] No active recording or not in playing state');
        return false;
      }
      
      // Get current step from recording
      let currentStep: any; // Use 'any' for simplicity or define a proper Step type
       if (this.recording.steps && this.recording.steps.length > 0) {
          // Find the current step based on state.currentStep and sortedSteps
          // Find step by position if available
          if (this.sortedSteps[0]?.position !== undefined) {
              const targetPosition = this.sortedSteps[this.state.currentStep]?.position;
              if (targetPosition !== undefined) {
                   // Find the actual step object matching the position from the potentially incomplete state.currentStep index
                  currentStep = this.sortedSteps.find(step => step.position === targetPosition);
                  // If the direct index didn't work (e.g., after skip), find the first uncompleted
                  if (!currentStep || this.state.completedSteps.includes(currentStep.position)) {
                      currentStep = this.sortedSteps.find(step => !this.state.completedSteps.includes(step.position));
                  }
              } else {
                   // Fallback if position is missing unexpectedly
                   currentStep = this.sortedSteps[this.state.currentStep];
              }
          } else {
              // Index-based fallback
              currentStep = this.sortedSteps[this.state.currentStep];
          }
       }


      if (!currentStep) {
          // Potentially all steps completed or state is inconsistent
           const nextStep = this.findNextStep(); // Check if there's logically a next step
          if (nextStep) {
              currentStep = nextStep;
              // Update state.currentStep to match the found next step's index in sortedSteps
              this.state.currentStep = this.sortedSteps.findIndex(step => step === nextStep);
              this.debugLog(`State inconsistency? Found next logical step at index ${this.state.currentStep}, position ${currentStep.position}. Proceeding.`);
              StateManager.saveWithDebounce(this.state); // Save corrected state
          } else {
              console.warn('[CursorFlow] No current or next step found. Guide might be complete or state is invalid.');
              this.completeGuide(); // Assume completion if no steps left
              return false;
          }
      }


      this.debugLog(`Playing step ${this.state.currentStep} (Position: ${currentStep.position || 'N/A'})`);

      // Find target element from interaction data
      const interaction = currentStep.interaction || {};
      // Ensure interaction text is populated if available in element data
      if (!interaction.text && interaction.element?.textContent) {
          interaction.text = interaction.element.textContent;
      }
      this.debugLog('Interaction data:', JSON.stringify(interaction));


      // Before we search for elements, check if navigation is expectedx
      const expectedPath = interaction.pageInfo?.path;
      const currentPath = window.location.pathname;
      const isNavigationExpected = expectedPath && expectedPath !== currentPath;

      if (isNavigationExpected) {
          this.debugLog(`Navigation expected from ${currentPath} to ${expectedPath}`);
      }

      // --- Use RobustElementFinder to get candidates ---
      this.debugLog('Finding candidate elements using RobustElementFinder...');
      console.time('Find candidate elements');
      // ADDED: Log the debug value being passed
      const debugValueForFinder = this.options.debug || false;
      this.debugLog(`[DEBUG-VERIFY] Passing debug=${debugValueForFinder} to RobustElementFinder.setDebugMode`);
      RobustElementFinder.setDebugMode(debugValueForFinder);
      let candidateElements = await RobustElementFinder.findCandidates(interaction);
      console.timeEnd('Find candidate elements');
      this.debugLog(`RobustFinder found ${candidateElements.length} candidate(s).`);

      let finalTargetElement: HTMLElement | null = null;

      // --- Validate candidates using SelectiveDomAnalyzer ---
      if (candidateElements.length > 0) {
          this.debugLog('Validating candidate(s) using SelectiveDomAnalyzer...');
          SelectiveDomAnalyzer.clearCache(); // Clear cache for this step's validation
          SelectiveDomAnalyzer.setDebugMode(this.options.debug || false);

          const validCandidates: HTMLElement[] = [];
          for (const candidate of candidateElements) {
              if (SelectiveDomAnalyzer.validateCandidateElement(candidate, interaction)) {
                  validCandidates.push(candidate);
              }
              // Logging for failed validation happens inside SelectiveDomAnalyzer if debugMode is on
          }

          if (validCandidates.length === 1) {
              this.debugLog('Validation successful: 1 valid candidate found.');
              finalTargetElement = validCandidates[0];
          } else if (validCandidates.length > 1) {
              console.warn(`[CursorFlow] Ambiguity detected: ${validCandidates.length} candidates passed validation.`);
              this.debugLog('Candidates passing validation:', validCandidates.map(el => el.outerHTML.substring(0, 100) + '...'));
              // **** Future: Add LLM or other disambiguation logic here ****
              // For now, pick the first valid candidate as a fallback
              finalTargetElement = validCandidates[0];
              console.log('[CursorFlow] Fallback: Picking the first valid candidate.');
          } else {
              // No candidates passed validation
              this.debugLog('Validation failed: No candidates passed deeper checks.');
              finalTargetElement = null;
          }
      } else {
           // No initial candidates found
          this.debugLog('Validation skipped: RobustFinder found no initial candidates.');
          finalTargetElement = null;
      }
      // --- End Validation ---

      // Set the determined target element
      this.currentTargetElement = finalTargetElement;

      // --- Handle Outcome ---
      if (!this.currentTargetElement) {
          console.warn('[CursorFlow] Target element could not be definitively determined for step:', currentStep);
          if (isNavigationExpected) {
              this.debugLog('Element not found/validated, but navigation is expected. Allowing navigation.');
              // Don't show error UI if navigation is the expected next action
              return true; // Allow potential navigation to proceed without error UI
          }
          // Only show error UI if navigation wasn't expected
          console.log('DOM content at time of search:', document.body.innerHTML.substring(0, 500) + '...');
          this.handleInteractionError();
          return false;
      }

      // --- Proceed with Valid Element ---
      this.debugLog('Successfully identified target element:', this.currentTargetElement.outerHTML.substring(0, 150) + '...');

      console.time('Show visual elements');
      // Pass the current token and the step data to showVisualElements
      const currentToken = this.operationToken;
      await this.showVisualElements(this.currentTargetElement, currentStep, currentToken); // Pass currentStep here
      console.timeEnd('Show visual elements');
      
      // Check token again after showing visuals, before setting up interaction
      if (currentToken !== this.operationToken) {
          this.debugLog(`[playCurrentStep] Operation cancelled after showVisualElements. Aborting interaction setup.`);
          // Explicitly clean up visuals shown if cancelled mid-step
          this.hideVisualElements(); 
          return false; 
      }

      console.time('Setup interaction tracking');
      this.setupElementInteractionTracking(this.currentTargetElement, interaction);
      console.timeEnd('Setup interaction tracking');

      // Start the validation loop *after* visuals and tracking are set up
      this.startValidationLoop();

      return true;
    }
  
    private async showVisualElements(targetElement: HTMLElement, stepData: any, token: string) { // Renamed interaction to stepData and updated type
      if (token !== this.operationToken) {
        this.debugLog('[CursorFlow] Aborting visual elements due to token mismatch.');
        return;
      }
      
      if (!targetElement || !targetElement.isConnected) {
        this.debugLog('[CursorFlow] Aborting visual elements. Target is null or disconnected.');
        return;
      }
      
      // Get safe text from step data's annotation field
      let annotationText = '';
      try {
        // Access the annotation from the stepData object
        annotationText = stepData.annotation || ''; 
      } catch (e) {
        console.error('[CursorFlow] Error getting annotation text:', e);
      }
      
      // Create cursor element if not exists
      if (!this.cursorElement) {
        this.cursorElement = CursorFlowUI.createCursor(this.options.theme || {});
      }
      
      // Create and position highlight using CursorFlowUI
      if (!this.highlightElement) {
        this.highlightElement = CursorFlowUI.createHighlight(this.options.theme || {});
      }
      
      // Position the highlight on the element
      CursorFlowUI.positionHighlightOnElement(targetElement, this.highlightElement);
      
      // Position cursor
      CursorFlowUI.moveCursorToElement(
        targetElement,
        this.cursorElement,
        stepData
      );
      
      // Create and position text popup
      const textPopup = CursorFlowUI.createTextPopup(annotationText, this.options.theme || {});
      CursorFlowUI.positionTextPopupNearCursor(this.cursorElement, textPopup);
      
      // Add detailed logging of element position when visual elements are shown
      const rect = targetElement.getBoundingClientRect();
      const viewportDimensions = {
          width: window.innerWidth,
          height: window.innerHeight
      };
      this.debugLog('[VISUAL-ELEMENTS] Elements shown for:', {
          element: targetElement.tagName + (targetElement.id ? '#' + targetElement.id : ''),
          position: {
              top: Math.round(rect.top),
              bottom: Math.round(rect.bottom),
              left: Math.round(rect.left),
              right: Math.round(rect.right),
              inViewport: this.isElementPartiallyInViewport(targetElement)
          },
          viewport: viewportDimensions,
          relativePosition: {
              percentFromTop: Math.round((rect.top / viewportDimensions.height) * 100) + '%',
              percentFromLeft: Math.round((rect.left / viewportDimensions.width) * 100) + '%'
          }
      });
    }
  
    private hideVisualElements() {
      // Stop the validation loop when hiding elements between steps
      this.stopValidationLoop();

      // Clean up UI elements - Change keepCursor to false to remove the cursor on completion/stop
      // Keep cursor true between steps, false on final stop/completion
      const keepCursor = this.state.isPlaying; // Keep cursor if still playing
      CursorFlowUI.cleanupAllUI(keepCursor, true); // Keep notifications

      // Reset references ONLY for elements being cleaned up
      this.highlightElement = null;
      // Don't reset cursorElement if keepCursor is true

      if (this.options.debug) {
        console.log(`Visual elements hidden/cleaned up ${keepCursor ? '(keeping cursor)' : '(removing cursor)'}`);
      }
    }
  
    private setupNavigationDetection() {
      if (this.options.debug) {
        console.log('Setting up navigation detection');
      }
      
      // Use history API to detect navigation events
      const originalPushState = history.pushState;
      const originalReplaceState = history.replaceState;
      
      // Override pushState
      history.pushState = (...args) => {
        originalPushState.apply(history, args);
        if (this.options.debug) {
          console.log('pushState called, args:', args);
        }
        this.handleNavigation();
      };
      
      // Override replaceState
      history.replaceState = (...args) => {
        originalReplaceState.apply(history, args);
        if (this.options.debug) {
          console.log('replaceState called, args:', args);
        }
        this.handleNavigation();
      };
      
      // Listen for popstate event (browser back/forward buttons)
      window.addEventListener('popstate', () => {
        if (this.options.debug) {
          console.log('popstate event triggered');
        }
        this.handleNavigation();
      });
      
      if (this.options.debug) {
        console.log('Navigation detection set up');
      }
    }
  
    private handleNavigation(continueThroughSteps = false) {
      if (!this.state.isPlaying || this.isHandlingNavigation || this.invalidationInProgress) {
        console.log('handleNavigation: Initial check failed - Not playing, already handling, or invalidation in progress. Returning early');
        return;
      }
      
      this.isHandlingNavigation = true;
      console.log('handleNavigation: Current URL:', window.location.href);
      console.time('Navigation handling');
      
      setTimeout(async () => {
        // **** ADDED CHECK INSIDE TIMEOUT ****
        // Check if stop() was called while we were waiting for the timeout
        if (!this.state.isPlaying) {
            console.log('handleNavigation: state.isPlaying is false after timeout. Aborting navigation handling.');
            this.isHandlingNavigation = false; // Ensure flag is reset
            console.timeEnd('Navigation handling'); // End timer here
            return;
        }
          
        try {
          console.time('Check completed steps');
          // Check if we have completed the previous step and moved to a new URL
          if (this.state.completedSteps.length > 0) {
            const lastCompletedPosition = this.state.completedSteps[this.state.completedSteps.length - 1];
            const currentPath = window.location.pathname;
            
            // Find next step more efficiently using array method instead of a loop
            const nextStepIndex = this.sortedSteps.findIndex((step: any) => {
              const stepPosition = step.position || 0;
              return stepPosition > lastCompletedPosition && 
                    !this.state.completedSteps.includes(stepPosition);
            });
            
            if (nextStepIndex >= 0) {
              const nextExpectedStep = this.sortedSteps[nextStepIndex];
              
              // Check path directly without unnecessary operations
              const nextStepPath = nextExpectedStep.interaction?.pageInfo?.path;
              
              // Fast path check
              if (nextStepPath && nextStepPath === currentPath) {
                console.log('handleNavigation: Path match found');
                this.state.currentStep = this.recording.steps.indexOf(nextExpectedStep);
                console.timeEnd('Check completed steps');
                console.time('Play step');
                // IMPORTANT: Added visual cleanup before playing next step
                this.hideVisualElements();
                console.log('handleNavigation: Cleaned up visuals before playing next step');
                await this.playCurrentStep();
                console.timeEnd('Play step');
                console.timeEnd('Navigation handling');
                this.isHandlingNavigation = false;
                return;
              }
            }
          }
          console.timeEnd('Check completed steps');
          
          // Only run detectCurrentContext if needed
          console.time('Detect context');
          const contextStep = await this.detectCurrentContext();
          console.timeEnd('Detect context');
          
          if (contextStep) {
            console.time('Process context step');
            // Found a matching step for this URL
            console.log('handleNavigation: Found matching step for this URL');
            const stepIndex = contextStep.position || this.recording.steps.indexOf(contextStep);
            
            // Check if this is a backward navigation to a completed step
            const isBackNavigation = this.state.completedSteps.includes(stepIndex);
            
            if (isBackNavigation) {
              console.log('handleNavigation: Back navigation detected, showing step again');
              this.state.currentStep = this.recording.steps.indexOf(contextStep);
              // IMPORTANT: Added visual cleanup before re-showing the same step
              this.hideVisualElements();
              console.log('handleNavigation: Cleaned up visuals before re-showing same step');
              
              // *** ADDED CHECK ***
              const stepPlayedSuccessfully = await this.playCurrentStep();
              if (!stepPlayedSuccessfully) {
                console.log('handleNavigation: playCurrentStep failed after back navigation. Stopping guide.');
                this.stop({
                    message: 'Guide stopped: Element for this step could not be found or validated.',
                    type: 'error',
                    autoClose: 5000
                });
                // Exit navigation handling early
                 this.isHandlingNavigation = false; 
                 console.timeEnd('Process context step'); // End timer here before returning
                 console.timeEnd('Navigation handling');
                 return;
              }
            } else {
              // Forward navigation - check if prerequisites are met
              const prerequisitesMet = this.sortedSteps.every((step: any) => {
                const position = step.position || 0;
                return position >= stepIndex || this.state.completedSteps.includes(position);
              });
              
              if (prerequisitesMet) {
                console.log('handleNavigation: Prerequisites met, playing step');
                this.state.currentStep = this.recording.steps.indexOf(contextStep);
                // IMPORTANT: Added visual cleanup before playing step in forward navigation
                this.hideVisualElements();
                console.log('handleNavigation: Cleaned up visuals before forward navigation step');
                
                 // *** ADDED CHECK ***
                 const stepPlayedSuccessfully = await this.playCurrentStep();
                 if (!stepPlayedSuccessfully) {
                    console.log('handleNavigation: playCurrentStep failed during forward navigation. Stopping guide.');
                    this.stop({
                        message: 'Guide stopped: Element for this step could not be found or validated.',
                        type: 'error',
                        autoClose: 5000
                    });
                     // Exit navigation handling early
                     this.isHandlingNavigation = false; 
                     console.timeEnd('Process context step'); // End timer here before returning
                     console.timeEnd('Navigation handling');
                     return;
                }
              } else {
                console.log('handleNavigation: Prerequisites not met, showing warning');
                
                // IMPORTANT: Added visual cleanup before showing error
                this.hideVisualElements();
                console.log('handleNavigation: Cleaned up visuals before prerequisites warning');
                
                // Find first incomplete step more efficiently
                const firstIncompleteStep = this.sortedSteps.find((step: any) => {
                  const position = step.position || 0;
                  return position < stepIndex && !this.state.completedSteps.includes(position);
                });
                
                if (firstIncompleteStep && firstIncompleteStep.url) {
                  CursorFlowUI.showRedirectNotification({
                    message: 'You need to complete previous steps first',
                    type: 'warning',
                    redirectUrl: firstIncompleteStep.url,
                    redirectText: 'Go to previous step'
                  });
                } else {
                  CursorFlowUI.showNotification({
                    message: 'Please complete previous steps first',
                    type: 'warning',
                    autoClose: 5000
                  });
                }
                
                this.stop({
                  message: 'Please complete previous steps first',
                  type: 'warning'
                });
              }
            }
            console.timeEnd('Process context step');
          } else {
            console.log('handleNavigation: No matching steps for this URL');
            // Check if all steps are completed
            console.time('Check completion');
            const allSteps = this.recording.steps || [];
            const allCompleted = allSteps.every((step: { position?: number }) => {
                const stepPosition = step.position || 0;
                return this.state.completedSteps.includes(stepPosition);
            });
            if (allCompleted && allSteps.length > 0) {
                console.log('handleNavigation: All guide steps completed');
                // IMPORTANT: Added visual cleanup before completing guide
                this.hideVisualElements();
                console.log('handleNavigation: Cleaned up visuals before completing guide');
                this.completeGuide();
            } else {
                // IMPORTANT: Added visual cleanup before showing navigation error
                this.hideVisualElements();
                console.log('handleNavigation: Cleaned up visuals before showing navigation error');
                
                // Show notification 
                CursorFlowUI.showNotification({
                    message: 'Oops! You\'ve navigated away from the guide path',
                    type: 'warning',
                    autoClose: 5000
                });
                
                // REMOVED setTimeout, call stop directly
                this.stop({
                    message: 'Oops! You\'ve navigated away from the guide path',
                    type: 'warning'
                });
            }
            console.timeEnd('Check completion');
          }
        } catch (error) {
          console.error('Error handling navigation:', error);
          // Ensure stop is called even on error during navigation handling
          // Check isPlaying again before stopping to avoid redundant calls if stop was already called
          if (this.state.isPlaying) {
              // IMPORTANT: Added visual cleanup before stopping due to error
              this.hideVisualElements();
              console.log('handleNavigation: Cleaned up visuals before stopping due to error');
              this.stop({ message: 'Error during navigation', type: 'error' });
          }
        } finally {
          console.timeEnd('Navigation handling');
          this.isHandlingNavigation = false;
        }
      }, 50); 
    }
  
    private setupElementInteractionTracking(element: HTMLElement, interaction: any) {
      // Remove previous listener IF IT EXISTS AND IS DIFFERENT
      this.removeExistingListeners(); // Call this first

      if (!element || !interaction) return;

      if (this.options.debug) {
          console.log('[CursorFlow] Setting up interaction tracking for element:', element);
          console.log('[CursorFlow] Interaction data for tracking:', interaction);
      }

      // Store current interaction type
      this.currentInteractionType = interaction.action || 'click';

      if (!this.currentInteractionType) {
          console.warn('[CursorFlow] No interaction type specified');
          return;
      }

      const eventType = this.getEventTypeForInteraction(this.currentInteractionType);
      if (!eventType) {
          console.warn('[CursorFlow] Unknown interaction type for tracking:', this.currentInteractionType);
          return;
      }

      // Create handler
      this.currentListener = (event) => {
          this.debugLog(`${eventType} event triggered:`, event);
          this.debugLog('Target element:', event.target);

          // Check if the event originated from the expected element or its child
          if (!element.contains(event.target as Node)) {
              this.debugLog('Event target is outside the tracked element. Ignoring.');
              return; // Ignore events bubbling up from outside the target
          }

          // Stop the validation loop as soon as a valid interaction starts
          this.stopValidationLoop();

          // Validate interaction (e.g., check input value if needed)
          if (this.validateInteraction(event, interaction)) {
              this.debugLog('Interaction validated successfully.');

              const currentStep = this.sortedSteps[this.state.currentStep]; // Use sortedSteps
              const stepIndex = currentStep?.position !== undefined ? currentStep.position : this.state.currentStep;

              this.debugLog(`Marking step completed: Index=${this.state.currentStep}, Position=${stepIndex}`);
              this.completeStep(stepIndex); // Pass the correct identifier

               // If this interaction causes navigation (e.g., clicking a link/button that changes URL)
              const isNavigationTrigger =
                  (event.target instanceof HTMLAnchorElement && event.target.href && !event.target.target) ||
                  (event.target instanceof HTMLButtonElement && event.target.type === 'submit') || // Form submission
                  interaction.action === 'navigation'; // Explicit navigation step type?

              const currentURL = window.location.href;
              // Check if URL is likely to change after a microtask delay
              queueMicrotask(() => {
                  if (window.location.href !== currentURL || isNavigationTrigger) {
                      this.debugLog('Navigation detected or expected after interaction. Letting handleNavigation take over.');
                      StateManager.saveWithDebounce(this.state, true); // Save state immediately before potential navigation
                      this.hideVisualElements(); // Clean up visuals
                      this.removeExistingListeners(); // Remove listener before navigating
                      // DO NOT CALL playNextStep here, handleNavigation will manage it.
                  } else {
                       // Only play next step if no navigation occurred
                       this.debugLog('No navigation detected. Moving to next step...');
                       this.playNextStep();
                  }
              });


          } else {
              this.debugLog('Interaction validation failed.');
              // Optionally handle failed validation (e.g., show error)
          }
      };

      // ADDED: Log the specific element the listener is being added to.
      console.log(`[CursorFlow] Adding ${eventType} listener to element:`, element);
      element.addEventListener(eventType, this.currentListener, { capture: true }); // Use capture phase maybe? Test this.

      if (this.options.debug) {
          console.log(`[CursorFlow] Set up ${eventType} listener for element:`, element);
      }
    }
  
    private getEventTypeForInteraction(interactionType: string): string | null {
      switch (interactionType.toLowerCase()) {
        case 'click':
          return 'click';
        case 'input':
        case 'type':
          return 'input';
        case 'change':
          return 'change';
        case 'focus':
          return 'focus';
        case 'hover':
          return 'mouseover';
        default:
          return null;
      }
    }
  
    private validateInteraction(event: Event, expectedInteraction: any): boolean {
      if (!event || !expectedInteraction) return false;
      
      const interactionType = expectedInteraction.action?.toLowerCase() || 'click';
      
      // NEW: Check if the click is on the target element or its children
      if (interactionType === 'click') {
        // For clicks, make sure the click is on the expected element or its children
        if (this.currentTargetElement) {
          const clickedElement = event.target as HTMLElement;
          if (!this.currentTargetElement.contains(clickedElement)) {
            // User clicked outside the highlighted element
            console.log('User clicked outside the highlighted element, stopping guide');
            
            // Show notification
            this.stop({
              message: 'Incorrect click. Guide stopped.',
              type: 'error'
            });
            
            // Stop the guide
            setTimeout(() => this.stop(), 100);
            return false;
          }
        }
      }
      
      switch (interactionType) {
        case 'click':
          // For clicks, validate target element (already checked above)
          return true;
          
        case 'input':
        case 'type':
          // For input, check if input has expected value
          if (event.target instanceof HTMLInputElement ||
              event.target instanceof HTMLTextAreaElement) {
            const inputElement = event.target as HTMLInputElement;
            
            // If expectedValue is specified, check against it
            if (expectedInteraction.value) {
              return inputElement.value.includes(expectedInteraction.value);
            }
            
            // Otherwise just check that some input was provided
            return !!inputElement.value.trim();
          }
          return false;
          
        case 'change':
          // For select elements, check if value matches expected
          if (event.target instanceof HTMLSelectElement) {
            const selectElement = event.target as HTMLSelectElement;
            
            if (expectedInteraction.value) {
              return selectElement.value === expectedInteraction.value;
            }
            
            return true;
          }
          return true;
          
        default:
          // For other types, just pass validation
          return true;
      }
    }
  
    private removeExistingListeners() {
        // Stop validation loop when listeners are removed (e.g., before moving to next step)
        this.stopValidationLoop();

        if (this.currentTargetElement && this.currentListener && this.currentInteractionType) {
          const eventType = this.getEventTypeForInteraction(this.currentInteractionType);
          if (eventType) {
             // Ensure listener removal happens correctly, especially with capture phase
             this.currentTargetElement.removeEventListener(eventType, this.currentListener, { capture: true });
             this.debugLog(`Removed ${eventType} listener from element:`, this.currentTargetElement);
          }
        }
         // Reset tracking properties *after* removing
        this.currentListener = null;
        this.currentInteractionType = null;
        // this.currentTargetElement = null; // Don't nullify currentTargetElement here, it's needed elsewhere
    }
    private handleInteractionError() {
      CursorFlowUI.showErrorNotification(
        'We couldn\'t find the element for this step.',
        {
          message: 'We couldn\'t find the element for this step.',
          type: 'error',
          onRetry: () => this.playCurrentStep(),
          onSkip: () => this.playNextStep(),
          onStop: () => this.stop()
        }
      );
    }
  
    // Add this method to find the next logical step based on completed steps
    private findNextStep(): any | null {
      if (!this.recording || !this.sortedSteps || this.sortedSteps.length === 0) {
        this.debugLog('findNextStep: No recording or steps available.');
        return null;
      }

      this.debugLog('findNextStep: Looking for next step. Completed steps:', this.state.completedSteps);

      // Find the first step in sortedSteps whose position is not in completedSteps
      const nextStep = this.sortedSteps.find(step => {
         const stepId = step.position !== undefined ? step.position : this.sortedSteps.indexOf(step);
         return !this.state.completedSteps.includes(stepId);
      });


      if (nextStep) {
         const stepId = nextStep.position !== undefined ? nextStep.position : this.sortedSteps.indexOf(nextStep);
         this.debugLog('findNextStep: Found next uncompleted step:', { position: stepId, step: nextStep.annotation || nextStep.interaction?.text });
         return nextStep;
      }


      this.debugLog('findNextStep: All steps appear to be completed.');
      return null; // All steps are completed
    }
  
    // Add a new method for guide completion
    private completeGuide() {
      if (this.options.debug) {
        console.log('All guide steps completed, resetting state');
      }
      
      // Clear any redirect guide ID
      try {
        localStorage.removeItem('hyphen_redirect_guide_id');
      } catch (err) {
        console.warn('Failed to clear redirect guide ID on completion:', err);
      }
      
      // Stop the guide
      this.stop({
        message: 'Guide completed successfully!',
        type: 'success',
        autoClose: 3000
      });
      
      // Mark session inactive
      StateManager.clearSession();
    }

    private createVisualElements() {
      if (!this.cursorElement) {
        this.cursorElement = CursorFlowUI.createCursor(this.options.theme || {});
      }
      
      if (!this.highlightElement) {
        this.highlightElement = CursorFlowUI.createHighlight(this.options.theme || {});
      }
      
      if (this.options.debug) {
        console.log('Visual elements created');
      }
    }

    private completeStep(stepIdentifier: number) { // Use position or index
      // Stop validation loop when step is successfully completed
      this.stopValidationLoop();

      if (!this.state.completedSteps.includes(stepIdentifier)) {
        this.state.completedSteps.push(stepIdentifier);
        StateManager.saveWithDebounce(this.state); // Debounced save
        if (this.options.debug) {
          this.debugLog(`Step completed (ID/Pos: ${stepIdentifier}). Completed: [${this.state.completedSteps.join(', ')}]`);
        }
      } else {
         if (this.options.debug) {
            this.debugLog(`Step (ID/Pos: ${stepIdentifier}) was already marked completed.`);
         }
      }
    }


    private async playNextStep() {
        if (!this.state.isPlaying) return false;

        this.debugLog('playNextStep: Attempting to move to the next step.');

        // Hide current visual elements first, but keep the cursor and notifications
        this.hideVisualElements(); // Use the refactored hide method if available, or CursorFlowUI.cleanupAllUI(true, true);

        // Remove existing listeners *before* finding the next step's element
        this.removeExistingListeners();

        const nextStep = this.findNextStep();

        if (nextStep) {
            // Update currentStep index in the state to match the found next step
            const nextStepIndex = this.sortedSteps.findIndex(step => step === nextStep);
            if (nextStepIndex !== -1) {
                 this.state.currentStep = nextStepIndex;
                 this.debugLog(`playNextStep: Found next step at index ${this.state.currentStep}. Saving state and playing.`);
                 StateManager.saveWithDebounce(this.state); // Save the updated currentStep index

                 await this.playCurrentStep(); // Play the step we just found
                 return true;
            } else {
                console.error('[CursorFlow] Could not find index for the identified next step. State might be corrupted.');
                 this.completeGuide(); // Fail safe to completion
                 return false;
            }
        } else {
            // No next step found, assume guide completion
            this.debugLog('playNextStep: No next step found by findNextStep(). Completing guide.');
            this.completeGuide();
            return false;
        }
    }

    // --- NEW Methods for Validation Loop ---

    private startValidationLoop() {
        // Ensure no loop is already running
        this.stopValidationLoop();

        if (!this.state.isPlaying || !this.currentTargetElement) {
            this.debugLog('[VALIDATION] Starting validation loop ABORTED: Not playing or no target element.');
            return;
        }

        this.debugLog('[VALIDATION] Starting validation loop for current step.');

        // Keep a reference to the element being validated in this loop instance
        const elementToValidate = this.currentTargetElement;
        // Get the corresponding interaction data for validation context
        const interactionData = this.sortedSteps[this.state.currentStep]?.interaction;

        const VALIDATION_INTERVAL_MS = 500; // Interval for checks
        let lastValidationTime = Date.now();

        const loopFn = () => {
            // Stop conditions
            if (!this.state.isPlaying || this.validationLoopId === null || this.currentTargetElement !== elementToValidate) {
                this.debugLog('[VALIDATION] Stopping loop (state changed or cancelled).');
                this.validationLoopId = null;
                return;
            }

            const currentTime = Date.now();

            // Only perform validation check if enough time has passed
            if (currentTime - lastValidationTime >= VALIDATION_INTERVAL_MS) {
                lastValidationTime = currentTime;
                
                try {
                    // SANITY CHECK: Basic DOM connection check
                    if (!elementToValidate.isConnected) {
                        this.debugLog('[VALIDATION] CRITICAL: Target element disconnected from DOM!');
                        this.handleStepInvalidation('Element removed from DOM');
                        return;
                    }

                    // CRITICAL FIX: Check viewport status FIRST before any validation
                    const isInViewport = this.isElementPartiallyInViewport(elementToValidate);
                    this.debugLog(`[VALIDATION] Viewport check: Element is ${isInViewport ? 'VISIBLE' : 'NOT VISIBLE'} in viewport.`);
                    
                    // KEY CHANGE: For partially visible elements, always pass validation
                    // This addresses the sensitivity issue when scrolling
                    if (isInViewport) {
                        this.debugLog('[VALIDATION] Element is at least partially visible - PASSING validation');
                        // Continue the loop without further checks as long as element is partially visible
                    } else {
                        // Only if completely outside viewport, do relaxed validation
                        this.debugLog('[VALIDATION] Element completely outside viewport, performing RELAXED validation only.');
                        
                        const isRelaxedValid = SelectiveDomAnalyzer.validateCandidateElement(
                            elementToValidate,
                            interactionData,
                            'relaxed'
                        );
                        
                        if (!isRelaxedValid) {
                            this.debugLog('[VALIDATION] CRITICAL: Element failed even RELAXED validation while outside viewport.');
                            this.handleStepInvalidation('Element identity changed');
                            return;
                        }
                        
                        this.debugLog('[VALIDATION] Element passed relaxed validation while outside viewport.');
                    }
                } catch (error) {
                    console.error('[VALIDATION] Error during loop:', error);
                }
            }

            // Continue the loop
            this.validationLoopId = requestAnimationFrame(loopFn);
        };

        // Start the loop
        this.validationLoopId = requestAnimationFrame(loopFn);
    }

    private stopValidationLoop() {
        if (this.validationLoopId !== null) {
            this.debugLog('[VALIDATION] Stopping validation loop.');
            cancelAnimationFrame(this.validationLoopId);
            this.validationLoopId = null;
        }
    }

    // More lenient viewport check - detects if element is at least partially visible
    private isElementPartiallyInViewport(element: HTMLElement | null): boolean {
        if (!element) return false;
        const rect = element.getBoundingClientRect();
        
        // Element is at least partially visible if:
        // IMPORTANT: Increased buffer from 100px to 300px to be more lenient with scrolling
        const BUFFER = 300; // Increased from 100px for more leniency
        
        const isPartiallyVisible = (
            rect.top < (window.innerHeight + BUFFER) && // Element top is above bottom edge (with buffer)
            rect.bottom > -BUFFER &&                    // Element bottom is below top edge (with buffer)
            rect.left < (window.innerWidth + BUFFER) && // Element left is before right edge (with buffer)
            rect.right > -BUFFER                        // Element right is after left edge (with buffer)
        );
        
        this.debugLog(`[VALIDATION-VIEWPORT] ${element.tagName}#${element.id || 'noId'} position: top=${Math.round(rect.top)}, bottom=${Math.round(rect.bottom)}, left=${Math.round(rect.left)}, right=${Math.round(rect.right)}, isPartiallyVisible=${isPartiallyVisible}, buffer=${BUFFER}px`);
        
        return isPartiallyVisible;
    }

    private handleStepInvalidation(reason: string) {
        // Don't proceed if we're already stopping
        if (this.invalidationInProgress) {
            this.debugLog(`Ignoring step invalidation (${reason}) as invalidation is already in progress`);
            return;
        }
        
        // Set invalidation flag to prevent concurrent stop calls
        this.invalidationInProgress = true;
        
        this.debugLog(`Handling Step Invalidation: ${reason}`);
        this.stopValidationLoop(); // Ensure loop is stopped

        // Show notification similar to handleNavigation's failure case
        CursorFlowUI.showNotification({
            message: 'Oops! Looks like the context changed unexpectedly.',
            type: 'warning',
            autoClose: 5000
        });

        // Stop the guide IMMEDIATELY
        this.stop({
            message: 'Guide stopped due to unexpected context change.',
            type: 'warning'
        });
    }
    // --- End NEW Methods ---

    // Generate a unique token for operation tracking
    private generateToken(): string {
      return Date.now().toString() + Math.random().toString(36).substring(2);
    }

    // *** NEW Method to handle starting guide after successful search ***
    private startGuideAfterSearch(guideId: string) {
      this.debugLog(`Starting guide ${guideId} after successful semantic search.`);
      
      // IMPORTANT: Generate a new operation token
      this.operationToken = this.generateToken();
      const currentToken = this.operationToken;
      
      // Set playing state via the setter
      this.setIsPlaying(true);
      
      // Show thinking indicator (optional, might be handled by SearchUI already)
      // We'll reuse the existing indicator logic if the start button is visible
      if (this.startButton && !this.thinkingIndicator) { 
        this.thinkingIndicator = CursorFlowUI.showThinkingIndicator(this.startButton);
      }
      
      // Call retrieveGuideData with the ID and token
      this.retrieveGuideData(guideId, currentToken);
    }
}