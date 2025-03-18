/**
 * Manages the state of the cursor flow
 */
export class StateManager {
  private static readonly STORAGE_KEY = 'cursor-flow-state';
  private static readonly STATE_VERSION = '1.0';
  private static readonly EXPIRY_TIME = 24 * 60 * 60 * 1000; // 24 hours

  /**
   * Save cursor flow state to local storage
   */
  static save(state: any): void {
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
      return;
    }

    try {
      // Log what we're saving
      console.log('STATE SAVE - Current state:', {
        isPlaying: state.isPlaying,
        currentStep: state.currentStep,
        recordingId: state.recordingId,
        hasCustomizations: !!state.customizations,
        customizationsLength: state.customizations?.length
      });

      // Only save serializable properties
      const stateToSave = {
        version: this.STATE_VERSION,
        timestamp: Date.now(),
        isPlaying: state.isPlaying,
        currentStep: state.currentStep,
        recordingId: state.recordingId,
        customizations: state.customizations // Save customizations
      };

      localStorage.setItem(this.STORAGE_KEY, JSON.stringify(stateToSave));
    } catch (error) {
      console.error('Failed to save state:', error);
    }
  }
  
  /**
   * Restore cursor flow state from local storage
   */
  static restore(): any | null {
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
      return null;
    }

    try {
      const stateString = localStorage.getItem(this.STORAGE_KEY);
      if (!stateString) {
        return null;
      }

      const state = JSON.parse(stateString);
      console.log('STATE RESTORE - Retrieved state:', state);
      
      // Validate state format and version
      if (!state || !state.version || state.version !== this.STATE_VERSION) {
        this.clear();
        return null;
      }
      
      // Check if state has expired
      if (Date.now() - state.timestamp > this.EXPIRY_TIME) {
        this.clear();
        return null;
      }

      // Log what we're returning
      const result = {
        isPlaying: state.isPlaying,
        currentStep: state.currentStep,
        recordingId: state.recordingId,
        customizations: state.customizations // Restore customizations
      };
      console.log('STATE RESTORE - Returning:', result);

      return result;
    } catch (error) {
      console.error('Failed to restore state:', error);
      this.clear();
      return null;
    }
  }

  /**
   * Clear cursor flow state from local storage
   */
  static clear(): void {
    if (typeof window === 'undefined' || typeof localStorage === 'undefined') {
      return;
    }

    try {
      localStorage.removeItem(this.STORAGE_KEY);
    } catch (error) {
      console.error('Failed to clear state:', error);
    }
  }

  /**
   * Check if there is a valid state in local storage
   */
  static hasValidState(): boolean {
    return this.restore() !== null;
  }

  /**
   * Get a specific property from the state
   */
  static getStateProperty<T>(key: string, defaultValue: T): T {
    const state = this.restore();
    if (!state || typeof state[key] === 'undefined') {
      return defaultValue;
    }
    return state[key];
  }
} 