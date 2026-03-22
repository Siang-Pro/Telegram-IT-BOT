# Telegram IT BOT

Telegram 網管／IT 查詢機器人，附 **網頁管理後台**（白名單、設定、對話日誌）。以 **Long Polling** 連線 Telegram，無需 Webhook 專用埠。

**授權**：本專案採 [**PolyForm Noncommercial License 1.0.0**](https://polyformproject.org/licenses/noncommercial/1.0.0/)（**禁止商業用途**）。詳見根目錄 [`LICENSE`](./LICENSE)（**英文條款 + 繁體中文譯本**；若有歧義以英文為準）。

---

## 功能概要

- Bot：`/ip`、`/whois`、`/dns`、`/og`、`/ssl`、`/http`、`/port`、`/safe`，以及 `/menu` 圖形選單流程
- 後台：登入（JWT）、系統設定、白名單、對話日誌（含全部清除）
- 資料：SQLite（`better-sqlite3`），預設路徑可透過環境變數調整

## 環境需求

- **Node.js** 20+（見 `package.json` 的 `engines`）
- 可連線 `api.telegram.org` 及專案使用的外部 API

## 快速開始

```bash
git clone https://github.com/Siang-Pro/Telegram-IT-BOT.git
cd Telegram-IT-BOT
cp .env.example .env
# 編輯 .env 填入 ADMIN_*、JWT_SECRET、BOT_TOKEN、PORT 等
npm install
npm start
```

瀏覽器開啟（請將主機與埠換成**你的**環境）：

`http://<你的主機或網域>:<PORT>/` 或 `http://<你的主機或網域>:<PORT>/admin`

> **PORT** 必須與主機面板配發的對外埠、或本機實際監聽埠一致；每個人的網址與埠號可能不同，請以 `.env` 與主機說明為準。

## 環境變數

| 變數 | 必填 | 說明 |
|------|------|------|
| `ADMIN_USERNAME` | 是 | 後台登入帳號 |
| `ADMIN_PASSWORD` | 是 | 後台登入密碼（請用強密碼） |
| `JWT_SECRET` | 是 | JWT 簽章用密鑰（長隨機字串） |
| `BOT_TOKEN` | 建議 | Telegram Bot Token（亦可之後在後台寫入並重啟） |
| `PORT` | 否 | HTTP 埠，預設 `3000`（請依主機調整） |
| `DATABASE_PATH` | 否 | SQLite 路徑，預設 `./data/app.db` |
| `GOOGLE_SAFE_BROWSING_API_KEY` | 否 | `/safe` 指令用，可僅在後台設定 |

完整說明見 [`.env.example`](./.env.example)。

## 部署與文件

| 文件 | 說明 |
|------|------|
| [HidenCloud免費主機部署教學.md](./HidenCloud免費主機部署教學.md) | HidenCloud 免費 NODE 為主的步驟 |
| [部署文檔.md](./部署文檔.md) | 通用環境變數、pm2、備份、故障排除 |
| [開發文檔.md](./開發文檔.md) | 架構、API、資料表與安全注意事項 |

常駐程序可使用專案內的 `ecosystem.config.cjs`（預設程序名 `telegram-it-bot`），重啟範例：

```bash
pm2 restart telegram-it-bot
```

若你變更了 `ecosystem.config.cjs` 內的 `name`，請改用你的程序名稱。

## 專案結構（摘要）

- `index.js` — 進入點（轉載 `src/index.js`，便於部分主機設定 MAIN_FILE）
- `src/` — 後端（Express、Bot、資料庫）
- `public/admin/` — 管理後台靜態頁

## 連結

- 設計／專案相關：<https://siang.pro>
- 原始碼：<https://github.com/Siang-Pro/Telegram-IT-BOT>

---

*使用本軟體即表示你同意 `LICENSE` 條款；**禁止商業用途**。*
