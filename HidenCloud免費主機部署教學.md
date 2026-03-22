# HidenCloud 免費 NODE 主機 — Telegram IT BOT 部署教學

**Telegram IT BOT** 可部署於 HidenCloud **免費 NODE** 等環境；本教學以 HidenCloud 為**主要範例**。補充性說明（環境變數詳表、pm2、備份、其他主機）見 **`部署文檔.md`**；架構與 API 見 **`開發文檔.md`**。專案授權見根目錄 **`LICENSE`**（**禁止商業用途**）。

---

## 1. 官方文件與取得免費 NODE 服務

| 項目 | 連結 |
|------|------|
| 免費方案條款與**每週續約**說明 | [Free Tier](https://docs.hidencloud.com/free/free-tier) |
| 申請免費 NODE 步驟（西文介面說明，流程相同） | [NODE Gratis](https://docs.hidencloud.com/es/gratis/node) |
| 上傳檔案（檔案總管／SFTP） | [Add files](https://docs.hidencloud.com/hidencloud-panel/add-files) |
| 控制台（Start／Restart／Stop 等） | [Guide for beginners](https://docs.hidencloud.com/hidencloud-panel/guide-for-beginners) |

**申請 NODE 免費服務（摘要）**：註冊並驗證帳號 → 首頁進入 **Free / Gratis** → 選 **NODE: Budget Free** → 選機房地區 → 同意條款並完成訂單（金額 0€）。若建立失敗，多半是該區免費額度暫滿，請換機房或稍後再試（見官方 Free Tier 說明）。

---

## 2. 免費 NODE 方案與本專案的影響

依官方「Free Plan Specifications」中 **NODE: BUDGET FREE** 一欄（請以 [Free Tier](https://docs.hidencloud.com/free/free-tier) 最新內容為準）：

| 資源 | 典型限制（請以面板為準） | 對本專案的意義 |
|------|--------------------------|----------------|
| RAM | 約 **0.5 GB** | Node + Telegraf + Express 可運行但偏緊；建議設定 `NODE_OPTIONS`（見下文 §8） |
| 磁碟 | 約 **2 GB** | 若採 **§3 自動安裝**，上傳可不帶 `node_modules`，較省空間；`data/*.db` 會成長，需自行控管 |
| 資料庫額度 | 官方表列 **1**（若另購／內建 DB） | 本專案預設用 **SQLite 檔案**，通常不占用該「資料庫槽位」，仍以你訂單說明為準 |
| 連線埠 | 方案配發給你的對外埠（**每人不同**，請以面板為準） | 後台與 API 綁定此埠；Bot 使用 **Long Polling**，**不需**為 Telegram 開 Webhook 專用埠 |

**每週續約**：免費服務約 **7 天**需於儀表板免費續約一次；逾期暫停後若超過官方所定天數未處理，**伺服器可能被刪除且資料無法救回**。請設行事曆提醒。

---

## 3. 依賴安裝：官方建議（部署時自動安裝）— **請優先採用**

官方 FAQ 說明（*How do I install npm packages on free hosting?*）大意如下：

> 只要專案內含 **`package.json`** 並寫好依賴，**在部署（deployment）時會自動安裝**所有 npm 套件；**npm 與 yarn** 皆支援。

**建議流程：**

1. 上傳或同步到主機的專案根目錄必須包含 **`package.json`**（本 Repo 已具備）。  
2. 建議一併上傳 **`package-lock.json`**，讓線上安裝的版本與你本機 `npm install` 結果一致、較可重現。  
3. 若你使用 **yarn** 管理鎖檔，可改帶 **`yarn.lock`**（官方文件稱 yarn 亦支援）。  
4. **不必**在 Windows 先把 `node_modules` 整包打包上傳（除非走 §5 備援）。由平台在 **Linux 環境**執行安裝時，**`better-sqlite3`** 等原生模組會取得正確的預編譯檔或於線上編譯，可避免「Windows 編譯的 .node 無法在 Linux 執行」的問題。  
5. 依面板完成 **Deploy／建置／重新部署**（實際按鈕或選單名稱以 HidenCloud 為準），**待依賴安裝完成**後，再設定 **`.env`**，並將 **MAIN_FILE** 設為 **`index.js`** 後啟動（§7.2）。

**注意**：若你只使用 **File Manager 手動上傳檔案**而**沒有**觸發任何會跑 `npm install` 的部署流程，就不會自動出現 `node_modules`，此時請改看 **§5 備援**。

---

## 4. 打包與上傳內容（採 §3 自動安裝時）

上傳用壓縮包或 Git 同步目錄建議包含：

- `package.json`、`package-lock.json`（或 `yarn.lock`）  
- `src/`、`public/`、`ecosystem.config.cjs` 等專案檔案  

**可不包含**（由部署時安裝產生）：

- `node_modules/`（省磁碟與上傳時間，符合官方流程）

**務必不要**把本機 **`.env`** 打進公開壓縮檔；敏感值只在面板建立 `.env`（§8）。

---

## 5. 備援：未觸發自動安裝時（僅手動上傳、無部署管道）

若實際環境**無法**在伺服器或部署流程中安裝依賴，才改為在**本機或 CI** 先執行 `npm install`，再將專案**含 `node_modules`** 上傳。

**重要：`better-sqlite3` 為原生模組** — 在 **Windows** 上裝好的 `node_modules` **不能**直接放到 **Linux** 主機。必須在與 HidenCloud **相同 OS／CPU 架構**的環境安裝（通常為 **linux/amd64**，以你訂單為準）。

**用 Docker 在本機產生 Linux 版 `node_modules`（範例）：**

PowerShell：

```powershell
docker run --rm -v "${PWD}:/app" -w /app node:20-bookworm-slim npm install
```

CMD：

```bat
docker run --rm -v "%CD%:/app" -w /app node:20-bookworm-slim npm install
```

若主機為 **ARM**，改加 `--platform linux/arm64`（以面板規格為準）。

**沒有 Docker 時**：可在 **WSL2（Ubuntu）** 內對專案執行 `npm install` 後再打包上傳。

---

## 6. 上傳到 HidenCloud（檔案總管／SFTP）

依官方 [Add files](https://docs.hidencloud.com/hidencloud-panel/add-files)：

1. 登入 [Dashboard](https://dash.hidencloud.com/dashboard)，進入你的 **NODE** 服務。  
2. 左側 **Management** → **File Manager**。  
3. 右上角 **⋯** → **Upload**；上傳壓縮檔後在面板內 **解壓縮**。  
4. 若採 **§3**：解壓後應有 `package.json`，接著執行面板上的 **部署／安裝依賴** 步驟，直到出現 `node_modules`。若採 **§5**：解壓後應已含 `node_modules`。

**或使用 SFTP**：**System** → **SFTP Details**，埠號常為 **2022**，以 FileZilla／WinSCP 上傳。

---

## 7. 設定 `.env` 與啟動指令

### 7.1 建立 `.env`

在**專案根目錄**（與 `package.json` 同層）用面板文字編輯器新增 `.env`，內容請對照專案內 **`.env.example`**，至少包含：

- `ADMIN_USERNAME`、`ADMIN_PASSWORD`、`JWT_SECRET`  
- `BOT_TOKEN`  
- **`PORT`**：請填 **主機配給你的對外埠**（與控制台／防火牆顯示一致；**勿抄他人範例數字**）。

`DATABASE_PATH` 可維持 `./data/app.db`（程式會建立 `data` 目錄）。

### 7.2 啟動方式（HidenCloud Docker／MAIN_FILE）

Egg 預設啟動邏輯大致為：`MAIN_FILE` 若符合 **`.js`（實際為 shell 的 `*.js` 樣式比對）** 則用 **`node`**，否則會誤用 **`ts-node`**。若你填 **`src/index.js`**（路徑含 `/`），有時**比對失敗**而走到 **ts-node**，便會出現 `Cannot find module './index.js'` 等錯誤。

**請在面板將「主程式／MAIN_FILE／Startup File」設為專案根目錄的：**

```text
index.js
```

本 Repo 已在根目錄提供 **`index.js`**，內容僅轉載執行 **`src/index.js`**，無需改程式邏輯。

手動測試（工作目錄 = 專案根，與 `package.json` 同層）：

```bash
node index.js
```

（等同 `npm start`。）

- **工作目錄／Working directory**：請設為**含有 `package.json` 與 `index.js` 的那個資料夾**（常為 `/home/container`）。  
- 設定完成後 **Start／Restart**，並從 **Console** 查看日誌（見 [Guide for beginners](https://docs.hidencloud.com/hidencloud-panel/guide-for-beginners)）。

**pm2**：若免費方案未提供自訂常駐程序，**不必**強制使用 pm2；能穩定執行 `node index.js` 即可。若面板支援 pm2，可再依 **`部署文檔.md`** 使用 `ecosystem.config.cjs`（已指向根目錄 `index.js`）。

---

## 8. 記憶體不足時的調整（建議）

免費 NODE 記憶體很小時，Node 可能因 OOM 被殺掉。可在 **`.env` 同目錄**或面板「環境變數／Extra Docker Args」等處（依平台）加入：

```bash
NODE_OPTIONS=--max-old-space-size=400
```

數值可依實際調整；過大仍可能超過主機實體 RAM 而失敗。

---

## 9. 驗證：後台與 Telegram

1. 瀏覽器開啟後台（**任一路徑皆可**，已避免多餘 302 與部分代理造成 **ERR_TOO_MANY_REDIRECTS**）：  
   - `http://<你的子網域或主機>:<PORT>/`  
   - 或 `http://<你的子網域或主機>:<PORT>/admin`（可有無尾隨 `/`）  
   `<PORT>` 與 `.env` 一致。若仍出現重新導向迴圈，請改試**純 HTTP** 或主機提供的**官方 HTTPS 網址**（勿混用 http/https 與不同埠）。  
2. 用 `.env` 的管理員帳密登入，於 **白名單** 加入你的 Telegram 數字 ID。  
3. 在 Telegram 對 Bot 說話測試；非白名單應收到自訂拒絕訊息（含 ID），加入白名單後可使用 `/help` 等指令。

---

## 10. 更新依賴、Bot Token 或程式後

- **Token**：寫入後台或 `.env` 後應 **Restart** 程序（見 **`開發文檔.md`**／**`部署文檔.md`**）。  
- **依賴變更**：若採 **§3**，請更新 `package.json`／鎖檔後 **重新觸發部署**，讓平台再次自動安裝。  
- **僅 §5 手動上傳**：若主機仍無自動安裝，需在 **Linux 環境**重新 `npm install` 後再上傳（或整包覆蓋時保留 `data/app.db` 與 `.env`）。

---

## 11. 常見問題

| 狀況 | 可能原因 | 建議 |
|------|----------|------|
| 瀏覽器 **ERR_TOO_MANY_REDIRECTS** | ① 舊版本站 302 鏈 + static 目錄導向；② **非本站**：主機在 **HTTP↔HTTPS** 或 **帶埠／不帶埠** 之間反覆轉址 | ① 請更新至**最新程式**（後台改為 **sendFile**，**零** 302）。② 請只用**面板顯示的完整網址**（勿混用 `http` 與 `https`、勿讓 443 與應用埠互相矛盾跳轉）；可試無痕視窗或清除該主機網域的 Cookie |
| Console 出現 **ts-node**、`Cannot find module './index.js'` | **MAIN_FILE** 填了 `src/index.js` 等，Egg 誤判成 TypeScript 路徑而跑 **ts-node** | 改 **MAIN_FILE** 為根目錄 **`index.js`**（見 **§7.2**），重新上傳含新版 `index.js` 的專案後 Restart |
| 沒有 `node_modules` | 只上傳檔案、未跑部署／安裝 | 確認已依 **§3** 觸發部署；否則改 **§5** |
| `better_sqlite3.node` 載入失敗 | 曾用 Windows 編譯的 `node_modules` 上傳 | 刪除主機上 `node_modules`，改依 **§3** 重装；或 **§5** 用 Docker／WSL 產生 Linux 版 |
| 程序立刻結束或 OOM | RAM 不足 | **§8** 調低 `max-old-space-size` 或升級方案 |
| 無法開啟後台 | `PORT` 不一致 | 核對 `.env` 與面板配發埠 |
| 服務突然不見 | 未 **每週續約** | 依 [Free Tier](https://docs.hidencloud.com/free/free-tier) 處理 |
| 磁碟滿 | 2GB 上限 | 採 §3 可避免上傳巨大 `node_modules`；並清理不必要檔案 |

---

## 12. 與本 Repo 其他文件的關係

| 文件 | 用途 |
|------|------|
| `部署文檔.md` | 通用環境變數、pm2、備份、故障排除 |
| `開發文檔.md` | API、資料表、Bot 行為與安全注意事項 |
| `需求功能.md` | 原始需求對照 |

---

*本教學依 HidenCloud 公開文件（含 FAQ：免費託管部署時自動安裝 npm 套件）整理；實際按鈕、配額與**配發埠號**以你帳戶面板為準。*
