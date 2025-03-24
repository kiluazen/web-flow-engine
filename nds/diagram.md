
┌────────────────┐     ┌────────────────┐     ┌────────────────┐
│   Application  │     │   CursorFlow   │     │  StateManager  │
│     (Client)   │     │   (Controller) │     │  (Persistence) │
└───────┬────────┘     └───────┬────────┘     └───────┬────────┘
        │                      │                      │
        │ new CursorFlow()     │                      │
        │────────────────────>│                      │
        │                      │                      │
        │ init()               │                      │
        │────────────────────>│                      │
        │                      │ restore()            │
        │                      │────────────────────>│
        │                      │                      │
        │                      │<─ ─ ─ ─ ─ ─ ─ ─ ─ ─ ┘
        │                      │    (state data)
        │                      │
        │ start()              │                      │
        │────────────────────>│                      │
        │                      │                      │
        │<─ ─UI Elements─ ─ ─ ┤                      │
        │                      │                      │
        │ [User selects guide] │                      │
        │────────────────────>│                      │
        │                      │                      │
        │                      │ startGuide()         │
        │                      │◄──────────────────┐ │
        │                      │                  │ │
        │                      │ loadRecording()  │ │
        │                      │◄────────────────┐│ │
        │                      │                ││ │
        │                      │ playCurrentStep││ │
        │                      │◄──────────────┐│││
        │                      │              ││││
        │                      │              ││││




playCurrentStep
    │
    ▼
findElementFromInteraction
    │
    ▼
showVisualElements
    │
    ▼
setupElementInteractionTracking
    │
    ▼
[User interacts with element]
    │
    ▼
validateInteraction
    │
    ▼
completeStep
    │
    ▼
save state
    │
    ▼
playNextStep
    │
    ▼
[Loop repeats]






URL changes
    │
    ▼
setupNavigationDetection detects change
    │
    ▼
detectCurrentContext
    │
    ┌─────────────────┴───────────────────┐
    ▼                                     ▼
[Back navigation detected]         [Forward skip detected]
    │                                     │
    ▼                                     ▼
Play previous step again           Show warning notification





User interaction
    │
    ▼
validateInteraction
    │
    ┌──────────────┴──────────────┐
    ▼                             ▼
[Validation passes]        [Validation fails]
    │                             │
    ▼                             ▼
completeStep               handleInteractionError
                                  │
                                  ▼
                           showErrorNotification
                                  │
                          ┌───────┼───────┐
                          ▼       ▼       ▼
                      [Retry]  [Skip]  [Stop]