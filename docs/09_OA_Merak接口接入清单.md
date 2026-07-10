# OA/Merak 接口接入清单

这份文档把飞书妙记和 `merak-front` 旧前端里能复用的接口翻译成智聘当前的接入状态。

> 状态：本地接入骨架，默认关闭，尚未形成已部署 OA 能力。接口目录与查询代理不代表已获得公司 OA 写权限。

## 大白话结论

现在智聘已经先做了一个“插座”：

- HR 创建面试安排后，面试官会先收到一条站内“新的面试安排”通知。
- 后端新增 `/api/oa/merak/endpoints`，可以查看从 `merak-front` 梳理出的会议室、日程、通讯录接口白名单。
- 后端新增 `/api/oa/merak/proxy/<endpoint_key>` 查询代理，前端不直接跨域打公司接口。
- 默认不真实调用公司 OA。只有显式启用、配置合法 HTTPS 网关地址且提供 Bearer Token 时，查询代理才会出网；HTTP、空 token、内嵌账号密码或畸形 URL 均返回 503 且不发请求。
- 通用代理永久拒绝预定、取消、新建、编辑、删除、回执等语义写操作。未来写 OA 必须新增明确业务命令，并补用户身份映射、确认、RBAC、审计、幂等和失败补偿。

## 当前已接入的智聘接口

| 智聘接口 | 状态 | 说明 |
|---|---|---|
| `GET /api/oa/merak/endpoints` | 已完成 | 招聘专员、经理、管理员可查看可复用接口目录；面试官不可访问。 |
| `POST /api/oa/merak/proxy/<endpoint_key>` | 查询骨架 | 只允许白名单中的查询类接口；未配置返回 503，语义写接口无论是否配置均拒绝。 |
| `POST /api/interview/assignments` | 已增强 | 创建面试安排后会给面试官生成站内通知。 |

## 从 merak-front 梳理出的可复用接口

| key | 方法 | 原路径 | 用途 |
|---|---|---|---|
| `meeting_room_find_area` | POST | `/meetingRoom/findArea` | 查询会议室区域。 |
| `meeting_room_find_list` | POST | `/meetingRoom/findList` | 查询可用会议室。 |
| `meeting_room_reserve` | POST | `/meetingRoom/reserve` | 写操作，仅保留目录信息，通用代理禁止。 |
| `meeting_room_find_my_reserve` | POST | `/meetingRoom/findMyReserve` | 查询我的会议室预定。 |
| `meeting_room_update_status` | POST | `/meetingRoom/updateSta` | 写操作，仅保留目录信息，通用代理禁止。 |
| `meeting_room_query_h5` | POST | `/meetingRoom/queryByIdForH5` | 查询会议室预定详情。 |
| `schedule_new` | POST | `/schedule/newSchedule` | 写操作，仅保留目录信息，通用代理禁止。 |
| `schedule_query_list` | POST | `/schedule/queryScheduleList` | 查询日程列表。 |
| `schedule_query_by_id` | POST | `/schedule/queryScheduleById` | 查询日程详情。 |
| `schedule_edit` | POST | `/schedule/editSchedule` | 写操作，仅保留目录信息，通用代理禁止。 |
| `schedule_delete` | POST | `/schedule/deleteSchedule` | 写操作，仅保留目录信息，通用代理禁止。 |
| `schedule_add_notice` | POST | `/schedule/addNotice` | 写操作，仅保留目录信息，通用代理禁止。 |
| `contact_query_sync_wx_emp` | GET | `/contactList/querySyncWxEmp` | 按姓名、工号查询通讯录人员。 |

## 还需要 OA/接口负责人确认

这些不是继续翻前端代码能解决的，是公司权限和网关配置：

1. 测试环境和生产环境的 OA/Merak 网关域名。
2. 智聘后端调用这些接口时 token 怎么获取，是固定 token、当前用户 token，还是服务端换 token。
3. 是否需要配置可信 IP、网关白名单或域名映射。
4. 会议室预定和日程接口是否允许智聘系统调用；即使允许，也需要单独业务命令设计，不能打开通用写代理。
5. 通讯录接口返回的人员 ID 是否能映射到当前智聘面试官账号。

## 环境变量

```env
OA_MERAK_PROXY_ENABLED=false
OA_MERAK_BASE_URL=
OA_MERAK_BEARER_TOKEN=
OA_MERAK_TIMEOUT_SECONDS=8
```

默认保持关闭。等 OA 负责人确认 HTTPS 域名、查询权限和 token 后，才可为受控查询打开 `OA_MERAK_PROXY_ENABLED=true`；`OA_MERAK_BASE_URL` 不能使用 HTTP、不能内嵌用户名密码，也不要带 query/fragment。该开关不会开放会议室或日程写操作。
