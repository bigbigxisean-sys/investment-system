# Investment System API

投资管理系统后端 API 服务。

## 一键部署 (Render Blueprint)

[![Deploy to Render](https://render.com/images/deploy-to-render-button.svg)](https://render.com/deploy?repo=https://github.com/bigbigxisean-sys/investment-system-api)

点击上方按钮，Render 会自动部署此服务。

## 手动部署 (Render)

1. 在 [Render Dashboard](https://dashboard.render.com) 点击 **New + → Web Service**
2. 连接你的 GitHub 仓库
3. 填写：
   - **Name:** `investment-system-api`
   - **Environment:** `Node`
   - **Build Command:** `npm install`
   - **Start Command:** `node server.js`
4. 添加环境变量：
   - `JWT_SECRET` - JWT 签名密钥（随机字符串）
   - `ADMIN_USERNAME` - 管理员用户名（默认: admin）
   - `ADMIN_PASSWORD` - 管理员密码（默认: admin123）
5. 选择 Free 计划，点击 **Create Web Service**

## 部署后

部署完成后，更新前端 `index.html` 中的 `API_BASE`：

```javascript
// 将原来的 URL 替换为你的 Render 服务 URL
const API_BASE = 'https://investment-system-api.onrender.com';
```

## API 端点

| 方法 | 路径 | 说明 |
|------|------|------|
| GET | /api/health | 健康检查 |
| POST | /api/auth/login | 登录 |
| POST | /api/auth/verify | 验证 Token |
| POST | /api/auth/logout | 登出 |
| POST | /api/auth/change-password | 修改密码 |
| GET | /api/investments | 获取所有投资 + 收益 |
| POST | /api/investments | 创建投资 |
| PUT | /api/investments/:id | 更新投资 |
| DELETE | /api/investments/:id | 删除投资 |
| PATCH | /api/investments/:id/redeem | 赎回投资 |
| GET | /api/investments/returns/list | 收益列表 |
| POST | /api/investments/returns/add | 添加收益 |
