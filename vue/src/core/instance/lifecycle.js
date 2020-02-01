/* @flow */

/**
 * 生命周期模块
 * 导出:
 *   * lifecycleMixin: Vue.prototype的生命周期包装函数
 *   * initLifecycle: vue实例的生命周期包装函数
 *   * callHook: 生命周期调用方法
 *   * mountComponent: 提供vue.prototype.$mount
 */

import config from '../config'
import Watcher from '../observer/watcher'
import { mark, measure } from '../util/perf'
import { createEmptyVNode } from '../vdom/vnode'
import { updateComponentListeners } from './events'
import { resolveSlots } from './render-helpers/resolve-slots'
import { toggleObserving } from '../observer/index'
import { pushTarget, popTarget } from '../observer/dep'

import {
  warn,
  noop,
  remove,
  emptyObject,
  validateProp,
  invokeWithErrorHandling
} from '../util/index'

// 正在进行操作的vm实例, 属于公共资源，全局属性
export let activeInstance: any = null
export let isUpdatingChildComponent: boolean = false

export function setActiveInstance(vm: Component) {
  // 前一个 vm 实例
  const prevActiveInstance = activeInstance
  // 当前激活实例为当前 vm
  activeInstance = vm
  return () => {
    activeInstance = prevActiveInstance
  }
}

// 添加vue实例私有对象和属性
export function initLifecycle (vm: Component) {
  const options = vm.$options

  // 取得第一个非abstract类型的parent实例
  // locate first non-abstract parent
  let parent = options.parent
  if (parent && !options.abstract) {
    while (parent.$options.abstract && parent.$parent) {
      parent = parent.$parent
    }
    // 将当前实例加入到parent的$children数组中
    parent.$children.push(vm)
  }

  // 设置$parent
  vm.$parent = parent

  // $root设为最外层的vm对象实例
  // 取parent的$root属性， 若没有parent则自己就是最外层，取当前实例
  vm.$root = parent ? parent.$root : vm

  // 存储子组件的数组
  vm.$children = []

  vm.$refs = {}

  // 组件相关生命周期状态设置初始值
  vm._watcher = null
  vm._inactive = null
  vm._directInactive = false

  // 是否已经加载
  vm._isMounted = false
  // 是否已经被卸载
  vm._isDestroyed = false
  // 是否正在被卸载, 因为有异步处理
  vm._isBeingDestroyed = false
}

