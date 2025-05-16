export interface CursorFlowOptions {
    apiUrl?: string;
    theme?: ThemeOptions;
    apiKey: string;
    buttonText?: string;
    guidesButtonText?: string;
    debug?: boolean;
  }
  
  export interface CursorFlowState {
    isPlaying: boolean;
    currentStep: number;
    currentPosition?: number;
    recordingId: string | null;
    customizations?: any[];
    completedSteps: number[];
    timestamp: number;
    debug?: boolean;
  }
  
  export interface ThemeOptions {
    cursorColor?: string;
    highlightColor?: string;
    highlightBorderColor?: string;
    buttonColor?: string;
  }
  
  export interface NotificationOptions {
    title?: string;
    message: string;
    type: 'info' | 'warning' | 'success' | 'error';
    autoClose?: number;
    buttons?: Array<{
      text: string;
      onClick: () => void;
      primary?: boolean;
    }>;
  }
  
  export interface ErrorNotificationOptions extends NotificationOptions {
    onRetry?: () => void;
    onSkip?: () => void;
    onStop?: () => void;
  }

export interface ElementData {
  tagName?: string;
  id?: string | null;
  textContent?: string;
  cssSelector?: string;
  path?: string[]; 
  attributes?: string | { [key: string]: string };
}

export interface PageInfo {
  url?: string;
  path?: string;
  title?: string;
}

export interface InteractionData {
  element?: ElementData;
  text?: string;                // Annotation text or target text for an element
  action?: string;              // e.g., 'click', 'input', 'type'
  pageInfo?: PageInfo;
  isHighlightStep?: boolean;    // True if the step is a non-interactive highlight
  value?: string;               // Expected value for input fields, for validation
  // Potentially other fields derived from step_data in the backend
  annotation?: string; // This seems to be what backend provides for text
  // cssSelector can also be at the top level of interaction from backend
  cssSelector?: string;
  // interaction object from backend might also have id, position, etc.
  // but those are usually on the step level itself, not inside interaction property.
}