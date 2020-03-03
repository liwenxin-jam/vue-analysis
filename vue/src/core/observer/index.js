/* @flow */

import Dep from './dep'
import VNode from '../vdom/vnode'
import { arrayMethods } from './array'
import {
  def,
  warn,
  hasOwn,
  hasProto,
  isObject,
  isPlainObject,
  isPrimitive,
  isUndef,
  isValidArrayIndex,
  isServerRendering
} from '../util/index'

const arrayKeys = Object.getOwnPropertyNames(arrayMethods)

/**
 * In some cases we may want to disable observation inside a component's
 * update computation.
 */
export let shouldObserve: boolean = true

export function toggleObserving (value: boolean) {
  shouldObserve = value
}

/**
 * Observer class that is attached to each observed
 * object. Once attached, the observer converts the target
 * object's property keys into getter/setters that
 * collect dependencies and dispatch updates.
 */
// 每一个响应式对象都会有一个ob
export class Observer {
  value: any;
  dep: Dep;
  vmCount: number; // number of vms that have this object as root $data

  constructor (value: any) {
    this.value = value
    // 为什么在Observer里面声明dep? 给$set使用，当嵌套属性需要通知更新
    // object里面新增或者删除属性
    // arrary有操作新元素的变更方法 例如 push unshift splice等
    // 需要借助dep去通知响应式数据更新，例如使用$set
    this.dep = new Dep()
    this.vmCount = 0
    // 设置一个__ob__属性引用当前Observer实例
    def(value, '__ob__', this)
    // 判断数据类型，如果是数组，触发 observeArray 方法，遍历执行 observe 方法
    if (Array.isArray(value)) {
      // 对数组某些方法进行拦截，例如会新增item的方法，如push、unshift、splice
      // 浏览器中数组是没有原型的
      // 替换数组对象原型，arrayMethods是经过劫持处理后的数组原型
      if (hasProto) {
        // 直接覆盖原型 __proto__
        protoAugment(value, arrayMethods)
      } else {
        // 粗暴覆盖
        copyAugment(value, arrayMethods, arrayKeys)
      }
      // 如果数组里面元素是对象还需要做响应式处理
      this.observeArray(value)
    } else {
      // 如果是普通对象，触发walk方法
      this.walk(value)
    }
  }

  /**
   * Walk through all properties and convert them into
   * getter/setters. This method should only be called when
   * value type is Object.
   */
  // 方法中遍历了数据对象，为对象每个属性执行 defineReactive 方法
  // 【找到 defineReactive 方法，该方法为 mvvm 数据变化检测的核心】
  walk (obj: Object) {
    const keys = Object.keys(obj)
    for (let i = 0; i < keys.length; i++) {
      // 对每个key增加响应式监听
      defineReactive(obj, keys[i])
    }
  }

  /**
   * Observe a list of Array items.
   */
  observeArray (items: Array<any>) {
    for (let i = 0, l = items.length; i < l; i++) {
      observe(items[i])
    }
  }
}

// helpers

/**
 * Augment a target Object or Array by intercepting
 * the prototype chain using __proto__
 */
function protoAugment (target, src: Object) {
  /* eslint-disable no-proto */
  target.__proto__ = src
  /* eslint-enable no-proto */
}

/**
 * Augment a target Object or Array by defining
 * hidden properties.
 */
/* istanbul ignore next */
function copyAugment (target: Object, src: Object, keys: Array<string>) {
  for (let i = 0, l = keys.length; i < l; i++) {
    const key = keys[i]
    def(target, key, src[key])
  }
}

/**
 * Attempt to create an observer instance for a value,
 * returns the new observer if successfully observed,
 * or the existing observer if the value already has one.
 */
// 重点在 observe 方法, 返回一个observe对象
export function observe (value: any, asRootData: ?boolean): Observer | void {
  // 如果是 对象 或是一个 VNode 直接返回
  if (!isObject(value) || value instanceof VNode) {
    return
  }
  // 观察者
  let ob: Observer | void
  // 若对象上存在 __ob__ 并且 是 Observer 对象实例，说明已经是响应式，直接返回
  if (hasOwn(value, '__ob__') && value.__ob__ instanceof Observer) {
    ob = value.__ob__
  } else if (
    shouldObserve &&
    !isServerRendering() &&
    (Array.isArray(value) || isPlainObject(value)) &&
    Object.isExtensible(value) &&
    !value._isVue
  ) {
    // 通过传入的值创建并最终返回一个Observer类的实例对象
    ob = new Observer(value)
  }
  if (asRootData && ob) {
    ob.vmCount++
  }
  return ob
}

/**
 * Define a reactive property on an Object.
 */
