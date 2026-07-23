# 独立环境彻底删除说明

## 唯一删除边界

本次整合的全部源代码、参考文件、数据库、上传文件、日志和进程记录都在：

`/Users/yenns/Documents/找寻项目/zhipin-readdy-resume-20260724`

其中：

- 产品代码：`.../app`
- 独立运行数据：`.../runtime`
- Readdy、GitHub 和公司未提交快照：`.../references`
- 专用端口：`5010`、`5110`、`5190`

## 收到明确“删除”指令后执行

1. 先从 `app` 目录运行 `./scripts/stop-isolated-demo.sh`。
2. 确认三个端口均无监听，并确认记录的进程都属于本隔离目录。
3. 只删除下面这个完整、精确的根目录，不使用通配符：

```bash
rm -rf -- '/Users/yenns/Documents/找寻项目/zhipin-readdy-resume-20260724'
```

4. 删除后验证：

```bash
test ! -e '/Users/yenns/Documents/找寻项目/zhipin-readdy-resume-20260724'
lsof -nP -iTCP:5010 -sTCP:LISTEN
lsof -nP -iTCP:5110 -sTCP:LISTEN
lsof -nP -iTCP:5190 -sTCP:LISTEN
```

`test` 应成功，三个 `lsof` 均应无输出。

## 绝对不能触碰

- `/Users/yenns/Documents/新版招聘/zhipin-mvp`
- `/Users/yenns/Documents/找寻项目` 下的其他目录
- `/private/tmp/codex-isolated-runs` 下与本版本无关的项目
- 其他项目正在使用的端口、进程、数据库或浏览器数据

停止脚本只按本项目保存的 PID 精确终止进程，不使用 `pkill` 或模糊匹配。当前文档只是删除预案；在用户明确说删除之前，不执行完整目录删除。
