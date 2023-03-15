// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import { existsSync, readFileSync, writeFileSync } from "fs";
import { join } from "path";
import * as vscode from "vscode";
import { getHtml } from "./html";
import * as MarkdownIt from "markdown-it";
import * as html2mdDefault from "html-to-md";
import sleep from "./sleep";

const html2md: any = html2mdDefault;

const {
  showInformationMessage,
  showErrorMessage,
  createWebviewPanel,
  createTerminal,
  withProgress,
} = vscode.window;

let terminal: ReturnType<typeof createTerminal> = null as any;

vscode.window.onDidCloseTerminal((e) => {
  if (e?.name === "release" && e?.exitStatus?.code === 0) {
    showInformationMessage("发版编译结束", {
      modal: true,
    });
  }
});

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  let disposable = vscode.commands.registerCommand(
    "extension.release",
    async () => {
      const allConfig = vscode.workspace.getConfiguration("taibai-release");

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

      releaseView.webview.onDidReceiveMessage(
        async (message) => {
          switch (message.status) {
            case "fail":
              showErrorMessage(message.msg);
              return;
          }

          if (!terminal || terminal?.exitStatus) {
            terminal = createTerminal("release");
          }

          let records: string[] = (message?.records ?? "")
            .replace("\r\n", "\n")
            .replace("\n\r", "\n")
            .split("\n");

          records = records.filter((item) => item);
          const version: string = (message?.version ?? "")
            .replace("\r\n", "\n")
            .replace("\n\r", "\n");

          const releaseMdPath = join(rootPath, "release.md");
          let originalMd = "# 发版记录\n\n";
          if (existsSync(releaseMdPath)) {
            originalMd = readFileSync(releaseMdPath, "utf8");
          }

          terminal.sendText(`npm version ${version}`);
          terminal.show();

          showInformationMessage("正在发版编译...", {
            modal: true,
          });

          await sleep(2000);

          const newMd = writeReleaseMD(originalMd, version, records);

          writeFileSync(join(rootPath, "release.md"), html2md(newMd));

          const releaseType = message?.isRelease ?? "no";

          let releaseScript = /(\-testing)$/.test(version)
            ? "npm run testing"
            : `${message?.scriptText}`;

          const cli: string = (allConfig.get("cli") as any)?.[releaseType];
          const dist: string = (allConfig.get(`dist.${releaseType}`) as any)?.[
            /(\-testing)$/.test(version) ||
            releaseScript.includes("npm run testing")
              ? "testing"
              : "production"
          ];

          if (cli && dist) {
            releaseScript = `${releaseScript} && ${cli} upload --project ${join(
              rootPath,
              dist,
            )} --version ${version.replace(
              "-testing",
              "",
            )} --desc \"${records.join("\n")}\"`;
          }
          console.log(releaseScript);

          releaseScript = `${releaseScript} && exit 0`;

          terminal.sendText(releaseScript);
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

  mds.splice(
    1,
    0,
    `<h2>v${version}</h2>\n`,
    `<p><strong>发版时间：${dateFormat(
      Date.now(),
      "yyyy-MM-dd hh:mm:ss",
    )}</strong></p>`,
    ...listStr.split("\n"),
  );

  return mds.join("\n") + "\n";
}

function getListStr(content = "", index = 0) {
  return `<li>
<ol start="${index}">
<li>${content}</li>
</ol>
</li>`;
}

function dateFormat(millisecond: number, fmt: string): string {
  let str = fmt;
  const date = new Date(millisecond);
  if (!date || date.toString() === "Invalid Date") {
    return "";
  }
  const o: any = {
    "M+": date.getMonth() + 1, // 月份
    "d+": date.getDate(), // 日
    "h+": date.getHours(), // 小时
    "m+": date.getMinutes(), // 分
    "s+": date.getSeconds(), // 秒
    "q+": Math.floor((date.getMonth() + 3) / 3), // 季度
    S: date.getMilliseconds(), // 毫秒
  };

  if (/(y+)/.test(str)) {
    str = str.replace(
      RegExp.$1,
      `${date.getFullYear()}`.substr(4 - RegExp.$1.length),
    );
  }

  Object.keys(o).forEach((k) => {
    if (new RegExp(`(${k})`).test(str)) {
      str = str.replace(
        RegExp.$1,
        RegExp.$1.length == 1 ? o[k] : `00${o[k]}`.substr(`${o[k]}`.length),
      );
    }
  });

  return str;
}
