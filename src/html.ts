export const html = `<!DOCTYPE html>
<html>
  <head></head>
  <body>
    <div>当前版本号：</div>
    <div>发布版本号：</div>
    <div>发版说明：<textarea ></textarea></div>
  </body>
</html>
`;

export function getHtml(version = "") {
  return `<!DOCTYPE html>
  <html>
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>发版</title>
      <style>
        * {
          box-sizing: border-box;
          margin: 0;
          padding: 0;
        }
        .release {
          padding: 100px 200px;
        }
        .release__item {
          display: flex;
          align-items: flex-start;
          justify-content: flex-start;
          margin: 20px;
        }
        .release__title {
          min-width: 150px;
          padding-right: 15px;
          text-align: right;
        }
        .release__text {
          display: inline-block;
          min-width: 350px;
          min-height: 200px;
          padding: 10px 10px;
        }
        .release__current {
          font-weight: bold;
          color: rgb(19, 151, 61);
        }
        .release__version {
          min-width: 350px;
          padding: 5px 10px;
          font-size: 18px;
          font-weight: bold;
          color: red;
        }
  
        .release__btn {
          width: 100px;
          height: 30px;
          margin: 0 auto;
          border: 1px solid #21b821;
          border-radius: 4px;
          background-color: #21b821;
          color: #fff;
        }
  
        .release__footer {
          width: 600px;
          padding-top: 30px;
          text-align: center;
        }

        .release__radios {
          align-items: center;
          justify-content: center;
          width: 600px;
        }

        .release__radio {
          display: flex;
          align-items: center;
          justify-content: flex-start;
          margin-right: 20px;
        }

        .release__radio-ipt {
          margin-right: 4px;
        }
      </style>
    </head>
    <body>
      <div class="release">
        <div class="release__item">
          <div class="release__title">当前版本号：</div>
          <span class="release__current">${version}</span>
        </div>
        <div class="release__item">
          <div class="release__title">即将发布版本号：</div>
          <input id="release__version-js" class="release__version" oninput="handleVersionInput()"></input>
        </div>
        <div class="release__item">
          <div class="release__title">发版说明：</div>
          <textarea id="release__text-js" class="release__text" oninput="handleRecordInfo()"></textarea>
        </div>
        <div class="release__item release__radios">
          <div class="release__radio">
            <input class="release__radio-ipt" name="scriptText" onchange="handleRadioChange()" type="radio" value="npm run testing" />测试环境
          </div>
          <div class="release__radio">
            <input class="release__radio-ipt" name="scriptText" onchange="handleRadioChange()" type="radio" value="npm run staging" />STG环境
          </div>
          <div class="release__radio">
            <input class="release__radio-ipt" name="scriptText" onchange="handleRadioChange()" type="radio" value="npm run build" checked />生产环境
          </div>
        </div>
        <div class="release__footer">
          <button class="release__btn" onclick="handleRelease()">发 版</button>
        </div>
      </div>
    </body>
    <script>
      const vscode = acquireVsCodeApi();
      let records = "";
      let scriptText = "npm run build";
      function handleRecordInfo() {
        const dom = document.querySelector("#release__text-js");
        records = dom.value;
      }
  
      let version = "";
      function handleVersionInput() {
        const dom = document.querySelector("#release__version-js");
        version = dom.value;
      }

      function handleRadioChange() {
        const doms = document.querySelectorAll(".release__radio-ipt");
        doms.forEach((item) => {
          if (item.checked) {
            scriptText = item.value;
          }
        });
        console.log(scriptText);
      }
  
      function handleRelease() {
        if (!version) {
          vscode.postMessage({
            status: "fail",
            msg: "请输入版本号",
            version,
            records,
            scriptText,
          });
          return;
        }
        vscode.postMessage({
          status: "ok",
          msg: "成功",
          version,
          records,
          scriptText,
        });
      }
    </script>
  </html>
  `;
}
