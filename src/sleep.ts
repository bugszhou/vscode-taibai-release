export default function sleep(time: number, cb?: () => any): Promise<any> {
  return new Promise((resolve) => {
    const id = setTimeout(() => {
      resolve(id);
      cb?.();
    }, time);
  });
}
