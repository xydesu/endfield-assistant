FROM node:20-bookworm-slim

# 設定時區
ENV TZ=Asia/Taipei
RUN ln -snf /usr/share/zoneinfo/$TZ /etc/localtime && echo $TZ > /etc/timezone

# 安裝 puppeteer 和 canvas 所需的系統依賴
# 安裝 chromium 並設定 puppeteer 使用系統的 chromium
RUN apt-get update && apt-get install -y \
    build-essential \
    libcairo2-dev \
    libpango1.0-dev \
    libjpeg-dev \
    libgif-dev \
    librsvg2-dev \
    chromium \
    python3 \
    fonts-ipafont-gothic fonts-wqy-zenhei fonts-thai-tlwg fonts-kacst fonts-freefont-ttf libxss1 \
    --no-install-recommends \
    && rm -rf /var/lib/apt/lists/*

# 設定 Puppeteer 環境變數
ENV PUPPETEER_SKIP_CHROMIUM_DOWNLOAD=true
ENV PUPPETEER_EXECUTABLE_PATH=/usr/bin/chromium

# 設定工作目錄
WORKDIR /app

# 複製 package.json 和 package-lock.json
COPY package*.json ./

# 安裝 Node.js 依賴
# 強制 sqlite3 從原始碼編譯，避免預編譯二進位檔依賴過高版本的 GLIBC (2.38)
RUN npm ci && npm rebuild sqlite3 --build-from-source

# 複製專案其餘檔案
COPY . .

# 啟動應用程式
CMD ["npm", "run", "start"]
