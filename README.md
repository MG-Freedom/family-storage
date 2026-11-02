# 归物 · 家庭小仓库

为家庭闲置物品准备的中文仓库管理工具。手机、平板和电脑浏览器均可使用，无外部 CDN、无第三方服务、无需 npm 安装依赖。

## 功能

- 物品入库：名称、数字箱号、照片、可选备注，自动记录时间。
- 按名称、备注、箱号即时搜索；按箱号筛选。
- 查看物品照片及大图、箱号和入库时间。
- 取出删除：二次确认后移除当前库存及照片，保留文字操作记录。
- 操作记录展示最近 500 条，数据库保留全部记录。
- 单一家庭共享账号，用户名 `admin`，密码由环境变量设置。
- SQLite 和照片持久存储，容器重建不会清空持久卷。

## 飞牛 NAS 部署

1. 在飞牛应用中心安装并打开 Docker。
2. 将整个项目文件夹上传到 NAS，例如共享文件夹下的 `docker/family-storage`。确保 Dockerfile、compose.yaml、server.js、package.json、public 文件夹都在。
3. 将 `.env.example` 复制为 `.env`，修改 `APP_PASSWORD` 为你自己的至少 8 位密码。不要保留示例密码。
4. 在 Docker 的 Compose 项目功能中，从此文件夹创建项目，使用 `compose.yaml`。不同飞牛版本的菜单名称可能略有差别；如图形界面不能从目录构建，可通过 SSH 在该目录执行：

## 更新
```sh
cd /vol1/1000/family-storage
git pull
docker compose up -d --build
```

5. 浏览器访问 `http://NAS的局域网IP:5178`，输入用户名 `admin` 和 `.env` 中的密码。手机连接同一局域网后访问此地址，可选择拍照或相册上传。

如果 5178 已占用，只改 compose.yaml 中端口左侧，例如 `18080:8080`，然后访问 `http://NAS的局域网IP:18080`。

首次构建需要 NAS 可以拉取 `node:22-bookworm-slim` 官方镜像。默认镜像支持常见 x86_64、ARM64 NAS。照片支持 JPG、PNG、WebP，单张不超过 10MB；HEIC 照片需先转成 JPG，或设置手机相机使用兼容格式。文件选择器是否展示直接拍照选项由手机浏览器决定。

## 数据和备份

默认数据位于 Docker 命名卷 `family-storage-data`：

```text
/app/data/storage.sqlite    物品及操作记录
/app/data/storage.sqlite-wal / -shm    运行期间 SQLite 临时文件
/app/data/photos/           在库物品照片
```

如希望直接保存在 NAS 可见文件夹，将 compose.yaml 的挂载改为 `./data:/app/data`。容器使用 node 用户（UID/GID 1000），须给该目录对应读写权限；不要使用 777 作为常规解决方式。

推荐停止容器后备份整个数据目录，确保数据库和照片在同一时间点。命名卷可通过临时容器打包：

```sh
docker compose stop
docker run --rm -v family-storage-data:/data:ro -v "$PWD:/backup" node:22-bookworm-slim tar czf /backup/family-storage-backup.tar.gz -C /data .
docker compose start
```

恢复：先停止应用，把备份上传到项目目录，再执行：

```sh
docker compose stop
docker run --rm -v family-storage-data:/data -v "$PWD:/backup:ro" node:22-bookworm-slim sh -c 'tar xzf /backup/family-storage-backup.tar.gz -C /data && chown -R 1000:1000 /data'
docker compose start
```

恢复会覆盖备份中同名文件；恢复前先备份当前数据。不要执行 `docker compose down -v`，该命令会删除数据卷。删除物品不会自动恢复照片，请保留定期备份。

## 本地开发

要求 Node.js 22.13 或更高版本（建议 Node 22 LTS）。PowerShell：

  ```powershell
  $env:APP_PASSWORD='debug12345'; $env:PORT='5178'; npm start
  ```
  
  访问 `http://localhost:5178`。同一局域网内的手机可访问 `http://电脑局域网IP:5178`，例如 `http://10.10.10.15:5178`。默认本地数据在项目的 `data` 文件夹；可通过 `DATA_DIR` 修改。运行 `npm test` 验证认证、入库、删除、日志和重启持久化。

## 使用范围

适合家庭内网单实例使用；所有家庭成员共用一个账号，日志区分操作类型和时间，不区分人员。时间以 ISO UTC 保存，页面按设备本地时区展示；“今日入库”统计当前仍在库且今天录入的物品。HTTP Basic 登录由浏览器保存，退出可关闭浏览器会话；修改密码后旧凭证失效。

外网访问建议使用 NAS VPN，或配置 HTTPS 反向代理。普通 HTTP 不加密密码，不建议直接暴露公网。此项目不包含 NAS 自动安装或公网发布。
