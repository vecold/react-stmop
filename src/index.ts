/* eslint-disable @typescript-eslint/no-unused-vars */
/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * // 连接配置文件 https://stomp-js.github.io/api-docs/latest/classes/Client.html#info
 */
import { Client, IFrame, ActivationState, StompSubscription } from '@stomp/stompjs';
import { isEmpty } from 'lodash';
import { message as antdMessage } from 'antd';
import React from 'react';

const { warning } = antdMessage;
const decoder = new TextDecoder('utf-8');
type funcProps<T> = {
  message?: string;
  destination: string;
  msgCallback?: React.MutableRefObject<any>;
  uuid?: string;
};
type funcType<T> = {
  (props: funcProps<T>): void;
};

type tempFunc = { <T>(func: funcType<T>): funcType<T> };

const subscriptionMap = new Map<string, StompSubscription>();
const subscriptionCallbackMap = new Map<string, React.MutableRefObject<any>[]>();
const uuidSet = new Set<string>();

// TODO： remove the any
// try infer or any others;
const subscriptionFailedMap: Map<string, { func: any; args: any }[]> = new Map();
let stompClient: Client | undefined;
// 手动监听状态
const stompInfo = new Proxy(
  {
    alive: false,
    hasDisconnected: false,
  },
  {
    set: (target, property, value, receiver) => {
      if (property === 'alive' && value && subscriptionFailedMap.size) {
        subscriptionFailedMap.forEach((item) => {
          item.forEach((fucArgs) => {
            const { func, args } = fucArgs;
            func(...args);
          });
        });
        subscriptionFailedMap.clear();
        return true;
      }
      return Reflect.set(target, property, value, receiver);
    },
  }
);

export function resetMap() {
  subscriptionMap.clear();
  subscriptionCallbackMap.clear();
  subscriptionFailedMap.clear();
}

export function deactivate() {
  resetMap();
  stompClient?.deactivate();
  stompClient = undefined;
}

export function activate() {
  stompClient?.activate();
}

const stompSubscribe = (destination: string) => {
  const subscription = stompClient?.subscribe(destination, (message: any) => {
    let payload: any;
    try {
      payload = JSON.parse(message.body);
    } catch (e) {
      payload = message.body;
    }
    subscriptionCallbackMap.get(destination)?.forEach((fuc) => fuc.current(payload));
  });
  return subscription;
};

const getStompConfig = ({ env = '', openDebug = false }: { env: string; openDebug: boolean }) => ({
  // 连接头信息，通常是认证登录信息
  connectHeaders: {
    // 比如说加个token
    // token: getSession(USER_KEY),
  },

  // 连接url，应该以 ws:// or wss:// 开头
  brokerURL: env,

  // debug
  debug: (str: string) => {
    // openDebug && console.log('debug:', `STOMP: ${str}`);
  },
  // 失败重连时间，1000毫秒
  reconnectDelay: 1000,

  // 连接成功的监听，订阅应该在他内部完成
  onConnect(frame: IFrame) {
    // 链接逻辑全部重新监听一下吧。。。 chrome 的 off online 不会走 其他error
    if (subscriptionMap.size > 0) {
      stompInfo.hasDisconnected = false;
      subscriptionMap.forEach((value, key) => {
        if (key) {
          const newValue = stompSubscribe(key);
          newValue && subscriptionMap.set(key, newValue);
        }
      });
    }
    stompInfo.alive = true;
  },
  onDisconnect(frame: IFrame) {
    stompInfo.alive = false;
  },
  // debug
  onChangeState(state: ActivationState) {
    const obj = ['ACTIVE', 'DEACTIVATING', 'INACTIVE'];
    stompInfo.alive = obj[state] === 'ACTIVE';
  },
  // 发生错误的监听
  onStompError(frame: IFrame) {
    const message = decoder.decode(frame.binaryBody);
    try {
      const obj = JSON.parse(message);
      if (obj?.code === '401') {
        warning('用户信息失效，请重新登录');
        // 可以做一些跳转到主页等逻辑
        // getInSigninPageWithLastRouteMsg();
      }
    } catch (e) {
      stompInfo.alive = false;
    }
    stompInfo.alive = false;
  },
  onWebSocketError(frame: IFrame) {
    stompInfo.hasDisconnected = true;
    stompInfo.alive = false;
  },
});

