/**
 * 让组件注册一下回调函数，接收接收数据
 */
import { useCallback, useEffect, useRef } from "react";
import { throttle } from "lodash";
import { send, subscribe, unsubscribe, initWebSocketUrl } from ".";

interface IProps<T> {
  onReceiveMessage: (value: T) => void;
  destination: string;
  throttleTime?: number;
  uuid?: string;
  webSocketUrl: string;
}

export const useStompClient = <T>(props: IProps<T>) => {
  const {
    onReceiveMessage,
    destination,
    throttleTime,
    uuid = "",
    webSocketUrl,
  } = props;
  // 这里用ref 是因为 react capture value 一个特质，onReceiveMessage 中的值会变的
  // index 中 fuc 会被放在 数组中等待执行，所以用 ref
  const msgCallback = useRef(
    throttleTime ? onReceiveMessage : throttle(onReceiveMessage, throttleTime)
  );

  useEffect(() => {
    msgCallback.current = throttleTime
      ? onReceiveMessage
      : throttle(onReceiveMessage, throttleTime);
  }, [onReceiveMessage]);

  const disconnect = useCallback(
    () => unsubscribe({ uuid, destination, msgCallback }),
    [destination]
  );
  const connect = useCallback(
    () => subscribe({ uuid, destination, msgCallback }),
    [destination]
  );

  useEffect(() => {
    // 对于一个 spa 项目来说，全局一个就行
    initWebSocketUrl(webSocketUrl);
    connect();
    return () => {
      disconnect();
    };
  }, []);

  const sendMessage = useCallback((message: string) => {
    send({ message, destination });
  }, []);

  return {
    sendMessage,
    disconnect,
    connect,
  };
};
