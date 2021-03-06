/* @flow */

/**
 * 为Vue添加静态方法Vue.extend
 * https://cn.vuejs.org/v2/api/#Vue-extend-options
 */

import { ASSET_TYPES } from 'shared/constants'
import { defineComputed, proxy } from '../instance/state'
import { extend, mergeOptions, validateComponentName } from '../util/index'

export function initExtend (Vue: GlobalAPI) {
  /**
   * Each instance constructor, including Vue, has a unique
   * cid. This enables us to create wrapped "child
   * constructors" for prototypal inheritance and cache them.
   */
  Vue.cid = 0
  let cid = 1

  /**
   * Class inheritance
   */
  // 传入一个对象，返回一个构造函数
  Vue.extend = function (extendOptions: Object): Function {
    extendOptions = extendOptions || {}
    const Super = this  // 这里 this 指向 Vue
    const SuperId = Super.cid  // Vue 的 cid
    // 在扩展的 extendOptions 对象上添加了一个 _Ctor 对象，默认为空对象
    const cachedCtors = extendOptions._Ctor || (extendOptions._Ctor = {})
    // 实际上做了一层缓存的优化
    if (cachedCtors[SuperId]) {
      return cachedCtors[SuperId]
    }

    // 拿到组件 name
    const name = extendOptions.name || Super.options.name
    // 开发环境对 name 做一层校验
    if (process.env.NODE_ENV !== 'production' && name) {
      validateComponentName(name)
    }
    // 创建一个VueComponent类，定义子的构造函数
    const Sub = function VueComponent (options) {
      this._init(options)
    }
    // 把子的构造器原型指向Vue原型，实现原型继承，继承于Vue
    Sub.prototype = Object.create(Super.prototype)
    Sub.prototype.constructor = Sub
    Sub.cid = cid++
    // 合并选项配置，全局组件与局部组件合并注册，方便当前实例可以使用
    Sub.options = mergeOptions(
      Super.options,
      extendOptions
    )
    Sub['super'] = Super

    // For props and computed properties, we define the proxy getters on
    // the Vue instances at extension time, on the extended prototype. This
    // avoids Object.defineProperty calls for each instance created.
    // 初始化子的 props、 computed
    if (Sub.options.props) {
      initProps(Sub)
    }
    if (Sub.options.computed) {
      initComputed(Sub)
    }

    // allow further extension/mixin/plugin usage
    // 从 Vue 上复制全局静态方法到 sub 上
    Sub.extend = Super.extend
    Sub.mixin = Super.mixin
    Sub.use = Super.use

    // create asset registers, so extended classes
    // can have their private assets too.
    // ASSET_TYPES 为 ['component', 'directive', 'filter']
    ASSET_TYPES.forEach(function (type) {
      Sub[type] = Super[type]
    })
    // enable recursive self-lookup
    if (name) {
      Sub.options.components[name] = Sub
    }

    // keep a reference to the super options at extension time.
    // later at instantiation we can check if Super's options have
    // been updated.
    // 对 superOptions  、 extendOptions  、 sealedOptions  进行了一系列附值
    Sub.superOptions = Super.options
    Sub.extendOptions = extendOptions
    Sub.sealedOptions = extend({}, Sub.options)

    // cache constructor
    // 最后缓存组件对象，并返回
    cachedCtors[SuperId] = Sub
    return Sub
  }
}

function initProps (Comp) {
  const props = Comp.options.props
  for (const key in props) {
    proxy(Comp.prototype, `_props`, key)
  }
}

// 初始化子组件 computed ,遍历子组件 computed，调用 defineComputed
function initComputed (Comp) {
  const computed = Comp.options.computed
  for (const key in computed) {
    defineComputed(Comp.prototype, key, computed[key])
  }
}