export function lifecycleMixin (Vue: Class<Component>) {
  // 组件更新操作
  // _update方法接收一个VNode，之后通过调用__patch__方法，把VNode渲染成真实的DOM
  Vue.prototype._update = function (vnode: VNode, hydrating?: boolean) {
    const vm: Component = this
    // 定义变量为数据改变时调用，首次挂载时为空。
    const prevEl = vm.$el
    // 前一个 vnode
    const prevVnode = vm._vnode
    const restoreActiveInstance = setActiveInstance(vm)
    // 把 vnode 挂载到 vm._vnode 上 ， vm._vnode为组件渲染vnode
    vm._vnode = vnode

    // Vue.prototype.__patch__ is injected in entry points
    // based on the rendering backend used.
    // vm.__patch__方法在入口文件中定义，根据渲染平台的不同而有不同的实现
    // 对比更新，初次渲染会走到 vm.__patch__ 方法中，这个方法就是比对虚拟 DOM ，局部更新 DOM 的方法
    if (!prevVnode) {
      // initial render
      // 初始化渲染 第一次渲染是真实的dom vm.$el
      vm.$el = vm.__patch__(vm.$el, vnode, hydrating, false /* removeOnly */)
    } else {
      // updates diff算法
      // 更新渲染 第二次再渲染是虚拟dom prevVnode
      vm.$el = vm.__patch__(prevVnode, vnode)
    }
    restoreActiveInstance()
    // update __vue__ reference
    if (prevEl) {
      prevEl.__vue__ = null
    }
    if (vm.$el) {
      vm.$el.__vue__ = vm
    }
    // if parent is an HOC, update its $el as well
    // vm.$vnode为组件的占位vnode
    if (vm.$vnode && vm.$parent && vm.$vnode === vm.$parent._vnode) {
      vm.$parent.$el = vm.$el
    }
    // updated hook is called by the scheduler to ensure that children are
    // updated in a parent's updated hook.
  }

  // 强制更新操作
  Vue.prototype.$forceUpdate = function () {
    const vm: Component = this
    if (vm._watcher) {
      // 实际执行的实例watcher的update方法
      vm._watcher.update()
    }
  }

  // vue实例销毁函数
  Vue.prototype.$destroy = function () {
    const vm: Component = this

    // 防止重复执行
    if (vm._isBeingDestroyed) {
      return
    }

    // 调用beforeDestroy的钩子，先父后子
    callHook(vm, 'beforeDestroy')

    // 设置正在销毁tag
    vm._isBeingDestroyed = true

    // 将实例从父组件中移除
    // 从父组件$children数组中移除
    // 实例不能使abstract类型, 且有父组件存在
    // remove self from parent
    const parent = vm.$parent
    if (parent && !parent._isBeingDestroyed && !vm.$options.abstract) {
      remove(parent.$children, vm)
    }

    // 卸载watcher
    // teardown watchers
    if (vm._watcher) {
      vm._watcher.teardown()
    }
    let i = vm._watchers.length
    while (i--) {
      vm._watchers[i].teardown()
    }
    // remove reference from data ob
    // frozen object may not have observer.
    if (vm._data.__ob__) {
      vm._data.__ob__.vmCount--
    }

    // 设置标志位，是否已经卸载
    // call the last hook...
    vm._isDestroyed = true

    // invoke destroy hooks on current rendered tree
    // 执行子组件的销毁工作，递归完成子组件销毁
    vm.__patch__(vm._vnode, null)

    // fire destroyed hook
    // 调用destroyed钩子 先子后父
    callHook(vm, 'destroyed')

    // 解绑所有事件监听
    // turn off all instance listeners.
    vm.$off()

    // remove __vue__ reference
    if (vm.$el) {
      vm.$el.__vue__ = null
    }
    // release circular reference (#6759)
    if (vm.$vnode) {
      vm.$vnode.parent = null
    }
  }
}

