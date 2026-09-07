/**
 * Application State Management Context
 * Centralizes all app state to avoid prop drilling
 */

import React, { createContext, useContext, useState, useCallback } from 'react';

const AppContext = createContext(undefined);

export const useAppContext = () => {
  const context = useContext(AppContext);
  if (!context) {
    throw new Error('useAppContext must be used within AppProvider');
  }
  return context;
};

export const AppProvider = ({ children }) => {
  const [analysis, setAnalysisState] = useState({
    repoUrl: '',
    analyzing: false,
    analyzeStage: '',
    analyzePct: 0,
    graphData: null,
    loading: true,
    selectedNode: null,
    backendStatus: 'connecting',
    analysisSnapshot: null,
    error: null,
  });

  const [repair, setRepairState] = useState({
    repairData: null,
    loadingRepair: false,
    repairPanelOpen: false,
    applyingPatch: false,
    applyResult: null,
    fixingNode: false,
    fixResult: null,
  });

  const [ui, setUIState] = useState({
    viewMode: 'graph',
    showFullGraph: false,
    csAxisMode: 'collapsed',
    graphSearch: '',
    isDemo: false,
    showMascot: false,
  });

  const [simulation, setSimulationState] = useState({
    simulationResult: null,
    simulating: false,
  });

  // Batch update functions
  const setAnalysis = useCallback((updates) => {
    setAnalysisState((prev) => ({ ...prev, ...updates }));
  }, []);

  const setRepair = useCallback((updates) => {
    setRepairState((prev) => ({ ...prev, ...updates }));
  }, []);

  const setUI = useCallback((updates) => {
    setUIState((prev) => ({ ...prev, ...updates }));
  }, []);

  const setSimulation = useCallback((updates) => {
    setSimulationState((prev) => ({ ...prev, ...updates }));
  }, []);

  // Action callbacks
  const startAnalysis = useCallback((repoUrl) => {
    setAnalysis({
      repoUrl,
      analyzing: true,
      analyzeStage: 'initializing',
      analyzePct: 0,
      error: null,
      graphData: null,
    });
  }, [setAnalysis]);

  const finishAnalysis = useCallback((graphData) => {
    setAnalysis({
      analyzing: false,
      analyzeStage: 'complete',
      analyzePct: 100,
      graphData,
      error: null,
    });
  }, [setAnalysis]);

  const failAnalysis = useCallback((error) => {
    setAnalysis({
      analyzing: false,
      analyzeStage: 'failed',
      error,
      graphData: null,
    });
  }, [setAnalysis]);

  const clearAnalysis = useCallback(() => {
    setAnalysis({
      repoUrl: '',
      analyzing: false,
      analyzeStage: '',
      analyzePct: 0,
      graphData: null,
      selectedNode: null,
      error: null,
    });
  }, [setAnalysis]);

  const startRepair = useCallback(() => {
    setRepair({
      loadingRepair: true,
      applyResult: null,
    });
  }, [setRepair]);

  const finishRepair = useCallback((repairData) => {
    setRepair({
      repairData,
      loadingRepair: false,
      repairPanelOpen: true,
    });
  }, [setRepair]);

  const failRepair = useCallback((error) => {
    setRepair({
      loadingRepair: false,
      applyResult: {
        status: 'REPAIR FAILED',
        message: error,
      },
    });
  }, [setRepair]);

  const value = {
    analysis,
    setAnalysis,
    repair,
    setRepair,
    ui,
    setUI,
    simulation,
    setSimulation,
    startAnalysis,
    finishAnalysis,
    failAnalysis,
    clearAnalysis,
    startRepair,
    finishRepair,
    failRepair,
  };

  return <AppContext.Provider value={value}>{children}</AppContext.Provider>;
};
