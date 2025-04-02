import { ApiClient } from './apiClient';
import { StateManager } from './manageState';
import { CursorFlowUI } from './uiComponents';
import { CursorFlowOptions, CursorFlowState } from './types';
import { ElementUtils } from './elementUtils';
import { RobustElementFinder } from './robustElementFinder';
import { SelectiveDomAnalyzer } from './selectiveDomAnalyzer';


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
      this.apiClient = new ApiClient(this.options.apiUrl, this.options.organizationId);
      // this.apiClient = new ApiClient('https://hyphenbox-backend.onrender.com', this.options.organizationId);
      
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
    }
  
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
        
        // Restore state if available
        const savedState = StateManager.restore();
        if (savedState) {
          this.state = savedState;
          
          // Check if tab was closed during active session
          if (this.state.isPlaying && !StateManager.isSessionActive()) {
            // Tab was closed, reset playing state
            console.log('Tab was closed, resetting playing state');
            this.state.isPlaying = false;
            StateManager.save(this.state);
          } else if (this.state.isPlaying && this.state.recordingId) {
            // If guide was playing, reload the recording and continue
            console.log('Guide is active, loading recording');
            await this.loadRecording(this.state.recordingId);
            
            // Set up navigation detection
            this.setupNavigationDetection();
            
            // Proactively check for the next step to play
            console.log('Active guide detected, finding appropriate step to play');
            setTimeout(() => {
              // First, try handleNavigation to see if we have a matching step for this URL
              this.handleNavigation(true); // Pass true to indicate we want to continue even if no match
            }, 500);
          }
          
          if (this.options.debug) {
            console.log('Restored state:', this.state);
          }
        }
        
        // Fetch available guides
        await this.fetchGuides();
        
        // Add the start button to the page
        this.createStartButton();
        
        // Add a window event listener to flush state on page unload
        window.addEventListener('beforeunload', () => {
          if (this.state.isPlaying) {
            StateManager.flushPendingSave();
          }
        });
        
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
    
    private createStartButton() {
      console.log('[CURSOR-FLOW-DEBUG] Creating start button');
      console.log('[CURSOR-FLOW-DEBUG] Current buttonText:', this.options.buttonText);
      
      // First, remove any existing start buttons to prevent duplicates
      const existingButtons = document.querySelectorAll('.hyphen-start-button');
      existingButtons.forEach(button => button.remove());
      
      // Create new button
      this.startButton = CursorFlowUI.createStartButton(
          this.options.buttonText || 'Guides',
          this.options.theme?.buttonColor || '#007bff',
          () => this.toggleGuideState()
      );
      
      document.body.appendChild(this.startButton);
      
      if (this.options.debug) {
          console.log('[CURSOR-FLOW-DEBUG] Start button created and appended to body');
      }
      
      // Update button text based on current state
      this.updateButtonState();
    }
  
    private toggleGuideState() {
      if (this.state.isPlaying) {
        // If guide is playing, stop it
        this.stop();
      } else {
        // If guide is not playing, start it
        this.start();
      }
    }
  
    private updateButtonState() {
      console.log('[CURSOR-FLOW-DEBUG] Updating button state');
      console.log('[CURSOR-FLOW-DEBUG] Current state:', { isPlaying: this.state.isPlaying });
      
      if (!this.startButton) {
          console.warn('[CURSOR-FLOW-DEBUG] No start button found to update');
          return;
      }
      
      // Get or create the text span
      let textSpan = this.startButton.querySelector('.hyphen-text');
      if (!textSpan) {
          textSpan = document.createElement('span');
          textSpan.className = 'hyphen-text';
          this.startButton.appendChild(textSpan);
      }
      
      // Update text and class in a single operation
      if (this.state.isPlaying) {
          console.log('[CURSOR-FLOW-DEBUG] Setting button to "Stop Guide"');
          textSpan.textContent = 'Stop Guide';
          this.startButton.classList.add('hyphen-playing');
      } else {
          console.log('[CURSOR-FLOW-DEBUG] Setting button to:', this.options.buttonText || 'Guides');
          textSpan.textContent = this.options.buttonText || 'Guides';
          this.startButton.classList.remove('hyphen-playing');
      }
    }
  
    start() {
      if (this.options.debug) {
        console.log('Starting guide selection');
      }
      
      // Set session flag
      StateManager.setSessionActive();
      
      // Check if we already have guides, fetch them if not
      if (this.guides.length === 0) {
        this.fetchGuides().then(() => {
          this.showGuidesDropdown();
        });
      } else {
        this.showGuidesDropdown();
      }
    }
  
    private showGuidesDropdown() {
      if (!this.startButton) return;
      
      // Create and show dropdown
      CursorFlowUI.showGuidesDropdown(
        this.guides, 
        this.startButton,
        (guideData) => {
          console.log('Selected guide:', guideData);
          
          // Show thinking indicator as soon as guide is selected
          if (this.startButton) {
            this.thinkingIndicator = CursorFlowUI.showThinkingIndicator(this.startButton);
          }
          
          // For now just retrieve and log the recording data
          this.retrieveGuideData(guideData.id);
        }
      );
    }
  
    private async retrieveGuideData(guideId: string) {
      try {
        // Fetch recording data - now returns the full flow with steps
        const flowData = await this.apiClient.getRecording(guideId);
        console.log('Retrieved guide data:', flowData);
        
        // Get texts is optional since annotations are already in the flowData
        // But keeping for backward compatibility
        const texts = await this.apiClient.getTexts(guideId);
        console.log('Retrieved guide texts:', texts);
        
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
        
        // MODIFICATION: For a guide selected from the dropdown, always start fresh
        // Clear any previous state for this guide ID
        StateManager.clear();
        
        // NEW: Check if user is on the correct starting page
        if (this.recording && this.recording.steps && this.recording.steps.length > 0) {
          // Find the first step
          const sortedSteps = [...this.recording.steps].sort((a, b) => {
            return (a.position || 0) - (b.position || 0);
          });
          
          const firstStep = sortedSteps[0];
          
          // Add debugging logs
          console.log('URL CHECK DEBUG: First step data:', {
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
          
          console.log('URL CHECK DETAILS:', { 
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
            console.log('URL CHECK FAILED: User is not on the correct starting page for the guide');
            
            // Hide thinking indicator before showing notification
            if (this.thinkingIndicator) {
              CursorFlowUI.hideThinkingIndicator(this.thinkingIndicator);
              this.thinkingIndicator = null;
            }
            
            if (redirectUrl) {
              // Show notification with redirect option
              CursorFlowUI.showRedirectNotification({
                message: 'To start this guide, you need to go to the starting page first',
                type: 'info',
                redirectUrl: redirectUrl,
                redirectText: 'Go to start'
              });
            } else {
              // No redirect URL available
              CursorFlowUI.showNotification({
                message: 'Guide cannot start - missing URL information',
                type: 'error',
                autoClose: 5000
              });
            }
            
            return;
          }
          
          console.log('URL CHECK PASSED: User is on the correct starting page for the guide');
        }
        
        // Start the actual guide instead of just showing a demo
        await this.startGuide(guideId);
      } catch (error) {
        console.error('Failed to retrieve guide data:', error);
        
        // Hide thinking indicator on error
        if (this.thinkingIndicator) {
          CursorFlowUI.hideThinkingIndicator(this.thinkingIndicator);
          this.thinkingIndicator = null;
        }
        
        // Show error notification
        CursorFlowUI.showNotification({
          message: 'Failed to load guide. Please try again.',
          type: 'error',
          autoClose: 5000
        });
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
      console.log('Step instruction:', popupText);
      
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
      
      console.log('Looking for element with text:', elementText);
      
      // Find the target element
      this.currentTargetElement = ElementUtils.findElementFromInteraction(interaction, false);
      
      if (this.currentTargetElement) {
        console.log('Found target element:', this.currentTargetElement);
        
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
          console.log('Demo: Showing cursor and text for first step');
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
      // If notification options provided, show notification
      if (notificationOptions) {
        CursorFlowUI.showNotification({
          ...notificationOptions,
          autoClose: notificationOptions.autoClose || 2000 // Default to 2 seconds
        });
      }
      
      // Hide thinking indicator when stopping the guide
      if (this.thinkingIndicator) {
        CursorFlowUI.hideThinkingIndicator(this.thinkingIndicator);
        this.thinkingIndicator = null;
      }
      
      if (this.options.debug) {
        console.log('Stopping guide');
      }
      
      // Add a small delay before cleaning up UI elements to ensure notification is visible
      setTimeout(() => {
        // Clean up all UI elements - pass false to ensure cursor is also cleaned up,
        // and true to keep notifications
        CursorFlowUI.cleanupAllUI(false, true);
        
        // Reset state
        this.state = {
          isPlaying: false,
          currentStep: 0,
          recordingId: null,
          completedSteps: [],
          timestamp: Date.now(),
          debug: this.options.debug
        };
        
        // Use immediate clear instead of debounced save
        StateManager.clear();
        StateManager.clearSession();
        
        // Remove event listeners
        this.removeExistingListeners();
        
        // Update button state
        this.updateButtonState();
        
        // Reset all element references
        this.cursorElement = null;
        this.highlightElement = null;
        this.currentTargetElement = null;
        
        if (this.options.debug) {
          console.log('Guide stopped, state reset');
        }
      }, 100); // Small delay to ensure notification shows up first
    }
  
    private async loadRecording(recordingId: string) {
      try {
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
        const preserveSteps = this.state.recordingId === recordingId ? this.state.completedSteps : [];
        
        // Update state
        this.state.recordingId = recordingId;
        this.state.isPlaying = true;
        this.state.currentStep = 0;
        this.state.completedSteps = preserveSteps;
        
        // Save state immediately since this is an important transition
        StateManager.saveWithDebounce(this.state, true);
        
        if (this.options.debug) {
          console.log('Recording loaded:', recordingId, flowData);
          console.log('Preserved completed steps:', preserveSteps);
        }
        
        return flowData;
      } catch (error) {
        console.error('Failed to load recording:', error);
        throw error;
      }
    }
  
    private async startGuide(guideId: string) {
      try {
        if (this.options.debug) {
          console.log('Starting guide:', guideId);
        }
        
        // Create a new state with empty completedSteps
        // We're removing the code that preserves old completedSteps
        this.state = {
          isPlaying: true,
          currentStep: 0,
          recordingId: guideId,
          completedSteps: [], // Always start fresh when selecting from dropdown
          timestamp: Date.now()
        };
        
        // Add debug logging
        console.log('Starting guide with state:', JSON.stringify(this.state));
        
        // Load recording
        await this.loadRecording(guideId);
        
        // Set session active
        StateManager.setSessionActive();
        
        // Create visual elements if needed
        this.createVisualElements();
        
        // Setup navigation detection
        this.setupNavigationDetection();
        
        // Update button state
        this.updateButtonState();
        
        // Play first step
        await this.playCurrentStep();
        
        return true;
      } catch (error) {
        console.error('Failed to start guide:', error);
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
        console.log('DETECT CONTEXT: Current URL:', currentUrl, 'Path:', currentPath);
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
          console.log('DETECT CONTEXT: No steps match current URL or path');
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
      console.log(`[DEBUG-VERIFY] playCurrentStep called. this.options.debug = ${this.options.debug}`);
      
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


      // Before we search for elements, check if navigation is expected
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
      await this.showVisualElements(this.currentTargetElement, interaction);
      console.timeEnd('Show visual elements');

      console.time('Setup interaction tracking');
      this.setupElementInteractionTracking(this.currentTargetElement, interaction);
      console.timeEnd('Setup interaction tracking');

      return true;
    }
  
    private async showVisualElements(targetElement: HTMLElement, interaction: any) {
      // Create cursor element if not already created
      if (!this.cursorElement) {
        this.cursorElement = CursorFlowUI.createCursor(this.options.theme || {});
      }
      
      // Check if element is in view and scroll to it if needed
      // Uses ElementUtils helper - this is fine as it's a generic DOM utility
      if (!ElementUtils.isElementInView(targetElement)) {
        if (this.options.debug) {
          console.log('[CursorFlow] Target element is not in view, scrolling to it');
        }
        await ElementUtils.scrollToElement(targetElement);
      }
      
      // Get annotation text
      let annotationText = '';
       // Ensure we reference the step correctly, especially after potential state correction
      const stepData = this.sortedSteps[this.state.currentStep];
      if (stepData) {
        annotationText = stepData.annotation || stepData.popupText || 'Perform the next action'; // More generic default
      } else {
         console.warn('[CursorFlow] Could not find step data to retrieve annotation.');
         annotationText = 'Perform the next action';
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
        interaction
      );
      
      // Create and position text popup
      const textPopup = CursorFlowUI.createTextPopup(annotationText, this.options.theme || {});
      CursorFlowUI.positionTextPopupNearCursor(this.cursorElement, textPopup);
      
      if (this.options.debug) {
        console.log('[CursorFlow] Visual elements shown for element:', targetElement);
      }
    }
  
    private hideVisualElements() {
      // Clean up UI elements - Change keepCursor to false to remove the cursor on completion/stop
      CursorFlowUI.cleanupAllUI(false, true); // Changed first argument from true to false

      // Reset references
      this.highlightElement = null;

      if (this.options.debug) {
        console.log('Visual elements hidden and cleaned up (including cursor)'); // Updated log message
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
      if (!this.state.isPlaying || this.isHandlingNavigation) {
        console.log('handleNavigation: Not playing or already handling, returning early');
        return;
      }
      
      this.isHandlingNavigation = true;
      console.log('handleNavigation: Current URL:', window.location.href);
      console.time('Navigation handling');
      
      // Use an even shorter timeout
      setTimeout(async () => {
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
              await this.playCurrentStep();
            } else {
              // Forward navigation - check if prerequisites are met
              const prerequisitesMet = this.sortedSteps.every((step: any) => {
                const position = step.position || 0;
                return position >= stepIndex || this.state.completedSteps.includes(position);
              });
              
              if (prerequisitesMet) {
                console.log('handleNavigation: Prerequisites met, playing step');
                this.state.currentStep = this.recording.steps.indexOf(contextStep);
                await this.playCurrentStep();
              } else {
                console.log('handleNavigation: Prerequisites not met, showing warning');
                
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
                this.completeGuide();
            } else {
                // Show notification before stopping
                CursorFlowUI.showNotification({
                    message: 'Oops! You\'ve navigated away from the guide path',
                    type: 'warning',
                    autoClose: 5000
                });
                
                // Add a small delay before stopping to ensure notification is shown
                setTimeout(() => {
                    this.stop({
                        message: 'Oops! You\'ve navigated away from the guide path',
                        type: 'warning'
                    });
                }, 100);
            }
            console.timeEnd('Check completion');
          }
        } catch (error) {
          console.error('Error handling navigation:', error);
        } finally {
          console.timeEnd('Navigation handling');
          this.isHandlingNavigation = false;
        }
      }, 50); // Even shorter timeout
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
        console.log('Guide completed');
      }
      
      // Update state to completed
      this.state.isPlaying = false;
      
      // Save state immediately since this is the final state
      StateManager.saveWithDebounce(this.state, true);
      
      // Show completion popup near the guide button
      if (this.startButton) {
        CursorFlowUI.showCompletionPopup(this.startButton);
      }
      
      // Clean up
      this.hideVisualElements();
      this.updateButtonState();
      
      // Also show notification for extra visibility
      CursorFlowUI.showNotification({
        message: 'Guide completed! 🎉',
        type: 'success',
        autoClose: 5000
      });
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
  }