export const initStompData = () => {
  // 根据环境添加参数
  const stompConfig = getStompConfig({
    env: '',
    openDebug: false,
  });
  stompClient = new Client(stompConfig);
  activate();
};

const isStompConnected = () => stompClient && stompClient.connected;

const warpFuncWithConnectLogic: tempFunc =
  (func) =>
  async (...args) => {
    if (stompClient && isStompConnected()) {
      func(...args);
      return;
    }
    // 出现异常情况时 需要把订阅的 消息回调/发送消息 函数缓存起来，等连接成功后执行
    const [props] = args;
    const { destination, message } = props;
    if (!stompClient) {
      initStompData();
    }
    const key = `${destination}${message ?? ''}`;
    const funcArr = subscriptionFailedMap.get(key) ?? [];
    funcArr.push({ func, args });
    subscriptionFailedMap.set(key, funcArr);
  };

export const getInfo = () => ({
  webSocket: JSON.stringify(stompClient?.webSocket),
  disconnectHeaders: JSON.stringify(stompClient?.disconnectHeaders),
  connected: stompClient?.connected,
  connectedVersion: stompClient?.connectedVersion,
  active: stompClient?.active,
});

export const subscribe = warpFuncWithConnectLogic(
  (props: { uuid?: string; msgCallback?: React.MutableRefObject<any>; destination: string }) => {
    const { msgCallback, destination, uuid } = props;
    if (!msgCallback?.current || (uuid && uuidSet.has(uuid))) {
      return;
    }
    if (uuid) {
      uuidSet.add(uuid);
    }
    if (subscriptionMap.has(destination)) {
      const functionArr = subscriptionCallbackMap.get(destination) ?? [];
      functionArr.push(msgCallback);
      subscriptionCallbackMap.set(destination, functionArr);
      return;
    }
    const subscription = stompSubscribe(destination);

    if (!subscriptionMap.has(destination) && subscription) {
      subscriptionMap.set(destination, subscription);
      subscriptionCallbackMap.set(destination, [msgCallback]);
    }
  }
);
export function unsubscribe({
  destination,
  msgCallback,
  uuid,
}: {
  destination: string;
  msgCallback?: React.MutableRefObject<any>;
  uuid?: string;
}) {
  if (uuid) {
    uuidSet.delete(uuid);
  }
  // 取消订阅时，订阅失败的消息可能还存在于失败map中，这里需要清理一下
  let failedArr = subscriptionFailedMap.get(destination) ?? [];
  failedArr = failedArr.filter((item) => item.args[0].msgCallback !== msgCallback);
  if (isEmpty(failedArr)) {
    subscriptionFailedMap.delete(destination);
  } else {
    subscriptionFailedMap.set(destination, failedArr);
  }
  if (!subscriptionMap.has(destination)) {
    return;
  }
  let fucArr = subscriptionCallbackMap.get(destination) ?? [];
  fucArr = fucArr.filter((item) => item !== msgCallback);
  if (isEmpty(fucArr) && subscriptionMap.has(destination)) {
    subscriptionMap.get(destination)?.unsubscribe();
    subscriptionMap.delete(destination);
    subscriptionCallbackMap.delete(destination);
  } else {
    subscriptionCallbackMap.set(destination, fucArr);
  }
}

export const send = warpFuncWithConnectLogic((props: { message?: string; destination: string }) => {
  const { destination, message } = props;
  // 检测链接是否正常
  stompClient?.publish({
    destination,
    body: message,
  });
});
