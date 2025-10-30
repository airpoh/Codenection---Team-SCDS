# ---- 第一阶段：Node.js 构建环境 ----
FROM node:20-slim AS node-build
WORKDIR /app/aa-test
    
# 复制所有 JS 源码文件（如 mint-gasless.js 等脚本），以及 package*.json
COPY UniMate/backend/aa-test/*.js ./            
# 覆盖全部 Node.js 脚本（如 mint-gasless.js、deploy-smart-account.js...）
COPY UniMate/backend/aa-test/package*.json ./   
# 覆盖依赖描述文件
    
# 安装 Node 依赖
RUN npm install
    
# ---- 第二阶段：Python 应用运行环境 ----
FROM python:3.10-slim
WORKDIR /app
    
# 复制 Python 代码到容器
COPY UniMate/backend /app
    
# 连同 node_modules、全部脚本一起复制到目标目录
COPY --from=node-build /app/aa-test /app/aa-test
    
# 安装 Python 依赖
RUN pip install --no-cache-dir -r requirements.txt
    
# 设置 PATH，确保 node 工具可直接全局调用
ENV PATH="/app/aa-test/node_modules/.bin:$PATH"
    
EXPOSE 8000
    
# 启动 uvicorn 作为 FastAPI 服务器
CMD ["uvicorn", "app:app", "--host", "0.0.0.0", "--port", "8000"]
