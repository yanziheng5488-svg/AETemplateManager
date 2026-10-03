var FNTemplateManager = FNTemplateManager || {};

FNTemplateManager.openProject = function (projectPath) {
    try {
        if (!projectPath || typeof projectPath !== "string") {
            return "ERROR:项目文件路径无效";
        }
        var projectFile = new File(projectPath);
        if (!projectFile.exists) {
            return "ERROR:找不到项目文件：" + projectPath;
        }
        app.open(projectFile);
        return "OK:" + projectFile.fsName;
    } catch (error) {
        return "ERROR:" + String(error);
    }
};
