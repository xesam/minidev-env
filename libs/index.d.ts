type EnvValue = any;

/**
 * 某个已注册环境的访问器。
 * - 不传参数：返回该环境的全部参数对象（含从依赖环境继承而来的有效视图）。
 * - 传 key：返回该环境下的某个参数（命中自身，否则沿依赖链回退）。
 * - 传 key + value：为该环境设置参数（仅写入自身，不影响依赖环境），返回 env 本身以支持链式调用。
 */
interface EnvAccessor {
    (): Record<string, EnvValue>;
    (key: string): EnvValue;
    (key: string, value: EnvValue): Env;
}

interface MiniProgramInfo {
    envVersion: 'develop' | 'trial' | 'release' | string;
    appId: string;
    version: string;
    release: string;
    [key: string]: any;
}

/**
 * `@mini-dev/env` 默认导出的环境配置实例。
 *
 * 预置 develop / trial / release 三个环境，可通过 `register` 增加自定义环境。
 * 每个已注册环境都会在实例上挂一个同名的访问器方法（如 `env.develop`、`env.trial`），
 * 也可统一通过 `get` / `set` 配合 `envName` 使用。
 */
interface Env {
    /** 当前环境标识，默认取自 wx.getAccountInfoSync().miniProgram.envVersion，可被启动参 ?env= 覆盖，也可手动赋值。 */
    current: string;
    /** wx.getAccountInfoSync() 返回的 miniProgram 信息。 */
    readonly miniProgram: MiniProgramInfo;
    /** wx.getAccountInfoSync() 返回的 plugin 信息（非插件场景为空对象）。 */
    readonly plugin: { [key: string]: any };
    /** 注册一个新的自定义环境，并在实例上挂载同名访问器方法。可选声明其依赖的环境（用于读取回退）。 */
    register(envName: string, deps?: string | string[]): Env;
    /**
     * 声明 envName 依赖若干个其它环境：读取 envName 的某个 key 时，若 envName 自身未命中，
     * 则按 deps 顺序依次回退查找。写入永远只落到 envName 自身。依赖环境可后注册（前向引用）。
     * @param deps 被依赖的环境名，支持数组或单个字符串。
     */
    dependsOn(envName: string, deps: string | string[]): Env;
    /** 返回当前环境的全部参数对象（含从依赖环境继承而来的有效视图）。 */
    get(): Record<string, EnvValue>;
    /** 返回指定环境下某个参数的值。 */
    get(key: string, envName?: string): EnvValue;
    /** 为指定环境设置参数，返回 env 本身以支持链式调用。 */
    set(key: string, value: EnvValue, envName?: string): Env;
    /** 将 env 挂载到指定 host 对象上；host 为空时挂到 globalThis。 */
    mount(host?: object, key?: string): void;
    /** develop 环境访问器。 */
    develop: EnvAccessor;
    /** trial 环境访问器。 */
    trial: EnvAccessor;
    /** release 环境访问器。 */
    release: EnvAccessor;
    /** 通过 register 注册的自定义环境访问器。 */
    [envName: string]: any;
}

declare const env: Env;
export = env;
