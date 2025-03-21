export interface CursorFlowOptions {
    apiUrl: string;
    theme?: ThemeOptions;
    organizationId: string;
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