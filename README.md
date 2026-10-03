# AE FN 模板管理

面向 After Effects 团队的模板资产管理工具。连接模板素材库和项目库后，设计师可以在 AE 内集中浏览模板、快速预览效果，并将选中的模板一键附加到当前项目中。

## 产品介绍

[![AE FN 模板管理产品介绍](assets/ae-fn-template-manager-intro.gif)](assets/ae-fn-template-manager-intro.mp4)

[下载完整产品介绍视频（MP4）](assets/ae-fn-template-manager-intro.mp4)

<iframe src="https://player.bilibili.com/player.html?isOutside=true&aid=117376272042401&bvid=BV132Hv65EfP&cid=42424733243&p=1" scrolling="no" border="0" frameborder="no" framespacing="0" allowfullscreen="true" width="800" height="450"></iframe>

[在哔哩哔哩观看产品介绍](https://www.bilibili.com/video/BV132Hv65EfP/)

## 它能做什么

### 集中管理 AE 模板

将团队常用的片头、转场、字幕、包装和其他 AEP 模板统一放在模板素材库中。素材库可以位于本机磁盘、映射网络驱动器或团队 NAS，按分类文件夹组织，方便团队保持统一的模板入口。

### 浏览和查找模板

- 按一级、二级分类浏览模板。
- 查看模板名称、分类和 AEP 文件数量。
- 支持搜索和收藏，常用模板可以快速找到。
- 一个模板包含多个 AEP 时，可以在使用前选择要打开的主项目。

### 悬停预览模板效果

- 鼠标悬停后自动静音播放预览视频。
- 双击预览区域可在面板内放大播放。
- 有静帧封面时优先展示封面，没有封面时使用视频首帧。
- 可以把视频当前帧保存为模板封面，补齐缺失的预览图。

### 一键应用到项目

应用模板时，选择目标项目并填写新的目标文件夹名称，插件会：

1. 将模板素材复制到项目库中的目标项目。
2. 保留模板所需的素材、预览视频和子文件夹。
3. 只带入用户选中的主 AEP，避免把其他候选 AEP 带入项目。
4. 遇到同名目录时自动使用 `_001`、`_002` 等名称，不覆盖已有内容。
5. 复制完成后在 After Effects 中打开主 AEP，继续编辑。

模板原目录不会被修改，目标文件夹名称由用户决定，主 AEP 文件名保持不变，以维持模板内部引用关系。

## 典型工作流程

```text
配置模板素材库和项目库
        ↓
按分类浏览模板
        ↓
悬停预览 / 放大查看
        ↓
选择主 AEP、目标项目和目标名称
        ↓
应用模板
        ↓
在 After Effects 中继续制作
```

## 快速开始

1. 从 [Releases](https://github.com/yanziheng5488-svg/AETemplateManager/releases) 下载 Windows 安装包。
2. 解压后按 `INSTALL.txt` 安装扩展，并重启 After Effects。
3. 在 `Window > Extensions` 中打开“AE FN 模板管理”。
4. 在设置中分别填写模板素材库根目录和项目库根目录。
5. 选择模板、预览效果并点击“应用”。

## 运行环境

- Windows
- Adobe After Effects 2024 或更高版本
- 支持本机目录、映射网络驱动器和 RaiDrive/WebDAV 等团队文件存储方式

## 后续规划

- 标签和外部资产管理软件同步。
- 多模板库管理。
- 团队共享的模板信息和收藏同步。

## 开发者信息

运行测试：

```powershell
npm test
```

生成 Windows 安装包：

```powershell
.\scripts\package.ps1
```

当前版本面向团队内部使用，后续保留签名安装和公开分发能力。
