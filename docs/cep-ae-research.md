# Adobe After Effects CEP 插件调研

更新时间：2026-09-30

这份文档作为本项目开始编码前的资料基线。CEP 属于 Adobe Creative Cloud 的 HTML 面板扩展体系，After Effects 的项目、合成、图层和属性操作主要通过 ExtendScript/AE Scripting API 完成。

## 1. 推荐技术路线

第一版建议采用：

- CEP 面板：HTML、CSS、TypeScript/JavaScript。
- 面板与宿主通信：`CSInterface.js` 的 `evalScript()`。
- After Effects 端：独立的 `.jsx`/`.jsxinc` 脚本层，负责访问 `app.project`、合成、图层、属性和渲染队列。
- 复杂或耗时任务：面板端负责状态和用户交互，脚本端分小批次执行，避免一次 `evalScript()` 阻塞宿主。
- 构建：Node.js + Vite/Webpack 均可；首版可以用简单的 TypeScript 构建，保持 CEP manifest 和 `CSXS/` 目录稳定。

CEP 面板不是 After Effects 原生 C++ 插件。需要访问渲染管线、效果器底层或高性能图像处理时，另行评估 AE C++ SDK；不要把 C++ SDK、CEP 和 ExtendScript 混为一个运行时。

## 2. 官方与事实来源

### Adobe CEP

