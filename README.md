# AE FN 模板管理 CEP 插件

Windows 优先的 After Effects CEP 面板，用于浏览映射网络驱动器上的 AE 模板，把模板复制到项目库并打开选中的 AEP。

## 当前实现

- AE 2024+（CEP 宿主 `AEFT`，最低版本 24.0；AE 2024 使用 CSXS 11，AE 2025/2026 使用 CSXS 12）。
- 模板库根目录下每个直接子文件夹固定作为一个分类，空文件夹也会显示在分类筛选中；只检查分类目录的直接子文件夹中的 AEP，不检查分类目录本身，也不进入更深层目录。名称含“自动保存”“Auto-Save”或“_AME”的目录会跳过，分类归属只由模板库根目录下的一级分类决定。
- 一个模板目录可以包含多个 AEP；应用时只复制用户选中的主 AEP。
- 优先使用 `template.json`、`preview.mp4`，再回退到模板根目录中的视频；视频同目录的 JPG/JPEG 静态图会作为未悬停时的卡片预览，悬停后播放视频。
- 没有静帧图时，卡片显示视频首帧；双击预览区域可打开页面内放大播放器，点击“使用当前帧作为封面”会把 JPG 写回视频所在目录并立即更新卡片。
- 悬停约 300ms 静音预览。
- 项目库根目录的一级文件夹作为项目列表。
- 应用时目标文件夹名必填；同名自动追加 `_001`、`_002`。
- 复制使用临时目录，支持进度、取消、失败后重试和清理。
- 兼容 RaiDrive/WebDAV 映射盘：目录逐层创建；目标盘拒绝临时目录重命名时自动回退为逐文件提交，复制可能比本地磁盘更慢。
- 收藏保存在 `%APPDATA%\\AE-FN-TemplateManager`；标签字段保留但首版不展示。

## 开发调试

1. 在 Windows 中开启与 AE 对应的 `PlayerDebugMode=1`（AE 2024 使用 CSXS 11，AE 2025/2026 使用 CSXS 12）。安装脚本会优先读取 `%TEMP%\CEP*-AEFT.log` 的实际 PlugPlug 版本，支持 AE 安装在自定义盘符。
2. 将本仓库目录放入 CEP extensions 目录，或使用团队内部安装脚本复制到该目录。
3. 在 After Effects 2024/2025 的 `Window > Extensions` 中打开“AE FN 模板管理”。
4. 在面板设置中分别填写模板库和项目库路径。

面板需要 CEP Node 能力读取映射盘和复制文件。生产发布时应移除开发调试开关，并使用签名安装包。

## 测试

```powershell
npm test
```

测试使用 Node 内置 `node:test`，不需要网络依赖。集成验收仍需在安装了 AE 2024 或 2025 的 Windows 机器上完成。

## 团队内部打包

生成可移植的 Windows 安装包：

```powershell
.\scripts\package.ps1
```

生成的 `dist\AE-FN-TemplateManager-Windows.zip` 包含扩展文件、当前用户安装脚本和安装说明。目标电脑安装步骤见包内 `INSTALL.txt`。ZIP 包未签名；在目标电脑启用 PlayerDebugMode 是可选显式操作，安装脚本不会默认更改注册表。

如有团队签名工具和证书，可额外生成签名 ZXP：

```powershell
.\scripts\package.ps1 -ZXPSignCmd "C:\\tools\\ZXPSignCmd.exe" -Certificate "C:\\certs\\team.p12" -Password "<certificate-password>"
```

## 模板 metadata 示例

```json
{
  "name": "科技片头",
  "mainAep": "主项目.aep",
  "preview": "preview.mp4",
  "tags": []
}
```

`mainAep` 和 `preview` 是默认选择；模板包含多个 AEP 时，用户可以在应用弹窗中重新选择主 AEP。复制后的目标文件夹使用用户输入的名称，主 AEP 文件名保持不变。
