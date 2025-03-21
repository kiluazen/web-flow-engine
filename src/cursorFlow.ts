import { ApiClient } from './apiClient';
import { StateManager } from './manageState';
import { CursorFlowUI } from './uiComponents';
import { CursorFlowOptions, CursorFlowState } from './types';
import { ElementUtils } from './elementUtils';

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
  
    constructor(options: CursorFlowOptions) {
      // Initialize with default options
      this.options = {
        ...options,
        theme: options.theme || {},
        buttonText: options.buttonText || 'Guides',
        guidesButtonText: options.guidesButtonText || 'Select Guide',
        debug: options.debug || false
      };
      
      // Create API client
      this.apiClient = new ApiClient(this.options.apiUrl, this.options.organizationId);
      
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
      if (!this.startButton) {
        this.startButton = CursorFlowUI.createStartButton(
          this.options.buttonText || 'Guides',
          this.options.theme?.buttonColor || '#007bff',
          () => this.toggleGuideState()
        );
        
        document.body.appendChild(this.startButton);
        
        if (this.options.debug) {
          console.log('Start button created');
        }
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
      if (!this.startButton) return;
      
      if (this.state.isPlaying) {
        this.startButton.textContent = 'Stop Guide';
        this.startButton.classList.add('hyphen-playing');
      } else {
        this.startButton.textContent = this.options.buttonText || 'Guides';
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
          
          // Proceed only if URLs match
          if (hasUrlToCheck && !isUrlMatch && !isPathMatch) {
            // User is not on the correct starting page
            console.log('URL CHECK FAILED: User is not on the correct starting page for the guide');
            
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
      
      // Get element position
      const rect = element.getBoundingClientRect();
      
      // Add to DOM if not already there
      if (!highlight.parentElement) {
        document.body.appendChild(highlight);
      }
      
      // Position and size the highlight to match the element
      highlight.style.left = `${rect.left}px`;
      highlight.style.top = `${rect.top}px`;
      highlight.style.width = `${rect.width}px`;
      highlight.style.height = `${rect.height}px`;
    }
  
    stop() {
      if (this.options.debug) {
        console.log('Stopping guide');
      }
      
      // Remove visual elements
      this.hideVisualElements();
      
      // Reset state
      this.state = {
        isPlaying: false,
        currentStep: 0,
        recordingId: null,
        completedSteps: [],
        timestamp: Date.now()
      };
      
      // Clear storage
      StateManager.clear();
      StateManager.clearSession();
      
      // Remove event listeners
      this.removeExistingListeners();
      
      // Update button state
      this.updateButtonState();
      
      if (this.options.debug) {
        console.log('Guide stopped, state reset');
      }
    }
  
    private async loadRecording(recordingId: string) {
      try {
        // Fetch recording data from API
        const flowData = await this.apiClient.getRecording(recordingId);
        
        // Store the recording
        this.recording = flowData;
        
        // Preserve completedSteps when it's the same recording ID
        const preserveSteps = this.state.recordingId === recordingId ? this.state.completedSteps : [];
        
        // Update state
        this.state.recordingId = recordingId;
        this.state.isPlaying = true;
        this.state.currentStep = 0;
        this.state.completedSteps = preserveSteps;
        
        // Save state
        StateManager.save(this.state);
        
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
      if (!this.recording || !this.recording.steps || this.recording.steps.length === 0) {
        return null;
      }
      
      const currentUrl = window.location.href;
      const currentPath = window.location.pathname;
      console.log('DETECT CONTEXT: Current URL:', currentUrl, 'Path:', currentPath);
      
      // Log all steps so we can verify their structure
      console.log('DETECT CONTEXT: All steps:', this.recording.steps.map((step: any) => ({
        position: step.position,
        interactionData: step.interaction,
        pageInfo: step.interaction?.pageInfo,
        interactionType: step.interaction?.type,
        annotation: step.annotation
      })));
      
      // Find steps that match the current URL
      const matchingSteps = this.recording.steps.filter((step: any) => {
        // The pageInfo is inside the interaction object
        const pageInfo = step.interaction?.pageInfo;
        
        // Check URL and path from pageInfo
        const stepUrl = pageInfo?.url;
        const stepPath = pageInfo?.path;
        
        let urlMatches = false;
        let pathMatches = false;
        
        // Check URL match if available
        if (stepUrl) {
          urlMatches = ElementUtils.compareUrls(stepUrl, currentUrl);
          console.log('DETECT CONTEXT: Step URL check:', {
            position: step.position,
            stepUrl: stepUrl,
            matches: urlMatches
          });
        }
        
        // Check path match if available
        if (stepPath) {
          pathMatches = stepPath === currentPath;
          console.log('DETECT CONTEXT: Step path check:', {
            position: step.position,
            stepPath,
            currentPath,
            matches: pathMatches
          });
        }
        
        // Match if either URL or path matches
        const matches = urlMatches || pathMatches;
        console.log(`DETECT CONTEXT: Step ${step.position} matches: ${matches}`);
        return matches;
      });
      
      if (matchingSteps.length === 0) {
        // No matching steps for this URL
        console.log('DETECT CONTEXT: No steps match current URL or path', { 
          currentUrl,
          currentPath,
          completedSteps: this.state.completedSteps
        });
        return null;
      }
      
      console.log('DETECT CONTEXT: Found matching steps:', matchingSteps.length);
      
      // Find the earliest uncompleted step for this URL
      const uncompletedSteps = matchingSteps.filter((step: any) => {
        const stepIndex = step.position || this.recording.steps.indexOf(step);
        const isCompleted = this.state.completedSteps.includes(stepIndex);
        console.log(`DETECT CONTEXT: Step ${stepIndex} completion status:`, isCompleted);
        return !isCompleted;
      });
      
      if (uncompletedSteps.length > 0) {
        // Return earliest uncompleted step by position value
        const earliestStep = uncompletedSteps.sort((a: any, b: any) => {
          return (a.position || 0) - (b.position || 0);
        })[0];
        
        console.log('DETECT CONTEXT: Found matching uncompleted step:', earliestStep);
        return earliestStep;
      }
      
      // All steps for this URL are completed,
      // return the last step for this URL for navigation context
      const lastStep = matchingSteps.sort((a: any, b: any) => {
        return (b.position || 0) - (a.position || 0);
      })[0];
      console.log('DETECT CONTEXT: All steps completed for this URL, returning last step:', lastStep);
      
      return lastStep;
    }
  
    private async playCurrentStep() {
      if (!this.recording || !this.state.isPlaying) {
        console.warn('No active recording or not in playing state');
        return false;
      }
      
      // Get current step from recording
      let currentStep;
      if (this.recording.steps && this.recording.steps.length > 0) {
        // If this is position-based, find by position, otherwise use index
        if (this.recording.steps[0].position !== undefined) {
          // Sort steps by position
          const sortedSteps = [...this.recording.steps].sort((a, b) => {
            return (a.position || 0) - (b.position || 0);
          });
          
          // Find first uncompleted step
          for (const step of sortedSteps) {
            const stepIndex = step.position;
            if (!this.state.completedSteps.includes(stepIndex)) {
              currentStep = step;
              break;
            }
          }
          
          // If all steps completed, use the last one
          if (!currentStep && sortedSteps.length > 0) {
            currentStep = sortedSteps[sortedSteps.length - 1];
          }
        } else {
          // Use index-based approach
          currentStep = this.recording.steps[this.state.currentStep];
        }
      }
      
      if (!currentStep) {
        console.warn('No step found for current position');
        return false;
      }
      
      if (this.options.debug) {
        console.log('Playing step:', currentStep);
      }
      
      // Find target element from interaction data
      const interaction = currentStep.interaction || {};
      console.log('DEBUG: Full interaction object:', JSON.stringify(interaction));
      
      // Support both interaction.element.textContent and interaction.text
      if (interaction.element?.textContent) {
        console.log('Using element textContent for finding:', interaction.element.textContent);
        interaction.text = interaction.element.textContent;
      }
      
      // Add debugging for element finding
      console.log('Looking for element with properties:', JSON.stringify({
        text: interaction.text,
        selector: interaction.selector,
        action: interaction.action || 'click'
      }));
      
      this.currentTargetElement = ElementUtils.findElementFromInteraction(interaction);
      
      if (!this.currentTargetElement) {
        console.warn('Target element not found for step:', currentStep);
        console.log('DOM content at time of search:', document.body.innerHTML.substring(0, 500) + '...');
        // Handle error, maybe try again or show notification
        this.handleInteractionError();
        return false;
      }
      
      console.log('Found target element:', this.currentTargetElement.outerHTML);
      
      // Show visual elements
      await this.showVisualElements(this.currentTargetElement, interaction);
      
      // Set up interaction tracking
      this.setupElementInteractionTracking(this.currentTargetElement, interaction);
      
      return true;
    }
  
    private async showVisualElements(targetElement: HTMLElement, interaction: any) {
      // Create elements if not already created
      this.createVisualElements();
      
      // Ensure elements exist
      if (!this.cursorElement || !this.highlightElement) {
        console.error('Visual elements not available');
        return;
      }
      
      // Check if element is in view and scroll to it if needed
      if (!ElementUtils.isElementInView(targetElement)) {
        if (this.options.debug) {
          console.log('Target element is not in view, scrolling to it');
        }
        await ElementUtils.scrollToElement(targetElement);
      }
      
      // Get annotation text
      let annotationText = '';
      const currentStep = this.recording?.steps?.[this.state.currentStep];
      if (currentStep) {
        annotationText = currentStep.annotation || currentStep.popupText || 'Click here';
      }
      
      // Use the new unified method to display all elements together
      CursorFlowUI.showGuidanceElements(
        targetElement,
        this.cursorElement,
        this.highlightElement,
        annotationText,
        this.options.theme || {}
      );
      
      if (this.options.debug) {
        console.log('Visual elements shown for element:', targetElement);
      }
    }
  
    private hideVisualElements() {
      // Use our comprehensive cleanup method
      CursorFlowUI.cleanupAllUI();
      
      // Reset references
      this.cursorElement = null;
      this.highlightElement = null;
      
      if (this.options.debug) {
        console.log('Visual elements hidden and cleaned up');
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
      if (!this.state.isPlaying) {
        console.log('handleNavigation: Not playing, returning early');
        return;
      }
      
      console.log('handleNavigation: Current URL:', window.location.href);
      
      setTimeout(async () => {
        try {
          // Check if we have completed the previous step and moved to a new URL
          // that matches the next expected step
          if (this.state.completedSteps.length > 0) {
            const lastCompletedPosition = this.state.completedSteps[this.state.completedSteps.length - 1];
            console.log('handleNavigation: Last completed step position:', lastCompletedPosition);
            
            // Find all steps with positions greater than the last completed
            const possibleNextSteps = this.recording.steps.filter((step: any) => {
              const stepPosition = step.position || 0;
              return stepPosition > lastCompletedPosition && 
                    !this.state.completedSteps.includes(stepPosition);
            }).sort((a: any, b: any) => (a.position || 0) - (b.position || 0));
            
            if (possibleNextSteps.length > 0) {
              const nextExpectedStep = possibleNextSteps[0];
              console.log('handleNavigation: Next expected step:', nextExpectedStep);
              
              // Get URL and path from interaction.pageInfo
              const pageInfo = nextExpectedStep.interaction?.pageInfo;
              const nextStepUrl = pageInfo?.url;
              const nextStepPath = pageInfo?.path;
              const currentPath = window.location.pathname;
              
              console.log('handleNavigation: Next step URL data:', {
                pageInfo,
                nextStepUrl,
                nextStepPath,
                currentPath
              });
              
              // Check if current URL matches what we expect for the next step
              if (nextStepPath && nextStepPath === currentPath) {
                console.log('handleNavigation: Current path matches expected next step path:', nextStepPath);
                this.state.currentStep = this.recording.steps.indexOf(nextExpectedStep);
                await this.playCurrentStep();
                return;
              } else {
                console.log('handleNavigation: Path mismatch - Expected:', nextStepPath, 'Current:', currentPath);
              }
            }
          }
          
          const contextStep = await this.detectCurrentContext();
          
          if (contextStep) {
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
              const sortedSteps = [...this.recording.steps].sort((a, b) => {
                return (a.position || 0) - (b.position || 0);
              });
              
              // NEW: More strict prerequisite checking
              // All steps with position less than current must be completed
              const prerequisitesMet = sortedSteps.every(step => {
                const position = step.position || 0;
                return position >= stepIndex || this.state.completedSteps.includes(position);
              });
              
              if (prerequisitesMet) {
                console.log('handleNavigation: Prerequisites met, playing step');
                this.state.currentStep = this.recording.steps.indexOf(contextStep);
                await this.playCurrentStep();
              } else {
                console.log('handleNavigation: Prerequisites not met, showing warning');
                
                // NEW: More informative warning with redirect option
                const firstIncompleteStep = sortedSteps.find(step => {
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
                
                // NEW: Stop the guide if user is trying to skip steps
                this.stop();
              }
            }
          } else {
            console.log('handleNavigation: No matching steps for this URL');
            
            // Check if all steps are completed before showing "navigated away"
            if (this.state.isPlaying) {
              // Get all steps
              const allSteps = this.recording.steps || [];
              
              // Check if all steps are completed
              const allCompleted = allSteps.every((step: any) => {
                const stepPosition = step.position || 0;
                return this.state.completedSteps.includes(stepPosition);
              });
              
              console.log('handleNavigation: All steps completed check:', { 
                allCompleted,
                stepsCount: allSteps.length,
                completedCount: this.state.completedSteps.length
              });
              
              if (allCompleted && allSteps.length > 0) {
                // All steps are completed, show completion message
                console.log('handleNavigation: All guide steps completed, showing success message');
                
                // Call the completeGuide method
                this.completeGuide();
              } else {
                // Genuinely navigated away
                CursorFlowUI.showNotification({
                  message: 'You\'ve navigated away from the guide path',
                  type: 'warning',
                  autoClose: 5000
                });
                
                // Stop the guide
                this.stop();
              }
            }
          }
        } catch (error) {
          console.error('Error handling navigation:', error);
        }
      }, 300);
    }
  
    private setupElementInteractionTracking(element: HTMLElement, interaction: any) {
      // Clean up previous listeners
      this.removeExistingListeners();
      
      if (!element || !interaction) return;
      
      if (this.options.debug) {
        console.log('Setting up interaction tracking for element:', element);
        console.log('Interaction data:', interaction);
      }
      
      // Store current interaction type
      this.currentInteractionType = interaction.action || 'click';
      
      // Create appropriate event listener based on interaction type
      const eventType = this.getEventTypeForInteraction(this.currentInteractionType || 'click');
      
      if (!eventType) {
        console.warn('Unknown interaction type:', this.currentInteractionType);
        return;
      }
      
      // Create handler
      this.currentListener = (event) => {
        console.log(`${eventType} event triggered:`, event);
        console.log('Target element:', event.target);
        
        // Validate interaction
        if (this.validateInteraction(event, interaction)) {
          console.log('Interaction validated successfully');
          
          // Get current step index
          const currentStep = this.recording?.steps?.[this.state.currentStep];
          const stepIndex = currentStep?.position || this.state.currentStep;
          
          console.log('Marking step completed:', stepIndex);
          
          // Mark step as completed
          this.completeStep(stepIndex);
          
          // If this is a link that will navigate, let the navigation happen
          // The handleNavigation method will pick up from there
          const isNavigationLink = 
            event.target instanceof HTMLAnchorElement && 
            event.target.href && 
            !event.target.getAttribute('target');
          
          if (isNavigationLink) {
            console.log('Navigation link detected, letting natural navigation occur');
            
            // Save state before navigation
            StateManager.save(this.state);
            
            // Clean up for navigation
            this.hideVisualElements();
            this.removeExistingListeners();
            
            // Don't call playNextStep, let the navigation handler take over
            return;
          }
          
          // Move to next step for non-navigation interactions
          console.log('Moving to next step...');
          this.playNextStep();
        } else {
          console.log('Interaction validation failed');
        }
      };
      
      // Add debugging for event listener
      console.log(`Adding ${eventType} listener to element:`, element);
      
      // TypeScript doesn't recognize that eventType can't be null here
      element.addEventListener(eventType as string, this.currentListener);
      
      if (this.options.debug) {
        console.log(`Set up ${eventType} listener for element:`, element);
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
            CursorFlowUI.showNotification({
              message: 'Incorrect click. Guide stopped.',
              type: 'error',
              autoClose: 5000
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
          this.currentTargetElement.removeEventListener(eventType as string, this.currentListener);
          
          if (this.options.debug) {
            console.log(`Removed ${eventType} listener from element:`, this.currentTargetElement);
          }
        }
      }
      
      // Reset tracking properties
      this.currentListener = null;
      this.currentInteractionType = null;
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
    private findNextStep(): any {
      if (!this.recording || !this.recording.steps || this.recording.steps.length === 0) {
        console.log('findNextStep: No recording or steps available');
        return null;
      }
      
      // Sort steps by position
      const sortedSteps = [...this.recording.steps].sort((a, b) => {
        return (a.position || 0) - (b.position || 0);
      });
      
      console.log('findNextStep: Looking for next step. Completed steps:', this.state.completedSteps);
      
      // Find first uncompleted step
      for (const step of sortedSteps) {
        const stepIndex = step.position || sortedSteps.indexOf(step);
        
        if (!this.state.completedSteps.includes(stepIndex)) {
          console.log('findNextStep: Found next uncompleted step:', {
            position: stepIndex,
            step
          });
          return step;
        }
      }
      
      console.log('findNextStep: All steps are completed');
      return null;
    }
  
    // Add a new method for guide completion
    private completeGuide() {
      if (this.options.debug) {
        console.log('Guide completed');
      }
      
      // Update state to completed
      this.state.isPlaying = false;
      StateManager.save(this.state);
      
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

    private completeStep(stepIndex: number) {
      // Don't add duplicates
      if (!this.state.completedSteps.includes(stepIndex)) {
        this.state.completedSteps.push(stepIndex);
        StateManager.save(this.state);
        
        if (this.options.debug) {
          console.log('Step completed:', stepIndex);
          console.log('Completed steps:', this.state.completedSteps);
        }
      }
    }

    private async playNextStep() {
      if (!this.state.isPlaying) return false;
      
      // Hide current visual elements first
      this.hideVisualElements();
      
      // Remove existing listeners
      this.removeExistingListeners();
      
      // Find the current step
      let currentStepIndex = this.state.currentStep;
      let currentStepPosition = 0;
      
      if (this.recording && this.recording.steps && this.recording.steps.length > 0) {
        // If this is position-based, get the current position
        if (this.recording.steps[0].position !== undefined) {
          const sortedSteps = [...this.recording.steps].sort((a, b) => {
            return (a.position || 0) - (b.position || 0);
          });
          
          // Find current step by index
          const currentStep = sortedSteps[currentStepIndex];
          if (currentStep) {
            currentStepPosition = currentStep.position;
          }
          
          // NEW: Ensure we get the immediate next step (not skipping any)
          let nextPosition = Number.MAX_SAFE_INTEGER;
          let nextStep = null;
          
          for (const step of sortedSteps) {
            const stepPos = step.position || 0;
            // Find the next position that's greater than current but smaller than any we've found so far
            if (stepPos > currentStepPosition && stepPos < nextPosition && 
                !this.state.completedSteps.includes(stepPos)) {
              nextPosition = stepPos;
              nextStep = step;
            }
          }
          
          if (nextStep) {
            // Update current step in state
            this.state.currentStep = sortedSteps.indexOf(nextStep);
            StateManager.save(this.state);
            
            // Play the new current step
            await this.playCurrentStep();
            return true;
          }
        } else {
          // Simple index-based navigation
          this.state.currentStep++;
          
          // Check if we're at the end
          if (this.state.currentStep >= this.recording.steps.length) {
            // Guide completed - call completeGuide instead of handling completion here
            this.completeGuide();
            return false;
          }
          
          StateManager.save(this.state);
          await this.playCurrentStep();
          return true;
        }
      }
      
      // If we get here, there are no more steps
      this.completeGuide();
      return false;
    }
  }