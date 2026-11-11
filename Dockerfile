FROM node:20-bookworm-slim

# 設定環境變數
ENV NODE_ENV=production \
    TZ=Asia/Taipei

# 設定工作目錄
WORKDIR /app

# 設定時區、安裝 canvas 運行時期所需的最小系統動態函式庫，並清除 apt 快取
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone \
    && apt-get update \
    && apt-get install -y --no-install-recommends \
        libcairo2 \
        libpango-1.0-0 \
        libpangocairo-1.0-0 \
        libjpeg62-turbo \
        libgif7 \
        librsvg2-2 \
    && apt-get clean \
    && rm -rf /var/lib/apt/lists/* /tmp/* /var/tmp/*

# 複製 package 定義檔以利用 Docker 快取層
COPY package*.json ./

# 安裝正式環境依賴 (canvas 與 sqlite3 均直接採用官方預編譯 binary) 並清除 npm 快取
RUN npm ci --omit=dev && npm cache clean --force

# 複製專案原始碼
COPY . .

# 啟動應用程式
CMD ["npm", "run", "start"]
