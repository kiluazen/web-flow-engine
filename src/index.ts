import { ApiClient } from './apiClient';
import CursorFlow from './cursorFlow';
import { CopilotModal } from './copilotModal';
import { OnboardingModal } from './onboardingChecklist';
import { FlowExecutionTracker } from './flowExecutionTracker';
import { CursorFlowOptions } from './types';

// Define the API URL constant - same as in cursorFlow.ts
const API_URL = 'https://hyphenbox-backend.onrender.com';
// const API_URL = 'http://localhost:8000';

// Export CursorFlow as the default export (for browser compatibility)
export default CursorFlow;

/**
 * Initialize the Hyphen SDK
 * This is the main entry point for the Hyphen SDK
 */
export function initialize(options: CursorFlowOptions): { 
  createCopilotButton: (container: HTMLElement, customClass?: string) => HTMLButtonElement,
  createOnboardingButton: (container: HTMLElement, customClass?: string) => HTMLButtonElement
} {
  // Ensure required options are provided
  if (!options.apiKey) {
    throw new Error('apiKey is required');
  }
  if (!options.userId) {
    throw new Error('userId is required');
  }

  // Apply defaults - apiUrl is no longer configurable
  const configuredOptions = {
    buttonText: 'Help & Guides',
    onboardingButtonText: 'Onboarding',
    debug: false,
    ...options,
    apiClient: new ApiClient(
      API_URL,
      options.apiKey, // Use options.apiKey directly
      options.userId // Use options.userId directly
    )
  };

  // Initialize CursorFlow with the shared apiClient instance
  const cursorFlow = new CursorFlow(configuredOptions);
  cursorFlow.init();

  // Initialize CopilotModal with callback to CursorFlow and the apiClient
  CopilotModal.init(
    configuredOptions.apiClient,
    (guideId: string) => {
      // Using any to access private method
      (cursorFlow as any).startGuideAfterSearch(guideId);
    },
    configuredOptions.theme || {}
  );

  // Initialize OnboardingModal with callback to CursorFlow and the apiClient
  OnboardingModal.init(
    configuredOptions.apiClient,
    (flowId: string) => {
      // Using any to access private method
      (cursorFlow as any).startGuideAfterSearch(flowId);
    },
    configuredOptions.theme || {}
  );

  // Return functions to create buttons
  return {
    createCopilotButton: (container: HTMLElement, customClass?: string) => {
      return CopilotModal.createCopilotButton(container, configuredOptions.buttonText, customClass);
    },
    createOnboardingButton: (container: HTMLElement, customClass?: string) => {
      return OnboardingModal.createOnboardingButton(container, configuredOptions.onboardingButtonText, customClass);
    }
  };
}

// Also export other components for advanced usage
export { ApiClient, CursorFlow, CopilotModal, OnboardingModal, FlowExecutionTracker };
export * from './types';

// Ensure CursorFlow is available on the window object for the extension
/*
if (typeof window !== 'undefined') {
  (window as any).CursorFlow = CursorFlow;
}
*/
