# @mini-dev/env

> `@mini-dev` 小程序开发工具箱的一部分 —— 面向微信**原生**小程序的零依赖运行时环境配置工具。

`@mini-dev/env` 是 [`@mini-dev`](https://github.com/miniapp-develop) 工具箱中的一个轻量成员，专门解决「按 `envVersion` 区分多套环境参数」这一件小事。它不依赖任何框架、不做构建期注入，发布的即是源码，即装即用。

如果你用的是 Taro / uni-app 等框架，框架本身已提供 `process.env` 能力，通常不需要本库；本库面向继续使用微信原生开发的场景，是 `@mini-dev` 工具箱里和其它原生小程序工具配套使用的一块拼图。

一个简单的小程序环境配置工具。

微信小程序默认有三个环境：

1. develop：对应开发版；
2. trial：对应体验版；
3. release：对应正式版；

具体的值可以在 `getAccountInfoSync()` 返回的对象中找到。

因此，我们可以基于这些环境值，来识别不同的环境，并配置不同环境对应的不同参数。

## 使用

### 安装

```shell script
npm install @mini-dev/env
```

### 获取/设置当前环境

```javascript
const env = require('@mini-dev/env');

console.log(env.current); // 对应具体的开发版本 develop, trial, release
env.current = 'develop'; // 手动指定当前环境为 develop
```

可通过编译模式增加查询参数 `env={xxxx}`，在小程序启动的时候来指定要启用的环境：

```json
{
  "condition": {
    "miniprogram": {
      "list": [
        {
          "name": "env=trial",
          "pathName": "pages/index/index",
          "query": "env=trial",
          "launchMode": "default",
          "scene": null
        },
        {
          "name": "env=release",
          "pathName": "pages/index/index",
          "query": "env=release",
          "launchMode": "default",
          "scene": null
        }
      ]
    }
  }
}
```

### 获取/设置环境参数对

```javascript
env.set('a', 'b'); // 为当前环境（current）设置名为 'a' 值为 'b' 的参数对
env.get('a'); // 得到 'b'
env.get(); // 得到 {a:'b'}
```

也可以显式指定要配置的环境：

```javascript
env.set('a', 'b', 'trial'); // 为 trial 环境设置键为 'a' 值为 'b' 的参数对
env.get('a', 'trial'); // 得到 'b'
```

以下调用是等效的：

```javascript
env.trial('a', 'b'); // 为 trial 环境设置键为 'a' 值为 'b' 的参数对
env.trial('a'); // 得到 'b'
```

### mount

有时候为了方便使用，可以将 env 挂载到 app 对象或者 globalThis 上，可以避免每次都要导入模块。

```javascript
//挂载到 globalThis
env.mount();

//类似于增加了一个全局变量 env
env.get('xxx');

// 或者挂载到 app 对象
App({
    onLaunch(opt) {
        env.mount(this);
    }
});
//类似于增加了一个 app 上 env 变量
getApp().env.get('xxx');
```

mount 支持第二个参数，以便修改实际挂载的对象名称，比如：

```javascript
App({
    onLaunch(opt) {
        env.mount(this, 'theEnv');
    }
});

//类似于增加了一个 app 上 theEnv 变量
getApp().theEnv.get('xxx');
```

### 添加新环境

env 根据使用惯例，预置了 develop，trial，release 三种环境，对应到小程序框架的 envVersion，可以直接使用。如果需要其他的环境，也可以创建新的自定义环境：

```javascript
env.register('stage'); // 注册新环境
env.stage('baseUrl', 'https://stage.api.demo.com');
console.log(env.get('baseUrl', 'stage')); // 'https://stage.api.demo.com'
console.log(env.stage('baseUrl')); // 'https://stage.api.demo.com'
```

### 环境依赖（fallback）

可以为环境声明依赖关系。读取某个环境的 key 时，若该环境自身未命中，会按依赖顺序回退到其它环境查找；写入则永远只落到当前环境，不会污染被依赖的环境。

```javascript
env.release('baseUrl', 'https://api.demo.com');
env.release('shared', 'common-value');

// 让 develop 依赖 release：develop 没有的 key 会去 release 取
env.dependsOn('develop', ['release']);

env.develop('debug', false); // 只写到 develop

env.develop('baseUrl'); // 'https://api.demo.com' —— develop 没有，回退到 release
env.develop('debug'); // false —— develop 自己有
env.develop('shared'); // 'common-value' —— 回退到 release

env.develop(); // { baseUrl: 'https://api.demo.com', shared: 'common-value', debug: false }
               //   即 develop 的「有效视图」：自身 + 继承自 release
```

`dependsOn` 第一个参数是主体（谁依赖），第二个参数是被依赖者列表（数组，单个时也可直接传字符串）。也可以声明多个依赖，按声明顺序优先回退：

```javascript
env.dependsOn('develop', ['release', 'trial']);
// 查找顺序：develop -> release -> trial
```

依赖还支持多级链路、可后注册（前向引用），并会自动打断环形依赖：

```javascript
env.register('stage', ['release']); // 注册时直接声明依赖
env.dependsOn('develop', ['stage']); // develop -> stage -> release
```

说明：

- 读取（`get` / `env.xxx(key)` / 无参 `env.xxx()`）走依赖链；写入（`set` / `env.xxx(key, value)`）只落到目标环境。
- 值为 `false` / `0` / `''` / `null` 均视为「已设置」，不会触发回退；只有 `undefined`（即未设置过）才继续回退。
- 依赖环境未注册时会被静默跳过，因此可以先声明依赖、再注册被依赖的环境。

### TypeScript

本库自带类型声明（`libs/index.d.ts`），在 TS 项目中可直接使用并享有类型提示：

```typescript
import env from '@mini-dev/env';

env.develop('baseUrl', 'https://dev.api.demo.com');
env.set('debug', false);
const current = env.current;
```

### 说明：这是一个运行时开关，不是安全门禁

`env.current` 可被任意代码改写，`?env=release` 也能在开发者工具的编译模式里随手注入。因此本库只用于「在不同运行环境之间切换配置参数」，**不适合**用来保护生产端点、门禁敏感配置或存放密钥——那些应当放在服务端鉴权处理，而不是依赖客户端的 env 切换。

## 示例

参见 [示例小程序 sample](./sample)

## ChangeLog

### 0.2.0

1. 新增环境依赖（fallback）：`dependsOn(envName, ...deps)` 与 `register(envName, deps)`，读取时按依赖链回退、写入只落到目标环境；支持多级链路、多依赖优先级、前向引用与环形依赖保护；
2. 修复 `wx.getLaunchOptionsSync()` 在模块加载阶段过早调用的问题，改为在首次读取 `current` 时惰性解析启动参覆盖；
3. 修复 `set` 将整个 `arguments` 透传给内部 `_attr` 的隐患，改为显式传参；
4. 访问未注册的环境时抛出可读错误，而非裸 `TypeError`；
5. 无参访问器（`env.xxx()`）改为返回该环境的「有效视图」（自身 + 继承自依赖环境的键）；
6. 修正 README 中 `trial` 被误写为 `trail` 的问题，以及示例注释中错误的返回值；
7. 新增 TypeScript 类型声明（`libs/index.d.ts`）并在 `package.json` 中声明 `types`；
8. 新增 jest 单元测试，`test` 脚本改为真正运行测试。

### 0.1.1

1. 移除多余的依赖项；

### 0.1.0

1. 支持 mount 到全局或者指定对象（比如 app）上；

### 0.0.3

1. 支持基本的参数配置
