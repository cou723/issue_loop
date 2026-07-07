// dynamic workflow ランタイムが実行時に注入するグローバル。
// check.mjs での静的チェック用の宣言であり、実行環境には存在しない。

declare function agent(
  prompt: string,
  options?: {
    label?: string
    model?: string
    schema?: Record<string, unknown>
  },
): Promise<any>

declare function pipeline<T, R>(items: T[], fn: (item: T) => Promise<R>): Promise<R[]>
declare function parallel<T>(tasks: Array<() => Promise<T>>): Promise<T[]>
declare function phase<T>(name: string, fn: () => Promise<T>): Promise<T>
declare const args: any
