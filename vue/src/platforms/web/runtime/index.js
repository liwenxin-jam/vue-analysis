/* @flow */

/**
 * runtime版vue
 * 1. 为vue扩展了内置directives
 * 2. 扩展了components
 * 3. 设置了平台相关的配置
 * 4. 添加__patch__方法
 * 5. 添加$mount方法
 */
import Vue from 'core/index'
import config from 'core/config'
import { extend, noop } from 'shared/util'
import { mountComponent } from 'core/instance/lifecycle'
import { devtools, inBrowser } from 'core/util/index'

import {
  query,
  mustUseProp,
  isReservedTag,
  isReservedAttr,
  getTagNamespace,
  isUnknownElement
} from 'web/util/index'

import { patch } from './patch'
// 引入需要打包的directives
import platformDirectives from './directives/index'
// 引入需要打包的components
import platformComponents from './components/index'

// install platform specific utils
Vue.config.mustUseProp = mustUseProp
Vue.config.isReservedTag = isReservedTag
Vue.config.isReservedAttr = isReservedAttr
Vue.config.getTagNamespace = getTagNamespace
Vue.config.isUnknownElement = isUnknownElement

// 平台相关的组件和指令本身不在core中，跟自己写的directive和component没有区别，所以放在runtime中
// install platform runtime directives & components
// 加载平台相关的指令directives, 有model和show
extend(Vue.options.directives, platformDirectives)
// 加载平台相关的组件, transition
extend(Vue.options.components, platformComponents)

// 原型链__patch__方法的设置, 区别浏览器和非浏览器
// 非浏览器中不需要patch， 所以空函数。
// 指定补丁方法：传入虚拟dom转为真实dom，1.初始化 2.更新
// install platform patch function
Vue.prototype.__patch__ = inBrowser ? patch : noop

// public mount method
// 公用的 mount 方法
// 这里runtime和compiler都会共用这部分方法
Vue.prototype.$mount = function (
  el?: string | Element,
  hydrating?: boolean
): Component {
  // 浏览器中访问，取得el元素，否则el为undefined
  el = el && inBrowser ? query(el) : undefined
  // 装载方法取自core/instance/lifecycle模块
  // 初始化，将首次渲染结果替换el
  return mountComponent(this, el, hydrating)
}

// devtools global hook
/* istanbul ignore next */
if (inBrowser) {
  setTimeout(() => {
    if (config.devtools) {
      if (devtools) {
        devtools.emit('init', Vue)
      } else if (
        process.env.NODE_ENV !== 'production' &&
        process.env.NODE_ENV !== 'test'
      ) {
        console[console.info ? 'info' : 'log'](
          'Download the Vue Devtools extension for a better development experience:\n' +
          'https://github.com/vuejs/vue-devtools'
        )
      }
    }
    if (process.env.NODE_ENV !== 'production' &&
      process.env.NODE_ENV !== 'test' &&
      config.productionTip !== false &&
      typeof console !== 'undefined'
    ) {
      console[console.info ? 'info' : 'log'](
        `You are running Vue in development mode.\n` +
        `Make sure to turn on production mode when deploying for production.\n` +
        `See more tips at https://vuejs.org/guide/deployment.html`
      )
    }
  }, 0)
}

export default Vue