- [Adobe-CEP/CEP-Resources](https://github.com/Adobe-CEP/CEP-Resources)：CEP 样例、`CSInterface.js`、Cookbook 和调试资料的入口。
- [CEP HTML Extension Cookbook](https://github.com/Adobe-CEP/CEP-Resources/wiki/CEP-12-HTML-Extension-Cookbook-for-CC)：manifest、生命周期、宿主通信、扩展安装和调试。
- [CEP Resources Releases](https://github.com/Adobe-CEP/CEP-Resources/releases)：CEP 资源和样例版本。
- [CEP 规范仓库](https://github.com/Adobe-CEP/CEP-Resources/tree/master/CEP_11.x)：不同 CEP/CSXS 版本的资源和示例，实际使用时以目标 AE 版本验证。

### After Effects 脚本与 API

- [After Effects Scripting Guide](https://ae-scripting.docsforadobe.dev/)：ExtendScript 对象模型、`app`、项目、合成、图层、属性、渲染队列和脚本示例。
- [Adobe After Effects Developer Center](https://developer.adobe.com/after-effects/)：Adobe 官方开发入口和 SDK 资料索引。
- [After Effects SDK Guide](https://ae-plugins.docsforadobe.dev/)：仅在需要 C++ 原生插件、效果器、导入器或渲染器时使用。
- [Adobe ExtendScript Toolkit 文档归档入口](https://github.com/Adobe-CEP/CEP-Resources)：新项目应以宿主实际支持的 ExtendScript 运行时为准，不要假设现代浏览器 JavaScript 能直接运行在 JSX 中。

### 社区脚手架与参考实现

- [Inventsable/bolt-cep](https://github.com/Inventsable/bolt-cep)：基于现代前端工具链的 CEP 脚手架，适合比较目录、开发服务器和构建方式。
- [Adobe CEP Samples](https://github.com/Adobe-CEP/CEP-Resources/tree/master/CEP%2011.0/Samples)：官方样例优先于社区封装，用于确认 manifest 和宿主通信行为。
- [aescripts.com](https://aescripts.com/)：可用于观察成熟 AE 面板的交互和安装方式；其中的第三方代码和授权不能直接复制到本项目。

## 3. CEP 运行结构

典型扩展目录：

```text
extension-root/
  CSXS/
    manifest.xml
  client/
    index.html
    assets/
    dist/
  host/
    main.jsx
    lib/
  lib/
    CSInterface.js
```

manifest 至少要定义扩展 ID、面板入口、宿主 `AEFT`、目标宿主版本和所需 CSXS runtime。示意结构如下，具体版本必须按项目支持的 AE 版本验证：

```xml
<ExtensionManifest Version="7.0" ExtensionBundleId="com.example.ae.fn" ExtensionBundleVersion="1.0.0">
  <ExtensionList>
    <Extension Id="com.example.ae.fn.panel" Version="1.0.0" />
  </ExtensionList>
  <ExecutionEnvironment>
    <HostList>
      <Host Name="AEFT" Version="[18.0,99.9]" />
    </HostList>
    <LocaleList><Locale Code="All" /></LocaleList>
    <RequiredRuntime Name="CSXS" Version="11.0" />
  </ExecutionEnvironment>
  <DispatchInfoList>
    <Extension Id="com.example.ae.fn.panel">
      <DispatchInfo>
        <Resources>
          <MainPath>./client/index.html</MainPath>
          <ScriptPath>./host/main.jsx</ScriptPath>
        </Resources>
        <UI>
          <Type>Panel</Type>
          <Menu>AE FN</Menu>
          <Geometry><Size><Width>360</Width><Height>520</Height></Size></Geometry>
        </UI>
      </DispatchInfo>
    </Extension>
  </DispatchInfoList>
</ExtensionManifest>
```

`manifest.xml` 的 schema、`RequiredRuntime`、宿主版本范围和 `ScriptPath` 是最容易因版本不匹配而启动失败的部分。正式实现时应以目标 AE 版本与 CEP Resources 中的 manifest 样例逐项核对。

## 4. 两个 JavaScript 运行时的边界

面板端运行在 Chromium Embedded Framework（CEF）中，可以使用 DOM、异步 API、打包后的现代 JavaScript 和 Node 能力（是否开放由 manifest/CEP 设置决定）。宿主脚本端运行 ExtendScript，使用 After Effects 对象模型；它不是浏览器环境，通常没有 DOM、`fetch`、Promise 或 npm 模块。

常见调用方向：

```js
// panel/client.js
const encoded = JSON.stringify({ name: "Comp 1" });
new CSInterface().evalScript(`FN.createComp(${encoded})`, result => {
  // result 是 ExtendScript 返回的字符串
});
```

```jsx
// host/main.jsx
var FN = FN || {};
FN.createComp = function (payload) {
    var data = JSON.parse(payload);
    app.beginUndoGroup("FN create comp");
    try {
        var comp = app.project.items.addComp(data.name, 1920, 1080, 1, 5, 30);
        return JSON.stringify({ ok: true, id: comp.id });
    } catch (error) {
        return JSON.stringify({ ok: false, message: String(error) });
    } finally {
        app.endUndoGroup();
    }
};
```

生产代码应统一返回 `{ ok, data, error }` 结构，给 `evalScript()` 设置超时和失败提示，并对传入 JSX 的字符串做 JSON 编码，避免引号、换行和用户输入破坏脚本。

## 5. 调试、安装与发布检查点

开发阶段通常需要：

1. 打开 CEP 调试模式（Windows 注册表中的对应 `CSXS.<版本>` 项设置 `PlayerDebugMode=1`；macOS 使用对应版本的 `defaults write com.adobe.CSXS.<版本> PlayerDebugMode 1）。版本号必须与目标 CEP runtime 一致。
2. 把扩展目录放入用户 CEP extensions 目录，或使用官方/社区安装命令验证安装包。
3. 在 AE 的 `Window > Extensions` 菜单中确认面板出现。
4. 使用 CEF 开发者工具检查面板端；使用 AE 的脚本错误提示、ExtendScript 调试工具或日志文件检查 JSX 端。
5. 发布时生成 ZXP，使用受信任的签名工具和证书；记录证书、扩展 ID、版本号及升级策略。

CEP 的调试开关会降低本机扩展加载限制，不能作为最终用户安装方案。发布前需要在干净环境验证安装、卸载、升级和权限路径。

## 6. 推荐的项目分层

```text
src/
  panel/                 # UI、状态、用户输入、调用桥接层
  bridge/                # evalScript 封装、协议、超时、错误处理
  host/                  # JSX 入口和 AE 领域服务
  host/lib/              # 可复用 ExtendScript 工具
  shared/                # 可被两端消费的协议和常量（避免放现代运行时代码）
CSXS/manifest.xml
scripts/                 # build、package、install、debug helpers
docs/                    # API 记录、兼容矩阵、发布说明
```

建议先确定一个垂直切片，例如“读取当前合成信息并在面板显示”，再扩展到创建图层、修改属性、导入素材和渲染队列。每个宿主操作都应有一个可独立测试的 JSX 函数和一个面板端协议测试样例。

## 7. 可用的 agent、skill 与本地能力

当前工作区没有 Adobe CEP 专用 agent 或 skill，也没有现成源代码。已发现的本地能力如下：

- `review-agent`：适合检查 manifest、桥接协议、错误处理和兼容性风险；它不是 CEP 专家，需要在任务提示中明确 AE/CEP 检查项。
- `plugin-creator`：用于创建 Codex 自身的插件和 skill，不是 Adobe CEP 插件脚手架；不要把它当作 CEP 构建器。
- `skill-creator`：如果项目后续有稳定的编码约定，可以把本项目的 CEP 规则封装成私有 Codex skill。
- 通用代码 agent：适合实现 TypeScript UI、JSX 领域函数、构建脚本和测试，但必须给出本资料中的运行时边界，防止把浏览器 API 写进 ExtendScript。

建议后续建立一个项目专用 `cep-ae-dev` skill，至少包含：manifest 版本矩阵、panel/host 桥接协议模板、ExtendScript 禁用 API 清单、CEP 调试开关、打包安装脚本和发布检查表。这个 skill 应服务于本项目的约束，不应伪装成 Adobe 官方文档。

## 8. 需要在开始编码前锁定的信息

- 目标操作系统：Windows、macOS，还是两者。
- 目标 After Effects 最低版本和最高验证版本。
- 是否只做 Panel，还是要做浮动面板/命令扩展。
- 核心功能：素材管理、批量图层/属性操作、渲染队列、AI/API 调用，还是其他工作流。
- 是否允许联网、是否需要本地文件读写、是否需要调用 Node 能力。
- 发布方式：内部部署、ZXP、安装器，还是仅开发者本机使用。
- UI 技术偏好：原生 HTML/TypeScript、React、Vue；首版建议先控制依赖数量。

## 9. 资料使用顺序

先读 CEP Cookbook 的 manifest、生命周期和调试章节，再读 After Effects Scripting Guide 中与首个垂直切片相关的对象模型，最后参考 CEP Resources 样例和社区脚手架的构建方式。只有在功能需要原生渲染或底层图像处理时，才进入 AE C++ SDK 文档。

