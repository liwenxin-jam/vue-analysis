/* @flow */

import {
  warn,
  remove,
  isObject,
  parsePath,
  _Set as Set,
  handleError,
  noop
} from '../util/index'

import { traverse } from './traverse'
import { queueWatcher } from './scheduler'
import Dep, { pushTarget, popTarget } from './dep'

import type { SimpleSet } from '../util/index'

let uid = 0

/**
 * A watcher parses an expression, collects dependencies,
 * and fires callback when the expression value changes.
 * This is used for both the $watch() api and directives.
 */
export default class Watcher {
  vm: Component;
  expression: string;
  cb: Function;
  id: number;
  deep: boolean;
  user: boolean;
  lazy: boolean;
  sync: boolean;
  dirty: boolean;
  active: boolean;
  deps: Array<Dep>;
  newDeps: Array<Dep>;
  depIds: SimpleSet;
  newDepIds: SimpleSet;
  before: ?Function;
  getter: Function;
  value: any;

  constructor (
    vm: Component,                  // vm实例
    expOrFn: string | Function,     // 最终做为 watcher 的 getter    updateComponent
    cb: Function,                   // 回调函数
    options?: ?Object,              // 配置对象 渲染函数时 有 before 函数
    isRenderWatcher?: boolean       // 是否是渲染 watch
  ) {
    this.vm = vm
    // 是否是渲染 watcher ，如果是把 this 缓存在 vm._watcher 上
    if (isRenderWatcher) {
      vm._watcher = this
    }
    // push 进 _watchers 数组
    vm._watchers.push(this)
    // options
    // 修饰符的处理
    if (options) {
      this.deep = !!options.deep    // 用户定义 watch 深层遍历监听数据变化
      this.user = !!options.user    // 是否是 user watch
      this.lazy = !!options.lazy    // 是否是 computed watch
      this.sync = !!options.sync    // 同步
      this.before = options.before  // 这里是 before 函数，里面执行了 callHook(vm, 'beforeUpdate') 钩子
    } else {
      this.deep = this.user = this.lazy = this.sync = false   // 如果没有转入，统一置为 false
    }
    this.cb = cb                          // 这很重要，自增的，用于标识这个 watcher, 默认为 0，++在前面，第一个为1
    this.id = ++uid // uid for batching   // 标识当前为 活动watch
    this.active = true                    // 为 computed watchers 特有属性
    this.dirty = this.lazy // for lazy watchers
    this.deps = []
    this.newDeps = []

    // Set对象是值的集合，你可以按照插入的顺序迭代它的元素, Set 中的元素是唯一的
    // Set.prototype.size         返回Set对象的值的个数
    // Set.prototype.add(value)   在Set对象尾部添加一个元素。返回该Set对象
    // Set.prototype.clear()      移除Set对象内的所有元素。
    // Set.prototype.has(value)   返回一个布尔值，表示该值在Set中存在与否
    // Set.prototype.delete(value) 移除Set的中与这个值相等的元素
    // 用forEach迭代
    // mySet.forEach(function(value) {
    //   console.log(value);
    // });
    this.depIds = new Set()     // 用于在更新时，缓存依赖ID
    this.newDepIds = new Set()
    this.expression = process.env.NODE_ENV !== 'production'
      ? expOrFn.toString()
      : ''
    // parse expression for getter
    if (typeof expOrFn === 'function') {
      this.getter = expOrFn
      // 当是在render Watchers 时为     updateComponent = () => {
      //                                   vm._update(vm._render(), hydrating)
      //                               }
    } else {
      // 当为 computed watchers 时，他通过 parsePath 转换为get函数。传入字符串，通过parsePath获取data上的值
      this.getter = parsePath(expOrFn)
      if (!this.getter) {
        this.getter = noop
        process.env.NODE_ENV !== 'production' && warn(
          `Failed watching path: "${expOrFn}" ` +
          'Watcher only accepts simple dot-delimited paths. ' +
          'For full control, use a function instead.',
          vm
        )
      }
    }
    // 最后通过get()方法求值
    this.value = this.lazy
      ? undefined
      : this.get()
  }

