# hooks 使用
import { useStompClient } from './hooks'
useStompClient({
  // 此处为自己返回的信息
  onReceiveMessage: (msg)=>{},
  // 订阅通道
  destination: ``,
});

# stomp 中的API
subscribe 订阅消息
unsubscribe 取消订阅
deactivate 断开消息通道
activate 激活消息通道
send 发送消息

# 具体文档
https://v36o5101ee.feishu.cn/docx/MFlmdZgK2oRhdyxIXfTcOLRxnue?from=from_copylink