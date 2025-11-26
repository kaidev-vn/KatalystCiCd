// Central app state shared across modules
export const state = {
  CURRENT_CFG: null,
  buildHistory: [],
  selectedBuildId: null,
  jobs: [],
  editingJobId: null,
  buildsPagination: { currentPage: 1, itemsPerPage: 5 },
  queueStatus: { queue: [], running: [], completed: [], failed: [] },
  queueStats: {},
  queueProcessing: true,
  es: null,
};