// vue最终通过mountComponent去挂载，对外导出的装载函数
// 只有runtime的vue才打包该函数作为vm.$mount
export function mountComponent (
  vm: Component,
  el: ?Element,
  hydrating?: boolean
): Component {
  // $el设为装载元素
  vm.$el = el

  // 如果options中没有设置render方法，则render指定为createEmptyVNode
  // render函数肯定会有，预编译的编译好后就有render, 非预编译的$mount装载时compile成render
  // 除非实时编译的，却引入了runtime版本的vue, 则在开发环境下作提示
  if (!vm.$options.render) {
    vm.$options.render = createEmptyVNode
    if (process.env.NODE_ENV !== 'production') {
      // 若定义了template并且不是 “#id” ,又没定义render函数
      // 这里vm.$options.el || el可忽略, 定义了el，但未定义render函数
      /* istanbul ignore if */
      if ((vm.$options.template && vm.$options.template.charAt(0) !== '#') ||
        vm.$options.el || el) {
        warn(
          'You are using the runtime-only build of Vue where the template ' +
          'compiler is not available. Either pre-compile the templates into ' +
          'render functions, or use the compiler-included build.',
          vm
        )
      } else {
        // 如果template和都没有定义
        warn(
          'Failed to mount component: template or render function not defined.',
          vm
        )
      }
    }
  }

  // 调用beforeMount钩子
  // **在挂载开始之前被调用：相关的 render 函数首次被调用。该钩子在服务器端渲染期间不被调用。
  // beforeMount 执行顺序先父后子
  callHook(vm, 'beforeMount')

  // 测试环境会在update前后输出一系列console, 所以与生产环境updateComponent设置不同
  let updateComponent
  // 性能锚点
  /* istanbul ignore if */
  if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
    updateComponent = () => {
      const name = vm._name
      const id = vm._uid
      const startTag = `vue-perf-start:${id}`
      const endTag = `vue-perf-end:${id}`

      mark(startTag)
      const vnode = vm._render()
      mark(endTag)
      measure(`vue ${name} render`, startTag, endTag)

      mark(startTag)
      vm._update(vnode, hydrating)  // 开发环境中
      mark(endTag)
      measure(`vue ${name} patch`, startTag, endTag)
    }
  } else {
    // 设置更新组件函数
    updateComponent = () => {
      // vm._render() 拿到最新的虚拟VNode
      // update 进行具体的patch操作，把虚拟dom转成真实dom
      vm._update(vm._render(), hydrating)  // 生产环境中
    }
  }

  // we set this to vm._watcher inside the watcher's constructor
  // since the watcher's initial patch may call $forceUpdate (e.g. inside child
  // component's mounted hook), which relies on vm._watcher being already defined
  // 实例化一个渲染Watcher
  // 这里把 updateComponent 作为 Watcher 的 getter; callBack 为 noop; options 里只定义了 一个 before 函数
  // before 函数里定义了 beforeUpdate 生命周期钩子
  new Watcher(vm, updateComponent, noop, {
    // 在 core/observer/scheduler.js 中的 flushSchedulerQueue 方法判断执行
    before () {
      // 如果是已经挂载的，就触发beforeUpdate方法。
      // 数据更新时调用，发生在虚拟 DOM 打补丁之前。这里适合在更新之前访问现有的 DOM，比如手动移除已添加的事件监听器。
      if (vm._isMounted && !vm._isDestroyed) {
        callHook(vm, 'beforeUpdate')
      }
    }
  }, true /* isRenderWatcher */)
  hydrating = false

  // manually mounted instance, call mounted on self
  // mounted is called for render-created child components in its inserted hook
  if (vm.$vnode == null) {
    // 设置已装载标志位
    vm._isMounted = true
    // el 被新创建的 vm.$el 替换，并挂载到实例上去之后调用该钩子。
    // 如果 root 实例挂载了一个文档内元素，当 mounted 被调用时 vm.$el 也在文档内。
    // mounted 执行顺序先子后父
    callHook(vm, 'mounted')
  }
  return vm
}

export function updateChildComponent (
  vm: Component,
  propsData: ?Object,
  listeners: ?Object,
  parentVnode: MountedComponentVNode,
  renderChildren: ?Array<VNode>
) {
  if (process.env.NODE_ENV !== 'production') {
    isUpdatingChildComponent = true
  }

  // determine whether component has slot children
  // we need to do this before overwriting $options._renderChildren.

  // check if there are dynamic scopedSlots (hand-written or compiled but with
  // dynamic slot names). Static scoped slots compiled from template has the
  // "$stable" marker.
  const newScopedSlots = parentVnode.data.scopedSlots
  const oldScopedSlots = vm.$scopedSlots
  const hasDynamicScopedSlot = !!(
    (newScopedSlots && !newScopedSlots.$stable) ||
    (oldScopedSlots !== emptyObject && !oldScopedSlots.$stable) ||
    (newScopedSlots && vm.$scopedSlots.$key !== newScopedSlots.$key)
  )

  // Any static slot children from the parent may have changed during parent's
  // update. Dynamic scoped slots may also have changed. In such cases, a forced
  // update is necessary to ensure correctness.
  const needsForceUpdate = !!(
    renderChildren ||               // has new static slots
    vm.$options._renderChildren ||  // has old static slots
    hasDynamicScopedSlot
  )

  vm.$options._parentVnode = parentVnode
  vm.$vnode = parentVnode // update vm's placeholder node without re-render

  if (vm._vnode) { // update child tree's parent
    vm._vnode.parent = parentVnode
  }
  vm.$options._renderChildren = renderChildren

  // update $attrs and $listeners hash
  // these are also reactive so they may trigger child update if the child
  // used them during render
  vm.$attrs = parentVnode.data.attrs || emptyObject
  vm.$listeners = listeners || emptyObject

  // update props
  if (propsData && vm.$options.props) {
    toggleObserving(false)
    const props = vm._props
    const propKeys = vm.$options._propKeys || []
    for (let i = 0; i < propKeys.length; i++) {
      const key = propKeys[i]
      const propOptions: any = vm.$options.props // wtf flow?
      props[key] = validateProp(key, propOptions, propsData, vm)
    }
    toggleObserving(true)
    // keep a copy of raw propsData
    vm.$options.propsData = propsData
  }

  // update listeners
  listeners = listeners || emptyObject
  const oldListeners = vm.$options._parentListeners
  vm.$options._parentListeners = listeners
  updateComponentListeners(vm, listeners, oldListeners)

  // resolve slots + force update if has children
  if (needsForceUpdate) {
    vm.$slots = resolveSlots(renderChildren, parentVnode.context)
    vm.$forceUpdate()
  }

  if (process.env.NODE_ENV !== 'production') {
    isUpdatingChildComponent = false
  }
}

