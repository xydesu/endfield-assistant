FROM node:20-trixie-slim

# 設定環境變數
ENV NODE_ENV=production \
    TZ=Asia/Taipei

# 設定工作目錄
WORKDIR /app

# 設定時區、安裝 canvas 運行時期所需的最小系統動態函式庫，並清理 apt 快取
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone \
    && apt-get update \
    && apt-get install -y --no-install-recommends \
        libcairo2 \
        libpango-1.0-0 \
        libpangocairo-1.0-0 \
        libjpeg62-turbo \
        libgif7 \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/* /var/log/*

# 複製 package 定義檔以利用 Docker 快取層
COPY package*.json ./

# 安裝正式依賴、清除快取並剔除 node_modules 中非執行的型別/文件/測試檔案以抑制 inode 與 block 膨脹
RUN npm ci --omit=dev \
    && npm cache clean --force \
    && find node_modules -type d \( -name "test" -o -name "tests" -o -name "examples" -o -name "docs" \) -exec rm -rf {} + 2>/dev/null || true \
    && find node_modules -type f \( -name "*.d.ts" -o -name "*.map" -o -name "*.md" -o -name "CHANGELOG*" \) -delete 2>/dev/null || true

# 僅複製執行期必要檔案與目錄，避免無關檔案或憑證誤入映像檔
COPY index.js deploy-commands.js ./
COPY commands ./commands
COPY events ./events
COPY handlers ./handlers
COPY models ./models
COPY database/db.js ./database/db.js
COPY utils ./utils
COPY locales ./locales
COPY assets ./assets

# 建立可寫入執行期目錄並切換為非特權 node 使用者
RUN mkdir -p /app/database /app/assets/images/dynamic \
    && chown -R node:node /app

USER node

# 啟動應用程式
CMD ["npm", "run", "start"]
