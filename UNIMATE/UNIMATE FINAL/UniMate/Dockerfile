# ---- Node 构建阶段：安装 JS 依赖 ----
FROM node:20-slim AS node-build
WORKDIR /app/aa-test
COPY backend/aa-test/package*.json ./
RUN npm install

# ---- Python 运行阶段：复制 python + node 代码 ----
FROM python:3.10-slim
WORKDIR /app

# 复制 Python 代码（routers, models, app.py ...）
COPY backend /app
# 复制 Node 相关（含已装 npm 依赖）
COPY --from=node-build /app/aa-test /app/aa-test

# 安装 Python 依赖
RUN pip install --no-cache-dir -r requirements.txt

# 加 node_modules/.bin 到 PATH，方便直接调用 JS 工具
ENV PATH="/app/aa-test/node_modules/.bin:$PATH"

EXPOSE 8000
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
