// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import * as vscode from "vscode";
import { getHtml } from "./html";
import * as MarkdownIt from "markdown-it";
import * as html2mdDefault from "html-to-md";

const html2md: any = html2mdDefault;

const {
  showInformationMessage,
  showErrorMessage,
  createWebviewPanel,
  createTerminal,
} = vscode.window;

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  let disposable = vscode.commands.registerCommand(
    "extension.release",
    async () => {
      const releaseView = createWebviewPanel(
        "release",
        "发版记录",
        vscode.ViewColumn.One,
        {
          enableScripts: true,
          enableForms: true,
          enableFindWidget: true,
        },
      );

      const rootPath = vscode.workspace.workspaceFolders?.[0].uri.path || "";
      const packageJSONPath = join(rootPath, "package.json");

      const packageJSON = existsSync(packageJSONPath)
        ? JSON.parse(readFileSync(packageJSONPath, "utf8"))
        : {};

      releaseView.webview.html = getHtml(packageJSON?.version);

      const terminal = createTerminal("release");

      releaseView.webview.onDidReceiveMessage(
        (message) => {
          console.log(message);
          switch (message.status) {
            case "fail":
              showErrorMessage(message.msg);
              return;
          }

          let records: string[] = (message?.records ?? "")
            .replace("\r\n", "\n")
            .replace("\n\r", "\n")
            .split("\n");

          records = records.filter((item) => item);
          const version: string = (message?.version ?? "")
            .replace("\r\n", "\n")
            .replace("\n\r", "\n")
            .split("\n");

          const releaseMdPath = join(rootPath, "release.md");
          let originalMd = "# 发版记录\n\n";
          if (existsSync(releaseMdPath)) {
            originalMd = readFileSync(releaseMdPath, "utf8");
          }

          originalMd = writeReleaseMD(originalMd, version, records);

          terminal.sendText(`npm version ${version}`);

          const releaseScript = /(\-testing)$/.test(version)
            ? "npm run testing"
            : message?.scriptText;

          terminal.sendText(releaseScript);
          terminal.dispose();

          writeFileSync(join(rootPath, "release.md"), html2md(originalMd));
          showInformationMessage("发版编译成功");
          releaseView.dispose();
        },
        undefined,
        context.subscriptions,
      );
    },
  );

  context.subscriptions.push(disposable);
}

// this method is called when your extension is deactivated
export function deactivate() {}

function writeReleaseMD(
  originalMd: string,
  version: string,
  records?: string[],
) {
  const md = MarkdownIt();
  const originalHtml = md.render(originalMd, {});
  const mds = originalHtml.split("\n");
  const recordsHtmlArr =
    records?.map((item, index) =>
      getListStr(item.replace(/^([0-9]*\.)/, "").trim(), index + 1),
    ) || [];
  let listStr = "";
  if (recordsHtmlArr.length) {
    listStr = `\<ul\>\n` + recordsHtmlArr.join("\n") + `\</ul\>\n\n`;
  }

  mds.splice(1, 0, `<h2>v${version}</h2>`, ...listStr.split("\n"));

  return mds.join("\n");
}

function getListStr(content = "", index = 0) {
  return `<li>
<ol start="${index}">
<li>${content}</li>
</ol>
</li>`;
}
