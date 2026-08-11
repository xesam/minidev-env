/**
 * @mini-dev/env 单元测试
 *
 * 由于模块在 require 时会调用 wx.getAccountInfoSync()，因此每个用例都通过 loadEnv()
 * 重新设置 global.wx 并重置模块缓存后重新引入，确保各用例互不影响。
 */

function loadEnv({ envVersion = 'develop', query = {} } = {}) {
    jest.resetModules();
    global.wx = {
        getAccountInfoSync: () => ({
            miniProgram: { envVersion, appId: 'wx-test' },
            plugin: {}
        }),
        getLaunchOptionsSync: () => ({ query })
    };
    return require('../libs/index.js');
}

describe('@mini-dev/env', () => {
    afterEach(() => {
        delete global.wx;
        delete globalThis.theEnv;
        jest.resetModules();
    });

    test('current 默认取自 getAccountInfoSync 的 envVersion', () => {
        const env = loadEnv({ envVersion: 'trial' });
        expect(env.current).toBe('trial');
    });

    test('启动参 ?env= 覆盖 current', () => {
        const env = loadEnv({ envVersion: 'develop', query: { env: 'release' } });
        expect(env.current).toBe('release');
    });

    test('手动设置 current 优先于启动参覆盖', () => {
        const env = loadEnv({ envVersion: 'develop', query: { env: 'release' } });
        env.current = 'develop';
        expect(env.current).toBe('develop');
    });

    test('启动参惰性解析：仅 require 不读取 current 时不会调用 getLaunchOptionsSync', () => {
        let called = false;
        jest.resetModules();
        global.wx = {
            getAccountInfoSync: () => ({ miniProgram: { envVersion: 'develop' }, plugin: {} }),
            getLaunchOptionsSync: () => {
                called = true;
                return { query: { env: 'release' } };
            }
        };
        const env = require('../libs/index.js'); // eslint-disable-line @typescript-eslint/no-var-requires
        expect(called).toBe(false);
        expect(env.current).toBe('release'); // 首次访问 current 才触发
        expect(called).toBe(true);
    });

    test('getLaunchOptionsSync 仅解析一次', () => {
        let called = 0;
        jest.resetModules();
        global.wx = {
            getAccountInfoSync: () => ({ miniProgram: { envVersion: 'develop' }, plugin: {} }),
            getLaunchOptionsSync: () => {
                called += 1;
                return { query: { env: 'trial' } };
            }
        };
        const env = require('../libs/index.js');
        env.current;
        env.current;
        env.current;
        expect(called).toBe(1);
    });

    test('通过同名访问器按环境存取参数', () => {
        const env = loadEnv();
        env.develop('baseUrl', 'https://dev.api.demo.com');
        env.develop('debug', false);
        expect(env.develop()).toEqual({ baseUrl: 'https://dev.api.demo.com', debug: false });
        expect(env.develop('baseUrl')).toBe('https://dev.api.demo.com');
        expect(env.develop('debug')).toBe(false);
    });

    test('不同环境的参数相互隔离', () => {
        const env = loadEnv();
        env.develop('baseUrl', 'https://dev.api.demo.com');
        env.trial('baseUrl', 'https://trial.api.demo.com');
        env.release('baseUrl', 'https://api.demo.com');
        expect(env.get('baseUrl', 'develop')).toBe('https://dev.api.demo.com');
        expect(env.get('baseUrl', 'trial')).toBe('https://trial.api.demo.com');
        expect(env.get('baseUrl', 'release')).toBe('https://api.demo.com');
    });

    test('set / get 显式指定环境', () => {
        const env = loadEnv({ envVersion: 'release' });
        env.set('baseUrl', 'https://new_api.demo.com', 'release');
        expect(env.get('baseUrl', 'release')).toBe('https://new_api.demo.com');
    });

    test('get() 返回当前环境的全部参数对象', () => {
        const env = loadEnv({ envVersion: 'develop' });
        env.set('a', 1);
        env.set('b', 2);
        expect(env.get()).toEqual({ a: 1, b: 2 });
    });

    test('set 返回 env 本身以支持链式调用', () => {
        const env = loadEnv();
        expect(env.set('a', 1)).toBe(env);
    });

    test('register 注册自定义环境', () => {
        const env = loadEnv();
        env.register('stage');
        env.stage('baseUrl', 'https://stage.demo.com');
        expect(env.get('baseUrl', 'stage')).toBe('https://stage.demo.com');
        expect(env.stage('baseUrl')).toBe('https://stage.demo.com');
    });

    test('register 重复注册会告警且不覆盖已有数据', () => {
        const env = loadEnv();
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
        env.register('stage');
        env.stage('x', 1);
        env.register('stage');
        expect(warn).toHaveBeenCalled();
        expect(env.stage('x')).toBe(1);
        warn.mockRestore();
    });

    test('get/set 访问未注册环境抛出可读错误', () => {
        const env = loadEnv();
        expect(() => env.get('baseUrl', 'ghost')).toThrow(/not registered/);
        expect(() => env.set('baseUrl', 'x', 'ghost')).toThrow(/not registered/);
    });

    test('mount 挂载到指定 host 对象', () => {
        const env = loadEnv();
        const host = {};
        env.mount(host);
        expect(host.env).toBe(env);
        host.env.set('a', 1);
        expect(host.env.get('a')).toBe(1);
    });

    test('mount 以自定义名称挂载到 globalThis', () => {
        const env = loadEnv();
        env.mount(undefined, 'theEnv');
        expect(globalThis.theEnv).toBe(env);
    });

    test('暴露 miniProgram 与 plugin', () => {
        const env = loadEnv({ envVersion: 'develop' });
        expect(env.miniProgram.envVersion).toBe('develop');
        expect(env.plugin).toEqual({});
    });

    // -------- 环境依赖（fallback） --------

    test('dependsOn：自身未命中时回退到依赖环境', () => {
        const env = loadEnv();
        env.release('baseUrl', 'https://api.demo.com');
        env.dependsOn('develop', ['release']);
        expect(env.develop('baseUrl')).toBe('https://api.demo.com');
        expect(env.get('baseUrl', 'develop')).toBe('https://api.demo.com');
    });

    test('dependsOn 接受单个字符串作为依赖', () => {
        const env = loadEnv();
        env.release('baseUrl', 'https://api.demo.com');
        env.dependsOn('develop', 'release');
        expect(env.develop('baseUrl')).toBe('https://api.demo.com');
    });

    test('自身命中优先于依赖环境', () => {
        const env = loadEnv();
        env.release('baseUrl', 'https://api.demo.com');
        env.develop('baseUrl', 'https://dev.api.demo.com');
        env.dependsOn('develop', ['release']);
        expect(env.develop('baseUrl')).toBe('https://dev.api.demo.com');
    });

    test('写入只落到目标环境，不污染被依赖的环境', () => {
        const env = loadEnv();
        env.dependsOn('develop', ['release']);
        env.develop('baseUrl', 'https://dev.api.demo.com');
        expect(env.release('baseUrl')).toBeUndefined();
        expect(env.develop('baseUrl')).toBe('https://dev.api.demo.com');
    });

    test('多级依赖链回退', () => {
        const env = loadEnv();
        env.register('stage');
        env.release('baseUrl', 'https://api.demo.com');
        env.dependsOn('stage', ['release']);
        env.dependsOn('develop', ['stage']);
        // develop -> stage -> release
        expect(env.develop('baseUrl')).toBe('https://api.demo.com');
    });

    test('多个依赖按声明顺序优先', () => {
        const env = loadEnv();
        env.release('baseUrl', 'https://api.demo.com');
        env.trial('baseUrl', 'https://trial.api.demo.com');
        env.dependsOn('develop', ['release', 'trial']);
        // release 在前，优先命中
        expect(env.develop('baseUrl')).toBe('https://api.demo.com');
    });

    test('环形依赖不会无限递归', () => {
        const env = loadEnv();
        env.develop('a', 1);
        env.release('b', 2);
        env.dependsOn('develop', ['release']);
        env.dependsOn('release', ['develop']);
        expect(env.develop('a')).toBe(1);
        expect(env.develop('b')).toBe(2);
        expect(env.develop('missing')).toBeUndefined();
    });

    test('依赖未注册的环境时静默跳过（前向引用后注册）', () => {
        const env = loadEnv();
        env.dependsOn('develop', ['release']);
        // 此时 release 尚未设置任何值
        expect(env.develop('baseUrl')).toBeUndefined();
        env.release('baseUrl', 'https://api.demo.com');
        expect(env.develop('baseUrl')).toBe('https://api.demo.com');
    });

    test('dependsOn 目标环境未注册时抛错', () => {
        const env = loadEnv();
        expect(() => env.dependsOn('ghost', ['release'])).toThrow(/not registered/);
    });

    test('dependsOn 不允许自依赖', () => {
        const env = loadEnv();
        expect(() => env.dependsOn('develop', ['develop'])).toThrow(/cannot depend on itself/);
    });

    test('dependsOn 重复声明同一依赖不会重复入队', () => {
        const env = loadEnv();
        env.dependsOn('develop', ['release']);
        env.dependsOn('develop', 'release');
        // 通过行为间接校验：仍只回退一次，且不影响结果
        env.release('k', 'v');
        expect(env.develop('k')).toBe('v');
    });

    test('register 可在注册时声明依赖', () => {
        const env = loadEnv();
        env.release('baseUrl', 'https://api.demo.com');
        env.register('stage', ['release']);
        expect(env.stage('baseUrl')).toBe('https://api.demo.com');
    });

    test('register 声明依赖接受单个字符串', () => {
        const env = loadEnv();
        env.release('baseUrl', 'https://api.demo.com');
        env.register('stage', 'release');
        expect(env.stage('baseUrl')).toBe('https://api.demo.com');
    });

    test('无参访问器返回包含继承键的有效视图', () => {
        const env = loadEnv();
        env.release('baseUrl', 'https://api.demo.com');
        env.release('shared', 'common');
        env.develop('debug', false);
        env.dependsOn('develop', 'release');
        expect(env.develop()).toEqual({
            baseUrl: 'https://api.demo.com',
            shared: 'common',
            debug: false
        });
    });

    test('有效视图中自身键覆盖继承键', () => {
        const env = loadEnv();
        env.release('baseUrl', 'https://api.demo.com');
        env.develop('baseUrl', 'https://dev.api.demo.com');
        env.dependsOn('develop', 'release');
        expect(env.develop().baseUrl).toBe('https://dev.api.demo.com');
    });

    test('值为 false / 0 / 空串均视为已设置，不触发回退', () => {
        const env = loadEnv();
        env.release('flag', 'fallback');
        env.develop('f', false);
        env.develop('z', 0);
        env.develop('s', '');
        env.dependsOn('develop', 'release');
        expect(env.develop('f')).toBe(false);
        expect(env.develop('z')).toBe(0);
        expect(env.develop('s')).toBe('');
        expect(env.develop('flag')).toBe('fallback');
    });

    test('未声明依赖时行为与之前一致（仅自身）', () => {
        const env = loadEnv();
        env.develop('baseUrl', 'https://dev.api.demo.com');
        expect(env.develop('baseUrl')).toBe('https://dev.api.demo.com');
        expect(env.develop('missing')).toBeUndefined();
        expect(env.develop()).toEqual({ baseUrl: 'https://dev.api.demo.com' });
    });
});
