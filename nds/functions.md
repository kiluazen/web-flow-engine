# CursorFlow Architecture

## Core Components

### 1. Main Classes
- **CursorFlow**: Main entry point and controller for the entire flow system
- **StateManager**: Handles saving/loading state from localStorage
- **ApiClient**: Manages API calls to backend
- **ElementUtils**: Utilities for finding and interacting with DOM elements
- **CursorFlowUI**: Creates and manages UI components

### 2. State Management
- **CursorFlowState**: Interface defining the state structure
  - `isPlaying`: Whether a guide is currently running
  - `currentStep`: Current step index in the flow (legacy)
  - `currentPosition`: Current position value in the flow (new schema)
  - `recordingId`: ID of the current recording being played
  - `customizations`: Any custom modifications to the guide
  - `completedSteps`: Array tracking which steps have been completed
  - `timestamp`: When the state was last updated

## Function Responsibilities

### CursorFlow Class
- **constructor(options)**: Initialize with configuration options
  - Sets up API client, initializes empty state
  - Called when: Library is first instantiated

- **init()**: Initialize the flow system
  - Sets up event listeners, restores state if available
  - Checks sessionStorage to detect tab closure and resets isPlaying if needed
  - Called when: After instantiation, by client code

- **setupNavigationDetection()**: Monitor URL changes to handle navigation
  - Watches for URL changes to detect when context changes
  - Calls detectCurrentContext() when navigation occurs
  - Called when: During initialization

- **createVisualElements()**: Create cursor and highlight elements
  - Creates the visual indicators and stores references to them
  - Does not attach elements to DOM yet (showVisualElements does this)
  - Called when: A guide starts playing or system initializes

- **start()**: Start the flow system and show the guides selector
  - Enables the system, creates UI elements if needed
  - Sets sessionStorage flag to track active session
  - Called when: User wants to activate the guidance system

- **loadRecording(recordingId)**: Load a specific recording by ID
  - Fetches flow data from API, which now includes steps array
  - Maps position-based steps to the original step index system
  - Called when: User selects a specific guide or restored from state

- **startGuide(guideId)**: Begin a specific guide
  - Resets state, loads recording, starts from first step
  - Called when: User selects a guide from the menu

- **detectCurrentContext()**: Determine which step matches current page
  - Checks URL and page elements to match current context to a step
  - Handles back/forward navigation:
    - For back navigation: Shows the step again even if completed
    - For forward skipping: Shows notification to start from beginning
  - Called when: URL changes or guide state changes

- **playCurrentStep()**: Play the current step in the flow
  - Identifies target element from step's interaction data
  - Shows guidance using the step's annotation text
  - Sets up interaction tracking for the target element
  - Called when: Moving to a new step or after context detection

- **playNextStep()**: Advance to the next step in the flow
  - Finds next step by position value instead of simple incrementation
  - Plays the next step and saves state
  - Called when: User completes current step

- **completeStep(stepIndex)**: Mark a step as completed
  - Adds step to completedSteps array and saves state
  - Can use step index or position depending on implementation
  - Called when: User successfully completes a step's action

- **showVisualElements(targetElement, interaction)**: Show cursor and highlight on target
  - Takes stored element references and attaches them to DOM if needed
  - Positions visual elements on the target element
  - Called when: Displaying guidance for current step

- **hideVisualElements()**: Remove visual elements from DOM
  - Completely removes cursor and highlight elements using stored references
  - Ensures clean removal of all visual elements
  - Called when: Stopping a guide or navigating away

- **stop()**: Stop the current guide and clean up
  - Resets state, removes visual elements, clears storage
  - Called when: User clicks "Stop Guide" button

- **setupElementInteractionTracking(element, interaction)**: Monitor user interactions
  - Attaches appropriate event listeners based on interaction type (click, input, etc.)
  - Validates that user interactions match expected behavior from guide data
  - Cleans up previous listeners to prevent memory leaks
  - Called when: Playing a step that requires user interaction

- **validateInteraction(event, expectedInteraction)**: Verify user action
  - Compares event data with expected interaction from guide
  - Returns true only if interaction correctly matches what's expected
  - Called when: User interacts with target element

- **removeExistingListeners()**: Clean up event listeners
  - Removes any previously attached interaction listeners
  - Prevents memory leaks and duplicate event handling
  - Called when: Moving to a new step or stopping guide

- **handleInteractionError()**: Handle failed interaction tracking
  - Shows error notification when steps fail despite user following instructions
  - Provides options to retry, skip, or stop the guide
  - Called when: Interaction validation fails unexpectedly

### StateManager Class
- **save(state)**: Save state to localStorage
  - Serializes and stores current state with timestamp
  - Called when: State changes (step completion, guide start/stop)

- **restore()**: Load state from localStorage
  - Deserializes saved state data
  - Called when: System initializes

- **clear()**: Remove state from localStorage
  - Deletes saved state entirely
  - Called when: Guide is stopped or state becomes invalid

### ElementUtils Class
- **findElementFromInteraction(interaction)**: Find DOM element based on interaction data
  - Uses selectors and validation to find the right element
  - Called when: Showing guidance for a step

