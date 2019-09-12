/* @flow */

/**
 * 实例化一个vue对象，实际执行的方法: Vue.protoype._init
 */
import config from '../config'
// proxy只是开发环境中用到
import { initProxy } from './proxy'
import { initState } from './state'
import { initRender } from './render'
import { initEvents } from './events'
import { mark, measure } from '../util/perf'
import { initLifecycle, callHook } from './lifecycle'
import { initProvide, initInjections } from './inject'
import { extend, mergeOptions, formatComponentName } from '../util/index'

let uid = 0

// 前端执行new vue时，会调用function vue构造函数
// vue构造函数会通过initMixin方法在原型上绑字_init方法，最终new的时候就是调用_init去初始化vue
export function initMixin (Vue: Class<Component>) {
  Vue.prototype._init = function (options?: Object) {
    const vm: Component = this
    // 为每一个vue实例设置独有的uid, 递增
    // 定义一个uid
    vm._uid = uid++

    let startTag, endTag
    // performance设置为 true 以在浏览器开发工具的性能/时间线面板中启用对组件初始化、编译、渲染和打补丁的性能追踪。
    /* istanbul ignore if */
    if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
      startTag = `vue-perf-start:${vm._uid}`
      endTag = `vue-perf-end:${vm._uid}`
      // 创建一个性能标记点
      mark(startTag)
    }

    // a flag to avoid this being observed
    vm._isVue = true
    // 合并options，并且把合并后的options缓存至vm.$options上
    // options._isComponent在vdom中定义，标识是否是组件，_isComponent为true时为组件
    // 组件执行initInternalComponent
    // 非组件执行mergeOptions->resolveConstructorOptions
    // merge options
    if (options && options._isComponent) {
      // optimize internal component instantiation
      // since dynamic options merging is pretty slow, and none of the
      // internal component options needs special treatment.
      initInternalComponent(vm, options)
    } else {
      // 设置实例的$options
      vm.$options = mergeOptions(
        resolveConstructorOptions(vm.constructor),
        options || {},
        vm
      )
    }
    /* istanbul ignore else */
    if (process.env.NODE_ENV !== 'production') {
      initProxy(vm)
    } else {
      // 非开发环境renderProxy指向实例自己
      vm._renderProxy = vm
    }
    // 设置一个实例自身的引用
    // expose real self
    vm._self = vm

    initLifecycle(vm) // 初始化实例生命周期
    initEvents(vm)  // 初始化events事件
    initRender(vm) // 初始化render函数
    // **在实例初始化之后，数据观测 (data observer) 和 event/watcher 事件配置之前被调用
    callHook(vm, 'beforeCreate')  // 调用beforeCreate生命周期钩子
    // 依赖注入
    // 参考文档: https://cn.vuejs.org/v2/api/#provide-inject
    // 主要给插件和组件库使用
    initInjections(vm) // resolve injections before data/props
    initState(vm)  // 初始化State （props、methods、data、computed、watch）
    // 同inject
    initProvide(vm) // resolve provide after data/props
    // **在实例创建完成后被立即调用。在这一步，实例已完成以下的配置：
    // **数据观测 (data observer)，属性和方法的运算，watch/event 事件回调。然而，挂载阶段还没开始，$el 属性目前不可见。
    callHook(vm, 'created') // 调用created生命周期钩子

    /* 计算init函数性能耗时 */
    /* istanbul ignore if */
    if (process.env.NODE_ENV !== 'production' && config.performance && mark) {
      // 获取 component 名字，如果是根name则为 <Root>
      vm._name = formatComponentName(vm, false)
      mark(endTag)
      measure(`vue ${vm._name} init`, startTag, endTag)
    }

    // 如果options中设置了el, 则调用$mount开始挂载
    // $mount在最外层runtime中定义，根据平台不同有实现区别
    if (vm.$options.el) {
      vm.$mount(vm.$options.el)
    }
  }
}

// 初始化内部组件，合并options
// 如果实例是一个component, 则执行该方法，设置一系列options
export function initInternalComponent (vm: Component, options: InternalComponentOptions) {
  // 通过Object.create创建一个干净的的options，并缓存到vm.$options上
  const opts = vm.$options = Object.create(vm.constructor.options)
  // doing this because it's faster than dynamic enumeration.
  const parentVnode = options._parentVnode
  opts.parent = options.parent
  opts._parentVnode = parentVnode

  const vnodeComponentOptions = parentVnode.componentOptions
  opts.propsData = vnodeComponentOptions.propsData
  opts._parentListeners = vnodeComponentOptions.listeners
  opts._renderChildren = vnodeComponentOptions.children
  opts._componentTag = vnodeComponentOptions.tag

  // 判断是否定义render函数，有则缓存
  if (options.render) {
    opts.render = options.render
    opts.staticRenderFns = options.staticRenderFns
  }
}

// 拿到Vue构造函数的公共options
export function resolveConstructorOptions (Ctor: Class<Component>) {
  // 得到构造函数的静态属性options
  // 该属性在global-api中添加
  let options = Ctor.options
  // 是否继承了父级Class
  // 比如通过Vue.extend方法创造的实例
  // 继承了父级Class, 则super指向父级构造函数，此处拿到父级构造函数的options
  // 做了cache判断，如果已经有superOptions属性，说明已经将父级options赋给过当前Class
  // 如果没有，则将父级options赋给当前构造函数的superOptions属性
  if (Ctor.super) {
    const superOptions = resolveConstructorOptions(Ctor.super)
    const cachedSuperOptions = Ctor.superOptions
    if (superOptions !== cachedSuperOptions) {
      // super option changed,
      // need to resolve new options.
      Ctor.superOptions = superOptions
      // check if there are any late-modified/attached options (#4976)
      const modifiedOptions = resolveModifiedOptions(Ctor)
      // update base extend options
      if (modifiedOptions) {
        extend(Ctor.extendOptions, modifiedOptions)
      }
      // 合并extendOptions和父级options作为当前构造函数的options
      options = Ctor.options = mergeOptions(superOptions, Ctor.extendOptions)
      // 如果设置了组件名，在options.components组件列表中添加引用
      if (options.name) {
        options.components[options.name] = Ctor
      }
    }
  }
  return options
}

// 以下函数都是为解决#4976，额外对options做的处理
function resolveModifiedOptions (Ctor: Class<Component>): ?Object {
  let modified
  const latest = Ctor.options
  const sealed = Ctor.sealedOptions
  for (const key in latest) {
    if (latest[key] !== sealed[key]) {
      if (!modified) modified = {}
      modified[key] = latest[key]
    }
  }
  return modified
}
