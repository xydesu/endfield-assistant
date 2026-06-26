# 第一階段：構建階段 (Builder)
FROM node:20-bookworm-slim AS builder

# 設定工作目錄
WORKDIR /app

# 安裝編譯所需的系統依賴 (這些依賴不會包含在最終鏡像中)
RUN apt-get update && apt-get install -y \
    build-essential \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg-dev \
    libgif-dev \
    librsvg2-dev \
    python3 \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# 複製 package.json 和 package-lock.json
COPY package*.json ./

# 安裝 Node.js 依賴
# 強制 sqlite3 從原始碼編譯，避免預編譯二進位檔依賴過高版本的 GLIBC
# 同時清除 npm 快取以節省空間
RUN npm ci && npm rebuild sqlite3 --build-from-source && npm cache clean --force

# 複製專案原始碼
COPY . .

# 第二階段：運行階段 (Runtime)
FROM node:20-bookworm-slim

# 設定時區
ENV TZ=Asia/Taipei
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

# 安裝 puppeteer 和 canvas 運行時所需的系統依賴 (僅包含執行時期所需的函式庫與 Chromium)
RUN apt-get update && apt-get install -y \
    libcairo2 \
    libpango-1.0-0 \
    libpangocairo-1.0-0 \
    libjpeg62-turbo \
    libgif7 \
    librsvg2-2 \
    chromium \
    fonts-ipafont-gothic fonts-wqy-zenhei fonts-thai-tlwg fonts-kacst fonts-freefont-ttf libxss1 \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# 設定 Puppeteer 環境變數
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# 設定工作目錄
WORKDIR /app

# 從 builder 階段複製編譯好的檔案
COPY --from=builder /app ./

# 啟動應用程式
CMD ["npm", "run", "start"]
