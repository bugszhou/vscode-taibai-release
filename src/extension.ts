// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import { existsSync, readFileSync, writeFileSync } from "fs";
import { exec as cpExec } from "child_process";
import { join } from "path";
import * as vscode from "vscode";
import { getHtml } from "./html";
import * as MarkdownIt from "markdown-it";
import * as html2mdDefault from "html-to-md";
import * as spawn from "cross-spawn";
import sleep from "./sleep";
import { promisify } from "util";

const exec = promisify(cpExec);

const html2md: any = html2mdDefault;

const formatText = (text: string) => `\r${text.split(/(\r?\n)/g).join("\r")}\r`;

const {
  showInformationMessage,
  showErrorMessage,
  createWebviewPanel,
  createTerminal,
} = vscode.window;

let terminal: ReturnType<typeof createTerminal> = null as any;

// this method is called when your extension is activated
// your extension is activated the very first time the command is executed
export function activate(context: vscode.ExtensionContext) {
  let disposable = vscode.commands.registerCommand(
    "extension.release",
    async () => {
      const workspaceRoots: readonly vscode.WorkspaceFolder[] | undefined =
        vscode.workspace.workspaceFolders;
      if (!workspaceRoots || !workspaceRoots.length) {
        // no workspace root
        return "";
      }
      const workspaceRoot: string = workspaceRoots[0].uri.fsPath || "";

      const writeEmitter = new vscode.EventEmitter<string>();

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
            terminal = createTerminal({
              name: "release",
              pty: {
                handleInput(data: string) {
                  if (data === "\r" || data === "\r\n") {
                    terminal.dispose();
                  }
                },
                onDidWrite: writeEmitter.event,
                open() {
                  writeEmitter.fire("\r\n正在发版编译...\r\n\r\n");
                  return;
                },
                close() {},
              },
            });
          }

          let records: string[] = (message?.records ?? "")
            .replace("\r\n", "\n")
            .replace("\n\r", "\n")
            .split("\n");

          records = records.filter((item) => item);
          const version: string = (message?.version ?? "")
            .replace("\r\n", "\n")
            .replace("\n\r", "\n");

          let releaseScript = /(\-testing)$/.test(version)
            ? "npm run testing"
            : `${message?.scriptText}`;

          const isTesting =
            /(\-testing)$/.test(version) ||
            releaseScript.includes("npm run testing");

          const releaseMdPath = join(
            rootPath,
            `release${isTesting ? "-testing" : ""}.md`,
          );
          let originalMd = "# 发版记录\n\n";
          if (existsSync(releaseMdPath)) {
            originalMd = readFileSync(releaseMdPath, "utf8");
          }

          releaseView.dispose();
          terminal.show();

          try {
            const { stdout, stderr } = await exec(
              `npm version ${version} --allow-same-version`,
              {
                encoding: "utf8",
                cwd: workspaceRoot,
              },
            );
            if (stdout) {
              writeEmitter.fire(formatText(`Version: ${stdout}`));
            }
            if (stderr && stderr.length) {
              writeEmitter.fire(`\x1b[31m${formatText(stderr)}\x1b[0m\r\n`);
            }
          } catch (e: any) {
            writeEmitter.fire(`\x1b[31m${formatText(e.toString())}\x1b[0m\r\n`);
          }

          showInformationMessage("正在发版编译...", {
            modal: true,
          });

          const newMd = writeReleaseMD(originalMd, version, records);

          writeFileSync(
            join(rootPath, `release${isTesting ? "-testing" : ""}.md`),
            html2md(newMd) + "\n",
          );

          const releaseType = message?.isRelease ?? "no";

          writeEmitter.fire(formatText(`\r\n编译指令为：${releaseScript}\r\n`));
          writeEmitter.fire(formatText(`\r\n代码编译中...\r\n`));

          try {
            const buildProcess = cpExec(releaseScript, {
              encoding: "utf8",
              cwd: workspaceRoot,
            });

            buildProcess?.stdout?.on("data", (data) => {
              writeEmitter.fire(formatText(data));
            });

            buildProcess?.stderr?.on("data", (data) => {
              if (
                data?.includes("webpack.Progress") ||
                data?.includes("building")
              ) {
                return;
              }
              writeEmitter.fire(
                `\x1b[31m${formatText(
                  "........编译出错: 错误信息如下：......",
                )}\x1b[0m\r\n`,
              );
              writeEmitter.fire(`\x1b[31m${formatText(data)}\x1b[0m\r\n`);
            });

            const cli: string = (allConfig.get("cli") as any)?.[releaseType];
            const dist: string = (
              allConfig.get(`dist.${releaseType}`) as any
            )?.[isTesting ? "testing" : "production"];

            buildProcess.on("exit", (exitCode) => {
              if (exitCode === 0) {
                writeEmitter.fire(formatText(`\r\n编译成功！\r\n`));
                writeEmitter.fire(
                  formatText(
                    `\r\n编译后的代码路径：${join(rootPath, dist)}\r\n`,
                  ),
                );

                if (!cli || !dist) {
                  writeEmitter.fire(`\x1b[31m代码上传配置有误！\x1b[0m\r\n`);
                  return;
                }

                releaseScript = `${cli} upload --project ${join(
                  rootPath,
                  dist,
                )} --version ${version.replace(
                  "-testing",
                  "",
                )} --desc \"${records.join("\n")}\"`;

                writeEmitter.fire(formatText(`\r\n代码上传中...\r\n`));
                writeEmitter.fire(
                  formatText(`\r\n上传指令为：${releaseScript}\r\n`),
                );

                try {
                  const uploadProcess = cpExec(releaseScript, {
                    encoding: "utf8",
                    cwd: workspaceRoot,
                  });

                  writeEmitter.fire(
                    `${formatText("........上传信息如下：......")}\r\n\r\n`,
                  );
                  uploadProcess?.stdout?.on("data", (data) => {
                    writeEmitter.fire(formatText(data));
                  });

                  uploadProcess?.stderr?.on("data", (data) => {
                    writeEmitter.fire(`${formatText(data)}\r\n`);
                  });

                  uploadProcess.on("exit", (exitCode) => {
                    if (exitCode === 0) {
                      writeEmitter.fire(formatText(`\r\n上传成功！\r\n`));
                      writeEmitter.fire(
                        formatText(`\r\n上传版本号：${version}\r\n`),
                      );
                      showInformationMessage("发版编译结束", {
                        modal: true,
                      });
                      writeEmitter.fire(
                        formatText(`\x1b[31m\r\n输入 【回车键】 退出！\x1b[0m\r\n`),
                      );
                      return;
                    }
                    writeEmitter.fire(
                      `\x1b[31m${formatText(
                        `........上传出错: 错误码是：${exitCode}......`,
                      )}\x1b[0m\r\n`,
                    );
                  });
                } catch (e: any) {
                  writeEmitter.fire(
                    `\x1b[31m${formatText(e.toString())}\x1b[0m\r\n`,
                  );
                }
                return;
              }
              writeEmitter.fire(
                `\x1b[31m${formatText(
                  `........编译出错: 错误码是：${exitCode}......`,
                )}\x1b[0m\r\n`,
              );
            });
          } catch (e: any) {
            writeEmitter.fire(`\x1b[31m${formatText(e.toString())}\x1b[0m\r\n`);
          }
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
    `<p><strong> 发版时间：${dateFormat(
      Date.now(),
      "yyyy-MM-dd hh:mm:ss",
    )} </strong></p>`,
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
