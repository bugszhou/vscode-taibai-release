// The module 'vscode' contains the VS Code extensibility API
// Import the module and reference it with the alias vscode in your code below
import { existsSync, readFileSync, writeFileSync } from "fs";
import { exec as cpExec } from "child_process";
import { join } from "path";
import * as vscode from "vscode";
import { getHtml } from "./html";
import * as MarkdownIt from "markdown-it";
import * as html2mdDefault from "html-to-md";
import { promisify } from "util";
import { ITask } from "./__interface__";
import sleep from "./sleep";
import { merge } from "lodash";

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

      const configPathUrl = join(rootPath, "./.vscode/taibai-release.json");
      const releaseConfig = existsSync(configPathUrl)
        ? JSON.parse(readFileSync(configPathUrl, "utf8"))
        : {};

      releaseView.webview.html = getHtml({
        version: packageJSON?.version,
        config: releaseConfig,
      });

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

          showInformationMessage("正在发版编译...", {
            modal: true,
          });

          let records: string[] = (message?.records ?? "")
            .replace("\r\n", "\n")
            .replace("\n\r", "\n")
            .split("\n");

          records = records.filter((item) => item);
          const version: string = (message?.version ?? "")
            .replace("\r\n", "\n")
            .replace("\n\r", "\n");

          const taskConfig = getTask(message?.configItem, releaseConfig);
          taskConfig.varData.version = version;
          taskConfig.varData.summary = `\"${records?.join("\r\n") ?? ""}\"`;
          terminal.show();

          await rumCmd({
            writeEmitter,
            task: taskConfig,
          });

          const isTesting = /(\-testing)$/.test(version);

          const releaseMdPath = join(
            rootPath,
            `release${isTesting ? "-testing" : ""}.md`,
          );
          let originalMd = "# 发版记录\n\n";
          if (existsSync(releaseMdPath)) {
            originalMd = readFileSync(releaseMdPath, "utf8");
          }

          const newMd = writeReleaseMD(originalMd, version, records);

          writeFileSync(
            join(rootPath, `release${isTesting ? "-testing" : ""}.md`),
            html2md(newMd) + "\n",
          );

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

interface IRunCmdParams {
  writeEmitter: vscode.EventEmitter<string>;
  task: ITask;
}

async function rumCmd({ writeEmitter, task }: IRunCmdParams) {
  const workspaceRoots: readonly vscode.WorkspaceFolder[] | undefined =
    vscode.workspace.workspaceFolders;
  if (!workspaceRoots || !workspaceRoots.length) {
    // no workspace root
    return;
  }

  const workspaceRoot: string = workspaceRoots[0].uri.fsPath || "";
  let index = 0;

  await sleep(500);

  try {
    writeEmitter.fire(
      `\r\n${formatText(` 当前操作系统：${process.platform} `)}\r\n`,
    );

    writeEmitter.fire(`\r\n${formatText(` 当前运行模式：${task.title} `)}\r\n`);

    return innerRunCmd(task.tasks, index);

    async function innerRunCmd(tasks: ITask["tasks"], index: number) {
      return new Promise(async (resolve, reject) => {
        const currentTask = tasks?.[index];
        if (!currentTask) {
          showInformationMessage("发版编译结束", {
            modal: true,
          });
          writeEmitter.fire(
            formatText(`\x1b[31m\r\n输入 【回车键】 退出！\x1b[0m\r\n`),
          );
          resolve(null);
          return;
        }
        const varData = task.varData;
        const cmdStr: string = Function(`return function (currentTask) {
          return currentTask.cmd;
        }`)()(currentTask);
        const cmd: string = eval(`\`${cmdStr}\``)?.replace(
          /\$\{root\}/g,
          workspaceRoot,
        );

        writeEmitter.fire(
          `\r\n${formatText(
            `........ 当前执行任务：${currentTask.title} ......`,
          )}\r\n`,
        );
        writeEmitter.fire(
          `\r\n${formatText(` 当前执行指令：${cmd} `)}\r\n\r\n`,
        );

        await sleep(500);

        writeEmitter.fire(
          `\r\n${formatText("........ 执行信息如下： ......")}\r\n`,
        );

        const buildProcess = cpExec(cmd, {
          encoding: "utf8",
          cwd: workspaceRoot,
        });

        buildProcess?.stdout?.on("data", (data) => {
          if (data?.includes("[error]")) {
            writeEmitter.fire(`\r\n\x1b[31m${formatText(data)}\x1b[0m\r\n`);
            writeEmitter.fire(
              `\x1b[31m${formatText(
                `........ 执行任务失败 ......`,
              )}\x1b[0m\r\n`,
            );
            buildProcess.kill(-1);
            return;
          }

          writeEmitter.fire(formatText(data));
        });

        buildProcess?.stderr?.on("data", (data) => {
          if (
            data?.includes("webpack.Progress") ||
            data?.includes("building")
          ) {
            return;
          }

          if (data?.includes("[error]")) {
            writeEmitter.fire(`\r\n\x1b[31m${formatText(data)}\x1b[0m\r\n`);
            writeEmitter.fire(
              `\x1b[31m${formatText(
                `........ 执行任务失败 ......`,
              )}\x1b[0m\r\n`,
            );
            buildProcess.kill(-1);
            return;
          }

          writeEmitter.fire(`\r\n${formatText(data)}\r\n`);
        });

        buildProcess.on("exit", (exitCode) => {
          if (exitCode === 0) {
            writeEmitter.fire(
              formatText(`\r\n执行【${currentTask.title}】成功！\r\n`),
            );
            innerRunCmd(task.tasks, ++index);
            return;
          }
          reject();
          writeEmitter.fire(
            `\x1b[31m${formatText(
              `........ 执行任务失败: 错误码是：${exitCode} ......`,
            )}\x1b[0m\r\n`,
          );
          writeEmitter.fire(
            formatText(`\x1b[31m\r\n输入 【回车键】 退出！\x1b[0m\r\n`),
          );
          showInformationMessage("执行失败", {
            modal: true,
          });
        });
      });
    }
  } catch (e: any) {
    writeEmitter.fire(`\x1b[31m${formatText(e.toString())}\x1b[0m\r\n`);
  }
}

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

function getTask(title: string, config: any) {
  const task = config?.tasks?.filter((item: any) => item.title === title)[0];
  const commonVar = config?.varData ?? {};
  const itemVar = task?.varData ?? {};
  const varData = merge(commonVar, itemVar);
  const allConfig = vscode.workspace.getConfiguration("taibai-release");
  return {
    ...(task || {}),
    varData,
  };
}
