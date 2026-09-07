# Frontend Component Architecture

## Overview

The refactored frontend uses a modular component structure with centralized state management using React Context API. This eliminates prop drilling and makes the codebase more maintainable.

## Core Components

### 1. **AppProvider** (`context/AppContext.jsx`)
Central state management container for the entire application.

**State Management:**
- `analysis` - Repository analysis state (url, progress, results, errors)
- `repair` - Repair/patch application state
- `ui` - UI state (view mode, search, settings)
- `simulation` - Simulation state

**Actions:**
- `startAnalysis(repoUrl, bugInput)` - Initiate analysis
- `finishAnalysis(graphData)` - Complete analysis
- `failAnalysis(error)` - Handle analysis failure
- `clearAnalysis()` - Reset analysis state
- `startRepair()` - Begin repair process
- `finishRepair(data)` - Complete repair
- `failRepair(error)` - Handle repair failure

**Usage:**
```jsx
import { AppProvider, useAppContext } from './context/AppContext';

function App() {
  return (
    <AppProvider>
      <YourApp />
    </AppProvider>
  );
}

function MyComponent() {
  const { analysis, startAnalysis } = useAppContext();
  // Use state and actions
}
```

### 2. **AnalysisPanel** (`components/AnalysisPanel.jsx`)
Handles repository URL input and analysis configuration.

**Features:**
- Repository URL validation
- Bug input type selection (fullScan, stackTrace, description, testFailure)
- Input content editor
- Error display
- Progress tracking
- Backend connection status

**Props:** None (uses AppContext)

**Example:**
```jsx
<AnalysisPanel />
```

### 3. **GraphViewer** (`components/GraphViewer.jsx`)
Displays the interactive React Flow graph visualization.

**Features:**
- React Flow graph rendering
- Automatic layout
- Mini-map
- Pan/zoom controls
- Blast radius vs full graph toggle
- Node type visualization (impacted, affected, context)

**Dependencies:**
- `toReactFlowGraph()` - Converts API data to React Flow format
- `layoutGraph()` - Applies force-directed layout
- `CrossSectionNode` - Custom node component

**Example:**
```jsx
<GraphViewer />
```

### 4. **SearchPanel** (`components/SearchPanel.jsx`)
Provides graph search and filtering.

**Features:**
- Full-text search across files, functions, and code
- Result highlighting
- Result navigation
- Clear button

**Example:**
```jsx
<SearchPanel />
```

### 5. **ResultsPanel** (`components/ResultsPanel.jsx`)
Displays analysis results and statistics.

**Features:**
- Bug count and affected file count
- Impacted file listing
- Code snippets preview
- Export to JSON/Markdown
- Repair triggering (future)

**Example:**
```jsx
<ResultsPanel />
```

## Integration Pattern

### Before Refactoring (Monolith)
```
App.jsx (2388 lines)
├── State management (many useState)
├── Analysis logic
├── Graph rendering
├── Repair handling
├── UI controls
└── Export functionality
```

### After Refactoring (Modular)
```
AppProvider (Context)
├── state: analysis, repair, ui, simulation
└── actions: startAnalysis, finishAnalysis, etc.

App.jsx (Main layout)
├── AnalysisPanel (Input handling)
├── SearchPanel (Graph search)
├── GraphViewer (React Flow)
├── ResultsPanel (Results display)
└── PipelineScene3D (3D visualization)
```

## State Flow

```
User Input (AnalysisPanel)
    ↓
startAnalysis() → analysis.analyzing = true
    ↓
Backend API Call
    ↓
SSE Stream Events
    ↓
setAnalysis() → updates progress
    ↓
finishAnalysis() → analysis.graphData set
    ↓
GraphViewer renders new graph
    ↓
SearchPanel indexes data
    ↓
ResultsPanel displays results
```

## Hook Usage

All components use the `useAppContext()` hook to access centralized state:

```jsx
const {
  // State objects
  analysis,
  repair,
  ui,
  simulation,

  // Batch setters
  setAnalysis,
  setRepair,
  setUI,
  setSimulation,

  // Action callbacks
  startAnalysis,
  finishAnalysis,
  failAnalysis,
  clearAnalysis,
  startRepair,
  finishRepair,
  failRepair,
} = useAppContext();
```

## File Structure

```
client/src/
├── components/
│   ├── AnalysisPanel.jsx      ← Input & configuration
│   ├── GraphViewer.jsx         ← React Flow visualization
│   ├── SearchPanel.jsx         ← Search & filtering
│   ├── ResultsPanel.jsx        ← Results display
│   ├── CrossSectionNode.jsx    ← Existing custom node
│   ├── PipelineScene3D.jsx     ← Existing 3D visualization
│   └── ParticleWave.jsx        ← Existing particle effects
├── context/
│   └── AppContext.jsx          ← ✨ NEW: Central state
├── lib/
│   ├── layoutGraph.ts
│   ├── toReactFlowGraph.ts
│   └── exportReport.js
├── pages/
│   └── [future: page components]
└── App.jsx                      ← ✨ SIMPLIFIED: Layout only
```

## Migration Checklist

- [x] Create AppContext with state management
- [x] Extract AnalysisPanel
- [x] Extract GraphViewer  
- [x] Extract SearchPanel
- [x] Extract ResultsPanel
- [ ] Update App.jsx to use new components
- [ ] Update PipelineScene3D integration
- [ ] Add RepairFlow component
- [ ] Add unit tests for each component
- [ ] Performance optimization (useMemo, useCallback)

## Performance Optimizations

Each component uses:
- `useMemo()` for expensive computations
- `useCallback()` for stable function references
- Context selectors (future enhancement) to prevent unnecessary re-renders

## Future Improvements

1. **Component Composition:** Stack components as panels that can be toggled
2. **Storybook:** Add component stories for isolated testing
3. **Error Boundaries:** Wrap components with error boundaries
4. **Lazy Loading:** Use React.lazy() for 3D components
5. **Zustand/Redux:** Consider state library if complexity grows
6. **Testing:** Add Jest + React Testing Library tests

## Debugging

Enable React DevTools and use the Context tab to inspect:
- Current state values
- Which components are consuming context
- Re-render performance

## Related Files

- Error Handling: `server/middleware/errorHandler.js`
- Validation: `server/middleware/validation.js`
- API Types: `repo-analysis-service/src/schemas/analyzeRequest.ts`