function isInInactiveTree (vm) {
  while (vm && (vm = vm.$parent)) {
    if (vm._inactive) return true
  }
  return false
}

// 向外提供调用组件activated钩子
export function activateChildComponent (vm: Component, direct?: boolean) {
  if (direct) {
    vm._directInactive = false
    if (isInInactiveTree(vm)) {
      return
    }
  } else if (vm._directInactive) {
    return
  }
  if (vm._inactive || vm._inactive === null) {
    vm._inactive = false
    for (let i = 0; i < vm.$children.length; i++) {
      activateChildComponent(vm.$children[i])
    }
    callHook(vm, 'activated')
  }
}

// 向外提供调用组件deactivated钩子
export function deactivateChildComponent (vm: Component, direct?: boolean) {
  if (direct) {
    vm._directInactive = true
    if (isInInactiveTree(vm)) {
      return
    }
  }
  if (!vm._inactive) {
    vm._inactive = true
    for (let i = 0; i < vm.$children.length; i++) {
      deactivateChildComponent(vm.$children[i])
    }
    callHook(vm, 'deactivated')
  }
}

// 生命周期调用方法
// @param vm 组件
// @param hook 调用的生命周期名称
// 生命周期方法都存于组件的$options中
// 最终执行生命周期的函数都是调用 callHook 方法
export function callHook (vm: Component, hook: string) {
  // #7573 disable dep collection when invoking lifecycle hooks
  pushTarget()
  // 根据传入的字符串 hook，去拿到 vm.$options[hook] 对应的回调函数数组
  const handlers = vm.$options[hook]
  const info = `${hook} hook`
  // 循环执行周期函数句柄, options[lifecycleName]是一个数组
  if (handlers) {
    // 遍历执行，执行的时候把 vm 作为函数执行的上下文
    for (let i = 0, j = handlers.length; i < j; i++) {
      invokeWithErrorHandling(handlers[i], vm, null, vm, info)
    }
  }
  // 在Vue当中，hooks可以作为一种event，在Vue的源码当中，称之为hookEvent。
  // 场景:有一个来自第三方的复杂表格组件，表格进行数据更新的时候渲染时间需要1s，由于渲染时间较 长，为了更好的用户体验，我希望在表格进行更新时显示一个loading动画。修改源码这个方案很不优雅。
  // <Table @hook:updated="handleTableUpdated"></Table>
  // 如果标记了钩子事件，则额外派发一个自定义事件出去
  if (vm._hasHookEvent) {
    vm.$emit('hook:' + hook)
  }
  popTarget()
}