// 该方法为 mvvm 数据变化检测的核心，给data中每一个key定义数据劫持
export function defineReactive (
  obj: Object,
  key: string,
  val: any,
  customSetter?: ?Function,
  shallow?: boolean
) {
  // 和key 一一对应
  const dep = new Dep()

  const property = Object.getOwnPropertyDescriptor(obj, key)
  if (property && property.configurable === false) {
    return
  }

  // cater for pre-defined getter/setters
  const getter = property && property.get
  const setter = property && property.set
  // 当只传了 obj key时，只有在没有 getter或设置的 setter 的情况下，defineReactive才会获取对象的属性
  if ((!getter || setter) && arguments.length === 2) {
    val = obj[key]
  }

  // 属性拦截，只要是对象类型均会返回childOb，递归子级
  let childOb = !shallow && observe(val)
  // 定义数据拦截，为对象属性添加 set 和 get 方法
  Object.defineProperty(obj, key, {
    enumerable: true,
    configurable: true,
    get: function reactiveGetter () {
      // 获取key对应的值
      const value = getter ? getter.call(obj) : val
      // Dep.target && dep.addDep()
      // 如果存在依赖
      if (Dep.target) {
        // vue 在 get 方法中执行 dep.depend() 方法
        // 依赖收集
        dep.depend() // 追加依赖关系
        // 如果有子ob存在，子ob也收集这个依赖
        if (childOb) {
          childOb.dep.depend()
          // 如果是数组还要继续处理
          if (Array.isArray(value)) {
            dependArray(value)
          }
        }
      }
      return value
    },
    set: function reactiveSetter (newVal) {
      // 首先会针对通过用户自定义的 get 求值，未定义则不求值
      const value = getter ? getter.call(obj) : val
      // 新旧值相同 return , 打破了自定义对象的行为。如果我们定义 Object.defineProperty(obj, 'x', ... set: ...)并运行
      // obj.x = obj.x 那么通常setter将运行，但 newVal === value会破坏此逻辑并阻止setter运行
      // 所以加了 newVal !== newVal && value !== value 例外
      /* eslint-disable no-self-compare */
      if (newVal === value || (newVal !== newVal && value !== value)) {
        return
      }
      /* eslint-enable no-self-compare */
      if (process.env.NODE_ENV !== 'production' && customSetter) {
        customSetter()
      }
      // #7981: for accessor properties without setter
      if (getter && !setter) return
      // 如果定义了自定义 set 方法，调用自定义 set
      if (setter) {
        setter.call(obj, newVal)
      } else {
        val = newVal
      }
      // 如果新值也是一个对象，调用 observe 变成一个响应式对象
      childOb = !shallow && observe(newVal)
      // 通知更新
      dep.notify()
    }
  })
}

/**
 * Set a property on an object. Adds the new property and
 * triggers change notification if the property doesn't
 * already exist.
 */
export function set (target: Array<any> | Object, key: any, val: any): any {
  if (process.env.NODE_ENV !== 'production' &&
    (isUndef(target) || isPrimitive(target))
  ) {
    warn(`Cannot set reactive property on undefined, null, or primitive value: ${(target: any)}`)
  }
  if (Array.isArray(target) && isValidArrayIndex(key)) {
    target.length = Math.max(target.length, key)
    target.splice(key, 1, val)
    return val
  }
  if (key in target && !(key in Object.prototype)) {
    target[key] = val
    return val
  }
  const ob = (target: any).__ob__
  if (target._isVue || (ob && ob.vmCount)) {
    process.env.NODE_ENV !== 'production' && warn(
      'Avoid adding reactive properties to a Vue instance or its root $data ' +
      'at runtime - declare it upfront in the data option.'
    )
    return val
  }
  // 普通赋值
  if (!ob) {
    target[key] = val
    return val
  }
  // 响应式处理
  defineReactive(ob.value, key, val)
  // 通知更新
  ob.dep.notify()
  return val
}

/**
 * Delete a property and trigger change if necessary.
 */
export function del (target: Array<any> | Object, key: any) {
  if (process.env.NODE_ENV !== 'production' &&
    (isUndef(target) || isPrimitive(target))
  ) {
    warn(`Cannot delete reactive property on undefined, null, or primitive value: ${(target: any)}`)
  }
  if (Array.isArray(target) && isValidArrayIndex(key)) {
    target.splice(key, 1)
    return
  }
  const ob = (target: any).__ob__
  if (target._isVue || (ob && ob.vmCount)) {
    process.env.NODE_ENV !== 'production' && warn(
      'Avoid deleting properties on a Vue instance or its root $data ' +
      '- just set it to null.'
    )
    return
  }
  if (!hasOwn(target, key)) {
    return
  }
  delete target[key]
  if (!ob) {
    return
  }
  ob.dep.notify()
}

/**
 * Collect dependencies on array elements when the array is touched, since
 * we cannot intercept array element access like property getters.
 */
function dependArray (value: Array<any>) {
  for (let e, i = 0, l = value.length; i < l; i++) {
    e = value[i]
    e && e.__ob__ && e.__ob__.dep.depend()
    if (Array.isArray(e)) {
      dependArray(e)
    }
  }
}