  /**
   * Evaluate the getter, and re-collect dependencies.
   * Watcher的构造函数最终调用了 get 方法
   */
  get () {
    // 将当前 Watcher 实例传递给 Dep 的 Dep.target, 渲染下一个 watch 时，会把 上一个 watch push 进 targetStack 数组
    pushTarget(this)
    let value
    const vm = this.vm
    try {
      // 执行 Watcher 所监测的数据的 getter 方法。 渲染 watch 时也就是执行 updateComponent
      // 触发依赖收集
      value = this.getter.call(vm, vm)
    } catch (e) {
      if (this.user) {
        handleError(e, vm, `getter for watcher "${this.expression}"`)
      } else {
        throw e
      }
    } finally {
      // "touch" every property so they are all tracked as
      // dependencies for deep watching
      if (this.deep) {
        traverse(value)
      }
      // ** 渲染完当前 watch时，将， 将 Dep.target 恢复到上一个值
      popTarget()
      // 将当前 Watcher 从 Dep 的 subs 中去除
      this.cleanupDeps()
    }
    return value
  }

  /**
   * Add a dependency to this directive.
   */
  // 相互关系的建立，彼此依赖
  addDep (dep: Dep) {
    const id = dep.id
    if (!this.newDepIds.has(id)) {
      // set 关系映射
      this.newDepIds.add(id)
      this.newDeps.push(dep)
      if (!this.depIds.has(id)) {
        dep.addSub(this)
      }
    }
  }

  /**
   * Clean up for dependency collection.
   * 清理依赖项集合
   */
  cleanupDeps () {
    let i = this.deps.length
    while (i--) {
      const dep = this.deps[i]
      if (!this.newDepIds.has(dep.id)) {
        dep.removeSub(this)
      }
    }
    let tmp = this.depIds
    this.depIds = this.newDepIds
    this.newDepIds = tmp
    this.newDepIds.clear()
    tmp = this.deps
    this.deps = this.newDeps
    this.newDeps = tmp
    this.newDeps.length = 0
  }

  /**
   * Subscriber interface.
   * Will be called when a dependency changes.
   */
  update () {
    /* istanbul ignore else */
    if (this.lazy) {
      this.dirty = true
    } else if (this.sync) {
      this.run()
    } else {
      // 正常不设置任何更新配置，都会走这里
      queueWatcher(this)
    }
  }

  /**
   * Scheduler job interface.
   * Will be called by the scheduler.
   */
  run () {
    // 销毁 组件时，先把 active 置为 false
    if (this.active) {
      // 先通过 get 方法求值
      // 如果求值不一样 或者 value 是一个对象 或者 deep watcher 的话
      const value = this.get()
      if (
        value !== this.value ||
        // Deep watchers and watchers on Object/Arrays should fire even
        // when the value is the same, because the value may
        // have mutated.
        isObject(value) ||
        this.deep
      ) {
        // set new value
        const oldValue = this.value
        this.value = value
        // 如果是 user watcher
        if (this.user) {
          try {
            this.cb.call(this.vm, value, oldValue)
          } catch (e) {
            handleError(e, this.vm, `callback for watcher "${this.expression}"`)
          }
        } else {
          // **这里的 cb 回调函数传递的参数就是 value 和 oldValue。
          this.cb.call(this.vm, value, oldValue)
        }
      }
    }
  }

  /**
   * Evaluate the value of the watcher.
   * This only gets called for lazy watchers.
   */
  evaluate () {
    this.value = this.get()
    this.dirty = false
  }

  /**
   * Depend on all deps collected by this watcher.
   */
  depend () {
    let i = this.deps.length
    while (i--) {
      this.deps[i].depend()
    }
  }

  /**
   * Remove self from all dependencies' subscriber list.
   */
  teardown () {
    if (this.active) {
      // remove self from vm's watcher list
      // this is a somewhat expensive operation so we skip it
      // if the vm is being destroyed.
      if (!this.vm._isBeingDestroyed) {
        remove(this.vm._watchers, this)
      }
      let i = this.deps.length
      while (i--) {
        this.deps[i].removeSub(this)
      }
      this.active = false
    }
  }
}
