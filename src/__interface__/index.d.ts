export interface ITask {
  title: string;
  varData: {
    dir: string;
  };
  tasks: { title: string; cmd: string }[];
}