- **compareUrls(url1, url2)**: Compare URLs ignoring irrelevant differences
  - Normalizes and compares URLs for matching
  - Called when: Detecting current context

- **highlightElement(element)**: Apply highlight to DOM element
  - Adds highlight styling to target element
  - Called when: Showing guidance for current step

- **removeHighlight(element)**: Remove highlight from DOM element
  - Completely removes highlight effect
  - Called when: Moving to next step or stopping guide

### CursorFlowUI Class
- **createStartButton(text, color, onClick)**: Create the main UI button
  - Builds and styles the button element with 'hyphen-start-button' class
  - Called when: System initializes

- **createGuidesButton(text, color, onClick)**: Create the guides selector button
  - Builds and styles the guides menu button with 'hyphen-guides-button' class
  - Called when: System is started

- **showGuidesDropdown(guides, guideButton, onSelect)**: Display guide selection dropdown
  - Creates dropdown menu with available guides using 'hyphen-dropdown' class
  - Called when: User interacts with guides button

- **createCursor(theme)**: Create the cursor element
  - Builds the cursor DOM element with 'hyphen-cursor' class
  - Called when: Visual elements are created

- **createHighlight(theme)**: Create the highlight element
  - Builds the highlight DOM element with 'hyphen-highlight' class
  - Called when: Visual elements are created

- **moveCursorToElement(element, cursor, interaction)**: Position cursor at target
  - Calculates and sets cursor position
  - Called when: Showing guidance for current step

- **showNotification(options)**: Display a notification to the user
  - Creates and shows a notification element with 'hyphen-notification' class
  - Called when: Guiding user or handling navigation issues

- **showErrorNotification(message, options)**: Display error message
  - Shows specialized error message with retry/skip/stop options
  - Uses 'hyphen-error' class for styling
  - Called when: Steps fail despite user following instructions

## Flow Execution Process

1. **Initialization**:
   - `CursorFlow.constructor` → `CursorFlow.init` → `StateManager.restore`
   - Check sessionStorage to detect if tab was closed: `sessionStorage.getItem('guide-session-active')`
   - If tab was closed: Set `isPlaying = false` in restored state
   - If existing state and isPlaying: `CursorFlow.loadRecording`

2. **Starting a Guide**:
   - `CursorFlow.start` → `CursorFlowUI.createStartButton` → `CursorFlowUI.showGuidesDropdown`
   - Set session flag: `sessionStorage.setItem('guide-session-active', 'true')`
   - User selects guide → `CursorFlow.startGuide` → `CursorFlow.loadRecording` → `CursorFlow.playCurrentStep`

3. **Navigation Handling**:
   - URL changes → `CursorFlow.setupNavigationDetection` → `CursorFlow.detectCurrentContext`
   - Back navigation: Show previous step again (even if completed)
   - Forward skipping: Show notification to start from beginning if prerequisites not met

4. **Interaction Tracking**:
   - `CursorFlow.playCurrentStep` → `CursorFlow.setupElementInteractionTracking`
   - User interacts with element → `CursorFlow.validateInteraction`
   - If validation succeeds → `CursorFlow.completeStep` → `CursorFlow.playNextStep`
   - If validation fails unexpectedly → `CursorFlow.handleInteractionError`

5. **Stopping a Guide**:
   - User clicks stop → `CursorFlow.stop` → `CursorFlow.hideVisualElements` → `StateManager.clear`
   - Remove session flag: `sessionStorage.removeItem('guide-session-active')`

## Key Implementation Details

1. **Sequential Execution**:
   - Each step must be completed in order
   - Steps are ordered by position value (1000, 2000, 3000...) for flexibility
   - `completedSteps` array tracks which steps have been finished
   - Before playing a step, verify all previous steps are completed

2. **Visual Element Cleanup**:
   - Store direct references to cursor and highlight elements as class properties
   - `hideVisualElements` completely removes elements from DOM using these references
   - Ensure references are properly maintained through the lifecycle

3. **State Management**:
   - Use localStorage for persistent state across page loads
   - Use sessionStorage flag 'guide-session-active' to detect tab closure
   - Clear state on guide stop to prevent issues with restarting
   - Save state after each significant action (step completion, guide start)

4. **Navigation Handling**:
   - Support backward navigation by showing guidance for previous steps
   - Prevent forward skipping by checking completedSteps array
   - Show helpful notifications when user tries to skip steps

5. **Error Handling**:
   - Provide clear error messages when steps fail despite user following instructions
   - Offer options to retry the step, skip it, or stop the guide entirely
   - Log errors for debugging purposes

6. **Naming Conventions**:
   - All DOM elements created by the library use 'hyphen-' prefix in class names
   - Consistent naming helps avoid conflicts with host application styling
   - Examples: 'hyphen-cursor', 'hyphen-highlight', 'hyphen-notification'

7. **API Response Structure**:
   - Flow data now includes steps array directly
   - Each step has:
     - A unique id for tracking
     - A position value for ordering
     - Interaction data for element targeting
     - Annotation text for user instructions
   - Steps are ordered by position value, allowing for easy reordering

