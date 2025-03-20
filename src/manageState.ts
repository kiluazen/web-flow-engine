import { CursorFlowState } from './types';

export class StateManager {
    // Constants
    private static readonly STORAGE_KEY = 'cursor-flow-state';
    private static readonly SESSION_KEY = 'guide-session-active';
    private static readonly STATE_VERSION = '1.0';
    private static readonly EXPIRY_TIME = 24 * 60 * 60 * 1000; // 24 hours
  
    static save(state: CursorFlowState): void {
      try {
        if (!state) {
          console.error('Cannot save null state');
          return;
        }
        
        const stateWithMeta = {
          ...state,
          version: this.STATE_VERSION,
          timestamp: Date.now()
        };
        
        const stateString = JSON.stringify(stateWithMeta);
        localStorage.setItem(this.STORAGE_KEY, stateString);
        console.log('State saved:', stateString);
      } catch (error) {
        console.error('Failed to save state:', error);
      }
    }
  
    static restore(): CursorFlowState | null {
      try {
        const savedState = localStorage.getItem(this.STORAGE_KEY);
        if (!savedState) {
          console.log('No state found in storage.');
          return null;
        }
  
        const state = JSON.parse(savedState);
        console.log('Retrieved state from storage:', state);
        
        // Validate version
        if (state.version !== this.STATE_VERSION) {
          console.log('State version mismatch, clearing state');
          this.clear();
          return null;
        }
  
        // Check expiry
        if (Date.now() - state.timestamp > this.EXPIRY_TIME) {
          console.log('State expired, clearing state');
          this.clear();
          return null;
        }
  
        // Safety check for completedSteps
        if (!state.completedSteps || !Array.isArray(state.completedSteps)) {
          state.completedSteps = [];
        }
  
        // Remove metadata before returning
        const { version, ...cleanState } = state;
        return cleanState;
      } catch (error) {
        console.error('Failed to restore state:', error);
        return null;
      }
    }
  
    static clear(): void {
      try {
        localStorage.removeItem(this.STORAGE_KEY);
      } catch (error) {
        console.error('Failed to clear state:', error);
      }
    }
  
    static setSessionActive(): void {
      try {
        sessionStorage.setItem(this.SESSION_KEY, 'true');
      } catch (error) {
        console.error('Failed to set session active:', error);
      }
    }
  
    static isSessionActive(): boolean {
      return sessionStorage.getItem(this.SESSION_KEY) === 'true';
    }
  
    static clearSession(): void {
      try {
        sessionStorage.removeItem(this.SESSION_KEY);
      } catch (error) {
        console.error('Failed to clear session:', error);
      }
    }
  }