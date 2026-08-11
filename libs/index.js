const DEV = 'develop';
const TRIAL = 'trial';
const RELEASE = 'release';

// getAccountInfoSync 在模块加载阶段调用是安全的，其结果在运行期间不会变化。
const { miniProgram, plugin = {} } = wx.getAccountInfoSync();
if (!miniProgram.envVersion) {
    if (typeof __wxConfig === 'object') {
        console.info('__wxConfig is available');
        miniProgram.envVersion = __wxConfig.envVersion || RELEASE;
    }
}

let _env_version = miniProgram.envVersion;
let _launch_resolved = false;

// 启动参 env 覆盖必须在实际 App 生命周期内才能稳定拿到，因此惰性解析，
// 避免在模块 require 阶段（早于 onLaunch）就调用 getLaunchOptionsSync 而拿到脏数据或告警。
function _resolveLaunchOverride() {
    if (_launch_resolved) {
        return;
    }
    _launch_resolved = true;
    const launchOptions = wx.getLaunchOptionsSync();
    if (launchOptions && launchOptions.query && launchOptions.query.env) {
        _env_version = launchOptions.query.env;
    }
}

// envName -> 该环境的参数对象
let _CTX = {};
// envName -> 该环境所依赖的环境名列表（按优先级从高到低）
let _DEPS = {};

// 只拷贝有意义的值（值为 undefined 的键视为未设置，不参与回退，也不会出现在合并视图中）。
function _mergeInto(target, source) {
    if (!source) {
        return target;
    }
    const keys = Object.keys(source);
    for (let i = 0; i < keys.length; i++) {
        const k = keys[i];
        if (source[k] !== undefined) {
            target[k] = source[k];
        }
    }
    return target;
}

// 沿依赖链查找某个 key：先看自身，命中即返回；否则按 deps 顺序依次回退。
// visited 用于打断环形依赖，避免无限递归。
function _lookup(envName, key, visited) {
    if (!visited) {
        visited = new Set();
    }
    if (visited.has(envName)) {
        return undefined;
    }
    visited.add(envName);
    const ctx = _CTX[envName];
    if (ctx) {
        const val = ctx[key];
        if (val !== undefined) {
            return val;
        }
    }
    const deps = _DEPS[envName];
    if (deps) {
        for (let i = 0; i < deps.length; i++) {
            const dep = deps[i];
            if (_CTX[dep]) {
                const found = _lookup(dep, key, visited);
                if (found !== undefined) {
                    return found;
                }
            }
        }
    }
    return undefined;
}

// 合并某个环境的「有效视图」：先合并依赖（低优先级在前，高优先级覆盖），再叠加自身。
function _mergeContext(envName, visited) {
    if (!visited) {
        visited = new Set();
    }
    if (visited.has(envName)) {
        return {};
    }
    visited.add(envName);
    const result = {};
    const deps = _DEPS[envName];
    if (deps) {
        // 逆序合并，使列表中靠前（优先级更高）的依赖覆盖靠后的依赖。
        for (let i = deps.length - 1; i >= 0; i--) {
            const dep = deps[i];
            if (_CTX[dep]) {
                _mergeInto(result, _mergeContext(dep, visited));
            }
        }
    }
    _mergeInto(result, _CTX[envName]);
    return result;
}

function _attr(env, arg1, arg2) {
    if (arguments.length === 1) {
        return _mergeContext(env);
    } else if (arguments.length === 2) {
        return _lookup(env, arg1);
    } else {
        _CTX[env][arg1] = arg2;
        return this;
    }
}

function _requireEnv(envName) {
    const handler = this[envName];
    if (typeof handler !== 'function') {
        throw new Error(`env "${envName}" is not registered`);
    }
    return handler;
}

const defaultEnv = {
    get current() {
        _resolveLaunchOverride();
        return _env_version;
    },
    set current(value) {
        _resolveLaunchOverride();
        _env_version = value;
    },
    get miniProgram() {
        return miniProgram;
    },
    get plugin() {
        return plugin;
    },
    register(envName, deps) {
        if (_CTX[envName]) {
            console.warn(`env:${envName} already exists!`);
            return this;
        }
        _CTX[envName] = {};
        this[envName] = function () {
            return _attr.call(this, envName, ...arguments);
        };
        if (deps) {
            this.dependsOn(envName, deps);
        }
        return this;
    },
    /**
     * 声明 envName 依赖若干个其它环境：读取 envName 的某个 key 时，若 envName 自身未命中，
     * 则按 deps 顺序依次回退查找。写入永远只落到 envName 自身，不影响被依赖的环境。
     * @param deps 被依赖的环境名，支持数组或单个字符串（被依赖环境可后注册）。
     */
    dependsOn(envName, deps) {
        if (!_CTX[envName]) {
            throw new Error(`env "${envName}" is not registered`);
        }
        if (!_DEPS[envName]) {
            _DEPS[envName] = [];
        }
        const list = Array.isArray(deps) ? deps : deps == null ? [] : [deps];
        for (let i = 0; i < list.length; i++) {
            const dep = list[i];
            if (dep === envName) {
                throw new Error(`env "${envName}" cannot depend on itself`);
            }
            if (!_DEPS[envName].includes(dep)) {
                _DEPS[envName].push(dep);
            }
        }
        return this;
    },
    get(key, envName = this.current) {
        const handler = _requireEnv.call(this, envName);
        return arguments.length === 0 ? handler.call(this) : handler.call(this, key);
    },
    set(key, value, envName = this.current) {
        _requireEnv.call(this, envName);
        return _attr.call(this, envName, key, value);
    },
    mount(host, key = 'env') {
        if (host) {
            host[key] = this;
        } else {
            globalThis[key] = this;
        }
    }
};

defaultEnv.register(DEV).register(TRIAL).register(RELEASE);

module.exports = defaultEnv;
