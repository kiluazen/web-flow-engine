export interface CursorFlowOptions {
    theme?: ThemeOptions;
    apiKey: string;
    buttonText?: string;
    guidesButtonText?: string;
    debug?: boolean;
    userId: string;
    onboardingButtonText?: string;
    apiClient?: any; // Allow passing an ApiClient instance
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
    executionId?: string;
  }
  
  export interface ThemeOptions {
    cursorColor?: string;
    highlightColor?: string;
    highlightBorderColor?: string;
    buttonColor?: string;
    brand_color?: string;
    cursor_company_label?: string | null;
    logo_url?: string | null;
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

  export interface RedirectNotificationOptions extends NotificationOptions {
    redirectUrl: string;
    redirectText?: string;
  }

  export type NotificationType = 'warning' | 'info' | 'success' | 'error';
  export interface StopNotificationOptions {
    message: string;
    type: NotificationType;
    autoClose?: number;
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

// Onboarding Checklist Types
export interface OnboardingFlow {
  flow_id: string;
  flow_name: string;
  flow_description?: string;
  position: number;
  is_completed_by_user: boolean;
}

export interface OnboardingChecklist {
  id: string;
  name: string;
  title_text: string;
  is_active: boolean;
  flows: OnboardingFlow[];
  appearance_settings?: {
    description?: string;
    logo_url?: string;
    // Other appearance settings could be added in the future
  };
}

// Flow Execution Types
export interface FlowExecution {
  id: string;
  flow_id: string;
  status: 'started' | 'in_progress' | 'completed' | string;
  started_at: string;
  completed_at?: string;
  last_activity_at: string;
  last_successful_step_id?: string;
  last_successful_step_position?: number;
  failure_reason_details?: string;
}