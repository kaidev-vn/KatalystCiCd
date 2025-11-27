export interface BuildContext {
  job: any;
  repoPath: string;
  commitHash: string;
  jobBuilderDir: string;
  buildLogsDir: string;
  env?: any;
}

export interface HistoryManager {
  addHistory(record: any): void;
  updateHistory(buildId: string, updates: any): void;
}

export interface IBuildStrategy {
  execute(context: BuildContext, historyManager: HistoryManager): Promise<any>;
}

