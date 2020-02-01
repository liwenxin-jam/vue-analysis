/* @flow */

/**
 * 事件模块
 * 导出:
 *   * eventsMixin: Vue.prototype的events包装函数
 *   * initEvents: vue实例的events包装函数
 */

import {
  tip,
  toArray,
  hyphenate,
  formatComponentName,
  invokeWithErrorHandling
} from '../util/index'
import { updateListeners } from '../vdom/helpers/index'

// 初始化events，获取父级 listeners
export function initEvents (vm: Component) {
  // 初始化设置实例_events属性
  vm._events = Object.create(null)
  // 是否有钩子事件设为false
  vm._hasHookEvent = false
  // init parent attached events
  // 自定义组件中真正做事件监听的是事件派发者自已，也就是子组件
  const listeners = vm.$options._parentListeners
  if (listeners) {
    // 事件谁派发，谁监听。即谁$emit，就谁$on 例如简化版组件监听 <comp @update="" />
    updateComponentListeners(vm, listeners)
  }
}

let target: any
// 内部使用的快捷on方法
function add (event, fn) {
  target.$on(event, fn)
}

// 内部使用的快捷off方法
function remove (event, fn) {
  target.$off(event, fn)
}

function createOnceHandler (event, fn) {
  const _target = target
  return function onceHandler () {
    const res = fn.apply(null, arguments)
    if (res !== null) {
      _target.$off(event, onceHandler)
    }
  }
}

export function updateComponentListeners (
  vm: Component,
  listeners: Object,
  oldListeners: ?Object
) {
  target = vm
  updateListeners(listeners, oldListeners || {}, add, remove, createOnceHandler, vm)
  target = undefined
}

// events事件绑定
export function eventsMixin (Vue: Class<Component>) {
  // 钩子事件的正则匹配
  const hookRE = /^hook:/
  // 参考文档: https://cn.vuejs.org/v2/api/#vm-on-event-callback
  // 监听当前实例上的自定义事件。事件可以由vm.$emit触发。回调函数会接收所有传入事件触发函数的额外参数。
  // $on(['evt1', 'evt2'], cb1) 和 $on(['evt1'], cb2) ，事件和回调是 n:n关系
  Vue.prototype.$on = function (event: string | Array<string>, fn: Function): Component {
    const vm: Component = this
    // event是数组则递归调用$on
    if (Array.isArray(event)) {
      for (let i = 0, l = event.length; i < l; i++) {
        vm.$on(event[i], fn)
      }
    } else {
      // 实例上注册的事件每一个都是一个数组，把事件名称和回调函数存入vm._events
      (vm._events[event] || (vm._events[event] = [])).push(fn)

      // optimize hook:event cost by using a boolean flag marked at registration
      // instead of a hash lookup
      // 若存在hook事件则添加标记
      if (hookRE.test(event)) {
        // 如果是 event 字符串中有 hook:，修改 vm._hasHookEvent 的状态。如果 _hasHookEvent 为 true
        // 那么在触发各类生命周期钩子的时候会触发如 hook:created 事件
        vm._hasHookEvent = true
      }
    }
    return vm
  }

  // $once方法，实际是调用$on方法，监听一个自定义事件，但是只触发一次，在第一次触发之后移除监听器。
  // 更改了事件句柄，在原句柄执行前先执行off方法解绑事件
  Vue.prototype.$once = function (event: string, fn: Function): Component {
    const vm: Component = this
    // 高阶函数，仅执行一次回调fn就立刻解除监听
    function on () {
      vm.$off(event, on)
      fn.apply(vm, arguments)
    }
    on.fn = fn
    vm.$on(event, on)
    return vm
  }

  // $off解绑事件
  Vue.prototype.$off = function (event?: string | Array<string>, fn?: Function): Component {
    const vm: Component = this
    // all
    // 无参数：清除所有事件监听
    if (!arguments.length) {
      vm._events = Object.create(null)
      return vm
    }
    // array of events
    // events为数组，同时解绑多个事件, 递归调用
    if (Array.isArray(event)) {
      for (let i = 0, l = event.length; i < l; i++) {
        vm.$off(event[i], fn)
      }
      return vm
    }
    // specific event
    // 解除特定事件，某个具体事件名称句柄
    const cbs = vm._events[event]
    // 没有这个监听事件，直接返回vm
    if (!cbs) {
      return vm
    }
    // vm.off(xxx) 解绑xxx
    // 设置实例xxx的事件为null
    if (!fn) {
      vm._events[event] = null
      return vm
    }
    // 卸载某一事件多个句柄中的一个
    // specific handler
    let cb
    let i = cbs.length
    while (i--) {
      // cbs = vm._events[event] 是一个数组
      cb = cbs[i]
      if (cb === fn || cb.fn === fn) {
        // 移除 fn 这个事件监听器
        cbs.splice(i, 1)
        break
      }
    }
    return vm
  }

  // 触发当前实例上的事件。附加参数都会传给监听器回调。
  Vue.prototype.$emit = function (event: string): Component {
    const vm: Component = this

    // 开发环境对大小写的提示
    if (process.env.NODE_ENV !== 'production') {
      const lowerCaseEvent = event.toLowerCase()
      if (lowerCaseEvent !== event && vm._events[lowerCaseEvent]) {
        tip(
          `Event "${lowerCaseEvent}" is emitted in component ` +
          `${formatComponentName(vm)} but the handler is registered for "${event}". ` +
          `Note that HTML attributes are case-insensitive and you cannot use ` +
          `v-on to listen to camelCase events when using in-DOM templates. ` +
          `You should probably use "${hyphenate(event)}" instead of "${event}".`
        )
      }
    }

    // 循环调用句柄 首先获取 vm._events[event] 数组
    let cbs = vm._events[event]
    if (cbs) {
      cbs = cbs.length > 1 ? toArray(cbs) : cbs
      // arguments第0个参数为eventName，故从第1个参数转为数组，再通过apply传入
      const args = toArray(arguments, 1)
      const info = `event handler for "${event}"`
      // 从第二个参数开始获取作为触发方法的传参 args，遍历事件监听器数组传参执行回调函数
      for (let i = 0, l = cbs.length; i < l; i++) {
        invokeWithErrorHandling(cbs[i], vm, args, vm, info)
      }
    }
    return vm
  }
}
