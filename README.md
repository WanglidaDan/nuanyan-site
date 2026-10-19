# 暖言小站

员工意见反馈平台。项目包含静态前端、FastAPI 接口和 SQLite 持久化，适合先在自有服务器单实例部署。

## 自有服务器部署

要求服务器安装 Docker Engine 与 Docker Compose，并通过 HTTPS 反向代理访问应用。

1. 将仓库部署到服务器。
2. 复制 `.env.example` 为服务器上的 `.env`，设置唯一的管理员账号、至少 14 位管理员密码、随机 `APP_SECRET_KEY`、单位允许注册的邮箱域名和可用 SMTP 邮箱。不要把真实密钥提交到 Git。
3. 确认服务器数据卷 `nuanyan-data` 有定期备份，并限制宿主机访问。
4. 运行 `docker compose up -d --build`。应用只监听本机 `127.0.0.1:8080`，由现有 Nginx/Caddy 反向代理并终止 HTTPS。
5. 访问 `/healthz` 检查服务；管理端在 `/admin`。

SQLite 数据库位于容器数据卷 `/data/nuanyan.sqlite3`。此部署为单实例，勿启动多个应用副本共享该 SQLite 文件。扩容前应迁移至 PostgreSQL。

## CSP 代码纪律

- 不新增内联 `<style>`、内联 `<script>` 或 `style="..."` 属性。
- 样式只写入外部 CSS；脚本只写入外部 JS。
- 新增前端功能应复用现有 class，避免用 HTML 字符串拼接用户输入。

## 数据与隐私

员工账号与建议记录在内部关联，以便员工查询进度；承办管理端 API 不返回员工账号或邮箱。管理员可查看建议内容并处理工单。部署前需由平台负责人确认数据保存期限、管理员范围、备份与恢复流程，并据此更新网站隐私说明。请提醒员工不要在建议正文中填写不必要的个人身份信息。

## API

- 员工：注册、登录、退出、密码重置、提交建议、查询本人建议和公开统计。
- 管理端：登录、工单统计和列表、查看往来记录、回复与状态更新。
- 会话使用 HttpOnly、SameSite Strict Cookie；生产环境默认要求 Secure Cookie。
- 服务设置 `nosniff`、Referrer Policy 和 Permissions Policy 响应头。
- 管理端账号从环境变量首次初始化，不存在仓库内置默认密码。

## 开发检查

安装开发依赖并运行 API 回归测试：

```sh
pip install -r requirements-dev.txt
pytest -q
```

本地启动（需先配置 `.env`）：`uvicorn backend.app:app --host 127.0.0.1 --port 8080`
