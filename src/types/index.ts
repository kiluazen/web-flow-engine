export interface Interaction {
  type: string;
  timestamp: string;
  timeOffset: number | null;
  pageInfo: {
    url: string;
    path: string;
    title: string;
  };
  element: {
    tagName: string;
    id: string | null;
    textContent: string;
    cssSelector: string;
    path: string[];
  };
  position: {
    x: number;
    y: number;
  };
  elementRect: {
    top: number;
    left: number;
    width: number;
    height: number;
  };
  customText?: string;
}

export interface RecordingData {
  id: string;
  startTime: string;
  lastUpdated: string;
  interactions: Interaction[];
}

export interface Recording {
  recording: RecordingData;
}

export interface Customization {
  stepIndex: number;
  popupText: string;
  isHidden: boolean;
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

export interface ThemeOptions {
  cursorColor?: string;
  highlightColor?: string;
  highlightBorderColor?: string;
  buttonColor?: string;
}

export interface CursorFlowOptions {
  apiUrl: string;
  recordingId: string;
  theme?: ThemeOptions;
  autoProgress?: boolean;
  autoProgressDelay?: number;
}

export interface CursorFlowState {
  isPlaying: boolean;
  currentStep: number;
  recording: Recording | null;
  cursor: HTMLElement | null;
  highlight: HTMLElement | null;
  startButton: HTMLElement | null;
  targetElement: HTMLElement | null;
  navigationInProgress: boolean;
  recordingId?: string;
  customizations?: Customization[];
} 