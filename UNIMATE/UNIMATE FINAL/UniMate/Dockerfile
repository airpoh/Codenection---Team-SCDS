# ---- Node 构建阶段：安装 JS 依赖和脚本 ----
FROM node:20-slim AS node-build
WORKDIR /app/aa-test
# 复制全部 Node.js 脚本和依赖声明
COPY backend/aa-test/*.js ./
COPY backend/aa-test/package*.json ./
RUN npm install

# ---- Python 运行阶段 ----
FROM python:3.10-slim
WORKDIR /app
# 复制全部 Python 代码
COPY backend /app
# 从 Node 阶段复制完整 aa-test（含 node_modules 和所有脚本）
COPY --from=node-build /app/aa-test /app/aa-test
RUN pip install --no-cache-dir -r requirements.txt
ENV PATH="/app/aa-test/node_modules/.bin:$PATH"
EXPOSE 8000
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
