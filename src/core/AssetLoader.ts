export class AssetLoader {
  private finished = 0;
  constructor(
    private total: number,
    private progress: (n: number, label: string) => void,
  ) {}
  async load<T>(label: string, task: () => Promise<T>): Promise<T> {
    this.progress((this.finished / this.total) * 100, label);
    const result = await task();
    this.finished++;
    this.progress((this.finished / this.total) * 100, label);
    return result;
  }
}
