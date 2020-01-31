/* @flow */

/**
 * render模块
 * 导出:
 *   * renderMixin: Vue.prototype的包装函数
 *   * initRender: vue实例的包装函数
 */

import {
  warn,
  nextTick,
  emptyObject,
  handleError,
  defineReactive
} from '../util/index'

import { createElement } from '../vdom/create-element'
import { installRenderHelpers } from './render-helpers/index'
import { resolveSlots } from './render-helpers/resolve-slots'
import { normalizeScopedSlots } from '../vdom/helpers/normalize-scoped-slots'
import VNode, { createEmptyVNode } from '../vdom/vnode'

import { isUpdatingChildComponent } from './lifecycle'

// vue实例初始化时，有关render模块的一系列处理
export function initRender (vm: Component) {
  vm._vnode = null // the root of the child tree
  vm._staticTrees = null // v-once cached trees
  const options = vm.$options
  const parentVnode = vm.$vnode = options._parentVnode // the placeholder node in parent tree
  const renderContext = parentVnode && parentVnode.context
  vm.$slots = resolveSlots(options._renderChildren, renderContext)
  vm.$scopedSlots = emptyObject
  // bind the createElement fn to this instance
  // so that we get proper render context inside it.
  // args order: tag, data, children, normalizationType, alwaysNormalize
  // internal version is used by render functions compiled from templates
  // 将 createElement 方法绑定到这个实例，这样我们就可以在其中得到适当的 render context。
  // vm._c是被编译生成的render函数所使用的方法，内部使用，区别仅在于最后一个参数true/false
  vm._c = (a, b, c, d) => createElement(vm, a, b, c, d, false)
  // normalization is always applied for the public version, used in
  // user-written render functions.
  // 规范化一直应用于公共版本，用于用户编写的 render 函数。
  //  vm.$createElement是为我们手写render函数提供的创建vnode的方法
  // 手写render示例，看createElement使用
  // var app = new Vue({
  //   el: '#app',
  //   render(createElement) {
  //     return createElement('div', {
  //       atts: {
  //         id: '#app1'
  //       }
  //     }, this.message)
  //   },
  //   data() {
  //     return {
  //       message: 'Hello Vue!'
  //     }
  //   }
  // })
  // **注意：这里div#app1会整个替换el#app 相当于render(h)里面的h
  vm.$createElement = (a, b, c, d) => createElement(vm, a, b, c, d, true)

  // $attrs & $listeners are exposed for easier HOC creation.
  // they need to be reactive so that HOCs using them are always updated
  // 父级组件数据
  const parentData = parentVnode && parentVnode.data

  /* istanbul ignore else */
  if (process.env.NODE_ENV !== 'production') {
    defineReactive(vm, '$attrs', parentData && parentData.attrs || emptyObject, () => {
      !isUpdatingChildComponent && warn(`$attrs is readonly.`, vm)
    }, true)
    defineReactive(vm, '$listeners', options._parentListeners || emptyObject, () => {
      !isUpdatingChildComponent && warn(`$listeners is readonly.`, vm)
    }, true)
  } else {
    // 监听事件
    defineReactive(vm, '$attrs', parentData && parentData.attrs || emptyObject, null, true)
    defineReactive(vm, '$listeners', options._parentListeners || emptyObject, null, true)
  }
}

export let currentRenderingInstance: Component | null = null

// for testing only
export function setCurrentRenderingInstance (vm: Component) {
  currentRenderingInstance = vm
}

// Vue原型链增加一系列方法
// $nextTick: util中实现的promise队列
// _render
// 其它内部方法
export function renderMixin (Vue: Class<Component>) {
  // install runtime convenience helpers
  // 安装运行时方便助手
  installRenderHelpers(Vue.prototype)

  // 定义了 Vue 的 $nextTick
  Vue.prototype.$nextTick = function (fn: Function) {
    return nextTick(fn, this)
  }

  // _render是一个私有方法
  // 在挂载时会初始化渲染 watch 时会调用
  // 它用来把实例渲染成一个虚拟 Node
  Vue.prototype._render = function (): VNode {
    const vm: Component = this
    // 从vm.$options拿到render函数，这里render可以是用户自己写，也可以通过编译生成
    // _parentVnode 父级 Vnode, 即组件占位 vnode
    const { render, _parentVnode } = vm.$options

    if (_parentVnode) {
      vm.$scopedSlots = normalizeScopedSlots(
        _parentVnode.data.scopedSlots,
        vm.$slots,
        vm.$scopedSlots
      )
    }

    // set parent vnode. this allows render functions to have access
    // to the data on the placeholder node.
    vm.$vnode = _parentVnode
    // render self
    let vnode
    try {
      // There's no need to maintain a stack because all render fns are called
      // separately from one another. Nested component's render fns are called
      // when parent component is patched.
      currentRenderingInstance = vm
      // 执行了Vue实例中的 render 方法生成一个vnode
      // vm._renderProxy为render函数执行的上下文，在生产环境vm._renderProxy就是vm
      // 在生产环境是一个proxy对象
      // vm.$createElement是在initRender时定义的函数
      vnode = render.call(vm._renderProxy, vm.$createElement)
    } catch (e) {
      handleError(e, vm, `render`)
      // return error render result,
      // or previous vnode to prevent render error causing blank component
      /* istanbul ignore else */
      if (process.env.NODE_ENV !== 'production' && vm.$options.renderError) {
        try {
          // 如果生成失败，会试着生成 renderError 方法
          vnode = vm.$options.renderError.call(vm._renderProxy, vm.$createElement, e)
        } catch (e) {
          handleError(e, vm, `renderError`)
          vnode = vm._vnode
        }
      } else {
        vnode = vm._vnode
      }
    } finally {
      currentRenderingInstance = null
    }
    // if the returned array contains only a single node, allow it
    if (Array.isArray(vnode) && vnode.length === 1) {
      vnode = vnode[0]
    }
    // return empty vnode in case the render function errored out
    // 返回空vnode避免render方法报错退出
    if (!(vnode instanceof VNode)) {
      if (process.env.NODE_ENV !== 'production' && Array.isArray(vnode)) {
        warn(
          'Multiple root nodes returned from render function. Render function ' +
          'should return a single root node.',
          vm
        )
      }
      // 如果vnode为空，则为vnode传一个空的VNode
      vnode = createEmptyVNode()
    }
    // set parent
    // 父级Vnode,即组件占位 vnode
    vnode.parent = _parentVnode
    // 最后返回vnode对象
    return vnode
  }
}
