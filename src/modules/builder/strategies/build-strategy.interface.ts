export interface BranchConfig {
  name: string;
  tagPrefix?: string;
  enabled?: boolean;
}

export interface BuildContext {
  job: any;
  repoPath: string;
  commitHash: string;
  jobBuilderDir: string;
  buildLogsDir: string;
  env?: any;
  branchConfig?: BranchConfig;
}

export interface HistoryManager {
  addHistory(record: any): void;
  updateHistory(buildId: string, updates: any): void;
}

export interface IBuildStrategy {
  execute(context: BuildContext, historyManager: HistoryManager): Promise<any>;
}

