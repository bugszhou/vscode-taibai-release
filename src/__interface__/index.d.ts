export interface ITask {
  title: string;
  varData: {
    dir?: string;
    cli?: string;
    summary?: string;
  };
  tasks: { title: string; cmd: string }[];
}
