export = go


declare function go(f: (...args) => any, ...args): go.Future<any>


declare namespace go {
    export class Future<T> implements Promise<T> {
        done(err?: Error | null, val?: T): void

        abort(): void

        get(cb: (err?: Error, val?: T) => void): void

        readonly ready: boolean
        readonly error?: Error | null
        readonly value?: T

        onabort?: () => void

        then<TResult1 = T, TResult2 = never>(onfulfilled?: (value: T) => TResult1 | PromiseLike<TResult1>, onrejected?: (reason: any) => TResult2 | PromiseLike<TResult2>): Promise<TResult1 | TResult2>

        catch<TResult = never>(onrejected?: (reason: any) => TResult | PromiseLike<TResult>): Promise<T | TResult>

        [Symbol.toStringTag]: string;
    }
}