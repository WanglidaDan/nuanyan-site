# 暖言小站

员工意见反馈平台 —— 把心里的话，说给愿意听的人。

## 项目结构

```
├── index.html      员工端首页（开屏 / Hero / 写建议 / 我的反馈 / 登录注册）
├── index.css       员工端样式（暖绿治愈风）
├── index.js        员工端交互逻辑
├── admin.html      管理端（数据总览 / 反馈办理 / 回复 / 状态流转）
├── admin.css       管理端样式
└── admin.js        管理端逻辑（调用后端 Admin API）
```

## 设计语言

- 主色：深暖绿 `#2F6B4F`、青绿 `#4FA38A`
- 背景：米白 `#FAF7F0`
- 点缀：暖金 `#D9A441`（小面积）

## 后端接口

- 员工端：`POST /api/v1/employee/feedbacks`（提交）、`GET /api/v1/employee/feedbacks`（查询）等
- 管理端：`/api/v1/admin/*`（登录、看板、反馈办理、回复、状态流转）
- 管理端入口：`/admin`

## 部署说明

- 静态文件放后端 `static/` 目录，经 FastAPI 直接 serving
- 后端有严格 CSP（`style-src 'self'; script-src 'self'`），**禁止内联 `<style>` / `<script>` / `style=""`**，必须保持三件套分离
- 前端每次请求读盘，更新静态文件无需重启服务

## 版本历史

- 2026-10-18：CSP 拆分上线、Tailscale 运维接管、iOS 安全区修复
- 2026-10-19：匿名文案统一、隐私弹窗、草稿退出清除、反馈详情展开、管理端重做
